# THE CORE LOOP — a sustainability audit and a direction

Written 2026-07-12, after playing the game front to back. The question: if the
three campaigns didn't exist, would this game hold a player for thirty hours?
Today: no. The bones are right, the systems are unusually literate (ledger,
disposition, riders), but the loop **tops out** — and the campaigns currently
paper over that. The direction: make **survival, restoration, and ranging**
the game, with the campaigns as weather systems that roll in when the player
sails toward them — never rails.

## The loop as it stands

```
dock → cantina (jobs) → market (fuel/food/trade) → yard (modules/repairs)
     → map → burn days → events → deliver → repeat
```

It's a good loop. Its problem is a **ceiling**, reachable around day 50–70:

1. **Ship**: 13 module types, 10 slots, engine Mk-III, done. A finished ship
   is a solved ship; credits pile up with nothing left to want.
2. **Crew**: hire → trust tiers → one personal quest → one perk. After that a
   crew member is a completed checklist that draws salary.
3. **World**: stations are stateless menus. Vance remembers a grudge; nothing
   else about a port changes because *you* fly there. Nothing accumulates.
4. **Direction**: the only long-term "why" is 12★ → campaign. Which is
   railroading by vacuum — the campaign is the only thing that *grows*.

## Pillar 1 — SURVIVAL: the ship as a living problem

The fantasy is the *Millennium Falcon*, not a spreadsheet that fills up: a
ship that is never finished, only currently holding together.

- **Wear.** Modules accumulate wear from use, combat, and hard events. Worn
  modules degrade (a worn drive burns +10% fuel; worn weapons lose damage)
  and telegraph before failing. Dry docks refit wear; a mechanic slows it.
  This makes income *circulate* forever instead of piling up — and it makes
  the "restore the ship" arc permanent without being a treadmill, because…
- **Parts with provenance.** Refits use parts, and parts have stories: yard-
  new (dear), salvaged (cheap, quirky — "runs hot but never lies"), Foundry
  gray-market (great, technically stolen). A ship becomes a biography of
  choices. "The shield emitter off the Vesper" *means* something.
- **Quality tiers over new module types.** Mk-I/II/III per module beats
  inventing 20 new modules — same UI, real progression, and the yard always
  has something worth wanting.
- **Named-ship identity.** Hull scars that persist, a registry history other
  captains recognize, the option to NOT repair a scar because it's earned.

## Pillar 2 — CREW: from stat block to career

Trust tiers and the Tapestry already exist — extend them into **growth**:

- **Veterancy ranks** (per role, 3 ranks): earned by days aboard + events
  survived *in role* (a pilot ranks up dodging swarms, a gunner in fights).
  Each rank is a visible, named bump ("Dez can now thread a picket line").
- **Scars and learned traits.** Events leave marks: survive a boarding →
  `steady_under_fire`; a bad silence-station visit → `flinches_at_static`.
  Traits gate barks AND mechanics. Crew become records of the run you flew.
- **Loyalty missions** (the Mass Effect move, one per named character): a
  full errand — Ada's grave on Meridian, Brix's stolen-kit reckoning at
  Foundry, Nyla's stone for Teller's Claim. Completing one is the rank-3 gate
  *and* deepens the bond. Six agenda beats exist; loyalty missions are their
  second act.
- **Cross-training.** A bonded rank-3 crew member can apprentice a second
  role at half effect. The late-game crew is small, deep, and irreplaceable —
  which makes the survival stakes real (losing them must stay possible).

## Pillar 3 — PLACES THAT REMEMBER (no campaign required)

The `worldMemory` ledger already exists — almost nothing writes to it, and
nothing reads it aloud. Fix that:

- **Port standing** per station (not faction — *this* port): moved by what
  you do there and for it. High standing = berth discounts, first look at
  contracts, the good rumors. Low = "revised" fees, inspections, cold rooms.
- **Visible consequence set-dressing.** Small persistent station changes
  keyed to your ledger: cover Bev's debt → her stall appears in the exchange
  and undercuts fuel 10%; free Tomas → the recycler line runs with one fewer
  chair, forever; sell out the Aldrens → the dock berth where they slept
  stays roped off. Cheap to render (a line of room description + an actor),
  enormous for the "my actions exist" feeling.
- **Station moods.** Ports have states (boom, shortage, lockdown, festival)
  driven by events and player deliveries — the serum you ran *ends* the
  outbreak; prices and prose reflect it for weeks. The economy becomes a
  place you affect, not a sine wave you surf.

## Pillar 4 — RANGING: exploration as contract work

"Contracts that help you explore without railroading into the big plot":

- **Survey/charting contracts**: fly to a coordinate *between* worlds, spend
  a day, find something — a mineral seam (recurring income node), a derelict
  (salvage scene with choices), a dead beacon (lore, sometimes a campaign
  *whisper* — never a summons).
- **Points of interest on the map**: discovered POIs persist on the chart as
  YOUR marks. The map slowly becomes a diary.
- **The deep band**: past-Verge space as a soft-gated region (fuel/hull
  demands, no ports) with better finds and stranger events. The Silence
  lives out there when it comes — but so do purely mundane wonders.

## De-railroading the campaigns

The rule: **campaigns knock; they never enter uninvited.**

- Grey coat: already waits forever. Keep.
- The Silence: trigger off *behavior* (cumulative deep-lane days, or first
  ranging contract past Verge) with a floor (~day 15), not a flat calendar.
- The Reckoning: gated behind Voss anyway. Keep.
- The conductor rule (implemented): campaign set-pieces never overlap — the
  Silence holds its breath during the prologue and the Run.

## Combat direction (implemented this pass, extend later)

- **Varied hostiles**: scav drones (day ≤12, beatable by anyone) → skiffs →
  corsairs → rare lane-wolf gunships. The roster IS the difficulty curve.
- **Alternate solutions**: Cargo Decoy (jettison 3 goods, raiders chase the
  loot); crew gambits — Rook parleys pirates down by name, a gunner's
  Overcharge lands one guaranteed perfect lance, a mechanic's Cold Restart
  halves incoming and boosts escape. One gambit per fight, chosen by who's
  actually aboard: **your crew roster is your combat toolkit.**
- **Next**: boarding actions (armory + crew as the stat), enemy intents
  telegraphed ("they want cargo, not kills" → surrender is survivable),
  environment moves per scenario (debris cover, star-glare attacks).

## Build order (post-this-pass)

1. ✅ **Port standing + consequence set-dressing** (pillar 3) — shipped.
   `S.portStanding` per station; delivering/helping raises it, betrayals sink
   it; drives fuel/berth pricing, the station-deck greeting, and a ship-screen
   readout. Three location-stamped set-dressing marks wired (Bev's fuel stall,
   Tomas's empty chair / head-down bonded, the Aldrens' roped berth / grateful
   dockhand). DSL verbs `standing` + `portMark` added for cheap future marks.
2. ✅ **Module wear + refit loop** (pillar 1) — shipped (wear.ts).
2b. ✅ **Module quality tiers Mk-I/II/III** (pillar 1) — shipped
   (systems/modtier.ts). Every module carries a mark; output scales
   1.0/1.5/2.0, price 1.0/2.2/4.0, power draw held flat (higher mark = better
   per slot AND per watt). Yards sell up to Mk-II; **Mk-III fits only at
   Foundry**, giving the late game a destination. The yard offers buy-at-mark
   AND an in-place **upgrade path** (walk an owned unit up a mark for the
   price difference) — so a *full, finished* ship still has ten things to
   want, which is the economy-ceiling fix. Save v11 grandfathers old modules
   to Mk-I. 13 tests. Still open: parts-with-provenance / used-module market
   (the "salvaged, runs hot but never lies" flavor layer on top of this).
3. ✅ **Veterancy ranks** (pillar 2) — shipped (systems/veterancy.ts). Rank is
   fully derived (mirrors trustTier's pattern — never stored, never migrated):
   Green → Seasoned (10 days aboard + 3 events survived in role) → Veteran (25
   days + 8 events). `eventsInRole` increments at real per-role pressure
   moments — a gunner's combat win, a pilot's meteor-swarm dodge, a mechanic's
   jury-rig, a medic's sick-passenger save, a quartermaster's contract closed,
   a cook's ten-day stretch with nobody going hungry — each wired at its
   existing resolution point in combat.ts/events.ts/travel.ts. Rank feeds
   directly into the same stats()/foodPerDay()/bribeCost() slots
   perkActive() already stacks onto (a Veteran gunner deals more damage than
   perk alone, a Veteran pilot burns less fuel), and a bark fires the instant
   a crew member crosses a threshold. Rank shows in the crew roster sidebar
   and the crew-talk header. Scars/learned traits (steady_under_fire,
   flinches_at_static) — the other half of this bullet — deliberately scoped
   out as separate follow-up work: they're event-triggered rather than a rank
   curve, and gate barks/mechanics through a different mechanism (extending
   `gateOk()` beyond generated `bundle.traits`). 11 new vitest cases.
4. **Survey contracts + POI map marks** (pillar 4).
5. **Loyalty missions** (pillar 2, biggest content lift, best payoff).
6. **Station moods** (pillar 3, after standing works).

Each lands as one playtested, committed cycle per ITERATION_PLAN.md rules.
