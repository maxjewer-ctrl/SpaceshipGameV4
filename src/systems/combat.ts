import { S } from "../state";
import { stats, bribeCost } from "../derive";
import { rand, ri, pick } from "../rng";
import { modal, clearModal } from "../modal";
import { requestRender } from "../bus";
import { gameOver } from "./gameover";
import { damageModule } from "./actions";
import { bark, tellBark } from "./barks";
import { shift } from "./disposition";
import type { Enemy } from "../types";

type MoveId = "laser" | "torpedo" | "ion" | "evasive" | "flee" | "bribe";
type CombatPhase = "command" | "target" | "aim" | "over";

interface CombatTarget extends Enemy {
  id: number;
  maxhull: number;
  role: string;
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  ion: number;
}

interface Scenario {
  title: string;
  note: string;
  aim: number;
  enemy: number;
}

interface CombatState {
  targets: CombatTarget[];
  onWin?: () => void;
  onEscape?: () => void;
  log: string[];
  phase: CombatPhase;
  result?: "win" | "fled" | "dead";
  move: MoveId | null;
  targetId: number | null;
  aimStart: number;
  scenario: Scenario;
}

const MOVES: Array<{ id: MoveId; name: string; desc: string; needsTarget?: boolean }> = [
  { id: "laser", name: "Pulse Cannons", desc: "steady damage, forgiving sight picture", needsTarget: true },
  { id: "torpedo", name: "Proton Lance", desc: "heavy burst, narrow timing window", needsTarget: true },
  { id: "ion", name: "Ion Rake", desc: "light damage, weakens the target salvo", needsTarget: true },
  { id: "evasive", name: "Juke Vector", desc: "skip weapons and halve incoming fire" },
  { id: "flee", name: "Break Contact", desc: "burn hard and try to escape" },
  { id: "bribe", name: "Open Channel", desc: "pay them off when they are willing" },
];

const SCENARIOS: Scenario[] = [
  { title: "Debris Moon Slingshot", note: "Chunks of nickel-iron tumble through the firing lane.", aim: 1.12, enemy: 0.92 },
  { title: "Blue Giant Backlight", note: "Their silhouettes flare white against the starwash.", aim: 0.86, enemy: 1.04 },
  { title: "Station Graveyard", note: "Dead docking arms drift between both ships.", aim: 1.02, enemy: 0.96 },
  { title: "Ion Storm Ambush", note: "Static crawls across the glass and makes every lock slippery.", aim: 1.22, enemy: 0.9 },
  { title: "Open Black Intercept", note: "No cover. No weather. Just engines and nerve.", aim: 0.94, enemy: 1 },
];

let C: CombatState | null = null;

export function startCombat(e: Enemy, onWin?: () => void, onEscape?: () => void) {
  const scenario = pick(SCENARIOS);
  C = {
    targets: buildTargets(e),
    onWin,
    onEscape,
    log: [`${scenario.title}: ${e.name} slides into weapons range.`],
    phase: "command",
    move: null,
    targetId: null,
    aimStart: 0,
    scenario,
  };
  if (!tellBark("combat_start")) bark("combat_start", { chance: 0.8 });
  drawCombat();
}

function buildTargets(e: Enemy): CombatTarget[] {
  const primary = makeTarget(e, 0, "Lead", 68, 42);
  const targets = [primary];
  const name = e.name.toLowerCase();
  if (e.hull >= 48 || /corsair|gunship|interdictor|hunter/.test(name)) {
    targets.push(makeTarget({ name: escortName(e.name), hull: Math.max(16, Math.round(e.hull * 0.38)), dmg: Math.max(4, Math.round(e.dmg * 0.45)) }, 1, "Escort", 42, 58));
  }
  if (e.hull >= 75 || /interdictor/.test(name)) {
    targets.push(makeTarget({ name: "Point-Defense Drone", hull: 18, dmg: 5 }, 2, "Screen", 54, 28));
  }
  return targets;
}

function makeTarget(e: Enemy, id: number, role: string, x: number, y: number): CombatTarget {
  return {
    ...e,
    id,
    role,
    maxhull: e.maxhull || e.hull,
    x,
    y,
    aimX: ri(28, 72),
    aimY: ri(28, 72),
    ion: 0,
  };
}

function escortName(name: string) {
  if (/union/i.test(name)) return "Union Wing Cutter";
  if (/pirate|corsair|skiff|raider/i.test(name)) return "Pirate Knife-Fighter";
  return "Escort Skiff";
}

function foeIcon(name: string): string {
  const n = name.toLowerCase();
  if (/drone|screen/.test(n)) return "◆";
  if (/union|cutter|gunship|hunter|interdictor/.test(n)) return "▰";
  if (/pirate|corsair|skiff|raider|vengeance|seeker/.test(n)) return "✦";
  return "◇";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

function aliveTargets() {
  return C ? C.targets.filter((t) => t.hull > 0) : [];
}

function drawCombat() {
  if (!C) return;
  const st = stats();
  const selectedTarget = C.targets.find((t) => t.id === C!.targetId) || aliveTargets()[0];
  const php = Math.max(0, Math.round((S.hull / S.hullMax) * 100));
  const fleeChance = Math.round(fleeOdds() * 100);
  const selectedMove = MOVES.find((m) => m.id === C!.move);

  modal(`<div class="combat">
    <div class="cbt-band">ENGAGEMENT · ${esc(C.scenario.title)}</div>
    <div class="battle-window">
      <div class="battle-stars"></div>
      <div class="player-ship">
        <div class="engine-flare"></div>
        <div class="ship-hull"></div>
      </div>
      ${C.targets.map(targetHTML).join("")}
      ${C.phase === "aim" && selectedTarget ? aimHTML(selectedTarget) : ""}
      <div class="battle-hud">
        <span>${esc(S.shipName)}</span>
        <span>HULL ${Math.max(0, Math.round(S.hull))}/${S.hullMax}</span>
      </div>
    </div>
    <div class="cbt-status">
      <div>
        <b>${esc(C.scenario.note)}</b>
        <span>${st.shield ? `Shields absorbing ${st.shield}/hit.` : "No active shields."}</span>
      </div>
      <div class="mini-gauge"><i style="width:${php}%"></i></div>
    </div>
    ${phaseHTML(selectedMove, selectedTarget, fleeChance)}
    <div class="clog">${C.log.slice(-5).map((l) => "<div>› " + esc(l) + "</div>").join("")}</div>
  </div>`);
}

function targetHTML(t: CombatTarget) {
  const hp = Math.max(0, Math.round((t.hull / t.maxhull) * 100));
  const dead = t.hull <= 0;
  const selected = C && C.targetId === t.id;
  return `<button class="space-target ${dead ? "dead" : ""} ${selected ? "selected" : ""}"
      style="left:${t.x}%; top:${t.y}%"
      ${dead || C?.phase === "aim" ? "disabled" : `onclick="cAct('target:${t.id}')"`}>
    <span class="target-icon">${foeIcon(t.name)}</span>
    <span class="target-name">${esc(t.role)}</span>
    <span class="target-hp"><i style="width:${hp}%"></i></span>
  </button>`;
}

function aimHTML(t: CombatTarget) {
  const move = C?.move || "laser";
  const tight = move === "torpedo" ? "tight" : move === "ion" ? "wide" : "";
  return `<div class="aim-layer">
    <div class="aim-box ${tight}" style="left:${t.aimX}%; top:${t.aimY}%"></div>
    <div class="aim-reticle ${tight}"><i></i><b></b></div>
  </div>`;
}

function phaseHTML(selectedMove: typeof MOVES[number] | undefined, selectedTarget: CombatTarget | undefined, fleeChance: number) {
  if (!C) return "";
  if (C.phase === "over") return `<div class="choices"><button class="primary" onclick="endCombat()">Continue</button></div>`;
  if (C.phase === "aim") {
    return `<div class="cbt-command">
      <div class="command-readout">
        <b>${selectedMove ? esc(selectedMove.name) : "Weapon"}</b>
        <span>Targeting ${selectedTarget ? esc(selectedTarget.name) : "hostile"} · wait for the reticle to cross the box.</span>
      </div>
      <button class="primary fire-button" onclick="cAct('release')">Fire</button>
      <button onclick="cAct('back')">Back</button>
    </div>`;
  }
  if (C.phase === "target") {
    return `<div class="cbt-command">
      <div class="command-readout">
        <b>${selectedMove ? esc(selectedMove.name) : "Choose Target"}</b>
        <span>Pick a hostile contact in the viewport.</span>
      </div>
      <button ${selectedTarget ? "" : "disabled"} class="primary" onclick="cAct('aim')">Line Up Shot</button>
      <button onclick="cAct('back')">Back</button>
    </div>`;
  }
  return `<div class="move-grid">
    ${MOVES.map((m) => {
    const disabled = (m.id === "bribe" && !C!.targets[0].bribe) ? "disabled" : "";
    const extra = m.id === "flee" ? ` · ${fleeChance}%` : m.id === "bribe" ? ` · ${bribeCost(C!.targets[0].bribe || 0)}cr` : "";
    return `<button ${disabled} onclick="cAct('move:${m.id}')"><b>${esc(m.name)}</b><span>${esc(m.desc)}${extra}</span></button>`;
  }).join("")}
  </div>`;
}

export function cAct(action: string) {
  if (!C) return;
  if (action === "back") {
    C.phase = "command"; C.move = null; C.targetId = null; drawCombat(); return;
  }
  if (action.startsWith("move:")) {
    const move = action.slice(5) as MoveId;
    chooseMove(move);
    return;
  }
  if (action.startsWith("target:")) {
    C.targetId = Number(action.slice(7));
    drawCombat();
    return;
  }
  if (action === "aim") {
    const t = C.targets.find((x) => x.id === C!.targetId && x.hull > 0);
    if (!t) return;
    t.aimX = ri(28, 72);
    t.aimY = ri(28, 72);
    C.phase = "aim";
    C.aimStart = Date.now();
    drawCombat();
    return;
  }
  if (action === "release") releaseShot();
}

function chooseMove(move: MoveId) {
  if (!C) return;
  C.move = move;
  if (move === "evasive") {
    C.log.push("You kick lateral thrusters and make the ship a miserable target.");
    enemyTurn(true);
    finishRound();
    return;
  }
  if (move === "flee") {
    if (rand() < fleeOdds()) {
      C.log.push("You redline the drive and break contact. Gone.");
      shift("daring", -1, "fled a fight");
      C.phase = "over"; C.result = "fled"; bark("combat_flee", { chance: 0.6 }); drawCombat(); return;
    }
    C.log.push("They match your burn. No escape this pass.");
    enemyTurn(false);
    finishRound();
    return;
  }
  if (move === "bribe") {
    const bribe = C.targets[0].bribe;
    const cost = bribeCost(bribe || 0);
    if (bribe && S.credits >= cost) {
      S.credits -= cost;
      C.log.push(`You transfer ${cost}cr. The hostile flight peels away, satisfied.`);
      C.phase = "over"; C.result = "fled"; drawCombat(); return;
    }
    C.log.push(bribe ? "Not enough credits. They laugh on an open channel." : "No one answers the money channel.");
    enemyTurn(false);
    finishRound();
    return;
  }
  C.targetId = aliveTargets()[0]?.id ?? null;
  C.phase = "target";
  drawCombat();
}

function releaseShot() {
  if (!C || !C.move || C.targetId === null) return;
  const target = C.targets.find((t) => t.id === C!.targetId && t.hull > 0);
  if (!target) return;
  const score = aimScore(target);
  const st = stats();
  let base = st.dmg;
  if (C.move === "torpedo") base *= 1.75;
  if (C.move === "ion") base *= 0.65;
  if (C.move === "laser") base *= 1.05;
  const dmg = Math.max(1, Math.round(base * (0.3 + score * 1.15)));
  target.hull -= dmg;
  const grade = score > 0.88 ? "perfect lock" : score > 0.62 ? "solid hit" : score > 0.32 ? "glancing hit" : "wild shot";
  C.log.push(`${grade}: ${dmg} damage to ${target.name}.`);
  if (C.move === "ion" && target.hull > 0) {
    target.ion = 2;
    C.log.push(`${target.name}'s firing solution flickers under ion wash.`);
  }
  if (target.hull <= 0) C.log.push(`${target.name} breaks apart and spins out of formation.`);
  if (!aliveTargets().length) {
    C.log.push("The scope clears. Nothing hostile remains.");
    if (C.targets[0].maxhull >= 60) shift("daring", 2, "beat a heavy warship");
    C.phase = "over"; C.result = "win"; bark("combat_win", { chance: 0.7 }); drawCombat(); return;
  }
  enemyTurn(false);
  finishRound();
}

function aimScore(target: CombatTarget) {
  if (!C) return 0;
  const move = C.move || "laser";
  const elapsed = (Date.now() - C.aimStart) / 1000;
  const speed = (move === "torpedo" ? 1.45 : move === "ion" ? 0.92 : 1.12) * C.scenario.aim;
  const x = 50 + Math.sin(elapsed * speed * 3.1) * 38;
  const y = 50 + Math.sin(elapsed * speed * 2.2 + 1.7) * 25;
  const dist = Math.hypot(x - target.aimX, y - target.aimY);
  const window = move === "torpedo" ? 27 : move === "ion" ? 46 : 36;
  return Math.max(0, 1 - dist / window);
}

function enemyTurn(evasive: boolean) {
  if (!C) return;
  const st = stats();
  let total = 0;
  for (const e of aliveTargets()) {
    let hit = ri(Math.round(e.dmg * 0.65), Math.round(e.dmg * 1.25));
    hit = Math.round(hit * C.scenario.enemy);
    if (e.ion > 0) {
      hit = Math.ceil(hit * 0.55);
      e.ion--;
    }
    hit = Math.max(1, hit - st.shield);
    if (evasive) hit = Math.ceil(hit / 2);
    total += hit;
  }
  if (total <= 0) return;
  S.hull -= total;
  C.log.push(`Hostiles rake the hull for ${total} damage${evasive ? " through evasive maneuvers" : ""}.`);
  if (S.hull <= 0) {
    C.log.push("Alarms. Fire. Silence.");
    C.phase = "over"; C.result = "dead"; return;
  }
  if (total >= 8 && rand() < 0.25 && damageModule("Direct hit")) {
    C.log.push("That one got through to a module. A system just went dark.");
  }
}

function finishRound() {
  if (!C) return;
  C.phase = C.result ? "over" : "command";
  C.move = null;
  C.targetId = null;
  drawCombat();
}

function fleeOdds() {
  const st = stats();
  return 0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08;
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
