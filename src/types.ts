export interface ModuleDef {
  n: string; price: number; icon: string; d: string;
  core?: boolean;
  fuel?: number; cargo?: number; pax?: number; crew?: number;
  food?: number; dmg?: number; shield?: number; scargo?: number; vip?: number;
  pw?: number;   // reactor power drawn while online
  gen?: number;  // reactor power generated
}

export interface ModuleInstance { t: string; on: boolean; dmg: boolean; }

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
}

export interface Market {
  loc: string; day: number;
  missions: Job[]; recruits: CrewMember[];
  prices: Record<string, number>; rumors: string[];
}

export interface Travel { from: string; dest: string; total: number; left: number; }

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
  shipName: string;
  day: number; credits: number; fuel: number; food: number;
  hull: number; hullMax: number; prestige: number;
  engineLvl: number; slotsMax: number;
  loc: string; docked: boolean;
  screen: string; ptab: string;
  sel: number | null; selPlanet: string | null;
  rep: Record<string, number>;
  modules: ModuleInstance[];
  cargo: Record<string, number>;
  crew: CrewMember[];
  jobs: Job[];
  logLines: LogLine[];
  market: Market | null;
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
  campaign: CampaignState;
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
