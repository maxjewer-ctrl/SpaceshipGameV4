// Engine primitive 3: the Bark System.
// Contextual one-liners from crew keyed to (personality × situation × ledger).
// The single cheapest source of "my crew feels alive." Content lives in
// content/barks.json; this file is just the selector + renderer.
import { S, whisper } from "../state";
import { BARKS, type BarkDef } from "../content";
import type { CrewMember } from "../types";
import { fork } from "../rng";
import { sentiment, crewKey } from "./ledger";

// Cosmetic RNG: deterministic per save but does NOT advance the gameplay stream,
// so barks never perturb combat/event rolls (keeps runs reproducible).
//
// The counter lives in the SAVE (S.barkTick), not in this module. It used to be
// a module-global, which quietly broke the promise in the line above: the
// counter kept climbing for the life of the process and was never persisted, so
// the chatter a save produced depended on how many barks had already fired in
// that session. The same save loaded twice gave different lines, and no run
// reproduced. Barks write into S.logLines, which IS saved, so this leaked into
// saved state rather than staying cosmetic.
function cosRand(): number { return fork("bark:" + S.seed + ":" + S.barkTick++)(); }
function cosPick<T>(arr: T[]): T { return arr[Math.floor(cosRand() * arr.length)]; }

function gateOk(b: BarkDef, c: CrewMember): boolean {
  const bd = c.bundle;
  if (b.traits && b.traits.length) {
    if (!bd || !b.traits.some((t) => bd.traits.includes(t))) return false;
  }
  if (b.role && c.role !== b.role) return false;
  if (b.secretTag && (!bd || bd.secretTag !== b.secretTag)) return false;
  if (b.wound && (!bd || bd.woundTag !== b.wound)) return false;
  if (b.origin && (!bd || !bd.origin.toLowerCase().includes(b.origin.toLowerCase()))) return false;
  if (b.sentimentMin !== undefined && sentiment(crewKey(c)) < b.sentimentMin) return false;
  if (b.sentimentMax !== undefined && sentiment(crewKey(c)) > b.sentimentMax) return false;
  // world-state gates: ambient chatter tracks the plot as it unfolds
  if (b.silMin !== undefined && S.campaign.silence.stage < b.silMin) return false;
  if (b.arcMin !== undefined && S.arc.stage < b.arcMin) return false;
  if (b.flag && !S.flags[b.flag]) return false;
  if (b.loc && S.loc !== b.loc) return false;
  return true;
}

function fill(text: string, c: CrewMember): string {
  const bd = c.bundle;
  return text
    .replace(/\{name\}/g, c.name)
    .replace(/\{origin\}/g, bd ? bd.origin : "somewhere out here")
    .replace(/\{want\}/g, bd ? bd.want : "a quiet berth")
    .replace(/\{wound\}/g, bd ? bd.wound : "")
    .replace(/\{tell\}/g, bd ? bd.tell : "");
}

// Fire a bark for a situation. Optionally scope to one crew member (opts.crew),
// or set opts.chance to gate ambient chatter. Returns whether one fired.
export function bark(
  situation: string,
  opts: { crew?: CrewMember; chance?: number } = {},
): boolean {
  if (opts.chance !== undefined && cosRand() > opts.chance) return false;
  const crew = opts.crew ? [opts.crew] : S.crew;
  if (!crew.length) return false;
  const pairs: Array<{ c: CrewMember; b: BarkDef }> = [];
  for (const c of crew) {
    for (const b of BARKS) {
      if (b.when !== situation) continue;
      if (!gateOk(b, c)) continue;
      pairs.push({ c, b });
    }
  }
  if (!pairs.length) return false;
  const { c, b } = cosPick(pairs);
  whisper(fill(b.text, c));
  return true;
}

// A crew member's "tell" — the behavioural giveaway — surfaced in-context. This
// is how the hidden Tapestry sheet leaks without ever being shown. Tells are
// occasional (60%): a giveaway that fires EVERY time isn't a tell, it's a
// billboard — and it was starving all other chatter in that situation.
export function tellBark(situation: string): boolean {
  const tellers = S.crew.filter((c) => c.bundle && c.bundle.tellSituation === situation);
  if (!tellers.length) return false;
  if (cosRand() > 0.6) return false;
  const c = cosPick(tellers);
  whisper(`${c.name} ${c.bundle!.tell}.`);
  return true;
}
