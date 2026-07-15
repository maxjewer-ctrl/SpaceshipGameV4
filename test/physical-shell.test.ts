import { beforeEach, describe, expect, it } from "vitest";
import { newState, S, setState } from "../src/state";
import { commandConsoleHTML, setConsoleTab, standUp } from "../src/ui/commandConsole";
import { missionStripHTML } from "../src/ui/missionStrip";
import { nextDayProjection } from "../src/ui/projections";
import { getShipReturnAnchor } from "../src/ui/physicalNav";
import { buyTradeQty, planetHTML, setTradeQty } from "../src/ui/planet";
import { dayTick } from "../src/systems/travel";

function addContract() {
  S.jobs.push({ id: 91, title: "Medical Relay", dest: "foundry", pay: 420, deadline: S.day + 4 } as any);
}

describe("physical-first shell", () => {
  beforeEach(() => {
    setState(newState("Shell Test", 42));
    S.flags.intro_done = true;
    S.loc = "solace";
    S.docked = true;
  });

  it("starts new ships with six bays, five installed systems, and no weapons or med bay", () => {
    expect(S.slotsMax).toBe(6);
    expect(S.modules.slice(2).map((module) => module.t)).toEqual(["fueltank", "cargohold", "cabin", "quarters", "workshop"]);
  });

  it("keeps active contracts visible on navigation and at station services", () => {
    addContract();
    setConsoleTab("navigation");
    expect(commandConsoleHTML()).toContain("Medical Relay");
    expect(commandConsoleHTML()).toContain("ACTIVE CONTRACTS · 1");
    S.screen = "planet";
    S.ptab = "cantina";
    expect(planetHTML()).toContain("Medical Relay");
    expect(missionStripHTML()).toContain("Foundry");
  });

  it("returns from the console to the captain chair anchor", () => {
    S.screen = "ship";
    standUp();
    expect(S.screen).toBe("shipwalk");
    expect(getShipReturnAnchor()).toBe("chair");
  });

  it("renders the same next-day resource outcomes that dayTick applies", () => {
    S.credits = 100;
    S.fuel = 30;
    S.food = 20;
    S.travel = { from: "solace", dest: "foundry", total: 3, left: 3 };
    const projected = nextDayProjection(true);
    dayTick(true);
    expect(S.fuel).toBe(projected.fuelAfter);
    expect(S.food).toBe(projected.foodAfter);
    expect(S.credits).toBe(projected.creditsAfter);
  });

  it("executes the exact commodity quantity and total shown by the Exchange", () => {
    S.screen = "planet";
    S.ptab = "market";
    S.credits = 10_000;
    planetHTML();
    setTradeQty("ore", -99);
    setTradeQty("ore", 4);
    const unitPrice = S.market!.prices.ore;
    const creditsBefore = S.credits;
    buyTradeQty("ore");
    expect(S.cargo.ore).toBe(5);
    expect(S.credits).toBe(creditsBefore - unitPrice * 5);
  });
});
