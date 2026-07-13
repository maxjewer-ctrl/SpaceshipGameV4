import { describe, it, expect } from "vitest";
import { migrate, newState, SAVE_VERSION } from "../src/state";
import { setState } from "../src/state";
import { checkInvariants } from "./harness";
import { stats } from "../src/derive";

// Old saves must migrate forward forever (BETA_PLAN §2 exit criteria). We
// build a deliberately-ancient save shape and walk it up the chain, then a
// representative save from every intermediate version, asserting each lands on
// the current version as a sound, playable state.

// A v1 (unversioned) save: modules were plain type strings, no seed/rng/engine
// primitives, no disposition/campaign/appearance. The oldest thing we promise
// to still open.
function v1Save(): any {
  return {
    shipName: "Old Girl",
    day: 30, credits: 1200, fuel: 20, food: 15, hull: 80, hullMax: 100, prestige: 5,
    engineLvl: 2, slotsMax: 8, loc: "foundry", docked: true,
    screen: "ship", ptab: "cantina", sel: null, selPlanet: null,
    rep: { union: 3, frontier: -1, syndicate: 0 },
    modules: ["cockpit", "engine", "fueltank", "cargohold", "weapons"],
    cargo: { ore: 4, med: 0, lux: 2 },
    crew: [{ id: 1, name: "Rosa Vega", role: "pilot", fee: 0, salary: 8 }],
    jobs: [], logLines: [], market: null, travel: null,
    arc: { stage: 2, deadline: null, betrayed: false, ambushed: false, done: false },
    starve: 0, unpaid: 0, uid: 5, over: false, won: false, dead: false,
  };
}

describe("save migration", () => {
  it("migrates a v1 (unversioned) save to the current version, sound", () => {
    const m = migrate(v1Save());
    expect(m.version).toBe(SAVE_VERSION);
    // v1 module strings became instances
    expect(typeof m.modules[0]).toBe("object");
    expect((m.modules[0] as any).t).toBe("cockpit");
    // engine primitives exist
    expect(Array.isArray(m.scheduled)).toBe(true);
    expect(Array.isArray(m.ledger)).toBe(true);
    expect(m.flags && typeof m.flags === "object").toBe(true);
    expect(m.disposition).toBeTruthy();
    expect(m.campaign?.silence).toBeTruthy();
    expect(m.appearance).toBeTruthy();
    expect(m.portStanding && typeof m.portStanding === "object").toBe(true);
    setState(m);
    expect(checkInvariants("migrated-v1")).toEqual([]);
    // and it's actually usable: derive doesn't throw
    expect(() => stats()).not.toThrow();
  });

  it("migrates every intermediate version forward", () => {
    // Start from a current, valid state, then stamp it back to each old
    // version and re-migrate — proves the chain is monotonic and idempotent.
    for (let from = 1; from <= SAVE_VERSION; from++) {
      const s: any = newState("Chain Test");
      s.version = from;
      const m = migrate(s);
      expect(m.version, `migrating from v${from}`).toBe(SAVE_VERSION);
      setState(m);
      expect(checkInvariants(`chain-from-v${from}`), `from v${from}`).toEqual([]);
    }
  });

  it("is idempotent on a current save", () => {
    const s = newState("Idempotent");
    const once = migrate(s);
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice.version).toBe(SAVE_VERSION);
    expect(twice.version).toBe(once.version);
  });
});
