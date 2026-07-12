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
  // the tactical board: weapons must be routed, shields raised (guarded),
  // and every salvo charges before it leaves the tubes
  wpn: boolean;
  shd: boolean;
  shdGuard: boolean;
  busy: "" | "wpn" | "shd" | "fire";
}

let C: CombatState | null = null;

export function startCombat(e: Enemy, onWin?: () => void, onEscape?: () => void) {
  C = {
    e: { ...e, maxhull: e.hull },
    onWin, onEscape,
    log: ["Contact! " + e.name + " is closing to firing range."],
    over: false,
    wpn: false, shd: false, shdGuard: false, busy: "",
  };
  if (!tellBark("combat_start")) bark("combat_start", { chance: 0.8 });
  drawCombat();
}

// ---- tactical board switches (free actions — the enemy circles while you
// work the panel, weapons crews shouting ranges) ----
export function cSwitch(k: "wpn" | "guard" | "shd") {
  if (!C || C.over || C.busy) return;
  if (k === "guard") { C.shdGuard = true; drawCombat(); return; }
  if (k === "wpn" && !C.wpn) {
    C.busy = "wpn";
    drawCombat();
    setTimeout(() => {
      if (!C) return;
      C.busy = ""; C.wpn = true;
      C.log.push("Weapons capacitors whine up to charge. Targeting solution live.");
      drawCombat();
    }, 700);
    return;
  }
  if (k === "shd" && !C.shd && C.shdGuard && stats().shield > 0) {
    C.busy = "shd";
    drawCombat();
    setTimeout(() => {
      if (!C) return;
      C.busy = ""; C.shd = true;
      C.log.push("Shield emitters flare — the viewport ripples blue at the edges.");
      drawCombat();
    }, 650);
  }
}

// FIRE charges before it executes — hold your nerve while the bar fills.
export function cFire() {
  if (!C || C.over || C.busy || !C.wpn) return;
  C.busy = "fire";
  drawCombat();
  setTimeout(() => {
    if (!C) return;
    C.busy = "";
    cAct("fire");
  }, 800);
}

function foeIcon(name: string): string {
  const n = name.toLowerCase();
  if (/union|cutter|gunship|hunter|interdictor/.test(n)) return "🛰️";
  if (/pirate|corsair|skiff|raider|vengeance|seeker/.test(n)) return "☠️";
  return "🛸";
}

function drawCombat() {
  if (!C) return;
  const st = stats();
  const e = C.e;
  const php = Math.max(0, Math.round((S.hull / S.hullMax) * 100));
  const ehp = Math.max(0, Math.round((e.hull / e.maxhull) * 100));
  const canBribe = e.bribe && !C.over;
  const fleeChance = Math.round((0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08) * 100);
  const gauge = (pct: number, col: string) =>
    `<div class="gauge"><i style="width:${pct}%; background:${col}"></i></div>`;
  modal(`<div class="combat">
    <div class="cbt-band">⚔ ENGAGEMENT ▬ WEAPONS HOT</div>
    <div class="cbt-arena">
      <div class="combatant you">
        <div class="cbt-name">${S.shipName}</div>
        <div class="cbt-ship">🚀</div>
        <div class="cbt-int">HULL ${Math.max(0, Math.round(S.hull))}/${S.hullMax}</div>
        ${gauge(php, php > 40 ? "linear-gradient(90deg,#4f9a55,#6fbf73)" : "linear-gradient(90deg,#a23b3b,#d96b6b)")}
        ${st.shield ? (C.shd ? `<div class="cbt-sub blue">◊ SHIELDS UP −${st.shield}/hit</div>` : `<div class="cbt-sub">◊ shields cold — raise them</div>`) : `<div class="cbt-sub">no shields</div>`}
      </div>
      <div class="cbt-vs">VS<span class="cbt-range">RANGE ${C.over ? "—" : "CLOSE"}</span></div>
      <div class="combatant foe">
        <div class="cbt-name">${e.name}</div>
        <div class="cbt-ship">${foeIcon(e.name)}</div>
        <div class="cbt-int">HULL ${Math.max(0, Math.round(e.hull))}/${e.maxhull}</div>
        ${gauge(ehp, "linear-gradient(90deg,#a23b3b,#d96b6b)")}
        <div class="cbt-sub red">⚠ HOSTILE · ~${e.dmg} dmg/salvo</div>
      </div>
    </div>
    <div class="clog">${C.log.map((l) => "<div>› " + l + "</div>").join("")}</div>
    ${C.over ? `<div class="choices"><button class="primary" onclick="endCombat()">Continue</button></div>` : `
    <div class="cbt-board">
      ${C.wpn
        ? `<div class="cbtsw on"><span class="ls-led"></span><span class="cs-n">WPN PWR</span><span class="cs-s">HOT</span></div>`
        : C.busy === "wpn"
          ? `<div class="cbtsw busy"><span class="ls-led"></span><span class="cs-n">WPN PWR</span><span class="cs-s">···</span></div>`
          : `<button class="cbtsw next" onclick="cSwitch('wpn')"><span class="ls-led"></span><span class="cs-n">WPN PWR</span><span class="cs-s">ROUTE</span></button>`}
      ${st.shield <= 0
        ? `<div class="cbtsw dead"><span class="ls-led"></span><span class="cs-n">SHIELDS</span><span class="cs-s">NO EMITTERS</span></div>`
        : C.shd
          ? `<div class="cbtsw on blue"><span class="ls-led"></span><span class="cs-n">SHIELDS</span><span class="cs-s">UP −${st.shield}</span></div>`
          : C.busy === "shd"
            ? `<div class="cbtsw busy"><span class="ls-led"></span><span class="cs-n">SHIELDS</span><span class="cs-s">···</span></div>`
            : C.shdGuard
              ? `<button class="cbtsw next" onclick="cSwitch('shd')"><span class="ls-led"></span><span class="cs-n">SHIELDS</span><span class="cs-s">RAISE</span></button>`
              : `<button class="cbtsw guardc" onclick="cSwitch('guard')"><span class="cs-n">GUARD</span><span class="cs-s">flip cover</span></button>`}
      ${C.busy === "fire"
        ? `<div class="cbtsw firing"><span class="cs-n">⚡ CHARGING</span><span class="cs-s">▮▮▮</span></div>`
        : `<button class="cbtsw fire${C.wpn ? " armed" : ""}" ${C.wpn && !C.busy ? "" : "disabled"} onclick="cFire()"><span class="cs-n">🎯 FIRE</span><span class="cs-s">${C.wpn ? "salvo ~" + st.dmg : "route power first"}</span></button>`}
    </div>
    <div class="choices cbt-actions">
      <button ${C.busy ? "disabled" : ""} onclick="cAct('brace')">🛡 Evasive maneuvers <span class="dim">— halve incoming</span></button>
      <button ${C.busy ? "disabled" : ""} onclick="cAct('flee')">🏃 Flee <span class="dim">— ${fleeChance}% break contact</span></button>
      ${canBribe ? `<button ${C.busy ? "disabled" : ""} onclick="cAct('bribe')">💰 Bribe <span class="dim">— ${bribeCost(e.bribe!)}cr</span></button>` : ""}
    </div>`}
  </div>`);
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
  // enemy turn — shields only help if you actually raised them
  const sh = C.shd ? st.shield : 0;
  let hit = ri(Math.round(e.dmg * 0.7), Math.round(e.dmg * 1.4));
  hit = Math.max(1, hit - sh);
  if (braced) hit = Math.ceil(hit / 2);
  S.hull -= hit;
  C.log.push(`The ${e.name} fires — ${hit} damage${braced ? " (halved)" : ""}${sh ? " (shields absorbed " + sh + ")" : ""}.`);
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
