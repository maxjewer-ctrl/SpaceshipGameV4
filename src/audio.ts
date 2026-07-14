// src/audio.ts — ship audio via Web Audio API, playing real recorded clips
// (Kenney CC0 packs, see src/assets/audio/CREDITS.md) instead of synthesised
// oscillators. Room ambience is a small mix of looping texture clips plus
// occasional one-shot "stinger" sounds fired at random intervals; discrete
// events (doors, weapons, UI) play a randomly-picked clip from a small pool
// of variants so the same action doesn't sound identical every time.
// The AudioContext boots on first user interaction (browser autoplay policy).
import { uiRand } from "./rng";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const MUTE_KEY = "kestrelrun:muted";
let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === "true"; }
  catch { return false; }
})();

// ---- asset loading ----

function assetUrl(name: string): string {
  return new URL(`./assets/audio/${name}.ogg`, import.meta.url).href;
}

// Decoded buffers are plain PCM data, not tied to the AudioContext instance
// that decoded them, so this cache survives a shutdown()/reboot cycle.
const bufferCache = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(name: string): Promise<AudioBuffer> {
  let p = bufferCache.get(name);
  if (!p) {
    p = fetch(assetUrl(name))
      .then((r) => r.arrayBuffer())
      .then((data) => {
        if (!ctx) throw new Error("audio context closed before decode");
        return ctx.decodeAudioData(data);
      });
    bufferCache.set(name, p);
  }
  return p;
}

// Kick off decoding for every clip the game might need, right after boot, so
// the first play of each sound doesn't stall on a network+decode round trip.
function preloadAll() {
  const names = new Set<string>();
  for (const files of Object.values(ONE_SHOTS)) for (const f of files) names.add(f);
  for (const room of Object.values(ROOM_AMBIENCE)) {
    for (const l of room.loops) names.add(l.file);
    for (const f of room.stingers?.files ?? []) names.add(f);
  }
  for (const l of HUM_LOOPS) names.add(l.file);
  names.forEach((n) => { loadBuffer(n).catch(() => {}); });
}

// ---- one-shot playback ----

function playClip(name: string, opts: { gain?: number; rate?: number } = {}) {
  const c = boot(); if (!master) return;
  loadBuffer(name).then((buf) => {
    if (!ctx || !master) return; // context torn down while this was loading
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = c.createGain(); g.gain.value = opts.gain ?? 1;
    src.connect(g); g.connect(master);
    src.start();
  }).catch(() => {});
}

function playRandom(names: string[], opts: { gain?: number; rate?: number; jitter?: number } = {}) {
  const name = names[Math.floor(uiRand() * names.length)];
  const rate = opts.jitter ? 1 + (uiRand() * 2 - 1) * opts.jitter : opts.rate;
  playClip(name, { gain: opts.gain, rate });
}

const ONE_SHOTS: Record<string, string[]> = {
  doorOpen:  ["doorOpen_000", "doorOpen_001", "doorOpen_002"],
  doorClose: ["doorClose_000", "doorClose_001", "doorClose_002"],
  laser:     ["laserSmall_000", "laserSmall_001", "laserSmall_002", "laserSmall_003", "laserSmall_004"],
  torpedo:   ["laserLarge_000", "laserLarge_001", "laserLarge_002", "laserLarge_003", "laserLarge_004"],
  ion:       ["zap1", "zap2", "zapThreeToneDown"],
  hullHit:   ["impactMetal_000", "impactMetal_001", "impactMetal_002", "impactMetal_003", "impactMetal_004"],
  damage:    ["glitch_001", "glitch_002", "glitch_003", "glitch_004"],
  click:     ["click_001", "click_002", "click_003", "click_004", "click_005"],
  powerUp:   ["powerUp1", "powerUp2", "powerUp3", "powerUp4", "powerUp5", "powerUp6"],
  cockpitBeep: ["twoTone2", "tone1", "highUp"],
};

// ---- room ambience: a looping texture bed plus optional random stingers ----

interface LoopLayer { file: string; gain: number; }
interface RoomAmbience {
  loops: LoopLayer[];
  // Occasional one-shot texture (footsteps, creaks, distant clangs) fired at a
  // random interval while the player is in this room — replaces what used to
  // be an LFO-modulated noise "boil".
  stingers?: { files: string[]; gain: number; minMs: number; maxMs: number };
}

// Kenney doesn't publish a dedicated ambience/drone pack, so most beds below
// are the closest-fitting loopable texture from the sci-fi/RPG packs rather
// than a literal recording of the room (there's no CC0 "hydroponics" or
// "cantina crowd" clip in the wild) — see src/assets/audio/CREDITS.md.
const ROOM_AMBIENCE: Record<string, RoomAmbience> = {
  // ship
  engine: {
    loops: [
      { file: "engineCircular_000", gain: 0.55 },
      { file: "spaceEngineLarge_002", gain: 0.32 },
    ],
  },
  cockpit: {
    loops: [{ file: "computerNoise_001", gain: 0.20 }],
    stingers: { files: ONE_SHOTS.cockpitBeep, gain: 0.05, minMs: 5000, maxMs: 14000 },
  },
  quarters: {
    loops: [{ file: "spaceEngineLow_002", gain: 0.18 }], // stand-in for a refrigerator drone
  },
  medbay: {
    loops: [{ file: "computerNoise_003", gain: 0.10 }],
  },
  hydro: {
    loops: [{ file: "forceField_001", gain: 0.22 }], // stand-in for flowing water / pump hum
    stingers: { files: ["metalPot1", "metalPot2"], gain: 0.09, minMs: 4000, maxMs: 11000 }, // drip stand-in
  },
  cargo: {
    loops: [{ file: "spaceEngineLow_003", gain: 0.15 }],
    stingers: { files: ["creak1", "creak2", "creak3"], gain: 0.16, minMs: 6000, maxMs: 16000 },
  },
  // station
  cantina: {
    loops: [{ file: "spaceEngineLow_000", gain: 0.09 }], // stand-in for HVAC bed under crowd noise
    stingers: { files: ["handleCoins", "cloth1"], gain: 0.14, minMs: 3000, maxMs: 9000 },
  },
  concourse: {
    loops: [{ file: "spaceEngineLow_001", gain: 0.08 }],
    stingers: { files: ["footstep00", "footstep02", "footstep04"], gain: 0.10, minMs: 2500, maxMs: 7000 },
  },
  docks: {
    loops: [
      { file: "engineCircular_003", gain: 0.28 }, // your ship, idling nearby
      { file: "spaceEngineLarge_004", gain: 0.12 },
    ],
    stingers: { files: ["impactMetal_003", "impactMetal_004"], gain: 0.14, minMs: 5000, maxMs: 14000 },
  },
  drydock: {
    loops: [{ file: "forceField_003", gain: 0.20 }], // stand-in for welding/spark buzz
    stingers: { files: ["metalLatch", "impactMetal_001"], gain: 0.16, minMs: 3500, maxMs: 9000 },
  },
  undercity: {
    loops: [{ file: "spaceEngineLow_004", gain: 0.22 }],
    stingers: { files: ["impactMining_000", "impactMining_001", "impactMining_002"], gain: 0.18, minMs: 4500, maxMs: 12000 },
  },
  harbor: {
    loops: [{ file: "computerNoise_000", gain: 0.05 }],
  },
  market: {
    loops: [{ file: "computerNoise_002", gain: 0.07 }],
  },
};

// How much to scale the global ambient hum in each context
const HUM_SCALE: Record<string, number> = {
  engine:    1.1,   // engine room amplifies structural vibration
  cockpit:   0.35,  // insulated, quiet
  quarters:  0.22,  // residential hush
  medbay:    0.18,
  hydro:     0.28,
  cargo:     0.50,
  cantina:   0.25,
  concourse: 0.30,
  docks:     0.55,
  drydock:   0.50,
  undercity: 0.40,
  harbor:    0.20,
  market:    0.20,
  corridor:  0.70,  // walking between rooms
  default:   1.00,  // not on a walk screen
};

// ---- context ----

function boot(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.60;
    master.connect(ctx.destination);
    preloadAll();
    initHum();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ---- looping clip helper ----

interface LoopHandle { gain: GainNode; source: AudioBufferSourceNode | null; }

function startLoop(c: AudioContext, dest: GainNode, file: string, gain: number): LoopHandle {
  const g = c.createGain(); g.gain.value = gain; g.connect(dest);
  const handle: LoopHandle = { gain: g, source: null };
  loadBuffer(file).then((buf) => {
    if (!ctx) return; // shut down before this loop finished loading
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(g); src.start();
    handle.source = src;
  }).catch(() => {});
  return handle;
}

function rampRate(h: LoopHandle, target: number, t: number) {
  if (h.source) h.source.playbackRate.setTargetAtTime(target, t, 1.8);
}

// ---- global ambient hum (always running) ----

const HUM_LOOPS: LoopLayer[] = [
  { file: "spaceEngineLarge_000", gain: 0.55 },
  { file: "spaceEngineLarge_001", gain: 0.28 },
];
const HUM_RATTLE = { file: "engineCircular_002", gain: 0.16 };

interface HumState {
  gain: GainNode;
  engines: LoopHandle[];
  rattle: LoopHandle;
}
let hum: HumState | null = null;

function initHum() {
  if (!ctx || !master) return;
  const g = ctx.createGain(); g.gain.value = 0.45;
  const engines = HUM_LOOPS.map((l) => startLoop(ctx!, g, l.file, l.gain));
  const rattle = startLoop(ctx, g, HUM_RATTLE.file, HUM_RATTLE.gain);
  g.connect(master);
  hum = { gain: g, engines, rattle };
}

// ---- room buses (created lazily on first walkRoom call) ----

type RoomBus = { gain: GainNode };
let buses: Record<string, RoomBus> | null = null;

// ---- room state ----
let currentRoomKind: string | null = null;
let walkActive = false;
let lastHullPct = 1;
let stingerTimer: ReturnType<typeof setTimeout> | null = null;
let stingerRoom: string | null = null;

function initBuses(c: AudioContext, m: GainNode) {
  if (buses) return;
  buses = {};
  for (const [kind, room] of Object.entries(ROOM_AMBIENCE)) {
    const busGain = c.createGain(); busGain.gain.value = 0; busGain.connect(m);
    for (const layer of room.loops) startLoop(c, busGain, layer.file, layer.gain);
    buses[kind] = { gain: busGain };
  }
}

// ---- room ambience stinger scheduling ----

function scheduleStinger(kind: string) {
  const cfg = ROOM_AMBIENCE[kind]?.stingers;
  if (!cfg) return;
  stingerRoom = kind;
  const delay = cfg.minMs + uiRand() * (cfg.maxMs - cfg.minMs);
  stingerTimer = setTimeout(() => {
    if (currentRoomKind === kind) {
      playRandom(cfg.files, { gain: cfg.gain, jitter: 0.04 });
      scheduleStinger(kind);
    } else {
      stingerTimer = null; stingerRoom = null;
    }
  }, delay);
}

function stopStinger() {
  if (stingerTimer) { clearTimeout(stingerTimer); stingerTimer = null; }
  stingerRoom = null;
}

// ---- room cross-fade ----

function setRoomMix(kind: string | null) {
  if (!buses || !ctx || !hum) return;
  const t = ctx.currentTime;
  const tc = 1.6; // time constant — ~80% transition in 4s

  for (const [k, b] of Object.entries(buses)) {
    b.gain.gain.setTargetAtTime(k === kind ? 1 : 0, t, tc);
  }

  const key = kind ?? 'corridor';
  const scale = HUM_SCALE[key] ?? HUM_SCALE.default;
  hum.gain.gain.setTargetAtTime(0.45 * scale, t, tc);

  const wantsStinger = kind !== null && !!ROOM_AMBIENCE[kind]?.stingers;
  if (wantsStinger && stingerRoom !== kind) { stopStinger(); scheduleStinger(kind!); }
  if (!wantsStinger && stingerRoom) stopStinger();
}

// ---- low-hull warning ----

function warnLowHull() { playClip("lowThreeTone", { gain: 0.5 }); }

// ---- exported API ----

// Called every walk tick; `kind` is the room kind the player is currently in.
// null means they are in a corridor between rooms.
export function walkRoom(kind: string | null) {
  const c = boot(); if (!master) return;
  if (!buses) initBuses(c, master);
  if (kind === currentRoomKind) return; // guard: no work if room hasn't changed
  currentRoomKind = kind;
  walkActive = true;
  setRoomMix(kind);
}

// Called when navigating away from any walk screen.
export function walkExit() {
  if (!buses || !ctx || !hum) return;
  walkActive = false;
  currentRoomKind = null;
  stopStinger();
  const t = ctx.currentTime;
  for (const b of Object.values(buses)) b.gain.gain.setTargetAtTime(0, t, 1.2);
  hum.gain.gain.setTargetAtTime(0.45, t, 1.5); // restore full ambient
}

// Called every render — morphs ambient to travel state, triggers hull warning.
export function update(opts: { travel: boolean; hullPct: number; cautionKey: string }) {
  const c = boot(); if (!hum) return;
  const t = c.currentTime;

  // Engine hum speeds up (and brightens) with drive state
  if (!walkActive) {
    const rate = opts.travel ? 1.22 : 1.0;
    for (const engine of hum.engines) rampRate(engine, rate, t);
    hum.gain.gain.setTargetAtTime(opts.travel ? 0.55 : 0.45, t, 1.5);
  }

  // Structural rattle worsens as hull degrades
  const rattleTarget = opts.hullPct < 0.3 ? 0.32 : 0.16;
  hum.rattle.gain.gain.setTargetAtTime(rattleTarget, t, 2.5);

  // Low-hull warning: fired once when crossing 20%
  if (opts.hullPct < 0.2 && lastHullPct >= 0.2) warnLowHull();
  lastHullPct = opts.hullPct;
}

// No looping alarm to cancel — kept for API compatibility.
export function ackAlarm() { /* one-shot warning; nothing to cancel */ }

export function isMuted() { return muted; }

// Mute lives outside the save game so it remains in effect across runs.
export function setMuted(next: boolean) {
  muted = next;
  try { localStorage.setItem(MUTE_KEY, String(muted)); } catch { /* storage unavailable */ }
  if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.60, ctx.currentTime);
}

export function toggleMuted() { setMuted(!muted); }

// Permanently release every looping source when the game page closes. Closing
// the context stops loop/one-shot sources that intentionally have no end
// time, so they cannot survive after the game has gone away. Decoded buffers
// stay cached — they're plain PCM, reusable by whatever context boots next.
export function shutdown() {
  stopStinger();

  const closingContext = ctx;
  ctx = null;
  master?.disconnect();
  master = null;
  hum = null;
  buses = null;
  currentRoomKind = null;
  walkActive = false;
  lastHullPct = 1;

  // close() is asynchronous, but transitions the context to "closing"
  // immediately, which silences all of its active sources.
  if (closingContext && closingContext.state !== "closed") {
    void closingContext.close().catch(() => {});
  }
}

// ---- one-shot SFX ----

export function bayDoors(opening: boolean) {
  playRandom(opening ? ONE_SHOTS.doorOpen : ONE_SHOTS.doorClose, { gain: 0.6 });
}

export function jettison() {
  playClip("lowDown", { gain: 0.45 });
  playClip("impactMetal_004", { gain: 0.3 });
}

export function fuelVent() {
  playClip("forceField_002", { gain: 0.4 });
}

export function commsTune() { playClip("twoTone1", { gain: 0.4 }); }

export function engageBurn() {
  playClip("engineCircular_003", { gain: 0.4 });
  playClip("spaceEngineLarge_004", { gain: 0.3 });
}

export function weaponFire(kind: 'laser' | 'torpedo' | 'ion') {
  playRandom(ONE_SHOTS[kind], { gain: kind === 'torpedo' ? 0.5 : 0.35, jitter: 0.05 });
}

export function hullHit() {
  playRandom(ONE_SHOTS.hullHit, { gain: 0.55, jitter: 0.05 });
}

export function systemDamage() {
  playRandom(ONE_SHOTS.damage, { gain: 0.45 });
}

export function uiClick() {
  playRandom(ONE_SHOTS.click, { gain: 0.35 });
}

// Power-up chime when a module is switched on; falls tone when switched off.
export function moduleToggle(on: boolean) {
  if (on) playRandom(ONE_SHOTS.powerUp, { gain: 0.35 });
  else playClip("highDown", { gain: 0.3 });
}

// Physical latch flip + a soft confirming blip.
export function guardFlip() {
  playClip("metalLatch", { gain: 0.4 });
  playClip("confirmation_001", { gain: 0.25 });
}
