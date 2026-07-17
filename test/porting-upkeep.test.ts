import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadScenario } from "../src/debug/scenarios";
import { S } from "../src/state";
import { dayTick } from "../src/systems/travel";

const SEED = 8919;
const FIXTURE = join(import.meta.dirname, "porting", "fixtures", "upkeep-traces.json");

function snapshot() {
  return {
    day: S.day,
    credits: S.credits,
    food: S.food,
    prestige: S.prestige,
    starve: S.starve,
    unpaid: S.unpaid,
    over: S.over,
    dead: S.dead,
    crew: S.crew.map((crew) => ({
      name: crew.name,
      role: crew.role,
      salary: crew.salary,
      daysAboard: crew.daysAboard ?? 0,
    })),
  };
}

function buildFixture() {
  loadScenario("fresh", SEED);
  S.food = 0;
  S.credits = 0;
  S.prestige = 5;
  S.crew.push(
    { id: S.uid++, name: "Ari Vale", role: "pilot", fee: 0, salary: 8, daysAboard: 0 },
    { id: S.uid++, name: "Bo Mercer", role: "gunner", fee: 0, salary: 8, daysAboard: 0 },
  );
  const crisis = [snapshot()];
  for (let day = 0; day < 6; day++) {
    dayTick(false);
    crisis.push(snapshot());
  }

  loadScenario("fresh", SEED);
  S.food = 10;
  S.credits = 20;
  S.prestige = 2;
  S.starve = 3;
  S.unpaid = 2;
  S.crew.push({ id: S.uid++, name: "Cora Wynn", role: "gunner", fee: 0, salary: 8, daysAboard: 0 });
  const recovery = [snapshot()];
  dayTick(false);
  recovery.push(snapshot());

  loadScenario("trader", SEED);
  const hydroponics = [snapshot()];
  dayTick(false);
  hydroponics.push(snapshot());

  return { schema: 1, seed: SEED, crisis, recovery, hydroponics };
}

describe("browser-to-C# upkeep traces", () => {
  it("pins deterministic starvation, payroll, recovery, and hydroponics rules", () => {
    const actual = buildFixture();
    if (process.env.UPDATE_PORTING === "1") {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + "\n");
    }
    expect(existsSync(FIXTURE), `Missing ${FIXTURE}; run with UPDATE_PORTING=1 once.`).toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });
});
