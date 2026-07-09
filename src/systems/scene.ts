// Data-driven NPC scenes: a small dialogue interpreter over content/npcs.json.
// A scene is a graph of nodes; each choice can gate on state (requires), apply
// effects (the shared DSL), speak a reply, and jump to another node. This is how
// station characters offer their morally-grey bargains.
import { S } from "../state";
import { NPCS, PLANETS } from "../content";
import type { SceneChoice } from "../content";
import { stats, paxJobs, vipJobs, cargoUsed } from "../derive";
import { modal, closeModal } from "../modal";
import { requestRender } from "../bus";
import { applyEffects } from "./scheduler";

// ---- requirement checks (shared by scene choices and NPC gates) ----
export function checkReq(req?: Record<string, any>): [boolean, string] {
  if (!req) return [true, ""];
  const st = stats();
  if (req.credits !== undefined && S.credits < req.credits) return [false, `need ${req.credits}cr`];
  if (req.pax) {
    const free = (st.paxCap - paxJobs().length) + (st.vipCap - vipJobs().length);
    if (free < req.pax) return [false, "no free berth"];
  }
  if (req.cargo) {
    if (st.cargoCap - cargoUsed() < req.cargo) return [false, `need ${req.cargo} cargo space`];
  }
  if (req.prestige !== undefined && S.prestige < req.prestige) return [false, `need ${req.prestige}★`];
  if (req.rep && S.rep[req.rep[0]] < req.rep[1]) return [false, `need ${req.rep[0]} rep`];
  if (req.repMax && S.rep[req.repMax[0]] > req.repMax[1]) return [false, "reputation too high"];
  if (req.dispo && (S.disposition as any)[req.dispo[0]] < req.dispo[1]) return [false, "not your reputation"];
  if (req.dispoMax && (S.disposition as any)[req.dispoMax[0]] > req.dispoMax[1]) return [false, "not your reputation"];
  if (req.flag && !S.flags[req.flag]) return [false, "locked"];
  if (req.flagNot && S.flags[req.flagNot]) return [false, "already done"];
  if (req.crew && S.crew.length < req.crew) return [false, "need crew aboard"];
  return [true, ""];
}

// Should this NPC appear right now (planet + gate)?
export function npcAvailable(key: string): boolean {
  const npc = NPCS[key];
  if (!npc) return false;
  if (npc.planets && npc.planets !== "any" && !(npc.planets as string[]).includes(S.loc)) return false;
  return checkReq(npc.gate)[0];
}

// NPC keys present in a given station room, on this world, right now.
export function npcsInRoom(room: string): string[] {
  return Object.keys(NPCS).filter((k) => NPCS[k].room === room && npcAvailable(k));
}

// ---- scene rendering ----
let pendingAfter: (() => void) | null = null;

export function openNPC(key: string) {
  if (!NPCS[key]) return;
  renderNode(key, "start");
}

function renderNode(key: string, nodeKey: string) {
  const npc = NPCS[key];
  const node = npc.nodes[nodeKey];
  if (!node) { closeModal(); requestRender(); return; }
  const choices = node.choices.map((c: SceneChoice, i: number) => {
    const [ok, why] = checkReq(c.requires);
    return `<button ${ok ? "" : "disabled"} onclick="sceneChoose('${key}','${nodeKey}',${i})">${c.label}${ok ? "" : ` <span class="dim">— ${why}</span>`}</button>`;
  }).join("");
  modal(`<div class="scene"><div class="scene-loc">${PLANETS[S.loc].n} · station</div>
    <h2>${npc.icon || "◆"} ${npc.name}</h2>
    <p>${node.text}</p>
    <div class="choices">${choices}</div></div>`);
}

export function sceneChoose(key: string, nodeKey: string, idx: number) {
  const npc = NPCS[key];
  const c = npc.nodes[nodeKey].choices[idx];
  if (!c) return;
  if (!checkReq(c.requires)[0]) return;
  if (c.effects) applyEffects(c.effects);
  const after = () => {
    if (c.end || !c.goto) { closeModal(); requestRender(); }
    else { renderNode(key, c.goto); requestRender(); }
  };
  if (c.reply) {
    pendingAfter = after;
    modal(`<div class="scene"><h2>${npc.icon || "◆"} ${npc.name}</h2>
      <p>${c.reply}</p>
      <div class="choices"><button class="primary" onclick="sceneContinue()">Continue</button></div></div>`);
  } else {
    after();
  }
}

export function sceneContinue() {
  const f = pendingAfter; pendingAfter = null;
  if (f) f(); else { closeModal(); requestRender(); }
}
