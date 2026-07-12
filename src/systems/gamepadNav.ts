// Controller navigation for anything that isn't the free-roam walk scenes
// (those get their own gamepad polling in ui/walk.ts, since movement needs
// their own rAF loop). This runs for the lifetime of the app on its own
// interval and covers two contexts:
//   - a modal is open: D-pad/left-stick up-down cycles focus over its
//     .choices buttons, A activates the focused one.
//   - a "console" screen (ship/map/planet/travel) with no modal: D-pad
//     up-down cycles focus over every enabled button on screen, A activates
//     it, and the left stick's vertical axis scrolls the page continuously
//     (analog — proportional to how far the stick is pushed).
// Three.js's free camera during the walk scenes is a separate concern,
// handled by ui/walk.ts feeding the right stick into ui/walk3d.ts.
import { hasModal } from "../modal";
import { S } from "../state";

const GP_DEADZONE = 0.5;      // digital-feeling threshold for stepping focus
const SCROLL_DEADZONE = 0.2;  // finer threshold for analog page scroll
const SCROLL_SPEED = 900;     // px/sec at full stick deflection
const POLL_MS = 60;           // not rAF: rAF is suspended in backgrounded/headless tabs (see ui/walk.ts)
const CONSOLE_SCREENS = new Set(["ship", "map", "planet", "travel"]);

let timer: number | null = null;
let focusIndex = 0;
let lastContext = "";
let prevUp = false, prevDown = false, prevA = false;

function focusButtons(inModal: boolean): HTMLButtonElement[] {
  const rootId = inModal ? "modal" : "main";
  const root = document.getElementById(rootId);
  if (!root) return [];
  const sel = inModal ? ".choices button" : "button";
  return Array.from(root.querySelectorAll(sel))
    .filter((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement[];
}

function tick() {
  const inModal = hasModal();
  const key = inModal ? "modal" : (CONSOLE_SCREENS.has(S.screen) ? "console:" + S.screen : "");
  if (key !== lastContext) { focusIndex = 0; lastContext = key; }
  if (!key) return; // walk scenes with no modal open — nothing for this module to do

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads || []).find((p) => !!p);
  if (!gp) { prevUp = prevDown = prevA = false; return; }

  const buttons = focusButtons(inModal);
  const ay = gp.axes[1] || 0;
  // In a modal the stick doubles as the step control (short lists, no need to
  // scroll). On a console the stick is reserved for analog scrolling, so
  // stepping focus there is D-pad only.
  const upNow = inModal ? (ay < -GP_DEADZONE || !!gp.buttons[12]?.pressed) : !!gp.buttons[12]?.pressed;
  const downNow = inModal ? (ay > GP_DEADZONE || !!gp.buttons[13]?.pressed) : !!gp.buttons[13]?.pressed;
  const aNow = !!gp.buttons[0]?.pressed;

  if (buttons.length) {
    if (focusIndex >= buttons.length) focusIndex = buttons.length - 1;
    if (upNow && !prevUp) { focusIndex = (focusIndex - 1 + buttons.length) % buttons.length; buttons[focusIndex]?.scrollIntoView({ block: "nearest" }); }
    if (downNow && !prevDown) { focusIndex = (focusIndex + 1) % buttons.length; buttons[focusIndex]?.scrollIntoView({ block: "nearest" }); }
    if (aNow && !prevA) buttons[focusIndex]?.click();
    buttons.forEach((b, i) => b.classList.toggle("gp-focus", i === focusIndex));
  }
  prevUp = upNow; prevDown = downNow; prevA = aNow;

  if (!inModal && Math.abs(ay) > SCROLL_DEADZONE) {
    window.scrollBy(0, ay * SCROLL_SPEED * (POLL_MS / 1000));
  }
}

export function startGamepadNav() {
  if (timer !== null) return;
  timer = window.setInterval(tick, POLL_MS);
}
