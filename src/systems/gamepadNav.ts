// Controller navigation for modal dialogue choices — separate from ui/walk.ts's
// gamepad polling, which only runs while a walk scene's own rAF loop is
// mounted. Modals (dialogue trees, combat, events, the harbormaster, etc.)
// can appear on any screen, so this runs its own loop for the lifetime of
// the app, only acting when a modal is actually open.
import { hasModal } from "../modal";

const GP_DEADZONE = 0.5;
const POLL_MS = 60; // not rAF: rAF is suspended in backgrounded/headless tabs (see ui/walk.ts)
let timer: number | null = null;
let focusIndex = 0;
let modalWasOpen = false;
let prevUp = false, prevDown = false, prevA = false;

function choiceButtons(): HTMLButtonElement[] {
  const modalEl = document.getElementById("modal");
  if (!modalEl) return [];
  return Array.from(modalEl.querySelectorAll(".choices button"))
    .filter((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement[];
}

function tick() {
  const open = hasModal();
  if (!open) { modalWasOpen = false; return; }
  if (!modalWasOpen) { focusIndex = 0; modalWasOpen = true; }

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads || []).find((p) => !!p);
  const buttons = choiceButtons();
  if (!buttons.length) return;
  if (focusIndex >= buttons.length) focusIndex = buttons.length - 1;

  if (gp) {
    const ay = gp.axes[1] || 0;
    const upNow = ay < -GP_DEADZONE || !!gp.buttons[12]?.pressed;
    const downNow = ay > GP_DEADZONE || !!gp.buttons[13]?.pressed;
    const aNow = !!gp.buttons[0]?.pressed;

    if (upNow && !prevUp) focusIndex = (focusIndex - 1 + buttons.length) % buttons.length;
    if (downNow && !prevDown) focusIndex = (focusIndex + 1) % buttons.length;
    if (aNow && !prevA) buttons[focusIndex]?.click();
    prevUp = upNow; prevDown = downNow; prevA = aNow;
  } else {
    prevUp = prevDown = prevA = false;
  }

  buttons.forEach((b, i) => b.classList.toggle("gp-focus", i === focusIndex));
}

export function startGamepadNav() {
  if (timer !== null) return;
  timer = window.setInterval(tick, POLL_MS);
}
