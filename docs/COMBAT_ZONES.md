# COMBAT ZONES — Hades-style battle chambers for on-foot play

Written 2026-07-14. A plan for turning ship corridors (boarding actions) and
planet exploration sites into **smallish, self-contained on-foot battle zones**
— enter a room, clear the enemies, pick a door, repeat, cash out. This is the
run-structured version of the `docs/BETA_PLAN.md` Phase C line item *"foot combat
earns its keep"*, and the playable form of `docs/CORE_LOOP.md` pillar 4
(ranging: derelicts and sites as *scenes with choices*, not menus).

## 0. The one thing that makes this cheap

The hard part — a top-down action-combat feel — **already exists** in the walk
engine. `src/ui/walk.ts` has an `action` mode (`WalkScene.action`) with the full
Hades verb kit already wired:

- WASD/stick move at a faster `ACTION.moveSpeed` (walk.ts:97)
- mouse/right-stick **aim** (`setAim`, walk.ts:238)
- **fire** projectiles (`fire`, walk.ts:247) that already travel and collide
- **dodge-roll** with i-frame-style timing + cooldown (`startRoll`, walk.ts:239)
- a lone damageable **practice dummy** (5 HP) that projectiles already hurt
  (walk.ts:102, 470) and that `walk3d.ts` already renders (walk3d.ts:607)
- a fixed semi-top-down camera (screen axes = world axes — no camera work)
- deterministic sim decoupled from the DOM render, its own rAF loop
- `walk3d.ts` even ships a `"combat"` wall texture already

**What's missing is only:** enemies that fight back, an on-foot health pool,
room-gating, run structure, and rewards. This is an *extension of working code*,
not a greenfield build.

## 1. The design (Hades → Kestrel)

An **Incursion** = a short, self-contained on-foot expedition: a chain of 3–6
**chambers**.

- **Chamber loop.** On entry, the exits **seal** (`WalkDoor.locked = true`, which
  already exists). One or two **waves** of enemies spawn from an encounter table.
  Killing the last enemy **unlocks** the exits.
- **Door choice = reward preview** (the Hades boon door). Each unlocked exit shows
  an icon for what's beyond — 💰 credits, ◆ salvage/part, ✚ patch-up, ▲ field
  boon. You pick one path; you don't get everything. Cheap to build: it's just a
  `WalkDoor.label`/icon + the reward rolled behind it.
- **Field boons** — the *run-only* upgrade layer. Temporary buffs that last the
  current incursion only: faster fire, a shield charge, ricochet rounds, a
  healing pulse. Escalation without permanent power creep.
- **Objective + payout.** The final chamber holds a mini-boss or a payload (a data
  core, a rescue, a derelict's black box). Clearing it pays credits + real
  cargo/parts and writes to the ledger (`S.ledger`).
- **Tone.** Analog sci-fi, not neon arcade. Foes are salvage drones, boarding
  crews, silenced-station *things* — reuse the difficulty-curve philosophy from
  CORE_LOOP's combat direction (drones → guards → elites; the roster IS the
  difficulty). Amber CRT HUD, radio barks on chamber-enter and chamber-clear.

## 2. Key design decisions (defaults chosen; revisitable)

1. **On-foot health = a separate `vitality` pool, NOT `S.hull`.**
   Ship hull is the *ship*; getting shot in a corridor shouldn't damage the drive.
   `vitality` refills between incursions. Being **downed** *fails the incursion*
   (lose the objective; optionally take an injury/scar per CORE_LOOP pillar 2) but
   is **not** game-over — game-over stays reserved for losing the ship. This keeps
   the two combat layers cleanly separate and avoids a corridor fight triggering a
   ship-destruction ending.
   *Alternative considered: reuse `S.hull` (no new state, higher stakes) — rejected
   for conflating "my ship" with "my body".*

2. **Crew participate as passive perks + one gambit (v1).**
   Crew aboard grant buffs (a gunner → +fire-rate; a mechanic → one revive; Rook →
   skip a boarding fight by parley) plus a single on-foot **gambit**, reusing the
   proven ship-combat `gambitInfo()` pattern (combat.ts:190). This honors the
   standing rule that *frictionless-when-solo is a design bug* (harder alone), at a
   fraction of the AI cost.
   *Alternative considered: a fully controllable ally NPC — richer, but ~doubles
   the enemy-AI work (pathing/targeting/downed logic). Better as a v2.*

3. **Zones are data.** A `content/zones` schema + a seeded assembler, per PLAN.md's
   "data not code." Hand-author a few set-pieces; generate the rest from chamber
   templates + per-biome enemy/reward tables so incursions are endlessly
   replayable. (This also nudges toward moving the code-only station `LAYOUTS` in
   `stationwalk.ts` into the same JSON shape over time.)

4. **Camera/scope unchanged.** Keep the existing fixed semi-top-down. No new camera.

5. **"Ship corridors" means BOARDING, not roaming.** BETA_PLAN is deliberate that
   *your own deck is calm navigation space* — action mode fires only where the
   fiction says danger. So ship-corridor combat = **boarding scenarios** (you're
   boarded, or you board an enemy/derelict), reusing `buildShipScene()` geometry
   flipped hostile. This is also what finally makes the armory matter. Routine
   strolls around your own ship stay peaceful.

## 3. The data hook — launching a zone is nearly free

The effects DSL (`systems/scheduler.ts` `applyEffects`) already has a
`combat: {name, hull, dmg, loot}` verb that JSON (`content/riders.json`) uses to
trigger the *ship* duel. Add a parallel **`zone` verb**:

```jsonc
{ "zone": { "template": "derelict_dive", "biome": "silence",
            "depth": 3, "objective": "black_box", "loot": {...} } }
```

Then **any** event, rider, arc stage, or NPC scene can launch an incursion from a
data file with zero change at the call site — the same way ship combats are
already data-launched. `S.flags` + the scheduler carry zone state (available /
cleared / hostile) with no new persistence work.

## 4. Implementation phases

Each phase ends playtestable and committed, per `docs/ITERATION_PLAN.md` (tsc
clean, headless playtest gate, one commit, pushed). Foot combat is explicitly
required to be *headlessly simulatable* (BETA_PLAN Phase C exit gate) — the
`playtest-kestrel` skill + `walk.ts` debug hooks (`debugStep`, `debugGoto`,
`debugWalkTo`, `debugActors`) already support this.

### Phase A — Combat core in the sim ✅ SHIPPED
Extend `walk.ts` action mode from one dummy to real combat:
- an `Enemy` runtime list (pos, hp, state, cooldowns) mirroring the lightweight
  `types.ts:193` `Enemy` shape;
- simple state-machine AI (approach → strafe → fire) built on the existing
  `insideFloors()` collision + `steerAgent()` (walkRuntime.ts) — **no** new
  physics/navmesh lib (Rapier/yuka were deliberately removed);
- enemy projectiles + contact damage; player `vitality` + i-frames during roll;
- hit/death reactions; render enemies + enemy shots in `walk3d.ts` (extend the
  dummy/projectile draw at walk3d.ts:606-607).
- **Deliverable:** one room, fight 3 drones, and you can die.

### Phase B — Chamber runtime & gating ✅ SHIPPED
Landed as `ui/zonewalk.ts` (a scene builder, so it lives with the other walk
builders): the run singleton `Z`, a per-chamber scene builder, exits sealed
while a chamber is hot, reward-preview boon doors on clear, vitality carried
across chambers (scene-`id` swap remounts each chamber), a final warden +
extract door, and win/downed payout. New screen `S.screen === "zone"` routed in
`render.ts`; `__zoneTest()` starts a run; verified end to end in
`test/combatzone.test.ts`. Original sketch below:

New `systems/combatZone.ts`: seal/unlock doors, wave spawner, clear-detection,
chamber→chamber transitions (persist `vitality`/boons across chambers via either
scene-`id` swaps or in-place `ensureRunning` mutation), and the between-chamber
reward step.
- **Deliverable:** a 3-chamber chain cleared end to end.

### Phase C — Zone schema + generator ✅ SHIPPED
`content/zones.json` defines biomes as data: an enemy-archetype table (hp, speed,
fire-rate, damage, range, size, colour — the walk sim now reads these per
hostile), weighted chamber templates, a boss template, and reward ranges.
`systems/zonegen.ts` assembles a **seeded** run (reproducible from `rngState`);
`ui/zonewalk.ts` stages each chamber into the arena. Three biomes shipped
(derelict, silence, raid), each with a distinct roster. `check-content.mjs`
validates every spawn/pool/boss reference. No save-version bump needed — a run
is transient module state, not persisted. `__zoneTest(biome, chambers)` starts
any biome; verified in `test/combatzone.test.ts` (determinism, per-biome rosters,
boss-last, unknown-biome fallback).

### Phase D — Rewards, boons, meta
Door-reward previews, the field-boon pool, end-of-zone payout to credits/cargo/
parts + ledger, downed/injury handling, crew perks + one gambit.
- **Deliverable:** runs that escalate and pay out.

### Phase E — World integration 🚧 IN PROGRESS
Launch zones from real play, not a debug command. Landed so far:
- **✅ Derelict boarding** — a travel event (`evDerelict`, in the daily roll from
  day 6) offers a boardable wreck: suit up for an on-foot incursion, strip the
  outer hull for a small safe take, or leave it. Boarding launches a 2–3 chamber
  run (`raid` biome, or `silence` once the Broadcast has happened) and drops you
  back into transit with the salvage + a prestige bump. `__event('derelict')`
  fires it on demand; verified in `test/combatzone.test.ts`.

Still to wire (the other two entrances):
- **ranging / survey contracts** — POIs on the star map (CORE_LOOP pillar 4).
- **enemy boarding actions** — a lost ship-combat round or a scripted board →
  fight through your own corridors (`buildShipScene()` flipped hostile).
- **Deliverable:** zones are part of the core loop, not a menu.

### Phase F — Content & polish
Enemy silhouette art (walk3d), biome set-dressing (props3d), audio, 2–3
hand-authored set-piece incursions, balance pass via the headless playtest skill.

## 5. Where zones plug into the game

| Entry point | Reuses | Becomes |
|---|---|---|
| Planet exploration site | `planetwalk.ts` open-ground builder | a generated raid site |
| Ship corridor (boarding) | `shipwalk.ts` interior geometry, flipped hostile | repel-boarders / board-them |
| Derelict / wreck | new zone template | salvage dive with a payload |
| Silenced station | `stationwalk.ts` dark+action scenes | the Silence dark-deck sequence |

## 6. Risks / open questions

- **Enemy AI scope** — keep it a dumb, readable state machine. A* pathing already
  exists (`findPath`, walk.ts:342) for the rare cross-room case; most fights are
  line-of-sight strafing.
- **Difficulty tuning** — done headlessly via `playtest-kestrel` +
  `debugStep`/`debugGoto`.
- **Determinism / save size** — mid-incursion state is transient (or
  seed-restorable), not persisted.
- **Layouts in code** — station `LAYOUTS` live in `stationwalk.ts`, not JSON;
  moving zone geometry into `content/zones` is the authorability payoff and worth
  doing as zones grow.

## 7. Suggested first slice (one cycle)

Phase A, minimal, on the ground that's *already* `action:true`: take the Dustwell
landing (`planetwalk.ts`) and replace the single practice dummy with **three
drones that chase and shoot, a player vitality bar, and a "clear the pad" win**.
That proves the whole feel in one committed, playtested cycle before any run
structure is built on top.

---

### Most relevant files
- `src/ui/walk.ts` — the engine + the existing action kit (aim/fire/roll/dummy).
- `src/ui/walk3d.ts` — where enemy meshes + FX get added (render at :584, draw at :606).
- `src/ui/planetwalk.ts` / `shipwalk.ts` / `stationwalk.ts` — scene builders = zone templates.
- `src/systems/walkEncounters.ts` — the per-tick trigger hooks.
- `src/systems/combat.ts` + `types.ts:193` — the enemy/resolution + gambit patterns to mirror.
- `src/systems/scheduler.ts` — the effects DSL to extend with a `zone` verb.
- `src/ui/render.ts` — screen routing (`renderMain`).
