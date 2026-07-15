// Controller navigation for anything that isn't the free-roam walk scenes
// (those get their own gamepad polling in ui/walk.ts, since movement needs
// their own rAF loop and the left stick is busy steering the avatar there).
// Runs for the lifetime of the app on its own interval, covering two contexts:
//
//   - a modal is open: every enabled button inside #modal is a focus target.
//   - a "console" screen (ship/map/planet/travel) with no modal: every
//     enabled button in the top nav bar (#nav) and the main panel (#main).
//
// Controls, same in both contexts:
//   - Left stick: 2D spatial jump — flick a direction and focus leaps to the
//     nearest button that way (tap-to-step, hold to auto-repeat).
//   - A: click the focused button.
//   - LB / RB: step to the previous/next *sibling* button of whatever's
//     focused (i.e. move along its parent's row) and click it. This is what
//     drives any horizontal tab/segmented control — the deck-plan/live-feed
//     toggle, the cantina/market/yard tabs, the main screen tabs, the
//     creator's ◀ / ▶ pagers — without needing to special-case any of them:
//     they're all just sibling buttons under a shared parent.
//   - Right stick: scroll — the modal panel if one's open, else the page.
//   - B: back out. A modal closes; a console screen other than Ship returns
//     to Ship (via ui/render.ts's nav(), which now plays a soft exit/enter
//     transition instead of a hard cut — see the screen-enter/screen-exit
//     classes it toggles on #main).
import { hasModal, closeModal } from "../modal";
import { S } from "../state";
import { nav } from "./render";
import { standUp } from "./commandConsole";
import { exitService } from "./stationwalk";

const GP_DEADZONE = 0.5;      // stick deflection needed to register a jump/shoulder step
const SCROLL_DEADZONE = 0.2;  // finer threshold for analog scroll
const SCROLL_SPEED = 900;     // px/sec at full stick deflection
const REPEAT_DELAY = 380;     // ms held before a direction starts auto-repeating
const REPEAT_RATE = 130;      // ms between repeats once it starts
const POLL_MS = 60;           // not rAF: rAF is suspended in backgrounded/headless tabs (see ui/walk.ts)
const CONSOLE_SCREENS = new Set(["ship", "map", "planet", "travel"]);

type Dir = "up" | "down" | "left" | "right";

let timer: number | null = null;
let focusIndex = 0;
let lastContext = "";
let prevA = false, prevB = false, prevLB = false, prevRB = false;
let curDir: Dir | null = null;
let dirSince = 0, dirLastRepeat = 0;

function focusButtons(inModal: boolean): HTMLButtonElement[] {
  const enabled = (root: HTMLElement | null) =>
    root ? (Array.from(root.querySelectorAll("button")).filter((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement[]) : [];
  if (inModal) return enabled(document.getElementById("modal"));
  return enabled(document.getElementById("main"));
}

function center(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Cheap spatial-nav: among every other button, keep the ones actually lying
// in `dir` from the focused one, and pick the closest after penalizing how
// far it drifts off-axis (so "down" prefers a button straight below over one
// two rows down but wildly to the side).
function moveFocus(dir: Dir, buttons: HTMLButtonElement[]) {
  if (buttons.length < 2) return;
  const cur = buttons[Math.min(focusIndex, buttons.length - 1)];
  if (!cur) return;
  const c = center(cur);
  let best = -1, bestScore = Infinity;
  buttons.forEach((b, i) => {
    if (b === cur) return;
    const p = center(b);
    const dx = p.x - c.x, dy = p.y - c.y;
    let ok: boolean, primary: number, ortho: number;
    if (dir === "up") { ok = dy < -2; primary = -dy; ortho = Math.abs(dx); }
    else if (dir === "down") { ok = dy > 2; primary = dy; ortho = Math.abs(dx); }
    else if (dir === "left") { ok = dx < -2; primary = -dx; ortho = Math.abs(dy); }
    else { ok = dx > 2; primary = dx; ortho = Math.abs(dy); }
    if (!ok) return;
    const score = primary + ortho * 1.6;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  if (best >= 0) { focusIndex = best; buttons[best].scrollIntoView({ block: "nearest", inline: "nearest" }); }
}

// LB/RB: step along the focused button's own row (its DOM siblings) and
// activate the result. Click first (most tab handlers re-render inline,
// synchronously — bus.ts's requestRender is not batched), then re-query so
// we're not holding a reference into a DOM subtree that just got replaced.
function shiftSibling(dir: "prev" | "next", buttons: HTMLButtonElement[], inModal: boolean) {
  const cur = buttons[focusIndex];
  if (!cur || !cur.parentElement) return;
  const siblings = Array.from(cur.parentElement.children)
    .filter((el): el is HTMLButtonElement => el.tagName === "BUTTON" && !(el as HTMLButtonElement).disabled);
  if (siblings.length < 2) return;
  const i = siblings.indexOf(cur);
  if (i < 0) return;
  const target = siblings[(i + (dir === "next" ? 1 : -1) + siblings.length) % siblings.length];
  const label = target.textContent;
  target.click();
  const fresh = focusButtons(inModal);
  const match = fresh.findIndex((b) => b.textContent === label);
  focusIndex = match >= 0 ? match : Math.min(focusIndex, Math.max(0, fresh.length - 1));
}

function stickDir(gp: Gamepad): Dir | null {
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.max(Math.abs(ax), Math.abs(ay)) < GP_DEADZONE) return null;
  return Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? "left" : "right") : (ay < 0 ? "up" : "down");
}

function tick() {
  const inModal = hasModal();
  const key = inModal ? "modal" : (CONSOLE_SCREENS.has(S.screen) ? "console:" + S.screen : "");
  if (key !== lastContext) { focusIndex = 0; lastContext = key; curDir = null; }
  if (!key) return; // walk scenes with no modal open — left stick is busy steering the avatar there

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads || []).find((p) => !!p);
  if (!gp) { prevA = prevB = prevLB = prevRB = false; curDir = null; return; }

  const bNow = !!gp.buttons[1]?.pressed;
  if (bNow && !prevB) {
    if (inModal) closeModal();
    else if (S.screen === "ship") standUp();
    else if (S.screen === "planet") exitService();
    else nav("ship");
  }
  prevB = bNow;

  let buttons = focusButtons(inModal);
  if (buttons.length) {
    if (focusIndex >= buttons.length) focusIndex = buttons.length - 1;

    const dir = stickDir(gp);
    const now = Date.now();
    if (dir !== curDir) {
      curDir = dir;
      if (dir) { moveFocus(dir, buttons); dirSince = now; dirLastRepeat = now; }
    } else if (dir && now - dirSince > REPEAT_DELAY && now - dirLastRepeat > REPEAT_RATE) {
      moveFocus(dir, buttons); dirLastRepeat = now;
    }

    const aNow = !!gp.buttons[0]?.pressed;
    if (aNow && !prevA) buttons[focusIndex]?.click();
    prevA = aNow;

    const lbNow = !!gp.buttons[4]?.pressed, rbNow = !!gp.buttons[5]?.pressed;
    if (lbNow && !prevLB) { shiftSibling("prev", buttons, inModal); buttons = focusButtons(inModal); }
    if (rbNow && !prevRB) { shiftSibling("next", buttons, inModal); buttons = focusButtons(inModal); }
    prevLB = lbNow; prevRB = rbNow;

    buttons.forEach((b, i) => b.classList.toggle("gp-focus", i === focusIndex));
  }

  const ry = gp.axes[3] || 0;
  if (Math.abs(ry) > SCROLL_DEADZONE) {
    const dy = ry * SCROLL_SPEED * (POLL_MS / 1000);
    if (inModal) document.getElementById("modal")?.scrollBy(0, dy);
    else window.scrollBy(0, dy);
  }
}

export function startGamepadNav() {
  if (timer !== null) return;
  timer = window.setInterval(tick, POLL_MS);
}
