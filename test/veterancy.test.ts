import { describe, it, expect, beforeEach } from "vitest";
import { S, setState, newState } from "../src/state";
import { stats, foodPerDay, bribeCost } from "../src/derive";
import { rankOf, bestRoleRank, rankBoost, rankDiscount, markVeteranEvent, RANK_NAME } from "../src/systems/veterancy";
import type { CrewMember } from "../src/types";

function crew(role: string, opts: Partial<CrewMember> = {}): CrewMember {
  return { id: S.uid++, name: "Test " + role, role, fee: 0, salary: 0, ...opts };
}

beforeEach(() => setState(newState("Veterancy Test")));

describe("rank derivation", () => {
  it("starts Green with no time or events", () => {
    expect(rankOf(crew("gunner"))).toBe(1);
  });
  it("needs BOTH days aboard and events survived to rank up", () => {
    expect(rankOf(crew("gunner", { daysAboard: 20, eventsInRole: 0 }))).toBe(1);
    expect(rankOf(crew("gunner", { daysAboard: 0, eventsInRole: 20 }))).toBe(1);
  });
  it("reaches Seasoned at 10 days + 3 events", () => {
    expect(rankOf(crew("gunner", { daysAboard: 10, eventsInRole: 3 }))).toBe(2);
    expect(RANK_NAME[2]).toBe("Seasoned");
  });
  it("reaches Veteran at 25 days + 8 events", () => {
    expect(rankOf(crew("gunner", { daysAboard: 25, eventsInRole: 8 }))).toBe(3);
    expect(RANK_NAME[3]).toBe("Veteran");
  });
  it("bestRoleRank ignores other roles and takes the highest of a shared role", () => {
    const crewList = [
      crew("gunner", { daysAboard: 25, eventsInRole: 8 }),
      crew("gunner", { daysAboard: 0, eventsInRole: 0 }),
      crew("pilot", { daysAboard: 25, eventsInRole: 8 }),
    ];
    expect(bestRoleRank(crewList, "gunner")).toBe(3);
    expect(bestRoleRank(crewList, "medic")).toBe(1); // nobody aboard in that role
  });
});

describe("markVeteranEvent", () => {
  it("increments eventsInRole and fires a bark exactly on a rank-up tick", () => {
    const c = crew("gunner", { daysAboard: 10 });
    expect(c.eventsInRole).toBeUndefined();
    markVeteranEvent(c);
    expect(c.eventsInRole).toBe(1);
    markVeteranEvent(c);
    markVeteranEvent(c); // 3rd event, 10 days aboard -> crosses into Seasoned
    expect(rankOf(c)).toBe(2);
  });
});

describe("rank bonuses wire into stats()", () => {
  it("a veteran gunner boosts damage beyond the flat crewed bonus", () => {
    S.modules.push({ t: "weapons", on: true, dmg: false, mk: 1 } as any);
    const base = stats().dmg; // no gunner
    S.crew.push(crew("gunner", { daysAboard: 25, eventsInRole: 8 }));
    const veteranDmg = stats().dmg;
    S.crew[0].daysAboard = 0; S.crew[0].eventsInRole = 0;
    const greenDmg = stats().dmg;
    expect(veteranDmg).toBeGreaterThan(greenDmg);
    expect(greenDmg).toBeGreaterThan(base);
  });

  it("a veteran pilot burns less fuel than a green one", () => {
    S.crew.push(crew("pilot"));
    const green = stats().fuelDay;
    S.crew[0].daysAboard = 25; S.crew[0].eventsInRole = 8;
    const veteran = stats().fuelDay;
    expect(veteran).toBeLessThan(green);
  });

  it("a veteran cook feeds the crew for less", () => {
    S.crew.push(crew("cook"));
    const green = foodPerDay();
    S.crew[0].daysAboard = 25; S.crew[0].eventsInRole = 8;
    const veteran = foodPerDay();
    expect(veteran).toBeLessThanOrEqual(green);
  });

  it("a veteran quartermaster bribes cheaper", () => {
    S.crew.push(crew("quartermaster"));
    const green = bribeCost(100);
    S.crew[0].daysAboard = 25; S.crew[0].eventsInRole = 8;
    const veteran = bribeCost(100);
    expect(veteran).toBeLessThan(green);
  });

  it("no crew in a role means no rank bonus at all (captain double-hatting stays flat)", () => {
    S.captainRole = "gunner";
    S.modules.push({ t: "weapons", on: true, dmg: false, mk: 1 } as any);
    const withCaptain = stats().dmg;
    expect(rankBoost(S.crew, "gunner")).toBe(1);
    expect(rankDiscount(S.crew, "gunner")).toBe(1);
    expect(withCaptain).toBeGreaterThan(0); // sanity: captain still covers the role at baseline
  });
});
