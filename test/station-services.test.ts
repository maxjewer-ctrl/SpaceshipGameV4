import { beforeEach, describe, expect, it } from "vitest";
import { newState, setState, S } from "../src/state";
import { buildStationScene, discoverService, serviceKnown, stationServicesHTML } from "../src/ui/stationwalk";

describe("station service directory", () => {
  beforeEach(() => {
    setState(newState("Station Services", 42));
    S.loc = "solace";
    S.docked = true;
    S.screen = "stationwalk";
  });

  it("unlocks a fast path only after that service is discovered at this port", () => {
    expect(serviceKnown("market")).toBe(false);
    expect(stationServicesHTML()).not.toContain("Exchange</b>");

    expect(discoverService("market")).toBe(true);
    expect(discoverService("market")).toBe(false);
    expect(serviceKnown("market")).toBe(true);
    expect(stationServicesHTML()).toContain("Exchange</b>");
    expect(stationServicesHTML()).toContain("stationEnter");
  });

  it("keeps discoveries local to the port", () => {
    discoverService("cantina", "solace");
    expect(serviceKnown("cantina", "solace")).toBe(true);
    expect(serviceKnown("cantina", "foundry")).toBe(false);
  });

  it("keeps the ship hatch authoritative beside dock reference terminals", () => {
    const doors = buildStationScene().doors;
    const hatch = doors.find((door) => door.label.includes("rear hatch"));
    const departureBoard = doors.find((door) => door.label === "Departure board");
    expect(hatch?.priority).toBeGreaterThan(departureBoard?.priority ?? 0);
  });
});
