export interface ModuleDef {
  n: string; price: number; icon: string; d: string;
  core?: boolean;
  fuel?: number; cargo?: number; pax?: number; crew?: number;
  food?: number; dmg?: number; shield?: number; scargo?: number; vip?: number;
  pw?: number;   // reactor power drawn while online
  gen?: number;  // reactor power generated
}

// wear 0-100: accrues in flight, drives RELIABILITY (worn modules break first,
// failing ones quit on their own schedule). Reset by a dry-dock refit — the
// ship is never finished, only currently holding together.
// `slot` is the module's bay position on the deck (0..slotsMax-1), set when
// installed and rearranged from the ship schematic; missing on old saves
// until ensureSlots() deals one out.
// mk: quality mark 1/2/3 (Mk-I default). Higher marks scale the module's
// output; see systems/modtier.ts. Absent = Mk-I (pre-tiers saves).
export interface ModuleInstance { t: string; on: boolean; dmg: boolean; wear?: number; slot?: number; mk?: number; }

// The captain's chosen look — set in the character creator, drawn by the shared
// avatar renderer (ui/avatarDraw.ts) for both the preview and the walking sprite.
export interface Appearance {
  head: string;   // HEADS id: human | saurian | insectoid | cyclops | avian | synth
  garb: string;   // GARBS id: jumpsuit | coat | armor
  frame?: string; // body presentation: feminine | masculine | neutral
  model?: string; // captain model id: explorer | female-explorer | alien-explorer
  skin: string;   // hex — head/skin color
  suit: string;   // hex — clothing color
  trim: string;   // hex — accent/trim/outline
}

export interface PlanetDef {
  n: string; x: number; y: number; fac: string;
  fuelP: number; foodP: number; tag: string; d: string;
  goods: Record<string, number>;
  hidden?: boolean; yard?: number;
}

export interface GoodDef { n: string; base: number; }
export interface FactionDef { n: string; c: string; }
export interface RoleDef { n: string; d: string; }
export interface MotiveDef { hint: string; d: string; }

// The hidden "Tapestry" bundle every crew member carries. The game NEVER shows
// this sheet — it leaks through barks, tells, and personal-quest triggers.
export interface CrewBundle {
  origin: string;   // where they're from — colours their barks
  want: string;     // the thing they're chasing — matures into a personal quest
  wound: string;    // what hurt them — surfaces around related modules/events
  woundTag: string;
  secret: string;   // a landmine keyed to a tag (e.g. "union_deserter")
  secretTag: string;
  tell: string;     // the behavioural giveaway that fires as a bark in-context
  tellSituation: string; // which situation the tell fires in (e.g. "patrol")
  traits: string[]; // 2 personality tags from the corpus — gate which barks fire
}

// What they've actually told the captain — gates which Tapestry fields the
// dialogue system has leaked so far. Distinct from the bundle itself, which
// always exists the moment they're generated.
export interface CrewRevealed { origin?: boolean; want?: boolean; wound?: boolean; }

export interface CrewMember {
  id: number; name: string; role: string; fee: number; salary: number;
  key?: string;          // named roster character (content/characters.json)
  bundle?: CrewBundle;
  daysAboard?: number;   // veterancy tick, drives loyalty & quest timing
  questStage?: number;   // personal-quest progress: 0 dormant, 1 opened, 2 pointed at a world, 3 resolved
  revealed?: CrewRevealed;
  questDest?: string | null;  // world their personal quest points to, once stage 2
  perk?: boolean;              // resolved their quest well — grants a small stacking bonus on their role
  eventsInRole?: number;       // times they've done their job under real pressure — see systems/veterancy.ts
}

export interface Passenger { name: string; motive: string; sick: boolean; arc?: boolean; }

export interface Job {
  id: number; kind: string; title: string; dest: string; pay: number;
  desc?: string; prestige?: number; rep?: [string, number]; needs?: string[];
  units?: number; hidden?: boolean; deadline?: number;
  pax?: Passenger; vip?: boolean; tier?: number; minPrestige?: number;
  arcCrate?: boolean; arcVoss?: boolean;
  // On completion, sets flags["job_<tag>"] — how campaign missions report back.
  tag?: string;
  // Survey/charting contract (kind:"survey"): a coordinate to take readings at,
  // reached en route to `dest` (the deliverable port). `surveyed` flips true the
  // moment the find-scene fires mid-journey; the charting fee pays on docking.
  sx?: number; sy?: number; surveyed?: boolean;
}

// A charted point of interest — the player's own mark on the sector map. Found
// by running a survey contract; persists forever, turning the chart into a
// diary. A "seam" pays passive royalties each time you make port.
export interface PoiMark {
  id: number; x: number; y: number;
  kind: "seam" | "derelict" | "beacon";
  name: string; day: number; note?: string;
}

// A station's current condition — distinct from portStanding (how a port
// feels about YOU). Mood is what condition the port itself is in right now,
// driven by events and deliveries, not accumulated reputation. Temporary:
// expires on `until` (a day number), same convention as riderEffect flags.
export type PortMood = "boom" | "shortage" | "lockdown" | "festival";
export interface PortMoodState { mood: PortMood; until: number; cause?: string; }

export interface Market {
  loc: string; day: number;
  missions: Job[]; recruits: CrewMember[];
  prices: Record<string, number>; rumors: string[];
}

// The second-hand rack (systems/usedmarket.ts): one salvaged module for sale,
// cheaper than yard-new but carrying pre-existing wear and a provenance story.
export interface UsedItem { id: number; t: string; wear: number; price: number; story: string; }
// `day` = the day this stock was generated; it holds for a 3-day restock
// window so it's stable across a dock visit and can't be wait-scummed cheaply.
export interface UsedMarket { loc: string; day: number; label: string; items: UsedItem[]; }

// evd: did anything happen this leg yet? Quiet short hops force one event on
// their final day — dead air teaches players that travel is a loading screen.
export interface Travel { from: string; dest: string; total: number; left: number; evd?: boolean; }

export interface ArcState {
  stage: number; deadline: number | null;
  betrayed: boolean; ambushed: boolean; done: boolean;
}

export interface LogLine { d: number; m: string; bark?: boolean; }

// The three tracked playstyle axes. Positive/negative poles:
//   mercy:  + merciful (spare, rescue, protect)   − ruthless (execute, abandon, sell out)
//   law:    + lawful (clean, comply)              − outlaw (smuggle, bribe, shoot patrols)
//   daring: + daring (long odds, deep runs)       − cautious (flee, bribe, play safe)
export interface Disposition { mercy: number; law: number; daring: number; }

// ---- Engine primitive 1: the Consequence Scheduler ----
// A seed planted now that sprouts later. This is the entire mechanism of
// "unexpected payoff": missions plant riders, the scheduler fires them.
export interface FireWhen { day?: number; dock?: string; flag?: string; }
export interface ScheduledEvent {
  id: number;
  fireWhen: FireWhen;
  eventKey: string;      // resolves to a rider in content/riders.json
  payload?: Record<string, any>;
  planted: number;       // day it was planted (for prose: "30 days ago...")
}

// ---- Engine primitive 2: the Memory Ledger ----
// Discrete remembered facts with emotional weight — checks read memories, not
// just meters, and can cite them back to you in prose.
export interface MemoryEntry {
  who: string;           // "crew:<id>" | "world:<planet>" | "npc:<key>" | "captain"
  fact: string;
  weight: number;        // + fondness, − grievance
  day: number;
  note?: string;         // human-readable line the game can quote later
}

// Persistent named NPCs — grudges & guardian angels that tick over time.
export interface NpcRecord {
  key: string; name: string;
  disposition: number;   // + ally, − enemy
  agenda: string;        // "rearm" | "reward" | "dormant"
  power: number;         // escalates for enemies over time
  day: number;           // last-updated day
}

// ---- Campaigns ----
// The Long Silence (main): stage 0 dormant → 1 gathering → 2 the dimming →
// 3 source known → 4 resolved. Knowledge fragments live in flags as sk_*;
// endings live in flags as silence_answered / silence_stilled / silence_sold.
export interface SilenceCampaign {
  stage: number;
  silenced: string[];          // planet keys currently dark
  nextDay: number | null;      // when the next world goes quiet
  nextWorld: string | null;
  billDay: number | null;      // the sold ending's deferred price
}
export interface CampaignState { silence: SilenceCampaign; }

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  // Counter for the cosmetic (bark) RNG side-stream. Lives in the save on
  // purpose: it used to be a module-global in barks.ts, which meant the crew
  // chatter you got depended on how many barks had fired earlier in the
  // PROCESS, not on your save. Loading the same save twice gave different
  // chatter, and no run truly reproduced. See systems/barks.ts.
  barkTick: number;
  shipName: string;
  day: number; credits: number; fuel: number; food: number;
  hull: number; hullMax: number; prestige: number;
  engineLvl: number; slotsMax: number;
  loc: string; docked: boolean;
  captainName: string;
  appearance: Appearance;
  // The captain's own pre-command specialty. They can cover that one station
  // personally — but a captain below decks isn't captaining (contract pay
  // penalty until the role is hired).
  captainRole: string | null;
  screen: string; ptab: string;
  sel: number | null; selPlanet: string | null;
  rep: Record<string, number>;
  modules: ModuleInstance[];
  cargo: Record<string, number>;
  crew: CrewMember[];
  jobs: Job[];
  logLines: LogLine[];
  market: Market | null;
  usedMarket: UsedMarket | null;
  travel: Travel | null;
  arc: ArcState;
  // engine primitives
  scheduled: ScheduledEvent[];
  ledger: MemoryEntry[];
  npcs: NpcRecord[];
  flags: Record<string, any>;
  // hidden playstyle meters — how you operate, not what you own. Content reads
  // these; the player never sees the raw numbers, only "word on the street".
  disposition: Disposition;
  // Per-station standing (NOT faction): how a specific port feels about you,
  // moved by what you do there and for it. Read for fees, contracts, prose.
  // Clamped -10..10. Absent key = neutral (0).
  portStanding: Record<string, number>;
  campaign: CampaignState;
  // Charted points of interest — the player's marks, discovered via survey
  // contracts. The map reads this to render the "diary"; seams pay royalties.
  poi: PoiMark[];
  // Current condition of visited ports (boom/shortage/lockdown/festival),
  // keyed by planet id. Absent = ordinary. See systems/moods.ts.
  portMood: Record<string, PortMoodState>;
  starve: number; unpaid: number; uid: number;
  over: boolean; won: boolean; dead: boolean;
}

export interface Enemy {
  name: string; hull: number; dmg: number;
  bribe?: number; loot?: number; maxhull?: number;
}

export interface ShipStats {
  inst: (t: string) => number;
  intact: (t: string) => number;
  active: (t: string) => number;
  has: (role: string) => boolean;
  powerOut: number; powerUse: number;
  fuelCap: number; cargoCap: number; scargoCap: number;
  paxCap: number; vipCap: number; crewCap: number;
  dmg: number; shield: number; foodGen: number;
  speed: number; fuelDay: number;
}
