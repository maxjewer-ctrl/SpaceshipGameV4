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
}
export interface MissionGrant {
  kind: string; title: string; dest: string; pay: number;
  units?: number; hidden?: boolean; prestige?: number; rep?: [string, number];
  needs?: string[]; desc?: string; deadlineDays?: number;
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

// Merge hot-loaded content over the bundled baseline. Called by the content loader.
export function applyRemoteContent(patch: {
  barks?: BarkDef[]; riders?: Record<string, RiderDef>;
  rumors?: string[]; quiet?: string[];
}) {
  if (patch.barks && patch.barks.length) BARKS = patch.barks;
  if (patch.riders) RIDERS = { ...RIDERS, ...patch.riders };
  if (patch.rumors && patch.rumors.length) FLAVOR.rumors = patch.rumors;
  if (patch.quiet && patch.quiet.length) FLAVOR.quiet = patch.quiet;
}
