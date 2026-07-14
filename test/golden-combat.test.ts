// GOLDEN-MASTER GATE: SHIP COMBAT
//
// Combat is the highest-risk thing in systems/ to refactor — it is 549 lines of
// resolution logic tangled with its own HTML view, and it is next on the block
// to be split (docs/PORTING.md). This is the net that makes that split safe:
// if the split changes a single damage roll, a single hit grade, or the order
// of a single enemy volley, one of these traces goes red at the exact action.
//
// It only became possible once the clock became an input. See test/golden/combat.ts.
//
// Regenerate deliberately-changed balance with: UPDATE_GOLDEN=1 npm test
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { traceCombat, type CombatTrace } from "./golden/combat";
import type { Enemy } from "../src/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "golden", "fixtures");
const UPDATE = !!process.env.UPDATE_GOLDEN;

// Real enemies lifted from the game's own encounter tables (events.ts, arc.ts),
// chosen to cover the shapes combat actually branches on:
//   - Corsair   : a lone mid-weight foe, no escort (buildTargets' honest fight)
//   - Cutter    : a Union patrol, bribable
//   - Gunship   : hull >= 60, so it SPAWNS AN ESCORT — the multi-target path
//   - Interdictor: hull >= 75, escort + point-defense drone — the full 3-target path
const FOES: Array<{ key: string; enemy: Enemy }> = [
  { key: "corsair", enemy: { name: "Corsair", hull: 55, dmg: 12, loot: 120 } },
  { key: "cutter", enemy: { name: "Union Cutter", hull: 50, dmg: 11, bribe: 200 } },
  { key: "gunship", enemy: { name: "Union Gunship", hull: 70, dmg: 14 } },
  { key: "interdictor", enemy: { name: "Union Interdictor", hull: 90, dmg: 16 } },
];

// "fighter" is an armed mid-game ship — a fair fight. "fresh" is a starter hull,
// which mostly loses; both outcomes are worth pinning.
const CASES: Array<{ scenario: string; seed: number }> = [
  { scenario: "fighter", seed: 1 },
  { scenario: "fighter", seed: 8919 },
  { scenario: "fresh", seed: 20260714 },
];

const path = (scenario: string, seed: number, foe: string) => join(FIXTURES, `combat.${scenario}.${foe}.${seed}.json`);

function explain(e: CombatTrace, a: CombatTrace): string {
  const n = Math.max(e.steps.length, a.steps.length);
  for (let i = 0; i < n; i++) {
    if (e.steps[i] === a.steps[i]) continue;
    return [
      `first divergence at action ${i}: "${a.script[i] ?? "(none)"}" (was "${e.script[i] ?? "(none)"}")`,
      `  result:   ${e.result} → ${a.result}`,
      `  hull left: ${e.hullLeft} → ${a.hullLeft}`,
      `  script was: ${e.script.slice(Math.max(0, i - 2), i + 3).join(" → ")}`,
      `  script now: ${a.script.slice(Math.max(0, i - 2), i + 3).join(" → ")}`,
      "",
      "  Intentional balance change? UPDATE_GOLDEN=1 npm test",
    ].join("\n");
  }
  return `steps match but final state differs (${e.finalHash} → ${a.finalHash})`;
}

describe("golden-master: ship combat", () => {
  for (const { scenario, seed } of CASES) {
    for (const { key, enemy } of FOES) {
      it(`${scenario}/${key}/seed=${seed} replays identically`, () => {
        const actual = traceCombat(scenario, seed, enemy);

        if (UPDATE) {
          mkdirSync(FIXTURES, { recursive: true });
          writeFileSync(path(scenario, seed, key), JSON.stringify(actual, null, 2) + "\n");
          return;
        }

        const p = path(scenario, seed, key);
        if (!existsSync(p)) throw new Error(`no fixture for ${scenario}/${key}/${seed}. Run: UPDATE_GOLDEN=1 npm test`);
        const expected = JSON.parse(readFileSync(p, "utf8")) as CombatTrace;

        const same =
          expected.finalHash === actual.finalHash &&
          expected.steps.length === actual.steps.length &&
          expected.steps.every((h, i) => h === actual.steps[i]);

        expect(same, same ? "" : "\n" + explain(expected, actual) + "\n").toBe(true);
      });
    }
  }

  // The traces are worthless if the bot never actually pulls a trigger — a fight
  // that ends on action 1 pins nothing. Assert the fights are real fights.
  it("the fights actually happen (shots fired, fights resolve)", () => {
    const thin: string[] = [];
    for (const { scenario, seed } of CASES) {
      for (const { key, enemy } of FOES) {
        const t = traceCombat(scenario, seed, enemy);
        const shots = t.script.filter((s) => s === "release").length;
        if (!t.result) thin.push(`${scenario}/${key}/${seed}: fight never resolved`);
        else if (shots < 1) thin.push(`${scenario}/${key}/${seed}: resolved with ${shots} shots fired`);
      }
    }
    expect(thin, `\n  ${thin.join("\n  ")}`).toEqual([]);
  });

  // The seam itself, asserted directly: same script + same clock ⇒ same fight.
  // This is the property the whole port depends on. If it ever regresses,
  // someone has reintroduced a Date.now() into the sim.
  it("is deterministic: the clock is an input, not a hidden dependency", () => {
    const a = traceCombat("fighter", 4242, { name: "Corsair", hull: 55, dmg: 12, loot: 120 });
    const b = traceCombat("fighter", 4242, { name: "Corsair", hull: 55, dmg: 12, loot: 120 });
    expect(b.steps).toEqual(a.steps);
    expect(b.finalHash).toBe(a.finalHash);
    expect(b.result).toBe(a.result);
  });
});
