// Pure derivations over the game state. No mutations here.
import { S } from "./state";
import { MODS, PLANETS, ROLES } from "./content";
import { portPriceMult } from "./systems/port";
import { markScaled } from "./systems/modtier";
import type { ModuleInstance, ShipStats, Job } from "./types";

export function modInst(): ModuleInstance[] {
  return S.modules.filter((m) => !MODS[m.t].core);
}

// A crew member who saw their personal quest through grants a small stacking
// bonus on top of the flat role perk — earned, not bought.
export function perkActive(role: string): boolean {
  return S.crew.some((c) => c.role === role && c.perk);
}

// The captain personally covers their pre-command specialty until a real
// crew member of that role signs on — but a captain moonlighting below decks
// isn't fully captaining (see captainDoubleHatting).
export function crewCovers(role: string): boolean { return S.crew.some((c) => c.role === role); }
export function captainCovers(role: string): boolean { return S.captainRole === role && !crewCovers(role); }
export function captainDoubleHatting(): boolean { return S.captainRole !== null && !crewCovers(S.captainRole); }

// Roles nobody aboard covers at all — the ones that still trigger crew-gap
// damage control (systems/damagecontrol.ts) or lose their contract bonus.
export function uncoveredRoles(): string[] {
  const all = ["pilot", "mechanic", "gunner", "medic", "cook", "quartermaster"];
  return all.filter((r) => !crewCovers(r) && !captainCovers(r));
}

export function stats(): ShipStats {
  const inst = (t: string) => S.modules.filter((m) => m.t === t).length;
  const intact = (t: string) => S.modules.filter((m) => m.t === t && !m.dmg).length;
  const active = (t: string) =>
    S.modules.filter((m) => m.t === t && !m.dmg && (MODS[m.t].pw ? m.on : true)).length;
  // Capacity is the SUM of each instance's mark-scaled output, not a flat
  // count × base — a Mk-III cargo hold holds 40, a Mk-I holds 20 (systems/modtier).
  const sumIntact = (t: string, field: string) =>
    S.modules.filter((m) => m.t === t && !m.dmg).reduce((a, m) => a + markScaled(m, field as any), 0);
  const sumActive = (t: string, field: string) =>
    S.modules.filter((m) => m.t === t && !m.dmg && (MODS[m.t].pw ? m.on : true)).reduce((a, m) => a + markScaled(m, field as any), 0);
  const has = (r: string) => crewCovers(r) || captainCovers(r);
  const powerOut = 4 + 2 * S.engineLvl + sumIntact("reactor", "gen");
  const powerUse = S.modules.reduce(
    (a, m) => a + (MODS[m.t].pw && m.on && !m.dmg ? MODS[m.t].pw! : 0), 0);
  const wDmg = sumActive("weapons", "dmg");
  return {
    inst, intact, active, has, powerOut, powerUse,
    fuelCap: sumIntact("fueltank", "fuel"),
    cargoCap: sumIntact("cargohold", "cargo"),
    scargoCap: sumIntact("smuggler", "scargo"),
    paxCap: sumIntact("cabin", "pax"),
    vipCap: sumIntact("luxcabin", "vip"),
    crewCap: sumIntact("quarters", "crew"),
    dmg: Math.round((wDmg > 0 ? wDmg : 2) * (has("gunner") ? (perkActive("gunner") ? 1.65 : 1.5) : 1)),
    shield: sumActive("shields", "shield"),
    foodGen: sumActive("hydro", "food"),
    speed: [0, 70, 85, 100][S.engineLvl],
    fuelDay: +(4 * (has("pilot") ? (perkActive("pilot") ? 0.78 : 0.85) : 1)).toFixed(1),
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

// Hidden worlds reveal on their own story conditions.
export function planetVisible(k: string): boolean {
  const p = PLANETS[k];
  if (!p || !p.hidden) return !!p;
  if (k === "gate") return S.arc.stage >= 5;
  if (k === "anechoic") return !!S.flags.source_unlocked;
  return false;
}

// A silenced world is still on the chart — but nothing answers there.
export function isSilenced(k: string): boolean {
  return !!S.campaign && S.campaign.silence.silenced.includes(k);
}

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

// Rough pump price at a port — used for "can you even afford to leave"
// warnings. Ignores temporary discounts (guild echo, Bev's stall), which is
// fine since those only make leaving cheaper than this estimate.
export function fuelPriceAt(loc: string): number {
  return Math.max(1, Math.round(PLANETS[loc].fuelP * portPriceMult(loc)));
}

// Credits needed, right now, to buy enough fuel at the current port to reach
// a specific destination. 0 if the tank already holds enough.
export function fuelShortfallCost(destId: string): number {
  const short = Math.max(0, fuelTo(S.loc, destId) - S.fuel);
  return short <= 0 ? 0 : Math.ceil(short * fuelPriceAt(S.loc));
}

// Credits needed, right now, to buy enough fuel to leave this port for the
// *cheapest reachable* destination. 0 if already possible. Used to stop a
// captain from spending themselves into a port they can't afford to leave.
export function minDepartureCost(): number {
  const dests = Object.keys(PLANETS).filter((k) => k !== S.loc && planetVisible(k) && !isSilenced(k));
  if (!dests.length) return 0;
  return Math.min(...dests.map(fuelShortfallCost));
}

// Warnings surfaced before departure — so a crew gap is a choice you made,
// not an ambush the moment a coolant line lets go.
export function crewGapWarnings(): string[] {
  const out: string[] = [];
  const gaps = uncoveredRoles();
  const GAP_TXT: Record<string, string> = {
    pilot: "No pilot — meteor swarms become a manual gamble at the helm.",
    mechanic: "No mechanic — breakdowns become a hands-on scramble that costs hull and fuel.",
    medic: "No medic — a sick passenger means nursing them yourself, or their fare.",
    gunner: "No gunner — combat damage is down 50%.",
    cook: "No cook — rations burn 25% faster.",
    quartermaster: "No quartermaster — contracts pay 15% less, bribes cost more.",
  };
  for (const r of gaps) if (GAP_TXT[r]) out.push(GAP_TXT[r]);
  if (captainDoubleHatting()) {
    out.push(`You're still moonlighting as ship's ${ROLES[S.captainRole!].n.toLowerCase()} — hire one so you can captain properly (contracts pay 10% less until then).`);
  }
  return out;
}

export function bribeCost(base: number): number {
  const has = stats().has("quartermaster");
  return Math.round(base * (has ? (perkActive("quartermaster") ? 0.55 : 0.65) : 1));
}
