// Deep, data-driven conversation trees for named crew — large branching
// dialogue that opens up as three things move: how far a crewmate trusts you
// (trustTier), where you stand with the factions and your playstyle (S.rep /
// disposition), and what the campaign has done to the sky (the Long Silence /
// Voss arc). Content lives in content/<key>.dialogue.json, one node graph per
// crew `key`, registered in content/index.ts#CREW_TREES; this file is the
// single small interpreter every tree shares — it gates nodes, renders the
// crew member's portrait, and routes every choice's consequences through the
// shared effects DSL and the Memory Ledger.
//
// Two entry points:
//   openCrewDialogue(id)     — the player walks up and talks (a hub of topics
//                              that grows as trust/rep/events unlock more).
//   checkCrewDialogueArcs()  — on docking, at most one gated "beat" fires
//                              unprompted across ALL registered crew, the way
//                              imogenquest.ts / agendabeats.ts push a story
//                              forward on their own timetable.
import { S, log } from "../state";
import { CREW_TREES, PLANETS } from "../content";
import { modal, replaceModal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { actionAttr } from "../dispatch";
import { crewPortrait, dialogueHeadHTML } from "../ui/portraits";
import { applyEffects } from "./scheduler";
import { sentiment, crewKey, remember, hasMemory } from "./ledger";
import { trustTier, type Trust } from "./trust";
import type { CrewMember } from "../types";
import type { CrewDialogueChoice, CrewDialogueNode, CrewDialogueTree } from "../content";

function findByKey(key: string): CrewMember | undefined {
  return S.crew.find((c) => c.key === key);
}

const TRUST_RANK: Record<Trust, number> = { stranger: 0, shipmate: 1, trusted: 2, bonded: 3 };

// ---- gate vocabulary — the combined trust + faction-rep + event check ----
// Extends the spirit of scene.ts#checkReq with crew-relationship and campaign
// gates. Returns [ok, whyLabel] so locked topics can hint at what unlocks them.
export function checkCrewReq(req: Record<string, any> | undefined, c: CrewMember): [boolean, string] {
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
// to the shared DSL. "@self" in a remember/who is rewritten to this crew
// member's ledger key so content never has to know their runtime id.
function applyCrewEffects(effects: any[] | undefined, c: CrewMember): boolean {
  if (!effects || !effects.length) return false;
  const pass: any[] = [];
  let remembered = false;
  for (const e of effects) {
    if (e.perk) { c.perk = true; continue; }
    if (e.remember && e.remember.who === "@self") {
      // A conversation is not a relationship vending machine. Repeating the
      // same authored line may replay the prose, but it cannot deepen the same
      // memory again. Repeated world events still use ledger.remember directly
      // and retain their stacking behavior.
      if (!hasMemory(crewKey(c), e.remember.fact)) {
        remember(crewKey(c), e.remember.fact, e.remember.weight, e.remember.note);
        remembered = true;
      }
      continue;
    }
    pass.push(e);
  }
  if (pass.length) applyEffects(pass);
  return remembered;
}

function choiceStakes(ch: CrewDialogueChoice): string {
  const bits: string[] = [];
  for (const e of ch.effects || []) {
    if (typeof e.credits === "number" && e.credits < 0) bits.push(`−${Math.abs(e.credits)}cr`);
    if (e.mission) bits.push("commits the ship");
  }
  if (ch.stakes) bits.push(ch.stakes);
  return bits.length ? ` <span class="choice-stakes">— ${bits.join(" · ")}</span>` : "";
}

function consequenceHTML(ch: CrewDialogueChoice, remembered: boolean): string {
  const mission = (ch.effects || []).find((e: any) => e.mission)?.mission;
  const lines: string[] = [];
  if (mission) lines.push(`Commitment logged: <b>${mission.title}</b>`);
  if (remembered) lines.push("This will shape how they remember the captain.");
  return lines.length ? `<div class="dialogue-consequence">${lines.join("<br>")}</div>` : "";
}

// ---- rendering ----
let activeKey = "";
let pendingAfter: (() => void) | null = null;

function sceneLoc(): string {
  return S.docked && S.screen === "stationwalk"
    ? `${PLANETS[S.loc].n} · off duty`
    : `${S.shipName} · crew deck`;
}

function headFor(c: CrewMember, node: CrewDialogueNode): string {
  const src = crewPortrait(c, node.expr || "neutral");
  return dialogueHeadHTML(src, "🧑‍🚀", c.name, node.sub || "");
}

// force: true for a direct player action or navigation continuing an
// already-open conversation (replaces in place, never queues behind itself).
// false (default) for the unprompted docking beat (checkCrewDialogueArcs),
// which should queue behind whatever another system may already be showing.
function renderCrewNode(key: string, tree: CrewDialogueTree, nodeKey: string, force = false, consequence = "") {
  const c = findByKey(key);
  const node = tree.nodes[nodeKey];
  if (!c || !node) { activeKey = ""; closeModal(); requestRender(); return; }
  activeKey = key;
  S.flags[key + "_seen_" + nodeKey] = true;
  const buttons = (node.choices || [])
    .map((ch: CrewDialogueChoice, i: number) => ({ ch, i, seen: !!(ch.once && S.flags[key + "_took_" + nodeKey + "_" + i]) }))
    .filter((x) => !x.seen)
    .map((x) => {
      const [ok, why] = checkCrewReq(x.ch.requires, c);
      if (!ok && x.ch.hidden) return "";
      const cls = x.ch.tone === "primary" ? "primary" : x.ch.tone === "danger" ? "danger" : "";
      const hint = !ok && why ? ` <span class="dim">— ${why}</span>` : ok ? choiceStakes(x.ch) : "";
      return `<button class="${cls}" ${ok ? "" : "disabled"} ${actionAttr("crewDialogueChoose", key, nodeKey, x.i)}>${x.ch.label}${hint}</button>`;
    })
    .join("");
  const controls = node.end
    ? `<button class="primary" ${actionAttr("crewDialogueContinue")}>${node.closeLabel || "Leave it there."}</button>`
    : buttons;
  const html = `<div class="scene">
    <div class="scene-loc">${sceneLoc()}</div>
    ${headFor(c, node)}
    <p>${node.text}</p>
    ${consequence}
    <div class="choices">${controls}</div>
  </div>`;
  if (force) replaceModal(html); else modal(html);
}

// Player-initiated: open a registered crew member's tree by their runtime id
// (matches openCrewTalk(id)'s calling convention in systems/crewtalk.ts).
export function openCrewDialogue(id: number) {
  const c = S.crew.find((cm) => cm.id === id);
  const tree = c?.key ? CREW_TREES[c.key] : undefined;
  if (!c || !tree) return;
  pendingAfter = null;
  renderCrewNode(c.key!, tree, tree.nodes.hub ? "hub" : Object.keys(tree.nodes)[0], true);
  requestRender();
}

export function crewDialogueChoose(key: string, nodeKey: string, idx: number) {
  const c = findByKey(key);
  const tree = CREW_TREES[key];
  const node = tree?.nodes[nodeKey];
  if (!c || !node) { closeModal(); return; }
  const ch = node.choices?.[idx];
  if (!ch) return;
  if (!checkCrewReq(ch.requires, c)[0]) return;
  if (ch.once) S.flags[key + "_took_" + nodeKey + "_" + idx] = true;
  const remembered = applyCrewEffects(ch.effects, c);
  const consequence = consequenceHTML(ch, remembered);
  if (ch.log) log(ch.log);
  const after = (showConsequence = true) => {
    if (ch.end) { activeKey = ""; closeModal(); requestRender(); }
    else if (ch.goto) { renderCrewNode(key, tree, ch.goto, true, showConsequence ? consequence : ""); requestRender(); }
    else { renderCrewNode(key, tree, "hub", true, showConsequence ? consequence : ""); requestRender(); } // default: back to the hub, stay talking
  };
  if (ch.reply) {
    pendingAfter = () => after(false);
    const src = crewPortrait(c, ch.expr || node.expr || "neutral");
    replaceModal(`<div class="scene">
      <div class="scene-loc">${sceneLoc()}</div>
      ${dialogueHeadHTML(src, "🧑‍🚀", c.name, "")}
      <p>${ch.reply}</p>
      ${consequence}
      <div class="choices"><button class="primary" ${actionAttr("crewDialogueContinue")}>Continue</button></div>
    </div>`);
    requestRender();
  } else {
    after();
  }
}

export function crewDialogueContinue() {
  const f = pendingAfter; pendingAfter = null;
  if (f) f(); else { closeModal(); requestRender(); }
}

// ---- docking beats — unprompted story pushes, gated + fired once each ----
// Same slot as checkImogenQuest/checkAgendaBeats in travel.ts. Walks every
// registered crew tree in turn and opens the first eligible, un-fired beat
// found across ALL of them. One modal per docking, at most — and ambient
// beats keep a few days' distance from each other (per crew) so nobody
// ambushes the captain at three ports running. Beats marked priority (mission
// completions, planted payoffs) ignore the cooldown: the player earned that
// scene by flying here.
const BEAT_SPACING_DAYS = 4;

export function checkCrewDialogueArcs() {
  if (!S.docked) return;
  for (const key of Object.keys(CREW_TREES)) {
    const c = findByKey(key);
    if (!c) continue;
    const tree = CREW_TREES[key];
    const cd = S.flags[key + "_beat_cooldown"];
    for (const beat of tree.beats || []) {
      if (S.flags[key + "_beat_" + beat.id]) continue;
      if (!beat.priority && typeof cd === "number" && S.day < cd) continue;
      if (!checkCrewReq(beat.requires, c)[0]) continue;
      if (!tree.nodes[beat.node]) continue;
      S.flags[key + "_beat_" + beat.id] = true;
      if (!beat.priority) S.flags[key + "_beat_cooldown"] = S.day + BEAT_SPACING_DAYS;
      renderCrewNode(key, tree, beat.node);
      requestRender();
      return;
    }
  }
}
