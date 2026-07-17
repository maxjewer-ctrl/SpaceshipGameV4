# PLAY → ITERATE → PLAY — the loop

The game is now fully playable headlessly (`.claude/skills/playtest-kestrel`),
save states are simulatable (`__scenario(name)`), and every cycle below ends
with a playtest that must pass before the next begins. Gameplay and graphics
cycles alternate so neither starves.

## The loop, mechanically

1. **Load** a scenario (`__scenario('fighter')` etc.) or run the prologue fresh.
2. **Play** a focused session against the cycle's question (below), capturing
   state deltas, log lines, and screenshots.
3. **Findings** → one short list: what felt wrong, what broke, what sang.
4. **Patch** — smallest change that answers the finding. Commit per cycle.
5. **Re-play** the same scenario to confirm the feel changed. Then next cycle.

Scenario coverage: `fresh · trader · fighter · silence · arc · run · reckoning`
— between them they touch every system without grinding.

## Unity Migration Track (started 2026-07-15)

The browser game remains the reference implementation and playtest oracle.
Unity now exists as a parallel port under `unity/`, with a local WebGL build
for browser play and agent-driven iteration.

Current shipped Unity foundation:

- Nested Unity project using installed editor `6000.4.2f1`.
- Pure C# `Kestrel.Sim` with deterministic scenario generation, v16 save JSON,
  canonical hashes, and `dotnet test` coverage.
- Runtime ship-deck slice with 6-bay and 8-bay layouts, over-the-shoulder
  player movement, module sockets, captain console swapping, save/load, and
  browser bridge commands.
- Unity content sync copies `src/content/modules.json` into Unity Resources so
  Unity module labels use the same content names as the browser game.
- Local scripts: `scripts/unity.ps1 doctor|setup|sim-test|unity-test|test|build-web-dev|serve-web|verify`.
- Local Codex skills: `develop-kestrel-unity`, `playtest-kestrel-unity`,
  `see-kestrel-unity`.

Fresh-session pickup order:

1. Run `git status --short` and keep existing portrait/station changes separate
   from Unity migration work.
2. Run `scripts/unity.ps1 doctor`, then `scripts/unity.ps1 setup`.
3. Run `scripts/unity.ps1 unity-test` and `scripts/unity.ps1 build-web-dev`.
4. Serve with `scripts/unity.ps1 serve-web` and use
   `window.kestrel.command(...)` for repeatable browser playtests.
5. Next implementation target: hand-authored ship level prefabs that preserve
   module socket IDs, replacing generated prototype geometry one room class at
   a time.

## Structural Recovery Direction (2026-07-15)

The next phase is not another content pass. It is a boundary-setting pass so
new stations, combat encounters, and story systems stop creating one-off UI
and state exceptions.

### 1. Compact game shell

- Keep the captain panel as persistent instrumentation: resources, current
  objective, immediate alert, and one contextual action.
- Let the third-person view own place, people, traversal, and immediate
  tension. Expand the panel only for consequential navigation, transactions,
  diagnostics, or emergencies.
- Move secondary management into authored physical surfaces rather than
  repeating generic amber card stacks on every screen.

### 2. Station scene contract

Every station should compose a small, data-driven set of roles: arrival bay,
public concourse, service rooms, social room, restricted/back-room space, and
exits. Scene data must own room placement, signage, service discovery, NPC
anchors, ambient population, local events, and the ship berth. A station can
then have a distinct identity without its own UI implementation.

### 3. Shared interaction contract

Doors, consoles, crew, merchants, salvage, combat targets, and objectives need
one descriptor for range, priority, prompt, availability, cost, and result.
This is the dependency for reliable overlapping prompts and for controller,
keyboard, mouse, and touch parity.

**Initial foundation shipped:** `systems/interactions.ts` now owns the shared
target shape and deterministic resolver. Walk doors and actors both expose
`onInteract`; objective priority is explicit rather than a walk-loop special
case; equal-priority targets resolve by distance then declaration order. Add
availability/cost/result payloads here before the next interaction type lands,
not in a new screen-specific handler.

### 4. Explicit mode boundaries

Traversal, on-foot combat, and ship combat may share input, encounter,
telemetry, reward, and consequence infrastructure, but they must not share a
single growing simulation authority. Each mode owns its movement and pacing;
the run state owns outcomes and transitions.

### 5. Progression and persistence infrastructure

Model the first-hour flow, contract lifecycle, station discovery, repair
states, and campaign beats as explicit transitions rather than scattered
flags. Add schema validation, save migrations, and deterministic visual/state
regression coverage before expanding the system count.

### Structural acceptance gate

A new station, interaction, or encounter can be added by data plus a bounded
mode handler, without adding a screen-specific state path or duplicating input
and save logic. Desktop and mobile screenshots retain a clear hierarchy with
the captain panel reduced to its operating instruments.

## Repository Tracking Rules

`main` is mirrored to GitHub through `origin`; every change is expected to be
committed, pushed, and checked by GitHub Actions. Project-local `.agents/`
skills are tracked source tooling, while generated output, dependencies, raw
asset dumps, secrets, and scratch data remain ignored. See `CONTRIBUTING.md`
for the required local gate and upload workflow.

## Cycle plan

### Cycle 1 — GAMEPLAY: the first hour (scenario: fresh + prologue)
Question: does a new player see the mountain?
- Grey-coat watcher visible at Solace cantina from day 1; campaign-hook rumors
  (Meridian anniversary, Verge radio, Elysium myth) in the rumor pool.
- Skip-path intro rewrite: one image, not four paragraphs.
- First-dock: Vance summons on skip-path; cantina breadcrumb to the undercity.
- Playtest gate: fresh start → within 15 in-game days the player has been
  *shown* (not told) all three campaign hooks.

### Cycle 2 — GRAPHICS: the walk screens (scenario: trader)
Question: do the decks feel inhabited?
- Concourse ambient walkers (non-interactive sprites on wander paths).
- Room prop density pass (drawProps has 6 kinds; stations have ~0).
- Named-twelve cantina presence: named recruits get a distinct actor color and
  their hook line as the room description when present.
- Playtest gate: screenshot review of all 7 station rooms + ship interior.

### Cycle 3 — GAMEPLAY: crew agendas (scenario: trader with named hires)
Question: do the dishonest hires actually bill you?
- Agenda beats: every ~12-15 days aboard, a named character's agenda fires —
  Vex's collectors hail you, Miri's manifest leak surfaces as a Syndicate
  "courtesy", Corbin's gossip comes home, Dez's mail net warns of a sweep,
  Ada asks for one quiet detour to a grave on Meridian.
- Confront/ignore choices write to ledger + disposition.
- Playtest gate: hire Miri + Vex, fly 30 days, verify both agendas fired and
  felt like *theirs*.

### Cycle 4 — GRAPHICS: combat presentation (scenario: fighter)
Question: does the duel look like the fiction reads?
- Weapon-distinct fire visuals (pulse/lance/ion) in the battle window.
- Hit/kill feedback: flash, debris, hull-bar shake on damage taken.
- Scenario backdrops (debris moon, blue giant, graveyard) as distinct skies.
- Playtest gate: one full Corsair fight, screenshot per phase.

### Cycle 5 — GAMEPLAY: the campaign spine (scenarios: silence, arc, run)
Question: do the three threads interleave without stepping on each other?
- Play Broadcast → 3 fragments → Dimming with the arc active simultaneously.
- Verify pacing collisions (modal pileups on arrival days) and fix scheduling.
- Playtest gate: silence scenario through stage 2 + arc scenario through the
  ambush, no dead-locks, no tonal whiplash flagged.

### Cycle 6 — GRAPHICS: cockpit polish (any scenario)
Question: does the frame sell the fantasy yet?
- Viewport weather: nebulae/traffic per system; station approach visuals.
- Instrument needle-sweep animations on day-advance.
- Dark-station walk lighting (flashlight cone?) for silenced worlds.
- Playtest gate: side-by-side screenshots, before/after.

### Backlog (post-cycle-6 candidates)
- Agenda beat consequences maturing into mini-arcs (Vex's debt called in as a
  boarding; Ada's testimony as a Reckoning witness option).
- Bounty-hunter pressure keyed to disposition notoriety.
- Sound design pass (Web Audio: engine hum, radio static, the four seconds).
- Save slots / run history.

## NEXT MAJOR PRIORITY (after the loop is locked) — THE LONG BURN

The top post-loop priority, gated on the CORE_LOOP build order (items
1–6) shipping first. A fourth campaign — the *Stars My Destination* /
*Monte Cristo* revenge arc — built to ride the locked loop, not prop it
up. It is deliberately sequenced AFTER loop lockdown because each of its
revenge tracks depends on a loop system (provenance economy, station
moods, ranging terrain, crew loyalty); see the dependency map in
`CORE_LOOP.md` → "After the loop is locked."

Spec: `CAMPAIGN_LONG_BURN.md` (design) · `CAMPAIGN_LONG_BURN_MANIFEST.md`
(build sheet) · `CAMPAIGN_LONG_BURN_IMPLEMENTATION.md` (7 milestones +
first commit). Each milestone lands as a playtested, committed cycle
under the standing rules below — the campaign obeys the same PLAY →
ITERATE → PLAY loop as everything else. Act I (the prologue) has no loop
dependency and may be prototyped as a vertical slice at any time to
feel-test the opening before the rest of the loop finishes.

## Standing rules

- Every cycle: `tsc --noEmit` clean, `read_console_messages` clean, playtest
  gate met, one commit, pushed.
- Balance findings recorded in memory (see combat-balance-corsair.md pattern).
- New mechanics must state their crew-gap behavior (what happens WITHOUT the
  specialist) — frictionless-when-alone is a design bug now.
