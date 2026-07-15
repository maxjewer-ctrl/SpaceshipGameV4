# STATION IDENTITY & CAST BACKLOG

Written 2026-07-12. Problem: every port renders the identical seven-room deck
(`stationwalk.ts ROOMS`) with the identical prose, and the anchor NPCs spawn
`"planets": "any"` — so Vance ("I am the station") is every station, and no
port has a face of its own. This doc is (a) the identity sheet per world and
(b) the running list of characters still to be created. Check items off as
they land; add new gaps as they're found.

## The rules

- **The ship is always on display, and you board it through the rear hatch.**
  Every port — town or station — physically shows the player's ship somewhere
  and you leave by walking to its hatch, never an abstract "depart" button.
  Implemented as `WalkScene.ship` (a `ShipBerth`: footprint + `facing`);
  `shipHatch()` places the board door at the rear, `walk3d.renderShip()` draws
  it, and the sim blocks its footprint. Towns berth it in a dock on the town's
  edge (Dustwell: east side, by the Repair Yard); stations park it in a berth
  apron off the docks. Any new port MUST set `scene.ship`.
- **One signature room per port** that exists nowhere else. Identity comes
  from one landmark, not seven reskins.
- **No `"planets": "any"` NPCs.** Everyone lives somewhere. Recurring-role
  *functions* (a harbormaster, a yard boss) repeat; *people* don't.
- **Every port ships with:** a face (who runs the deck), a signature room, a
  local mission flavor on the job board, and one street-level character who
  isn't plot — just texture with a name.
- **Every station uses the same spatial grammar:** arrival berth, public
  concourse, service rooms, a social room, a restricted/back-room space, and
  exits. Those roles are data, not a custom UI flow; the local identity comes
  from the architecture, people, events, lighting, and signage placed within
  them.
- **Faction faces:** each faction needs at least one named human the player
  can love or hate. Union ✅ (Vance, Farr, Mr. Grey). Frontier ✅ (Yun).
  **Syndicate ❌ — biggest gap in the cast.**

## Rehoming pass (cheap, do first)

- [x] Vance → Port Solace only (the prologue already wrote her as Solace's)
- [x] Dock Boss Kord → Foundry under-decks only
- [x] Wren → Haven's Folly only
- [x] Tomas → Foundry (bonded to the recycler line — fits the labor world)
- [x] The Aldrens → Port Solace (the sweep is a crossroads-station story)
- [x] Organizer Yun → circuit of Foundry + Kestrel + Havens (Wren's
      sell-her-out scene lives at Havens, so Yun must work there too)

## Identity sheets + cast to create

### MERIDIAN PRIME — Union core / the polished graveyard
Vibe: glass, surveillance, taxes — built on top of a 60,000-name atrocity
nobody official mentions. Grief under a clean floor.
Signature room: **The Memorial Lighthouse** — names scroll on the glass,
24/7. (Senn already hides "under the lighthouse" — make it real.)
Mission flavor: white-glove VIP charters; inspection-heavy freight (contraband
risk up, pay up).
Cast to create:
- [ ] **Customs Assessor** — the anti-Vance: utterly incorruptible, politely
      ruinous. Refusing bribes is her characterization.
- [ ] **The Lighthouse Keeper** — survivor who reads the names aloud; quiet
      link into the Reckoning arc for players who never meet Reyes.
- [ ] **A corporate liaison** — offers lucrative, soul-scraping contracts;
      the acceptable face of what Mr. Grey is the naked version of.

### FOUNDRY — industrial / labor vs. Union
Vibe: smoke, welding light, shift horns. The under-decks are the real city.
Signature room: **The Union Hall** (double meaning intended) — labor politics,
strike rumors, Yun's recruiting ground.
Mission flavor: oversized/heavy tow jobs (need empty hold, pay big); parts
runs feeding the wear/refit economy.
Cast to create:
- [x] **Yard Mistress Odalys Ferro** (`yardmistress_ferro`) — the refit loop's
      face, in the Foundry drydock. Earn her rate by *understanding* the ship
      (not paying) → `yard_favor` flag = 20% off every refit sector-wide
      (wired into `wear.ts refitCost()`). Gives an off-the-books parts run and
      seeds the "parts with provenance" fantasy (`ferro_provenance_interest`
      flag) for when that system is built. Knows Petrov's yard; thematically
      linked to Tomas one deck below.
- [ ] **Labor Steward** — runs the Union Hall; strike/blockade missions;
      natural collision with Kord's bonded-debt racket.
- [ ] **Under-deck bookmaker** — takes bets on ship arrivals; small gambling
      loop + a rumor source that's *paid* rather than bought.

### PORT SOLACE — crossroads / everyone owes someone
Vibe: the starting station; debt as weather. Vance's fiefdom.
Signature room: **Debtor's Row** — where captains who didn't make it sell
what's left; secondhand modules with provenance (feeds parts-with-stories).
Mission flavor: the generalist board (correct — it's the tutorial port), plus
debt-collection/repo contracts with mercy choices.
Cast to create:
- [ ] **The Row Broker** — the in-room face of the rack. NOW UNBLOCKED: the
      used-module marketplace shipped (`systems/usedmarket.ts`), stocking
      Debtor's Row (Solace), Ferro's rack (Foundry), and the Auction Floor
      (Havens). The mechanic works headless via the Shipyard tab; the Broker
      would be the NPC who stands in Debtor's Row and, if asked, tells you
      whose ship each piece came off. Optional polish now, not a blocker.
- [ ] **Bev** (promote from prose to full NPC) — she already has a stall
      port-mark; give her dialogue and a cheap-fuel loop.

### KESTREL'S REST — agri frontier / quiet resentment
Vibe: wheat to the horizon, food cheap, Union tariffs bleeding the co-ops.
Signature room: **The Grange** — co-op hall + seed vault; harvest board.
Mission flavor: seasonal bulk-grain hauls (harvest windows, deadline pressure,
honest pay); occasional "get the tariff assessor off our backs" gray work.
Cast to create:
- [x] **Grange Matriarch Willa Harrow** (`grange_matriarch_harrow`) — runs the
      co-op from the Grange. Gives day-limited harvest consignments (18-unit
      bulk); a "side with the valley" branch (`grange_ally`, Frontier+/Union−)
      that name-drops Yun without railroading; and a regular-standing path
      gated on Frontier rep 3 (`grange_regular` + a big port-standing bump,
      which the existing standing economy turns into pump discounts).
- [ ] **Union Procurement Agent** — buying grain at prices that are technically
      legal; the villain nobody can arrest.
- [ ] **A kid who wants off-world** — recurring dock texture; years later
      material for a recruit or a cautionary rumor.

### HAVEN'S FOLLY — free port / the Syndicate's living room
Vibe: no customs, no questions, neon over rust. Loose, dangerous, fun.
Signature room: **The Auction Floor** — unclaimed cargo lots, salvage rights,
occasionally something that should not be sold.
Mission flavor: auction lots (buy blind, profit or regret), no-questions
freight, fence work.
Cast to create:
- [x] **Factor Nadia Sur** (`factor_sur`) — the Syndicate's face, filling the
      "Red Sky Lieutenant" slot under the in-world title *Factor* (avoids
      colliding with Union's Lt. Farr). Holds court in the Auction Floor.
      Creed: order without law. Gives no-questions freight + enforcement
      bounties (tier-1 Corsair fight). Ties to crew: if Callum Vex is aboard,
      she holds his paper — buy it out / assume it / refuse. She is the future
      root of the Syndicate module tree.
- [ ] **The Auctioneer** — fast-talking, scrupulously honest about dishonest
      goods; runs the auction *loop* (the mechanic, not just the room). Sur is
      the floor's authority; the Auctioneer is its cashier.
- [ ] **A fence** — turns "salvage" into credits at a discount and into
      questions when the provenance is hot.

### VERGE STATION — last light / the Silence's porch
Vibe: expensive, half-empty, everyone listens to the band static a little too
long. The congregation that walked is a fresh wound.
Signature room: **The Listening Room** — the long-range array; where survey
contracts, deep rumors, and Silence fragments surface.
Mission flavor: deep-supply runs (no ports out there), survey/charting
contracts (pillar 4's home).
Cast to create:
- [ ] **The Stationmaster** — keeps the light on out of stubbornness;
      hard-nosed about who's allowed to die out there on her fuel.
- [ ] **The Array Operator** — sells bearings and survey leads; hears things
      first; slightly wrong in a way that gets wronger with Silence stages.
- [ ] **The Left-Behind Congregant** — stayed when the others walked into the
      dark; Calis's grief mirrored from inside.

### DUSTWELL — desert landing town / rivets and stubbornness
Vibe: wind that never stops, water as currency, overland convoys.
NOTE: Dustwell already has its own hand-laid scene (`src/ui/planetwalk.ts` —
Saloon, Sheriff's Post, the Outskirts, desert 3D reskin). It does NOT use
stations.json; it's the showpiece hand-built port. Identity work here means
NPCs + mission flavor, not rooms.
Mission flavor: water convoys (escort-flavored freight), prospector supply
drops at coordinates (survey-lite).
Cast to create:
- [ ] **The Water Baron** — owns the aquifer rights; polite monopolist; the
      moral texture of the town flows from whether you work for or around him.
- [ ] **Roadhouse Keeper** — cantina-equivalent proprietor; convoy gossip;
      feeds you when you're broke, remembers it when you're not.
- [ ] **A hermit prospector** — comes to town twice a season with a map
      fragment and a thirst; entry point for salvage/survey scores.

### GATE / ANECHOIC — hidden worlds
Correctly special-cased (no market). No standing cast — anything walking
around out there should be an event, not a resident.

## Crew dossier gaps (existing systems, missing people)

- [ ] Agenda beats still owed: Ada, Brix, Elias, Tomas, Imogen, Bapu
      (per OPENING_CRITIQUE.md — six of twelve shipped)
- [ ] Named-twelve coverage: audit that every role has a hireable named
      character reachable in the first ~20 days of a normal route

## Engine work this implies (order matters)

1. [x] Rehoming pass (spawn arrays only — one sitting).
2. [x] `stations.json`: per-port drop/labels/prose; `stationwalk.ts` reads it
       (`portLayout()`). Verified in-game at all 7 ports, tsc + console clean.
3. [x] Signature room *shells* (walkable, lit, prose): Memorial Lighthouse,
       Union Hall, Debtor's Row, the Grange, Auction Floor, Listening Room.
       Their mechanical hooks (auction loop, Row inventory, survey board)
       are NOT built yet — they arrive with their NPCs.
4. [x] Per-port mission flavor: `portjobs.json` + `genLocalMission()`
       (market.ts) seeds one signature job on each board and may add a second.
       Verified: Meridian white-glove/bonded, Foundry heavy tow, Solace repo,
       Kestrel harvest bulk, Havens fence, Verge deep-supply, Dustwell water
       convoy. Board fill dedupes by title so single-template ports don't
       double up. `MissionGrant`/scene missions now carry `tier`.
5. New cast, in priority order: ~~Red Sky Factor~~ ✅ → ~~Yard Mistress~~ ✅
       → ~~Grange Matriarch~~ ✅ → the rest as their ports come up. Row Broker
       jumped the queue's tail — see #6.
6. [x] **Used-module marketplace** (`systems/usedmarket.ts`) — realizes
       Debtor's Row + CORE_LOOP.md pillar 1 "parts with provenance". A
       per-port rack of second-hand modules, each cheaper than yard-new but
       carrying pre-existing wear (the honest catch: cheap now, refit sooner)
       and a provenance line. Stocks Solace (dead captains'), Foundry
       (Ferro's salvage — cleaner if `yard_favor`), Havens (auction, roughest).
       Stable for a 3-day restock window (no wait-scumming). Surfaced in the
       Shipyard tab; Debtor's Row / Auction Floor prose point to it. Save
       migrated to v11. Verified: per-port stock, restock timing, purchase
       installs a worn module for the discounted price, slot/credit guards,
       provenance in the log.
7. [ ] **Row Broker NPC** (optional) — the human face for the now-live rack;
       stands in Debtor's Row, names the previous owner of each piece.
8. [ ] Remaining cheap dialogue faces as ports come up: Labor Steward
       (Foundry Union Hall), Verge Stationmaster + Array Operator, Dustwell
       Water Baron + Roadhouse Keeper, Meridian Customs Assessor + Lighthouse
       Keeper, the Havens Auctioneer + fence.
