// Station moods (CORE_LOOP.md Pillar 3, "after standing works"). A port's
// CONDITION right now — distinct from portStanding (how it feels about YOU).
// Moods are driven by events and deliveries, not accumulated behavior: an
// outbreak sours a market until the serum run that ends it; a lucky season
// or a security crackdown can settle over a port independent of anything the
// captain did. Temporary — expires on `until`, same convention riderEffect
// flags already use (S.flags[f] = day+untilDays). Composes with, doesn't
// replace, portPriceMult/standingGreeting: both read at the same call sites.
import { S, whisper, log } from "../state";
import { PLANETS } from "../content";
import { rand, ri } from "../rng";
import { standingTier } from "./port";
import type { PortMood, PortMoodState } from "../types";

export const MOOD_WORD: Record<PortMood, string> = {
  boom: "BOOM", shortage: "SHORTAGE", lockdown: "LOCKDOWN", festival: "FESTIVAL",
};
export const MOOD_ICON: Record<PortMood, string> = {
  boom: "📈", shortage: "📉", lockdown: "🔒", festival: "🎉",
};

// Read-only: an expired entry reads as no mood without needing a prior tick.
export function activeMood(loc: string): PortMoodState | null {
  const m = S.portMood[loc];
  if (!m || m.until <= S.day) return null;
  return m;
}

export function setMood(loc: string, mood: PortMood, days: number, cause?: string) {
  S.portMood[loc] = { mood, until: S.day + days, cause };
}
export function endMood(loc: string) {
  delete S.portMood[loc];
}

// ---- price effects — compose with portPriceMult/goods jitter at their call sites ----
export function moodFuelMult(loc: string): number {
  const m = activeMood(loc);
  if (!m) return 1;
  switch (m.mood) {
    case "shortage": return 1.3;
    case "lockdown": return 1.25;
    case "festival": return 0.85;
    default: return 1;
  }
}
export function moodGoodsMult(loc: string): number {
  const m = activeMood(loc);
  if (!m) return 1;
  switch (m.mood) {
    case "boom": return 1.25;
    case "shortage": return 1.15;
    case "festival": return 0.9;
    default: return 1;
  }
}
export function moodMissionPayMult(loc: string): number {
  return activeMood(loc)?.mood === "boom" ? 1.15 : 1;
}
// A lockdown's crackdown makes off-the-books freight too hot to run.
export function moodBlocksHidden(loc: string): boolean {
  return activeMood(loc)?.mood === "lockdown";
}
// Lockdown scares off labor; a festival draws an extra hand looking for work.
export function moodRecruitDelta(loc: string): number {
  const mood = activeMood(loc)?.mood;
  if (mood === "lockdown") return -1;
  if (mood === "festival") return 1;
  return 0;
}

// ---- prose ----
const MOOD_LINE: Record<PortMood, (name: string) => string> = {
  boom: (n) => `${n}'s having a season — full docks, brisk trade, everyone's a little richer than they were talking about it.`,
  shortage: (n) => `${n} is running thin on everything that matters. Shelves half-empty, tempers half-frayed.`,
  lockdown: (n) => `${n}'s under a security clampdown — patrols on every corridor, manifests checked twice, nobody moving anything they shouldn't.`,
  festival: (n) => `${n}'s mid-festival — streamers, music leaking out of every open door, fees nobody's in a hurry to collect.`,
};
export function moodLine(loc: string): string {
  const m = activeMood(loc);
  if (!m) return "";
  return MOOD_LINE[m.mood](PLANETS[loc] ? PLANETS[loc].n : "the station");
}
// Short status-line tag, mirrors standingWord's usage in the station-deck header.
export function moodTag(loc: string): string {
  const m = activeMood(loc);
  return m ? MOOD_WORD[m.mood] : "";
}

// ---- outbreak: the CORE_LOOP-named example ("the serum you ran ends it") ----
// A medical "Serum run" contract generating at a port means that port has an
// outbreak right now — sours it with a shortage independent of the player.
// Delivering that serum resolves it: the shortage lifts and the port throws a
// small, grateful festival. An undelivered outbreak just lapses on its own —
// this never punishes a captain for skipping a contract, only rewards taking it.
export function plantOutbreak(loc: string, deadline: number) {
  const days = Math.max(6, deadline - S.day + ri(5, 10));
  setMood(loc, "shortage", days, "outbreak");
}
export function resolveOutbreakIfDue(loc: string) {
  const m = S.portMood[loc];
  if (!m || m.cause !== "outbreak") return;
  endMood(loc);
  setMood(loc, "festival", ri(8, 14), "relief");
  const name = PLANETS[loc] ? PLANETS[loc].n : "the port";
  log(`📈 Word spreads fast at ${name} — the serum worked. The outbreak's over, and the whole station's throwing something like a party about it.`);
}

// ---- the random tick — called on docking for the current port only ----
// Weighted by standing: a port that likes you tilts toward boom/festival,
// one that's soured on you tilts toward shortage/lockdown. Low base chance
// and a long duration keep this "for weeks," not a sine wave every visit.
const ROLL_CHANCE = 0.1;
const WEIGHTS: Record<"warm" | "neutral" | "cold", Record<PortMood, number>> = {
  warm: { boom: 3, festival: 3, shortage: 1, lockdown: 1 },
  neutral: { boom: 2, festival: 2, shortage: 2, lockdown: 2 },
  cold: { boom: 1, festival: 1, shortage: 2, lockdown: 3 },
};
function standingBand(loc: string): "warm" | "neutral" | "cold" {
  const t = standingTier(loc);
  if (t === "regular" || t === "home") return "warm";
  if (t === "cold" || t === "unwelcome") return "cold";
  return "neutral";
}
function weightedMood(band: "warm" | "neutral" | "cold"): PortMood {
  const w = WEIGHTS[band];
  const total = w.boom + w.festival + w.shortage + w.lockdown;
  let roll = rand() * total;
  for (const mood of Object.keys(w) as PortMood[]) {
    roll -= w[mood];
    if (roll <= 0) return mood;
  }
  return "boom";
}

export function tickPortMoods() {
  const loc = S.loc;
  if (!PLANETS[loc]) return;
  if (activeMood(loc)) return; // don't stack or interrupt a live mood
  if (rand() > ROLL_CHANCE) return;
  const mood = weightedMood(standingBand(loc));
  setMood(loc, mood, ri(10, 20));
  const name = PLANETS[loc].n;
  if (mood === "boom") whisper(`${name}'s in the middle of a real boom. Good time to be selling.`);
  else if (mood === "shortage") whisper(`${name}'s running short on everything. Prices are climbing while you watch.`);
  else if (mood === "lockdown") whisper(`${name}'s tightened up — patrols everywhere, manifests checked twice.`);
  else whisper(`${name}'s throwing a festival. The whole docks smells like someone else's good time.`);
}
