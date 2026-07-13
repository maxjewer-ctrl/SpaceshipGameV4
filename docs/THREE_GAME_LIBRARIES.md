# The 3D Walk Layer — architecture and history

Rewritten 2026-07-13 (beta foundations pass, see docs/BETA_PLAN.md §3). This
document records how the walk layer is built, what was removed and why, and
the rules for adding a rendering/game library. Read this before touching the
walk runtime or proposing a new dependency.

## Current package set

| Package | Purpose | Status |
| --- | --- | --- |
| `three` | Rendering, cameras, scene graph, raycasting, post-processing | The one and only 3D dependency |
| `@supabase/supabase-js` | Optional cloud content/saves (not a 3D lib, listed for completeness) | Offline-first, no-op without credentials |

## Removed in the beta foundations pass (and why)

| Package | Why it left |
| --- | --- |
| `@dimforge/rapier3d-compat` | Never authoritative: the deterministic 2D rect sim in `ui/walk.ts` always owned movement/collision, and Rapier just mirrored it at the cost of a ~2MB WASM chunk. |
| `three-pathfinding` | Its "navmesh" was the floor rectangles re-triangulated; the grid A* it fell back to (same `insideFloors()` predicate as movement) is the one that always worked. A* stays. |
| `yuka` | One arrive behavior, rebuilt per frame. Replaced by 20 lines of plain math (`systems/walkRuntime.ts steerAgent`). |
| `three.quarks` | Installed, never integrated. Return to it only with a real FX budget and a pooled-effects design. |
| (2D canvas fallback) | The walk screens' hidden `<canvas>` renderer drew every frame under the 3D view. WebGL is required now; without it the viewport shows a plain notice. `avatarDraw.ts` survives for the character-creator preview. |

If any of these come back, they come back through the checklist at the bottom
— not by default.

## The architecture (one sim, one view)

- **`src/ui/walk.ts`** — the authority. Deterministic 2D simulation: input,
  movement, collision (`insideFloors`), grid A* click-to-move, proximity,
  interaction, and the action-mode verbs (aim/fire/roll, projectiles, the
  practice dummy). Fully headless-drivable (`__walkStep`, `__walkPos`,
  `__walkGoto`) — nothing here needs a GPU or a DOM to be tested.
- **`src/ui/walk3d.ts`** — the view. Three.js presentation of whatever the
  sim says: deck geometry, actors, labels, action FX, post-processing
  (bloom + CRT pass). It never owns positions, collision, or interaction.
- **`src/systems/walkRuntime.ts`** — `steerAgent()` arrive-steering for ship
  crew wandering (used by `shipwalk.ts`).
- **`src/ui/stationwalk.ts` / `planetwalk.ts` / `shipwalk.ts`** — scene
  builders (rooms, doors, actors, prose) consumed by both sim and view.

## Camera (fixed, by design)

One fixed semi-top-down follow camera, defined in `walk3d.ts`:

- Sits due "south" of the avatar at `(0, CAM_HEIGHT, CAM_OFFSET_Z)` =
  `(0, 15.5, 6.5)`, looking at the avatar — a ~67° down angle.
- **Long lens**: FOV 30. Narrow FOV from far away keeps the deck plan
  reading near-orthographic instead of keystone-splayed.
- **No orbit, ever.** Screen axes are world axes; input needs no camera
  transform, and the camera-relative-movement bug class (a56feda) cannot
  recur. If a scene needs a different framing, author a different fixed
  angle per scene — do not reintroduce a free camera.

## Walk modes

`WalkScene.action` selects the mode (see BETA_PLAN §3.1):

| | Deck mode | Action mode |
| --- | --- | --- |
| Where | Your ship, friendly station decks | Planet surfaces, silenced (hostile) stations, future boardings |
| Stride | 230 px/s | 320 px/s |
| Verbs | Move, interact, click-to-move (left or right click) | + aim (mouse/right stick), fire (LMB/RT), roll (Space/B); left-click fires, right-click walks |
| Practice dummy | Never | Spawns near entry (temporary, until real foot encounters land in Phase C) |

## Controls

| Action | Keyboard/mouse | Controller |
| --- | --- | --- |
| Move | WASD / arrows | Left stick / d-pad |
| Interact | E | A |
| Click-to-move | Left click (deck) / right click (both modes) | — |
| Aim (action) | Mouse over ground | Right stick |
| Fire (action) | Left mouse | Right trigger |
| Roll (action) | Space | B |

## Known caveats

- Action-effect meshes (`actionFx`) are cleared and recreated each frame;
  migrate to pooling when foot encounters become real content (Phase C/E).
- Pointer listeners added anonymously in `walk3d.mount()` should be retained
  and removed explicitly during teardown.
- Dustwell's dressing (prop scale, plank textures, fog color) was tuned for
  the old 35° chase camera and needs a graphics-cycle pass against the new
  angle.
- The production build's `three` chunk is large; it is lazy-loaded on first
  walk mount. Keep it that way.

## Adding another library

Before adding an overlapping package, document:

1. Which missing capability it supplies.
2. Why the existing package (three) cannot supply it.
3. Whether it owns domain state or only runtime/presentation behavior — it
   must never own domain state.
4. Its license, maintenance status, bundle cost, and browser support.
5. The adapter boundary that lets the project replace it later.

The bar is deliberately high: this layer just shed four dependencies that
each passed a weaker version of this test.
