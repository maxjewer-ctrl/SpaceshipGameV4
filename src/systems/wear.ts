// Module wear — the permanent maintenance loop. Flying wears the ship; worn
// modules break FIRST when trouble picks a victim; failing modules quit on
// their own schedule. A dry-dock refit trues everything back to zero for a
// price that scales with neglect. This is deliberately reliability, not stat
// decay: the gauges read fine right up until something lets go.
import { S, log, whisper } from "../state";
import { MODS } from "../content";
import { stats } from "../derive";
import { rand } from "../rng";
import { requestRender } from "../bus";
import { powerRebalance } from "./actions";
import { bark } from "./barks";
import type { ModuleInstance } from "../types";

export type WearTier = "sound" | "worn" | "failing";
export const wearOf = (m: ModuleInstance): number => m.wear || 0;
export function wearTier(m: ModuleInstance): WearTier {
  const w = wearOf(m);
  return w >= 90 ? "failing" : w >= 55 ? "worn" : "sound";
}

// Daily accrual while flying. Powered-and-running modules wear fastest; a
// mechanic slows the whole ship's aging, a workshop more so.
export function accrueWear(traveling: boolean) {
  if (!traveling) return;
  const st = stats();
  const rate = st.has("mechanic") ? (st.active("workshop") > 0 ? 0.4 : 0.6) : 1;
  for (const m of S.modules) {
    if (MODS[m.t].core || m.dmg) continue;
    const base = MODS[m.t].pw && m.on ? 1.4 : 0.8;
    const before = wearTier(m);
    m.wear = Math.min(100, wearOf(m) + base * rate);
    const after = wearTier(m);
    if (after !== before) {
      if (after === "worn") whisper(`The ${MODS[m.t].n} is running worn — rattles, drift, little lies on the gauges. A refit would settle it.`);
      if (after === "failing") { log(`⚠ ${MODS[m.t].n} is FAILING — refit it soon, or it quits on its own schedule instead of yours.`); bark("worn_ship", { chance: 0.7 }); }
    }
  }
  // A failing module can let go outright — at most one per day.
  const failing = S.modules.filter((m) => !MODS[m.t].core && !m.dmg && wearOf(m) >= 90);
  for (const m of failing) {
    if (rand() < 0.1) {
      m.dmg = true;
      log(`🔧 The ${MODS[m.t].n} finally lets go mid-flight — worn past saving. (Wear failure — a refit would have caught it.)`);
      powerRebalance();
      break;
    }
  }
}

export function totalWear(): number {
  return Math.round(S.modules.filter((m) => !MODS[m.t].core).reduce((a, m) => a + wearOf(m), 0));
}
export function refitCost(): number { return Math.round(totalWear() * 1.2); }

export function refitShip() {
  const cost = refitCost();
  if (cost <= 0) { log("Nothing aboard is worn enough to refit. She's as tight as she gets."); requestRender(); return; }
  if (S.credits < cost) { log(`Not enough credits for a full refit (needs ${cost}cr).`); requestRender(); return; }
  S.credits -= cost;
  for (const m of S.modules) m.wear = 0;
  log(`Yard crew strips, trues, and re-seats every worn system (−${cost}cr). She sounds five years younger on the restart.`);
  bark("refit", { chance: 0.8 });
  requestRender();
}
