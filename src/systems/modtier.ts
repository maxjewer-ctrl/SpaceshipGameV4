// Module quality marks (Mk-I / II / III). A module of a higher mark does more
// per slot for more credits, so a "finished" ship is never actually finished —
// there's always the next mark to chase, which keeps income circulating (the
// economy-ceiling fix from CORE_LOOP.md pillar 1). Power draw is deliberately
// left the same across marks: a higher mark is strictly better per slot AND per
// watt, which is the point of buying it.
import { MODS, PLANETS } from "../content";
import type { ModuleInstance } from "../types";

export const MIN_MARK = 1;
export const MAX_MARK = 3;
export const markLabel = (mk: number) => ["", "I", "II", "III"][mk] || "I";

// Output scales 1.0 / 1.5 / 2.0; price scales 1.0 / 2.2 / 4.0 — higher marks
// cost far more than they yield linearly, so they're an aspirational sink, not
// an obvious auto-buy.
const OUT = [0, 1.0, 1.5, 2.0];
const PRICE = [0, 1.0, 2.2, 4.0];

export const markOf = (m: ModuleInstance): number => {
  const mk = m.mk || 1;
  return mk < MIN_MARK ? MIN_MARK : mk > MAX_MARK ? MAX_MARK : mk;
};

// A module's tier-scaled numeric field (fuel/cargo/dmg/shield/…), rounded to a
// whole unit. Passive base values live in MODS; this applies the mark factor.
export function markScaled(m: ModuleInstance, field: keyof typeof MODS[string]): number {
  const base = (MODS[m.t] as any)[field];
  if (typeof base !== "number") return 0;
  return Math.round(base * OUT[markOf(m)]);
}

// Sticker price of a given type at a given mark, before port yard discount.
export function markPrice(t: string, mk: number): number {
  return Math.round(MODS[t].price * PRICE[mk < MIN_MARK ? MIN_MARK : mk > MAX_MARK ? MAX_MARK : mk]);
}

// The best mark this port's yard stocks. Foundry — "cheapest and best shipyard
// in the sector" — is the only place that fits Mk-III, giving the late game a
// concrete destination; everywhere else tops out at Mk-II. A world with no
// shipyard bonus and no drydock room could be restricted further later.
export function yardMaxMark(loc: string): number {
  if (loc === "foundry") return 3;
  return 2;
}

// Which marks a port offers for sale (Mk-I always; up to the yard's max).
export function marksAt(loc: string): number[] {
  const max = yardMaxMark(loc);
  const out: number[] = [];
  for (let mk = MIN_MARK; mk <= max; mk++) out.push(mk);
  return out;
}

void PLANETS; // referenced for future per-port yard-tier data
