// How well the captain and a crew member actually know each other. Reads the
// Memory Ledger (what's happened between you) and veterancy (how long they've
// watched you work) — never a meter the player sets directly.
import type { CrewMember } from "../types";
import { sentiment, crewKey } from "./ledger";

export type Trust = "stranger" | "shipmate" | "trusted" | "bonded";

// Gates which dialogue topics are on the table. Needs both time aboard and a
// non-hostile balance of memories — you can't buy trust with one good day.
export function trustTier(c: CrewMember): Trust {
  const s = sentiment(crewKey(c));
  const days = c.daysAboard || 0;
  if (s >= 8 && days >= 15) return "bonded";
  if (s >= 3 && days >= 6) return "trusted";
  if (days >= 1 || s !== 0) return "shipmate";
  return "stranger";
}

// The one-word read the roster panel shows — pure sentiment, no time gate, so
// it moves the moment you do something that matters to them.
export function dispositionWord(c: CrewMember): { word: string; cls: string } {
  const s = sentiment(crewKey(c));
  if (s >= 8) return { word: "warm", cls: "warm" };
  if (s >= 2) return { word: "steady", cls: "steady" };
  if (s > -3) return { word: "wary", cls: "wary" };
  return { word: "cold", cls: "cold" };
}
