# Unity Visual Upgrade

This backlog comes from a reference playthrough through Port Solace, Dustwell,
and a pirate combat encounter, followed by WebGL inspection of the Unity ship.

## Priority Order

1. **Ship-interior rendering foundation** — layered materials, emissive practical
   lighting, floor/wall/ceiling panel detail, structural depth, atmosphere, and
   visible exterior context.
2. **Module silhouettes and set dressing** — initial six-bay pass complete;
   continue replacing primitive forms as production meshes become available.
3. **Captain presentation** — replace the blockout marker with a readable
   animated character, grounded feet, and a contact shadow.
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

## Verification

- Unity EditMode and PlayMode test command passes.
- Unity WebGL development build completes.
- Live WebGL acceptance passes all 7 checks: fresh scenario, authored module
  state, module swap, save/load, contract travel loop, day upkeep, and nonblank
  capture.
