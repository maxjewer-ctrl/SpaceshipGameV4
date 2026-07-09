import type { GameState, ModuleInstance } from "./types";

export const SAVE_KEY = "kestrelrun";
export const SAVE_VERSION = 3;

// The single mutable game state. `export let` gives live bindings to importers;
// replace it only through setState so everyone sees the new object.
export let S: GameState = null as unknown as GameState;
export function setState(s: GameState) { S = s; }

export function mk(t: string): ModuleInstance { return { t, on: true, dmg: false }; }

export function newState(shipName: string): GameState {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    shipName: shipName || "Kestrel",
    day: 1, credits: 500, fuel: 30, food: 20, hull: 100, hullMax: 100, prestige: 0,
    engineLvl: 1, slotsMax: 6, loc: "solace", docked: true,
    screen: "ship", ptab: "cantina", sel: null, selPlanet: null,
    rep: { union: 0, frontier: 0, syndicate: 0 },
    modules: [mk("cockpit"), mk("engine"), mk("fueltank"), mk("cargohold")],
    cargo: { ore: 0, med: 0, lux: 0 },
    crew: [], jobs: [], logLines: [],
    market: null, travel: null,
    arc: { stage: 0, deadline: null, betrayed: false, ambushed: false, done: false },
    scheduled: [], ledger: [], npcs: [], flags: {},
    starve: 0, unpaid: 0, uid: 1, over: false, won: false, dead: false,
  };
}

export function log(msg: string) {
  S.logLines.unshift({ d: S.day, m: msg });
  if (S.logLines.length > 80) S.logLines.pop();
}

// A crew whisper — rendered dimmer in the log than a captain's-log entry.
export function whisper(msg: string) {
  S.logLines.unshift({ d: S.day, m: msg, bark: true });
  if (S.logLines.length > 80) S.logLines.pop();
}

export function save() {
  try { if (!S.over) localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* storage unavailable */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
}

// Save migration chain: each step upgrades one version. Old saves keep working forever.
export function migrate(s: any): GameState {
  // v1 (unversioned): modules stored as plain type strings, no seed/rng fields
  if (!s.version || s.version < 2) {
    if (s.modules && s.modules.length && typeof s.modules[0] === "string") {
      s.modules = s.modules.map((t: string) => ({ t, on: true, dmg: false }));
    }
    (s.modules || []).forEach((m: any) => {
      if (m.on === undefined) m.on = true;
      if (m.dmg === undefined) m.dmg = false;
    });
    if (s.seed === undefined) s.seed = (Date.now() ^ 0x2c1b3c6d) | 0;
    if (s.rngState === undefined) s.rngState = s.seed;
    s.version = 2;
  }
  // v3: engine primitives — the Consequence Scheduler, Memory Ledger, persistent
  // NPCs, and a flag bag. Old saves simply start with empty stores.
  if (s.version < 3) {
    if (!Array.isArray(s.scheduled)) s.scheduled = [];
    if (!Array.isArray(s.ledger)) s.ledger = [];
    if (!Array.isArray(s.npcs)) s.npcs = [];
    if (!s.flags || typeof s.flags !== "object") s.flags = {};
    // crew from v2 have no Tapestry bundle; that's fine — they just stay quiet.
    (s.crew || []).forEach((c: any) => { if (c.daysAboard === undefined) c.daysAboard = 0; });
    s.version = 3;
  }
  return s as GameState;
}

export function loadSaved(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}
