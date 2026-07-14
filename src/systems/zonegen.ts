// Seeded incursion generator (Phase C of docs/COMBAT_ZONES.md). Turns a biome
// (data, from content/zones.json) into a concrete run: a chain of chambers,
// each a flat list of stat-carrying enemies, ending in the biome's boss. Pure
// data → data; all randomness comes from the seeded stream in rng.ts, so a
// pinned rngState reproduces a run exactly.
import { ZONES } from "../content";
import type { ZoneChamberDef, ZoneBiomeDef } from "../content";
import { rand, ri, pick } from "../rng";

// One placed-elsewhere enemy: archetype stats resolved, position assigned later
// by the stager (ui/zonewalk.ts owns the arena geometry).
export interface GenEnemy {
  kind: string; hp: number; speed: number; fireGap: number;
  shotDmg: number; touchDmg: number; range: number; size: number; color: string;
}
export interface GenChamber { enemies: GenEnemy[]; boss: boolean; }
export interface GenRun {
  biome: string; title: string; chambers: GenChamber[];
  rewards: { credits: [number, number]; heal: [number, number] };
}

function biomeOf(key: string): { key: string; def: ZoneBiomeDef } {
  const def = ZONES.biomes[key];
  if (def) return { key, def };
  const fallback = Object.keys(ZONES.biomes)[0];
  return { key: fallback, def: ZONES.biomes[fallback] };
}

function resolveChamber(def: ZoneChamberDef, biome: ZoneBiomeDef, boss: boolean): GenChamber {
  const enemies: GenEnemy[] = [];
  for (const g of def.spawns) {
    const arche = biome.enemies[g.type];
    if (!arche) continue; // guarded by the content lint; skip defensively
    const count = ri(g.min, g.max);
    for (let i = 0; i < count; i++) enemies.push({ kind: g.type, ...arche });
  }
  return { enemies, boss };
}

// Assemble a run of `chambers` (default 3–4): the last is the biome boss, the
// rest drawn from its weighted pool.
export function generateRun(biomeKey: string, chambers?: number): GenRun {
  const { key, def } = biomeOf(biomeKey);
  const n = chambers ?? (3 + Math.floor(rand() * 2));
  const out: GenChamber[] = [];
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const tmpl = last ? def.boss : def.chambers[pick(def.pool)];
    out.push(resolveChamber(tmpl, def, last));
  }
  return { biome: key, title: def.title, chambers: out, rewards: def.rewards };
}
