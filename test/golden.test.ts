// THE GOLDEN-MASTER GATE
//
// Every scenario × a fixed set of seeds, driven a fixed number of days, must
// reproduce a byte-identical state trace forever. This is the net that makes
// the port to a real engine (docs/PORTING.md) survivable: it turns "did I
// change the game while rewriting it" from a months-long playtesting question
// into a red/green test.
//
// WHEN THIS FAILS, READ THIS FIRST:
//
//   * You refactored systems/ and expected NO behaviour change
//     → This is a real bug. You changed the game. The failure names the exact
//       day it first diverged. Do not regenerate the fixture. Fix the code.
//
//   * You deliberately changed game balance / content / an event
//     → Expected. Confirm the diff is ONLY what you intended (the failure
//       prints the diverging landmark), then regenerate:
//           UPDATE_GOLDEN=1 npm test
//       and commit the fixture change as part of the same commit. A fixture
//       diff in code review is a feature: it shows a reviewer exactly which
//       runs your balance tweak actually moved.
//
//   * You are porting to C#
//     → These fixtures are the specification. Read the JSON, feed the same
//       seeds to the port, assert the same hashes. canonical.ts documents the
//       serialization contract you must match.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./harness";
import { traceRun, traceDepth, type Trace } from "./golden/trace";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "golden", "fixtures");

// Fixed forever. Adding seeds is fine (new fixtures); changing these values
// invalidates every fixture at once and destroys the historical comparison,
// so don't — pin new behaviour with new seeds instead.
const SEEDS = [1, 20260714, 8919, 424242];
const DAYS = 30;

const UPDATE = !!process.env.UPDATE_GOLDEN;
const fixturePath = (scenario: string, seed: number) => join(FIXTURES, `${scenario}.${seed}.json`);

function readFixture(scenario: string, seed: number): Trace | null {
  const p = fixturePath(scenario, seed);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Trace;
}

function writeFixture(t: Trace) {
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(fixturePath(t.scenario, t.seed), JSON.stringify(t, null, 2) + "\n");
}

// Pinpoint the first divergence and render it as something a human can act on:
// which day, and what the game was actually doing on that day in each run.
function explain(expected: Trace, actual: Trace): string {
  const n = Math.max(expected.ticks.length, actual.ticks.length);
  for (let i = 0; i < n; i++) {
    if (expected.ticks[i] === actual.ticks[i]) continue;

    const e = expected.landmarks[i];
    const a = actual.landmarks[i];
    const lastDay = (t: Trace) => t.landmarks[t.landmarks.length - 1]?.day;
    if (!e) return `run got LONGER: expected ${expected.ticks.length} ticks, got ${actual.ticks.length}. The run used to end at day ${lastDay(expected)}.`;
    if (!a) return `run got SHORTER: expected ${expected.ticks.length} ticks, got ${actual.ticks.length}. The run now ends at day ${lastDay(actual)} — something is killing or wedging the player early.`;

    const fields = (["credits", "fuel", "food", "hull", "loc"] as const)
      .filter((k) => e[k] !== a[k])
      .map((k) => `    ${k}: ${JSON.stringify(e[k])} → ${JSON.stringify(a[k])}`);

    return [
      `first divergence at tick ${i} (in-game day ${a.day}):`,
      fields.length ? fields.join("\n") : "    (no headline field moved — the change is deeper in the state)",
      `  log was:  ${e.log.join(" | ") || "(empty)"}`,
      `  log now:  ${a.log.join(" | ") || "(empty)"}`,
      "",
      "  If this change was intentional, regenerate with:  UPDATE_GOLDEN=1 npm test",
    ].join("\n");
  }
  return `tick hashes all match but the final state digest differs (${expected.finalHash} → ${actual.finalHash}) — something changed in state that the per-tick snapshot didn't cover.`;
}

describe("golden-master traces", () => {
  for (const scenario of SCENARIOS) {
    for (const seed of SEEDS) {
      it(`${scenario} seed=${seed} reproduces its trace`, () => {
        const actual = traceRun(scenario, seed, DAYS);

        if (UPDATE) {
          writeFixture(actual);
          return;
        }

        const expected = readFixture(scenario, seed);
        if (!expected) {
          throw new Error(
            `no fixture for ${scenario}/${seed}. Generate the baseline once with:\n` +
            `    UPDATE_GOLDEN=1 npm test\n` +
            `and commit test/golden/fixtures/.`,
          );
        }

        // The whole-trace hash is the gate; explain() only runs to build the
        // failure message, so the happy path stays a single string compare.
        const same =
          expected.finalHash === actual.finalHash &&
          expected.ticks.length === actual.ticks.length &&
          expected.ticks.every((h, i) => h === actual.ticks[i]);

        expect(same, same ? "" : "\n" + explain(expected, actual) + "\n").toBe(true);
      });
    }
  }

  // A fixture that pins a run which died on day 2 pins almost nothing, and
  // would hand us false confidence during the port. Assert the traces actually
  // exercise the sim rather than golden-mastering a flatline.
  it("the traces actually go somewhere (no flatlined fixtures)", () => {
    const shallow: string[] = [];
    for (const scenario of SCENARIOS) {
      for (const seed of SEEDS) {
        const t = traceRun(scenario, seed, DAYS);
        // Distinct per-tick states. A live run changes state every day; a dead
        // or wedged one repeats itself.
        if (traceDepth(t) < DAYS / 2) {
          shallow.push(`${scenario}/${seed}: only ${traceDepth(t)} distinct states across ${t.ticks.length} ticks`);
        }
      }
    }
    expect(shallow, `\nThese traces barely move — they pin nothing:\n  ${shallow.join("\n  ")}`).toEqual([]);
  });
});
