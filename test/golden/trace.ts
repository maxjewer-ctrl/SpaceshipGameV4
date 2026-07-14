// Golden-master traces: a deterministic, language-independent fingerprint of
// what the simulation DOES, tick by tick.
//
// The existing net (fuzz.test.ts) proves the sim never breaks — no NaN, no
// negative fuel, no soft-lock. That is a *liveness* net. It would happily pass
// a refactor that quietly changed every damage roll in the game, as long as the
// numbers stayed positive.
//
// This is the *behaviour* net. It pins the exact sequence of states a given
// (scenario, seed) produces, so any change to the sim — a refactor that was
// supposed to be pure, or a C# port that was supposed to be faithful — shows up
// as a diff at an exact tick instead of as a vibe six weeks later.
//
// Two properties make this possible, and both were already true before this file
// existed (which is the whole reason the port is tractable):
//   1. rng.ts is seeded and save-persisted, and lint:rng bans stray Math.random.
//   2. systems/ are pure transforms over the module-global S.
//
// Recording strategy: a hash per tick, plus the full canonical state at the end.
// Hashes keep fixtures small and pinpoint the FIRST diverging tick; the final
// state gives you something readable to diff once you know where to look. When
// a trace fails, re-run with DUMP_GOLDEN=1 to write both states out in full.
import { S } from "../../src/state";
import { loadSeeded } from "../harness";
import { advanceDay, waitDay } from "../../src/systems/travel";
import { hasModal, clearModal } from "../../src/modal";
import { canonical, digest, hashOf } from "./canonical";

export interface Trace {
  scenario: string;
  seed: number;
  days: number;
  // One hash per in-game day. Index i is the state AFTER tick i resolved.
  ticks: string[];
  // Human-readable landmarks, so a diff tells a story instead of just failing.
  // These are a convenience for the reader; the hashes are the actual gate.
  landmarks: Landmark[];
  // Canonical state at the end of the run — the thing you actually diff.
  finalState: string;
  finalHash: string;
}

export interface Landmark {
  day: number;
  credits: number;
  fuel: number;
  food: number;
  hull: number;
  loc: string;
  // The narrative log is the sharpest behavioural signal in the game: it
  // captures the OUTCOME of every roll in words. If a refactor changes which
  // event fired, this changes even when the raw numbers happen to coincide.
  log: string[];
}

function landmark(): Landmark {
  return {
    day: S.day,
    credits: S.credits,
    fuel: S.fuel,
    food: S.food,
    hull: S.hull,
    loc: S.loc,
    log: S.logLines.slice(0, 3).map((l) => l.m),
  };
}

// The slice of S that a port must reproduce exactly. Deliberately the WHOLE
// state minus view fields (canonical() drops those) — an allowlist would let a
// port silently diverge on any field we forgot to list, which is precisely the
// failure this harness exists to catch.
const snapshot = (): string => canonical(S);

// Drive one seeded run and fingerprint every tick.
//
// Mirrors harness.simulate()'s day loop exactly — same modal handling, same
// travel-vs-docked branch — so the two nets stay in agreement about what "a
// tick" means. If simulate() changes, this must change with it.
export function traceRun(scenario: string, seed: number, days: number): Trace {
  loadSeeded(scenario, seed);

  const ticks: string[] = [];
  const landmarks: Landmark[] = [];

  for (let i = 0; i < days; i++) {
    if (hasModal()) clearModal();
    if (S.over) break;
    if (S.travel) advanceDay();
    else waitDay();
    if (hasModal()) clearModal();

    ticks.push(digest(snapshot()));
    landmarks.push(landmark());
  }

  const finalState = snapshot();
  return {
    scenario, seed, days,
    ticks,
    landmarks,
    finalState,
    finalHash: digest(finalState),
  };
}

// A trace is "interesting" only if the run actually went somewhere. A scenario
// that dies on day 2 and then flatlines pins almost nothing, and would give us
// false confidence in a port. Surfaced so the test can assert coverage rather
// than quietly golden-mastering a stub.
export function traceDepth(t: Trace): number {
  return new Set(t.ticks).size;
}

export { hashOf };
