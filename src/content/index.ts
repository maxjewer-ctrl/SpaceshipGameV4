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
export interface RiderEffect {
  credits?: number; prestige?: number; food?: number; fuel?: number; hull?: number;
  rep?: [string, number]; flag?: string; value?: any; untilDays?: number;
  rumor?: string; log?: string;
  remember?: { who: string; fact: string; weight: number; note?: string };
  worldMemory?: { planet: string; fact: string; weight: number; note?: string };
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
