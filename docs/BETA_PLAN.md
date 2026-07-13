# ALPHA → BETA — the plan

Written 2026-07-13, after reading every playtest report in `docs/`, the vision
docs (`PLAN.md`, `BRAINSTORM.md`), the commit-log playtest notes, and the
source. This is the plan to take The Kestrel Run from "super alpha" to a beta
you would put in front of a hundred strangers. It is deliberately opinionated:
it names what gets **trashed**, not just what gets added.

---

## 1. Where the game actually is

**What's genuinely good — protect it:**

- The engine primitives are *right*: Consequence Scheduler, Memory Ledger,
  disposition, port standing, the Tapestry. Most games never get these. The
  riders DSL (`scheduler.ts applyEffects`) is the seed of the whole content
  pipeline.
- The writing and tone are the moat. The prologue, the dossiers, the station
  identity sheets — this is the part money can't buy.
- The game is fully drivable headlessly (window handlers + `__scenario`).
  That's an accidental superpower nobody has cashed in yet (see §4.1).
- Save versioning with a migration chain already exists (v10) and works.

**Where alpha shows — the honest list:**

1. **Two games are fighting for the same body.** A narrative freight sim
   (the actual game) and a Hades-style twin-stick action layer (projectiles,
   rolls, a target dummy on every deck) that serves none of the four pillars.
   The walk layer alone carries **five overlapping movement systems**: 2D
   `insideFloors` sim, canvas fallback renderer, Three.js presenter,
   non-authoritative Rapier, grid A* *plus* three-pathfinding, Yuka vehicles
   rebuilt every frame. That's a prototype graveyard, not an engine.
2. **The UI layer taxes every feature.** 193 inline `onclick` strings, ~150
   window globals (`main.ts` is a registry), full re-render, and a modal
   system so leaky that the playtest skill documents its stale-HTML footgun
   as a CRITICAL section. The travel-stall bug (094fc96) was a direct
   casualty: **modals are load-bearing game logic** and nothing owns them.
3. **Content is code.** The DSL exists, but pirates, patrols, arc stages,
   agenda beats, silence stages are all bespoke handler functions. Every
   event costs an engineer; PLAN.md's "write a row at breakfast, every player
   has it by lunch" is impossible today.
4. **Zero automated tests.** The only gates are `tsc` and an LLM playing the
   game. Seventeen raw `Math.random` calls sit next to the seeded RNG, so
   even reproducing a bug is luck.
5. **The loop tops out around day 50–70** (CORE_LOOP.md's audit stands:
   wear/refit shipped, but tiers, used modules, ranging, veterancy are not).
6. **Combat's aim minigame is hostile to everyone.** A realtime
   Lissajous-timing test inside a turn-based game: untestable headlessly
   (the skill busy-waits the CPU to fire well), unplayable on gamepad,
   inaccessible by design, and shallow underneath.
7. **Beta hygiene doesn't exist.** One save slot, no export, no settings, no
   error telemetry, no deploy pipeline, no feedback channel, dead surfaces
   shipping in the repo (`_v2design.html`, `legacy/game-v1.html`,
   `spaceport.html` demo).

---

## 2. What "solid beta" means — exit criteria

Beta is not a feature list; it's a bar. We ship beta when:

- **First hour:** a new player, unprompted, reaches day 15 having been
  *shown* all three campaign hooks (ITERATION_PLAN cycle-1 gate) and can say
  what the game is about.
- **Depth:** 10+ hours with the campaigns ignored and no ceiling — wear,
  tiers, ranging, and veterancy keep generating wants (CORE_LOOP pillars).
- **Stability:** the 7 scenarios × 100 seeded random 40-day runs complete in
  CI with zero errors, zero NaN/negative resources, zero soft-locks. Every
  save version from v2 up migrates and loads.
- **Performance:** cold load < 3s on a mid laptop (lazy chunks excluded),
  walk scenes hold 60fps, total JS < 1.5MB gzipped.
- **Content:** 100+ travel events (from ~30), 12/12 agenda beats, 6 loyalty
  missions, every port with its face, signature room *mechanic*, and local
  job flavor.
- **Operations:** deployed at a URL, version-stamped builds, crash telemetry
  flowing, an in-game feedback key, save export/import.

Explicitly **out of scope for beta:** realtime anything, mobile layout, the
endless procedural map (Phase 2 of PLAN.md), full faction sim, seasons.
Post-beta, all of it.

---

## 3. The knife — what gets trashed

Courage first. Each of these is a deletion, and each pays for itself.

### 3.1 The twin-stick action layer — SCOPED, and the orbit camera dies
(Revised 2026-07-13 after review.) The action kit — move/aim/fire/roll —
survives, but it stops being ambient. Two walk modes, one authoritative 2D
sim under both:

- **Deck mode** (your ship, friendly stations): navigation, interaction,
  dialogue. No combat verbs, no target dummy, calm movement speed. The walk
  layer's job here is embodiment: navigate beautiful decks, talk to people,
  feel the ship.
- **Action mode** (planet surfaces, hostile stations, and later boardings):
  the Hades-style kit, with a quicker movement speed. Foot combat fires
  where the fiction says danger — Dustwell's outskirts, undercity trouble,
  walk encounters (`wkFight`), silenced worlds — never on your own deck.

**The orbitable camera is cut everywhere.** Both modes use a fixed
semi-top-down follow camera (one authored angle, tracks the player). This
deletes the whole camera-relative-movement bug class (see a56feda), the
shoulder-button orbit bindings, and the "orbit must never mislead movement"
constraint — screen-up is world-forward, always. Fixed camera + one sim
also means action combat is headlessly testable like everything else.

### 3.2 Four dependencies — CUT (unchanged by 3.1's reprieve)
Scoping the action layer doesn't save the physics/AI stack, because the
deterministic 2D sim (`insideFloors` + projectile checks) is authoritative
for *both* modes — that's what keeps combat testable:

- **Rapier** (never authoritative, 2MB WASM): delete. The 2D sim owns
  movement and hit detection, deck and action alike.
- **three-pathfinding** (flat rectangles pretending to be a navmesh): the
  grid A* fallback it "falls back" to is the one that always works. Keep A*.
- **yuka** (a Vehicle constructed per frame for an arrive behavior): replace
  with 20 lines of arrive-steering.
- **three.quarks** (installed, never integrated): delete until a real FX
  budget exists.

One renderer remains: Three.js, with the 2D canvas **walk fallback deleted**
(WebGL is table stakes in 2026; `avatarDraw` stays for the creator preview).
Result: one movement system, one pathfinder, one renderer, ~2.5MB off the
bundle, and every walk bug has exactly one suspect.

### 3.3 The realtime aim minigame — CUT
Replace with deterministic turn resolution (see §5, Phase C). A timing
skill-test belongs to a genre this game refuses to be. Everything about
combat gets *deeper* when resolution is a decision, not a reflex — and the
whole system becomes headlessly testable.

### 3.4 The global-onclick UI surface — REPLACE
One delegated listener + `data-action` attributes + a typed action table
(`dispatch("buyFuel", 5)`). `main.ts` stops being a 150-export registry;
handlers stop being globals; the playtest harness drives `dispatch` directly.
Alongside it, a real **ModalQueue in GameState**: pending story beats,
riders, and events become serialized queue entries — no more `hasModal()`
guards scattered through systems, no more stale `#modal` HTML, no more
travel-stall class of bug. This is the single highest-leverage engineering
change in the plan.

### 3.5 Dead surfaces — ARCHIVE
`_v2design.html`, `legacy/game-v1.html`, the `spaceport.html` demo and
`src/spaceport/` move to an `archive/` branch. The repo ships one game.

### 3.6 `Math.random` — EXTERMINATE
All 17 call sites move to the seeded RNG with named streams (`events`,
`market`, `walk`). A lint rule bans it forever. Reproducible runs are the
foundation of §4.1.

---

## 4. The build — five phases

Each phase ends with the standing rules intact: tsc clean, console clean,
playtest gate met, committed, pushed — plus the new rule: **CI green**.

### Phase A — FOUNDATIONS & THE KNIFE (~2–3 weeks)
Everything in §3, plus:

**Progress (2026-07-13):** the knife has landed — action layer scoped to
hostile ground + fixed follow camera (§3.1); Rapier/three-pathfinding/yuka/
quarks + the 2D walk fallback cut (§3.2); realtime aim minigame still pending
its Phase C replacement (§3.3); dead HTML surfaces archived (§3.5); `Math.random`
exterminated + lint-gated (§3.6). The **headless simulation harness and CI are
in** (this section, below). Still open in Phase A: the typed dispatcher +
ModalQueue (§3.4) and save-transient hardening + slots.

- **Headless simulation harness.** ✅ Shipped. `hasModal()` was always pure
  in-memory state and `requestRender()` a no-op until wired, so the systems
  layer runs in Node today — `drawModal()` now no-ops without a DOM skeleton
  (the seed of the §3.4 ModalQueue decoupling). vitest + jsdom: 7 scenarios ×
  40 seeds × 40 days asserting no NaN / negative / throw / soft-lock (a
  failure prints the exact `scenario/seed/day`), scenario-load soundness, and
  migration (a v1 fixture + every intermediate version → current, sound,
  idempotent). ~2s, no browser. `test/README.md` documents it and how it
  differs from the browser skills. The choice-branch coverage it can't reach
  yet unlocks once §3.4 makes a modal choice callable data.
- **CI** (GitHub Actions): ✅ `.github/workflows/ci.yml` runs rng-lint, tsc,
  the vitest harness, build, and a bundle-size budget (`check-bundle.mjs` —
  total gzipped JS under 1.5 MB; currently ~311 KB, three.js is the floor).
  Still to add: content validation (schema-check every JSON file; every
  `dest`, `flag`, `eventKey` reference resolves).
- **Save hardening:** UI transients (`screen`, `ptab`, `sel`, `selPlanet`)
  out of the save payload; save slots (3) + export/import as JSON file.
- Exit: game plays identically — action verbs now live only in action-mode
  scenes, camera is fixed follow everywhere; CI is the new gatekeeper.

### Phase B — THE LOOP THAT NEVER ENDS (~3 weeks)
CORE_LOOP.md's build order, finished — this is the beta's gameplay heart:

- **Mk-I/II/III quality tiers** per module; yard inventories always hold
  something worth wanting.
- **Used-module marketplace** with provenance lines — unblocks the Row
  Broker, realizes Debtor's Row, and makes the ship a biography. Needs the
  `grantModule` DSL verb (STATION_IDENTITY engine item #6).
- **Veterancy ranks + scars:** per-role ranks earned in-role; event-inflicted
  traits (`steady_under_fire`, `flinches_at_static`) that gate barks and
  mechanics.
- **Survey/charting contracts + POI map marks:** the map becomes a diary;
  the deep band past Verge becomes a place (fuel/hull-gated, portless).
- **Station moods** (boom/shortage/lockdown/festival) reading and writing
  port standing and prices.
- Exit gate: a tester who ignores every campaign reports wanting *something*
  at day 80.

### Phase C — TEETH: COMBAT 2.0 (~2 weeks)
Replace the duel core (the fiction and phase structure stay):

- **Deterministic resolution:** to-hit from gunner skill + range band +
  power allocation + enemy posture; the *decision* is where the tension
  lives. No reflex test.
- **Range bands** (flee = winning the range game) and **system targeting**
  (their engines/weapons/hull — mirroring your own module damage).
- **Crew gambits as the toolkit** (already prototyped: Rook parleys,
  Overcharge, Cold Restart) — one per fight, chosen by who's actually aboard.
- **Enemy intents, telegraphed** ("they want cargo, not kills") so surrender
  and decoys are real strategies; roster stays the difficulty curve.
- **Foot combat earns its keep:** action mode (§3.1) gets real hooks —
  hostile-station walk encounters upgraded from menu-fights to played
  fights, a Dustwell outskirts encounter, one Silence-stage dark-deck
  sequence. Small count, high polish; every one headlessly simulatable.
- Exit gate: the `fighter` scenario is winnable, losable, and *fleeable* by
  pure decision-making in headless CI — and feels better in hand than the
  reticle ever did.

### Phase D — PEOPLE & PORTS (~3 weeks, mostly content)
The content pipeline pays off. Prerequisite: **finish the DSL migration** —
pirates/patrol/distress/trader, arc stages, agenda beats, and silence stages
all become `content_*` rows interpreted by the engine (retro-fitting the
Voss arc is the proof test, exactly as PLAN.md prescribed). Then:

- 12/12 agenda beats (Ada, Brix, Elias, Tomas, Imogen, Bapu owed).
- **Six loyalty missions** — the rank-3 gates, the biggest content lift with
  the best payoff.
- Remaining port cast from STATION_IDENTITY (Customs Assessor, Lighthouse
  Keeper, Labor Steward, the Auctioneer + auction *loop*, Verge's
  Stationmaster/Array Operator, Dustwell's Water Baron…).
- **First-hour fixes** still open from OPENING_CRITIQUE: skip-path intro
  rewrite (one image, not four paragraphs), first-dock Vance summons +
  undercity breadcrumb, concourse ambient walkers.
- Travel events 30 → 100+, LLM-drafted in-schema against the tone bible,
  hand-edited, schema-validated in CI.
- Exit gate: ITERATION_PLAN cycle-1 and cycle-3 gates pass fresh.

### Phase E — SHIP IT (~2 weeks)
- **Perf pass:** pooled walk FX (no per-frame mesh churn), texture/`webp`
  dedupe in portraits, lazy-load the 3D layer, bundle budget enforced in CI.
- **Settings & access:** audio sliders, reduced-motion, text speed, key
  remap; the game is already keyboard/gamepad-complete — make it official.
- **Telemetry & feedback:** `window.onerror`/`unhandledrejection` → a
  Supabase `errors` table (version-stamped); an in-game feedback key that
  snapshots state + last 20 log lines with consent.
- **Cloud saves + the Shared Dead slice:** anon auth, `saves`, `captains` +
  `derelicts` write-on-death, wrecks as map POIs. Offline-first, enriches
  never gates. This is the one PLAN.md multiplayer feature in beta — it's
  small, and it's the hook.
- **Release loop:** deploy pipeline, semver builds, CHANGELOG, a closed-beta
  cohort (20–50 players), triage board. Content freeze one week before.

---

## 5. Process rules (carried forward, plus new)

- Every cycle still ends: tsc clean, console clean, playtest gate, commit,
  push. **New:** CI green, and any balance finding lands as a seeded
  regression test, not just a memory note.
- New mechanics still declare crew-gap behavior (frictionless-when-alone is
  a design bug).
- New systems speak the DSL or they don't merge. When torn between a system
  and 30 events: write the events.
- The four pillars stay the feature filter. The ambient shooter was scoped
  down by that filter (danger lives where the fiction puts it, not on your
  own deck); future ideas face the same judge.

## 6. Sequence & shape

A → B → C → D → E, ~12–14 weeks part-time. A is the un-fun prerequisite that
makes B–D cheap (exactly the lesson of the v1→Vite migration). B before C
because the economy ceiling bites every tester at day 50 while combat bites
only fighters. D is parallelizable with C once the DSL migration lands. E is
a hard gate, not a polish drawer.

The pitch stays PLAN.md's pitch. Beta is the version where the *loop* is
endless even though the *map* isn't yet — the ship is never finished, the
crew are never done becoming people, and the first stranger who dies at
day 122 leaves a wreck with their name on it for the next one to find.
