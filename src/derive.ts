// Pure derivations over the game state. No mutations here.
import { S } from "./state";
import { MODS, PLANETS } from "./content";
import type { ModuleInstance, ShipStats, Job } from "./types";

export function modInst(): ModuleInstance[] {
  return S.modules.filter((m) => !MODS[m.t].core);
}

export function stats(): ShipStats {
  const inst = (t: string) => S.modules.filter((m) => m.t === t).length;
  const intact = (t: string) => S.modules.filter((m) => m.t === t && !m.dmg).length;
  const active = (t: string) =>
    S.modules.filter((m) => m.t === t && !m.dmg && (MODS[m.t].pw ? m.on : true)).length;
  const has = (r: string) => S.crew.some((c) => c.role === r);
  const powerOut = 4 + 2 * S.engineLvl + intact("reactor") * 3;
  const powerUse = S.modules.reduce(
    (a, m) => a + (MODS[m.t].pw && m.on && !m.dmg ? MODS[m.t].pw! : 0), 0);
  const wDmg = active("weapons") * 8;
  return {
    inst, intact, active, has, powerOut, powerUse,
    fuelCap: intact("fueltank") * 40,
    cargoCap: intact("cargohold") * 20,
    scargoCap: intact("smuggler") * 10,
    paxCap: intact("cabin") * 2,
    vipCap: intact("luxcabin"),
    crewCap: intact("quarters") * 2,
    dmg: Math.round((wDmg > 0 ? wDmg : 2) * (has("gunner") ? 1.5 : 1)),
    shield: active("shields") * 4,
    foodGen: active("hydro") * 2,
    speed: [0, 70, 85, 100][S.engineLvl],
    fuelDay: +(4 * (has("pilot") ? 0.85 : 1)).toFixed(1),
  };
}

export function paxJobs(): Job[] { return S.jobs.filter((j) => j.pax && !j.vip); }
export function vipJobs(): Job[] { return S.jobs.filter((j) => j.pax && j.vip); }
export function people(): number { return 1 + S.crew.length + S.jobs.filter((j) => j.pax).length; }

export function foodPerDay(): number {
  const raw = people() * (stats().has("cook") ? 0.75 : 1);
  return Math.ceil(raw);
}

export function cargoUsed(): number {
  return (
    S.cargo.ore + S.cargo.med + S.cargo.lux +
    S.jobs.filter((j) => j.units && !j.hidden).reduce((a, j) => a + j.units!, 0)
  );
}
export function scargoUsed(): number {
  return S.jobs.filter((j) => j.units && j.hidden).reduce((a, j) => a + j.units!, 0);
}
export function salaries(): number { return S.crew.reduce((a, c) => a + c.salary, 0); }

export function dist(a: string, b: string): number {
  const A = PLANETS[a], B = PLANETS[b];
  return Math.hypot(A.x - B.x, A.y - B.y);
}
export function daysTo(from: string, to: string): number {
  return Math.max(1, Math.ceil(dist(from, to) / stats().speed));
}
export function fuelTo(from: string, to: string): number {
  return Math.ceil(daysTo(from, to) * stats().fuelDay);
}

export function bribeCost(base: number): number {
  return Math.round(base * (stats().has("quartermaster") ? 0.65 : 1));
}
