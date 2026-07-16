# THE KESTREL RUN → **ODYSSEY**
### Master plan: from single-file freighter sim to the deepest endless space odyssey on the web

---

## 0. The Vision

One sentence: **Sunless Sea's storytelling × FTL's crew drama × Elite's freedom × Oregon Trail's dread — in a persistent universe that remembers every captain who ever died in it.**

The fantasy: you are a small light in an enormous, indifferent, *strange* dark. The core loop (contracts → credits → modules → farther out) stays sacred — but "farther out" becomes literally endless, and the deeper you go, the weirder and more hand-crafted it gets. Early sci-fi odyssey means: slow-burn mystery, crackling radio voices, wonder and dread in equal parts, and the sense that the universe was here long before you and will be here long after.

**The four pillars.** Every feature must serve at least one; anything serving none gets cut:

1. **THE SHIP IS A CHARACTER** — every module hums, breaks, and has opinions. You know her sounds.
2. **THE BLACK IS DEEP** — there is always another system, another signal, another rumor. No edge of the map, only edges of your fuel.
3. **EVERYONE HAS A MOTIVE** — crew, passengers, factions, and the universe itself want things. Stories emerge from wants colliding.
4. **DEATH IS CONTENT** — captains die. Their wrecks, debts, grudges, and legends persist in the shared universe for other players to find.

---

## 1. Tone Bible (the "early sci-fi odyssey" feel)

- **Radio, not video.** Communication is voice transcripts, static, signal delay. Distant contacts are "a voice on the band," not a face.
- **Analog future.** Toggle switches, fuel gauges, paper manifests, a captain's log written in ink. CRT-amber UI (already have it — lean in: scanlines, flicker on damage, boot-up sequences).
- **The unexplained stays partly unexplained.** Anomalies get *descriptions*, not *explanations*. The Meridian Incident was act one; the meta-mystery (see §6, "The Quiet") never fully resolves — it deepens.
- **Small stakes feel big.** A dying hydroponics bay matters more than a galactic war. Wars are weather; your crew's dinner is plot.
- **Names matter.** Generated ships, captains, and stations pull from a curated name-fragment corpus (this is Supabase content — thousands of rows, cheap to write, huge immersion return).

---

## 2. The Big Idea: The Legacy Loop + The Shared Dead

This is the feature that makes it *"crazy endless"* and justifies Supabase's existence. Everything else supports it.

### The Legacy Loop (single-player, roguelike-adjacent)
- Captains **die permanently** (or retire). But death starts the next chapter, not a reset:
  - Your next captain inherits a fraction: a faction rep echo, a family debt, one heirloom module, your predecessor's *reputation* ("You're the Barny captain's kid?").
  - The old ship becomes a **derelict** at its death coordinates — your new captain can quest to recover it.
  - A **lineage record** accumulates: "House Vega: 7 captains, 3 died to pirates, 1 reached the Gate, 1 was never found."
- Retirement endings become achievements-with-consequences: retire rich → your next captain starts with a stipend but soft reputation; go out in glory → hard start, legendary name recognition.

### The Shared Dead (async multiplayer — the killer feature)
- Every player's dead captain's wreck is written to Supabase. Other players **find real wrecks**: name, ship, cause of death, final log entry, salvage.
  - *"Derelict located. Registry: KESTREL-9, Captain M. Reyes. Cause: starvation, day 122. Final log: 'Should have bought the beans on Kestrel's Rest.'"*
- Player deaths seed content: a captain killed by pirates in a sector *raises that sector's danger rating* for everyone for a week. A rich trade route heavily flown by players *depresses its margins* (aggregate supply/demand).
- Players can post **open contracts** to the shared board (escrowed credits): "500cr to whoever scans the anomaly at Sector K-7." Completion is verified server-side.
- A **galactic news feed** generated nightly from real player events: biggest fortune, deepest exploration, most-visited port, notable deaths. The universe feels inhabited because it *is*.

> **Design rule:** async only. No realtime co-op, no ships on screen together. Ghosts, echoes, wreckage, and markets — that's the odyssey feel (you're alone, but others *were here*), and it's 100× cheaper to build.

---

## 3. Architecture Migration (Phase 0 — the un-fun prerequisite)

Current: one 2,500-line HTML file, string-templated DOM, localStorage. It's a great prototype and a terrible foundation. Migrate **before** adding content, or every feature costs 3×.

### Unity migration checkpoint (2026-07-15)

The browser/Vite game remains the live reference, but the next architecture
track has begun: a nested Unity project now exists under `unity/`, with a
local WebGL build that can be played in the browser for live iteration.

Current Unity foundation:

- `Kestrel.Sim`: pure C# simulation layer with deterministic RNG, v16 save
  shape, scenario factories, canonical hashes, and GitHub-safe .NET tests.
- `Kestrel.Game`: Unity presentation layer with a generated 6/8-bay ship deck,
  over-the-shoulder movement, module sockets, captain-console module swapping,
  save/load, and a WebGL `window.kestrel` bridge.
- `Kestrel.Editor`: setup, content sync, level validation, Unity tests, and
  WebGL build commands.
- Content authority remains the browser JSON. Unity setup syncs
  `src/content/modules.json` into `Assets/Resources/KestrelContent/modules.json`
  and uses it for module display names.
- Project-local Codex skills now exist for Unity development, playtesting, and
  screenshot inspection: `develop-kestrel-unity`, `playtest-kestrel-unity`,
  and `see-kestrel-unity`.

Current local gates:

- `npm run ci`
- `scripts/unity.ps1 sim-test`
- `scripts/unity.ps1 unity-test`
- `scripts/unity.ps1 build-web-dev`
- `scripts/unity.ps1 verify`

Near-term Unity direction: replace generated prototype rooms with hand-authored
ship prefabs while preserving stable module socket IDs; then port more of the
browser save/state model into `Kestrel.Sim` without changing gameplay rules in
the same pass.

### Target stack (deliberately boring)
| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + vanilla TS** | Keep the no-framework speed; get modules, types, hot reload. No React — the string-template render style actually scales fine with discipline. |
| State | Single `GameState` object + event bus + pure `derive()` fns | Formalize what already exists (`S` + `stats()`). |
| Rendering | Screen modules (`ship.ts`, `map.ts`, `combat.ts`…) each exporting `render(state)` | Same pattern, split up. |
| RNG | **Seeded, forkable** (`seedrandom` streams per system: `galaxy`, `events`, `market`) | Procedural generation + reproducible bugs + anti-cheat verification later. |
| Content | **Data, not code.** Events/missions/modules/planets defined as JSON matching a schema | This is the entire content pipeline (§7). Code interprets; DB supplies. |
| Persistence | Offline-first: localStorage always; Supabase sync when online (last-write-wins on `updated_at`, save versioning + `migrate()` chain — already started) | Never block play on network. |
| Deploy | Static host (Netlify/Vercel/GH Pages) + Supabase | Zero servers to run. |

### Phase 0 exit criteria
- Game plays identically to today, from `npm run dev`.
- All events/missions/planets load from JSON files (local for now — same schema the DB will use).
- Save = versioned JSON blob with migration chain.
- Seeded RNG everywhere `Math.random()` lives today.

---

## 4. Supabase Design

### Auth
- **Anonymous sign-in by default** (zero-friction: click play, get a UUID). Optional email/OAuth upgrade to claim your lineage permanently. This matters — never put a login wall before the first play session.

### Schema (v1)
```sql
-- WHO
profiles      (id uuid PK → auth.users, handle text, created_at, settings jsonb)
lineages      (id, profile_id, house_name, motto, created_at)
captains      (id, lineage_id, name, born_day int, died_day int null,
               cause_of_death text, final_log text, stats jsonb, alive bool)

-- SAVES (cloud sync)
saves         (profile_id PK, slot int, state jsonb, version int, updated_at)

-- CONTENT (the "go nuts" tables — writable by you, readable by all)
content_events    (id, key text, weight int, min_depth int, biome text[],
                   requires jsonb, body jsonb, author text, enabled bool)
content_missions  (id, kind, template jsonb, min_prestige, faction, enabled)
content_modules   (id, key, def jsonb, enabled)
content_names     (id, kind text, fragment text)        -- ships, captains, stations, moons
content_rumors    (id, text, links_event_key text null)
content_arcs      (id, key, stage int, body jsonb)      -- multi-stage stories as data
story_flags       (profile_id, flag text, value jsonb)   -- per-player arc progress

-- THE SHARED DEAD
derelicts     (id, captain_id, system_seed text, x, y, ship_name,
               cause text, final_log text, salvage jsonb, found_count int)
sector_heat   (system_seed PK, danger float, updated_at)  -- aggregated deaths
market_flow   (planet_key, good, net_flow bigint, day)    -- aggregated trades
open_contracts(id, poster_profile, escrow int, body jsonb, claimed_by, status)
news          (id, day, headline, body, source text)      -- nightly job output
leaderboards  (season int, category text, profile_id, value, proof jsonb)
community_goals (id, season, description, target bigint, progress bigint, reward jsonb)
```

### Rules of engagement
- **RLS everywhere.** Players write only their own rows; content tables are read-only to clients; aggregates (`sector_heat`, `market_flow`, `news`) are written only by **Edge Functions** on a cron.
- **Trust the client for single-player, verify for shared.** Cloud saves can be whatever (it's their game). Anything entering *shared* tables (derelicts, leaderboards, contracts) goes through an Edge Function that sanity-checks (plausible day count, credit deltas, run duration). Seeded RNG makes runs spot-checkable later if leaderboards get competitive.
- **Content hot-loads.** Client fetches `content_*` (with a local cache + version stamp) at boot. You write a new event row in the Supabase dashboard at breakfast; every player has it by lunch. **No redeploy.** This is the single biggest content-velocity win.

---

## 5. Systems Roadmap (each phase ships a playable game)

### Phase 1 — THE ENGINE (foundation + content pipeline)
Phase 0 migration, Supabase auth + cloud saves, content tables live, event schema interpreter (conditions/effects DSL below), admin seed script that uploads local JSON → DB. **Exit:** current game, cloud-saved, DB-fed.

### Phase 2 — THE ENDLESS MAP (this is where "endless" happens)
- Keep the 7 hand-authored core worlds as the **Heartlands**. Beyond them: **procedurally generated sectors**, seeded and infinite in every direction. Depth (distance from Heartlands) is the difficulty/wonder dial.
- Each sector: 1–5 points of interest — stations, moons, anomalies, signal sources, gas clouds (fuel skimming!), derelicts (real ones, from the DB).
- **Biomes** flavor generation: mining belts, dead zones, pilgrim space, pirate reaches, the Quiet (deep). Biome tags select which content_events can fire there.
- New systems: **scanning** (module + minigame-lite: burn a day, resolve a signal), **jump fuel vs. sublight**, **star charts as loot** (buy/sell/steal maps that reveal sectors — huge odyssey vibe).
- Depth pressure: past a threshold, no ports — provisioning becomes expeditionary (this is where hydroponics/workshop builds shine and Oregon Trail dread returns as a *repeatable* mode, not just the finale).
- **Exit:** you can fly forever in any direction and it stays interesting for 20+ hours.

### Phase 3 — SOULS ABOARD (crew & passengers as story engines)
- Crew get: personality traits (2 each from ~30), wants, fears, a personal quest (data-driven, from `content_arcs`), relationships with each other that evolve (rivalry/romance/mentorship ticks each travel day).
- Passengers get generated *itineraries and secrets* — a passenger is a walking event deck, not a cargo unit with a name.
- Morale system (food quality, pay, danger, wins) → mutiny/desertion/loyalty perks at extremes.
- Crew skill growth + veterancy: your gunner who survived 30 fights is *named*, *better*, and *irreplaceable* — so their death (yes, crew can die in boardings/events) lands like FTL at its cruelest.
- **Delegation deepens:** assign crew to module stations; a manned module outperforms (workshop mechanic auto-repairs; medbay medic auto-cures; galley cook events).
- **Exit:** players tell stories about specific crew members, unprompted.

### Phase 4 — THE LIVING LEDGER (economy & politics)
- Prices from a real (simple) supply/demand sim per world: production/consumption ticks + event shocks (famine, strike, war) + **aggregate player trading** (`market_flow`) nudging margins.
- Faction sim: Union/Frontier/Syndicate control per sector, shifting weekly from events + community goals. Borders move. Blockades happen. Your rep unlocks faction module trees (Union: shields/legality; Syndicate: smuggling/speed; Frontier: sustainability/range).
- **News feed** (real, from the DB) becomes the meta-game surface: read the news → find opportunity → fly there before margins close.
- Letters of marque, war contracts, embargo running.
- **Exit:** a trade-focused player never touches the story and has a full game.

### Phase 5 — TEETH (combat 2.0)
- Keep turn-based (it fits the tone) but add **system targeting** (their engines/weapons/hull — mirrors your own module damage), **range bands** (flee = winning the range game), crew combat roles, boarding actions (armory finally shines), and enemy variety by biome/faction with named captains — some of whom **escape, remember you, and come back**.
- Ship classes at the shipyard: buy new hulls (spine layouts! different slot geometries, wing mounts, a proper reason for the deck-plan UI to shine).
- **Exit:** a bounty-hunter build is as viable and expressive as a trader build.

### Phase 6 — THE QUIET (the odyssey meta-story)
- The deep-space meta-mystery seeded from Phase 2's biome: why do signals past depth-40 go silent? Hand-authored arc chains (in `content_arcs`) discovered non-linearly through exploration — think Star Control 2 / Outer Wilds structure: knowledge, not keys, gates progress.
- The Voss/Meridian arc becomes chapter one of a larger cycle. Multiple mutually-exclusive grand endings (broadcast the truth / sell it / become the thing in the dark), all feeding the Legacy Loop.
- **Exit:** a wiki community would have something to argue about.

### Phase 7 — THE CHORUS (the shared universe, full power)
- Derelict recovery expeditions, open contracts, seasonal leaderboards (fastest Run, deepest depth, richest house), **community goals** with world-changing rewards ("if players collectively deliver 1M grain to Kestrel's Rest during the famine, food prices drop galaxy-wide for a season and a statue with the top hauler's name appears in the cantina description").
- Seasons: quarterly content drops + a fresh leaderboard, *never* wiping lineages.
- **Exit:** the game generates its own reasons to come back weekly.

---

## 6. Content Pipeline (how you "go nuts")

Content is the moat. The systems above are finite; the events are not. Everything below is writable **without touching game code**:

### The event schema (the workhorse)
```jsonc
{
  "key": "hermit_of_the_red_moon",
  "weight": 3,
  "min_depth": 8, "biome": ["dead_zone"],
  "requires": { "modules_any": ["medbay"], "flag_not": "hermit_helped" },
  "body": {
    "title": "A Light on the Red Moon",
    "text": "A hand-keyed distress code, decades out of date...",
    "choices": [
      { "label": "Land and investigate",
        "requires": { "crew_role": "medic" },
        "effects": [ {"flag": "hermit_helped"}, {"prestige": 2},
                     {"log": "..."}, {"chain": "hermit_arc_2"} ] },
      { "label": "Mark it and move on",
        "effects": [ {"rumor_unlock": "hermit_location"} ] }
    ]
  }
}
```
A conditions/effects interpreter (Phase 1) means **every future system just adds vocabulary** (`requires.faction_rep`, `effects.crew_relationship`, …). Arcs are chains of these. The Voss storyline gets retro-fitted into this format as the proof of concept.

### Content targets (order of magnitude)
- 300+ travel events (30 today), 100+ per biome flavor variants
- 50 passenger archetypes × secrets matrix
- 20 crew personal quest arcs
- 5,000+ name fragments, 500 rumors, 200 cantina descriptions
- 10 multi-stage mystery arcs for The Quiet

### Tooling
1. **Week 1:** JSON files in repo + seed script → good enough.
2. **Later:** a tiny internal editor page (same repo, `/editor`, Supabase-authed to you) with schema validation + "test-fire this event" preview.
3. **LLM-assisted drafting:** generate event *drafts* in-schema in bulk, then hand-edit for tone — the tone bible (§1) becomes the prompt. You curate; the machine types.
4. **Maybe someday:** community submissions table with moderation flag.

---

## 7. Sequencing & Reality Check

**Order:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7, but ship a *vertical slice of the Shared Dead early* (derelict write-on-death + find-others'-wrecks) right after Phase 1 — it's small, it's the hook, and it makes even the current game feel haunted.

Rough effort (solo, part-time): Phase 0–1 ≈ 2–3 weeks · Phase 2 ≈ 3–4 weeks · each later phase ≈ 2–5 weeks. A year-long odyssey. Fitting.

**Scope guards:**
- The game must be **fully playable offline single-player forever** — Supabase enriches, never gates.
- Async-only multiplayer. The moment "realtime" appears in a design, cut it.
- Every phase ends with a build you'd happily show someone.
- New systems must speak the event DSL, or they don't merge.
- When torn between a system and 30 events: write the events.

---

## 8. Next three concrete steps

1. **Phase 0 migration** — Vite + TS scaffold, split the file into modules, extract all content to JSON, seeded RNG, versioned saves. (Say the word and I'll start.)
2. **Supabase project** — you create it; we wire anon auth + `saves` + cloud sync (one afternoon).
3. **The haunting** — `captains` + `derelicts` tables, write-on-death, wrecks appear as map POIs. First moment another player's ghost shows up in your game, you'll know this whole plan is right.
