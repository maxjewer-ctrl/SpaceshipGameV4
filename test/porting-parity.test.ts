import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../src/debug/scenarios";
import { modInst } from "../src/derive";
import { S } from "../src/state";
import { ensureSlots, moveModTo } from "../src/systems/actions";

const SCENARIOS = ["fresh", "trader", "fighter", "silence", "arc", "run", "reckoning"] as const;
const SEED = 8919;
const FIXTURE = join(import.meta.dirname, "porting", "fixtures", "scenario-projections.json");

function projection(scenario: string) {
  ensureSlots();
  return {
    version: S.version,
    seed: S.seed,
    rngState: S.rngState,
    scenario,
    shipName: S.shipName,
    day: S.day,
    credits: S.credits,
    fuel: S.fuel,
    food: S.food,
    hull: S.hull,
    hullMax: S.hullMax,
    prestige: S.prestige,
    engineLevel: S.engineLvl,
    location: S.loc,
    docked: S.docked,
    captainModel: S.appearance.model || "explorer",
    bayCount: S.slotsMax,
    modules: modInst()
      .map((module) => ({
        slot: module.slot!,
        key: module.t,
        powered: module.on,
        damaged: module.dmg,
        mark: module.mk ?? 1,
      }))
      .sort((a, b) => a.slot - b.slot),
    crew: S.crew.map((crew) => ({ name: crew.name, role: crew.role })),
  };
}

function buildFixture() {
  const scenarios = SCENARIOS.map((scenario) => {
    loadScenario(scenario, SEED);
    return projection(scenario);
  });

  loadScenario("fresh", SEED);
  const initial = projection("fresh");
  moveModTo(0, 1);
  const afterSwap = projection("fresh");
  return { schema: 1, seed: SEED, scenarios, swapTrace: { initial, afterSwap } };
}

describe("browser-to-C# porting projection", () => {
  it("keeps every deterministic scenario and the first module action pinned", () => {
    const actual = buildFixture();
    if (process.env.UPDATE_PORTING === "1") {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + "\n");
    }
    expect(existsSync(FIXTURE), `Missing ${FIXTURE}; run with UPDATE_PORTING=1 once.`).toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });
});
