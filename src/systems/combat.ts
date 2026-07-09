import { S } from "../state";
import { stats, bribeCost } from "../derive";
import { rand, ri } from "../rng";
import { modal, clearModal } from "../modal";
import { requestRender } from "../bus";
import { gameOver } from "./gameover";
import { damageModule } from "./actions";
import { bark, tellBark } from "./barks";
import { shift } from "./disposition";
import type { Enemy } from "../types";

interface CombatState {
  e: Enemy & { maxhull: number };
  onWin?: () => void;
  onEscape?: () => void;
  log: string[];
  over: boolean;
  result?: "win" | "fled" | "dead";
}

let C: CombatState | null = null;

export function startCombat(e: Enemy, onWin?: () => void, onEscape?: () => void) {
  C = {
    e: { ...e, maxhull: e.hull },
    onWin, onEscape,
    log: ["Contact! " + e.name + " is closing to firing range."],
    over: false,
  };
  if (!tellBark("combat_start")) bark("combat_start", { chance: 0.8 });
  drawCombat();
}

function drawCombat() {
  if (!C) return;
  const st = stats();
  const e = C.e;
  const php = Math.max(0, Math.round((S.hull / S.hullMax) * 100));
  const ehp = Math.max(0, Math.round((e.hull / e.maxhull) * 100));
  const canBribe = e.bribe && !C.over;
  modal(`<h2>⚔ ${e.name}</h2>
    <div><b>${S.shipName}</b> — hull ${Math.max(0, Math.round(S.hull))}/${S.hullMax} ${st.shield ? "· shields −" + st.shield + "/hit" : ""}</div>
    <div class="hpbar"><div class="f" style="width:${php}%; background:${php > 40 ? "#6fbf73" : "#d96b6b"}"></div></div>
    <div><b>${e.name}</b> — hull ${Math.max(0, Math.round(e.hull))}/${e.maxhull}</div>
    <div class="hpbar"><div class="f" style="width:${ehp}%; background:#d96b6b"></div></div>
    <div class="clog">${C.log.map((l) => "<div>› " + l + "</div>").join("")}</div>
    ${C.over ? `<div class="choices"><button class="primary" onclick="endCombat()">Continue</button></div>` :
    `<div class="choices">
      <button onclick="cAct('fire')">🎯 Fire (your damage: ~${st.dmg})</button>
      <button onclick="cAct('brace')">🛡 Evasive maneuvers (halve incoming this turn)</button>
      <button onclick="cAct('flee')">🏃 Flee (${Math.round((0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08) * 100)}% chance)</button>
      ${canBribe ? `<button onclick="cAct('bribe')">💰 Bribe (${bribeCost(e.bribe!)}cr)</button>` : ""}
    </div>`}`);
}

export function cAct(a: string) {
  if (!C) return;
  const st = stats();
  const e = C.e;
  let braced = false;
  if (a === "fire") {
    const dmg = ri(Math.round(st.dmg * 0.7), Math.round(st.dmg * 1.3));
    e.hull -= dmg;
    C.log.push(`You fire — ${dmg} damage to the ${e.name}.`);
    if (e.hull <= 0) {
      C.log.push(`The ${e.name} breaks apart in a slow, silent bloom of fire.`);
      // Beating a heavy opponent builds a daredevil reputation.
      if (e.maxhull >= 60) shift("daring", 2, "beat a heavy warship");
      C.over = true; C.result = "win"; bark("combat_win", { chance: 0.7 }); drawCombat(); return;
    }
  } else if (a === "brace") {
    braced = true;
    C.log.push("You throw the ship into a corkscrew. Hard to hit, hard to keep lunch down.");
  } else if (a === "flee") {
    const chance = 0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08;
    if (rand() < chance) {
      C.log.push("You redline the drive and break contact. Gone.");
      shift("daring", -1, "fled a fight");
      C.over = true; C.result = "fled"; bark("combat_flee", { chance: 0.6 }); drawCombat(); return;
    }
    C.log.push("They match your burn. No escape this pass.");
  } else if (a === "bribe") {
    const cost = bribeCost(e.bribe!);
    if (S.credits >= cost) {
      S.credits -= cost;
      C.log.push(`You transfer ${cost}cr. The ${e.name} peels away, satisfied.`);
      C.over = true; C.result = "fled"; drawCombat(); return;
    }
    C.log.push("Not enough credits. They laugh on an open channel.");
  }
  // enemy turn
  let hit = ri(Math.round(e.dmg * 0.7), Math.round(e.dmg * 1.4));
  hit = Math.max(1, hit - st.shield);
  if (braced) hit = Math.ceil(hit / 2);
  S.hull -= hit;
  C.log.push(`The ${e.name} fires — ${hit} damage${braced ? " (halved)" : ""}${st.shield ? " (shields absorbed " + st.shield + ")" : ""}.`);
  if (S.hull <= 0) {
    C.log.push("Alarms. Fire. Silence.");
    C.over = true; C.result = "dead"; drawCombat(); return;
  }
  // heavy hits can knock a specific module offline
  if (hit >= 8 && rand() < 0.25 && damageModule("Direct hit")) {
    C.log.push("⚠ That one got through to a module — a system just went dark. Check the ship after.");
  }
  drawCombat();
}

export function endCombat() {
  if (!C) return;
  const r = C.result;
  const onWin = C.onWin, onEscape = C.onEscape;
  C = null;
  clearModal();
  if (r === "dead") { gameOver("Your ship broke apart under enemy fire. The black keeps what it takes."); return; }
  if (r === "win" && onWin) onWin();
  if (r === "fled" && onEscape) onEscape();
  requestRender();
}
