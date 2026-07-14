// Generic free-roam engine shared by the station deck and the ship interior.
// The simulation here (movement, collision, proximity, action verbs) is the
// deterministic authority; ui/walk3d.ts is a Three.js view over it. The sim
// runs its own requestAnimationFrame loop, independent of the app's
// string-template render() cycle — so walking around isn't interrupted every
// time an unrelated state change calls requestRender() elsewhere in the game.
import { hasModal } from "../modal";
import { actionAttr, holdActionAttr } from "../dispatch";
import * as sfx from "../audio";
// Audio is pure polish and browser-only (no AudioContext under jsdom/headless):
// never let a sound failure interrupt the sim.
function sfxSafe(fn: () => void) { try { fn(); } catch { /* no audio here */ } }

export interface WalkRect { x: number; y: number; w: number; h: number; }
export interface WalkDoor extends WalkRect { label: string; locked?: boolean; lockedHint?: string; action: () => void; }
export interface WalkActor extends WalkRect { key: string; label: string; icon?: string; color?: string; role?: string; modelKey?: string; bubble?: string; verb?: string; onInteract: () => void; }
export interface WalkRoom extends WalkRect { id: string; label: string; icon?: string; color?: string; kind?: string; moduleIndex?: number; moduleType?: string; }
// A solid structure you walk AROUND, not on — the inverse of a floor. Buildings
// on an open-ground plaza are obstacles; the door to enter sits on the plaza in
// front of them. `tall` renders it as a full building vs. a low prop/planter.
export interface WalkObstacle extends WalkRect { id?: string; label?: string; icon?: string; color?: string; tall?: boolean; }

// The player's ship, physically present in the scene. THE RULE: every town and
// station shows the ship somewhere, and you board it through the rear hatch —
// never an abstract "leave" button. `facing` is the direction the nose points;
// the hatch is on the opposite (rear) face, and shipHatch() returns the point
// you stand at to board. walk3d renders it; the sim treats its footprint as a
// solid you walk around.
export interface ShipBerth extends WalkRect { facing: "up" | "down" | "left" | "right"; }

// The walkable point just off the rear hatch — where the board door lives.
export function shipHatch(b: ShipBerth): { x: number; y: number } {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, m = 20;
  switch (b.facing) {
    case "up": return { x: cx, y: b.y + b.h + m };   // nose north → hatch south
    case "down": return { x: cx, y: b.y - m };        // nose south → hatch north
    case "left": return { x: b.x + b.w + m, y: cy };  // nose west  → hatch east
    default: return { x: b.x - m, y: cy };            // nose east  → hatch west
  }
}
// Foot combat (Phase A): a self-contained battle zone declared as scene data.
// One spawn = one hostile placed at (x,y). The sim owns the live fight state
// (hp, projectiles, the player's vitality) at module scope — see below — so an
// interleaved render() rebuilding this scene object never resets a fight.
export interface WalkCombatSpawn {
  x: number; y: number; kind?: string; hp?: number;
  // Per-archetype combat stats (from content/zones.json via the generator);
  // any omitted field falls back to the COMBAT defaults below.
  speed?: number; fireGap?: number; shotDmg?: number; touchDmg?: number;
  range?: number; size?: number; color?: string; behavior?: string;
}
// The player's gun, mutated by run boons (zonewalk.ts). Defaults = a single
// straight cyan shot; boons stack pellets, pierce, ricochet, damage, lifesteal.
export interface WalkMods {
  damage: number; fireRateMul: number; count: number; spreadArc: number;
  pierce: boolean; ricochet: boolean; lifesteal: number;
  projSpeed: number; projLife: number; color: string;
}
export function defaultMods(): WalkMods {
  return { damage: 1, fireRateMul: 1, count: 1, spreadArc: 0, pierce: false, ricochet: false, lifesteal: 0, projSpeed: 720, projLife: 1.1, color: "#70d7ff" };
}
export interface WalkCombat {
  vitality?: number;          // player's on-foot health pool for the zone (default 100)
  enemies: WalkCombatSpawn[];
  mods?: WalkMods;            // the player's gun for this chamber (accumulated boons)
  revive?: number;           // medic perk: vitality restored the first time you'd drop (0 = none)
  onClear?: () => void;       // fired once when the last hostile drops
  onDowned?: () => void;      // fired once when vitality hits zero
  onRevive?: () => void;      // fired when the revive triggers (once per run)
}
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
  // Solid footprints carved out of the walkable floor (buildings, the ship).
  // insideFloors() rejects points inside these; walk3d renders them as structures.
  obstacles?: WalkObstacle[];
  // The player's ship, on display in this port (see ShipBerth / the RULE).
  ship?: ShipBerth;
  spawn: { x: number; y: number };
  // Placeholder exterior silhouette (closed polygon, scene coordinates) drawn
  // around the interior so room placement can be judged against the hull shape.
  hull?: Array<{ x: number; y: number }>;
  dark?: boolean;
  // Action mode: the Hades-style kit (aim/fire/roll, quicker stride) is live.
  // Only planet surfaces and hostile (silenced) stations set this — your own
  // ship and friendly decks are navigation/dialogue space, no combat verbs.
  action?: boolean;
  // Open-ground layout (a plaza with a perimeter wall and freestanding
  // buildings) vs. the default warren of rooms + corridors. Drives walk3d's
  // town-wall / building rendering. Planet towns set this; stations don't.
  openGround?: boolean;
  // A self-contained battle zone: hostiles spawn on entry, the exits stay open
  // (Phase A — gating comes later), and clearing them fires onClear. Requires
  // action mode for the aim/fire/roll kit.
  combat?: WalkCombat;
  onTick?: (moving: boolean, dt: number, roomId: string | null) => void;
}

let scene: WalkScene | null = null;
let mountedId: string | null = null;
const savedPos: Record<string, { x: number; y: number }> = {};
let pos = { x: 0, y: 0 };
let facing: "up" | "down" | "left" | "right" = "down";
// The continuous movement heading, in the same convention walk3d wants for
// avatar.rotation.y: atan2(vx, vy), so +y (screen-down) is 0 and +x is PI/2.
// `facing` stays a 4-way enum because the 2D fallback sprite and the combat aim
// code are built on it; the 3D presenter turns the model to `heading` instead,
// so diagonal and click-to-move travel no longer snaps to a cardinal.
let heading = 0;
let walkPhase = 0;
let moving = false;
const keys = new Set<string>();
const gpDirs = new Set<string>();
let gpAxis = { x: 0, y: 0 };
let gpPrevA = false;
let gpPrevB = false;
let gpPrevX = false;
const GP_DEADZONE = 0.35;
let raf: number | null = null;
let last = 0;
// Render throttle: the sim ticks every rAF frame (cheap), but the expensive
// WebGL render (bloom + CRT composer) is rate-limited so it doesn't peg the
// GPU on a high-refresh display or while nothing is changing. ~60fps while the
// scene is live, dropping to ~20fps when the player is idle. See maybeDraw().
const RENDER_GAP_ACTIVE = 1000 / 61;
const RENDER_GAP_IDLE = 1000 / 20;
let lastRenderAt = 0;
let wasModal = false;
let viewport: HTMLElement | null = null;
let listenersBound = false;
let nearDoor: WalkDoor | null = null;
let nearActor: WalkActor | null = null;
let clickTarget: { x: number; y: number } | null = null;
let clickPath: Array<{ x: number; y: number }> = [];
let clickStuck = 0;
let highlightKey: string | null = null;
// Two strides: decks are for walking and talking; action scenes move quicker.
const DECK_SPEED = 230;
const ACTION = { moveSpeed:320, rollSpeed:620, rollDuration:.24, rollCooldown:.7, fireCooldown:.18, projectileSpeed:720 };
// Melee: a close-range cone swipe. High flat damage, brief forward lunge, knocks
// foes back AND cancels their windup/charge — the answer to enemies that rush you.
const MELEE = { reach:58, arc:.5, dmg:4, cd:.42, active:.16, knock:46, lunge:24 };
const inAction = () => !!scene?.action;
let aim={x:0,y:1}, rollDir={x:0,y:1};
let rollTime=0, rollCooldown=0, fireCooldown=0, meleeTime=0, meleeCd=0;
// Player shots carry their boon payload: damage, whether they pierce, how many
// wall bounces remain, and which enemies they've already hit (so a piercing
// shot damages each foe once).
interface PlayerShot { x:number; y:number; vx:number; vy:number; life:number; dmg:number; pierce:boolean; bounces:number; hit:Set<FootEnemy>; }
let projectiles:PlayerShot[]=[];
let dummy:{x:number;y:number;hp:number;hit:number}|null=null;
// ---- foot combat: enemies that chase + shoot, a player vitality pool, and
// clear/downed resolution. Driven by scene.combat; all live state is here (not
// on the scene object) so re-render never resets a fight, exactly like `dummy`.
interface FootEnemy {
  x:number; y:number; hp:number; maxhp:number; hit:number; fireCd:number; touchCd:number; kind:string;
  speed:number; fireGap:number; shotDmg:number; touchDmg:number; range:number; size:number; color:string;
  // attack behaviour + telegraph state: enemies wind up (a readable tell) before
  // releasing an attack, so every hit is dodgeable if you read the flash.
  behavior:string; windup:number; telegraph:number; aimx:number; aimy:number;
  burstLeft:number; burstCd:number; chargeTime:number; phase:number;
}
const COMBAT = { enemySpeed:150, standoff:150, range:340, fireGap:1.6, shotSpeed:300, shotDmg:9, touchDmg:7, touchGap:.8, hitInvuln:.5, shotLife:2.2 };
// Windup (telegraph) seconds per behaviour — longer = more warning, bigger hit.
const BEHAVIOR:Record<string,number>={ gunner:.34, burst:.4, sniper:.8, charger:.5, boss:.55 };
let enemies:FootEnemy[]=[];
let foeShots:Array<{x:number;y:number;vx:number;vy:number;life:number;dmg:number}>=[];
let vitality=0, vitalityMax=0, playerHit=0, playerInvuln=0;
let combatActive=false, combatResolved=false;
let onClear:(()=>void)|null=null, onDowned:(()=>void)|null=null, onRevive:(()=>void)|null=null;
let reviveAmount=0, reviveLeft=0;   // medic perk: one second-wind per run
// ---- combat juice: the gun, screen shake, muzzle flash, death debris, kills.
let playerMods:WalkMods=defaultMods();
let debris:Array<{x:number;y:number;vx:number;vy:number;life:number;color:string}>=[];
let shakeAmt=0, muzzle=0, killCount=0, rollTrail=0;
type Walk3D = typeof import("./walk3d");
let walk3d: Walk3D | null = null;
let walk3dLoading: Promise<Walk3D> | null = null;

function loadWalk3d(): Promise<Walk3D> {
  if (walk3d) return Promise.resolve(walk3d);
  walk3dLoading ||= import("./walk3d").then((m) => (walk3d = m));
  return walk3dLoading;
}

function mountWalk3d(s: WalkScene) {
  const parent = viewport;
  const id = s.id;
  void loadWalk3d().then((m) => {
    // Compare by scene id, not object identity: any interleaved render()
    // rebuilds the scene object (ensureRunning), and the first-ever mount
    // awaits the whole three.js chunk — an identity check silently stranded
    // that first walk screen on the 2D fallback. Mount the freshest object.
    if (!scene || mountedId !== id) return;
    m.mount(parent, scene, { move:setClickMove, aim:setAim, fire });
  });
}

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
    if (dir) { keys.add(dir); clearClickMove(); e.preventDefault(); return; }
    if (e.code === "KeyE") { e.preventDefault(); interact(); }
    if (e.code === "Space") { e.preventDefault(); startRoll(); }
    if (e.code === "KeyF") { e.preventDefault(); meleeSwing(); }
  });
  document.addEventListener("keyup", (e) => {
    const dir = KEYMAP[e.code];
    if (dir) keys.delete(dir);
  });
}

export function needsMount(id: string): boolean { return mountedId !== id; }

export function mountHTML(s: WalkScene): string {
  const dpad = (dir: string, glyph: string, cls: string) =>
    `<button class="wk-dbtn ${cls}" ${holdActionAttr("walkPressStart", "walkPressEnd", dir)}>${glyph}</button>`;
  // The inline aspect-ratio derives the viewport's height from its width with
  // no min-height (see .walk-viewport's CSS comment — a fixed min-height
  // fights that on narrow/mobile viewports). Left unclamped it tracks the
  // scene's own logical footprint, which for a long multi-bay ship is a
  // strip several times wider than tall — a razor-thin letterbox no camera
  // FOV can make read as a normal 3rd-person view. Capped to a wide but
  // sane cinematic-widescreen ratio instead.
  const viewportRatio = Math.min(s.width / s.height, 2.2);
  return `<div class="panel"><h3>${s.title}</h3>
    <div class="cockpit">
    <div class="console con-table">
      <div class="walkscope${s.dark ? " walk-dark" : ""}">
        <div class="scope-head"><span>◄ FREE MOVEMENT ▬ WASD / ARROWS ►</span><span class="sh-r" id="wk-room"></span></div>
        <div class="walk-viewport" id="walk-viewport" style="aspect-ratio:${viewportRatio}">
          <div class="walk-prompt" id="wk-prompt"></div>
          <div class="wk-combat" id="wk-combat" style="display:none">
            <span class="wk-vit-label">VITALITY</span>
            <div class="wk-vit-bar"><i id="wk-vit-fill"></i></div>
            <span class="wk-hostiles" id="wk-hostiles"></span>
          </div>
        </div>
        <div class="scope-foot"><span id="wk-status"></span><span>${s.action ? "[E]/Ⓐ interact · LMB/RT fire · [F]/Ⓧ melee · [SPACE]/Ⓑ roll" : "[E]/Ⓐ interact"}</span></div>
      </div>
    </div>
    <p class="dim" id="wk-desc" style="margin-top:8px; min-height:16px"></p>
    <div class="walk-controls">
      <div class="walk-dpad">
        ${dpad("up", "▲", "wk-up")}
        <div class="wk-dpad-mid">${dpad("left", "◀", "wk-left")}<button class="wk-dbtn wk-interact" ${actionAttr("walkInteract")}>E</button>${dpad("right", "▶", "wk-right")}</div>
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
  facing = "down"; heading = 0; walkPhase = 0; moving = false; keys.clear();
  nearDoor = null; nearActor = null;
  lastRenderAt = 0; wasModal = false; // force an immediate first render on mount
  viewport = document.getElementById("walk-viewport");
  bindListeners();
  mountWalk3d(s);
  projectiles=[]; foeShots=[]; rollTime=rollCooldown=fireCooldown=0;
  enemies=[]; combatActive=false; combatResolved=false; onClear=onDowned=onRevive=null;
  vitality=vitalityMax=0; playerHit=playerInvuln=0; reviveAmount=reviveLeft=0;
  debris=[]; shakeAmt=muzzle=killCount=rollTrail=0; playerMods=defaultMods();
  if (s.combat) {
    playerMods = s.combat.mods ?? defaultMods();
    reviveAmount = s.combat.revive ?? 0; reviveLeft = reviveAmount > 0 ? 1 : 0;
    onRevive = s.combat.onRevive ?? null;
    // A real battle zone: spawn the roster, seed the vitality pool, stagger the
    // opening volley so three drones don't fire on the same frame.
    vitalityMax = s.combat.vitality ?? 100; vitality = vitalityMax;
    enemies = s.combat.enemies.map((e, i) => {
      const dp = nearestLegal(e.x, e.y) || { x: e.x, y: e.y };
      const hp = e.hp ?? 5;
      return {
        x: dp.x, y: dp.y, hp, maxhp: hp, hit: 0, fireCd: .8 + i * .45, touchCd: 0,
        kind: e.kind ?? "drone",
        speed: e.speed ?? COMBAT.enemySpeed, fireGap: e.fireGap ?? COMBAT.fireGap,
        shotDmg: e.shotDmg ?? COMBAT.shotDmg, touchDmg: e.touchDmg ?? COMBAT.touchDmg,
        range: e.range ?? COMBAT.range, size: e.size ?? 1, color: e.color ?? "#c23b5a",
        behavior: e.behavior ?? "gunner", windup: 0, telegraph: 0, aimx: 0, aimy: 1,
        burstLeft: 0, burstCd: 0, chargeTime: 0, phase: 0,
      };
    });
    onClear = s.combat.onClear ?? null; onDowned = s.combat.onDowned ?? null;
    combatActive = enemies.length > 0;
    dummy = null;
  } else if (s.action && s.dark) {
    // Practice target only in HOSTILE action scenes (silenced/dark) — a friendly
    // frontier town like Dustwell is action-mode for movement feel, but a red
    // TARGET dummy on its landing pad reads as a bug, not a town.
    const dp=nearestLegal(pos.x+150,pos.y)||nearestLegal(pos.x,pos.y-150);
    dummy=dp?{...dp,hp:5,hit:0}:null;
  } else dummy=null;
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
  walk3d?.setScene(s);
}

export function teardown() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (scene) savedPos[scene.id] = { ...pos };
  scene = null; mountedId = null; viewport = null;
  keys.clear(); clearClickMove();
  walk3d?.teardown();
}

export function forgetSpawn(sceneId: string) { delete savedPos[sceneId]; }

export function pressStart(dir: string) { keys.add(dir); }
export function pressEnd(dir: string) { keys.delete(dir); }

export function interact() {
  if (hasModal()) return;
  if (nearDoor && !nearDoor.locked) nearDoor.action();
  else if (nearActor) nearActor.onInteract();
}

function setAim(x:number,y:number){const dx=x-pos.x,dy=y-pos.y,d=Math.hypot(dx,dy);if(d>.001)aim={x:dx/d,y:dy/d};}
function startRoll(){
  if(!inAction()||rollCooldown>0||hasModal())return;
  // Fixed camera: screen axes ARE world axes, so the roll direction is the
  // held movement direction directly (or the aim direction when standing).
  let x=0,y=0;if(keys.has("up"))y--;if(keys.has("down"))y++;if(keys.has("left"))x--;if(keys.has("right"))x++;
  if(x||y){const d=Math.hypot(x,y);rollDir={x:x/d,y:y/d};}else rollDir={...aim};
  rollTime=ACTION.rollDuration;rollCooldown=ACTION.rollCooldown;
}
function fire(){
  if(!inAction()||fireCooldown>0||hasModal())return;
  const m=playerMods, n=Math.max(1,m.count), base=Math.atan2(aim.y,aim.x);
  for(let i=0;i<n;i++){
    const t=n===1?0:(i/(n-1)-0.5);          // spread pellets across the arc
    const a=base+t*m.spreadArc;
    projectiles.push({x:pos.x+Math.cos(a)*16,y:pos.y+Math.sin(a)*16,vx:Math.cos(a)*m.projSpeed,vy:Math.sin(a)*m.projSpeed,life:m.projLife,dmg:m.damage,pierce:m.pierce,bounces:m.ricochet?3:0,hit:new Set()});
  }
  fireCooldown=ACTION.fireCooldown*m.fireRateMul;
  muzzle=.06;
  sfxSafe(()=>sfx.weaponFire('laser'));
}
// A melee swing: instant cone hit in front, forward lunge, knockback, and it
// interrupts any windup/charge — melee is how you punish a foe that closes in.
function meleeSwing(){
  if(!inAction()||meleeCd>0||hasModal())return;
  meleeCd=MELEE.cd; meleeTime=MELEE.active;
  const nx=pos.x+aim.x*MELEE.lunge, ny=pos.y+aim.y*MELEE.lunge;   // step into the swing
  pos.x=creepAxis(pos.x,nx,(v)=>insideFloors(v,pos.y));
  pos.y=creepAxis(pos.y,ny,(v)=>insideFloors(pos.x,v));
  const dmg=MELEE.dmg+(playerMods.damage-1);                      // Heavy Rounds helps melee too
  let hitAny=false;
  for(const e of enemies){
    if(e.hp<=0)continue;
    const ex=e.x-pos.x, ey=e.y-pos.y, d=Math.hypot(ex,ey)||1;
    if(d>MELEE.reach*(e.size||1))continue;
    if((ex/d)*aim.x+(ey/d)*aim.y<MELEE.arc)continue;              // outside the swing cone
    e.hp-=dmg; e.hit=.16; hitAny=true;
    e.windup=0; e.telegraph=0; e.chargeTime=0;                    // interrupt whatever they were doing
    e.x=creepAxis(e.x,e.x+(ex/d)*MELEE.knock,(v)=>insideFloors(v,e.y));
    e.y=creepAxis(e.y,e.y+(ey/d)*MELEE.knock,(v)=>insideFloors(e.x,v));
    if(e.hp<=0)onEnemyKilled(e);
  }
  if(hitAny)shakeAmt=Math.min(1.3,shakeAmt+.3);
  sfxSafe(()=>sfx.weaponFire('torpedo'));
}

// ---- gamepad (Xbox/standard-mapping USB controllers) ----
// Polled once per frame in simulate() rather than event-driven — the Gamepad
// API has no change events, only a snapshot you read each tick.
const AIM_STICK_DEADZONE = 0.15;
function pollGamepad(_dt: number) {
  gpDirs.clear();
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) { gpPrevA = gpPrevB = false; gpAxis = { x: 0, y: 0 }; return; }
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  gpAxis = { x: Math.abs(ax) > .18 ? ax : 0, y: Math.abs(ay) > .18 ? ay : 0 };
  if (ay < -GP_DEADZONE || gp.buttons[12]?.pressed) gpDirs.add("up");
  if (ay > GP_DEADZONE || gp.buttons[13]?.pressed) gpDirs.add("down");
  if (ax < -GP_DEADZONE || gp.buttons[14]?.pressed) gpDirs.add("left");
  if (ax > GP_DEADZONE || gp.buttons[15]?.pressed) gpDirs.add("right");
  const aPressed = !!gp.buttons[0]?.pressed;
  if (aPressed && !gpPrevA) interact();
  gpPrevA = aPressed;
  if (inAction()) {
    const bPressed=!!gp.buttons[1]?.pressed;if(bPressed&&!gpPrevB)startRoll();gpPrevB=bPressed;
    const xPressed=!!gp.buttons[2]?.pressed;if(xPressed&&!gpPrevX)meleeSwing();gpPrevX=xPressed;
    if(gp.buttons[7]?.pressed)fire();
    // Right stick aims. Camera is fixed (screen axes = world axes), so the
    // stick direction is the aim direction directly — no transform.
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.abs(rx) > AIM_STICK_DEADZONE || Math.abs(ry) > AIM_STICK_DEADZONE){const d=Math.hypot(rx,ry)||1;aim={x:rx/d,y:ry/d};}
  } else gpPrevB = !!gp.buttons[1]?.pressed;
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
  // On a floor rect...
  if (!pts.every(([cx, cy]) => scene!.floors.some((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h))) return false;
  // ...and clear of every solid obstacle. A point is blocked if the player's
  // bounding box overlaps a building/ship footprint.
  const obs = scene.obstacles;
  if (obs) for (const o of obs) {
    if (px + r > o.x && px - r < o.x + o.w && py + r > o.y && py - r < o.y + o.h) return false;
  }
  const sh = scene.ship;
  if (sh && px + r > sh.x && px - r < sh.x + sh.w && py + r > sh.y && py - r < sh.y + sh.h) return false;
  return true;
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

function clearClickMove() { clickTarget = null; clickPath = []; clickStuck = 0; }

function setClickMove(x: number, y: number) {
  if (!scene) return;
  const goal = nearestLegal(x, y);
  if (!goal) { clearClickMove(); return; }
  clickTarget = goal;
  clickPath = findPath(pos, goal);
  if (!clickPath.length) clickPath = [goal];
  clickStuck = 0;
}

function nearestLegal(x: number, y: number): { x: number; y: number } | null {
  if (insideFloors(x, y)) return { x, y };
  for (let radius = 8; radius <= 72; radius += 8) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
    if (insideFloors(px, py)) return { x: px, y: py };
  }
  return null;
}

// Small-grid A* over the exact same insideFloors() predicate as manual movement.
// It makes a click in another room route through the connector instead of
// repeatedly steering into the room wall.
function findPath(from: {x:number;y:number}, to: {x:number;y:number}): Array<{x:number;y:number}> {
  if (!scene) return [];
  const step = 16, cols = Math.ceil(scene.width / step), rows = Math.ceil(scene.height / step);
  const cell = (p:{x:number;y:number}) => ({ x: clampNum(Math.round(p.x/step),0,cols-1), y: clampNum(Math.round(p.y/step),0,rows-1) });
  const start=cell(from), end=cell(to), key=(x:number,y:number)=>y*cols+x;
  const open=[start], came=new Map<number,number>(), score=new Map<number,number>([[key(start.x,start.y),0]]), closed=new Set<number>();
  let found=false;
  while(open.length && closed.size<12000){
    let bi=0,bf=Infinity; for(let i=0;i<open.length;i++){const n=open[i],f=(score.get(key(n.x,n.y))||0)+Math.abs(n.x-end.x)+Math.abs(n.y-end.y);if(f<bf){bf=f;bi=i;}}
    const cur=open.splice(bi,1)[0],ck=key(cur.x,cur.y); if(closed.has(ck))continue; closed.add(ck);
    if(cur.x===end.x&&cur.y===end.y){found=true;break;}
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cur.x+dx,ny=cur.y+dy,nk=key(nx,ny);if(nx<0||ny<0||nx>=cols||ny>=rows||closed.has(nk)||!insideFloors(nx*step,ny*step))continue;const ng=(score.get(ck)||0)+1;if(ng<(score.get(nk)??Infinity)){score.set(nk,ng);came.set(nk,ck);open.push({x:nx,y:ny});}}
  }
  if(!found)return[];
  const out:Array<{x:number;y:number}>=[]; let k=key(end.x,end.y),guard=0;
  while(k!==key(start.x,start.y)&&guard++<12000){out.push({x:(k%cols)*step,y:Math.floor(k/cols)*step});const prev=came.get(k);if(prev===undefined)return[];k=prev;}
  out.reverse();
  const compact=out.filter((p,i,a)=>i===0||i===a.length-1||((p.x-a[i-1].x)!==(a[i+1].x-p.x)||(p.y-a[i-1].y)!==(a[i+1].y-p.y)));
  compact.push(to); return compact;
}

// ---- loop ----
function tick(t: number) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  simulate(dt);
  maybeDraw();
  raf = requestAnimationFrame(tick);
}

// The one WebGL render + HUD refresh. Kept separate from simulate() so the
// (cheap) game logic can run every frame while the (expensive) render is
// throttled and skipped when nothing's watching.
let renderCount = 0;
export function debugRenderCount() { return renderCount; }
function drawFrame() {
  if (!scene) return;
  renderCount++;
  walk3d?.render({ pos, facing, heading, moving, phase: walkPhase, nearDoor, nearActor, time: last, aim, rolling: rollTime > 0, rollCooldown, projectiles, dummy, highlightKey, enemies, foeShots, playerHit, debris, shake: shakeAmt, muzzle, shotColor: playerMods.color, rollTrail, melee: meleeTime });
  updateHud();
}

// Decide whether this frame gets a render. Skips entirely while a modal covers
// the scene (the overlay hides it — no reason to burn the GPU), and otherwise
// caps to ~60fps when anything's happening / ~20fps when idle. Forces one draw
// on the frame a modal closes so the scene is fresh underneath it.
function maybeDraw() {
  if (!scene) return;
  const modalOpen = hasModal();
  const justClosed = wasModal && !modalOpen;
  wasModal = modalOpen;
  if (modalOpen) return;
  const active = moving || rollTime > 0 || projectiles.length > 0 || !!clickTarget
    || keys.size > 0 || gpDirs.size > 0 || gpAxis.x !== 0 || gpAxis.y !== 0;
  const gap = active ? RENDER_GAP_ACTIVE : RENDER_GAP_IDLE;
  if (!justClosed && last - lastRenderAt < gap) return;
  lastRenderAt = last;
  drawFrame();
}

// Debug-only: advance the simulation by one manual step, bypassing
// requestAnimationFrame. Mirrors the __S debug accessor in main.ts — needed
// because rAF is suspended entirely in backgrounded/headless preview tabs,
// which would otherwise make the walk screens untestable end-to-end.
export function debugStep(dtSeconds: number) { simulate(dtSeconds); drawFrame(); }
export function debugPos() { return { ...pos }; }
export function debugActors() { return scene ? scene.actors.map((a) => ({ key: a.key, x: a.x, y: a.y, bubble: a.bubble || "" })) : []; }
export function debugRooms() { return scene ? scene.rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, label: r.label })) : []; }
// Debug-only: teleport (bypasses collision) for exercising room/door/actor
// detection directly, once movement collision itself is verified separately.
export function debugGoto(x: number, y: number) { pos = { x, y }; simulate(0); drawFrame(); }
// Debug-only: drive the REAL click-to-move pathfinder (the same A* a mouse
// click triggers) toward a target, respecting collision — the tool for
// verifying a scene's room/corridor graph is actually walkable, not just that
// its rects don't overlap. Callers step the sim afterward until arrival.
export function debugWalkTo(x: number, y: number) { setClickMove(x, y); }

function simulate(dt: number) {
  if (!scene) return; // torn down mid-frame
  pollGamepad(dt);
  rollCooldown=Math.max(0,rollCooldown-dt);fireCooldown=Math.max(0,fireCooldown-dt);
  meleeCd=Math.max(0,meleeCd-dt);meleeTime=Math.max(0,meleeTime-dt);
  if(dummy)dummy.hit=Math.max(0,dummy.hit-dt);
  if (!hasModal()) {
    let vx = 0, vy = 0;
    if (keys.has("up")) vy -= 1;
    if (keys.has("down")) vy += 1;
    if (keys.has("left")) vx -= 1;
    if (keys.has("right")) vx += 1;
    vx += gpAxis.x; vy += gpAxis.y;
    if (gpDirs.has("up")) vy = Math.min(vy, -1);
    if (gpDirs.has("down")) vy = Math.max(vy, 1);
    if (gpDirs.has("left")) vx = Math.min(vx, -1);
    if (gpDirs.has("right")) vx = Math.max(vx, 1);
    // Fixed semi-top-down camera: screen axes are world axes, no transform.
    if (vx || vy) clearClickMove();
    // Point-and-click: move toward click target when no keys held
    if (!vx && !vy && clickTarget) {
      const waypoint = clickPath[0] || clickTarget;
      const dx = waypoint.x - pos.x;
      const dy = waypoint.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 7) {
        if (clickPath.length) clickPath.shift();
        if (!clickPath.length && Math.hypot(clickTarget.x-pos.x,clickTarget.y-pos.y)<8) clearClickMove();
      }
      else { vx = dx / dist; vy = dy / dist; }
    }
    if(rollTime>0){vx=rollDir.x;vy=rollDir.y;rollTime=Math.max(0,rollTime-dt);}
    moving = !!(vx || vy);
    if (moving) {
      const len = Math.hypot(vx, vy) || 1;
      if (len > 1) { vx /= len; vy /= len; }
      const speed = rollTime>0 ? ACTION.rollSpeed : inAction() ? ACTION.moveSpeed : DECK_SPEED;
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
        if (clickStuck > 0.45) setClickMove(clickTarget.x, clickTarget.y);
      } else { clickStuck = 0; }
      if (Math.abs(vx) > Math.abs(vy)) facing = vx > 0 ? "right" : "left";
      else if (vy !== 0) facing = vy > 0 ? "down" : "up";
      heading = Math.atan2(vx, vy);
      walkPhase += dt * 9;
    }
    // juice decay + debris drift (every frame, cheap when empty)
    if(muzzle>0)muzzle=Math.max(0,muzzle-dt);
    if(shakeAmt>0)shakeAmt=Math.max(0,shakeAmt-dt*2.2);
    if(rollTime>0)rollTrail=Math.max(rollTrail,.12); if(rollTrail>0)rollTrail=Math.max(0,rollTrail-dt);
    for(const d of debris){d.x+=d.vx*dt;d.y+=d.vy*dt;d.vx*=.88;d.vy*=.88;d.life-=dt;}
    if(debris.length)debris=debris.filter(d=>d.life>0);
    for(const p of projectiles){
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
      if(!insideFloors(p.x,p.y)){
        if(p.bounces>0){p.bounces--;p.x-=p.vx*dt;p.y-=p.vy*dt;
          if(insideFloors(p.x-p.vx*dt,p.y))p.vx=-p.vx; else if(insideFloors(p.x,p.y-p.vy*dt))p.vy=-p.vy; else {p.vx=-p.vx;p.vy=-p.vy;}}
        else p.life=0;
      }
      if(dummy&&dummy.hp>0&&Math.hypot(p.x-dummy.x,p.y-dummy.y)<22){dummy.hp-=p.dmg;dummy.hit=.14;if(!p.pierce)p.life=0;}
      for(const e of enemies){
        if(e.hp>0&&!p.hit.has(e)&&Math.hypot(p.x-e.x,p.y-e.y)<20*(e.size||1)){
          p.hit.add(e); e.hp-=p.dmg; e.hit=.14;
          if(e.hp<=0)onEnemyKilled(e);
          if(!p.pierce){p.life=0;break;}
        }
      }
    }
    if(projectiles.length)projectiles=projectiles.filter(p=>p.life>0);
    if (combatActive || enemies.length) updateCombat(dt);
    nearDoor = null;
    let bestD = 46;
    for (const d of scene.doors) { const dd = rectDist(pos.x, pos.y, d); if (dd < bestD) { bestD = dd; nearDoor = d; } }
    nearActor = null;
    let bestA = 40;
    for (const a of scene.actors) { const dd = Math.hypot(pos.x - (a.x + a.w / 2), pos.y - (a.y + a.h / 2)); if (dd < bestA) { bestA = dd; nearActor = a; } }
    // When a door pad and an actor overlap, whichever you're actually standing
    // on wins. interact() runs doors first, so without this the cockpit's
    // "Ship's console" pad — which lies directly over the captain's chair —
    // shadowed the chair permanently and sitChair could never fire.
    if (nearDoor && nearActor) {
      if (rectDist(pos.x, pos.y, nearActor) < rectDist(pos.x, pos.y, nearDoor)) nearDoor = null;
      else nearActor = null;
    }
    scene.onTick?.(moving, dt, roomAt(pos.x, pos.y)?.id ?? null);
  } else {
    moving = false;
  }
}

// Enemy AI + resolution, stepped inside simulate()'s no-modal branch so a fight
// pauses under the win/lose modal. Enemies chase to a standoff ring, strafe, and
// lob shots; the player takes damage from shots and contact unless rolling or
// briefly invulnerable after a hit.
function updateCombat(dt: number) {
  if (playerHit > 0) playerHit -= dt;
  if (playerInvuln > 0) playerInvuln -= dt;
  const invuln = rollTime > 0 || playerInvuln > 0;
  const boss = last * .001;
  for (const e of enemies) {
    if (e.hit > 0) e.hit -= dt;
    if (e.touchCd > 0) e.touchCd -= dt;
    if (e.hp <= 0) continue;
    const dx = pos.x - e.x, dy = pos.y - e.y, d = Math.hypot(dx, dy) || 1;

    // CHARGING: rush along the locked lunge vector, heavy contact, stop on wall.
    if (e.chargeTime > 0) {
      e.chargeTime -= dt;
      const cs = e.speed * 3.1, px = e.x, py = e.y;
      e.x = creepAxis(e.x, e.x + e.aimx * cs * dt, (v) => insideFloors(v, e.y));
      e.y = creepAxis(e.y, e.y + e.aimy * cs * dt, (v) => insideFloors(e.x, v));
      if (Math.hypot(e.x - px, e.y - py) < 1) e.chargeTime = 0;
      if (d < 30 && e.touchCd <= 0) { e.touchCd = COMBAT.touchGap; if (!invuln) hurtPlayer(Math.round(e.touchDmg * 1.5)); e.chargeTime = 0; }
      continue;
    }
    // BURST follow-up shots after the opening shot of a burst attack.
    if (e.burstLeft > 0) {
      e.burstCd -= dt;
      if (e.burstCd <= 0) { spawnEnemyShot(e, (e.burstLeft - 1.5) * .05); e.burstLeft--; e.burstCd = .1; }
    }
    // WINDUP: hold, flash the telegraph, then release the attack pattern.
    if (e.windup > 0) {
      e.windup -= dt; e.telegraph = 1;
      if (e.windup <= 0) { e.telegraph = 0; releaseAttack(e); e.fireCd = e.fireGap * (e.behavior === "boss" && e.hp < e.maxhp * .35 ? .55 : 1); }
      continue;
    }
    e.telegraph = Math.max(0, e.telegraph - dt * 4);

    // Move: chase to the standoff ring, then orbit so foes don't stack.
    if (d > COMBAT.standoff) {
      e.x = creepAxis(e.x, e.x + dx / d * e.speed * dt, (v) => insideFloors(v, e.y));
      e.y = creepAxis(e.y, e.y + dy / d * e.speed * dt, (v) => insideFloors(e.x, v));
    } else {
      const sx = -dy / d, sy = dx / d, dir = Math.sin(boss + e.x * .01) >= 0 ? 1 : -1;
      e.x = creepAxis(e.x, e.x + sx * dir * e.speed * .5 * dt, (v) => insideFloors(v, e.y));
      e.y = creepAxis(e.y, e.y + sy * dir * e.speed * .5 * dt, (v) => insideFloors(e.x, v));
    }
    // Decide to attack: lock aim (so the committed shot is dodgeable) and wind up.
    e.fireCd -= dt;
    if (e.fireCd <= 0 && d < e.range) { e.aimx = dx / d; e.aimy = dy / d; e.windup = BEHAVIOR[e.behavior] ?? .34; }
    if (d < 24 && e.touchCd <= 0) { e.touchCd = COMBAT.touchGap; if (!invuln) hurtPlayer(e.touchDmg); }
  }
  for (const s of foeShots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (!insideFloors(s.x, s.y)) s.life = 0;
    if (s.life > 0 && Math.hypot(s.x - pos.x, s.y - pos.y) < 15) { s.life = 0; if (!invuln) hurtPlayer(s.dmg); }
  }
  foeShots = foeShots.filter((s) => s.life > 0);
  if (combatActive && !combatResolved) {
    if (vitality <= 0 && reviveLeft > 0) {
      // Medic's second wind: dragged back up once per run, with a beat of mercy.
      reviveLeft--; vitality = Math.min(vitalityMax, reviveAmount); playerInvuln = 1.3;
      shakeAmt = Math.min(1.3, shakeAmt + .7); onRevive?.();
    } else if (vitality <= 0) { combatResolved = true; combatActive = false; onDowned?.(); }
    else if (enemies.every((e) => e.hp <= 0)) { combatResolved = true; combatActive = false; onClear?.(); }
  }
}
function hurtPlayer(n: number) {
  vitality = Math.max(0, vitality - n); playerHit = .18; playerInvuln = COMBAT.hitInvuln;
  shakeAmt = Math.min(1.3, shakeAmt + .55); sfxSafe(()=>sfx.hullHit());
}
// Spawn one enemy shot along the enemy's LOCKED aim (set at windup start), with
// an optional angle offset for fans/bursts. Carries the enemy's own damage.
function spawnEnemyShot(e: FootEnemy, angOff = 0) {
  const a = Math.atan2(e.aimy, e.aimx) + angOff, sp = COMBAT.shotSpeed;
  const mul = e.behavior === "sniper" ? 1.9 : 1;
  foeShots.push({ x: e.x + Math.cos(a) * 16, y: e.y + Math.sin(a) * 16, vx: Math.cos(a) * sp * mul, vy: Math.sin(a) * sp * mul, life: COMBAT.shotLife, dmg: e.shotDmg });
}
// Fire the enemy's attack pattern when its windup completes.
function releaseAttack(e: FootEnemy) {
  switch (e.behavior) {
    case "burst": spawnEnemyShot(e); e.burstLeft = 2; e.burstCd = .1; break;
    case "sniper": spawnEnemyShot(e); break;                                   // one fast, heavy round
    case "charger": e.chargeTime = .5; break;                                  // lunge instead of shoot
    case "boss": {                                                             // cycles fan → lunge → burst
      e.phase = (e.phase + 1) % 3;
      if (e.phase === 0) { for (let i = -2; i <= 2; i++) spawnEnemyShot(e, i * .15); }
      else if (e.phase === 1) e.chargeTime = .55;
      else { spawnEnemyShot(e); e.burstLeft = 3; e.burstCd = .09; }
      break;
    }
    default: spawnEnemyShot(e); break;                                         // gunner: single aimed shot
  }
}
// A satisfying death: a burst of coloured debris, a kick of screen shake, a pop,
// and any lifesteal boon paying out.
function onEnemyKilled(e: FootEnemy) {
  killCount++;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + e.x * .013;
    const sp = 70 + ((i * 53) % 130);
    debris.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .45 + ((i * 7) % 5) * .05, color: e.color });
  }
  shakeAmt = Math.min(1.3, shakeAmt + .3);
  if (playerMods.lifesteal > 0) vitality = Math.min(vitalityMax, vitality + playerMods.lifesteal);
  sfxSafe(()=>sfx.systemDamage());
}
export function debugKills() { return killCount; }

// Debug-only (window.__walkCombat / __walkFireAt): read fight state and drive a
// shot toward a world point, so the headless playtest can clear a zone.
export function debugCombat() { return { active: combatActive, resolved: combatResolved, vitality, vitalityMax, telegraphing: enemies.some((e) => e.hp > 0 && e.telegraph > 0), enemies: enemies.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, behavior: e.behavior, tel: e.telegraph })) }; }
// The player's live on-foot health — read by the zone runtime at chamber-clear
// to carry remaining vitality into the next chamber.
export function combatVitality() { return vitality; }
export function debugFireAt(x: number, y: number) { setAim(x, y); fireCooldown = 0; fire(); }
export function debugMelee(x: number, y: number) { setAim(x, y); meleeCd = 0; meleeSwing(); }

function updateHud() {
  if (!scene) return;
  const r = roomAt(pos.x, pos.y);
  const roomEl = document.getElementById("wk-room");
  if (roomEl) roomEl.textContent = "◉ " + (r ? r.label.toUpperCase() : "CORRIDOR");
  const statusEl = document.getElementById("wk-status");
  if (statusEl) statusEl.textContent = inAction()
    ? `${scene.status} · ROLL ${rollCooldown<=0?"READY":rollCooldown.toFixed(1)+"s"} · LMB FIRE`
    : scene.status;
  const combatEl = document.getElementById("wk-combat");
  if (combatEl) {
    if (combatActive || (vitalityMax > 0 && vitality < vitalityMax)) {
      combatEl.style.display = "";
      const fill = document.getElementById("wk-vit-fill");
      if (fill) {
        const pct = Math.max(0, Math.round(vitality / vitalityMax * 100));
        fill.style.width = pct + "%";
        fill.classList.toggle("low", pct <= 30);
      }
      const host = document.getElementById("wk-hostiles");
      const n = enemies.filter((e) => e.hp > 0).length;
      if (host) host.textContent = combatActive ? `HOSTILES ${n}${killCount ? ` · ${killCount} DOWN` : ""}` : "CLEAR";
    } else combatEl.style.display = "none";
  }
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
      if (nearDoor && !nearDoor.locked) fbEl.innerHTML = `<button class="primary" ${actionAttr("walkInteract")}>${nearDoor.label}</button>`;
      else if (nearActor) fbEl.innerHTML = `<button class="primary" ${actionAttr("walkInteract")}>${nearActor.verb || "Talk to"} ${nearActor.label}</button>`;
      else fbEl.innerHTML = "";
    }
  }
}
