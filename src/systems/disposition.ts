// "Reputation precedes you" — three hidden playstyle meters that accumulate from
// HOW you complete missions and fights, not what you own. Content reads these:
// the cantina and crew leak a derived "word on the street", and reputation riders
// plant delayed payoffs keyed to your dominant trait. The player never sees the
// raw numbers.
import { S, whisper } from "../state";
import { REPUTATION } from "../content";
import type { Disposition } from "../types";
import { clamp } from "../util";
import { fork } from "../rng";

export type Axis = keyof Disposition;
const CAP = 25;
const LEVELS = [6, 12, 20]; // mild, strong, notorious

// Poles for prose: [negative-pole key, positive-pole key]
const POLE: Record<Axis, [string, string]> = {
  mercy: ["mercy-", "mercy+"],
  law: ["law-", "law+"],
  daring: ["daring-", "daring+"],
};

let cosTick = 0;
function cosPick<T>(arr: T[]): T {
  return arr[Math.floor(fork("rep:" + S.seed + ":" + cosTick++)() * arr.length)];
}

// Nudge an axis. When your reputation crosses into a louder tier, the crew hears
// the talk before you do — a whisper leaks it.
export function shift(axis: Axis, delta: number, _reason?: string) {
  const before = Math.abs(S.disposition[axis]);
  S.disposition[axis] = clamp(S.disposition[axis] + delta, -CAP, CAP);
  const after = Math.abs(S.disposition[axis]);
  if (after <= before) return;
  const crossed = LEVELS.find((l) => before < l && after >= l);
  if (crossed === undefined) return;
  const poleKey = S.disposition[axis] >= 0 ? POLE[axis][1] : POLE[axis][0];
  const lines = REPUTATION.crossing[poleKey];
  if (lines && lines.length) whisper(cosPick(lines));
}

export function poleKey(axis: Axis): string {
  return S.disposition[axis] >= 0 ? POLE[axis][1] : POLE[axis][0];
}

// The loudest thing about you right now — or null if you're still a nobody.
export function reputation(): { axis: Axis; pole: string; strength: number; title: string; street: string } | null {
  const axes: Axis[] = ["mercy", "law", "daring"];
  let best: Axis | null = null;
  for (const a of axes) {
    if (Math.abs(S.disposition[a]) < LEVELS[0]) continue;
    if (best === null || Math.abs(S.disposition[a]) > Math.abs(S.disposition[best])) best = a;
  }
  if (best === null) return null;
  const pole = poleKey(best);
  const strength = Math.abs(S.disposition[best]);
  return {
    axis: best, pole, strength,
    title: cosPick(REPUTATION.titles[pole] || ["a captain of some repute"]),
    street: cosPick(REPUTATION.street[pole] || [""]),
  };
}

// Is a named favor/mark flag live? (reputation-rider payoffs set these)
export function favor(flag: string): boolean { return !!S.flags[flag]; }
