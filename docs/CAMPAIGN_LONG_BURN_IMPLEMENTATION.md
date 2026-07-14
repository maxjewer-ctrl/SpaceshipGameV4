# THE LONG BURN — implementation plan

Written 2026-07-13. Third of three docs:
- `CAMPAIGN_LONG_BURN.md` — the design (why/what).
- `CAMPAIGN_LONG_BURN_MANIFEST.md` — the build sheet (everything to make).
- **this** — the engineering plan (how, in what order, touching which files).

The plan is written against the real code as of this commit. The single
most important finding from reading it: **the game already has two
prologue paths**, both launched from the character creator —
`startGame()` in `ui/help.ts` (free-trader open) and `introStart()` in
`systems/intro.ts` (the scripted "Dead Reckoning" prologue). The Long
Burn is a **third path of the same kind**, not a new engine. `intro.ts`
is our reference implementation and our template — read it before
writing `systems/longburn.ts`.

Two more load-bearing patterns already exist and we copy them, not
reinvent:
- **Stage machines in `S.flags`.** `intro.ts` runs its whole prologue
  off `S.flags.intro` (1→5) plus `intro_beat`/`intro_done`. Our Act I
  runs the same way off `S.flags.lb_*`. No new runtime.
- **Stage-gated cards.** `arc.ts` `arcCantinaCard()` returns HTML for
  the current stage/location; `ui/planet.ts` line 43 renders it. Our
  four target tracks are the same shape — a `longBurnCards()` the
  planet screen calls right beside `arcCantinaCard()`.

So the "engine" work is small. The mass is content (manifest §3) and
one genuinely new UI (the List). This plan sequences the code so that
each milestone is playable end-to-end with placeholder prose, then
content backfills.

---

## 1. Architecture decisions

**D1 — One module, `systems/longburn.ts`, mirroring `arc.ts`.**
Exports: `longBurnActive()`, `longBurnStart()` (the Act I entry, like
`introStart()`), `longBurnCards(loc)` (like `arcCantinaCard()`),
`longBurnAct(step)` (the modal-choice dispatcher, like `introAct()`),
and the confrontation/ending resolvers. State lives on `S.longBurn`.
Keep Act I prologue helpers in a sibling `systems/derelict.ts` so the
one file doesn't balloon (intro.ts is already ~600 lines; learn from
it).

**D2 — Campaign is a save-versioned state slice, defaulted off.**
Add `longBurn?: LongBurnState` to `GameState`. A migration step
(v12) defaults it absent/inactive. Every read guards on
`S.longBurn?.active`. A free-trader save never allocates it — zero
cost to the existing game. This mirrors how `campaign.silence` was
added at v5.

**D3 — Content-as-data where the DSL already reaches; TypeScript
where it doesn't.** Target-track *cards and jobs* are content
(`npcs.json` nodes + `kind:"arc"` jobs + new DSL verbs). Act I's
scripted sequencing, the List UI, the Mark render, and the Act III
race are TypeScript — they're control flow and rendering, not
dialogue. Don't force the DSL to do sequencing it wasn't built for
(the design doc's `arc.ts` is itself still TS for this reason).

**D4 — The prologue reuses real systems in a locked mode, never
mock screens.** Like `intro.ts`, Act I writes to the ledger,
disposition, and riders so pre-transformation choices persist. The
"crew-deck framing" is a copy skin over the real cantina/market, not
a new screen — a `lb_prologue` flag changes labels and locks the map
route.

**D5 — The Mark is derived-ish but stored.** Store `mark: number`
(0–100) on `S.longBurn` because it's moved by discrete choices and
must persist. Render reads it; nothing else computes from it except
bark gates and ending eligibility. Keep it out of `disposition` —
disposition is a general playstyle read; the Mark is campaign-
specific and visible.

**D6 — Endings mutate the world through existing verbs only.** The
OPEN ending's "cheaper fuel forever" is a single global multiplier
read by `market.ts` price calc + `portMark` prose rewrites (the verb
already exists). No new economy system; just one number and some
strings. This keeps the biggest-sounding feature the smallest.

---

## 2. Data model (types.ts)

Add alongside `ArcState` / `CampaignState`:

```ts
export type LbTargetId = "kale" | "renn" | "ashe" | "cavanagh";
export type LbResolution = "killed" | "ruined" | "spared" | "turned";
export type LbEnding = "sell" | "burn" | "open" | "abandoned";

export interface LbTrack {
  stage: number;               // 0 = not started
  found: boolean;              // identity revealed → portrait shown on List
  resolved: LbResolution | null;
  evidence: string[];          // evidence ids attributed to this target
}

export interface LbEvidence {
  id: string; targetId: LbTargetId; label: string;
  source: string; day: number; weight: number;
}

export interface LongBurnState {
  active: boolean;
  act: 1 | 2 | 3 | 4;          // 4 = resolved/epilogue
  prologue: number;            // Act I step, 0..N (mirrors flags.intro)
  targets: Record<LbTargetId, LbTrack>;
  evidence: LbEvidence[];
  mark: number;                // 0..100, the tiger-tattoo meter
  emberKnowledge: 0 | 1 | 2 | 3; // turn fragments assembled
  ending: LbEnding | null;
  fuelPatch: number | null;    // OPEN ending: global fuel price multiplier
}
```

Add `longBurn?: LongBurnState` to `GameState`. `newState()` leaves it
`undefined` (free trader). `longBurnStart()` allocates it.

**Migration (state.ts, v12).** Bump `SAVE_VERSION` to 12; add:
```ts
if (s.version < 12) {
  // The Long Burn campaign is opt-in at new game; existing saves never
  // ran it. Absent slice = inactive, which every read already guards on.
  if (s.longBurn === undefined) s.longBurn = undefined;
  s.version = 12;
}
```
(The assignment is a no-op documenting intent — the real contract is
"every consumer null-checks `S.longBurn`.")

---

## 3. Integration points (by file)

| File | Change | Milestone |
|---|---|---|
| `types.ts` | the interfaces in §2 | M1 |
| `state.ts` | v12 migration; `SAVE_VERSION=12` | M1 |
| `ui/avatar.ts` (creator) | add third start button "The Long Burn" beside the existing two paths | M1 |
| `ui/help.ts` | `longBurnStart()` entry parallel to `startGame()`/`introStart()`; export + wire | M1 |
| `main.ts` | import & expose `longBurn*` handlers on the global (window) surface, like `introStart, introAct` (line 82) | M1 |
| `systems/longburn.ts` | **new** — the campaign runtime (D1) | M1→ |
| `systems/derelict.ts` | **new** — Act I derelict vignette | M2 |
| `ui/list.ts` | **new** — the List quest-log panel | M1 stub, M3 real |
| `ui/planet.ts` | call `longBurnCards(S.loc)` beside `arcCantinaCard()` (line 43) | M3 |
| `ui/render.ts` | render List tab/panel; Mark indicator near portrait | M1/M3 |
| `ui/portraits.ts`, `ui/avatarDraw.ts` | scar layer + 3 tint states in the composite | M3 |
| `systems/combat.ts` | scripted-scenario option (`surviveRounds`, `noFlee`, forced-cutscene end) | M2 |
| `systems/market.ts` | read `S.longBurn?.fuelPatch` in fuel price calc | M6 |
| `systems/ledger.ts` | evidence auto-annotation hook when a witnessed event names a target | M4 |
| content DSL host (wherever `standing`/`portMark` verbs live) | add `evidence`, `confront`, `marketRig` verbs | M3→M4 |
| `content/*.json` | all cast/jobs/barks/riders per manifest §5 | per track |
| `debug/scenarios.ts` | jump-to-step presets per manifest §1.8 | M1→ |

**Conductor rule.** Wherever `silence.ts` defers during the grey-coat
Run, add the symmetric Long Burn check: Act III's race and the Run's
`arcStartRun` each refuse to arm while the other is live (design doc
§"De-railroading"; manifest open-question 5). Card-level interleave is
fine; set-pieces are exclusive.

---

## 4. New DSL verbs (3)

Follow the existing `standing` / `portMark` verb pattern in the content
host:

- `evidence(target, id, label, weight)` — pushes an `LbEvidence`, links
  it to the track, refreshes the List. Idempotent on `id`.
- `confront(target)` — if the track's evidence weight ≥ threshold,
  opens that target's confrontation scene; else emits the "not enough
  yet" bark. Threshold per target in a small config table in
  `longburn.ts`.
- `marketRig(station, good, bias, days)` — Target 3's weapon. Interim
  implementation: a timed price bias entry the market calc reads.
  When station moods (CORE_LOOP pillar 3) land, re-point this at them.

Everything else target tracks need — jobs, flags, standing, port-marks,
dialogue — already has verbs.

---

## 5. Milestones (each an independently playtested commit)

Per `ITERATION_PLAN.md`: one committed, playtested cycle per milestone.
Acceptance = "a player (or the playtest-kestrel skill) can reach and
complete this slice end-to-end." Debug jumps (§1.8) land in M1 so every
later milestone is reachable without replaying the prologue.

**M1 — Skeleton & seam.** Types, v12 migration, campaign-select button,
`longBurnStart()` allocating state, `longBurn*` on the global surface,
List panel *stub* (renders four placeholder names), debug jumps.
Act I exists as click-through text placeholders start→transformation.
*Acceptance:* choose The Long Burn at new game, click through to the
"one year later" sandbox unlock, List panel visible. Proves sequencing
and the save round-trips.

**M2 — Act I for real.** `derelict.ts` vignette, scripted-losing combat
option in `combat.ts`, Solt's five scenes, the Foundry bond montage,
the claim scene, naming/hull purchase at the cut. The Solicitude-pass
art (manifest §4) lands here — it's the campaign's thesis image.
*Acceptance:* the full prologue plays with real prose and feel; this is
the make-or-break demo. **Playtest for feel before writing Act II.**

**M3 — Target 1 (Kale) + the detective loop + Mark v1.** `longBurnCards`
wired into planet screen, provenance-trail beats (Ferro/usedmarket/
Whitlow), `evidence`+`confront` verbs, the List becomes real (leads,
silhouettes, strike-through), the Mark render (scar + tint + barks),
the confrontation with kill/ruin/spare forks + turn fragment 1.
*Acceptance:* find Kale purely through gameplay from a cold Act II
start, resolve him three different ways, Mark visibly responds.

**M4 — Targets 2 & 3.** Renn (ledger/witness track, Datta handoff, the
Lighthouse grief beat) and Ashe (poisoned-manifest jobs, `marketRig`,
Sur persuasion, debt buyout). Evidence auto-annotation hook in
`ledger.ts`. Turn fragment 2.
*Acceptance:* both fall via their distinct systems; the anti-Vance
Assessor pays off; interim `marketRig` demonstrably bankrupts Ashe.

**M5 — Target 4 (House Cavanagh).** Salon-climb chain (liaison
gatekeeping, VIP charters), Ellis's four scenes, Cressida's two, the
drawing-room revelation → turn fragment 3 → `emberKnowledge = 3`. Prior
mercy choices feed the house's-fall staging.
*Acceptance:* reach the salon via prestige + charters, complete the
turn, Ember location unlocks Act III.

**M6 — Act III + endings + world-patch.** Deep-band race gauntlet,
three-ship convergence keyed to faction standing/disposition, climactic
combat, the choice scene, three endings + mercy inserts, epilogue
writer, and the OPEN world-patch (`fuelPatch` in `market.ts` + port-
mark rewrites). Post-campaign continuation for all endings.
*Acceptance:* all three endings reachable; OPEN visibly cheapens fuel
sector-wide and rewrites the marked ports; game continues after.

**M7 — Connective polish.** Rumor/whisper knock-cards, riders (spared
Kale returns, ruined Ashe's last tip, the flipped clerk's fate),
recognition hazards (Vance near-miss), audio, the optional Deneke
rescue thread + post-campaign hireable, abandon-the-List scene
(open-question 2). Balance pass on the convergence fight per the
combat-balance memory.
*Acceptance:* a full playthrough front-to-back with the
playtest-kestrel skill; no dead ends; conductor rule holds against the
grey-coat arc.

**Critical path:** M1→M2 gates everything (if the prologue doesn't feel
right, stop and fix before content spend). M3 proves the reusable
detective loop that M4/M5 clone. M4's ideal `marketRig` wants station
moods but ships on the interim. Nothing else blocks on the CORE_LOOP
backlog.

---

## 6. Risks & mitigations

- **R1 — Prologue is the long pole and the make-or-break.** ~9,500
  words + the campaign's only bespoke art, all before the sandbox opens.
  *Mitigate:* M1 makes it click-through-able immediately so the SHAPE is
  testable before the prose; gate Act II spend on the M2 feel-test.
- **R2 — Scope creep into a second game.** 33k words is the three
  existing campaigns combined. *Mitigate:* every target track is
  independently shippable and playtestable (M3/M4/M5 are separable);
  the campaign can ship "Act I + Kale" as a vertical slice and grow.
- **R3 — Save-migration regressions.** Adding state to a shipped save
  format. *Mitigate:* the slice is optional and null-guarded (D2), so
  free-trader saves are untouched; add a debug scenario that loads a
  v11 save and asserts it still runs.
- **R4 — Recognition/immersion break.** The mask fantasy dies if the
  player forgets they're disguised. *Mitigate:* the Mark + recognition
  hazards (Vance near-miss) keep the disguise *felt*; barks reference
  the old name "Jun."
- **R5 — Combat difficulty at Kale.** Players may reach him early with
  starter gear. *Mitigate:* tune his ship below Corsair per the
  combat-balance memory; the fight is narrative, not a wall.
- **R6 — Conductor collisions.** Long Burn Act III + the Run + the
  Silence set-pieces overlapping. *Mitigate:* the exclusivity check in
  §3; a debug scenario that arms two at once and asserts one defers.

---

## 7. First commit (concrete M1 starting point)

1. `types.ts`: paste the §2 interfaces; add `longBurn?` to `GameState`.
2. `state.ts`: `SAVE_VERSION=12`; add the v12 migration block.
3. `systems/longburn.ts`: `longBurnActive()`, `longBurnStart()` (clone
   `introStart()`'s open, allocate `S.longBurn`, set `act=1`,
   `prologue=0`, empty tracks), and a placeholder `longBurnStep()` that
   walks a text-only Act I to the "one year later" `startGame`-style
   handoff.
4. `ui/avatar.ts`: third button → `longBurnStart()`.
5. `main.ts`: expose `longBurnStart, longBurnStep` on the global (beside
   `introStart, introAct`, line 82).
6. `ui/list.ts` + `ui/render.ts`: stub List panel reading
   `S.longBurn?.targets`.
7. `debug/scenarios.ts`: `lb:prologue`, `lb:act2`, `lb:act3`, `lb:end-*`.
8. Playtest: new game → Long Burn → click to sandbox → List visible →
   reload save → still works.

That commit is the whole spine with no content on it. Everything after
is hanging prose, art, and the three verbs on a frame that already runs.
