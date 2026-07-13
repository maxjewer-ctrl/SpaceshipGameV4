import { describe, it, expect, beforeEach } from "vitest";
import { S, setState, newState, mk, migrate, SAVE_VERSION } from "../src/state";
import { stats } from "../src/derive";
import { markScaled, markPrice, markOf, yardMaxMark, marksAt } from "../src/systems/modtier";
import { buyMod, upgradeMod, sellMod } from "../src/systems/actions";
import { checkInvariants } from "./harness";

function freshShip() {
  setState(newState("Tier Test"));
  S.modules = [mk("cockpit"), mk("engine")]; // core only
  S.credits = 100000;
  S.slotsMax = 14;
}

beforeEach(freshShip);

describe("module marks scale output", () => {
  it("a Mk-III cargo hold holds double a Mk-I", () => {
    const m1 = mk("cargohold", 1), m3 = mk("cargohold", 3);
    expect(markScaled(m1, "cargo")).toBe(20);
    expect(markScaled(m3, "cargo")).toBe(40); // 20 * 2.0
    expect(markScaled(mk("cargohold", 2), "cargo")).toBe(30); // 20 * 1.5
  });

  it("stats() sums mark-scaled capacity", () => {
    S.modules.push(mk("cargohold", 1), mk("cargohold", 3));
    expect(stats().cargoCap).toBe(20 + 40);
  });

  it("scales weapons damage and shields", () => {
    S.modules.push(mk("weapons", 3), mk("shields", 2));
    const st = stats();
    expect(st.dmg).toBe(16); // 8 * 2.0, no gunner
    expect(st.shield).toBe(6); // 4 * 1.5
  });

  it("scales reactor power output", () => {
    const base = stats().powerOut;
    S.modules.push(mk("reactor", 3));
    expect(stats().powerOut).toBe(base + 6); // 3 * 2.0
  });

  it("keeps power DRAW flat across marks (higher mark = better per watt)", () => {
    S.modules.push(mk("weapons", 1));
    const use1 = stats().powerUse;
    S.modules[S.modules.length - 1].mk = 3;
    expect(stats().powerUse).toBe(use1); // unchanged
  });
});

describe("mark pricing + yard availability", () => {
  it("higher marks cost more, super-linearly", () => {
    const p1 = markPrice("cargohold", 1), p2 = markPrice("cargohold", 2), p3 = markPrice("cargohold", 3);
    expect(p2).toBeGreaterThan(p1 * 1.5);
    expect(p3).toBeGreaterThan(p2);
  });
  it("Mk-III is only fitted at Foundry", () => {
    expect(yardMaxMark("foundry")).toBe(3);
    expect(yardMaxMark("solace")).toBe(2);
    expect(marksAt("solace")).toEqual([1, 2]);
    expect(marksAt("foundry")).toEqual([1, 2, 3]);
  });
});

describe("buy / upgrade / sell at marks", () => {
  it("buyMod installs at the requested mark and charges its price", () => {
    S.loc = "foundry"; S.credits = 100000;
    const before = S.credits;
    buyMod("cargohold", 3);
    const inst = S.modules.filter((m) => m.t === "cargohold");
    expect(inst).toHaveLength(1);
    expect(markOf(inst[0])).toBe(3);
    expect(before - S.credits).toBe(Math.round(markPrice("cargohold", 3) * (0.85))); // foundry 15% off
  });

  it("refuses a mark the yard doesn't stock", () => {
    S.loc = "solace"; S.credits = 100000;
    buyMod("weapons", 3); // solace tops out at Mk-II
    expect(S.modules.some((m) => m.t === "weapons")).toBe(false);
  });

  it("upgradeMod walks a unit up one mark for the price difference", () => {
    S.loc = "foundry"; S.credits = 100000;
    S.modules.push(mk("cargohold", 1));
    const before = S.credits;
    upgradeMod("cargohold");
    const inst = S.modules.filter((m) => m.t === "cargohold")[0];
    expect(markOf(inst)).toBe(2);
    const diff = Math.round(markPrice("cargohold", 2) * 0.85) - Math.round(markPrice("cargohold", 1) * 0.85);
    expect(before - S.credits).toBe(diff);
  });

  it("upgrade is capped at the yard's max mark", () => {
    S.loc = "solace"; S.credits = 100000; // max Mk-II
    S.modules.push(mk("cargohold", 2));
    upgradeMod("cargohold");
    expect(markOf(S.modules.filter((m) => m.t === "cargohold")[0])).toBe(2); // unchanged
  });

  it("sellMod refunds by mark", () => {
    S.credits = 0;
    S.modules.push(mk("cargohold", 3));
    // sellMod indexes modInst() (non-core); our only non-core module is index 0
    sellMod(0);
    expect(S.credits).toBe(Math.round(markPrice("cargohold", 3) * 0.6));
  });
});

describe("save migration", () => {
  it("v10 modules migrate to Mk-I", () => {
    const s: any = newState("Old"); s.version = 10;
    s.modules.forEach((m: any) => delete m.mk);
    const migrated = migrate(s);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.modules.every((m: any) => m.mk === 1)).toBe(true);
    setState(migrated);
    expect(checkInvariants("v10-migrated")).toEqual([]);
  });
});
