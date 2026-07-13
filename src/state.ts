import type { GameState, ModuleInstance } from "./types";
import { DEFAULT_APPEARANCE } from "./ui/avatarDraw";

export const SAVE_KEY = "kestrelrun";
export const SAVE_VERSION = 10;

// The single mutable game state. `export let` gives live bindings to importers;
// replace it only through setState so everyone sees the new object.
export let S: GameState = null as unknown as GameState;
export function setState(s: GameState) { S = s; }

export function mk(t: string): ModuleInstance { return { t, on: true, dmg: false }; }

export function newState(shipName: string): GameState {
  // New-game entropy: crypto, not Math.random — the seeded stream (src/rng.ts)
  // owns every roll after this moment.
  const seed = (crypto.getRandomValues(new Int32Array(1))[0] ^ Date.now()) | 0;
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    shipName: shipName || "Kestrel",
    day: 1, credits: 500, fuel: 30, food: 20, hull: 100, hullMax: 100, prestige: 0,
    engineLvl: 1, slotsMax: 14, loc: "solace", docked: true,
    captainName: "Cass Ardent",
    appearance: { ...DEFAULT_APPEARANCE },
    captainRole: null,
    screen: "shipwalk", ptab: "cantina", sel: null, selPlanet: null,
    rep: { union: 0, frontier: 0, syndicate: 0 },
    modules: [
      mk("cockpit"), mk("engine"),
      mk("fueltank"), mk("cargohold"), mk("medbay"), mk("cabin"),
      mk("quarters"), mk("hydro"), mk("weapons"), mk("shields"),
      mk("armory"), mk("workshop"), mk("smuggler"), mk("luxcabin"),
    ],
    cargo: { ore: 0, med: 0, lux: 0 },
    crew: [], jobs: [], logLines: [],
    market: null, travel: null,
    arc: { stage: 0, deadline: null, betrayed: false, ambushed: false, done: false },
    scheduled: [], ledger: [], npcs: [], flags: {},
    disposition: { mercy: 0, law: 0, daring: 0 },
    portStanding: {},
    campaign: { silence: { stage: 0, silenced: [], nextDay: null, nextWorld: null, billDay: null } },
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
  // v4: hidden playstyle disposition meters. Old saves start neutral.
  if (s.version < 4) {
    if (!s.disposition || typeof s.disposition !== "object") s.disposition = { mercy: 0, law: 0, daring: 0 };
    s.version = 4;
  }
  // v5: campaigns (the Long Silence + the Reckoning gate).
  if (s.version < 5) {
    if (!s.campaign || typeof s.campaign !== "object") {
      s.campaign = { silence: { stage: 0, silenced: [], nextDay: null, nextWorld: null, billDay: null } };
    }
    // The Reckoning reads this flag; grant it to saves that already resolved Voss.
    if (s.arc && (s.arc.done || s.arc.betrayed)) s.flags.arc_resolved = true;
    s.version = 5;
  }
  // v6: crew dialogue — what's been revealed, and where a resolved want points.
  if (s.version < 6) {
    (s.crew || []).forEach((c: any) => {
      if (!c.revealed || typeof c.revealed !== "object") c.revealed = {};
      if (c.questStage === undefined) c.questStage = 0;
      if (c.questDest === undefined) c.questDest = null;
      if (c.perk === undefined) c.perk = false;
    });
    s.version = 6;
  }
  // v7: the captain's own pre-command specialty. Older saves never chose one —
  // grandfather them as null so behavior is unchanged (no coverage, no penalty).
  if (s.version < 7) {
    if (s.captainRole === undefined) s.captainRole = null;
    s.version = 7;
  }
  // v8: captain identity — name + character-creator appearance. Older saves get
  // the default look so their walking sprite renders.
  if (s.version < 8) {
    if (!s.captainName) s.captainName = "Cass Ardent";
    if (!s.appearance || typeof s.appearance !== "object") s.appearance = { ...DEFAULT_APPEARANCE };
    s.version = 8;
  }
  // v9: per-station standing. Old saves start every port neutral.
  if (s.version < 9) {
    if (!s.portStanding || typeof s.portStanding !== "object") s.portStanding = {};
    s.version = 9;
  }
  // v10: Juno Vale's prologue crew record didn't carry a portrait `key` —
  // saves started before that field existed show her as an icon fallback.
  if (s.version < 10) {
    (s.crew || []).forEach((c: any) => { if (c.name === "Juno Vale" && !c.key) c.key = "juno"; });
    s.version = 10;
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
