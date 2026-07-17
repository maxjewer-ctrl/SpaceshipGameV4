# Unity Visual Upgrade

This backlog comes from a reference playthrough through Port Solace, Dustwell,
and a pirate combat encounter, followed by WebGL inspection of the Unity ship.

## Priority Order

1. **Ship-interior rendering foundation** — layered materials, emissive practical
   lighting, floor/wall/ceiling panel detail, structural depth, atmosphere, and
   visible exterior context.
2. **Module silhouettes and set dressing** — initial six-bay pass complete;
   continue replacing primitive forms as production meshes become available.
3. **Captain presentation** — native character and persistent player-facing
   picker passes complete; continue with higher-fidelity animation blending and
   lighting polish as needed.
4. **Diegetic HUD** — consolidate status and interaction information into ship
   displays and reduce competition between overlays.
5. **Station and Dustwell kits** — establish location-specific architecture,
   palettes, signage, landmarks, NPC density, and environmental storytelling.
6. **Combat presentation** — stage recognizable ships with readable scale,
   weapon effects, impacts, damage response, and spatial motion.

## #1 Ship-Interior Foundation

Implemented in six-bay visual revision 6:

- WebGL-safe panel shader with procedural seams, restrained wear, emissive
  response, rim separation, and distance fog.
- Separate plated floor, bulkhead, ceiling, inset-metal, conduit, trim, screen,
  warning, exterior-space, star, planet, and light-pool materials.
- Recessed hull panels, ceiling service panels, hull ribs, long paired conduit
  runs, practical-light fixtures, and subtle floor light pools.
- Repeating corridor tread plates and navigation-light rhythm to make the ship's
  scale and direction legible.
- Layered room floors and bulkhead insets without adding collision obstacles.
- Framed cockpit observation windows with stars and a planet limb, so the scene
  reads as a spacecraft interior rather than a floating room.
- Engine-room service grate, coolant feeds, warning bands, and a focused reactor
  palette.
- Dark blue camera background and linear depth fog for atmospheric separation.

## #2 Module Silhouettes and Set Dressing

The initial six-bay pass is implemented in visual revision 7:

- Fuel bay with paired pressure vessels, collars, warning bands, feed pipes,
  valves, manifold, drip tray, and pressure display.
- Cargo hold with a pallet, individually braced freight, cargo markings, and an
  overhead hoist rail, carriage, and hook.
- Passenger cabin with a single framed bed, mattress, blanket, pillow, locker,
  shelf, and reading light.
- Crew quarters with stacked framed bunks, blankets, reading lights, ladder,
  shared lockers, and a footlocker.
- Workshop with a supported bench, tool wall, hanging tools, diagnostic screen,
  vice, parts bin, overhead rail, and drop cable.
- Empty/service bay with power cells, status faces, an emergency locker, and a
  foldout service cart.
- Direct Bay 0–5 WebGL inspection controls with side-facing camera framing.
- An editor-visible ship preview in `KestrelShipDeck.unity`; Play Mode hides the
  preview before the runtime deck initializes.

Cockpit readability iteration implemented in visual revision 9:

- Helm holo, forward glass glow, command arch, and side wing consoles so cockpit
  captures read as a bridge
  instead of only as the start of a corridor.
- The WebGL Cockpit inspection control now frames an over-shoulder bridge view for
  screenshot review; Midship and Engine return to the normal traversal camera.

## Verification

- Unity EditMode and PlayMode test command passes.
- Unity WebGL development build completes.
- Live WebGL acceptance passes all 13 checks: fresh scenario, authored module
  state, module swap, save/load, captain selection persistence, lane-event
  selection/choice/save-load, named checkpoint save/resume, contract travel
  loop, day upkeep, and nonblank capture.

## #3 Captain Presentation

The initial character pass is implemented:

- The original three animated Meshy GLBs remain retained in both the browser
  source tree and Unity's source-asset folder.
- Unity-native `.anim` assets, materials, Animator Controllers, and prefabs are
  generated repeatably for Explorer, Trailblazer, and Outrider.
- The runtime captain now uses the skinned character instead of the blockout
  marker, with consistent height, grounded feet, shadows, and idle/walk states.
- The three existing character-picker IDs map directly to Unity resources, and
  both the in-game picker and WebGL development controls exercise live switching
  between all options.
- Confirmed selection is part of the Unity-owned v16 state, survives scenario
  rebuilds and save/load, and reappears on the next run.
- EditMode tests verify 15/9/9 retained clip sets; PlayMode tests verify runtime
  switching, controllers for every option, and selection persistence.

See [`UNITY_CHARACTER_PIPELINE.md`](UNITY_CHARACTER_PIPELINE.md) for source
preservation, regeneration, and verification details.
