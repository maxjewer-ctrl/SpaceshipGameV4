# BRAINSTORM: Souls & Consequences
### How crew storylines and delayed mission payoffs break the whole game open

---

## The core insight

Everything the game wants to be — granular crew drama, missions that pay off unexpectedly, a universe that remembers — reduces to **three engine primitives**. Build these three, and every idea below becomes *content*, not code:

1. **The Consequence Scheduler** — a queue of delayed events living in the save:
   `{ fireWhen: {day: 34} | {condition: "dock:verge"} | {condition: "flag:union_rep>5"}, eventKey, payload }`
   Anything can plant a seed that sprouts later. This is the entire mechanism of "unexpected payoff."

2. **The Memory Ledger** — instead of morale meters and reputation numbers alone, discrete remembered *facts* with emotional weight and tags:
   `{ who: "crew:rosa" | "world:kestrel" | "npc:marek", fact: "captain_paid_medical_debt", weight: +3, day: 22 }`
   Checks don't read a number — they read memories and can *cite them back to you in prose*.

3. **The Bark System** — contextual one-liners from crew keyed to (personality × situation × ledger). Hundreds of rows of content, trivially authorable, and the single cheapest source of "my crew feels alive."

Every idea below is these three primitives wearing different costumes. That's what makes this phase buildable.

---

## I. Crew as story-state machines ("the Tapestry")

Each crew member generates with a hidden bundle: **origin, want, wound, secret, tell**.
- *Rosa Vega — origin: Meridian orphanage · want: find her brother · wound: doesn't trust doctors · secret: Union deserter · tell: goes quiet when patrols hail.*

The game **never shows this sheet**. It leaks. Her tell fires as a bark during patrol events. Her wound surfaces when you install a med bay ("I'll do my own stitches, thanks"). Her secret is a landmine: a patrol scan event has a rider *if a deserter is aboard*. Her want matures into a personal quest — not as "QUEST ACCEPTED" but as a favor asked at the right moment: three days into a run, she knocks on the cockpit door.

**Witnessed events write character.** The same mechanic becomes a different person depending on what happened on *your* ship. Store witness memories in the ledger: a crew member who watched you hand Voss to the Union carries `{fact: "captain_sold_out_voss", weight: -4}` forever — and cites it during the next moral choice, changing the option text itself:
> *"Hand over the passenger" — Rosa is watching. Again.*

**Interlocking quests.** Personal quests key to *places and conditions*, not waypoints — the medic's quest fires when you happen to dock where her old partner lives. Quests collide on purpose: the medic needs a Union lab; your gunner is wanted in Union space. Sequencing crew goals becomes strategy. Occasionally two crew wants are mutually exclusive, and someone leaves, and it should hurt.

**The ledger makes endings.** Crew departures, betrayals, sacrifices, and weddings are all threshold reads over accumulated memories — and the farewell scene quotes the actual history: "You paid for my mother's surgery. You also left me in a cell on Foundry for six days. It evens out, Captain. Almost."

## II. Missions with hidden second acts ("Chekhov's Cargo")

Roughly a third of contracts carry a hidden **rider** that fires 5–40 days later via the scheduler. The contract you completed was act one; you just didn't know it. Payoff classes:

- **The Echo (good):** The miners you rescued? Their guild remembers — 30 days later a "guild discount" follows you to every fuel dock for a season.
- **The Bill (bad):** That no-questions crate you smuggled was seed stock for a narco-farm. The frontier town it poisoned knows your registry. The cantina goes silent when you walk in.
- **The Twist (weird):** The pilgrim you carried was mapping something. A star chart arrives by relay: coordinates, no note, signed with the symbol she kept drawing.
- **The Person (recurring):** Passengers roll a hidden *true purpose* — 1 in 10 is consequential: an undercover inspector (your next three scans go easy... or nothing was clean and nothing is forgiven), a dying magnate revising a will, a saboteur whose work you discover two jumps later.

**Grudges & guardian angels.** Named NPCs persist in the save with a disposition and an agenda that ticks: the pirate captain who escaped your guns re-arms and comes looking — *with a bigger ship and your ship's name painted on a missile*. The merchant you made rich sends tips. Enemies should escalate; friends should compound. A dozen persistent NPC slots is plenty — scarcity makes them memorable.

**The Rumor → Lead → Score pipeline.** Cantina rumors stop being flavor: some are collectible **leads** (evidence items). Three leads about the same wreck combine into a **score** — a one-time, high-stakes, hand-authored mission (salvage heist, prison break, vault run). Idle listening becomes a metagame; the payoff arrives weeks after the first overheard sentence.

## III. The ship and the world remember too

- **The ship's biography:** hull scars get names ("the Meridian dent"), survived disasters become quirks with small stat effects — the reactor that SCRAMed and killed no one is *lucky* now, and the crew touches it on the way to battle stations. Selling a storied module should feel like betrayal.
- **Worlds keep score:** planet-level ledger entries change descriptions, prices, and mission pools. Blow the serum deadline and next visit there's a memorial wall in the cantina — with names. Save the town and there's a drink that's always paid for.
- **The radio band:** a passive signal ticker during travel — serialized broadcast drama, news that foreshadows events *three days before they hit you* (a listening player dodges what a deaf one eats), and numbers stations that only make sense much, much later (The Quiet's first tendrils).

## IV. Why this comes BEFORE the endless map

The PLAN sequenced the procedural galaxy (Phase 2) before crew depth (Phase 3). **Swap them.** Reasons:

1. Crew/consequence systems multiply the value of the *existing* 7 worlds — the endless map multiplies the value of whatever systems exist when it ships. Depth first, then breadth, or the breadth is hollow.
2. The three primitives (scheduler, ledger, barks) are exactly the machinery the endless map's anomalies and The Quiet need anyway. Build them small, against known content.
3. "My gunner finally told me why she never sleeps before a Union border crossing" is the story a player tells a friend. That sentence sells the game; "the map is big" doesn't.

## V. Build order for this phase ("Souls & Consequences")

1. **Consequence scheduler** — engine primitive + retrofit 3 existing events with riders (distress rescue → guild echo; smuggle run → the bill; pilgrim → the chart). Prove the loop end-to-end.
2. **Memory ledger** — crew + world entries, written by ~10 existing moments (payroll misses, moral choices, rescues, the Voss decision).
3. **Bark system** — personality tags on crew gen + ~120 bark lines keyed to situations; render as side-log whispers and modal garnishes.
4. **Tapestry crew gen** — origin/want/wound/secret/tell bundles (data-driven), tells wired into 5 event types.
5. **Personal quests v1** — one hand-authored arc per role (6 total), condition-triggered, each with a choice that writes a big ledger entry.
6. **Chekhov riders at scale** — rider tables for every mission kind; persistent NPC registry (12 slots) with tick logic.
7. **Leads & scores v1** — leads drop from rumors/events; 3 authored scores.

Each step is playable and testable in the current 7-planet game. All content lands in the same JSON-schema-that-becomes-Supabase-tables shape from PLAN.md §6 — nothing is throwaway.

---

*The unexpected payoff isn't a mechanic. It's the game keeping a promise you forgot it made.*
