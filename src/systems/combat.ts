import { S } from "../state";
import { stats, bribeCost } from "../derive";
import { rand, ri, pick } from "../rng";
import { replaceModal, clearModal } from "../modal";
import { requestRender } from "../bus";
import { gameOver } from "./gameover";
import { damageModule } from "./actions";
import { bark, tellBark } from "./barks";
import { shift } from "./disposition";
import type { Enemy } from "../types";
import * as sfx from "../audio";
import { markVeteranEvent } from "./veterancy";
import { actionAttr } from "../dispatch";

type MoveId = "laser" | "torpedo" | "ion" | "evasive" | "flee" | "bribe" | "decoy" | "gambit";
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
  // alternate solutions — once each per engagement
  decoyUsed: boolean;
  gambitUsed: boolean;
  dampen: number;      // rounds of halved incoming (mechanic's cold restart)
  evadeBoost: number;  // additive flee-odds bonus this combat
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
    decoyUsed: false,
    gambitUsed: false,
    dampen: 0,
    evadeBoost: 0,
  };
  if (!tellBark("combat_start")) bark("combat_start", { chance: 0.8 });
  drawCombat();
}

function buildTargets(e: Enemy): CombatTarget[] {
  const primary = makeTarget(e, 0, "Lead", 68, 42);
  const targets = [primary];
  const name = e.name.toLowerCase();
  // Escorts are for genuine warships. A lone Corsair (55 hull) is a hard but
  // honest fight for a two-gun freighter; with an escort it was unwinnable
  // even on perfect aim — playtested, fatal.
  if (e.hull >= 60 || /gunship|interdictor|hunter/.test(name)) {
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

// Drawn silhouettes instead of icon glyphs: each archetype is a tiny inline
// SVG with a pulsing engine and a damage-flicker class as its hull drops.
function foeShipSVG(t: CombatTarget): string {
  const n = t.name.toLowerCase();
  const hp = Math.max(0, t.hull / t.maxhull);
  const cls = t.hull <= 0 ? "" : hp < 0.35 ? " crit" : hp < 0.7 ? " hurt" : "";
  let body: string;
  if (/drone|screen/.test(n)) {
    body = `<path class="fsh" d="M24 5 39 16 24 27 9 16Z"/><circle class="fsc" cx="24" cy="16" r="3.4"/>`;
  } else if (/union|cutter|gunship|hunter|interdictor|lattice|patrol/.test(n)) {
    body = `<path class="fsh" d="M5 20 13 11 40 11 45 15.5 40 20 13 21.5Z"/><rect class="fsh2" x="17" y="6.5" width="13" height="5" rx="2"/><rect class="fsh2" x="34" y="13" width="9" height="2.6" rx="1.2"/><circle class="fse" cx="8" cy="15.8" r="2.4"/>`;
  } else if (/pirate|corsair|skiff|raider|vengeance|seeker|wolf|knife|scav/.test(n)) {
    body = `<path class="fsh" d="M6 16 20 7 44 14 44 18 20 25Z"/><path class="fsf" d="M19 8 28 2.5 33 9.5Z"/><path class="fsf" d="M19 24 28 29.5 33 22.5Z"/><circle class="fse" cx="9.5" cy="16" r="2.4"/>`;
  } else {
    body = `<path class="fsh" d="M6 18 15 8.5 37 8.5 44 16 37 23.5 15 23.5Z"/><rect class="fsh2" x="20" y="12" width="12" height="8" rx="2"/><circle class="fse" cx="9" cy="16" r="2.4"/>`;
  }
  return `<svg class="foe-ship${cls}" viewBox="0 0 48 32">${body}</svg>`;
}

// ---- transient weapon FX ----
// Queued by the combat logic, flushed into the freshly-rendered .battle-window
// right after modal() replaces the DOM — pure CSS animations from there.
interface PendingFX { kind: "shot" | "return"; x: number; y: number; color: string; score?: number; }
let pendingFX: PendingFX[] = [];

function flushFX() {
  const win = document.querySelector(".battle-window") as HTMLElement | null;
  if (!win) { pendingFX = []; return; }
  const px = 44, py = 72; // player nose, in % of the window (hull sits bottom-left)
  for (const fx of pendingFX) {
    const [x1, y1, x2, y2] = fx.kind === "shot" ? [px, py, fx.x, fx.y] : [fx.x, fx.y, px, py];
    const dx = (x2 - x1) * win.clientWidth / 100, dy = (y2 - y1) * win.clientHeight / 100;
    const tr = document.createElement("div");
    tr.className = "fx-tracer" + (fx.kind === "return" ? " ret" : "");
    tr.style.cssText = `left:${x1}%;top:${y1}%;width:${Math.hypot(dx, dy)}px;transform:rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg);color:${fx.color}`;
    tr.innerHTML = "<i></i>";
    win.appendChild(tr);
    const imp = document.createElement("div");
    imp.className = "fx-impact" + ((fx.score ?? 0) > 0.62 ? " big" : "") + (fx.kind === "return" ? " ret" : "");
    imp.style.cssText = `left:${x2}%;top:${y2}%;color:${fx.color}`;
    win.appendChild(imp);
    if (fx.kind === "return") win.classList.add("fx-hit");
  }
  pendingFX = [];
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

function aliveTargets() {
  return C ? C.targets.filter((t) => t.hull > 0) : [];
}

// ---- alternate solutions: not every fight is a shooting problem ----
function isPirateFoe(): boolean {
  return !!C && /pirate|scav|corsair|skiff|raider|lane-wolf/i.test(C.targets[0].name);
}
function cargoTotal(): number { return S.cargo.ore + S.cargo.med + S.cargo.lux; }

// One crew gambit per engagement, chosen by who's actually aboard: an
// ex-pirate talks, a gunner overloads, a mechanic vanishes you sideways.
function gambitInfo(): { kind: string; name: string; desc: string } | null {
  if (!C || C.gambitUsed) return null;
  if (S.crew.some((c) => c.key === "rook") && isPirateFoe())
    return { kind: "parley", name: "Rook's Parley", desc: "he knows these crews by name — talk them down" };
  if (S.crew.some((c) => c.role === "gunner") && stats().inst("weapons") > 0)
    return { kind: "overcharge", name: "Gunner's Overcharge", desc: "one guaranteed perfect lance — hard on the capacitors" };
  if (S.crew.some((c) => c.role === "mechanic"))
    return { kind: "coldstart", name: "Cold Restart", desc: "dump & relight the drive: incoming halved 2 rounds, +20% escape" };
  return null;
}

function availableMoves(): Array<{ id: MoveId; name: string; desc: string }> {
  const list: Array<{ id: MoveId; name: string; desc: string }> = [...MOVES];
  if (C && !C.decoyUsed && isPirateFoe() && cargoTotal() >= 3)
    list.push({ id: "decoy", name: "Cargo Decoy", desc: "jettison 3 goods — raiders break for the loot" });
  const gi = gambitInfo();
  if (gi) list.push({ id: "gambit", name: gi.name, desc: gi.desc });
  return list;
}

function drawCombat() {
  if (!C) return;
  const st = stats();
  const selectedTarget = C.targets.find((t) => t.id === C!.targetId) || aliveTargets()[0];
  const php = Math.max(0, Math.round((S.hull / S.hullMax) * 100));
  const fleeChance = Math.round(fleeOdds() * 100);
  const selectedMove = MOVES.find((m) => m.id === C!.move);

  replaceModal(`<div class="combat">
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
  flushFX();
}

function targetHTML(t: CombatTarget) {
  const hp = Math.max(0, Math.round((t.hull / t.maxhull) * 100));
  const dead = t.hull <= 0;
  const selected = C && C.targetId === t.id;
  return `<button class="space-target ${dead ? "dead" : ""} ${selected ? "selected" : ""}"
      style="left:${t.x}%; top:${t.y}%"
      ${dead || C?.phase === "aim" ? "disabled" : `${actionAttr("cAct", `target:${t.id}`)}`}>
    ${foeShipSVG(t)}
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
  if (C.phase === "over") return `<div class="choices"><button class="primary" ${actionAttr("endCombat")}>Continue</button></div>`;
  if (C.phase === "aim") {
    return `<div class="cbt-command">
      <div class="command-readout">
        <b>${selectedMove ? esc(selectedMove.name) : "Weapon"}</b>
        <span>Targeting ${selectedTarget ? esc(selectedTarget.name) : "hostile"} · wait for the reticle to cross the box.</span>
      </div>
      <button class="primary fire-button" ${actionAttr("cAct", 'release')}>Fire</button>
      <button ${actionAttr("cAct", 'back')}>Back</button>
    </div>`;
  }
  if (C.phase === "target") {
    return `<div class="cbt-command">
      <div class="command-readout">
        <b>${selectedMove ? esc(selectedMove.name) : "Choose Target"}</b>
        <span>Pick a hostile contact in the viewport.</span>
      </div>
      <button ${selectedTarget ? "" : "disabled"} class="primary" ${actionAttr("cAct", 'aim')}>Line Up Shot</button>
      <button ${actionAttr("cAct", 'back')}>Back</button>
    </div>`;
  }
  return `<div class="move-grid">
    ${availableMoves().map((m) => {
    const disabled = (m.id === "bribe" && !C!.targets[0].bribe) ? "disabled" : "";
    const extra = m.id === "flee" ? ` · ${fleeChance}%` : m.id === "bribe" ? ` · ${bribeCost(C!.targets[0].bribe || 0)}cr` : "";
    return `<button ${disabled} ${actionAttr("cAct", `move:${m.id}`)}><b>${esc(m.name)}</b><span>${esc(m.desc)}${extra}</span></button>`;
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
    // Place the target box ON the reticle's actual sweep path (with jitter),
    // so every box is genuinely hittable. Random-rect placement could land
    // where the fixed Lissajous sweep never passes — a great shot denied by
    // dice, which reads as unfair because it is.
    const move = C.move || "laser";
    const speed = (move === "torpedo" ? 1.45 : move === "ion" ? 0.92 : 1.12) * C.scenario.aim;
    const el = 0.6 + rand() * 2.2;
    t.aimX = Math.min(84, Math.max(16, 50 + Math.sin(el * speed * 3.1) * 38 + ri(-4, 4)));
    t.aimY = Math.min(72, Math.max(28, 50 + Math.sin(el * speed * 2.2 + 1.7) * 25 + ri(-4, 4)));
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
  if (move === "decoy") {
    C.decoyUsed = true;
    let need = 3;
    for (const g of ["ore", "med", "lux"]) {
      const d = Math.min(need, S.cargo[g]);
      S.cargo[g] -= d; need -= d;
      if (!need) break;
    }
    if (rand() < 0.85) {
      C.log.push("You blow the hold latches — three units of cargo tumble out, glittering. The hostiles break formation for the loot, and you burn hard the other way.");
      C.phase = "over"; C.result = "fled"; drawCombat(); return;
    }
    C.log.push("They don't even slow down for it — professionals. The cargo spins away, wasted.");
    enemyTurn(false);
    finishRound();
    return;
  }
  if (move === "gambit") {
    const gi = gambitInfo();
    if (!gi) return;
    C.gambitUsed = true;
    if (gi.kind === "parley") {
      if (rand() < 0.65) {
        C.log.push("Rook takes the channel and says four names, a dock number, and a date. Long silence. Then: \"...tell Knife-Eight we're square.\" The hostiles stand down and burn away.");
        C.phase = "over"; C.result = "fled"; drawCombat(); return;
      }
      C.log.push("Whoever's flying today doesn't owe Rook anything. The answer comes back as guns.");
      enemyTurn(false); finishRound(); return;
    }
    if (gi.kind === "overcharge") {
      const t = aliveTargets()[0];
      const st = stats();
      const dmg = Math.max(1, Math.round(st.dmg * 1.75 * 1.4));
      t.hull -= dmg;
      C.log.push(`Your gunner dumps the capacitor bank into one perfect lance: ${dmg} damage to ${t.name}.`);
      const w = S.modules.find((m) => m.t === "weapons" && !m.dmg);
      if (w && rand() < 0.25) { w.dmg = true; C.log.push("The overcharge cooks a weapons bay — it'll need yard time."); }
      if (t.hull <= 0) {
        C.log.push(`${t.name} breaks apart and spins out of formation.`);
        if (!aliveTargets().length) {
          C.log.push("The scope clears. Nothing hostile remains.");
          C.phase = "over"; C.result = "win"; bark("combat_win", { chance: 0.7 }); drawCombat(); return;
        }
      }
      enemyTurn(false); finishRound(); return;
    }
    // coldstart — the mechanic's escape play
    C.dampen = 2;
    C.evadeBoost = 0.2;
    C.log.push("Your mechanic dumps the drive and relights it on a new vector. Every targeting solution behind you goes stale at once.");
    enemyTurn(true);
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
  sfx.weaponFire(C.move as 'laser' | 'torpedo' | 'ion');
  pendingFX.push({ kind: "shot", x: target.x, y: target.y, score,
    color: C.move === "ion" ? "#5aa7ff" : C.move === "torpedo" ? "#e8843b" : "#ffd66b" });
  target.hull -= dmg;
  const grade = score > 0.88 ? "perfect lock" : score > 0.62 ? "solid hit" : score > 0.32 ? "glancing hit" : "wild shot";
  // The grade alone reads as arbitrary when a near-perfect shot lands one
  // tier down — showing the number is what makes the cutoff feel earned.
  C.log.push(`${grade} (${Math.round(score * 100)}%): ${dmg} damage to ${target.name}.`);
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
  if (C.dampen > 0) { total = Math.ceil(total * 0.5); C.dampen--; }
  if (total <= 0) return;
  S.hull -= total;
  sfx.hullHit();
  for (const e of aliveTargets()) pendingFX.push({ kind: "return", x: e.x, y: e.y, color: "#ff5d4d" });
  C.log.push(`Hostiles rake the hull for ${total} damage${evasive ? " through evasive maneuvers" : ""}.`);
  if (S.hull <= 0) {
    C.log.push("Alarms. Fire. Silence.");
    C.phase = "over"; C.result = "dead"; return;
  }
  if (total >= 8 && rand() < 0.25 && damageModule("Direct hit")) {
    sfx.systemDamage();
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
  return 0.35 + (st.has("pilot") ? 0.25 : 0) + S.engineLvl * 0.08 + (C?.evadeBoost || 0);
}

export function endCombat() {
  if (!C) return;
  const r = C.result;
  const onWin = C.onWin, onEscape = C.onEscape;
  C = null;
  clearModal();
  if (r === "dead") { gameOver("Your ship broke apart under enemy fire. The black keeps what it takes."); return; }
  if (r === "win") {
    const gunner = S.crew.find((c) => c.role === "gunner");
    if (gunner) markVeteranEvent(gunner);
    if (onWin) onWin();
  }
  if (r === "fled" && onEscape) onEscape();
  requestRender();
}
