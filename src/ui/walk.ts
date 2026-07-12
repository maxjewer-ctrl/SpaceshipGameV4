// Generic free-roam engine shared by the station deck and the ship interior.
// Renders to one persistent <canvas> and runs its own requestAnimationFrame
// loop, independent of the app's string-template render() cycle — so walking
// around isn't interrupted every time an unrelated state change (credits
// ticking, a bark firing) calls requestRender() elsewhere in the game.
import { hasModal } from "../modal";
import { S } from "../state";
import { drawAvatar } from "./avatarDraw";
import * as walk3d from "./walk3d";

export interface WalkRect { x: number; y: number; w: number; h: number; }
export interface WalkDoor extends WalkRect { label: string; locked?: boolean; lockedHint?: string; action: () => void; }
export interface WalkActor extends WalkRect { key: string; label: string; icon?: string; color?: string; role?: string; bubble?: string; verb?: string; onInteract: () => void; }
export interface WalkRoom extends WalkRect { id: string; label: string; icon?: string; color?: string; kind?: string; moduleIndex?: number; moduleType?: string; }
export interface WalkScene {
  id: string;                 // unique per context — changing it remounts at spawn
  title: string;
  status: string;
  width: number; height: number;
  floors: WalkRect[];         // walkable region (union of rects)
  rooms: WalkRoom[];          // labeled footprints; also used for "which room am I in"
  roomDesc?: Record<string, string>;
  doors: WalkDoor[];
  actors: WalkActor[];
  spawn: { x: number; y: number };
  dark?: boolean;
  onTick?: (moving: boolean, dt: number, roomId: string | null) => void;
}

let scene: WalkScene | null = null;
let mountedId: string | null = null;
const savedPos: Record<string, { x: number; y: number }> = {};
let pos = { x: 0, y: 0 };
let facing: "up" | "down" | "left" | "right" = "down";
let walkPhase = 0;
let moving = false;
const keys = new Set<string>();
const gpDirs = new Set<string>();
let gpPrevA = false;
const GP_DEADZONE = 0.35;
let raf: number | null = null;
let last = 0;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let listenersBound = false;
let nearDoor: WalkDoor | null = null;
let nearActor: WalkActor | null = null;
let clickTarget: { x: number; y: number } | null = null;
let clickStuck = 0;
let highlightKey: string | null = null;

// Roster panel -> canvas: flash a ring around one actor when its row is clicked.
export function setHighlight(key: string | null) { highlightKey = key; }

const KEYMAP: Record<string, string> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
};

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener("keydown", (e) => {
    if (!scene) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const dir = KEYMAP[e.code];
    if (dir) { keys.add(dir); clickTarget = null; e.preventDefault(); return; }
    if (e.code === "KeyE" || e.code === "Space") { e.preventDefault(); interact(); }
  });
  document.addEventListener("keyup", (e) => {
    const dir = KEYMAP[e.code];
    if (dir) keys.delete(dir);
  });
}

function bindCanvas() {
  if (!canvas) return;
  canvas.addEventListener("pointerdown", (e) => {
    if (!scene || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = scene.width / rect.width;
    const sy = scene.height / rect.height;
    const tx = (e.clientX - rect.left) * sx;
    const ty = (e.clientY - rect.top) * sy;
    clickTarget = { x: tx, y: ty };
  });
}

export function needsMount(id: string): boolean { return mountedId !== id; }

export function mountHTML(s: WalkScene): string {
  const dpad = (dir: string, glyph: string, cls: string) =>
    `<button class="wk-dbtn ${cls}" onpointerdown="walkPressStart('${dir}')" onpointerup="walkPressEnd('${dir}')" onpointerleave="walkPressEnd('${dir}')" onpointercancel="walkPressEnd('${dir}')">${glyph}</button>`;
  return `<div class="panel"><h3>${s.title}</h3>
    <div class="cockpit">
    <div class="console con-table">
      <div class="walkscope${s.dark ? " walk-dark" : ""}">
        <div class="scope-head"><span>◄ FREE MOVEMENT ▬ WASD / ARROWS ►</span><span class="sh-r" id="wk-room"></span></div>
        <div class="walk-viewport" style="aspect-ratio:${s.width}/${s.height}">
          <canvas id="walkcanvas" width="${s.width}" height="${s.height}"></canvas>
          <div class="walk-prompt" id="wk-prompt"></div>
        </div>
        <div class="scope-foot"><span id="wk-status"></span><span>[E] interact</span></div>
      </div>
    </div>
    <p class="dim" id="wk-desc" style="margin-top:8px; min-height:16px"></p>
    <div class="walk-controls">
      <div class="walk-dpad">
        ${dpad("up", "▲", "wk-up")}
        <div class="wk-dpad-mid">${dpad("left", "◀", "wk-left")}<button class="wk-dbtn wk-interact" onclick="walkInteract()">E</button>${dpad("right", "▶", "wk-right")}</div>
        ${dpad("down", "▼", "wk-down")}
      </div>
      <div class="walk-fallback" id="wk-fallback"></div>
    </div>
    </div>
  </div>`;
}

export function start(s: WalkScene) {
  // Walking straight from one walk scene into another (station -> ship's
  // airlock, or back) never calls teardown(); persist the outgoing position
  // the same way teardown() would, so re-entering later resumes, not respawns.
  if (scene && scene.id !== s.id) savedPos[scene.id] = { ...pos };
  scene = s;
  mountedId = s.id;
  pos = savedPos[s.id] ? { ...savedPos[s.id] } : { ...s.spawn };
  facing = "down"; walkPhase = 0; moving = false; keys.clear();
  nearDoor = null; nearActor = null;
  canvas = document.getElementById("walkcanvas") as HTMLCanvasElement | null;
  ctx = canvas ? canvas.getContext("2d") : null;
  bindListeners();
  bindCanvas();
  walk3d.mount(canvas?.parentElement || null, s, (x, y) => { clickTarget = { x, y }; });
  last = performance.now();
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

// Called on every render() while a walk screen is active: refresh scene data
// (doors/actors may have changed — an NPC resolved, a module got bought)
// WITHOUT resetting position or restarting the loop, unless the scene id
// itself changed (a real context switch), in which case it remounts fresh.
export function ensureRunning(s: WalkScene) {
  if (mountedId !== s.id) { start(s); return; }
  scene = s;
  walk3d.setScene(s);
}

export function teardown() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (scene) savedPos[scene.id] = { ...pos };
  scene = null; mountedId = null; canvas = null; ctx = null;
  keys.clear(); clickTarget = null;
  walk3d.teardown();
}

export function forgetSpawn(sceneId: string) { delete savedPos[sceneId]; }

export function pressStart(dir: string) { keys.add(dir); }
export function pressEnd(dir: string) { keys.delete(dir); }

export function interact() {
  if (hasModal()) return;
  if (nearDoor && !nearDoor.locked) nearDoor.action();
  else if (nearActor) nearActor.onInteract();
}

// ---- gamepad (Xbox/standard-mapping USB controllers) ----
// Polled once per frame in simulate() rather than event-driven — the Gamepad
// API has no change events, only a snapshot you read each tick.
function pollGamepad() {
  gpDirs.clear();
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) { gpPrevA = false; return; }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (ay < -GP_DEADZONE || gp.buttons[12]?.pressed) gpDirs.add("up");
  if (ay > GP_DEADZONE || gp.buttons[13]?.pressed) gpDirs.add("down");
  if (ax < -GP_DEADZONE || gp.buttons[14]?.pressed) gpDirs.add("left");
  if (ax > GP_DEADZONE || gp.buttons[15]?.pressed) gpDirs.add("right");
  const aPressed = !!gp.buttons[0]?.pressed;
  if (aPressed && !gpPrevA) interact();
  gpPrevA = aPressed;
}

// ---- geometry ----
function clampNum(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function roomAt(px: number, py: number): WalkRoom | null {
  if (!scene) return null;
  return scene.rooms.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
}
function insideFloors(px: number, py: number): boolean {
  if (!scene) return false;
  const r = 9;
  const pts: [number, number][] = [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r]];
  return pts.every(([cx, cy]) => scene!.floors.some((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h));
}
export function walkInsideFloors(px: number, py: number): boolean { return insideFloors(px, py); }
// Move from `from` toward `to` along one axis; if the full step is illegal,
// binary-search the furthest legal point instead of rejecting outright.
function creepAxis(from: number, to: number, legal: (v: number) => boolean): number {
  if (legal(to)) return to;
  if (!legal(from)) return from; // already illegal (shouldn't happen) — don't wander further
  let lo = from, hi = to;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (legal(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

function rectDist(px: number, py: number, r: WalkRect): number {
  const cx = clampNum(px, r.x, r.x + r.w), cy = clampNum(py, r.y, r.y + r.h);
  return Math.hypot(px - cx, py - cy);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0) % 628; // 0..2π*100, cheap phase spread
}

// Simple canvas set-dressing per room kind — cheap shapes, no assets, just
// enough silhouette that a cockpit doesn't look like an engine room.
function drawProps(c: CanvasRenderingContext2D, r: WalkRoom, dark?: boolean) {
  const lineC = dark ? "#3a3d46" : "#3a4256";
  const fillC = dark ? "#1a1c22" : "#161a28";
  c.save();
  c.strokeStyle = lineC; c.fillStyle = fillC; c.lineWidth = 1.5;
  if (r.kind === "cockpit") {
    // console arc along the forward wall
    c.beginPath();
    c.moveTo(r.x + 14, r.y + r.h - 14);
    c.quadraticCurveTo(r.x + r.w / 2, r.y + r.h - 34, r.x + r.w - 14, r.y + r.h - 14);
    c.lineTo(r.x + r.w - 14, r.y + r.h - 6); c.lineTo(r.x + 14, r.y + r.h - 6); c.closePath();
    c.fill(); c.stroke();
    for (let i = 0; i < 4; i++) {
      const bx = r.x + r.w / 2 - 40 + i * 26;
      c.fillStyle = i % 2 === 0 ? "#5aa7ff55" : "#e8b04b55";
      c.fillRect(bx, r.y + r.h - 22, 8, 5);
    }
    c.fillStyle = fillC;
  } else if (r.kind === "engine") {
    // drive core column
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.strokeStyle = "#e8843b77"; c.stroke();
  } else if (r.kind === "cargo") {
    // crate stack
    for (let i = 0; i < 3; i++) {
      const bx = r.x + 16 + (i % 2) * 30, by = r.y + r.h - 26 - Math.floor(i / 2) * 26;
      c.fillRect(bx, by, 24, 22); c.strokeRect(bx, by, 24, 22);
    }
  } else if (r.kind === "quarters") {
    // bunks along the back wall
    for (let i = 0; i < 2; i++) {
      const bx = r.x + 16 + i * (r.w - 44);
      c.fillRect(bx, r.y + r.h - 40, 28, 26); c.strokeRect(bx, r.y + r.h - 40, 28, 26);
    }
  } else if (r.kind === "medbay") {
    // a bed + a cross
    c.fillRect(r.x + 18, r.y + r.h - 34, 40, 18); c.strokeRect(r.x + 18, r.y + r.h - 34, 40, 18);
    c.strokeStyle = "#6fbf7377";
    c.beginPath(); c.moveTo(r.x + r.w - 24, r.y + 18); c.lineTo(r.x + r.w - 24, r.y + 30); c.moveTo(r.x + r.w - 30, r.y + 24); c.lineTo(r.x + r.w - 18, r.y + 24); c.stroke();
  } else if (r.kind === "hydro") {
    // planter rows
    for (let i = 0; i < 3; i++) {
      const ry = r.y + r.h - 20 - i * 12;
      c.fillStyle = "#6fbf7333";
      c.fillRect(r.x + 14, ry, r.w - 28, 8);
      c.strokeStyle = "#6fbf7355"; c.strokeRect(r.x + 14, ry, r.w - 28, 8);
    }
  }
  c.restore();
}

// ---- loop ----
function tick(t: number) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  simulate(dt);
  raf = requestAnimationFrame(tick);
}

// Debug-only: advance the simulation by one manual step, bypassing
// requestAnimationFrame. Mirrors the __S debug accessor in main.ts — needed
// because rAF is suspended entirely in backgrounded/headless preview tabs,
// which would otherwise make the walk screens untestable end-to-end.
export function debugStep(dtSeconds: number) { simulate(dtSeconds); }
export function debugPos() { return { ...pos }; }
export function debugActors() { return scene ? scene.actors.map((a) => ({ key: a.key, x: a.x, y: a.y, bubble: a.bubble || "" })) : []; }
// Debug-only: teleport (bypasses collision) for exercising room/door/actor
// detection directly, once movement collision itself is verified separately.
export function debugGoto(x: number, y: number) { pos = { x, y }; simulate(0); }

function simulate(dt: number) {
  if (!scene) return; // torn down mid-frame
  pollGamepad();
  if (!hasModal()) {
    let vx = 0, vy = 0;
    if (keys.has("up") || gpDirs.has("up")) vy -= 1;
    if (keys.has("down") || gpDirs.has("down")) vy += 1;
    if (keys.has("left") || gpDirs.has("left")) vx -= 1;
    if (keys.has("right") || gpDirs.has("right")) vx += 1;
    // Point-and-click: move toward click target when no keys held
    if (!vx && !vy && clickTarget) {
      const dx = clickTarget.x - pos.x;
      const dy = clickTarget.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) { clickTarget = null; clickStuck = 0; }
      else { vx = dx / dist; vy = dy / dist; }
    }
    moving = !!(vx || vy);
    if (moving) {
      const len = Math.hypot(vx, vy) || 1;
      vx /= len; vy /= len;
      const speed = 230;
      const nx = pos.x + vx * speed * dt;
      const ny = pos.y + vy * speed * dt;
      // Creep to the wall rather than hard-rejecting the whole step: a large
      // dt (a frame stutter, or a coarse test step) would otherwise leave the
      // player stuck a few px short of a legal position at any corridor seam.
      const prevX = pos.x, prevY = pos.y;
      pos.x = creepAxis(pos.x, nx, (v) => insideFloors(v, pos.y));
      pos.y = creepAxis(pos.y, ny, (v) => insideFloors(pos.x, v));
      if (clickTarget && Math.hypot(pos.x - prevX, pos.y - prevY) < 0.5) {
        clickStuck += dt;
        if (clickStuck > 0.3) { clickTarget = null; clickStuck = 0; }
      } else { clickStuck = 0; }
      if (Math.abs(vx) > Math.abs(vy)) facing = vx > 0 ? "right" : "left";
      else if (vy !== 0) facing = vy > 0 ? "down" : "up";
      walkPhase += dt * 9;
    }
    nearDoor = null;
    let bestD = 46;
    for (const d of scene.doors) { const dd = rectDist(pos.x, pos.y, d); if (dd < bestD) { bestD = dd; nearDoor = d; } }
    nearActor = null;
    let bestA = 40;
    for (const a of scene.actors) { const dd = Math.hypot(pos.x - (a.x + a.w / 2), pos.y - (a.y + a.h / 2)); if (dd < bestA) { bestA = dd; nearActor = a; } }
    scene.onTick?.(moving, dt, roomAt(pos.x, pos.y)?.id ?? null);
  } else {
    moving = false;
  }
  draw();
  walk3d.render({ pos, facing, moving, phase: walkPhase, nearDoor, nearActor, time: last });
  updateHud();
}

// ---- drawing ----
function draw() {
  if (!ctx || !canvas || !scene) return;
  const { width: W, height: H } = scene;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#070910";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = scene.dark ? "#4a4f5c14" : "#e8b04b12";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 24) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
  for (const f of scene.floors) { ctx.fillStyle = scene.dark ? "#12141a" : "#11141d"; ctx.fillRect(f.x, f.y, f.w, f.h); }
  ctx.font = "12px Consolas, monospace";
  for (const r of scene.rooms) {
    ctx.strokeStyle = scene.dark ? "#3a3d46" : (r.color || "#2a3048");
    ctx.lineWidth = 2;
    ctx.globalAlpha = r.color ? 0.6 : 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = scene.dark ? "#6a6f7c" : "#7d8294";
    ctx.textAlign = "left";
    ctx.fillText(`${r.icon || ""} ${r.label}`.trim(), r.x + 10, r.y + 18);
    if (r.kind) drawProps(ctx, r, scene.dark);
  }
  for (const d of scene.doors) {
    const isNear = d === nearDoor;
    ctx.strokeStyle = d.locked ? "#5a2f2f" : isNear ? "#e8b04b" : "#5b8dd9";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(d.x, d.y, d.w, d.h);
    ctx.setLineDash([]);
    ctx.fillStyle = d.locked ? "#a25b5b" : isNear ? "#e8b04b" : "#8aa8d9";
    ctx.textAlign = "center";
    ctx.font = "10px Consolas, monospace";
    ctx.fillText(d.label, d.x + d.w / 2, d.y - 6);
    ctx.font = "12px Consolas, monospace";
  }
  for (const a of scene.actors) {
    // gentle idle bob, out of phase per actor so a crowded room doesn't
    // breathe in unison — purely cosmetic, doesn't touch a.x/a.y or collision
    const seed = hashStr(a.key);
    const bob = Math.sin(last / 700 + seed) * 2;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2 + bob;
    const isNear = a === nearActor;
    ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = a.color || "#d9a55b";
    ctx.globalAlpha = isNear ? 1 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isNear ? "#e8b04b" : "#00000055";
    ctx.lineWidth = isNear ? 2 : 1;
    ctx.stroke();
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#0a0c12";
    ctx.fillText(a.icon || "●", cx, cy + 1);
    ctx.textBaseline = "alphabetic";
    ctx.font = "10px Consolas, monospace";
    ctx.fillStyle = isNear ? "#e8b04b" : "#9aa0b4";
    ctx.fillText(a.label, cx, a.y + a.h + 13);
    if (a.key === highlightKey) {
      ctx.beginPath(); ctx.arc(cx, cy, 20 + Math.sin(last / 140) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#e8b04b"; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  if (clickTarget) {
    ctx.beginPath(); ctx.arc(clickTarget.x, clickTarget.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = scene.dark ? "#8a8fa066" : "#e8b04b66";
    ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  // The captain's chosen avatar (character creator) — same renderer as the
  // creator preview, so the sprite you walk is the one you built.
  drawAvatar(ctx, pos.x, pos.y, S.appearance, { dir: facing, moving, phase: walkPhase, dark: scene.dark });
}

function updateHud() {
  if (!scene) return;
  const r = roomAt(pos.x, pos.y);
  const roomEl = document.getElementById("wk-room");
  if (roomEl) roomEl.textContent = "◉ " + (r ? r.label.toUpperCase() : "CORRIDOR");
  const statusEl = document.getElementById("wk-status");
  if (statusEl) statusEl.textContent = scene.status;
  const descEl = document.getElementById("wk-desc");
  if (descEl) {
    const d = (r && scene.roomDesc && scene.roomDesc[r.id]) || "";
    if (descEl.textContent !== d) descEl.textContent = d;
  }
  const promptEl = document.getElementById("wk-prompt");
  if (promptEl) {
    const text = nearDoor ? (nearDoor.locked ? (nearDoor.lockedHint || "Locked.") : `[E] ${nearDoor.label}`)
      : nearActor ? `[E] ${nearActor.verb || "Talk to"} ${nearActor.label}` : "";
    if (promptEl.textContent !== text) promptEl.textContent = text;
    promptEl.style.opacity = text ? "1" : "0";
  }
  const fbEl = document.getElementById("wk-fallback");
  if (fbEl) {
    const key = nearDoor ? (nearDoor.locked ? "" : "d:" + nearDoor.label) : nearActor ? "a:" + nearActor.key : "";
    if (fbEl.dataset.key !== key) {
      fbEl.dataset.key = key;
      if (nearDoor && !nearDoor.locked) fbEl.innerHTML = `<button class="primary" onclick="walkInteract()">${nearDoor.label}</button>`;
      else if (nearActor) fbEl.innerHTML = `<button class="primary" onclick="walkInteract()">${nearActor.verb || "Talk to"} ${nearActor.label}</button>`;
      else fbEl.innerHTML = "";
    }
  }
}
