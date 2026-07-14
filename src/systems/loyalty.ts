// Loyalty missions (CORE_LOOP.md Pillar 2 — "the Mass Effect move").
// One authored errand per named character. Once you've earned a deep bond, the
// crew member asks for a real thing in a real place — Ada's sister buried on
// Meridian, Brix's reckoning with the Foundry yard boss, Nyla's stone for the
// dead the company left behind. You fly there; a payoff scene resolves it; the
// crew member's role perk unlocks for good and the bond is set in the ledger.
//
// Structurally this is the same want→place→resolution→perk arc crewtalk.ts runs
// generically off bundle.want — but authored, named, and pointed at a specific
// world the generic pickQuestDest() could never produce. For characters with a
// loyalty mission the generic quest is suppressed (see crewtalk.ts): this IS
// their quest. Content and prose live in content/loyalty.json; this file is the
// interpreter, mirroring imogenquest.ts's shape (a bonded-trust scene that
// grants a perk) with a travel leg in the middle.
//
// Decoupled from veterancy.ts on purpose: rankOf() stays a pure derivation of
// days + events (no stored signal, no migration). Loyalty grants the perk (the
// meaningful effectiveness unlock CORE_LOOP calls "the rank-3 gate") and the
// bond; the rank curve is left alone. Both feed role effectiveness independently.
import { S, log, whisper } from "../state";
import { LOYALTY, PLANETS } from "../content";
import { modal, closeModal, replaceModal } from "../modal";
import { requestRender } from "../bus";
import { crewPortraitKey, dialogueHeadHTML } from "../ui/portraits";
import { trustTier } from "./trust";
import { remember, crewKey, hasMemory } from "./ledger";
import { shift, type Axis } from "./disposition";
import { clamp } from "../util";
import type { CrewMember } from "../types";

// Named characters that have an authored loyalty mission — crewtalk.ts reads
// this to suppress the generic personal quest for them (theirs is authored).
export const LOYALTY_KEYS = new Set(Object.keys(LOYALTY));

const DECLINE_COOLDOWN = 8; // days before a passed-on offer comes back around

function loyaltyCrew(key: string): CrewMember | undefined {
  return S.crew.find((c) => c.key === key);
}

// Is this crew member's bond deep enough, and their act-one hook (if any) set?
function offerReady(key: string, c: CrewMember): boolean {
  const def = LOYALTY[key];
  if (S.flags["loyalty_" + key]) return false;                 // active or done already
  if (trustTier(c) !== "bonded") return false;
  if ((c.daysAboard || 0) < def.gate.daysMin) return false;
  if (def.gate.memory && !hasMemory(crewKey(c), def.gate.memory)) return false;
  const cd = S.flags["loyalty_cd_" + key];
  if (typeof cd === "number" && S.day < cd) return false;      // recently declined
  return true;
}

// ---- docking hooks (called from travel.ts arrive(), same slot as the other
// once-per-dock beats). Arrive-payoff is checked before offer so you never get
// handed a new errand on the same dock you complete one. ----

// Fires the payoff scene if we've docked where an accepted errand resolves.
export function checkLoyaltyArrive(): boolean {
  for (const key of LOYALTY_KEYS) {
    if (S.flags["loyalty_" + key] !== "active") continue;
    if (LOYALTY[key].dest !== S.loc) continue;
    const c = loyaltyCrew(key);
    if (!c) continue; // they left the crew mid-errand — let it lapse silently
    openArrive(key, c);
    return true;
  }
  return false;
}

// Offers the first ready mission (one per dock, at most).
export function checkLoyaltyOffer(): boolean {
  for (const key of LOYALTY_KEYS) {
    const c = loyaltyCrew(key);
    if (!c) continue;
    if (!offerReady(key, c)) continue;
    openOffer(key, c);
    return true;
  }
  return false;
}

// ---- offer scene ----
let pendingOffer: string | null = null;

function openOffer(key: string, c: CrewMember) {
  const def = LOYALTY[key];
  pendingOffer = key;
  modal(`<div class="scene">
    <div class="scene-loc">${S.shipName} · a quiet word</div>
    ${dialogueHeadHTML(crewPortraitKey(c), def.icon, c.name, def.offerSub)}
    <h2>${def.icon} ${def.offerTitle}</h2>
    <p>${def.offerText}</p>
    <div class="choices">
      <button class="primary" onclick="loyaltyAccept()">${def.acceptLabel}</button>
      <button onclick="loyaltyDecline()">${def.declineLabel}</button>
    </div>
  </div>`);
  requestRender();
}

export function loyaltyAccept() {
  const key = pendingOffer; pendingOffer = null;
  if (!key) { closeModal(); return; }
  const def = LOYALTY[key];
  S.flags["loyalty_" + key] = "active";
  log(def.acceptLog);
  log(`◆ ${loyaltyCrew(key)?.name ?? "Someone"} is counting on a course for ${PLANETS[def.dest].n}.`);
  closeModal();
  requestRender();
}

export function loyaltyDecline() {
  const key = pendingOffer; pendingOffer = null;
  if (!key) { closeModal(); return; }
  S.flags["loyalty_cd_" + key] = S.day + DECLINE_COOLDOWN;
  whisper(LOYALTY[key].declineReply);
  closeModal();
  requestRender();
}

// ---- payoff scene ----
let pendingArrive: string | null = null;

function openArrive(key: string, c: CrewMember) {
  const def = LOYALTY[key];
  pendingArrive = key;
  const buttons = def.choices
    .map((ch, i) => `<button class="${i === 0 ? "primary" : ""}" onclick="loyaltyResolve(${i})">${ch.label}</button>`)
    .join("");
  modal(`<div class="scene">
    <div class="scene-loc">${PLANETS[def.dest].n}</div>
    ${dialogueHeadHTML(crewPortraitKey(c), def.icon, c.name, def.offerSub)}
    <h2>${def.icon} ${def.arriveTitle}</h2>
    <p>${def.arriveText}</p>
    <div class="choices">${buttons}</div>
  </div>`);
  requestRender();
}

export function loyaltyResolve(idx: number) {
  const key = pendingArrive; pendingArrive = null;
  if (!key) { closeModal(); return; }
  const def = LOYALTY[key];
  const c = loyaltyCrew(key);
  const ch = def.choices[idx] || def.choices[0];
  // The choice shades the ending; completion (perk + bond) is unconditional.
  if (ch.credits) S.credits = Math.max(0, S.credits + ch.credits);
  if (ch.prestige) S.prestige = Math.max(0, S.prestige + ch.prestige);
  if (ch.rep) S.rep[ch.rep[0]] = clamp((S.rep[ch.rep[0]] || 0) + ch.rep[1], -20, 20);
  if (ch.dispo) shift(ch.dispo.axis as Axis, ch.dispo.n, "saw a crew member's loyalty mission through");
  if (c) {
    c.perk = true;
    remember(crewKey(c), def.bondFact, 8, def.bondNote);
  }
  S.flags["loyalty_" + key] = "done";
  log(def.log);
  // The reply line is the scene's last beat, then the player dismisses it.
  replaceModal(`<div class="scene">
    <div class="scene-loc">${PLANETS[def.dest].n}</div>
    ${dialogueHeadHTML(crewPortraitKey(c!), def.icon, c?.name ?? "", def.offerSub)}
    <p>${ch.reply}</p>
    <div class="choices"><button class="primary" onclick="closeModal()">Back to the ship.</button></div>
  </div>`);
  requestRender();
}
