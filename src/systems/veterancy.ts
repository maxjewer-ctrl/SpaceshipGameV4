// Veterancy — crew grow from stat blocks into careers. A rank is earned two
// ways at once: TIME (daysAboard, the watch they've kept) and BLOODED events
// survived IN role (roleXp — a gunner ranks in fights, a pilot dodging swarms).
// Neither alone gets there, so rank can't be bought with salary or rushed with
// one hard week. Scars are the qualitative cousin: single events that stamp a
// named trait onto a crew member, gating barks and small mechanics.
import type { CrewMember } from "../types";
import { S, log } from "../state";

export type Rank = 0 | 1 | 2 | 3;

// Each gate needs BOTH days aboard and events-in-role cleared. Tuned so rank 3
// is a genuine late-game state (~50 days + ~20 blooded events), not a day-30 gimme.
const GATES: Array<{ days: number; xp: number }> = [
  { days: 10, xp: 3 },   // -> rank 1
  { days: 25, xp: 9 },   // -> rank 2
  { days: 50, xp: 20 },  // -> rank 3
];

// Per-role rank titles, shown on the roster. Index 0/1/2 = rank 1/2/3.
const TITLES: Record<string, [string, string, string]> = {
  pilot:        ["Steady Hand", "Lane-Runner", "Ghost of the Lanes"],
  mechanic:     ["Grease Hand", "Deck Engineer", "Miracle Worker"],
  gunner:       ["Trigger Hand", "Marksman", "Deadeye"],
  medic:        ["Field Medic", "Ship's Doctor", "Life-Saver"],
  cook:         ["Line Cook", "Galley Chief", "Morale Officer"],
  quartermaster:["Purser", "Quartermaster", "Master of Stores"],
};

// The "Dez can now thread a picket line" line — fired once, when a rank is earned.
const RANKUP_LINE: Record<string, [string, string, string]> = {
  pilot:        ["has the ship's trim by heart now", "can thread a picket line clean", "flies like the black owes them a favour"],
  mechanic:     ["knows every rattle in the hull", "coaxes power from dead systems", "keeps her running on spit and spite"],
  gunner:       ["holds a firing solution without thinking", "reads an enemy's turn before it comes", "does not miss the shots that matter"],
  medic:        ["patches wounds without looking", "keeps the crew on their feet through anything", "has pulled people back from further than that"],
  cook:         ["makes the rations taste like a choice", "feeds the deck's spirit as much as its stomach", "runs a galley the whole crew flies better for"],
  quartermaster:["knows where every credit sleeps", "squeezes a discount from a cold room", "makes the stores stretch past all reason"],
};

// Scar corpus — a learned trait stamped by a specific event. `edge` barks are
// read by the dialogue/encounter layer; a few also gate mechanics via hasScar().
export const SCARS: Record<string, { label: string; note: string }> = {
  steady_under_fire:  { label: "Steady under fire", note: "came through a boarding and stopped flinching at the klaxon" },
  flinches_at_static: { label: "Flinches at static", note: "a bad turn out past the Verge left them cold to dead-channel hiss" },
  lane_scarred:       { label: "Lane-scarred", note: "survived a hard breakdown adrift and never fully trusts the drive again" },
  seen_the_silence:   { label: "Seen the Silence", note: "stood a watch when the Broadcast fired and carries it quiet" },
};

export function rankOf(c: CrewMember): Rank {
  const days = c.daysAboard || 0, xp = c.roleXp || 0;
  let r: Rank = 0;
  for (let i = 0; i < GATES.length; i++) {
    if (days >= GATES[i].days && xp >= GATES[i].xp) r = (i + 1) as Rank;
    else break;
  }
  return r;
}

export function rankTitle(c: CrewMember): string {
  const r = rankOf(c);
  if (r === 0) return "";
  return TITLES[c.role]?.[r - 1] || `Rank ${r}`;
}

// Best rank held by anyone aboard covering a role — the value derive.ts folds
// into that role's effect. Captain double-hatting counts as rank 0 (unranked).
export function roleRank(role: string): Rank {
  return S.crew.reduce<Rank>((best, c) => (c.role === role && rankOf(c) > best ? rankOf(c) : best), 0);
}

// Small stacking edge on a role's primary effect: +6% of headroom per rank.
// Multiplied on top of the flat perk in derive.ts, so a bonded rank-3 gunner
// reads clearly better than a green hire without trivialising the game.
export function roleEdge(role: string): number {
  return 1 + 0.06 * roleRank(role);
}

// Grant events-in-role XP to everyone aboard who covers `role`, and announce any
// rank crossed. Call this the moment a role's kind of danger is survived.
export function gainRoleXp(role: string, n = 1) {
  for (const c of S.crew) {
    if (c.role !== role) continue;
    const before = rankOf(c);
    c.roleXp = (c.roleXp || 0) + n;
    const after = rankOf(c);
    if (after > before) log(`— ${c.name} ${RANKUP_LINE[role]?.[after - 1] || "has grown into the role"}. (${rankTitle(c)}) —`);
  }
}

// Stamp a named scar onto a crew member (idempotent). Announces it once.
export function addScar(c: CrewMember, tag: string) {
  if (!SCARS[tag]) return;
  c.scars ||= [];
  if (c.scars.includes(tag)) return;
  c.scars.push(tag);
  log(`— ${c.name} ${SCARS[tag].note}. (${SCARS[tag].label}) —`);
}

export function hasScar(c: CrewMember, tag: string): boolean {
  return !!c.scars?.includes(tag);
}

// Does anyone aboard carry this scar? — for encounter/bark gating.
export function crewWithScar(tag: string): CrewMember[] {
  return S.crew.filter((c) => hasScar(c, tag));
}
