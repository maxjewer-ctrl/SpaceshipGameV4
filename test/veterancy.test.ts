import { describe, it, expect, beforeEach } from "vitest";
import { S, setState, newState, migrate, SAVE_VERSION } from "../src/state";
import { stats } from "../src/derive";
import { rankOf, rankTitle, roleRank, roleEdge, gainRoleXp, addScar, hasScar } from "../src/systems/veterancy";
import type { CrewMember } from "../src/types";

function hand(role: string, over: Partial<CrewMember> = {}): CrewMember {
  return { id: S.uid++, name: "Hand", role, fee: 0, salary: 8, daysAboard: 0, roleXp: 0, scars: [], ...over };
}

beforeEach(() => {
  setState(newState("Vet Test"));
  S.crew = [];
  S.captainRole = null;
});

describe("rank needs BOTH time and blooding", () => {
  it("is rank 0 with days but no events", () => {
    expect(rankOf(hand("gunner", { daysAboard: 100, roleXp: 0 }))).toBe(0);
  });
  it("is rank 0 with events but no days", () => {
    expect(rankOf(hand("gunner", { daysAboard: 0, roleXp: 100 }))).toBe(0);
  });
  it("climbs the gates as both accrue", () => {
    expect(rankOf(hand("gunner", { daysAboard: 10, roleXp: 3 }))).toBe(1);
    expect(rankOf(hand("gunner", { daysAboard: 25, roleXp: 9 }))).toBe(2);
    expect(rankOf(hand("gunner", { daysAboard: 50, roleXp: 20 }))).toBe(3);
    // one axis short of the next gate holds the lower rank
    expect(rankOf(hand("gunner", { daysAboard: 49, roleXp: 20 }))).toBe(2);
    expect(rankOf(hand("gunner", { daysAboard: 50, roleXp: 19 }))).toBe(2);
  });
  it("names the rank by role", () => {
    expect(rankTitle(hand("pilot", { daysAboard: 50, roleXp: 20 }))).toBe("Ghost of the Lanes");
    expect(rankTitle(hand("gunner", { daysAboard: 10, roleXp: 3 }))).toBe("Trigger Hand");
    expect(rankTitle(hand("gunner", {}))).toBe(""); // rank 0 shows no title
  });
});

describe("roleRank / roleEdge read the best hand aboard", () => {
  it("takes the highest rank among crew of that role", () => {
    S.crew = [hand("gunner", { daysAboard: 10, roleXp: 3 }), hand("gunner", { daysAboard: 50, roleXp: 20 })];
    expect(roleRank("gunner")).toBe(3);
    expect(roleRank("pilot")).toBe(0);
  });
  it("edge is 1.0 unranked and grows 6% per rank", () => {
    expect(roleEdge("gunner")).toBe(1);
    S.crew = [hand("gunner", { daysAboard: 50, roleXp: 20 })];
    expect(roleEdge("gunner")).toBeCloseTo(1.18, 5);
  });
});

describe("veterancy edge shows up in ship stats", () => {
  it("a ranked gunner hits harder than a green one", () => {
    S.modules.push({ t: "weapons", on: true, dmg: false, mk: 1 });
    S.crew = [hand("gunner", {})];
    const green = stats().dmg;
    S.crew = [hand("gunner", { daysAboard: 50, roleXp: 20 })];
    const ace = stats().dmg;
    expect(ace).toBeGreaterThan(green);
  });
  it("a ranked pilot burns less fuel per day", () => {
    S.crew = [hand("pilot", {})];
    const green = stats().fuelDay;
    S.crew = [hand("pilot", { daysAboard: 50, roleXp: 20 })];
    expect(stats().fuelDay).toBeLessThan(green);
  });
});

describe("gainRoleXp only bloods the matching role", () => {
  it("increments in-role crew and leaves others alone", () => {
    S.crew = [hand("gunner", { roleXp: 5 }), hand("pilot", { roleXp: 5 })];
    gainRoleXp("gunner", 2);
    expect(S.crew[0].roleXp).toBe(7);
    expect(S.crew[1].roleXp).toBe(5);
  });
});

describe("scars are named, idempotent traits", () => {
  it("stamps once and reports membership", () => {
    const c = hand("gunner", {});
    S.crew = [c];
    addScar(c, "steady_under_fire");
    addScar(c, "steady_under_fire");
    expect(c.scars).toEqual(["steady_under_fire"]);
    expect(hasScar(c, "steady_under_fire")).toBe(true);
    expect(hasScar(c, "lane_scarred")).toBe(false);
  });
  it("ignores unknown scar tags", () => {
    const c = hand("gunner", {});
    addScar(c, "not_a_real_scar");
    expect(c.scars).toEqual([]);
  });
});

describe("save migration v12", () => {
  it("gives pre-v12 crew roleXp 0 and empty scars", () => {
    const s: any = newState("Old");
    s.version = 11;
    s.crew = [{ id: 1, name: "Old Hand", role: "gunner", fee: 0, salary: 8, daysAboard: 40 }];
    const migrated = migrate(s);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.crew[0].roleXp).toBe(0);
    expect(migrated.crew[0].scars).toEqual([]);
    // long-serving but unblooded => still rank 0
    expect(rankOf(migrated.crew[0])).toBe(0);
  });
});
