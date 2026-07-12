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
  noiseGain: GainNode;
}

let hum: HumState | null = null;
let lastHullPct = 1;

// ---- context ----

function boot(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);
    initHum();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ---- shared noise buffer (4 s of white noise, looped) ----

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

// ---- chime: a warm bell-like tone with natural inharmonic overtones ----

function chime(freq: number, vol: number, decay: number) {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  // Fundamental
  const o1 = c.createOscillator();
  const g1 = c.createGain();
  o1.type = 'sine'; o1.frequency.value = freq;
  g1.gain.setValueAtTime(vol, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + decay);
  o1.connect(g1); g1.connect(master);
  o1.start(t); o1.stop(t + decay + 0.05);

  // Inharmonic second partial (bell character — not 2× but ~2.76×)
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = 'sine'; o2.frequency.value = freq * 2.756;
  g2.gain.setValueAtTime(vol * 0.28, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.55);
  o2.connect(g2); g2.connect(master);
  o2.start(t); o2.stop(t + decay * 0.55 + 0.05);

  // Soft third partial
  const o3 = c.createOscillator();
  const g3 = c.createGain();
  o3.type = 'sine'; o3.frequency.value = freq * 5.404;
  g3.gain.setValueAtTime(vol * 0.08, t);
  g3.gain.exponentialRampToValueAtTime(0.001, t + decay * 0.3);
  o3.connect(g3); g3.connect(master);
  o3.start(t); o3.stop(t + decay * 0.3 + 0.05);
}

// ---- ambient reactor hum with "boiling" machinery texture ----

function initHum() {
  if (!ctx || !master) return;
  const g = ctx.createGain();
  g.gain.value = 0.09;

  // Sine-stack fundamental complex (warm, not buzzy)
  const o1 = ctx.createOscillator();
  o1.type = 'sine'; o1.frequency.value = 52;
  const g1 = ctx.createGain(); g1.gain.value = 0.5;
  o1.connect(g1); g1.connect(g); o1.start();

  // Slightly detuned second oscillator — beating creates life
  const o2 = ctx.createOscillator();
  o2.type = 'sine'; o2.frequency.value = 55.4;
  const g2 = ctx.createGain(); g2.gain.value = 0.25;
  o2.connect(g2); g2.connect(g); o2.start();

  // 2nd harmonic (sine, not triangle — softer)
  const o3 = ctx.createOscillator();
  o3.type = 'sine'; o3.frequency.value = 104;
  const g3 = ctx.createGain(); g3.gain.value = 0.1;
  o3.connect(g3); g3.connect(g); o3.start();

  // Gentle 3rd harmonic for warmth
  const o4 = ctx.createOscillator();
  o4.type = 'sine'; o4.frequency.value = 156;
  const g4 = ctx.createGain(); g4.gain.value = 0.04;
  o4.connect(g4); g4.connect(g); o4.start();

  // "Boiling" texture — bandpass noise modulated by a slow LFO
  // Sounds like distant pipes, steam, or a kettle barely simmering.
  const boilNoise = mkn(ctx);
  const boilFilter = ctx.createBiquadFilter();
  boilFilter.type = 'bandpass'; boilFilter.frequency.value = 280; boilFilter.Q.value = 2.2;
  const boilGain = ctx.createGain();
  boilGain.gain.value = 0.022;

  // LFO at 1.1 Hz modulates the boil gain ±0.016 — creates burbling
  const lfo = ctx.createOscillator();
  lfo.type = 'sine'; lfo.frequency.value = 1.1;
  const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.016;
  lfo.connect(lfoDepth); lfoDepth.connect(boilGain.gain);
  lfo.start();

  // Second slower LFO adds complexity
  const lfo2 = ctx.createOscillator();
  lfo2.type = 'sine'; lfo2.frequency.value = 0.68;
  const lfo2Depth = ctx.createGain(); lfo2Depth.gain.value = 0.009;
  lfo2.connect(lfo2Depth); lfo2Depth.connect(boilGain.gain);
  lfo2.start();

  boilNoise.connect(boilFilter); boilFilter.connect(boilGain); boilGain.connect(g);
  boilNoise.start();

  // Very soft high-frequency steam hiss (barely perceptible)
  const steamNoise = mkn(ctx);
  const steamFilter = ctx.createBiquadFilter();
  steamFilter.type = 'highpass'; steamFilter.frequency.value = 4000;
  const steamGain = ctx.createGain(); steamGain.gain.value = 0.006;
  steamNoise.connect(steamFilter); steamFilter.connect(steamGain); steamGain.connect(g);
  steamNoise.start();

  g.connect(master);
  hum = { gain: g, osc1: o1, osc2: o2, osc3: o3, osc4: o4, boilGain, noiseGain: steamGain };
}

// ---- low hull warning — a single soft descending tone, not an alarm ----

function warnLowHull() {
  const c = boot();
  if (!master) return;
  // Three descending sine pulses — gentle caution, not panic
  [0, 0.45, 0.9].forEach((delay, i) => {
    const freq = [330, 247, 196][i];
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g); g.connect(master!);
    o.start(t); o.stop(t + 0.4);
  });
}

// ---- exported API ----

// Called from render() every frame. Morphs the ambient and triggers hull warning.
export function update(opts: { travel: boolean; hullPct: number; cautionKey: string }) {
  const c = boot();
  if (!hum) return;
  const t = c.currentTime;

  // In-transit: engines up — frequencies and gain rise
  const freq     = opts.travel ? 70   : 52;
  const beatFreq = opts.travel ? 74.5 : 55.4;
  const gainVal  = opts.travel ? 0.13 : 0.09;

  hum.osc1.frequency.setTargetAtTime(freq,        t, 1.8);
  hum.osc2.frequency.setTargetAtTime(beatFreq,    t, 1.8);
  hum.osc3.frequency.setTargetAtTime(freq * 2,    t, 1.8);
  hum.osc4.frequency.setTargetAtTime(freq * 3,    t, 1.8);
  hum.gain.gain.setTargetAtTime(gainVal,           t, 1.5);

  // Low hull: boost the boil texture (structural stress, liquid sounds tense up)
  const boilTarget = opts.hullPct < 0.3 ? 0.042 : 0.022;
  hum.boilGain.gain.setTargetAtTime(boilTarget,   t, 2.5);

  // Warn once when hull crosses below 20% — descending tone, no loop
  if (opts.hullPct < 0.2 && lastHullPct >= 0.2) warnLowHull();
  lastHullPct = opts.hullPct;
}

// Silence the low-hull warning is irrelevant here — it's a one-shot. Kept for API compat.
export function ackAlarm() { /* one-shot warning needs no cancel */ }

// Cargo bay doors cycling open or closed (~1.25 s mechanical travel).
export function bayDoors(opening: boolean) {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;
  const dur = 1.25;

  // Low mechanical rumble
  const ns = mkn(c);
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = opening ? 95 : 70;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.11, t + 0.1);
  g.gain.setValueAtTime(0.09, t + dur - 0.15);
  g.gain.linearRampToValueAtTime(0, t + dur);
  ns.connect(filt); filt.connect(g); g.connect(master);
  ns.start(t); ns.stop(t + dur + 0.05);

  // Soft clunk at each end
  const clunk = c.createOscillator();
  const cg = c.createGain();
  clunk.type = 'sine'; clunk.frequency.value = 68;
  cg.gain.setValueAtTime(0.12, t + 0.05);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  clunk.connect(cg); cg.connect(master);
  clunk.start(t + 0.05); clunk.stop(t + 0.24);

  const clunk2 = c.createOscillator();
  const cg2 = c.createGain();
  clunk2.type = 'sine'; clunk2.frequency.value = 58;
  cg2.gain.setValueAtTime(0.1, t + dur - 0.05);
  cg2.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.18);
  clunk2.connect(cg2); cg2.connect(master);
  clunk2.start(t + dur - 0.05); clunk2.stop(t + dur + 0.2);
}

// Cargo jettisoned — pressure whoosh.
export function jettison() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const ns = mkn(c);
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(700, t);
  filt.frequency.exponentialRampToValueAtTime(160, t + 0.6);
  filt.Q.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  ns.connect(filt); filt.connect(g); g.connect(master);
  ns.start(t); ns.stop(t + 0.65);
}

// Emergency fuel vent — high-pressure hiss.
export function fuelVent() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const ns = mkn(c);
  const filt = c.createBiquadFilter();
  filt.type = 'highpass'; filt.frequency.value = 1600;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.04);
  g.gain.setValueAtTime(0.12, t + 0.9);
  g.gain.linearRampToValueAtTime(0, t + 1.1);
  ns.connect(filt); filt.connect(g); g.connect(master);
  ns.start(t); ns.stop(t + 1.15);
}

// Comms channel tuned — a warm bell chime rather than a click.
export function commsTune() {
  chime(784, 0.12, 1.1); // G5 — pleasant, not shrill
}

// Main drive engaged — sine swell rising into travel hum.
export function engageBurn() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  // Warm low swell (sine, not sawtooth)
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(48, t);
  o.frequency.exponentialRampToValueAtTime(82, t + 0.9);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.2, t + 0.18);
  og.gain.setValueAtTime(0.18, t + 0.75);
  og.gain.linearRampToValueAtTime(0, t + 1.05);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 1.1);

  // Soft thruster rumble underneath
  const ns = mkn(c);
  const nf = c.createBiquadFilter();
  nf.type = 'lowpass'; nf.frequency.value = 260;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.1, t + 0.22);
  ng.gain.linearRampToValueAtTime(0, t + 1.0);
  ns.connect(nf); nf.connect(ng); ng.connect(master);
  ns.start(t); ns.stop(t + 1.05);
}

// Weapon discharged in combat.
export function weaponFire(kind: 'laser' | 'torpedo' | 'ion') {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  if (kind === 'laser') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.2);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.22);
  } else if (kind === 'torpedo') {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.52);

    const ns = mkn(c);
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 260;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.1, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    ns.connect(nf); nf.connect(ng); ng.connect(master);
    ns.start(t); ns.stop(t + 0.32);
  } else {
    // Ion: ascending sweep — electric feel
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.linearRampToValueAtTime(640, t + 0.26);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.28);
  }
}

// Hull takes incoming fire — low thump with metallic ring.
export function hullHit() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(26, t + 0.3);
  og.gain.setValueAtTime(0.28, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 0.32);

  const o2 = c.createOscillator();
  const og2 = c.createGain();
  o2.type = 'sine'; o2.frequency.value = 740;
  og2.gain.setValueAtTime(0.06, t);
  og2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o2.connect(og2); og2.connect(master);
  o2.start(t); o2.stop(t + 0.62);
}

// A module takes a direct hit — electrical crackle and structural crunch.
export function systemDamage() {
  const c = boot();
  if (!master) return;
  const t = c.currentTime;

  const ns = mkn(c);
  const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 500;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.24, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  ns.connect(nf); nf.connect(ng); ng.connect(master);
  ns.start(t); ns.stop(t + 0.42);

  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(195, t);
  o.frequency.linearRampToValueAtTime(70, t + 0.25);
  og.gain.setValueAtTime(0.09, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(og); og.connect(master);
  o.start(t); o.stop(t + 0.27);
}
