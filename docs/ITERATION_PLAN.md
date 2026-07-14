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
