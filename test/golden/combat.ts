// Golden-master traces for SHIP COMBAT.
//
// Combat could not be traced at all until the platform seam landed. aimScore()
// read Date.now() directly, so a shot's damage depended on wall-clock time:
// the same seed and the same button presses produced a different fight every
// run. Now the clock is an input (cAct(action, now)), the fight is a pure
// function of (state, seed, action script), and it pins like anything else.
//
// The bot below plays a fixed, seeded script. Note it draws its decisions from
// its OWN prng, not from the game's rand(): the driver must not perturb the
// stream it is trying to observe, or we'd be pinning the driver's dice as much
// as the game's.
import { S } from "../../src/state";
import { loadSeeded } from "../harness";
import { startCombat, cAct, endCombat, debugCombat } from "../../src/systems/combat";
import { clearModal } from "../../src/modal";
import type { Enemy } from "../../src/types";
import { canonical, digest } from "./canonical";

// mulberry32, same shape as src/rng.ts — kept local and separate so the driver's
// choices never touch S.rngState.
function prng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CombatTrace {
  scenario: string;
  seed: number;
  enemy: Enemy;
  // One hash per action issued. Catches divergence at the exact button press.
  steps: string[];
  // What actually happened, in words — the readable half of a failure.
  script: string[];
  result: string | null;
  hullLeft: number;
  finalState: string;
  finalHash: string;
}

const WEAPONS = ["laser", "torpedo", "ion"] as const;

// Play one fight to its conclusion and fingerprint every action.
//
// The aim delays are the interesting input: they are what the player's reflexes
// used to supply and what the wall clock used to leak in. Drawn from the driver
// prng, they now make "how well did you aim" a reproducible part of the script.
export function traceCombat(scenario: string, seed: number, enemy: Enemy, maxActions = 120): CombatTrace {
  loadSeeded(scenario, seed);
  clearModal();

  const rnd = prng(seed ^ 0x5f3759df);
  const steps: string[] = [];
  const script: string[] = [];

  // A frozen clock the bot advances by hand — the whole point of the seam.
  let clock = 1_000_000;

  const act = (action: string, at: number) => {
    cAct(action, at);
    steps.push(digest(canonical(S) + "|" + canonical(debugCombat())));
    script.push(action);
  };

  startCombat(enemy);
  steps.push(digest(canonical(S) + "|" + canonical(debugCombat())));
  script.push("start");

  for (let i = 0; i < maxActions; i++) {
    const c = debugCombat();
    if (!c.active || c.phase === "over") break;

    if (c.phase === "command") {
      // Mostly shoot, occasionally go evasive — enough variety to exercise both
      // the aim path and the immediate-resolution path.
      const move = rnd() < 0.22 ? "evasive" : WEAPONS[Math.floor(rnd() * WEAPONS.length)];
      act(`move:${move}`, clock);
      continue;
    }

    if (c.phase === "target") {
      const alive = c.targets.filter((t) => t.hull > 0);
      if (!alive.length) break;
      act(`target:${alive[Math.floor(rnd() * alive.length)].id}`, clock);
      act("aim", clock);
      continue;
    }

    if (c.phase === "aim") {
      // The reflex, made reproducible: 120–1520ms on the trigger.
      const delay = 120 + Math.floor(rnd() * 1400);
      clock += delay;
      act("release", clock);
      continue;
    }

    break;
  }

  const c = debugCombat();
  const result = c.result;
  const hullLeft = S.hull;
  endCombat();

  const finalState = canonical(S);
  return {
    scenario, seed, enemy,
    steps, script,
    result,
    hullLeft,
    finalState,
    finalHash: digest(finalState),
  };
}
