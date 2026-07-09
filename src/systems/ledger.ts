// Engine primitive 2: the Memory Ledger.
// Instead of morale/reputation numbers alone, the ship remembers discrete facts
// with emotional weight. Checks read these memories — and can cite them back to
// the player in prose. Endings are threshold reads over accumulated history.
import { S } from "../state";
import type { MemoryEntry, CrewMember } from "../types";

// Write a memory. Deduped by (who, fact): re-witnessing the same thing deepens
// the wound/bond rather than spamming duplicates.
export function remember(who: string, fact: string, weight: number, note?: string) {
  const prior = S.ledger.find((m) => m.who === who && m.fact === fact);
  if (prior) {
    prior.weight += weight;
    prior.day = S.day;
    if (note) prior.note = note;
    return;
  }
  S.ledger.push({ who, fact, weight, day: S.day, note });
  // keep the ledger from growing without bound on very long runs
  if (S.ledger.length > 400) S.ledger.splice(0, S.ledger.length - 400);
}

export function recall(who?: string): MemoryEntry[] {
  return who ? S.ledger.filter((m) => m.who === who) : S.ledger.slice();
}

// Net emotional balance toward the captain for a given subject.
export function sentiment(who: string): number {
  return S.ledger.filter((m) => m.who === who).reduce((a, m) => a + m.weight, 0);
}

export function hasMemory(who: string, fact: string): boolean {
  return S.ledger.some((m) => m.who === who && m.fact === fact);
}

// The most emotionally-charged thing this subject remembers — the line the game
// quotes back at farewell scenes and moral forks.
export function strongestMemory(who: string): MemoryEntry | null {
  const mine = S.ledger.filter((m) => m.who === who && m.note);
  if (!mine.length) return null;
  return mine.reduce((best, m) => (Math.abs(m.weight) > Math.abs(best.weight) ? m : best));
}

// ---- crew helpers ----
export const crewKey = (c: CrewMember) => `crew:${c.id}`;
export const worldKey = (planet: string) => `world:${planet}`;
export const npcKey = (key: string) => `npc:${key}`;

// Whoever is currently aboard and might witness a moral choice.
export function witnesses(): CrewMember[] {
  return S.crew.slice();
}

// Every crew member records a witnessed captain-choice, weighted by whether it
// cuts with or against their own wound/values.
export function witnessAll(fact: string, baseWeight: number, note?: string) {
  for (const c of witnesses()) remember(crewKey(c), fact, baseWeight, note);
}
