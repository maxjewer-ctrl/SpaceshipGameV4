// Per-station standing — how a specific port feels about you, distinct from the
// three factions. Moved by what you do at and for a port; read for fuel/berth
// fees, contract quality, and the warmth of the room prose. The player never
// sees the raw number, only how the station talks and charges.
import { S, whisper } from "../state";
import { PLANETS } from "../content";
import { clamp } from "../util";

export function getStanding(loc: string): number {
  return (S.portStanding && S.portStanding[loc]) || 0;
}

// Tier bands drive prose and pricing. Kept coarse on purpose.
export type PortTier = "unwelcome" | "cold" | "neutral" | "known" | "regular" | "home";
export function standingTier(loc: string): PortTier {
  const v = getStanding(loc);
  if (v <= -6) return "unwelcome";
  if (v <= -2) return "cold";
  if (v <= 1) return "neutral";
  if (v <= 4) return "known";
  if (v <= 7) return "regular";
  return "home";
}

const TIER_WORD: Record<PortTier, string> = {
  unwelcome: "UNWELCOME", cold: "COLD", neutral: "NEUTRAL",
  known: "KNOWN", regular: "REGULAR", home: "HOME PORT",
};
export function standingWord(loc: string): string { return TIER_WORD[standingTier(loc)]; }

// Fuel/berth price multiplier: your regulars cut you a break; ports that have
// soured on you find "revised" reasons to charge more.
export function portPriceMult(loc: string): number {
  switch (standingTier(loc)) {
    case "home": return 0.85;
    case "regular": return 0.9;
    case "cold": return 1.12;
    case "unwelcome": return 1.22;
    default: return 1;
  }
}

// A line for the station deck — how the port greets you at the ramp.
export function standingGreeting(loc: string): string {
  const name = PLANETS[loc] ? PLANETS[loc].n : "the station";
  switch (standingTier(loc)) {
    case "home": return `${name} feels like coming home — dockhands wave, your berth's already warm, fees quietly forgiven.`;
    case "regular": return `They know your ship at ${name}. The good berths, the first look at the good work.`;
    case "known": return `You're a familiar face at ${name} now. It helps, at the margins.`;
    case "cold": return `${name} has gone cold on you. Fees run high and the welcome runs thin.`;
    case "unwelcome": return `You're unwelcome at ${name}. Every fee is "revised," every scan takes a little longer.`;
    default: return "";
  }
}

// Nudge a port's standing. Whispers when you cross into a new tier so the shift
// is felt, not just tallied.
export function bumpStanding(loc: string, n: number, _reason?: string) {
  if (!loc || !PLANETS[loc]) return;
  if (!S.portStanding) S.portStanding = {};
  const before = standingTier(loc);
  S.portStanding[loc] = clamp((S.portStanding[loc] || 0) + n, -10, 10);
  const after = standingTier(loc);
  if (after === before) return;
  const up = getStanding(loc) > 0 && n > 0;
  const nm = PLANETS[loc].n;
  if (up && (after === "regular" || after === "home")) whisper(`Word's got around ${nm}: you're one of theirs now.`);
  else if (n < 0 && (after === "cold" || after === "unwelcome")) whisper(`You've worn out your welcome at ${nm}. They'll remember why.`);
}

// Location-stamped set-dressing marks — "you did a thing HERE, and here shows
// it." Distinct from standing: a permanent physical change to one station.
export function markPort(loc: string, key: string) {
  S.flags["mark:" + loc + ":" + key] = true;
}
export function hasPortMark(loc: string, key: string): boolean {
  return !!S.flags["mark:" + loc + ":" + key];
}
