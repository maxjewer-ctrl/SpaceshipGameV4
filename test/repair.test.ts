import { beforeEach, describe, expect, it } from "vitest";
import { S, mk, newState, setState } from "../src/state";
import { dayTick, fieldRepairLimit } from "../src/systems/travel";
import type { CrewMember } from "../src/types";

function mechanic(): CrewMember {
  return { id: S.uid++, name: "Test Mechanic", role: "mechanic", fee: 0, salary: 0 };
}

beforeEach(() => {
  setState(newState("Field Repair Test", 42));
  S.crew = [mechanic()];
  S.food = 100;
  S.fuel = 100;
  S.modules = [mk("cockpit"), mk("engine"), mk("fueltank"), mk("cargohold")];
});

describe("field repair economy", () => {
  it("repairs two hull per travel day but cannot exceed 50% without a workshop", () => {
    S.hull = 41;
    expect(fieldRepairLimit()).toBe(50);

    for (let i = 0; i < 10; i++) dayTick(true);

    expect(S.hull).toBe(50);
  });

  it("a workshop raises the field-repair ceiling to 60% without restoring full hull", () => {
    S.modules.push(mk("workshop"));
    S.hull = 41;
    expect(fieldRepairLimit()).toBe(60);

    for (let i = 0; i < 12; i++) dayTick(true);

    expect(S.hull).toBe(60);
    expect(S.hull).toBeLessThan(S.hullMax);
  });
});
