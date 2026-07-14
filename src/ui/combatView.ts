// The view half of ship combat. Everything that used to live inside
// systems/combat.ts as HTML, inline SVG, DOM tracer effects, and the WebGL
// avatar mount now lives here; the sim emits render / fx / teardown through the
// bus (see bus.ts) and this module turns those into pixels.
//
// It reads the fight through combatVM() — a plain-data snapshot — and never
// touches combat's internals. That's the seam that makes the fight portable: a
// C# host swaps this file for its own renderer and the sim doesn't change.
import { S } from "../state";
import { actionAttr } from "../dispatch";
import { modal, replaceModal, clearModal, modalHTML } from "../modal";
import { combatVM, type CombatVM, type CombatVMTarget } from "../systems/combat";
import type { CombatFXEvent, CombatViewSink } from "../bus";
import { mountCombatAvatar, teardownCombatAvatar, updateCombatAvatar } from "./combatAvatar3d";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

// Drawn silhouettes instead of icon glyphs: each archetype is a tiny inline
// SVG with a pulsing engine and a damage-flicker class as its hull drops.
function foeShipSVG(t: CombatVMTarget): string {
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

function targetHTML(t: CombatVMTarget, phase: CombatVM["phase"]): string {
  const hp = Math.max(0, Math.round((t.hull / t.maxhull) * 100));
  return `<button class="space-target ${t.dead ? "dead" : ""} ${t.selected ? "selected" : ""}"
      style="left:${t.x}%; top:${t.y}%"
      ${t.dead || phase === "aim" ? "disabled" : actionAttr("cAct", `target:${t.id}`)}>
    ${foeShipSVG(t)}
    <span class="target-name">${esc(t.role)}</span>
    <span class="target-hp"><i style="width:${hp}%"></i></span>
  </button>`;
}

function aimHTML(t: CombatVMTarget, move: CombatVM["move"]): string {
  const m = move || "laser";
  const tight = m === "torpedo" ? "tight" : m === "ion" ? "wide" : "";
  return `<div class="aim-layer">
    <div class="aim-box ${tight}" style="left:${t.aimX}%; top:${t.aimY}%"></div>
    <div class="aim-reticle ${tight}"><i></i><b></b></div>
  </div>`;
}

function phaseHTML(vm: CombatVM): string {
  if (vm.phase === "over") return `<div class="choices"><button class="primary" ${actionAttr("endCombat")}>Continue</button></div>`;
  if (vm.phase === "aim") {
    return `<div class="cbt-command">
      <div class="command-readout">
        <b>${vm.selectedMoveName ? esc(vm.selectedMoveName) : "Weapon"}</b>
        <span>Targeting ${vm.aimTargetName ? esc(vm.aimTargetName) : "hostile"} · wait for the reticle to cross the box.</span>
      </div>
      <button class="primary fire-button" ${actionAttr("cAct", "release")}>Fire</button>
      <button ${actionAttr("cAct", "back")}>Back</button>
    </div>`;
  }
  if (vm.phase === "target") {
    return `<div class="cbt-command">
      <div class="command-readout">
        <b>${vm.selectedMoveName ? esc(vm.selectedMoveName) : "Choose Target"}</b>
        <span>Pick a hostile contact in the viewport.</span>
      </div>
      <button ${vm.aimTargetId !== null ? "" : "disabled"} class="primary" ${actionAttr("cAct", "aim")}>Line Up Shot</button>
      <button ${actionAttr("cAct", "back")}>Back</button>
    </div>`;
  }
  return `<div class="move-grid">
    ${vm.moves.map((m) =>
    `<button ${m.disabled ? "disabled" : ""} ${actionAttr("cAct", `move:${m.id}`)}><b>${esc(m.name)}</b><span>${esc(m.desc)}${m.extra}</span></button>`,
  ).join("")}
  </div>`;
}

function draw(vm: CombatVM): void {
  const php = Math.max(0, Math.round((S.hull / S.hullMax) * 100));
  const aimTarget = vm.phase === "aim" ? vm.targets.find((t) => t.id === vm.aimTargetId) : undefined;

  const html = `<div class="combat">
    <div class="cbt-band">ENGAGEMENT · ${esc(vm.scenario.title)}</div>
    <div class="battle-window">
      <div class="battle-stars"></div>
      <div class="combat-avatar">
        <div class="combat-avatar-stage" data-combat-avatar></div>
        <div class="combat-avatar-tag">${esc(S.captainName || "Captain")}</div>
      </div>
      <div class="player-ship">
        <div class="engine-flare"></div>
        <div class="ship-hull"></div>
      </div>
      ${vm.targets.map((t) => targetHTML(t, vm.phase)).join("")}
      ${aimTarget ? aimHTML(aimTarget, vm.move) : ""}
      <div class="battle-hud">
        <span>${esc(S.shipName)}</span>
        <span>HULL ${Math.max(0, Math.round(S.hull))}/${S.hullMax}</span>
      </div>
    </div>
    <div class="cbt-status">
      <div>
        <b>${esc(vm.scenario.note)}</b>
        <span>${vm.shield ? `Shields absorbing ${vm.shield}/hit.` : "No active shields."}</span>
      </div>
      <div class="mini-gauge"><i style="width:${php}%"></i></div>
    </div>
    ${phaseHTML(vm)}
    <div class="clog">${vm.log.map((l) => "<div>› " + esc(l) + "</div>").join("")}</div>
  </div>`;

  if (modalHTML()?.includes("class=\"combat\"")) replaceModal(html);
  else modal(html);
  flushFX();
  mountAvatar(vm);
}

function mountAvatar(vm: CombatVM): void {
  const stage = typeof document !== "undefined" ? document.querySelector<HTMLElement>("[data-combat-avatar]") : null;
  if (!stage) return;
  mountCombatAvatar(stage, vm.phase, S.appearance?.model);
  updateCombatAvatar(vm.phase);
}

// ---- transient weapon FX ----
// Queued by the sim (combatView.fx), flushed into the freshly-rendered
// .battle-window right after modal() replaces the DOM — pure CSS from there.
let pendingFX: CombatFXEvent[] = [];

function flushFX(): void {
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

// The sink the sim drives through the bus. render() no-ops when there's no
// fight (combatVM() is null) — the same guard the old drawCombat() had.
export const combatViewImpl: CombatViewSink = {
  render() {
    const vm = combatVM();
    if (vm) draw(vm);
  },
  fx(event) {
    pendingFX.push(event);
  },
  teardown() {
    teardownCombatAvatar();
    clearModal();
  },
};
