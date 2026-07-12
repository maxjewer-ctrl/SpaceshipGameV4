# Three.js Game Libraries and Integration Notes

This document records the third-party game libraries added to Kestrel Run, why they were selected, their current integration status, and the intended direction of the 3D action layer. Read this before replacing the walk runtime, adding combat movement, or introducing another overlapping dependency.

## Current package set

| Package | Installed version | Purpose | Current status |
| --- | --- | --- | --- |
| `three` | `^0.185.1` | Rendering, cameras, scene graph, raycasting, animation, post-processing | Core renderer in active use |
| `@dimforge/rapier3d-compat` | `^0.19.3` | WASM physics, colliders, sensors, character movement, hit detection | Initialized and synchronized; not yet authoritative for movement |
| `three-pathfinding` | `^1.3.0` | Three.js-compatible navigation meshes and path queries | Used for click-to-move routes with fallback |
| `yuka` | `^0.7.8` | Steering behaviors and game AI | Used for crew arrival steering |
| `three.quarks` | `^0.17.1` | Batched particle effects | Installed but not yet integrated |

All four added libraries use permissive licenses suitable for this project. Check the packages' bundled `LICENSE` files again before redistribution if dependency versions change.

## Important files

- `src/ui/walk.ts`: authoritative walk/action state today, including input, movement, aiming, rolling, projectiles, proximity, and the target dummy.
- `src/ui/walk3d.ts`: Three.js presentation, orbit camera, pointer-to-floor raycasting, camera-relative input conversion, aim line, projectile meshes, and target-dummy rendering.
- `src/systems/walkRuntime.ts`: adapters for Rapier, Three Pathfinding, and Yuka.
- `src/ui/shipwalk.ts`: crew movement calls the Yuka adapter.
- `src/ui/stationwalk.ts`: station scene definitions consumed by both the walk simulation and 3D renderer.

## Intended game feel

The target is a Hades-like elevated action view with an orbitable camera, not an over-the-shoulder third-person controller.

- Movement is camera-relative. W or stick-up always moves toward screen-up, regardless of camera orbit.
- Movement and aiming are independent.
- Mouse position or the right stick controls aim.
- The character faces the aim direction while attacking; otherwise movement may drive facing.
- Dodge/roll, shooting, melee, abilities, hit reactions, and later moves should be explicit character states.
- Camera orbit must never make movement directions visually misleading.

Current controls:

| Action | Keyboard/mouse | Controller |
| --- | --- | --- |
| Move | WASD / arrows | Left stick |
| Aim | Mouse over deck | Right stick |
| Fire | Left mouse | Right trigger |
| Roll | Space | B |
| Interact | E | A |
| Orbit camera | Not yet assigned | Shoulder buttons |
| Click-to-move | Right mouse | Not assigned |

## Rapier

Rapier is dynamically imported in `configureWalkRuntime()` because the compatibility build includes a large WASM payload. Vite emits it as a separate lazy chunk, keeping it out of the initial application bundle.

The current adapter creates:

- a zero-gravity Rapier world;
- a kinematic player body;
- a spherical player sensor;
- fixed sensor bodies for scene actors;
- one physics step per active walk simulation frame.

At present, `walk.ts` still determines legal player movement with `insideFloors()` and then synchronizes the result into Rapier. Rapier is therefore **not yet authoritative**. Do not assume its player body can block walls or resolve movement.

The planned migration is:

1. Generate static wall/obstacle colliders from each `WalkScene`.
2. Use a Rapier kinematic character controller to compute requested movement.
3. Read the resolved Rapier translation back into the walk/action state.
4. Replace manual proximity distance checks with sensor intersection events.
5. Use collision groups for player, NPC, projectile, environment, interactable, and trigger categories.
6. Keep saved positions and public scene coordinates independent of Rapier-specific objects.

Do not serialize a Rapier `World` into `GameState`. Persist domain data and reconstruct physics when a scene mounts.

## Three Pathfinding

`walkRuntime.ts` builds navigation geometry from the union of the rectangular `WalkScene.floors`. Each rectangle becomes two triangles in a `THREE.BufferGeometry`, which is passed to `Pathfinding.createZone()`.

`navPath()` converts between the game's 2D coordinates and Three.js navigation coordinates:

```text
game x -> Three.js x
game y -> Three.js z
Three.js y -> elevation (currently zero)
```

Click-to-move asks `navPath()` first. If zone construction or path lookup fails, `walk.ts` falls back to its existing grid A* implementation. Preserve that fallback until generated navmeshes have been tested against every ship layout and station layout.

For authored multi-level environments, replace generated rectangle geometry with a dedicated Blender/glTF navmesh rather than forcing stairs, ramps, and multiple decks into the current flat conversion.

## Yuka

The current `steerAgent()` adapter creates a Yuka `Vehicle` and `ArriveBehavior` for one update, then returns a new 2D position. Ship crew use this while walking between posts and break areas.

This proves the dependency and behavior mapping but is not the efficient final design. When NPC counts or behavior complexity grow:

- retain one Yuka vehicle per active NPC instead of constructing it every frame;
- update vehicles through a shared `EntityManager`;
- combine navigation paths with steering for corridor-aware movement;
- add separation/avoidance so crew do not overlap;
- keep story decisions and combat rules outside Yuka—Yuka should execute movement and behavior goals, not own narrative state.

## Three Quarks

Three Quarks is installed but currently unused. The existing sparks and action effects in `walk3d.ts` are still ordinary Three.js meshes recreated by the renderer.

Use Quarks when implementing persistent or high-volume effects such as:

- muzzle flashes and projectile trails;
- impact sparks and shield hits;
- engine exhaust;
- smoke, fire, electrical faults, and module damage;
- environmental dust, steam, rain, or embers.

Create one shared batched particle renderer per mounted 3D scene. Do not create a renderer or particle system per frame. Dispose systems during `walk3d.teardown()` and pool frequently repeated effects.

## Action prototype

The first action slice is deliberately data-like and temporary. `ACTION` in `walk.ts` currently contains movement speed, roll speed/duration/cooldown, firing cooldown, and projectile speed. Projectiles and the five-hit target dummy exist only in the active walk session and are not saved.

Before expanding combat, extract these concepts into definitions and runtime instances:

```text
MoveDef / MoveState
WeaponDef / WeaponInstance
ProjectileDef / ProjectileState
DamageEvent
HealthState
CollisionLayers
```

Weapons, clothing, inventory, and equipment should remain game-domain data. Three.js renders them, Rapier collides them, and Quarks decorates their effects; none of those libraries should own inventory or combat balance.

## Known caveats

- Rapier's generated chunk is large. Keep the dynamic import and load it only for 3D gameplay.
- `three-pathfinding` is useful and stable but not frequently released. Keep its use behind `walkRuntime.ts` so it can be replaced.
- The generated navmesh is flat and based on overlapping rectangles.
- Action-effect meshes are cleared and recreated each frame; migrate repeated effects to pooling/Quarks.
- Pointer listeners added anonymously in `walk3d.mount()` should eventually be retained and removed explicitly during teardown.
- The target dummy currently appears automatically in every mounted walk scene. It should become a debug/training-room feature once combat is established.
- The production build may warn about large chunks. That is expected for Three.js plus the Rapier WASM chunk, but bundle size should be monitored.

## Adding another library

Before adding an overlapping package, document:

1. Which missing capability it supplies.
2. Why the existing packages cannot supply it.
3. Whether it owns domain state or only runtime/presentation behavior.
4. Its license, maintenance status, bundle cost, and browser support.
5. The adapter boundary that lets the project replace it later.

Prefer small adapters over importing library types throughout `GameState` and content definitions.

