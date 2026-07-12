// src/audio.ts — procedural ship audio via Web Audio API.
// No asset files. All sounds are synthesised from oscillators, noise, and filters.
// The AudioContext boots on first user interaction (browser autoplay policy).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let _noiseBuf: AudioBuffer | null = null;

interface HumState {
  gain: GainNode;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;
  osc4: OscillatorNode;
  boilGain: GainNode;
  steamGain: GainNode;
}

let hum: HumState | null = null;
let lastHullPct = 1;

// ---- context ----

function boot(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    initHum();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ---- shared white-noise buffer (4 s, looped) ----

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
  n.buffer = nbuf(c);
  n.loop = true;
  return n;
}

// ---- chime: warm bell with inharmonic overtones ----

function chime(freq: number, vol: number, decay: number) {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const o1 = c.createOscillator();
  const g1 = c.createGain();
  o1.type = 'sine'; o1.frequency.value = freq;
  g1.gain.setValueAtTime(vol, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + decay);
  o1.connect(g1); g1.connect(master);
  o1.start(t); o1.stop(t + decay + 0.05);

  // Bell second partial (~2.76× — inharmonic, gives that "bloom")
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = 'sine'; o2.frequency.value = freq * 2.756;
  g2.gain.setValueAtTime(vol * 0.3, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.5);
  o2.connect(g2); g2.connect(master);
  o2.start(t); o2.stop(t + decay * 0.5 + 0.05);

  // Soft third partial
  const o3 = c.createOscillator();
  const g3 = c.createGain();
  o3.type = 'sine'; o3.frequency.value = freq * 5.4;
  g3.gain.setValueAtTime(vol * 0.08, t);
  g3.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.25);
  o3.connect(g3); g3.connect(master);
  o3.start(t); o3.stop(t + decay * 0.25 + 0.05);
}

// ---- ambient reactor hum + boiling/steam texture ----

function initHum() {
  if (!ctx || !master) return;
  const g = ctx.createGain();
  g.gain.value = 0.45;   // overall hum bus — clearly audible

  // Four-oscillator sine stack.
  // 110 Hz (A2) is the lowest frequency most laptop speakers reproduce.
  const o1 = ctx.createOscillator();
  o1.type = 'sine'; o1.frequency.value = 110;
  const g1 = ctx.createGain(); g1.gain.value = 0.5;
  o1.connect(g1); g1.connect(g); o1.start();

  // Slightly detuned second — beating creates a living, breathing quality
  const o2 = ctx.createOscillator();
  o2.type = 'sine'; o2.frequency.value = 117.3;
  const g2 = ctx.createGain(); g2.gain.value = 0.28;
  o2.connect(g2); g2.connect(g); o2.start();

  // 2nd harmonic — warmth
  const o3 = ctx.createOscillator();
  o3.type = 'sine'; o3.frequency.value = 220;
  const g3 = ctx.createGain(); g3.gain.value = 0.14;
  o3.connect(g3); g3.connect(g); o3.start();

  // 3rd harmonic — a touch of presence
  const o4 = ctx.createOscillator();
  o4.type = 'sine'; o4.frequency.value = 330;
  const g4 = ctx.createGain(); g4.gain.value = 0.06;
  o4.connect(g4); g4.connect(g); o4.start();

  // "Boiling" texture: bandpass noise with two slow LFOs modulating amplitude.
  // Sounds like pipes, steam, a kettle barely simmering — warm and alive.
  const boilNoise = mkn(ctx);
  const boilFilter = ctx.createBiquadFilter();
  boilFilter.type = 'bandpass'; boilFilter.frequency.value = 320; boilFilter.Q.value = 1.8;
  const boilGain = ctx.createGain();
  boilGain.gain.value = 0.18;   // clearly audible texture

  const lfo1 = ctx.createOscillator();
  lfo1.type = 'sine'; lfo1.frequency.value = 1.1;
  const ld1 = ctx.createGain(); ld1.gain.value = 0.09;  // ±0.09 modulation
  lfo1.connect(ld1); ld1.connect(boilGain.gain); lfo1.start();

  const lfo2 = ctx.createOscillator();
  lfo2.type = 'sine'; lfo2.frequency.value = 0.65;
  const ld2 = ctx.createGain(); ld2.gain.value = 0.05;
  lfo2.connect(ld2); ld2.connect(boilGain.gain); lfo2.start();

  boilNoise.connect(boilFilter); boilFilter.connect(boilGain); boilGain.connect(g);
  boilNoise.start();

  // Gentle high-frequency steam hiss — like a distant vent
  const steamNoise = mkn(ctx);
  const steamFilter = ctx.createBiquadFilter();
  steamFilter.type = 'highpass'; steamFilter.frequency.value = 3500;
  const steamGain = ctx.createGain(); steamGain.gain.value = 0.04;
  steamNoise.connect(steamFilter); steamFilter.connect(steamGain); steamGain.connect(g);
  steamNoise.start();

  g.connect(master);
  hum = { gain: g, osc1: o1, osc2: o2, osc3: o3, osc4: o4, boilGain, steamGain };
}

// ---- low-hull warning — three descending sine pulses, calm not panicky ----

function warnLowHull() {
  const c = boot();
  if (!master) return;
  ([[ 330, 0 ], [ 247, 0.45 ], [ 196, 0.9 ]] as [number, number][]).forEach(([freq, delay]) => {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(master!);
    o.start(t); o.stop(t + 0.42);
  });
}

// ---- exported API ----

// Called from render() every frame. Morphs the ambient and gates the hull warning.
export function update(opts: { travel: boolean; hullPct: number; cautionKey: string }) {
  const c = boot();
  if (!hum) return;
  const t = c.currentTime;

  // In transit: engine frequencies rise and volume swells
  const freq     = opts.travel ? 140   : 110;
  const beatFreq = opts.travel ? 149.2 : 117.3;
  const gainVal  = opts.travel ? 0.55  : 0.45;

  hum.osc1.frequency.setTargetAtTime(freq,        t, 1.8);
  hum.osc2.frequency.setTargetAtTime(beatFreq,    t, 1.8);
  hum.osc3.frequency.setTargetAtTime(freq * 2,    t, 1.8);
  hum.osc4.frequency.setTargetAtTime(freq * 3,    t, 1.8);
  hum.gain.gain.setTargetAtTime(gainVal,           t, 1.5);

  // Damaged hull: boil texture intensifies (structural stress, pipes rattling)
  const boilTarget = opts.hullPct < 0.3 ? 0.32 : 0.18;
  hum.boilGain.gain.setTargetAtTime(boilTarget,   t, 2.5);

  // Low-hull warning fires once when crossing the 20% threshold downward
  if (opts.hullPct < 0.2 && lastHullPct >= 0.2) warnLowHull();
  lastHullPct = opts.hullPct;
}

// No looping alarm to cancel — kept for API compatibility.
export function ackAlarm() { /* one-shot warning; nothing to cancel */ }

// Cargo bay doors cycling (~1.25 s of mechanical travel).
export function bayDoors(opening: boolean) {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;
  const dur = 1.25;

  // Low rumble — hydraulics moving
  const ns = mkn(c);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = opening ? 110 : 80;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.1);
  g.gain.setValueAtTime(0.18, t + dur - 0.15);
  g.gain.linearRampToValueAtTime(0, t + dur);
  ns.connect(filt); filt.connect(g); g.connect(master);
  ns.start(t); ns.stop(t + dur + 0.05);

  // Opening clunk
  const cl1 = c.createOscillator();
  const cg1 = c.createGain();
  cl1.type = 'sine'; cl1.frequency.value = 72;
  cg1.gain.setValueAtTime(0.28, t + 0.05);
  cg1.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  cl1.connect(cg1); cg1.connect(master);
  cl1.start(t + 0.05); cl1.stop(t + 0.3);

  // Closing clunk
  const cl2 = c.createOscillator();
  const cg2 = c.createGain();
  cl2.type = 'sine'; cl2.frequency.value = 60;
  cg2.gain.setValueAtTime(0.24, t + dur - 0.05);
  cg2.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.22);
  cl2.connect(cg2); cg2.connect(master);
  cl2.start(t + dur - 0.05); cl2.stop(t + dur + 0.24);
}

// Cargo jettisoned — outward pressure whoosh.
export function jettison() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const ns = mkn(c);
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(700, t);
  filt.frequency.exponentialRampToValueAtTime(150, t + 0.65);
  filt.Q.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.32, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  ns.connect(filt); filt.connect(g); g.connect(master);
  ns.start(t); ns.stop(t + 0.7);
}

// Emergency fuel vent — sustained high-pressure hiss.
export function fuelVent() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const ns = mkn(c);
  const filt = c.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = 1800;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.04);
  g.gain.setValueAtTime(0.22, t + 0.9);
  g.gain.linearRampToValueAtTime(0, t + 1.1);
  ns.connect(filt); filt.connect(g); g.connect(master);
  ns.start(t); ns.stop(t + 1.15);
}

// Comms channel tuned — a warm G5 bell chime.
export function commsTune() {
  chime(784, 0.22, 1.2);
}

// Main drive engaged — low sine swell rising into the travel hum.
export function engageBurn() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(55, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.9);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.35, t + 0.18);
  og.gain.setValueAtTime(0.3, t + 0.75);
  og.gain.linearRampToValueAtTime(0, t + 1.05);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 1.1);

  const ns = mkn(c);
  const nf = c.createBiquadFilter();
  nf.type = 'lowpass'; nf.frequency.value = 280;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.2, t + 0.22);
  ng.gain.linearRampToValueAtTime(0, t + 1.0);
  ns.connect(nf); nf.connect(ng); ng.connect(master);
  ns.start(t); ns.stop(t + 1.05);
}

// Weapon fired in combat.
export function weaponFire(kind: 'laser' | 'torpedo' | 'ion') {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  if (kind === 'laser') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.22);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.24);
  } else if (kind === 'torpedo') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.52);

    const ns = mkn(c);
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 280;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    ns.connect(nf); nf.connect(ng); ng.connect(master);
    ns.start(t); ns.stop(t + 0.35);
  } else {
    // Ion: ascending electric sweep
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.linearRampToValueAtTime(640, t + 0.26);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.28);
  }
}

// Hull struck — low thump with metallic ring.
export function hullHit() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(26, t + 0.32);
  og.gain.setValueAtTime(0.42, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 0.34);

  const o2 = c.createOscillator();
  const og2 = c.createGain();
  o2.type = 'sine'; o2.frequency.value = 740;
  og2.gain.setValueAtTime(0.1, t);
  og2.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o2.connect(og2); og2.connect(master);
  o2.start(t); o2.stop(t + 0.72);
}

// A module takes a direct hit — crackle and crunch.
export function systemDamage() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const ns = mkn(c);
  const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.38, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  ns.connect(nf); nf.connect(ng); ng.connect(master);
  ns.start(t); ns.stop(t + 0.44);

  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(200, t);
  o.frequency.linearRampToValueAtTime(72, t + 0.26);
  og.gain.setValueAtTime(0.14, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 0.28);
}
