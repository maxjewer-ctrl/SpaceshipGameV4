// Juno Vale's deep conversation tree — a large, data-driven branching dialogue
// that opens up as three things move: how far she trusts you (trustTier), where
// you stand with the factions (S.rep) and your playstyle (disposition), and what
// the campaign has done to the sky (the Long Silence / Voss arc). Content lives
// in content/juno.dialogue.json as a node graph; this file is just the small
// interpreter that gates nodes, renders her portrait, and routes every choice's
// consequences through the shared effects DSL and the Memory Ledger.
//
// Two entry points:
//   openJunoDialogue()  — the player walks up and talks (a hub of topics that
//                         grows as trust/rep/events unlock more branches).
//   checkJunoArc()      — on docking, at most one gated "beat" fires unprompted,
//                         the way imogenquest.ts / agendabeats.ts push a story
//                         forward on their own timetable.
import { S, log } from "../state";
import { JUNO_DIALOGUE, PLANETS } from "../content";
import { modal, replaceModal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { crewPortrait } from "../ui/portraits";
import { dialogueHeadHTML } from "../ui/portraits";
import { applyEffects } from "./scheduler";
import { sentiment, crewKey, remember } from "./ledger";
import { trustTier, type Trust } from "./trust";
import type { CrewMember } from "../types";
import type { JunoChoice, JunoNode } from "../content";

function juno(): CrewMember | undefined {
  return S.crew.find((c) => c.key === "juno");
}

const TRUST_RANK: Record<Trust, number> = { stranger: 0, shipmate: 1, trusted: 2, bonded: 3 };

// ---- gate vocabulary — the combined trust + faction-rep + event check ----
// Extends the spirit of scene.ts#checkReq with crew-relationship and campaign
// gates. Returns [ok, whyLabel] so locked topics can hint at what unlocks them.
export function checkJunoReq(req: Record<string, any> | undefined, c: CrewMember): [boolean, string] {
  if (!req) return [true, ""];
  // relationship
  if (req.trust && TRUST_RANK[trustTier(c)] < TRUST_RANK[req.trust as Trust]) return [false, "not yet"];
  if (req.trustMax && TRUST_RANK[trustTier(c)] > TRUST_RANK[req.trustMax as Trust]) return [false, ""];
  const sent = sentiment(crewKey(c));
  if (req.sentimentMin !== undefined && sent < req.sentimentMin) return [false, "not yet"];
  if (req.sentimentMax !== undefined && sent > req.sentimentMax) return [false, ""];
  if (req.daysMin !== undefined && (c.daysAboard || 0) < req.daysMin) return [false, "give it time"];
  // faction standing (union / frontier / syndicate) and playstyle disposition
  if (req.rep && (S.rep[req.rep[0]] || 0) < req.rep[1]) return [false, `need ${req.rep[0]} standing`];
  if (req.repMax && (S.rep[req.repMax[0]] || 0) > req.repMax[1]) return [false, ""];
  if (req.dispo && ((S.disposition as any)[req.dispo[0]] || 0) < req.dispo[1]) return [false, ""];
  if (req.dispoMax && ((S.disposition as any)[req.dispoMax[0]] || 0) > req.dispoMax[1]) return [false, ""];
  // several ceilings at once — lets sibling choices carve exclusive regions of
  // playstyle space so the same label never renders twice
  if (req.dispoMaxAll) {
    for (const [ax, mx] of req.dispoMaxAll as [string, number][]) {
      if (((S.disposition as any)[ax] || 0) > mx) return [false, ""];
    }
  }
  // resources
  if (req.credits !== undefined && S.credits < req.credits) return [false, `need ${req.credits}cr`];
  // campaign / world events
  if (req.sil !== undefined && (S.campaign.silence.stage || 0) < req.sil) return [false, "locked"];
  if (req.silMax !== undefined && (S.campaign.silence.stage || 0) > req.silMax) return [false, ""];
  if (req.arc !== undefined && (S.arc.stage || 0) < req.arc) return [false, "locked"];
  if (req.arcMax !== undefined && (S.arc.stage || 0) > req.arcMax) return [false, ""];
  // where the ship is docked right now (beats that only make sense at a port)
  if (req.loc) {
    const locs = Array.isArray(req.loc) ? req.loc : [req.loc];
    if (!locs.includes(S.loc)) return [false, ""];
  }
  // prior-choice flags — string or array (all must hold / none may hold)
  if (req.flag) {
    for (const f of Array.isArray(req.flag) ? req.flag : [req.flag]) {
      if (!S.flags[f]) return [false, "locked"];
    }
  }
  if (req.flagNot) {
    for (const f of Array.isArray(req.flagNot) ? req.flagNot : [req.flagNot]) {
      if (S.flags[f]) return [false, ""];
    }
  }
  return [true, ""];
}

// Consequences: crew-specific verbs handled locally, everything else delegated
// to the shared DSL. "@juno" in a remember/who is rewritten to her ledger key so
// content never has to know her runtime id.
function applyJunoEffects(effects: any[] | undefined, c: CrewMember) {
  if (!effects || !effects.length) return;
  const pass: any[] = [];
  for (const e of effects) {
    if (e.perk) { c.perk = true; continue; }
    if (e.remember && e.remember.who === "@juno") {
      remember(crewKey(c), e.remember.fact, e.remember.weight, e.remember.note);
      continue;
    }
    pass.push(e);
  }
  if (pass.length) applyEffects(pass);
}

// ---- rendering ----
const activeNode = { key: "" };
let pendingAfter: (() => void) | null = null;

function sceneLoc(): string {
  const where = S.docked && S.screen === "stationwalk"
    ? `${PLANETS[S.loc].n} · off duty`
    : `${S.shipName} · engine bay`;
  return where;
}

function headFor(c: CrewMember, node: JunoNode): string {
  const src = crewPortrait(c, node.expr || "neutral");
  const sub = node.sub || "your mechanic";
  return dialogueHeadHTML(src, "🔧", "Juno Vale", sub);
}

// force: true for a direct player action or navigation continuing the
// already-open Juno modal (replaces in place, never queues behind itself).
// false (default) for the unprompted docking beat (checkJunoArc), which
// should queue behind whatever another system may already be showing.
function renderJunoNode(nodeKey: string, force = false) {
  const c = juno();
  const tree = JUNO_DIALOGUE.nodes;
  const node = tree[nodeKey];
  if (!c || !node) { activeNode.key = ""; closeModal(); requestRender(); return; }
  activeNode.key = nodeKey;
  S.flags["juno_seen_" + nodeKey] = true;
  const buttons = node.choices
    .map((ch: JunoChoice, i: number) => ({ ch, i, seen: !!(ch.once && S.flags["juno_took_" + nodeKey + "_" + i]) }))
    .filter((x) => !x.seen)
    .map((x) => {
      const [ok, why] = checkJunoReq(x.ch.requires, c);
      if (!ok && x.ch.hidden) return "";
      const cls = x.ch.tone === "primary" ? "primary" : x.ch.tone === "danger" ? "danger" : "";
      const hint = !ok && why ? ` <span class="dim">— ${why}</span>` : "";
      return `<button class="${cls}" ${ok ? "" : "disabled"} onclick="junoChoose('${nodeKey}',${x.i})">${x.ch.label}${hint}</button>`;
    })
    .join("");
  const html = `<div class="scene">
    <div class="scene-loc">${sceneLoc()}</div>
    ${headFor(c, node)}
    <p>${node.text}</p>
    <div class="choices">${buttons}</div>
  </div>`;
  if (force) replaceModal(html); else modal(html);
}

export function openJunoDialogue() {
  const c = juno();
  if (!c) return;
  pendingAfter = null;
  renderJunoNode(JUNO_DIALOGUE.nodes.hub ? "hub" : Object.keys(JUNO_DIALOGUE.nodes)[0], true);
  requestRender();
}

export function junoChoose(nodeKey: string, idx: number) {
  const c = juno();
  const node = JUNO_DIALOGUE.nodes[nodeKey];
  if (!c || !node) { closeModal(); return; }
  const ch = node.choices[idx];
  if (!ch) return;
  if (!checkJunoReq(ch.requires, c)[0]) return;
  if (ch.once) S.flags["juno_took_" + nodeKey + "_" + idx] = true;
  applyJunoEffects(ch.effects, c);
  if (ch.log) log(ch.log);
  const after = () => {
    if (ch.end) { activeNode.key = ""; closeModal(); requestRender(); }
    else if (ch.goto) { renderJunoNode(ch.goto, true); requestRender(); }
    else { renderJunoNode("hub", true); requestRender(); } // default: back to the hub, stay talking
  };
  if (ch.reply) {
    pendingAfter = after;
    const src = crewPortrait(c, ch.expr || node.expr || "neutral");
    replaceModal(`<div class="scene">
      <div class="scene-loc">${sceneLoc()}</div>
      ${dialogueHeadHTML(src, "🔧", "Juno Vale", "")}
      <p>${ch.reply}</p>
      <div class="choices"><button class="primary" onclick="junoContinue()">Continue</button></div>
    </div>`);
    requestRender();
  } else {
    after();
  }
}

export function junoContinue() {
  const f = pendingAfter; pendingAfter = null;
  if (f) f(); else { closeModal(); requestRender(); }
}

// ---- docking beats — unprompted story pushes, gated + fired once each ----
// Same slot as checkImogenQuest/checkAgendaBeats in travel.ts. Walks the ordered
// beat list and opens the first one whose gate is satisfied and that hasn't
// fired. One modal per docking, at most — and ambient beats keep a few days'
// distance from each other so Juno doesn't ambush the captain at three ports
// running. Beats marked priority (mission completions, planted payoffs) ignore
// the cooldown: the player earned that scene by flying here.
const BEAT_SPACING_DAYS = 4;

export function checkJunoArc() {
  if (!S.docked) return;
  const c = juno();
  if (!c) return;
  const cd = S.flags.juno_beat_cooldown;
  for (const beat of JUNO_DIALOGUE.beats || []) {
    if (S.flags["juno_beat_" + beat.id]) continue;
    if (!beat.priority && typeof cd === "number" && S.day < cd) continue;
    if (!checkJunoReq(beat.requires, c)[0]) continue;
    if (!JUNO_DIALOGUE.nodes[beat.node]) continue;
    S.flags["juno_beat_" + beat.id] = true;
    S.flags.juno_beat_cooldown = S.day + BEAT_SPACING_DAYS;
    renderJunoNode(beat.node);
    requestRender();
    return;
  }
}
