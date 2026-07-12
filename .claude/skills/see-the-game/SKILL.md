---
name: see-the-game
description: Capture and view what The Kestrel Run actually renders — WebGL walk decks, combat, and DOM screens — as PNG files you can Read, since the preview browser's native screenshot hangs. Use whenever you need to SEE the game (iterating on graphics/3D/CSS/layout, verifying a visual change, or judging feel), not just read its state.
---

# Seeing The Kestrel Run

The in-app preview browser runs the page in a **backgrounded/hidden tab**, so
Chromium's native screenshot (`computer { action: "screenshot" }`) has no
compositor surface to grab and **hangs for 30s then times out**. Same reason
`requestAnimationFrame` is throttled to a stop — the 3D scene only advances when
you manually step it. This is not fixable from the tool side.

The workaround: **the page renders its own pixels and POSTs them to disk**, then
you `Read` the file. Both halves already exist in the repo.

## The pipeline (already wired, dev-only)

1. **`window.__shot(opts?)`** — [src/debug/shot.ts](../../../src/debug/shot.ts), installed in
   [src/main.ts](../../../src/main.ts) behind `import.meta.env.DEV`. Captures whatever's on
   screen and POSTs a PNG to `/__shot`. Returns a status string like
   `"shot 1155KB → .shots/latest.png (200)"`.
2. **`/__shot` middleware** — [vite.config.ts](../../../vite.config.ts), serve-only. Writes the
   POST body to **`.shots/latest.png`** (gitignored).
3. **You** — `Read .shots/latest.png`. The Read tool renders PNGs visually.

So the whole loop is: change code → `__shot()` in the browser → `Read` the file.

## Usage

```
preview_start { name: "game" }     # once per session; keep it alive
```

Then in the browser (javascript_tool), after navigating to what you want to see:

```js
// wait for the dev import to register the helper (first load only)
for (let i=0;i<20 && typeof window.__shot!=='function';i++) await new Promise(r=>setTimeout(r,50));
return await window.__shot();       // → then Read .shots/latest.png
```

`__shot()` picks its capture path automatically:

- **A modal is open** (`#overlay.show`) → rasterizes the DOM. Combat, dialogue,
  events, the character creator, master caution — all of these are modals, so
  `__shot()` grabs the modal, not the 3D scene behind it.
- **A walk scene is up, no modal** → reads the `.walk3d-canvas` WebGL bitmap
  directly (forcing 3 sim frames first, since rAF is asleep).
- **Otherwise** → rasterizes the whole scrollable DOM page (full ship cockpit,
  map, planet screen top-to-bottom).

`__shot({ full:false })` clips DOM shots to the viewport instead of the whole
page — use it for modals and above-the-fold checks so the PNG stays small.

### WebGL walk scenes need frames forced

rAF is suspended, so a fresh mount is a blank/stale buffer until you step it.
`__shot()` steps 3 frames internally, but to actually MOVE or settle the scene,
step more first (`__walkStep(dt)` is the manual stepper from playtest-kestrel):

```js
window.nav('shipwalk');
for (let i=0;i<12;i++) window.__walkStep(0.03);   // let the camera settle
return await window.__shot();
```

To walk the captain into frame before shooting, drive the movement then step:

```js
window.walkPressStart('right');
for (let i=0;i<55;i++) window.__walkStep(0.04);    // travel aft
window.walkPressEnd('right');
for (let i=0;i<4;i++) window.__walkStep(0.03);
return await window.__shot();
```

## Iterating efficiently (this is the whole point)

Screenshots (the Read of a ~1-3MB PNG) are the main token cost. So:

- **One server, one tab, kept alive** the entire session.
- **Batch fixes, then one shot.** Never one screenshot per tweak — bundle 3-5
  related edits, look once, repeat. A single look routinely reveals several
  independent problems; fix them all before the next capture.
- **Route through the game like a player** — ship deck → station deck → combat
  (`__event('pirates')` → click Battle stations) → travel → map. Each surface is
  one iteration cycle. Commit at milestones, not per-tweak.

## Gotchas (all learned the hard way)

- **HMR does not remount the 3D scene.** After editing `walk3d.ts`, an HMR reload
  leaves the old scene mounted. Force a remount by navigating away and back:
  `window.nav('ship'); window.nav('shipwalk');` then re-step frames. Give HMR
  ~600ms to settle first (`await new Promise(r=>setTimeout(r,600))`).
- **`const` persists across javascript_tool calls.** Each eval shares one global
  scope, so a bare `const cv = ...` throws "already declared" on the next call.
  Wrap captures in an IIFE: `(async () => { ... })()`.
- **Freeze CSS animations to inspect FX geometry.** Tracers/impacts/shakes are
  short CSS animations — a shot mid-flight catches them half-drawn or gone.
  Inject a style that pins them to full extension, shoot, then remove it:
  ```js
  const st=document.createElement('style'); st.id='fxfreeze';
  st.textContent='.fx-tracer i{animation:none!important;transform:scaleX(1)!important;opacity:1!important}.fx-impact{animation:none!important;opacity:1!important;transform:scale(1.6)!important}';
  document.head.appendChild(st);
  /* trigger the FX, __shot(), then */ document.getElementById('fxfreeze')?.remove();
  ```
- **Live `<canvas>` inside a DOM raster.** The foreignObject rasterizer serializes
  `<canvas>` as blank; `__shot` inlines each canvas's current bitmap as an `<img>`
  so canvas-bearing DOM screens (the character-creator preview) capture correctly.
  If a canvas is WebGL with `preserveDrawingBuffer:false`, step a frame right
  before the shot so its buffer isn't already cleared.
- **DOM shots have a ~14px left-edge crop** — cosmetic; the far-left character of
  left-column labels can clip. Don't mistake it for a layout bug.

## Where the visual code lives

- **3D walk decks / post-FX** — [src/ui/walk3d.ts](../../../src/ui/walk3d.ts). Bloom + a CRT
  ShaderPass (grain/vignette/scanline/aberration) via `EffectComposer`; tuning
  dials are the `UnrealBloomPass` args and `CRT_SHADER.uniforms` near the top.
- **Captain / crew sprite (2D)** — [src/ui/avatarDraw.ts](../../../src/ui/avatarDraw.ts). Shared by
  the creator preview and the 2D fallback.
- **Combat ships + weapon FX** — [src/systems/combat.ts](../../../src/systems/combat.ts)
  (`foeShipSVG`, `flushFX`, `pendingFX`) + `.foe-ship`/`.fx-*` in
  [src/style.css](../../../src/style.css).
- **Cockpit / map / instrument CSS** — [src/style.css](../../../src/style.css),
  [src/ui/ship.ts](../../../src/ui/ship.ts), [src/ui/map.ts](../../../src/ui/map.ts).

For DRIVING the game (scenarios, handlers, combat timing, walking coordinates),
see the **playtest-kestrel** skill — this skill is only about SEEING it.

## Always finish with

- `read_console_messages { onlyErrors: true }` — a shader compile error or WebGL
  fault logs here; a silent black shot usually means the context died.
- `npx tsc --noEmit` before committing visual changes.
