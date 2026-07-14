// Foot-combat battle zone (Phase A of docs/COMBAT_ZONES.md). Drives the walk
// sim headlessly the way __walkStep does in the browser: rAF is stubbed so ONLY
// our manual steps advance the fight, and walk3d is mocked so no WebGL/three is
// touched. Proves the two outcomes a zone must have — cleared and downed.
import { describe, it, expect, beforeEach, vi } from "vitest";

// walk.ts dynamically imports ./walk3d in start(); mock it so the test never
// loads three.js. mount(null) already no-ops, but this keeps it light + sync.
vi.mock("../src/ui/walk3d", () => ({
  mount: () => {}, setScene: () => {}, render: () => {}, teardown: () => {},
}));

// Only debugStep drives the sim — stub rAF so walk's internal loop is inert.
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};

import { loadScenario } from "../src/debug/scenarios";
import * as walk from "../src/ui/walk";
import type { WalkScene, WalkCombat } from "../src/ui/walk";
import { startZone, buildZoneScene, zoneActive, zoneMods, zoneBail, captainInjured } from "../src/ui/zonewalk";
import { defaultMods } from "../src/ui/walk";
import { generateRun } from "../src/systems/zonegen";
import { derelictBoard } from "../src/systems/events";
import { S } from "../src/state";

function arena(combat: WalkCombat): WalkScene {
  return {
    id: "test:arena",
    title: "Test Arena", status: "TEST",
    width: 1000, height: 700,
    floors: [{ x: 0, y: 0, w: 1000, h: 700 }],
    rooms: [], doors: [], actors: [],
    spawn: { x: 500, y: 350 },
    action: true,
    combat,
  };
}

// Advance the sim n frames of dt seconds each.
function step(n: number, dt = 0.05) { for (let i = 0; i < n; i++) walk.debugStep(dt); }

describe("foot-combat battle zone", () => {
  beforeEach(() => { loadScenario("fresh"); walk.teardown(); });

  it("clears the pad: shooting all hostiles fires onClear once", () => {
    let cleared = 0, downed = 0;
    walk.start(arena({
      vitality: 100,
      enemies: [{ x: 500, y: 200, hp: 3 }, { x: 500, y: 500, hp: 3 }],
      onClear: () => { cleared++; },
      onDowned: () => { downed++; },
    }));

    // Gun down each drone: teleport into range, aim at its live position, fire,
    // let the shot travel. Re-aim each volley since drones move.
    for (let volley = 0; volley < 60; volley++) {
      const c = walk.debugCombat();
      if (!c.active) break;
      const target = c.enemies.find((e) => e.hp > 0);
      if (!target) break;
      walk.debugGoto(target.x, target.y - 110); // stand 110px off, clear of contact
      walk.debugFireAt(target.x, target.y);
      step(5); // 5×0.05s×720px/s ≈ 180px — crosses the gap and connects
    }

    const c = walk.debugCombat();
    expect(c.enemies.every((e) => e.hp <= 0)).toBe(true);
    expect(c.active).toBe(false);
    expect(cleared).toBe(1);   // fired exactly once
    expect(downed).toBe(0);
    step(20);                  // keep stepping — must not re-fire onClear
    expect(cleared).toBe(1);
  });

  it("gets downed: standing in a crossfire drains vitality and fires onDowned", () => {
    let cleared = 0, downed = 0;
    walk.start(arena({
      vitality: 40,
      enemies: [{ x: 505, y: 350, hp: 9 }, { x: 495, y: 350, hp: 9 }, { x: 500, y: 360, hp: 9 }],
      onClear: () => { cleared++; },
      onDowned: () => { downed++; },
    }));
    walk.debugGoto(500, 350); // stand in the middle of the pack, never fire, never roll

    let guard = 0;
    while (walk.debugCombat().active && guard++ < 400) step(1);

    const c = walk.debugCombat();
    expect(c.vitality).toBe(0);
    expect(downed).toBe(1);
    expect(cleared).toBe(0);
    step(20);                  // must not re-fire onDowned
    expect(downed).toBe(1);
  });
});

// Gun down every hostile in the current chamber (3 shots/volley, re-aimed).
function clearChamber() {
  for (let volley = 0; volley < 80; volley++) {
    const c = walk.debugCombat();
    if (!c.active) return;
    const t = c.enemies.find((e) => e.hp > 0);
    if (!t) return;
    walk.debugGoto(t.x, t.y - 90);
    for (let s = 0; s < 3; s++) walk.debugFireAt(t.x, t.y);
    step(4);
  }
}

describe("combat-zone run structure (Phase B)", () => {
  beforeEach(() => { loadScenario("fresh"); walk.teardown(); });

  it("chains chambers: seal → clear → boon door → extract, paying out on win", () => {
    const before = S.credits;
    let result: any = null;
    startZone({ biome: "derelict", chambers: 3, vitality: 100, returnScreen: "ship", onExit: (r) => { result = r; } });
    expect(zoneActive()).toBe(true);

    let lastId = "", chambersEntered = 0, sealedSeen = false, guard = 0;
    while (zoneActive() && guard++ < 20) {
      let scene = buildZoneScene();
      if (scene.id !== lastId) { walk.start(scene); lastId = scene.id; chambersEntered++; }

      // Mid-fight the only exit is a locked hatch (the chamber is sealed).
      if (walk.debugCombat().active) {
        const sealed = scene.doors.find((d) => d.locked);
        if (sealed) sealedSeen = true;
        clearChamber();
      }

      // Cleared: rebuild the view — now boon doors are open. Take the first.
      scene = buildZoneScene();
      const open = scene.doors.filter((d) => !d.locked);
      expect(open.length).toBeGreaterThan(0);
      open[0].action();
    }

    expect(sealedSeen).toBe(true);          // exits really did seal during fights
    expect(chambersEntered).toBe(3);        // all three chambers were entered
    expect(zoneActive()).toBe(false);       // run resolved
    expect(S.screen).toBe("ship");          // returned to the caller's screen
    expect(result?.won).toBe(true);
    expect(result?.chambersCleared).toBe(3);
    expect(S.credits).toBeGreaterThan(before); // salvage + completion bonus paid
  });
});

describe("seeded zone generator (Phase C)", () => {
  beforeEach(() => { loadScenario("fresh"); });

  it("is deterministic: same rngState → identical run", () => {
    S.rngState = 12345;
    const a = generateRun("derelict", 4);
    S.rngState = 12345;
    const b = generateRun("derelict", 4);
    expect(b).toEqual(a);
    expect(a.chambers.length).toBe(4);
  });

  it("ends every run on the biome boss chamber", () => {
    for (const biome of ["derelict", "silence", "raid"]) {
      S.rngState = 999;
      const run = generateRun(biome, 3);
      expect(run.chambers[run.chambers.length - 1].boss).toBe(true);
      expect(run.chambers.slice(0, -1).every((c) => !c.boss)).toBe(true);
    }
  });

  it("draws distinct rosters + stats per biome from the data", () => {
    S.rngState = 7;
    const kindsOf = (biome: string) => new Set(generateRun(biome, 4).chambers.flatMap((c) => c.enemies.map((e) => e.kind)));
    const derelict = kindsOf("derelict");
    const silence = kindsOf("silence");
    expect(derelict.has("warden")).toBe(true);   // boss archetype present
    expect(silence.has("cantor")).toBe(true);
    // The two biomes don't share a roster.
    expect([...derelict].some((k) => silence.has(k))).toBe(false);
    // Archetype stats come through: the derelict warden is beefier than a drone.
    const run = generateRun("derelict", 3);
    const warden = run.chambers.flatMap((c) => c.enemies).find((e) => e.kind === "warden")!;
    const drone = run.chambers.flatMap((c) => c.enemies).find((e) => e.kind === "drone")!;
    expect(warden.hp).toBeGreaterThan(drone.hp);
    expect(warden.size).toBeGreaterThan(drone.size);
    // Attack behaviour threads from the data: the boss is a boss, mooks aren't.
    expect(warden.behavior).toBe("boss");
    expect(drone.behavior).toBe("gunner");
  });

  it("falls back to a real biome when handed an unknown key", () => {
    S.rngState = 3;
    const run = generateRun("does-not-exist", 3);
    expect(run.chambers.length).toBe(3);
    expect(run.title.length).toBeGreaterThan(0);
  });
});

// Fully clear the current chamber and take its first open exit, mimicking the
// render → clear → pick loop the game runs. Returns when the run resolves.
function runIncursionToExtract() {
  let lastId = "", guard = 0;
  while (zoneActive() && guard++ < 20) {
    let scene = buildZoneScene();
    if (scene.id !== lastId) { walk.start(scene); lastId = scene.id; }
    if (walk.debugCombat().active) clearChamber();
    scene = buildZoneScene();
    const open = scene.doors.filter((d) => !d.locked);
    if (!open.length) break;
    open[0].action();
  }
}

describe("run boons (Phase D)", () => {
  beforeEach(() => { loadScenario("fresh"); walk.teardown(); });

  it("a boon door grows the gun beyond the default", () => {
    S.rngState = 42;
    startZone({ biome: "derelict", chambers: 3, vitality: 100, returnScreen: "ship" });
    const base = JSON.stringify(defaultMods());
    expect(JSON.stringify(zoneMods())).toBe(base);   // starts at the default gun

    // Clear chamber 0 and take its boon door (label carries the "name — desc").
    let scene = buildZoneScene();
    walk.start(scene);
    clearChamber();
    scene = buildZoneScene();
    const boon = scene.doors.find((d) => !d.locked && /—/.test(d.label));
    expect(boon).toBeTruthy();
    boon!.action();

    expect(JSON.stringify(zoneMods())).not.toBe(base); // the gun changed
  });
});

describe("stakes: injury + salvage loot (Phase D)", () => {
  it("an injury caps the next run's starting vitality", () => {
    loadScenario("fresh"); walk.teardown();
    S.flags.injuredUntil = S.day + 5;
    expect(captainInjured()).toBe(true);
    startZone({ biome: "derelict", chambers: 2, vitality: 100, returnScreen: "ship" });
    expect(buildZoneScene().combat?.vitality).toBe(72);   // 100 × .72
  });

  it("a cleared run banks salvage cargo and counts the clear", () => {
    loadScenario("trader"); walk.teardown();
    delete S.flags.injuredUntil;
    S.cargo = { ore: 0, med: 0, lux: 0 };                  // make hold room for salvage
    const cleared0 = S.flags.incursionsCleared ?? 0;
    S.rngState = 5;
    startZone({ biome: "derelict", chambers: 2, vitality: 100, returnScreen: "ship" });
    runIncursionToExtract();
    expect(zoneActive()).toBe(false);
    expect(S.flags.incursionsCleared).toBe(cleared0 + 1);
    expect(S.cargo.ore + S.cargo.med + S.cargo.lux).toBeGreaterThan(0);
  });

  it("a downed run leaves the captain injured for days", () => {
    loadScenario("fresh"); walk.teardown();
    delete S.flags.injuredUntil;
    startZone({ biome: "derelict", chambers: 2, returnScreen: "ship" });
    zoneBail();                                            // the downed bail-out
    expect(zoneActive()).toBe(false);
    expect(S.flags.injuredUntil).toBeGreaterThan(S.day);
    expect(captainInjured()).toBe(true);
  });
});

describe("world integration: derelict boarding (Phase E)", () => {
  beforeEach(() => { loadScenario("trader"); walk.teardown(); });

  it("boards a derelict into an incursion and returns to transit with the payout", () => {
    S.screen = "travel";
    const cr0 = S.credits, prestige0 = S.prestige;

    derelictBoard("raid");                 // the modal's "board" button
    expect(zoneActive()).toBe(true);
    expect(S.screen).toBe("zone");

    runIncursionToExtract();

    expect(zoneActive()).toBe(false);
    expect(S.screen).toBe("travel");       // dropped back into the flight
    expect(S.credits).toBeGreaterThan(cr0); // zone salvage banked
    expect(S.prestige).toBe(prestige0 + 1); // derelict onExit consequence
  });
});
