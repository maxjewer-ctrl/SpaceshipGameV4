import type { GameState, ModuleInstance } from "./types";
import { DEFAULT_APPEARANCE } from "./ui/avatarDraw";
import { platform } from "./platform";

export const SAVE_KEY = "kestrelrun";
export const SAVE_VERSION = 16;

// The single mutable game state. `export let` gives live bindings to importers;
// replace it only through setState so everyone sees the new object.
export let S: GameState = null as unknown as GameState;
export function setState(s: GameState) { S = s; }

export function mk(t: string, mark = 1): ModuleInstance { return { t, on: true, dmg: false, mk: mark }; }

// New-game entropy: real entropy from the host, not Math.random — the seeded
// stream (src/rng.ts) owns every roll after this moment.
export function freshSeed(): number {
  return platform.entropy() | 0;
}

// `seed` is injectable so a run can be reproduced exactly. This matters more
// than it looks: the seed must be pinned BEFORE the first roll, because scenario
// builders and the opening market draw from the stream immediately. Pinning it
// afterwards (as the test harness used to) leaves the starting market and crew
// bundles randomised, which quietly broke every "reproduce it from the seed"
// promise we made. See test/golden/.
export function newState(shipName: string, seed: number = freshSeed()): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    barkTick: 0,
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
    market: null, usedMarket: null, travel: null,
    arc: { stage: 0, deadline: null, betrayed: false, ambushed: false, done: false },
    scheduled: [], ledger: [], npcs: [], flags: {},
    disposition: { mercy: 0, law: 0, daring: 0 },
    portStanding: {},
    campaign: { silence: { stage: 0, silenced: [], nextDay: null, nextWorld: null, billDay: null } },
    poi: [],
    portMood: {},
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

// ---- save slots + persistence ----
export const NUM_SLOTS = 3;
const slotKey = (slot: number) => `${SAVE_KEY}:slot${slot}`;
const ACTIVE_KEY = `${SAVE_KEY}:active`;

// Pure UI state — which screen you're looking at, which tab/row is selected.
// These are NOT saved: persisting them can reload you into a half-torn-down
// travel/planet screen, and they're trivially reconstructed from docked/travel.
const TRANSIENT_KEYS = ["screen", "ptab", "sel", "selPlanet"] as const;

function stripTransient(s: GameState): Record<string, unknown> {
  const { screen, ptab, sel, selPlanet, ...rest } = s as any;
  void screen; void ptab; void sel; void selPlanet;
  return rest;
}

// Reconstruct the transient view state a load deliberately dropped.
function applyLoadDefaults(s: any): GameState {
  s.screen = s.travel ? "travel" : "shipwalk";
  s.ptab = "cantina";
  s.sel = null;
  s.selPlanet = null;
  return s as GameState;
}

// Storage goes through the platform seam (src/platform.ts), never through
// localStorage directly: the browser is one host, a console is another. The
// adapter is also guaranteed not to throw — it degrades to in-memory when
// storage is blocked or full — so nothing here needs a try/catch any more.
const store = () => platform.storage;

export function activeSlot(): number {
  const v = Number(store().getItem(ACTIVE_KEY));
  return Number.isInteger(v) && v >= 0 && v < NUM_SLOTS ? v : 0;
}
export function setActiveSlot(slot: number) {
  store().setItem(ACTIVE_KEY, String(slot));
}

// One-time lift of the pre-slots single-key save into slot 0, so existing
// players keep their game when slots ship.
function migrateLegacySave() {
  const legacy = store().getItem(SAVE_KEY);
  if (!legacy) return;
  if (!store().getItem(slotKey(0))) store().setItem(slotKey(0), legacy);
  store().removeItem(SAVE_KEY);
}

export function save(slot = activeSlot()) {
  if (!S.over) store().setItem(slotKey(slot), JSON.stringify(stripTransient(S)));
}

// Clears the active slot (a scuttled/dead run shouldn't persist).
export function clearSave(slot = activeSlot()) {
  store().removeItem(slotKey(slot));
}

export interface SlotMeta {
  slot: number; empty: boolean;
  captainName?: string; shipName?: string; day?: number; credits?: number; prestige?: number; loc?: string;
}

// Summary of each slot for the load menu (never throws — a corrupt slot reads
// as empty rather than crashing the menu).
export function slotList(): SlotMeta[] {
  migrateLegacySave();
  const out: SlotMeta[] = [];
  for (let i = 0; i < NUM_SLOTS; i++) {
    const raw = store().getItem(slotKey(i));
    if (!raw) { out.push({ slot: i, empty: true }); continue; }
    // The try/catch that remains guards a CORRUPT slot, not storage: a save we
    // can't parse must read as empty rather than crash the load menu.
    try {
      const s = JSON.parse(raw);
      out.push({ slot: i, empty: false, captainName: s.captainName, shipName: s.shipName, day: s.day, credits: s.credits, prestige: s.prestige, loc: s.loc });
    } catch { out.push({ slot: i, empty: true }); }
  }
  return out;
}

export function deleteSlot(slot: number) {
  store().removeItem(slotKey(slot));
}

// Read + migrate a slot into a ready-to-run state (transients reconstructed).
// A corrupt or unmigratable save reads as "no save" rather than throwing.
export function loadSlot(slot: number): GameState | null {
  migrateLegacySave();
  const raw = store().getItem(slotKey(slot));
  if (!raw) return null;
  try {
    return applyLoadDefaults(migrate(JSON.parse(raw)));
  } catch {
    return null;
  }
}

// Serialize the current run for the player to download (transients stripped).
export function exportSave(): string {
  return JSON.stringify(stripTransient(S), null, 2);
}

// Import a downloaded save: parse, sanity-check it looks like a GameState,
// migrate it forward, and write it to a slot. Returns the loaded state, or
// null if the blob isn't a plausible save.
export function importSave(json: string, slot = activeSlot()): GameState | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || typeof parsed.day !== "number" || !Array.isArray(parsed.modules)) return null;
    const migrated = applyLoadDefaults(migrate(parsed));
    store().setItem(slotKey(slot), JSON.stringify(stripTransient(migrated)));
    setActiveSlot(slot);
    return migrated;
  } catch {
    return null;
  }
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
    if (s.seed === undefined) s.seed = (platform.entropy() ^ 0x2c1b3c6d) | 0;
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
  // v11: module quality marks + the regenerated second-hand rack cache.
  if (s.version < 11) {
    (s.modules || []).forEach((m: any) => { if (m.mk === undefined) m.mk = 1; });
    if (s.usedMarket === undefined) s.usedMarket = null;
    s.version = 11;
  }
  // v12: charted points of interest (survey contracts). Old saves have an empty
  // chart — nothing discovered yet.
  if (s.version < 12) {
    if (!Array.isArray(s.poi)) s.poi = [];
    s.version = 12;
  }
  // v13: station moods (boom/shortage/lockdown/festival). Old saves start with
  // every port in its ordinary condition.
  if (s.version < 13) {
    if (!s.portMood || typeof s.portMood !== "object") s.portMood = {};
    s.version = 13;
  }
  // v14: saves already migrated to station moods before the second-hand rack
  // existed still need the regenerated used-market cache field.
  if (s.version < 14) {
    if (s.usedMarket === undefined) s.usedMarket = null;
    s.version = 14;
  }
  // v15: the cosmetic (bark) RNG counter moves into the save. It was a
  // module-global in barks.ts, so the crew chatter a save produced depended on
  // how many barks had fired earlier in the process rather than on the save
  // itself — the one thing it was documented NOT to do. Old saves resume the
  // stream from 0; they'll hear a slightly different next line than they would
  // have, which is the correct trade for chatter that's reproducible forever after.
  if (s.version < 15) {
    if (typeof s.barkTick !== "number") s.barkTick = 0;
    s.version = 15;
  }
  // v16: captain model choice. Existing saves keep the original explorer.
  if (s.version < 16) {
    if (!s.appearance || typeof s.appearance !== "object") s.appearance = { ...DEFAULT_APPEARANCE };
    if (!s.appearance.model) s.appearance.model = "explorer";
    s.version = 16;
  }
  return s as GameState;
}

// Boot-time load: the active slot (lifting any pre-slots legacy save first).
export function loadSaved(): GameState | null {
  migrateLegacySave();
  return loadSlot(activeSlot());
}
