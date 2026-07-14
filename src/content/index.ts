// Content lives as data, not code. These JSON files share the exact schema the
// Supabase content_* tables will use in Phase 1 — the game hot-loads either.
import type { ModuleDef, PlanetDef, GoodDef, FactionDef, RoleDef, MotiveDef } from "../types";
import modulesJson from "./modules.json";
import planetsJson from "./planets.json";
import worldJson from "./world.json";
import namesJson from "./names.json";
import flavorJson from "./flavor.json";
import barksJson from "./barks.json";
import crewgenJson from "./crewgen.json";
import ridersJson from "./riders.json";
import reputationJson from "./reputation.json";
import npcsJson from "./npcs.json";
import charactersJson from "./characters.json";
import stationsJson from "./stations.json";
import portjobsJson from "./portjobs.json";
import zonesJson from "./zones.json";

export const MODS = modulesJson as Record<string, ModuleDef>;
export const PLANETS = planetsJson as Record<string, PlanetDef>;
export const GOODS = worldJson.goods as Record<string, GoodDef>;
export const FACS = worldJson.factions as Record<string, FactionDef>;
export const ROLES = worldJson.roles as Record<string, RoleDef>;
export const MOTIVES = worldJson.motives as Record<string, MotiveDef>;
export const NAMES = namesJson as {
  first: string[]; last: string[]; vips: string[]; bounties: string[]; freight: string[];
};
export const FLAVOR = flavorJson as {
  quiet: string[]; rumors: string[]; dmgFlavor: Record<string, string>; depart: string[];
};

// ---- Phase "Souls & Consequences" content (Supabase content_* tables mirror this shape) ----
export interface BarkDef {
  when: string; text: string;
  traits?: string[]; role?: string; secretTag?: string; wound?: string;
  origin?: string; sentimentMin?: number; sentimentMax?: number;
  // world-state gates — let ambient chatter forward the plot as it unfolds
  silMin?: number;   // Long Silence stage at least N
  arcMin?: number;   // Voss arc stage at least N
  flag?: string;     // requires S.flags[flag]
  loc?: string;      // only at this planet
}
export interface MissionGrant {
  kind: string; title: string; dest: string; pay: number;
  units?: number; hidden?: boolean; prestige?: number; rep?: [string, number];
  needs?: string[]; desc?: string; deadlineDays?: number; tier?: number;
  pax?: { name: string; motive: string };
  tag?: string;  // completion sets flags["job_<tag>"]
}
export interface RiderEffect {
  credits?: number; prestige?: number; food?: number; fuel?: number; hull?: number;
  rep?: [string, number]; flag?: string; value?: any; untilDays?: number;
  rumor?: string; log?: string;
  remember?: { who: string; fact: string; weight: number; note?: string };
  worldMemory?: { planet: string; fact: string; weight: number; note?: string };
  // scene/NPC vocabulary
  dispo?: { axis: string; n: number };
  mission?: MissionGrant;
  plantRider?: { min: number; max: number; key: string };
  npc?: { key: string; name: string; disposition: number; agenda?: string; power?: number };
  recruit?: { role: string; name: string; salary?: number; key?: string };
  // per-station standing nudge at the current port, and a location-stamped
  // set-dressing mark (see systems/port.ts)
  standing?: number;
  portMark?: string;
}

// ---- Named recruitable characters (the twelve — see docs/CREW_DOSSIERS.md) ----
export interface CharacterDef {
  name: string; role: string; fee: number; salary: number;
  planets: string[];        // home worlds whose cantinas can surface them ([] = scene-only)
  agenda: string;           // honest/dishonest design intent — future agenda beats read this
  hook: string;             // one-line dossier summary
  bundle: {
    origin: string; want: string;
    wound: string; woundTag: string;
    secret: string; secretTag: string;
    tell: string; tellSituation: string;
    traits: string[];
  };
}

// ---- Station scenes (data-driven NPC dialogue) ----
export interface SceneChoice {
  label: string;
  requires?: Record<string, any>;   // pax, credits, rep, dispo, flag, flagNot...
  effects?: RiderEffect[];
  reply?: string;                   // NPC's response line before moving on
  goto?: string;                    // next node key
  end?: boolean;                    // close the scene
}
export interface SceneNode { text: string; choices: SceneChoice[]; }
export interface NpcDef {
  name: string; room: string; icon?: string;
  planets?: string[] | "any";
  gate?: Record<string, any>;       // conditions for the NPC to appear at all
  blurb?: string;                   // one-liner shown on the station map / room list
  nodes: Record<string, SceneNode>;
}
export interface RiderDef {
  class: string; title?: string; text?: string; log?: string;
  effects?: RiderEffect[];
  combat?: { name: string; hull: number; dmg: number; loot?: number };
}
export interface CrewGen {
  traits: string[]; origins: string[]; wants: string[];
  wounds: { tag: string; text: string }[];
  secrets: { tag: string; text: string }[];
  tells: { situation: string; text: string }[];
}

// These three are content-hot-loadable: bundled JSON is the offline baseline,
// but the Supabase loader can override them at boot (see src/supabase/content.ts).
export interface ReputationContent {
  titles: Record<string, string[]>;
  street: Record<string, string[]>;
  crossing: Record<string, string[]>;
}

export let BARKS = barksJson as BarkDef[];
export let RIDERS = ridersJson as Record<string, RiderDef>;
export const CREWGEN = crewgenJson as CrewGen;
export const REPUTATION = reputationJson as ReputationContent;
export let NPCS = npcsJson as Record<string, NpcDef>;
export const CHARACTERS = charactersJson as Record<string, CharacterDef>;

// ---- Per-port station identity (docs/STATION_IDENTITY.md) ----
// Shared walk engine, unique content: each port filters the common room set,
// relabels services, overrides room prose, and may add one signature room.
export interface StationSignature {
  id: string; label: string; icon: string; color: string;
  sound: string;            // existing audio room kind to borrow ambience from
  link: string;             // which common room its corridor connects to
  desc: string;
  dark?: string;            // prose when the port is silenced
}
export interface StationDef {
  drop?: string[];                    // common rooms this port doesn't have
  labels?: Record<string, string>;    // per-room label overrides
  desc?: Record<string, string>;      // per-room prose overrides
  signature?: StationSignature;
}
export const STATIONS = stationsJson as Record<string, StationDef>;

// ---- Per-port signature job templates (docs/STATION_IDENTITY.md) ----
// A port's economy has a face too: local work that fits its vibe, mixed into
// the otherwise-generic board. genLocalMission() (market.ts) expands these.
export interface PortJobTemplate {
  kind: string; title: string; weight?: number;
  units?: [number, number];           // roll range; absent = no cargo units
  payFlat: number; payPerUnit?: number; payPerDay?: number;
  prestige?: number; minPrestige?: number; rep?: [string, number];
  needs?: string[];                    // "{units}" expands to the rolled count
  hidden?: boolean; vip?: boolean; paxMotive?: string;
  deadlineDays?: [number, number];
  desc: string;                        // {dest} {units} {deadline} placeholders
}
export const PORTJOBS = portjobsJson as unknown as Record<string, PortJobTemplate[]>;

// ---- Combat zones (docs/COMBAT_ZONES.md) ----
// A biome is a foot-combat setting: an enemy archetype table (stats the walk
// sim reads per hostile), chamber templates (weighted spawn groups), a boss
// template, and reward ranges. systems/zonegen.ts assembles a seeded run from
// these; ui/zonewalk.ts stages it as chambers.
export interface ZoneEnemyDef {
  hp: number; speed: number; fireGap: number; shotDmg: number;
  touchDmg: number; range: number; size: number; color: string;
}
export interface ZoneSpawnGroup { type: string; min: number; max: number; }
export interface ZoneChamberDef { spawns: ZoneSpawnGroup[]; }
export interface ZoneBiomeDef {
  title: string;
  enemies: Record<string, ZoneEnemyDef>;
  chambers: Record<string, ZoneChamberDef>;
  boss: ZoneChamberDef;
  pool: string[];
  rewards: { credits: [number, number]; heal: [number, number] };
}
export const ZONES = zonesJson as unknown as { biomes: Record<string, ZoneBiomeDef> };

// Merge hot-loaded content over the bundled baseline. Called by the content
// loader. MERGE, never replace: bundled JSON is the baseline (per the loader's
// contract) — a stale remote copy must not erase newer bundled content. Remote
// rows that duplicate bundled ones de-dupe away; genuinely new ones append.
export function applyRemoteContent(patch: {
  barks?: BarkDef[]; riders?: Record<string, RiderDef>;
  rumors?: string[]; quiet?: string[];
}) {
  if (patch.barks && patch.barks.length) {
    const seen = new Set(BARKS.map((b) => b.when + "|" + b.text));
    BARKS = [...BARKS, ...patch.barks.filter((b) => !seen.has(b.when + "|" + b.text))];
  }
  if (patch.riders) RIDERS = { ...RIDERS, ...patch.riders };
  if (patch.rumors && patch.rumors.length) {
    for (const r of patch.rumors) if (!FLAVOR.rumors.includes(r)) FLAVOR.rumors.push(r);
  }
  if (patch.quiet && patch.quiet.length) {
    for (const q of patch.quiet) if (!FLAVOR.quiet.includes(q)) FLAVOR.quiet.push(q);
  }
}
