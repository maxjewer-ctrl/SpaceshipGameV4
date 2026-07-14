import "./style.css";
import { setRender, requestRender } from "./bus";
import { render } from "./ui/render";
import { loadSaved, setState, log } from "./state";
import * as State from "./state";
import { setThrottle, throttleLive } from "./ui/cockpit";
import { avName } from "./ui/avatar";
import { intro } from "./ui/help";
import { debugStep, debugPos, debugActors, debugRooms, debugWalkTo, debugGoto, debugRenderCount, walkInsideFloors } from "./ui/walk";
import { loadScenario } from "./debug/scenarios";
import { evPirates, evPatrol, evBreakdown, evMeteor, evSalvage, evDistress, evTrader, evPax } from "./systems/events";
import { loadRemoteContent } from "./supabase/content";
import { startGamepadNav } from "./systems/gamepadNav";
import { dispatch, installDispatch } from "./dispatch";

setRender(render);
startGamepadNav();
installDispatch();
// Dev-only self-screenshot helper (window.__shot) — see src/debug/shot.ts.
if (import.meta.env.DEV) import("./debug/shot").then((m) => m.installShot());

// The UI's onclick-driven action surface now goes through dispatch.ts's
// data-action/data-args mechanism (BETA_PLAN §3.4) — see installDispatch()
// above. What's left on window is: `dispatch` itself (so headless test
// scripts have one stable way to invoke a former-onclick handler, e.g.
// `window.dispatch('depart', ['verge'])`), two controls that pass a live
// DOM element through an inline event handler (`oninput="throttleLive(this)"`
// / `onchange="setThrottle(this.value)"` for the throttle slider,
// `oninput="avName(this.value)"` for the name field) which the JSON-based
// data-args scheme can't carry, and the dev/debug accessors below — none of
// these were ever part of the onclick surface.
Object.assign(window as any, {
  dispatch,
  setThrottle, throttleLive, avName,
  // dev/debug: live state accessor + manual walk-frame stepper (harmless — behind underscores)
  __S: () => State.S,
  __walkStep: debugStep,
  __walkPos: debugPos,
  __walkActors: debugActors,
  __walkRooms: debugRooms,
  __walkInside: walkInsideFloors,
  __walkRenders: debugRenderCount,
  __walkGoto: debugGoto,
  __walkTo: debugWalkTo,
  __scenario: loadScenario,
  // dev/debug: force a specific travel event (playtesting encounters on demand)
  __event: (k: string) => {
    const evs: Record<string, () => void> = {
      pirates: evPirates, patrol: evPatrol, breakdown: evBreakdown, meteor: evMeteor,
      salvage: evSalvage, distress: evDistress, trader: evTrader, pax: evPax,
    };
    if (evs[k]) evs[k](); else console.log("events: " + Object.keys(evs).join(", "));
  },
});

// ---- boot ----
// Hot-load content from Supabase if configured (offline-first: this is a no-op
// when there are no credentials, and falls back to bundled JSON on any error).
loadRemoteContent().then((changed) => { if (changed) requestRender(); });

const saved = loadSaved();
if (saved) {
  setState(saved);
  requestRender();
  log("— Session restored. Welcome back, Captain. —");
  requestRender();
} else {
  intro();
}
