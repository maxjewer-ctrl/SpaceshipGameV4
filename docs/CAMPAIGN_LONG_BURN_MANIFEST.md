# THE LONG BURN — production manifest

Written 2026-07-13. Companion to CAMPAIGN_LONG_BURN.md (the design).
This is the build sheet: every system, character, scene, asset, and
data entry the campaign needs, with file touchpoints and rough sizes.
Check items off as they land; sizes are honest guesses, revise as the
first act teaches us the real rate.

Conventions: word counts are *written prose* (dialogue + card text),
not code. "Scene" = one modal/dialogue-tree interaction. "Card" = one
cantina/port card with a paragraph and a button. A named NPC costs a
portrait + a `npcs.json` entry + nodes; a *presence* is prose only.

---

## 1. Systems & code

### 1.1 Campaign state
- [ ] `LongBurnState` on `GameState` (types.ts, alongside `arc` and
      `campaign.silence`): `{ active, act, prologueStep, targets:
      Record<TargetId, TargetTrack>, mark: number, emberKnowledge:
      0|1|2|3, ending?: EndingId }` where `TargetTrack = { stage,
      found, resolved?: "killed"|"ruined"|"spared"|"turned",
      evidence: string[] }`. Save-version bump + migration default
      (inactive) in state.ts.
- [ ] Conductor-rule registration: Long Burn set-pieces must suppress
      and be suppressed by the grey-coat Run and Silence set-pieces
      (wherever the existing conductor check lives — mirror how
      silence.ts defers during the Run).
- [ ] **Campaign-select at new game.** intro.ts currently runs one
      prologue; add a pre-intro chooser: *Free Trader* (current game)
      vs *The Long Burn*. Selecting Long Burn defers captain-name /
      appearance selection to the "one year later" beat (the player
      names the *mask*, which is the point). The Magpie prologue uses
      a fixed given name ("Rook"? no — collides with crew Rook; use
      **"Jun"**) that NPCs from the old life still use in Act II/III
      recognition scenes.

### 1.2 Prologue runtime (Act I) — the biggest code lift
- [ ] **Crew-deck leg**: a constrained mode flag that locks the map to
      one scripted route and swaps the captain-role UI for crew-role
      framing. Reuse shipwalk + cantina + market with a `prologue`
      guard rather than building new screens.
- [ ] **Scripted losing combat**: combat.ts needs a scenario option
      `{ scripted: true, surviveRounds: 3, noFlee: true }` that ends
      in a cutscene regardless of performance (performance can feed a
      small later payoff: rounds survived → salvage condition of your
      old sidearm, a provenance item).
- [ ] **Derelict survival vignette**: a 6-day loop on the walk deck
      with a re-dressed room set (see §4/§5), one choice card per day,
      resource ticks (air/heat as flavor meters, not real systems),
      ending in the Solicitude scene. New tiny module
      `systems/derelict.ts` (~200 lines) rather than bending travel.ts.
- [ ] **Foundry bond montage**: "weeks pass" card sequence + Solt's
      five scenes + two labor-choice vignettes. Pure content on
      existing modal/card plumbing; needs only a day-skip helper.
- [ ] **The claim scene**: reuse the survey/derelict-salvage scene
      shape (ranging pillar); if survey contracts aren't built yet,
      this is a one-off scripted version and later the template for
      them.
- [ ] **The cut**: "one year later" — day counter jumps (+400),
      captain naming + appearance (existing avatar system), hull
      purchase from a fixed shortlist, sandbox unlock.

### 1.3 The List (quest log UI)
- [ ] New tab or ship-screen panel `ui/list.ts`: four names, each with
      portrait-silhouette (filled in when identified), lead lines
      (from evidence), stage description, and — on resolution — a
      hand-struck line through the name. Also surfaces the Ember
      rumor level. ~300 lines UI + a render hook in ui/render.ts.

### 1.4 Evidence
- [ ] `evidence[]` on state: `{ id, targetId, label, source, day,
      weight }`. Written by scene effects and by two new content-DSL
      verbs: `evidence(target, id, label, weight)` and
      `confront(target)` (opens the target's confrontation when
      total weight ≥ threshold). Read by the List UI and by
      confrontation gating. Wire the ledger: any `witnessAll` events
      involving a target auto-annotate.

### 1.5 The Mark
- [ ] `mark: number` (0–100) moved by disposition-adjacent choices:
      spite/rage options +, mercy/restraint −, +surge when sharing a
      room with an unresolved target. Portrait render tint at
      thresholds (ui/portraits.ts / avatarDraw.ts already composite;
      add a scar layer + reddening pass). Bark conditions
      (`markHigh`, `markSurge`) in barks.json schema. Crew
      agenda-beat interjections at 2 thresholds (see §3.6).

### 1.6 Target-track content runtime
- [ ] Four tracks authored in the arc-DSL card pattern (arc.ts is the
      reference implementation): stage-gated cards at specific ports,
      job injections (`kind:"arc"` jobs already exist and report back
      via `job_<tag>` flags — reuse), riders for delayed payoffs.
      New verbs needed beyond §1.4: `marketRig(station, good, bias)`
      for Target 3's poisoned-intelligence plays (can be a thin
      wrapper over station moods when those land; interim: direct
      price-bias effect with a duration).

### 1.7 Act III & endings
- [ ] Deep-band race scenario: a scripted multi-leg travel gauntlet
      (travel.ts events from a fixed pool) + standing/disposition
      checks that add/remove the three converging ships + climactic
      combat encounter with gambits.
- [ ] Ending resolution + epilogue writer: sets `ending`, plays the
      epilogue scene, then (OPEN ending only) applies the world
      patch: global fuel price multiplier (market.ts hook), ~6
      port-mark prose rewrites via the existing `portMark` verb, and
      a permanent cantina ambient line set. SELL/BURN endings write
      epilogue port-marks only.
- [ ] Post-campaign sandbox continuation for all endings (game does
      not end; gameover.ts untouched).

### 1.8 Debug
- [ ] `debug/scenarios.ts` entries: jump-to-prologue-step, act-II-
      start with N evidence, act-III-start per-standing presets, each
      ending. Non-negotiable for playtesting this much sequence.

---

## 2. Cast — every person to create

### New, campaign-critical (full NPCs: portrait + nodes)

| # | Name | Home | Role in story | Scenes |
|---|------|------|---------------|--------|
| 1 | **Abbess Maren Solt** | Foundry under-decks (Act I only) | Faria: bonded ex-navigator, educator, dies | 6 |
| 2 | **Captain Edran Voss-Kale** *(rename if too close to Dr. Voss — alt: **Edran Kale**)* | drifting; found via provenance trail | Target 1: held the Solicitude's conn | 3 |
| 3 | **Inspector Aldo Renn** | Meridian Prime | Target 2: buried the Magpie inquiry | 3 |
| 4 | **Corvo "the Ledger" Ashe** | Haven's Folly | Target 3: sold the Magpie's route | 4 |
| 5 | **Madame Cressida Cavanagh** | Meridian Prime | Target 4: the house; gave the order | 5 |
| 6 | **Ellis Cavanagh** | Meridian Prime | the heir; the innocent (our Albert) | 4 |
| 7 | **Tamsin Okafor** | prologue Magpie crew | the idealist who stole the Ember; dies Act I, haunts the rest | 3 (Act I) + posthumous logs |
| 8 | **Bosun Harl Deneke** | prologue Magpie crew | the shipmate the player bonds with; fate = Act II discovery (taken alive → optional rescue thread) | 2 (Act I) + 2 (Act II) |

Use **Kale** for Target 1 — "Voss" is taken by the grey-coat arc.

### Backlog NPCs promoted to load-bearing (were planned anyway)

| Name | Backlog slot (STATION_IDENTITY.md) | Campaign role |
|------|-------------------------------------|---------------|
| **Customs Assessor** (name her: **Assessor Prem Datta**) | Meridian, "the anti-Vance" | receives Renn evidence file; stalls the Union monitor in Act III if befriended |
| **Corporate liaison** | Meridian | becomes House Cavanagh's front-of-house; Act II salon gatekeeper |
| **Under-deck bookmaker** (name: **Odds Whitlow**) | Foundry | Target 1's rumor source; also texture |
| **The fence** | Haven's Folly | absorbed INTO Corvo Ashe (don't build twice) |

### Existing cast, new campaign duty (nodes added, no new art)
- **Dock Boss Kord** — Act I jailer; 2 new nodes + 1 optional Act II
  return scene (buy out every bond on his book, or break him — a
  free-standing mercy/spite beat).
- **Factor Nadia Sur** — Target 3 instrument; 2 new nodes.
- **Yard Mistress Ferro** — provenance-trail scene for Target 1
  (Petrov's-yard knowledge already in her sheet); 1 node.
- **Vance** — one recognition hazard: she processed the Magpie's
  paperwork once; a high-Mark scene where she almost places your
  face. 1 node.

### Presences (prose only, no portrait)
- Magpie's captain (dies in the ambush; a voice in Act I).
- The salvage-tug crew who "rescue" you (1 scene, faceless).
- Two bonded laborers in the Foundry montage (choice-vignette props).
- Auction-floor extras, salon guests (flavor lines).

---

## 3. Writing manifest — every scene and card

### 3.1 Act I — the wound (~9,500 words)
| Scene | Form | ~Words |
|---|---|---|
| Cold open: Magpie galley, meet Tamsin + Deneke | walk-deck dialogue ×2 | 900 |
| The working leg (dock/cantina/market with crew framing) | reskinned UI copy + 6 barks | 400 |
| Tamsin's nerves (seeding the Ember, 3 touches) | short scenes | 600 |
| The ambush + boarding | combat framing + cutscene | 700 |
| Derelict days 1–6 (one choice card each) | 6 cards | 1,400 |
| Opening the sealed crate (optional; pays off in Act III) | scene | 400 |
| **The Solicitude pass** | full-screen scene | 500 (make every word earn it) |
| Salvage-tug "rescue" + bond papers | scene | 400 |
| Foundry montage (4 weeks-pass cards + 2 labor vignettes) | cards | 1,000 |
| Solt scenes 1–5 (systems, law, etiquette, money, the claim) | dialogue trees | 2,200 |
| Solt's death + the escape | scene | 500 |
| The claim / wreck salvage | scene | 500 |
| One year later: naming, hull purchase | UI copy + scene | 300 |

### 3.2 Target 1 — Kale, the captain (~3,500 words)
Provenance-trail beats (Ferro node, used-market inspection copy,
Whitlow's book, harbor gossip ×3 ports), the tailing travel event,
the boarding/confrontation tree (kill / ruin / leave — three exit
scenes), and Kale's confession — the first turn fragment. Includes
optional Deneke thread trigger (Kale knows who bought the prisoners).

### 3.3 Target 2 — Renn, the inspector (~3,000 words)
Bait-shipment job chain (3 jobs w/ desc + outcome text), the clerk
flip (standing-gated, 2 scenes), the fence's ledger purchase, the
Datta handoff scene, and the public ruin scene (played out in the
Meridian deck greeting + a Lighthouse beat: the Magpie's crew names
finally read aloud — the campaign's quiet mid-point grief scene).

### 3.4 Target 3 — Ashe, the broker (~3,200 words)
Introduction (he's charming; he half-recognizes value in you), the
poisoned-manifest job chain (3 fake manifests, each a small authored
lie), two market plays w/ outcome variants, the Sur persuasion
scene, debt-buyout auction scene, and the fall — with Ashe's exit
line delivering turn fragment two (he knows *what* was on the
manifest he sold).

### 3.5 Target 4 — House Cavanagh (~4,500 words)
Salon-climb chain (liaison gatekeeping ×2, charter jobs w/ VIP
scenes ×3), four Ellis scenes (the friendship that complicates
everything), two Cressida scenes (gracious, terrifying), the
drawing-room revelation (turn fragment three: she never stopped
looking for the aft section), and the house's fall staging — which
branches on every prior mercy choice.

### 3.6 Connective tissue (~3,300 words)
- List UI copy: 4 names × stage lines (~40 lines).
- Mark barks: 12 (crew + dockside) + 2 crew agenda-beat interjection
  scenes per threshold (use the agenda-beat scheduler; highest-trust
  crew member speaks — write for the 4 most likely crew, degrade to
  a generic for others). ~1,200 words.
- Tamsin's posthumous logs: 4 recovered fragments drip-fed across
  acts (found via evidence beats), building her from prop to person.
  ~800 words.
- Rumor/whisper cards that keep the campaign knocking when idle
  (one per port, stage-aware). ~600 words.
- Recognition hazards (Vance scene, one dockhand double-take). ~400.

### 3.7 Act III — the Ember (~4,000 words)
The synthesis scene (all three fragments assemble), race-leg event
text (6 events, some conditional on standing), the three-ship
convergence scenes (each faction's hail, friendly and hostile
variants), climactic combat framing, the choice scene (the longest
single scene in the game — every living campaign character who
earned a voice gets a line on comms), and three ending scenes.

### 3.8 Epilogues (~2,000 words)
- OPEN: sector-wide broadcast scene + 6 port-mark rewrites + new
  ambient cantina lines + Ellis/Kale/Datta codas.
- SELL ×3 buyers: shorter, colder; one port-mark each.
- BURN: the star scene; the mark never fades (permanent portrait
  state); one coda with the highest-trust crew member.
- Mercy variants: Ellis's survival, Deneke's rescue coda, Kale at
  the broadcast — written as inserts, not separate endings.

**Writing total: ~33,000 words** (roughly the size of the existing
three campaigns combined — this is the schedule's long pole, ~2/3 of
total effort. Budget it in port-sized chunks: each target track is
independently shippable and playtestable.)

---

## 4. Art assets

### 2D (existing webp/portrait pipeline)
- [ ] Portraits ×9: Solt, Kale, Renn, Ashe, Cressida, Ellis, Tamsin,
      Deneke, Datta (+ Whitlow if promoted from icon).
- [ ] **Solicitude pass backdrop** — the campaign's signature image;
      registry lights through a hull fracture. Bespoke, full-bleed
      (cantina-backdrop.webp treatment).
- [ ] Derelict-interior backdrop (reuse for Act III aft-section).
- [ ] Foundry bond-deck backdrop (can lean on existing Foundry art).
- [ ] Meridian salon backdrop (Target 4 scenes).
- [ ] The Ember itself — one hero image (crate open, Act I; hold,
      Act III).
- [ ] Player scar layer for avatar compositing + 3 tint states.
- [ ] List UI dressing: strike-through mark, silhouette frames.

### 3D (Meshy pipeline, scripts/meshy manifests — optional polish)
- [ ] Derelict walk-deck dressing set: torn bulkhead, floating
      debris, dead console, shrouded body (~4 props; the walk deck
      re-dress is prose-first, props second).
- [ ] The Ember prop (drive core, faint glow) for hold/cockpit scene.
- [ ] Salon props only if Meridian's signature room gets a walk
      deck by then; otherwise 2D scene, defer.
  (Reminder from meshy notes: Auto Split is web-app only — order
  these as single untextured meshes and texture in-pipeline.)

### Audio
- [ ] Prologue ambience: derelict hull groans/air-hiss loop; the
      Solicitude's engine burn (the sound of being left).
- [ ] Mark-surge sting (short, low).
- [ ] Ending stingers ×3.

---

## 5. Content data entries (JSON)

- [ ] `npcs.json`: 9–10 new entries (cast table §2) with node trees —
      the node trees ARE much of §3's word count; write there once.
- [ ] `characters.json`: none required (Tamsin/Deneke are prologue
      NPCs, not hireable crew) — but consider a post-campaign
      hireable: rescued Deneke as a veteran bosun. 1 entry if so.
- [ ] `portjobs.json` / job templates: bait shipments ×3 (Renn),
      poisoned manifests ×3 (Ashe), charters ×3 (Cavanagh), leads ×2
      (Kale). All `kind:"arc"`-style with `job_<tag>` completion
      flags.
- [ ] `barks.json`: ~18 (Mark ×12, prologue crew ×6).
- [ ] `flavor.json`: rumor/whisper card pool (~10), post-ending
      ambient lines (~8).
- [ ] `riders.json`: delayed payoffs — Kale spared resurfaces at the
      broadcast; Ashe ruined sends one last poisoned tip; the clerk
      you flipped gets promoted (or fired) — ~6 riders.
- [ ] `world.json`: nothing structural; the Ember is state, not a
      good. (Do NOT add it as a tradeable good — the endings are the
      only market it has.)
- [ ] `stations.json` / port-marks: epilogue rewrite set (~10 marks
      across endings), Act I Foundry bond-deck room prose.

---

## 6. Encounters & combat scenarios

- [ ] Prologue ambush (scripted, survive-3, boarding cutscene).
- [ ] Kale confrontation (winnable mid-tier; his ship is as tired as
      he is — tune BELOW Corsair per the combat-balance memory, since
      players may reach him early with modest gear).
- [ ] Optional Deneke rescue raid (boarding-flavored scene, not a new
      combat mode — choices + one fight).
- [ ] Act III convergence: 1–3 opponents depending on standing math;
      the full-strength version (all three hostile) should be the
      hardest fight in the game and *avoidable* by a player who spent
      the campaign making friends — that's the thesis rendered as
      encounter design.
- [ ] 6 race-leg travel events (2 hazard, 2 pursuit, 2 standing-
      conditional relief).

---

## 7. UI surfaces

- [ ] New-game campaign chooser (2 options + blurbs).
- [ ] The List panel (§1.3).
- [ ] Evidence lines on target confrontation modals ("what you
      hold" summary).
- [ ] Mark tint on player portrait + a small mark indicator near it.
- [ ] Prologue crew-framing skin (job board says "the captain takes
      the contract"; market framed as quartermaster errands).
- [ ] Epilogue title cards ×3.

---

## 8. Build order & milestones

Each milestone is independently playtestable (per ITERATION_PLAN
rules: one committed, playtested cycle each).

1. **M1 — Skeleton**: state, campaign-select, List UI stub, debug
   jumps. Prologue exists as text placeholders end-to-end. *Proves
   the sequencing.*
2. **M2 — Act I complete**: all prologue beats + Solt + art for the
   Solicitude scene. *The campaign's make-or-break demo; playtest
   for feel before writing another word of Act II.*
3. **M3 — Target 1 (Kale)**: provenance trail + confrontation +
   Mark v1. *Proves the detective loop.*
4. **M4 — Targets 2 & 3**: evidence verbs mature; Datta ships;
   market plays (interim price-bias if moods not landed).
5. **M5 — Target 4**: salon climb, Ellis, Cressida, the turn
   assembled.
6. **M6 — Act III + endings + epilogue world-patch.**
7. **M7 — connective polish**: rumors, riders, recognition hazards,
   audio, Deneke thread, post-campaign hireable.

Dependency notes: M3 wants the used-market provenance strings (thin
addition to usedmarket.ts); M4's ideal form wants station moods
(CORE_LOOP pillar 3 item 6) but has a written interim; nothing else
blocks on the CORE_LOOP backlog.

## 9. Open design questions (decide before the relevant milestone)

1. **Prologue length** (before M2): 30–40 min is the target; if
   playtest says it drags, the working-leg beat compresses to a cold
   open *in medias res* on the ambush day.
2. **Can the player abandon the campaign?** (before M1): proposal —
   yes; the List can be burned at any cantina table (scene included,
   ~200 words), converting Long Burn into the free-trader sandbox
   permanently. Costs little, honors the no-rails creed, and "the man
   who put it down" is itself a legitimate Monte Cristo ending.
3. **Mark visibility to the player** (M3): explicit meter vs.
   portrait-only. Proposal: portrait-only + barks; a number would
   make rage a resource to optimize, which is exactly wrong.
4. **Does Act II gate on prestige?** (M4): Target 4's salon climb
   should reuse the existing prestige ladder (~12★, same altitude as
   the grey coat) rather than invent a parallel one.
5. **Simultaneous campaigns** (M1): can Long Burn and the grey-coat
   arc interleave? Proposal: yes at card level, conductor rule at
   set-piece level — but Voss's Run and Act III cannot both be armed;
   whichever starts first locks the other until it resolves.
