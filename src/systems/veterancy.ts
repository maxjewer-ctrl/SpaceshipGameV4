// Veterancy — a crew member's rank in their role, earned by time aboard AND
// doing the job under real pressure (a dodge, a save, a repair, a clean
// delivery), not just riding along. Mirrors trust.ts: rank is fully derived
// from daysAboard + eventsInRole, never stored itself, so nothing needs a
// save migration when the curve changes.
import type { CrewMember } from "../types";
import { bark } from "./barks";

export type Rank = 1 | 2 | 3;
export const RANK_NAME: Record<Rank, string> = { 1: "Green", 2: "Seasoned", 3: "Veteran" };

const RANK2_DAYS = 10, RANK2_EVENTS = 3;
const RANK3_DAYS = 25, RANK3_EVENTS = 8;

export function rankOf(c: CrewMember): Rank {
  const days = c.daysAboard || 0;
  const ev = c.eventsInRole || 0;
  if (days >= RANK3_DAYS && ev >= RANK3_EVENTS) return 3;
  if (days >= RANK2_DAYS && ev >= RANK2_EVENTS) return 2;
  return 1;
}

// Best rank among actual crew in a role — a captain double-hatting a role
// nobody's hired for yet carries no veterancy in it.
export function bestRoleRank(crew: CrewMember[], role: string): Rank {
  let best: Rank = 1;
  for (const c of crew) if (c.role === role && rankOf(c) > best) best = rankOf(c);
  return best;
}

// Multiplier for stats where higher is better (damage dealt, food generated).
export function rankBoost(crew: CrewMember[], role: string): number {
  return [1, 1.05, 1.1][bestRoleRank(crew, role) - 1];
}
// Multiplier for costs where lower is better (fuel burn, bribe price).
export function rankDiscount(crew: CrewMember[], role: string): number {
  return [1, 0.95, 0.9][bestRoleRank(crew, role) - 1];
}

// Call at the moment a crew member does their job under real pressure.
// Fires a rank-up bark the instant the new count crosses a threshold.
export function markVeteranEvent(c: CrewMember) {
  const before = rankOf(c);
  c.eventsInRole = (c.eventsInRole || 0) + 1;
  const after = rankOf(c);
  if (after === 2 && before < 2) bark("rank_seasoned", { crew: c });
  else if (after === 3 && before < 3) bark("rank_veteran", { crew: c });
}
