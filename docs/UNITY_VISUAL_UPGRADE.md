# Unity Visual Upgrade

This backlog comes from a reference playthrough through Port Solace, Dustwell,
and a pirate combat encounter, followed by WebGL inspection of the Unity ship.

## Priority Order

1. **Ship-interior rendering foundation** — layered materials, emissive practical
   lighting, floor/wall/ceiling panel detail, structural depth, atmosphere, and
   visible exterior context.
2. **Module silhouettes and set dressing** — replace generic block forms with
   distinct fuel, cargo, berth, workshop, utility, and life-support prop kits.
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

## Verification

- Unity EditMode and PlayMode test command passes.
- Unity WebGL development build completes.
- Live WebGL acceptance passes all 7 checks: fresh scenario, authored module
  state, module swap, save/load, contract travel loop, day upkeep, and nonblank
  capture.

