import { beforeEach, describe, expect, it } from "vitest";
import { S } from "../src/state";
import { stats } from "../src/derive";
import { clearModal, closeModal, modalHTML } from "../src/modal";
import { introAct, introArrive, introObjectiveHTML, introStart, introStage } from "../src/systems/intro";
import { buildShipScene } from "../src/ui/shipwalk";
import { departureCrewWarnings } from "../src/ui/map";

function seedCreatorDOM() {
  document.body.innerHTML = `
    <input id="shipnamein" value="Kestrel">
    <select id="captainrolein">
      <option value="pilot" selected>Pilot</option>
      <option value="mechanic">Mechanic</option>
    </select>
  `;
}

describe("Dead Reckoning opener", () => {
  beforeEach(() => {
    clearModal();
    seedCreatorDOM();
  });

  it("starts as a stranded freighter instead of the Port Solace sandbox", () => {
    introStart();

    expect(introStage()).toBe(1);
    expect(S.docked).toBe(false);
    expect(S.loc).toBe("kestrel");
    expect(S.screen).toBe("shipwalk");
    expect(S.fuel).toBe(0);
    expect(S.hull).toBe(41);
    expect(S.credits).toBe(85);
    expect(S.slotsMax).toBe(8);
    expect(S.crew.map((c) => c.name)).toContain("Juno Vale");

    const moduleTypes = S.modules.map((m) => m.t);
    expect(moduleTypes).toEqual([
      "cockpit",
      "engine",
      "fueltank",
      "cargohold",
      "cabin",
      "quarters",
      "medbay",
      "weapons",
      "workshop",
    ]);

    expect(S.modules.find((m) => m.t === "engine")?.dmg).toBe(true);
    expect(S.modules.find((m) => m.t === "quarters")?.dmg).toBe(true);
    expect(stats().powerUse).toBeLessThanOrEqual(stats().powerOut);
    expect(introObjectiveHTML()).toContain("Reach the cockpit");
    expect(departureCrewWarnings().shown).toEqual([]);
  });

  it("turns Vance's first contract into a concrete provisioning objective", () => {
    introStart();
    S.flags.intro = 6;
    S.flags.intro_done = true;
    S.loc = "solace";
    S.docked = true;
    S.fuel = 0;
    S.food = 0;
    S.jobs.push({ id: S.uid++, kind: "haul", title: "Vance's crate", dest: "kestrel", pay: 60, units: 3, tag: "vancedebt" });

    const objective = introObjectiveHTML();
    expect(objective).toContain("Provision for Kestrel's Rest");
    expect(objective).toContain("Walk to the Exchange");
    expect(objective).toContain("fuel and");
    expect(objective).toContain("Route budget:");
    expect(departureCrewWarnings().shown).toHaveLength(2);
    expect(departureCrewWarnings().hidden).toBeGreaterThan(0);
  });

  it("activates prologue objectives from the walk scene without window globals", () => {
    introStart();
    clearModal();

    const chair = buildShipScene().doors.find((door) => door.label === "The captain's chair");
    expect(chair).toBeDefined();

    chair?.action();

    expect(modalHTML()).toContain("The Chair");
  });

  it("advances modal choices in place through repair and salvage", () => {
    introStart();
    introAct("wake");

    introAct("cockpit");
    expect(modalHTML()).toContain("The Chair");

    introAct("goodbye");
    expect(introStage()).toBe(2);
    expect(modalHTML()).toContain("Taking Stock");
    closeModal();

    introAct("rig");
    expect(modalHTML()).toContain("three ways to get it");
    introAct("rig_juno");
    expect(introStage()).toBe(3);
    expect(modalHTML()).toContain("core catches on the third try");
    closeModal();

    introAct("eva");
    expect(modalHTML()).toContain("Vesper first");
    introAct("vesper");
    expect(modalHTML()).toContain("The Vesper");
    introAct("vesper_tags");
    expect(modalHTML()).toContain("The Cutter");
    introAct("cutter_box");
    expect(modalHTML()).toContain("something inside is <b>knocking</b>");
    introAct("skiff_cut");

    expect(introStage()).toBe(4);
    expect(S.fuel).toBe(14);
    expect(S.travel).toEqual({ from: "kestrel", dest: "solace", total: 3, left: 3 });
    expect(modalHTML()).toContain("The Limp");

    clearModal();
    S.loc = "solace";
    S.docked = true;
    S.travel = null;
    expect(introArrive()).toBe(true);
    expect(S.screen).toBe("stationwalk");
    expect(modalHTML()).toContain("Port Solace");
    expect(modalHTML()).toContain("whatever your mechanic couldn't patch in flight");
  });
});
