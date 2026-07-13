import { describe, it, expect, beforeEach } from "vitest";
import {
  S, setState, newState, save, loadSaved, loadSlot, slotList, deleteSlot,
  setActiveSlot, activeSlot, exportSave, importSave, clearSave, SAVE_KEY, NUM_SLOTS,
} from "../src/state";
import { checkInvariants } from "./harness";

beforeEach(() => {
  localStorage.clear();
  setActiveSlot(0);
});

describe("save slots + transient stripping", () => {
  it("does not persist UI transients; reconstructs them on load", () => {
    setState(newState("Transient Test"));
    S.day = 5; S.credits = 999;
    S.screen = "planet"; S.ptab = "yard"; S.sel = 3; S.selPlanet = "verge";
    save();
    // The raw blob must omit transients.
    const raw = JSON.parse(localStorage.getItem(`${SAVE_KEY}:slot0`)!);
    expect(raw.screen).toBeUndefined();
    expect(raw.ptab).toBeUndefined();
    expect(raw.sel).toBeUndefined();
    expect(raw.selPlanet).toBeUndefined();
    expect(raw.day).toBe(5);
    // Loading reconstructs safe defaults, not the saved transients.
    const loaded = loadSaved()!;
    expect(loaded.day).toBe(5);
    expect(loaded.credits).toBe(999);
    expect(loaded.screen).toBe("shipwalk"); // docked → shipwalk
    expect(loaded.ptab).toBe("cantina");
    expect(loaded.sel).toBeNull();
    expect(loaded.selPlanet).toBeNull();
  });

  it("defaults screen to travel when mid-flight", () => {
    setState(newState("In Transit"));
    S.travel = { from: "solace", dest: "verge", total: 3, left: 2 };
    save();
    expect(loadSaved()!.screen).toBe("travel");
  });

  it("keeps slots isolated", () => {
    setState(newState("Slot A")); S.credits = 111; setActiveSlot(0); save();
    setState(newState("Slot B")); S.credits = 222; setActiveSlot(1); save();
    expect(loadSlot(0)!.shipName).toBe("Slot A");
    expect(loadSlot(0)!.credits).toBe(111);
    expect(loadSlot(1)!.shipName).toBe("Slot B");
    expect(loadSlot(1)!.credits).toBe(222);
    expect(loadSlot(2)).toBeNull();
  });

  it("lists slot metadata without loading the whole state", () => {
    setState(newState("Meta Ship")); S.day = 42; S.credits = 3000; S.prestige = 7; S.loc = "kestrel";
    setActiveSlot(1); save();
    const list = slotList();
    expect(list).toHaveLength(NUM_SLOTS);
    expect(list[0].empty).toBe(true);
    expect(list[1].empty).toBe(false);
    expect(list[1].day).toBe(42);
    expect(list[1].credits).toBe(3000);
    expect(list[1].shipName).toBe("Meta Ship");
    expect(list[1].loc).toBe("kestrel");
  });

  it("migrates a pre-slots legacy save into slot 0", () => {
    // Simulate an old single-key save.
    const legacy = newState("Legacy Captain"); legacy.day = 17;
    localStorage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const loaded = loadSaved()!; // boot-time load lifts the legacy key
    expect(loaded.shipName).toBe("Legacy Captain");
    expect(loaded.day).toBe(17);
    // The legacy key is gone and slot 0 now holds it.
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(loadSlot(0)!.shipName).toBe("Legacy Captain");
  });

  it("deletes a slot", () => {
    setState(newState("Doomed")); save();
    expect(loadSlot(0)).not.toBeNull();
    deleteSlot(0);
    expect(loadSlot(0)).toBeNull();
    expect(slotList()[0].empty).toBe(true);
  });

  it("does not persist a dead run", () => {
    setState(newState("Dead")); S.over = true; save();
    expect(localStorage.getItem(`${SAVE_KEY}:slot0`)).toBeNull();
  });

  it("reads a corrupt slot as empty instead of throwing", () => {
    localStorage.setItem(`${SAVE_KEY}:slot0`, "{ not json");
    expect(() => slotList()).not.toThrow();
    expect(slotList()[0].empty).toBe(true);
    expect(loadSlot(0)).toBeNull();
  });
});

describe("export / import", () => {
  it("round-trips a game through export → import, sound", () => {
    setState(newState("Export Ship")); S.day = 30; S.credits = 4200; S.prestige = 9;
    const json = exportSave();
    // Fresh environment, different active slot.
    localStorage.clear();
    setActiveSlot(2);
    const imported = importSave(json, 2)!;
    expect(imported).not.toBeNull();
    expect(imported.shipName).toBe("Export Ship");
    expect(imported.day).toBe(30);
    expect(imported.credits).toBe(4200);
    expect(activeSlot()).toBe(2);
    setState(imported);
    expect(checkInvariants("imported")).toEqual([]);
    // And it landed in slot 2.
    expect(loadSlot(2)!.shipName).toBe("Export Ship");
  });

  it("rejects a non-save file", () => {
    expect(importSave('{"hello":"world"}')).toBeNull();
    expect(importSave("not json at all")).toBeNull();
    expect(importSave("[]")).toBeNull();
  });

  it("migrates an imported old-version save forward", () => {
    const old: any = newState("Old Import"); old.version = 3; delete old.portStanding; delete old.campaign;
    const json = JSON.stringify(old);
    const imported = importSave(json)!;
    expect(imported).not.toBeNull();
    expect(imported.portStanding).toBeTruthy();
    expect(imported.campaign?.silence).toBeTruthy();
    setState(imported);
    expect(checkInvariants("old-import")).toEqual([]);
  });
});
