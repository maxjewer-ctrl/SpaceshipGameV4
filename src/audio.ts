// src/audio.ts — procedural ship audio via Web Audio API.
// No asset files. All sounds are synthesised from oscillators, noise, and filters.
// The AudioContext boots on first user interaction (browser autoplay policy).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let _noiseBuf: AudioBuffer | null = null;

// ---- global ambient (always running) ----
interface HumState {
  gain: GainNode;
  osc1: OscillatorNode; osc2: OscillatorNode;
  osc3: OscillatorNode; osc4: OscillatorNode;
  boilGain: GainNode; steamGain: GainNode;
}
let hum: HumState | null = null;

// ---- room buses (created lazily on first walkRoom call) ----
type RoomBus = { gain: GainNode };
let buses: Record<string, RoomBus> | null = null;

// ---- room state ----
let currentRoomKind: string | null = null;
let walkActive = false;
let lastHullPct = 1;
let cockpitBeepTimer: ReturnType<typeof setTimeout> | null = null;

// Target gain for each room bus (how loud that room sounds when fully inside it)
const ROOM_BUS_GAIN: Record<string, number> = {
  // ship
  engine:   0.60,
  cockpit:  0.20,
  quarters: 0.30,
  medbay:   0.14,
  hydro:    0.36,
  cargo:    0.18,
  // station
  cantina:   0.26,
  concourse: 0.18,
  docks:     0.28,
  drydock:   0.24,
  undercity: 0.20,
  harbor:    0.14,
  market:    0.16,
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
    master.gain.value = 0.60;
    master.connect(ctx.destination);
    initHum();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ---- shared noise buffer (4 s white noise, looped) ----

function nbuf(c: AudioContext): AudioBuffer {
  if (!_noiseBuf) {
    const len = c.sampleRate * 4;
    _noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noiseBuf;
}

function mkn(c: AudioContext): AudioBufferSourceNode {
  const n = c.createBufferSource();
  n.buffer = nbuf(c); n.loop = true; return n;
}

// ---- chime: warm bell with inharmonic overtones ----

function chime(freq: number, vol: number, decay: number) {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const make = (f: number, v: number, d: number) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master!); o.start(t); o.stop(t + d + 0.05);
  };
  make(freq, vol, decay);
  make(freq * 2.756, vol * 0.28, decay * 0.5);  // bell second partial
  make(freq * 5.404, vol * 0.07, decay * 0.25); // bell third partial
}

// ---- global ambient hum ----

function initHum() {
  if (!ctx || !master) return;
  const g = ctx.createGain(); g.gain.value = 0.45;

  const osc = (freq: number, gain: number, type: OscillatorType = 'sine') => {
    const o = ctx!.createOscillator(), gn = ctx!.createGain();
    o.type = type; o.frequency.value = freq; gn.gain.value = gain;
    o.connect(gn); gn.connect(g); o.start(); return o;
  };

  // Four-sine stack — 110Hz (A2) is the lowest laptop speakers reliably reproduce
  const o1 = osc(110,  0.50);
  const o2 = osc(117.3, 0.25); // detuned → beating makes it "breathe"
  const o3 = osc(220,  0.13);
  const o4 = osc(330,  0.06);

  // "Boiling" texture — bandpass noise with two slow LFOs (bubbling pipes, machinery)
  const boilNoise = mkn(ctx); const boilFilt = ctx.createBiquadFilter();
  boilFilt.type = 'bandpass'; boilFilt.frequency.value = 320; boilFilt.Q.value = 1.8;
  const boilGain = ctx.createGain(); boilGain.gain.value = 0.18;
  const addLfo = (rate: number, depth: number, target: AudioParam) => {
    const l = ctx!.createOscillator(), ld = ctx!.createGain();
    l.type = 'sine'; l.frequency.value = rate; ld.gain.value = depth;
    l.connect(ld); ld.connect(target); l.start();
  };
  addLfo(1.10, 0.09, boilGain.gain);
  addLfo(0.65, 0.05, boilGain.gain);
  boilNoise.connect(boilFilt); boilFilt.connect(boilGain); boilGain.connect(g); boilNoise.start();

  // Barely-there steam hiss (far vent)
  const steamNoise = mkn(ctx); const steamFilt = ctx.createBiquadFilter();
  steamFilt.type = 'highpass'; steamFilt.frequency.value = 3500;
  const steamGain = ctx.createGain(); steamGain.gain.value = 0.04;
  steamNoise.connect(steamFilt); steamFilt.connect(steamGain); steamGain.connect(g); steamNoise.start();

  g.connect(master);
  hum = { gain: g, osc1: o1, osc2: o2, osc3: o3, osc4: o4, boilGain, steamGain };
}

// ---- room bus initialisation (called once on first walkRoom) ----

function initBuses(c: AudioContext, m: GainNode) {
  if (buses) return;
  buses = {};

  const bus = (kind: string): GainNode => {
    const g = c.createGain(); g.gain.value = 0; g.connect(m);
    buses![kind] = { gain: g }; return g;
  };
  const osc = (dest: GainNode, freq: number, gain: number, type: OscillatorType = 'sine') => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(dest); o.start();
  };
  const noise = (dest: GainNode, bpFreq: number, q: number, gainVal: number, highpass = false) => {
    const ns = mkn(c), f = c.createBiquadFilter(), g = c.createGain();
    f.type = highpass ? 'highpass' : 'bandpass'; f.frequency.value = bpFreq; f.Q.value = q;
    g.gain.value = gainVal; ns.connect(f); f.connect(g); g.connect(dest); ns.start(); return g;
  };
  const lfo = (rate: number, depth: number, target: AudioParam) => {
    const l = c.createOscillator(), ld = c.createGain();
    l.type = 'sine'; l.frequency.value = rate; ld.gain.value = depth;
    l.connect(ld); ld.connect(target); l.start();
  };

  // ---- engine room: loud mechanical heat, you feel it in your boots ----
  const eng = bus('engine');
  osc(eng, 110, 0.45);            // main drive tone
  osc(eng, 88,  0.18, 'sawtooth'); // mechanical buzz overtone
  osc(eng, 55,  0.20);            // deep sub-harmonic — the hull vibrating
  noise(eng, 260, 0.80, 0.38);    // heavy bandpass rattle
  noise(eng, 120, 1.20, 0.15);    // low thump texture

  // ---- cockpit: quiet electronics, fans, instrumentation ----
  const cpit = bus('cockpit');
  osc(cpit, 220, 0.05);           // instrument hum, barely there
  noise(cpit, 2800, 0.55, 0.07);  // electronics fan (mid-high)
  noise(cpit, 6500, 0.40, 0.03, true); // display CRT-style emission (very high)

  // ---- crew quarters: refrigerator hum + boiling pipes ----
  const qtr = bus('quarters');
  osc(qtr, 80,  0.28);            // refrigerator drone
  osc(qtr, 160, 0.09);            // second harmonic
  const qBoil = noise(qtr, 280, 2.50, 0.20); // water in the pipes
  lfo(0.75, 0.12, qBoil.gain);   // slow bubbling
  lfo(0.32, 0.06, qBoil.gain);   // even slower swell

  // ---- medbay: clinical hiss, monitors ----
  const med = bus('medbay');
  osc(med, 440, 0.04);            // equipment hum (A4 — clean, clinical)
  osc(med, 220, 0.05);
  noise(med, 3500, 0.80, 0.025); // HVAC filter

  // ---- hydroponics: water everywhere ----
  const hy = bus('hydro');
  const hyBoil = noise(hy, 350, 1.40, 0.22);  // flowing water texture
  lfo(1.80, 0.14, hyBoil.gain);  // active flow
  lfo(0.40, 0.08, hyBoil.gain);  // swell
  const hyBoil2 = noise(hy, 200, 2.00, 0.12);
  lfo(0.90, 0.07, hyBoil2.gain);
  osc(hy, 180, 0.07);             // faint pump/drip tone with LFO
  const hyDrip = c.createGain(); hyDrip.gain.value = 0.07;
  const hyDripOsc = c.createOscillator(); hyDripOsc.type = 'sine'; hyDripOsc.frequency.value = 180;
  lfo(2.20, 0.06, hyDrip.gain);
  hyDripOsc.connect(hyDrip); hyDrip.connect(hy); hyDripOsc.start();

  // ---- cargo hold: low rumble, structure ----
  const cg = bus('cargo');
  osc(cg, 65, 0.18);              // structure resonance
  noise(cg, 140, 1.20, 0.12);    // low-pass rumble

  // ---- station: cantina (warmth, crowd, ventilation) ----
  const cant = bus('cantina');
  const cantChatter = noise(cant, 600, 0.35, 0.15); // speech band
  lfo(0.55, 0.08, cantChatter.gain);  // crowd swell
  noise(cant, 180, 1.00, 0.08);  // HVAC bass
  osc(cant, 120, 0.04);

  // ---- station: concourse (open space, footsteps, HVAC) ----
  const conc = bus('concourse');
  noise(conc, 800, 0.30, 0.08);  // high ceiling reverb character
  noise(conc, 200, 1.20, 0.07);
  osc(conc, 90, 0.04);

  // ---- station: docks (your ship is right there, idling) ----
  const dk = bus('docks');
  osc(dk, 110, 0.22);            // ship reactor bleed-through
  osc(dk, 88, 0.10, 'sawtooth');
  noise(dk, 250, 0.90, 0.16);    // mechanical deck noise

  // ---- station: drydock (industrial — sparks, welding) ----
  const dd = bus('drydock');
  osc(dd, 95, 0.20, 'sawtooth');
  noise(dd, 400, 0.60, 0.16);
  noise(dd, 2000, 0.40, 0.04);   // high metallic work noise

  // ---- station: undercity (dark, low, recyclers running) ----
  const uc = bus('undercity');
  osc(uc, 72, 0.22);
  noise(uc, 160, 1.50, 0.14);
  osc(uc, 48, 0.10);             // very deep hum

  // ---- station: harbor / market (bureaucratic quiet) ----
  const har = bus('harbor');
  osc(har, 220, 0.04);
  noise(har, 3000, 0.60, 0.025, true);

  const mkt = bus('market');
  osc(mkt, 200, 0.04);
  noise(mkt, 500, 0.40, 0.05);
}

// ---- cockpit ambience: occasional soft instrument pings ----

function softBeep() {
  const freqs = [660, 784, 880, 1047];
  chime(freqs[Math.floor(Math.random() * freqs.length)], 0.055, 0.5);
}

function scheduleBeep() {
  cockpitBeepTimer = setTimeout(() => {
    if (currentRoomKind === 'cockpit') { softBeep(); scheduleBeep(); }
    else cockpitBeepTimer = null;
  }, 5000 + Math.random() * 9000);
}

// ---- room cross-fade ----

function setRoomMix(kind: string | null) {
  if (!buses || !ctx || !hum) return;
  const t = ctx.currentTime;
  const tc = 1.6; // time constant — ~80% transition in 4s

  // Fade all buses: target is ROOM_BUS_GAIN for the active room, 0 for others
  for (const [k, b] of Object.entries(buses)) {
    const target = k === kind ? (ROOM_BUS_GAIN[k] ?? 0.2) : 0;
    b.gain.gain.setTargetAtTime(target, t, tc);
  }

  // Scale the global hum
  const key = kind ?? 'corridor';
  const scale = HUM_SCALE[key] ?? HUM_SCALE.default;
  hum.gain.gain.setTargetAtTime(0.45 * scale, t, tc);

  // Cockpit beeps
  if (kind === 'cockpit' && !cockpitBeepTimer) scheduleBeep();
  if (kind !== 'cockpit' && cockpitBeepTimer) { clearTimeout(cockpitBeepTimer); cockpitBeepTimer = null; }
}

// ---- low-hull warning ----

function warnLowHull() {
  const c = boot(); if (!master) return;
  ([[ 330, 0 ], [ 247, 0.45 ], [ 196, 0.9 ]] as [number, number][]).forEach(([freq, delay]) => {
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(master!); o.start(t); o.stop(t + 0.42);
  });
}

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
  if (cockpitBeepTimer) { clearTimeout(cockpitBeepTimer); cockpitBeepTimer = null; }
  const t = ctx.currentTime;
  for (const b of Object.values(buses)) b.gain.gain.setTargetAtTime(0, t, 1.2);
  hum.gain.gain.setTargetAtTime(0.45, t, 1.5); // restore full ambient
}

// Called every render — morphs ambient to travel state, triggers hull warning.
export function update(opts: { travel: boolean; hullPct: number; cautionKey: string }) {
  const c = boot(); if (!hum) return;
  const t = c.currentTime;

  // Engine frequencies and ambient gain shift with drive state
  if (!walkActive) {
    const freq = opts.travel ? 140 : 110;
    hum.osc1.frequency.setTargetAtTime(freq,        t, 1.8);
    hum.osc2.frequency.setTargetAtTime(freq * 1.067, t, 1.8);
    hum.osc3.frequency.setTargetAtTime(freq * 2,    t, 1.8);
    hum.osc4.frequency.setTargetAtTime(freq * 3,    t, 1.8);
    hum.gain.gain.setTargetAtTime(opts.travel ? 0.55 : 0.45, t, 1.5);
  }

  // Structural rattle worsens as hull degrades
  const boilTarget = opts.hullPct < 0.3 ? 0.30 : 0.18;
  hum.boilGain.gain.setTargetAtTime(boilTarget, t, 2.5);

  // Low-hull warning: three descending pulses, fired once when crossing 20%
  if (opts.hullPct < 0.2 && lastHullPct >= 0.2) warnLowHull();
  lastHullPct = opts.hullPct;
}

// No looping alarm to cancel — kept for API compatibility.
export function ackAlarm() { /* one-shot warning; nothing to cancel */ }

// ---- one-shot SFX ----

export function bayDoors(opening: boolean) {
  const c = boot(); if (!master) return;
  const t = c.currentTime; const dur = 1.25;
  const ns = mkn(c), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'lowpass'; f.frequency.value = opening ? 110 : 80;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.10);
  g.gain.setValueAtTime(0.18, t + dur - 0.15); g.gain.linearRampToValueAtTime(0, t + dur);
  ns.connect(f); f.connect(g); g.connect(master); ns.start(t); ns.stop(t + dur + 0.05);
  const clunk = (delay: number, freq: number, vol: number) => {
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    og.gain.setValueAtTime(vol, t + delay); og.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.24);
    o.connect(og); og.connect(master!); o.start(t + delay); o.stop(t + delay + 0.26);
  };
  clunk(0.05, 72, 0.28); clunk(dur - 0.05, 60, 0.24);
}

export function jettison() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const ns = mkn(c), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(150, t + 0.65); f.Q.value = 0.5;
  g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  ns.connect(f); f.connect(g); g.connect(master); ns.start(t); ns.stop(t + 0.70);
}

export function fuelVent() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const ns = mkn(c), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'highpass'; f.frequency.value = 1800;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.04);
  g.gain.setValueAtTime(0.22, t + 0.9); g.gain.linearRampToValueAtTime(0, t + 1.1);
  ns.connect(f); f.connect(g); g.connect(master); ns.start(t); ns.stop(t + 1.15);
}

export function commsTune() { chime(784, 0.22, 1.2); }

export function engageBurn() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const o = c.createOscillator(), og = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.9);
  og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.35, t + 0.18);
  og.gain.setValueAtTime(0.30, t + 0.75); og.gain.linearRampToValueAtTime(0, t + 1.05);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 1.1);
  const ns = mkn(c), nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'lowpass'; nf.frequency.value = 280;
  ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.20, t + 0.22); ng.gain.linearRampToValueAtTime(0, t + 1.0);
  ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t); ns.stop(t + 1.05);
}

export function weaponFire(kind: 'laser' | 'torpedo' | 'ion') {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  if (kind === 'laser') {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.22);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.24);
  } else if (kind === 'torpedo') {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.08); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(0.38, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.52);
    const ns = mkn(c), nf = c.createBiquadFilter(), ng = c.createGain();
    nf.type = 'lowpass'; nf.frequency.value = 280;
    ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
    ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t); ns.stop(t + 0.35);
  } else {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(160, t); o.frequency.linearRampToValueAtTime(640, t + 0.26);
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.28);
  }
}

export function hullHit() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const o = c.createOscillator(), og = c.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(26, t + 0.32);
  og.gain.setValueAtTime(0.42, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.34);
  const o2 = c.createOscillator(), og2 = c.createGain();
  o2.type = 'sine'; o2.frequency.value = 740;
  og2.gain.setValueAtTime(0.10, t); og2.gain.exponentialRampToValueAtTime(0.001, t + 0.70);
  o2.connect(og2); og2.connect(master); o2.start(t); o2.stop(t + 0.72);
}

export function systemDamage() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const ns = mkn(c), nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'lowpass'; nf.frequency.value = 500;
  ng.gain.setValueAtTime(0.38, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t); ns.stop(t + 0.44);
  const o = c.createOscillator(), og = c.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.linearRampToValueAtTime(72, t + 0.26);
  og.gain.setValueAtTime(0.14, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.28);
}

// Soft two-note chime (C6 + E6) — generic UI button confirm.
export function uiClick() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const note = (freq: number, vol: number, delay: number, decay: number) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t + delay);
    g.gain.linearRampToValueAtTime(vol, t + delay + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + decay);
    o.connect(g); g.connect(master!); o.start(t + delay); o.stop(t + delay + decay + 0.01);
  };
  note(1047, 0.072, 0.000, 0.20);  // C6
  note(1319, 0.036, 0.055, 0.16);  // E6 — arrives just after, makes a little two-note lift
}

// Ascending arpeggio (C5→E5→G5) when powering a module on; descending when off.
export function moduleToggle(on: boolean) {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const freqs = on ? [523, 659, 784] : [784, 659, 523];
  const vol = on ? 0.09 : 0.07;
  freqs.forEach((freq, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const start = t + i * 0.11;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.010);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.48);
    o.connect(g); g.connect(master!); o.start(start); o.stop(start + 0.50);
  });
}

// Physical thud of the vent guard flipping + a soft confirming blip.
export function guardFlip() {
  const c = boot(); if (!master) return;
  const t = c.currentTime;
  const ns = mkn(c), nf = c.createBiquadFilter(), ng = c.createGain();
  nf.type = 'bandpass'; nf.frequency.value = 190; nf.Q.value = 1.8;
  ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t); ns.stop(t + 0.08);
  const o = c.createOscillator(), og = c.createGain();
  o.type = 'sine'; o.frequency.value = 880;
  og.gain.setValueAtTime(0, t + 0.04); og.gain.linearRampToValueAtTime(0.045, t + 0.048);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
  o.connect(og); og.connect(master); o.start(t + 0.04); o.stop(t + 0.21);
}
