// Tiny indirection so game systems can reach the presentation layer without
// importing it (avoids import cycles, and keeps src/systems/ portable).
// main.ts wires these to the real UI at boot.
let renderFn: () => void = () => {};
export function setRender(f: () => void) { renderFn = f; }
export function requestRender() { renderFn(); }

// ---- sound effects ----
// The sim used to `import * as sfx from "../audio"` and call straight into the
// Web Audio API. Two problems with that, and they're the same problem:
//
//   1. It crashed headlessly. combat.ts's releaseShot() called sfx.weaponFire(),
//      which did `new AudioContext()` — undefined in Node — so ship combat could
//      not be tested outside a browser at all. That's why combat sat outside the
//      regression net for so long.
//   2. There is no AudioContext in Unity either. Every direct audio call in the
//      sim is a thing a port has to find and rewrite.
//
// So combat now *asks for a sound* and something else decides how to make it.
// The default sink is silent, which is exactly right for a headless run: the
// game logic is complete without audio, and audio is a consequence of it.
export interface SfxSink {
  moduleToggle(on: boolean): void;
  weaponFire(kind: "laser" | "torpedo" | "ion"): void;
  hullHit(): void;
  systemDamage(): void;
}

const silent: SfxSink = {
  moduleToggle: () => {},
  weaponFire: () => {},
  hullHit: () => {},
  systemDamage: () => {},
};

let sink: SfxSink = silent;
export function setSfx(s: SfxSink) { sink = s; }

// What systems/ import. Delegates to whatever sink the host installed.
export const sfx: SfxSink = {
  moduleToggle: (on) => sink.moduleToggle(on),
  weaponFire: (kind) => sink.weaponFire(kind),
  hullHit: () => sink.hullHit(),
  systemDamage: () => sink.systemDamage(),
};

// ---- combat view ----
// Ship combat's resolution logic (systems/combat.ts) used to build its own HTML,
// push tracer effects straight into the DOM, and mount a WebGL avatar — 250-odd
// lines of view woven through the sim. That made the fight unportable (a C# host
// renders combat its own way) and, before the audio fix, uncrashable-in-Node was
// not even true. The sim now OWNS the fight and ASKS a view to show it:
//   - render():  draw the current fight (the view reads combatVM() for the data)
//   - fx(event): a tracer/impact happened at a screen position — animate it
//   - teardown(): the fight ended; tear down the modal + avatar
// The default sink is silent, which is exactly right headless: the fight
// resolves identically whether or not anyone is watching it.
export interface CombatFXEvent {
  kind: "shot" | "return";
  x: number;
  y: number;
  color: string;
  score?: number;
}

export interface CombatViewSink {
  render(): void;
  fx(event: CombatFXEvent): void;
  teardown(): void;
}

const noCombatView: CombatViewSink = { render: () => {}, fx: () => {}, teardown: () => {} };

let combatSink: CombatViewSink = noCombatView;
export function setCombatView(v: CombatViewSink) { combatSink = v; }

export const combatView: CombatViewSink = {
  render: () => combatSink.render(),
  fx: (e) => combatSink.fx(e),
  teardown: () => combatSink.teardown(),
};
