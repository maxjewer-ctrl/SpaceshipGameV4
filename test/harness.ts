// Shared helpers for the headless simulation harness. The game systems are
// pure transforms over the module-global `S` (src/state.ts); these helpers
// drive them the way a player would and assert the invariants a beta must hold.
import { S, setState } from "../src/state";
import { loadScenario } from "../src/debug/scenarios";
import { advanceDay, waitDay } from "../src/systems/travel";
import { hasModal, clearModal, modalHTML } from "../src/modal";
import { PLANETS } from "../src/content";

export const SCENARIOS = ["fresh", "trader", "fighter", "silence", "arc", "run", "reckoning"] as const;

// Deterministic seed: scenarios call newState() which seeds from crypto, so
// pin the stream afterward for reproducible fuzz runs.
export function loadSeeded(scenario: string, seed: number) {
  loadScenario(scenario);
  S.seed = seed | 0;
  S.rngState = seed | 0;
}

const NUM_FIELDS = ["credits", "fuel", "food", "hull", "hullMax", "prestige", "day", "engineLvl", "slotsMax", "starve", "unpaid"] as const;

export interface Violation { field: string; value: unknown; note: string; }

// The invariants a solid beta must never break. Returns [] when the state is
// sound; each entry is a concrete defect for the test to surface.
export function checkInvariants(where: string): Violation[] {
  const v: Violation[] = [];
  const bad = (field: string, value: unknown, note: string) => v.push({ field: `${where}.${field}`, value, note });

  for (const f of NUM_FIELDS) {
    const n = (S as any)[f];
    if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) bad(f, n, "not a finite number");
  }
  if (S.credits < 0) bad("credits", S.credits, "negative");
  if (S.fuel < 0) bad("fuel", S.fuel, "negative");
  if (S.food < 0) bad("food", S.food, "negative");
  if (S.hull < 0) bad("hull", S.hull, "negative");
  if (S.hull > S.hullMax) bad("hull", S.hull, `exceeds hullMax ${S.hullMax}`);
  if (S.day < 1) bad("day", S.day, "below 1");
  if (!PLANETS[S.loc]) bad("loc", S.loc, "not a known planet");
  if (S.travel && !PLANETS[S.travel.dest]) bad("travel.dest", S.travel.dest, "not a known planet");
  if (S.travel && S.travel.left > S.travel.total) bad("travel.left", S.travel.left, `exceeds total ${S.travel.total}`);

  for (const c of S.cargo ? Object.entries(S.cargo) : []) {
    if (typeof c[1] !== "number" || c[1] < 0 || Number.isNaN(c[1])) bad(`cargo.${c[0]}`, c[1], "negative or NaN");
  }
  for (const r of Object.entries(S.rep)) {
    if (typeof r[1] !== "number" || Number.isNaN(r[1])) bad(`rep.${r[0]}`, r[1], "not a number");
  }
  const MOODS = new Set(["boom", "shortage", "lockdown", "festival"]);
  for (const [loc, m] of Object.entries(S.portMood || {})) {
    if (!PLANETS[loc]) bad(`portMood.${loc}`, loc, "not a known planet");
    if (!MOODS.has(m.mood)) bad(`portMood.${loc}.mood`, m.mood, "not a known mood");
    if (typeof m.until !== "number" || Number.isNaN(m.until)) bad(`portMood.${loc}.until`, m.until, "not a finite number");
  }
  return v;
}

export interface RunResult {
  scenario: string; seed: number;
  daysAdvanced: number;
  modalsDismissed: number;
  violations: Violation[];
  error: { day: number; message: string } | null;
  softLock: boolean;
}

// Drive a run forward `days` in-game days. A modal that blocks progress is
// force-dismissed (clearModal) and counted — this harness proves the day-tick
// machinery never NaNs, goes negative, throws, or soft-locks; exercising the
// specific *choices* inside modals is a separate concern (targeted tests).
export function simulate(scenario: string, seed: number, days: number): RunResult {
  loadSeeded(scenario, seed);
  const res: RunResult = { scenario, seed, daysAdvanced: 0, modalsDismissed: 0, violations: [], error: null, softLock: false };
  res.violations.push(...checkInvariants("load"));

  let stalls = 0;
  for (let i = 0; i < days; i++) {
    const dayBefore = S.day;
    try {
      if (hasModal()) { clearModal(); res.modalsDismissed++; }
      if (S.over) break;
      // In transit → advance the journey; docked → wait a day in port. Between
      // them every day-tick path (fuel/food/pay/wear/events/arrival) is hit.
      if (S.travel) advanceDay();
      else waitDay();
      if (hasModal()) { clearModal(); res.modalsDismissed++; }
    } catch (e) {
      res.error = { day: S.day, message: e instanceof Error ? e.message : String(e) };
      break;
    }
    const viol = checkInvariants(`day${S.day}`);
    if (viol.length) { res.violations.push(...viol); break; }
    if (S.day === dayBefore && !S.over) {
      // A docked wait or a transit advance must move the clock; if it doesn't
      // for several tries, the run is wedged.
      if (++stalls >= 5) { res.softLock = true; break; }
    } else stalls = 0;
    res.daysAdvanced++;
  }
  return res;
}

export { S, setState, hasModal, clearModal, modalHTML };
