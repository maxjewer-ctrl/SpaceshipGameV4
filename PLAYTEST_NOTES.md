# The Kestrel Run — Playthrough Notes

Session: fresh browser profile, `localStorage` cleared, driven headlessly via
Playwright + `window.dispatch` (per the `playtest-kestrel` skill). Dev server:
`vite` on `127.0.0.1:5173`.

Legend: 🐛 bug · ✅ works · ⚠️ questionable/rough edge

## TL;DR

The writing, the world-state/consequence systems, and the base ship/station/
market loop are genuinely strong — but **as shipped, a real player cannot
progress past the first screen of a new game**, and even bypassing that,
**combat and almost every piece of narrative content (prologue, story arc,
crew dialogue, travel events, salvage, damage-control minigames) are
unreachable by mouse or keyboard.** Two structural regressions cause nearly
all of it:

1. **An incomplete refactor** (`src/dispatch.ts`) left ~16 files still using
   dead `onclick="fn(...)"` strings that throw `ReferenceError` on click —
   only ship/station/market/save/help/character-creator screens were
   migrated to the new `data-action` system (bug #2).
2. **A modal-queueing rule violated almost everywhere it matters**
   (`src/modal.ts`'s `modal()` vs `replaceModal()` contract): any screen that
   chains straight into its own next screen — the character creator into the
   prologue, prologue stage-to-stage, and *every single phase of combat* —
   silently queues the next screen behind the one still showing instead of
   replacing it, so nothing visibly advances (bugs #1, #3, #6).

On top of those: arriving anywhere leaves the screen frozen on the old
in-transit readout (bug #4), and a brand-new game already owns *every
module in the game*, including weapons/shields/armory/smuggler/luxury bays,
which guts the entire intended economy/progression loop (bug #5). All are
independently reproduced and root-caused below, each with a suggested fix.

None of this reflects the actual game design, which — once driven
programmatically past these bugs — held up well for as far as I explored:
prologue, docking/walking both ship and station, hiring, trading, day-by-day
travel with scripted and random events, save/reload, and one full combat
encounter (won by fleeing at low hull).

---

## Setup

- Cleared `localStorage`, reloaded → character creator modal ("☄ THE KESTREL
  RUN") appears correctly with captain name/ship name/specialty/appearance
  controls. ✅ Renders fine, defaults populate (Cass Ardent / Kestrel / Pilot).

## 🐛 CRITICAL: "Begin" soft-locks new-game start

**Repro:** Fresh browser (no save). Character creator opens. Click **◆ Begin**.

**Expected:** transition into the "DEAD RECKONING" prologue opening scene.

**Actual:** Nothing visibly happens. The creator screen just sits there
forever. Under the hood the game **did** actually start — `window.__S()`
shows `day:1, credits:85, fuel:3, food:14, hull:41, flags.intro:1` (exactly
`introStart()`'s reset values in `src/systems/intro.ts`) — but the DOM never
updates past the creator screen, and there is no button, Escape key, or
click-outside handler anywhere that would let a player discover this or dig
themselves out.

**Root cause:** `src/modal.ts`'s `modal(html)` helper is a queue: if a modal
is already open (`MODAL_HTML !== null`), the new HTML is pushed onto `QUEUE`
instead of replacing the visible one — it only surfaces on the next
`closeModal()`/`closeModal`-driven dismissal. The character creator is itself
a modal (rendered as `#modal .creator` while `#overlay` has `.show`). When
`avStart('prologue')` → `introStart()` fires, it calls `modal(...)` for the
"◆ DEAD RECKONING" scene — but the creator modal is still open, so the intro
scene is silently enqueued behind it instead of replacing it. Nothing ever
calls `closeModal()` on the creator, so the queued scene never surfaces.

Confirmed by manually calling `window.dispatch('closeModal', [])` from the
console — the "◆ DEAD RECKONING" modal immediately appears underneath,
proving state and content were both correct, only the transition was broken.

**Impact:** every brand-new player hitting "Begin" for the first time is
stuck on the character screen with no way forward. This blocks 100% of fresh
playthroughs unless the player already knows dev console tricks.

**Suggested fix:** `avStart()` (src/ui/avatar.ts:142) should call
`closeModal()` (or intro/startGame should use `replaceModal()` instead of
`modal()`) before/while opening the next scene, since this is a screen
*transition*, not a new competing event.

**Workaround used to continue this playthrough:** manually dispatched
`closeModal` once to reveal the queued Dead Reckoning modal, then proceeded
normally. All further notes below are the game post-workaround.

## 🐛 CRITICAL #2: ~15 whole subsystems are unclickable — dead `onclick` handlers

**Repro:** From the "◆ DEAD RECKONING" opening modal, click **"Get up."**
(the very first choice of the very first scene). Nothing happens.
`read_console` shows `[pageerror] introAct is not defined`.

**Root cause:** `src/dispatch.ts` documents its own history in a comment at
the top: the UI used to wire every button as a bare `window` global with an
inline `onclick="fn(args)"` string; it was refactored so templates instead
emit `data-action`/`data-args` attributes, read by one delegated
`document.addEventListener('click', handleClick)` (installed once at boot).
**The refactor was only completed for a subset of the UI** — ship/cockpit,
station walk, the market/planet screens, save/help modals, and the character
creator use the new `actionAttr()` pattern and work fine by clicking.
**Everything else was never migrated** and still emits raw
`onclick="someFunction(...)"` strings. Since no bare globals exist any more
(only `window.dispatch` is exposed, per dispatch.ts's own comment), every one
of those buttons throws `ReferenceError: <fn> is not defined` when clicked
and does nothing.

Confirmed the delegated listener (`handleClick` in dispatch.ts) only ever
matches `[data-action]` — there is no fallback path for plain `onclick`
attributes, so this isn't a timing fluke, it's structural.

**Affected files (still using dead inline `onclick="fn(...)"`, confirmed via
grep — 16 files, ~150 buttons):**
- `systems/intro.ts` — **the entire DEAD RECKONING prologue** (25 buttons:
  wake up, jury-rig the drive, EVA salvage, patrol encounter, debt payoff at
  Solace, etc.) — a brand new player cannot get past the very first prologue
  choice by clicking.
- `systems/combat.ts` — target selection, aim, fire, evade/back, and
  "Continue" after a fight (`cAct(...)`, `endCombat()`) are ALL raw
  `onclick`. **Combat is entirely unplayable by clicking** — the only way to
  fight is via `window.dispatch('cAct', […])` from a script/console.
- `systems/events.ts` — every travel-event choice: pirate encounters
  (Battle stations/flee/bribe/surrender), patrol stops, distress calls,
  trader/passenger offers.
- `systems/arc.ts` — the whole grey-coat/Voss story arc, the Union
  hunter-killer chase, THE RUN's blockade-running choices, the ending.
- `systems/crewtalk.ts`, `systems/junodialogue.ts` — all crew conversation
  topics and Juno's entire branching dialogue tree.
- `systems/damagecontrol.ts` — the no-mechanic/no-pilot/no-medbay minigames
  (valve guess, vector pick, nurse-or-soup).
- `systems/survey.ts` — salvage/charting contract scenes (board/scan/stake).
- `systems/imogenquest.ts`, `systems/agendabeats.ts` — the named crew's
  personal quests and moral-choice "agenda beat" events.
- `systems/walkEncounters.ts` — foot encounters while walking the station
  (toll/talk/fight).
- `systems/scene.ts`, `systems/scheduler.ts` — the generic dialogue-tree
  scene player and consequence-rider events (used by many of the above).
- `systems/silence.ts` — the entire "Broadcast"/Long Silence late-game
  storyline.
- `systems/gameover.ts` — "Start over" on the game-over screen.

**Net effect:** the moment-to-moment loop of docking, walking the ship,
trading, and traveling (the systems that *were* migrated) works by mouse
click. Nearly every piece of *narrative content and combat* — which is most
of what makes this a game rather than a spreadsheet — does not. A real
player would bounce off the game within the first ten seconds (stuck on
"Get up.") and, even past that, could never fight, never resolve a travel
event, never talk to crew, and never finish the story.

**Suggested fix:** finish the `actionAttr()` migration in the 15 files above
(mechanical, high-volume: replace `onclick="fn(a,b)"` → `${actionAttr("fn",
a, b)}`, matching the pattern already used in `ui/planet.ts`/`ui/ship.ts`).

**Workaround used to continue this playthrough:** every subsequent choice in
a broken screen was driven with `window.dispatch('<fn>', [args])` matching
what the dead `onclick` string would have called, so the rest of these notes
can still evaluate the underlying game logic/content/balance. Every such
case is effectively "this works when triggered programmatically, but is
unreachable by an actual player."

### Same root bug also breaks walking up to the prologue's interactive doors

Not just templated `onclick` strings — `src/ui/shipwalk.ts:158` has the doors
for prologue beats (the captain's chair, the engine jury-rig point, the EVA
suit-up locker) call `(window as any).introAct(spec.act)` directly as a bare
global instead of `dispatch('introAct', [spec.act])`. Confirmed by walking
the captain to the cockpit door (`__walkGoto(135,335)` +
`dispatch('walkInteract')`) — it throws
`TypeError: window.introAct is not a function` in `shipwalk.ts:162`. So even
if a player somehow got past the "Get up." button, physically walking to and
pressing E on the prologue's own marked interaction points is *also* broken.
This confirms the missing-global regression isn't confined to HTML strings —
it's in the walk-interaction dispatch table too, so the whole prologue is
unreachable by any input path a real player has (click or walk-and-interact).

## 🐛 CRITICAL #3 (generalizes #1): scene chains queue silently behind stale content

Same root cause as the "Begin" softlock, but recurring throughout the whole
prologue (and likely elsewhere — `arc.ts`/`survey.ts`/`silence.ts` chain
`modal()` calls the same way). `src/modal.ts`'s own top comment explains the
intended contract: `modal()` is for a *new competing event* (queues if one's
already open); `replaceModal()` is for *navigating within the current
scene/conversation* (e.g. a dialogue tree's next node) and should be used
there instead, precisely so continuations don't queue behind themselves.

`src/systems/intro.ts` doesn't follow that contract — nearly every stage
function (`stgVesperModal`, `stgCutterIntro`, `stgCutter`, `stgPatrol`, …)
calls `modal(...)`, and their "continue" buttons call the *next* stage
function **directly** (`onclick="introAct('vesper')"` etc.) instead of
`closeModal()` first. Result: the next scene's HTML gets silently pushed
onto the queue behind the screen still on-screen, and doesn't appear until
some *later, unrelated* `closeModal()` call happens to pop it — one stage
behind where the player actually is.

**Repro (via `dispatch`, bypassing bug #2's dead buttons):** at the EVA
salvage stage, ran `introAct('vesper')` then immediately `introAct('vesper_tags')`.
Both calls updated game state correctly (`flags.intro_tags` got set), but
`#modal` stayed frozen on the *previous* "Cross to the Vesper" screen through
both calls. Two separate, later `closeModal()` calls were needed to reveal,
in order: the Vesper wreck choice screen (tags vs. armory — a choice that had
*already been resolved* one call earlier) and then the Cutter black-box
screen. **The screen showing a decision is not necessarily the decision that
is about to be recorded** — if the two calls had picked different options,
the visible choice buttons would be resolving state one full step out of
sync with what's on screen.

**Impact:** even with bug #2 fixed (wiring the dead `onclick`s to dispatch),
a player clicking through the prologue at a normal pace — i.e. never
double-checking whether a click visibly changed anything before clicking
again — will re-trigger the same "next" button multiple times on stale
content, each time silently queuing another duplicate scene and drifting the
displayed choice further out of sync with the actual game state. This is a
second, independent way the exact same screen can appear to hang.

**Suggested fix:** in `intro.ts` (and any other file with the same pattern),
either have every "continue to the next stage" button call `closeModal()`
and let the *next* scene arrive fresh from a walk/interact trigger (the
pattern that already works correctly for the cockpit→engine walk-aft beats),
or swap the chained `modal()` calls for `replaceModal()` so a direct
stage-to-stage continuation actually replaces what's showing instead of
queuing behind it.

**Workaround used to continue this playthrough:** called `closeModal` once
after every `introAct(...)`/story-action dispatch to keep the visible modal
in sync with game state before issuing the next action.

## 🐛 CRITICAL #4: arriving anywhere leaves the screen frozen on the old in-transit view

**Repro:** Travel to any destination until arrival (e.g. the prologue's limp
to Port Solace, `engageBurn()` on the final day). Game state updates
correctly — `S.loc`, `S.docked`, `S.screen` all flip to the arrived
station/`"shipwalk"` — but the visible `#main` panel keeps showing the old
**in-transit cockpit/throttle screen** ("IN TRANSIT: KESTREL'S REST → PORT
SOLACE · Day 2 of 3 · 1 day remaining", stale fuel/hull numbers) frozen from
before arrival. Explicitly re-issuing `nav('shipwalk')` while already on that
screen does **not** fix it. It only clears once you navigate to any
*non-walk* screen and back (e.g. `nav('ship')` then `nav('shipwalk')`).

**Root cause:** `src/ui/render.ts`'s `renderMain()` only replaces `#main`'s
`innerHTML` for `shipwalk`/`stationwalk` when `walk.needsMount(scene.id)` is
true — otherwise it assumes the walk scene is already mounted and just calls
`walk.ensureRunning()`. `needsMount` is `mountedId !== id`, and `mountedId`
is only cleared by `walk.teardown()`, which itself is only invoked from
`nav()`'s `WALK_SCREENS` bookkeeping (`ui/render.ts:35`). But
`src/systems/travel.ts` sets `S.screen = "travel"` on departure (line 37)
and `S.screen = "shipwalk"` on arrival (line 201) **directly**, never
through `nav()`. So `walk.teardown()` never runs across a voyage, the old
`mountedId` from before departure survives untouched, and since the ship's
scene `id` is normally unchanged (same ship, same module layout), arrival
finds `needsMount()` false and skips repainting `#main` — even though the
walk sim quietly starts running underneath the stale HTML. This is the
general-purpose travel system (`travel.ts`), not prologue-only code, so it
almost certainly affects **every arrival in the game**, prologue or
otherwise.

**Impact:** every time a player finishes a voyage, the screen looks stuck
on the departure/in-transit readout — wrong day counter, wrong fuel/hull
numbers, an "ENGAGE BURN" button that (per bug patterns above) may not even
do anything useful anymore — until the player happens to click a nav button
that leaves and re-enters the walk screen (e.g. Ship → Walk Ship). A first-
time player has no reason to know that's the fix; this reads as "the game
didn't register that I arrived."

**Suggested fix:** have `travel.ts`'s arrival code go through `nav("shipwalk")`
(or otherwise call `walk.teardown()`/reset `mountedId`) instead of assigning
`S.screen` directly, so `renderMain()` always repaints on arrival.

## 🐛 CRITICAL #5: a brand-new game already owns every module in the game

**Repro:** Finish the prologue (or just start any new game) and open the
Shipyard/Module Shop at any station. Every module type in the game —
`⚙ Cockpit`, `Engine`, `⛽ Fuel Tank`, `📦 Cargo Hold`, `💉 Med Bay`,
`🛏️ Passenger Cabin`, `👥 Crew Quarters`, `🌱 Hydroponics Bay`,
**`🎯 Weapons Bay`, `🛡 Shields`, `Armory`, `Workshop`, `Smuggler`
compartment, and `Luxury Cabin`** — already shows "own Mk-I×1" from the very
first day, confirmed via `window.__S().modules` (14 modules, filling all 14
starting slots) immediately after the prologue ends.

**Root cause:** `src/state.ts`'s `newState()` — the literal constructor for
a brand-new game, used by both `introStart()` and every dev scenario in
`src/debug/scenarios.ts` — hardcodes the starting `modules` array to one of
*every* module type in the game (`state.ts:30-35`), and sets
`slotsMax: 14` to exactly match. This reads like a debug/test fixture
("one of everything, so every screen has something to show") that ended up
wired in as the actual new-game default instead of a minimal starting
loadout (cockpit/engine/fueltank/cargohold/quarters, say).

**Impact:** this breaks the game's core economic loop, not just a number
being off. The whole intended arc — grind cargo runs to eventually afford a
weapons bay, decide whether shields or armory is worth a slot, treat a
smuggler compartment or luxury cabin as a strategic specialization — is
moot, because every ship already has literally all of it, maxed on slots,
from turn one. This directly contradicts the game's own signposted design
(the prologue's closing text: *"Fly. Trade. Build the ship out."*, and the
combat balance note that a weapons bay is a stretch purchase early on — moot
if you start with one). It also removes any build-diversity decision-making
since there's nothing left to choose between.

**Suggested fix:** `newState()`'s starting `modules` should be a small
subset (e.g. `cockpit`, `engine`, `fueltank`, `cargohold`, `quarters`), with
`slotsMax` set low enough that weapons/shields/smuggler/luxury modules are
real purchases/decisions later, matching how the prologue's own narration
and the game's balance notes describe the intended early game.

## 🐛 CRITICAL #6: combat freezes solid after the very first action

**Repro:** Started a clean synthetic fight directly
(`window.dispatch('startCombat', [{name:'Raider Skiff', hull:50, dmg:10},
()=>{}, ()=>{}])`) so the combat screen shows fresh. Captured `#modal`'s
`innerHTML`, then ran `window.dispatch('cAct', ['move:laser'])` (picking the
first weapon — the very first thing a player does in any fight) and
compared. **The HTML is byte-for-byte identical before and after** — the
weapon-select screen never advances to target selection. The same holds for
every later phase (target → aim → fire → next round): confirmed via
`__S().hull` dropping 62→52 after a "successful" shot while the on-screen
`HULL 62/100` readout and aim-box position never updated to match.

**Root cause:** identical pattern to bug #3, but here it's fatal because
it's the game's most input-dense screen. `src/systems/combat.ts` imports the
same queuing `modal()` (not `replaceModal()`), and `drawCombat()` — called
after literally every phase transition (`cAct`'s weapon pick, target pick,
aim start, fire resolution, next-round setup) — calls `modal(...)` every
time. `clearModal()` is called exactly once in the whole file: inside
`endCombat()`, i.e. only after the fight is completely over. **Nothing pops
the queue during the fight itself.** So: pick a weapon → the target-select
screen silently queues behind the still-visible weapon-select screen →
nothing appears to happen → the target buttons the player can see are still
the *original* weapon-select ones. Click any of those again and a *second*
copy queues behind the first, and so on — a fight can never visibly progress
past its opening frame through any sequence of real clicks.

**Impact:** combined with bug #2 (dead `onclick`s in this exact file), this
means combat has two independent, fully-blocking failures stacked on each
other. Even a hypothetical fix for bug #2 would still leave every fight
completely frozen on the first frame. I was only able to observe combat
actually working (weapon fire, aim-timing scoring, hull damage, retaliation
FX) by manually calling `dispatch('closeModal', [])` after every `cAct` to
pop the queue myself — a step no real player has any way to discover, since
there is no visible "continue"/"dismiss" affordance anywhere in the normal
combat flow.

**Suggested fix:** swap `drawCombat()`'s internal `modal(...)` calls for
`replaceModal(...)` — combat is a single continuously-updating scene, not a
sequence of competing events, so it's exactly the case `modal.ts`'s own
doc comment describes `replaceModal()` as being for.

## 🐛 Minor content bug: mismatched pronouns in generated crew bios

At Port Solace's cantina, one of the two walk-up recruits, **Elias
Wren-Kohl**, has a bundle (`window.__S().market.recruits`) with:
- `origin`: "a Union naval academy **she** washed out of"
- `want`: "to prove the academy wrong about washing **him** out"

Same person, two different pronouns one field apart. Root cause:
`src/content/crewgen.json`'s `origins` and `wants` pools mix
gender-neutral phrasing with a handful of entries carrying a hardcoded
"she"/"him"/"her" (e.g. `"a Syndicate debt she's still paying"`,
`"nowhere he'll name"`, `"to matter to somebody who isn't paying her"`),
while `genBundle()` (`src/systems/market.ts:184`) draws each field
independently via `pick()` with no gender/pronoun coordination across
fields. `wounds`/`secrets`/`tells` mostly stick to "they/them" so the clash
is specific to the ~4/10 `origins` and ~3/10 `wants` entries that went with
a gendered pronoun instead. Low severity (flavor text only), but easy to
fix: either make every `origins`/`wants` entry pronoun-neutral like the
other pools, or add a per-character pronoun and template it in consistently.

## ⚠ Minor: recurring `THREE.Material` console warnings for undefined color/emissive

Throughout the session, `[warning] THREE.Material: parameter 'color' has
value of undefined` / `'emissive' has value of undefined` fired repeatedly
in the console (crew portraits / walk-scene avatars). `character3d.ts`'s
`mat(color, emissive)` helper and several call sites in `walk3d.ts` /
`character3d.ts` build `MeshStandardMaterial` from an appearance object
(`a.suit`, `a.trim`, etc.) — some crew members (likely those generated via
`genBundle()`/hired at a cantina rather than made in the character creator)
are reaching this code with an incomplete `appearance` object, so a color
field comes through `undefined`. Cosmetic/console-noise only in this
session (no visibly broken model), but worth a look since it fires on
essentially every walk-scene render.

## ✅ What genuinely works well: the DEAD RECKONING prologue's writing & systems

Driving it via `dispatch()` (bypassing the click bugs above), the prologue
content itself is excellent and the underlying systems all fired correctly:

- **Writing quality** is a clear strength — specific, well-voiced scene text
  (Juno Vale's dialogue, the Osei send-off, the Union patrol hail) that
  sells the "cold open after a firefight" premise without a wasted line.
- **Consequence tracking works end-to-end.** Choices correctly wrote to
  `S.flags` (`intro_tags`, `intro_survivor`, `intro_reported`, `intro_debt`,
  `intro_job`), to `S.disposition` (`shift("mercy", ...)`), and to the crew
  memory ledger (`remember(crewKey(j), ...)` for Juno) exactly as
  `intro.ts`'s comments describe — real systems, not scripted flavor text.
- **Resource math checks out**: fuel/food/hull/credits all moved by the
  exact amounts each choice promised (−6 hull for hull-plate patch stock,
  −3 food for the galley heat-exchanger, +8/+6 fuel from the two wrecks,
  +160cr bearer bonds, −40cr spare parts fund, etc.) with no drift.
  Confirmed with `window.__S()` after every step.
  Note: I inadvertently skipped the "pull the black box / leave it" choice
  by dispatching a later-stage action before that one (my own sequencing
  error while testing, not a game bug) — `intro_blackbox` never got set.
- **Meaningful moral forks**, not fake choices: tags-vs-armory-salvage,
  honest-vs-short patrol report, pay/claim/work off the debt all visibly
  branch dialogue and future disposition, and the game explicitly tells you
  what mechanically follows from each ("Union loves you" style framing).
- **The day-by-day travel loop** (`▸ ENGAGE BURN`, fuel/food burn rates,
  scripted "beats" firing on specific travel days) worked exactly as
  documented, once the throttle-up requirement (a nice bit of friction/
  tutorializing) was satisfied.

## ✅ What genuinely works well: the main ship/station/economy loop

This is the subset of the UI that *was* migrated to `actionAttr()`/
`data-action`, and it held up cleanly by real click-equivalent dispatch calls
for everything I tried:

- **Station/ship walking** (`nav('stationwalk')`/`nav('shipwalk')`,
  `__walkGoto` + `walkInteract`) correctly moves the captain, detects nearby
  interactables (Harbormaster, cantina, market, drydock, ship doors), and
  triggers the right scene. The 3D walk view renders and steps frames
  correctly under software WebGL (`swiftshader-webgl` fallback).
- **Market/trade** (`buyFuel`, `ptab('market')`) charged exactly the
  displayed per-unit price (10 fuel @ 5cr/unit → -50cr, confirmed twice) and
  updated fuel/credits instantly and correctly.
- **Job/cargo delivery** worked end-to-end: accepted "Vance's unmarked
  crate" job at the prologue's close, it persisted through a full 3-day
  voyage, and delivering it on arrival at the correct destination
  auto-completed the job and paid out (`✓ Vance's unmarked crate (the Osei
  debt) — paid 54cr`), removing it from `S.jobs`.
- **Payroll/crew consequences are real, not cosmetic.** Sailing with unpaid
  salary (I ran out of credits mid-voyage) produced escalating log
  consequences — a missed-payroll warning, then Juno Vale actually **quit
  the crew** over back pay with a prestige penalty ("Juno Vale quit over
  back pay. Word gets around (−2 prestige)") — confirmed by `S.crew`
  actually emptying afterward. Good, legible cause-and-effect.
- **Combat's underlying math is sound** once the display is manually
  unstuck (see bug #6): weapon/target/aim selection, the Lissajous-path
  aim-timing minigame, hit-grade scoring (wild/glancing/solid), hull damage
  to both sides, retaliation, and a full **flee** resolution all worked
  and matched the numbers reported by `window.__S()`.
- **Save/reload persistence** works correctly: triggered a hard page
  `location.reload()` mid-game (day 8, 55cr, full flag set) and the
  autosave restored the exact same state afterward, no data loss.
- **Help modal** content is accurate and matches what I actually observed
  in the systems it describes (loop, module/power/crew rules, economy tips).

## How far I got

Fresh game → character creation → (workaround) prologue "DEAD RECKONING"
start-to-finish, including the Vesper/cutter/skiff salvage sweep, a Union
patrol stop, a scripted crew scene with Juno, arrival and debt settlement at
Port Solace → main loop at Port Solace (market, shipyard/module shop,
cantina/job board) → accepted and fulfilled a delivery job to Kestrel's Rest,
including a missed-payroll consequence that cost me my only crew member →
one full synthetic combat encounter (fled at 19/100 hull after 3 exchanges)
→ verified save/reload persistence. Did not reach: the grey-coat/Voss story
arc or THE RUN (both gated behind 12★ prestige, far beyond this session's
scope), the Long Silence broadcast storyline, or a natural (non-scripted)
random travel event/pirate encounter (none rolled in the ~7 travel days
covered). Everything past the base loop was reachable only via
`window.dispatch(...)`, per the bugs documented above.

