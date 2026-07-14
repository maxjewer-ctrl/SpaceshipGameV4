# THE LONG BURN — a revenge campaign design

Written 2026-07-13. The pitch: *The Stars My Destination* without the
jaunting, which is to say *The Count of Monte Cristo* with a spaceship —
which is what Bester was writing anyway. A nobody is left to die in the
dark by people who had reasons. He survives, remakes himself, and comes
back wearing a new name and a good ship. The question the campaign asks
is Dumas's question: **what is revenge worth, and what does it cost the
person carrying it?**

We diverge freely from both sources. What we keep — the good stuff:

1. **The passing ship.** The inciting wound isn't the betrayal itself,
   it's the *rescue that didn't stop*. A ship saw the distress beacon,
   came close enough to read the hull, and burned away. That image is
   the whole engine of the story. It survives the loss of teleportation
   completely intact — better, even, because in our game distance is
   *paid for* in fuel and days, so passing someone by is a priced
   decision somebody made.
2. **The transformation.** Common crewman → educated, dangerous,
   patient captain with money and a mask. The revenge only works
   because nobody recognizes the man executing it.
3. **The list.** Revenge is administered person by person, each by
   different means — money, law, reputation, violence — not one boss
   fight. Monte Cristo ruins a banker financially, a prosecutor
   legally, a soldier socially. Our systems can do all four.
4. **The turn.** Foyle discovers the passing wasn't cowardice, and
   Dantès watches his revenge maim innocents. The last act must
   complicate the wound, not just cash it in.
5. **The PyrE ending.** The thing everyone was willing to kill for
   ends up in the protagonist's hands, and he gives it to *everyone* —
   the common man handed the fire. We keep this as the final choice.
6. **The mark.** Foyle's tiger tattoo — rage made visible. Cheap to do
   with our portrait system and worth its weight in characterization.

And the constraint from the brief: **the player is manning a spaceship
for the good chunk of the game.** This campaign is built so that the
revenge *is* the trader loop — the cover identity that lets you get
close to your targets is "successful freighter captain," which means
the sandbox game is the disguise. Every haul is in character.

---

## The story in one page

You are junior crew on the **Magpie**, an unremarkable short-hauler.
The prologue is one working leg — dock, load, burn — played thin and
fast, enough to learn the verbs and meet two shipmates you'll care
about. Then the Magpie is ambushed in the deep band, holed, and left
tumbling. The rest of the crew is dead or taken. You live in a wrecked
slice of the ship on recycled air.

On day six a ship answers the beacon. She comes close — close enough
that you read her registry lights through the fracture in the hull:
**SOLICITUDE**, Meridian registry, House Cavanagh colors. She holds
station for a moment. Then she burns away.

You are eventually "rescued" by a Foundry salvage tug, which under
sector law makes you *salvage* — your rescue debt is bonded to the
under-decks. Dock Boss Kord owns your paper. This is the Château d'If:
months of labor in the recycler lines, no ship, no name, no exit. Here
you meet **Abbess Maren Solt** (our Faria) — a bonded old navigator, dying
slowly, who trades you an education for company: systems, law, Union
etiquette, how money talks in the Meridian core. And, at the end, a
set of coordinates in the deep band and a name: the claim she never
lived to work. Her death is the escape — you go out with her body
(the classic, and it still works in vacuum: corpses are jettisoned or
shipped, and either path gets you off Foundry unpapered).

The claim is real: a pre-Union wreck with an intact cargo of
antiquities and, more importantly, **a legal salvage title** — clean
money with a paper trail. You surface a year later as a new person:
new name, a bought hull, and a list.

The list, assembled slowly through the midgame:

- **The captain who didn't stop** — whoever held the conn on the
  Solicitude that day.
- **The owner who gave the order** — House Cavanagh, Meridian: the
  Solicitude wasn't passing by chance; she was *checking her work*.
- **The official who buried it** — the Union inspector who logged the
  Magpie lost-with-all-hands without an inquiry, for a fee.
- **The broker who sold the route** — the Magpie was ambushed because
  someone sold her manifest and course. Syndicate-adjacent, Haven's
  Folly.

And the turn: the Magpie wasn't hauling ore. She was hauling
**the Ember** — a prototype self-catalyzing drive core, a thing that
makes fuel almost free — being smuggled *out* of Cavanagh's labs by an
idealist on your old crew. The ambush was retrieval; the pass-by was
confirmation of kill; the cover-up was policy. Everyone on your list
was protecting the most valuable secret in the sector. And the Ember
was never recovered — it's still out there in the Magpie's unfound
aft section, which means the endgame is a race back to the wreck.

Final choice, when the Ember is in your hold and everyone is at your
door: **sell it** (to Cavanagh, to the Syndicate, to the Union —
riches, and the world stays as it is), **destroy it** (revenge
completed, nothing built), or **open it** — broadcast the schematics
on every open channel, the Foyle ending: fuel scarcity, the thing this
whole economy runs on, ends. The common man handed the fire.

---

## Act structure and the bones each act uses

### Act I — the wound (prologue, ~30–40 min)

A scripted alternate opening, replacing `intro.ts`'s prologue when the
player picks this campaign at new game. Beats:

1. **One working leg aboard the Magpie.** Tutorializes dock → cantina
   → market → burn using the existing loop but from the crew deck: the
   player does the jobs, someone else is captain. Two named shipmates
   get real scenes (one is the idealist smuggling the Ember — seed it
   invisibly: she's nervous, she pays a dockhand, she won't open one
   crate). Uses: shipwalk deck, crewtalk, barks, one market visit.
2. **The ambush.** A scripted combat the player *loses on rails* —
   or rather, a combat where the win condition is "survive three
   rounds," using the existing combat screen so it feels like the real
   system, then the boarding cutscene. Uses: `combat.ts` with a
   scripted encounter, damagecontrol for the aftermath.
3. **The derelict days.** Small survival vignette in the wrecked slice
   of the ship — the walk deck re-dressed with debris, days ticking,
   one meaningful choice per day (burn the books for heat vs. keep
   them; open the sealed crate the idealist died guarding — this is
   where the player *sees* the Ember without knowing what it is).
   Ends with the Solicitude pass — full-screen scene, registry lights,
   the burn-away. This is the frame the whole game hangs on; spend the
   art budget here (one bespoke backdrop, the combat-nebula treatment).
4. **Foundry, bonded.** Time-compressed montage of under-deck labor
   (Kord already exists and already runs bonded debt — he is *already
   our jailer*, no new villain needed). Solt's education plays as
   4–5 dialogue scenes gated by "weeks pass" cards, each teaching a
   real mechanic (she explains standing, the ledger, factions — the
   tutorial *is* the Faria scenes). Her coordinates + death + escape.
5. **The claim.** First real free flight: a borrowed junker, one fuel
   load, the deep-band coordinates. The salvage scene pays out the
   title + seed money. Cut to: **one year later**, character screen,
   pick your new name, buy your hull. The sandbox opens.

Everything after this point is the open game. The campaign's job from
here on is to *knock* (per CORE_LOOP's de-railroading rule) — cards,
rumors, sightings — never to summon.

### Act II — the mask and the list (the long middle, 60–80% of play)

This is where "manning a spaceship for a good chunk of the game" is
structurally guaranteed: **every revenge track requires the player to
be a working captain first.** Cover isn't a costume, it's a P&L.

The four targets, each taken down through a *different existing
system*, Monte Cristo style:

**Target 1 — the captain (the personal one).**
The Solicitude still flies. Finding her current master is detective
work through the systems we have: the used market's provenance
("this emitter came off the Solicitude after her refit at Petrov's
yard" — the parts-with-stories system is literally an evidence
trail), harbor gossip bought with port standing, the Foundry
bookmaker who takes bets on arrivals. The confrontation is the
campaign's one mandatory ship combat — but the captain, found, turns
out to be a hollowed-out drunk who has been waiting years for someone
off the Magpie to come. He gives you the first piece of the turn:
*"We were ordered to confirm and leave. I asked whose order. I flew
freight scows the rest of my life for asking."* The player chooses:
kill him, ruin him, or leave him to it — the first mercy/spite fork,
and disposition + the ledger witness it.
- Bones: usedmarket provenance, portStanding rumor gating, travel
  tailing events, one combat encounter, disposition/ledger.

**Target 2 — the inspector (the legal ruin).**
A Meridian customs official. You don't shoot bureaucrats; you *audit*
them. The track is evidence-gathering hauls: carry the right cargo
through his lanes to bait him into a recorded shakedown, buy his
ledger from an under-deck fence, flip a clerk with standing. The
existing `worldMemory` ledger and witness system is the mechanical
spine — the campaign finally gives the ledger a starring role. The
payoff scene: hand the file to the incorruptible **Customs Assessor**
(already on the STATION_IDENTITY backlog as "the anti-Vance" — this
campaign is her reason to exist). Watching an honest official
destroy a corrupt one on your evidence, while you stand there as an
anonymous freight captain, is the Monte Cristo *feeling*: the hand
that moves the piece is never seen.
- Bones: ledger/witness, portjobs, portStanding, the Assessor NPC
  (backlog item, now load-bearing).

**Target 3 — the broker (the economic ruin).**
Haven's Folly, Syndicate-adjacent — the fence who sold the Magpie's
route. You ruin him the way Monte Cristo ruins Danglars: through the
market. He runs a route-intelligence business; you feed it poison.
Sell him falsified manifests (a new job type on the auction floor),
stake rival fences, use station moods (boom/shortage) to bankrupt the
positions he takes on your fake intelligence. Factor Sur — who values
order over law — becomes the instrument: convince *her* he's bad for
business and the Syndicate retires him itself. Optionally, buy his
debts through the auction floor and call them, the purest Dumas move
available in our economy.
- Bones: market + station moods, auction floor / usedmarket, Factor
  Sur (already shipped), disposition.

**Target 4 — the house (the summit).**
House Cavanagh, Meridian Prime — the owner, the order-giver, the
"corporate liaison" slot from the identity backlog made into a full
antagonist: polished, philanthropic, genuinely gracious, and the
person who said *confirm and leave*. She cannot be shot, audited, or
bankrupted from outside — she's too big. The track is the long social
climb: white-glove Meridian charters, prestige threshold, dinner
invitations — until you are inside her circle *as yourself-the-mask*,
exactly Monte Cristo in the Paris salons. And here the campaign
plants its emotional landmine: her son/daughter is decent, likes the
player, and is the *innocent standing in the blast radius* (our
Mercédès/Albert). The final leverage against the house is the Ember
— which is why Act III's race starts from her drawing room, when the
player finally understands what the Magpie was carrying and realizes
Cavanagh never stopped looking for the aft section either.
- Bones: prestige, VIP charters, disposition, the Meridian identity
  sheet (Lighthouse, liaison), agenda-beat-style scene scheduling.

**The mask under strain.** Through Act II, a light **Mark** system:
the prologue leaves the player a visible burn-scar (our tiger
tattoo). It's a portrait state. When the player takes spite options,
rage-kills, or stands in the same room as a target, the mark reddens
in the portrait and NPCs bark on it ("you all right, Captain? You've
gone..."). It costs almost nothing (portrait tint + bark conditions)
and it externalizes the campaign's real meter: **how much of the old
you is left.** Crew are the mirror — high-trust crew get scenes
questioning the obsession (the agenda-beat system is built for
exactly this), and the endgame's mercy options are gated not on
stats but on whether *anyone aboard* has the standing to talk you
down. A player who crewed lean and burned trust arrives at the end
alone with the list — and gets the endings that implies.

### Act III — the Ember (endgame, 2–4 hours)

Triggered when the fourth track completes (or earlier if the player
shortcuts — every track drops hints about the cargo). Beats:

1. **The turn revealed.** The full picture: the idealist crewmate,
   the theft, why the Solicitude *had* to confirm the kill. The wound
   re-opens differently — you weren't passed by out of indifference;
   you were murdered by policy. Somehow worse.
2. **The race to the aft section.** The deep band, hard fuel math, no
   ports — the ranging pillar as endgame terrain. Cavanagh's recovery
   ship, a Syndicate claim-jumper, and a Union monitor all converge:
   three factions the player has spent the whole game accruing
   standing/disposition with, and all of it *cashes in here* — high
   Syndicate standing turns the claim-jumper into an escort; the
   Assessor's gratitude stalls the monitor; and what's left is fought
   in the game's climactic combat, with crew gambits as the tools.
3. **The choice.** Ember in hold, everyone on comms:
   - **SELL** — to any of the three factions. Rich beyond the game's
     economy; epilogue notes what the buyer does with it. The Dantès-
     who-stays-bitter ending.
   - **BURN IT** — into a star, with the list all crossed off. The
     revenge-complete, world-unchanged ending; the mark never fades.
   - **OPEN IT** — broadcast the schematics sector-wide. The Foyle
     ending: the epilogue rewrites fuel prices at every port, Bev's
     stall thrives, the co-ops stop bleeding, House Cavanagh's stock
     is a memory, and the game's sandbox is *permanently, visibly
     cheaper to roam* — the reward for the selfless ending is that
     the toy gets better. (Post-campaign play continues; this is the
     one ending that upgrades the sandbox instead of closing it.)
   - Mercy variants on each, gated by crew trust and prior mercy
     forks: whether Cavanagh's heir survives the house's fall, whether
     the drunk captain is at the broadcast to hear his name cleared.

---

## What already exists vs. what must be built

**Reused wholesale** (no changes, just content pointed at them):
trade/jobs loop, combat + gambits, travel events, prestige, factions
and disposition, port standing + set-dressing marks, ledger/witness,
usedmarket provenance, crew trust + agenda beats, the walk decks, the
conductor rule (this campaign holds its breath during the Run and
vice versa — it's a fourth arc alongside grey coat / Silence /
Reckoning, and per the conductor rule their set-pieces never overlap).

**Existing backlog items this campaign promotes to load-bearing**
(they were worth building anyway; now they have a plot):
- Customs Assessor (Meridian) — Target 2's payoff.
- Corporate liaison (Meridian) — becomes House Cavanagh's face.
- Under-deck bookmaker (Foundry) — Target 1's rumor source.
- The fence (Haven's Folly) — becomes Target 3.
- Parts with provenance — Target 1's evidence trail.
- Station moods — Target 3's weapon.

**Genuinely new, in build order:**
1. **Campaign-select at new game** + the Act I scripted prologue
   (biggest single lift: one bespoke derelict walk-dress, the
   Solicitude scene art, the Foundry montage cards, Solt's five
   scenes). Everything downstream is sandbox-shaped.
2. **The list UI** — a captain's-log page tracking targets, evidence,
   and leads. It's the campaign's quest log and its mood board; the
   crossing-out of a name should feel ceremonial.
3. **Evidence as inventory** — a lightweight `evidence[]` on state
   (id, source, target, weight), written by ledger verbs, read by
   confrontation scenes. The DSL needs maybe two new verbs
   (`evidence`, `confront`).
4. **The Mark** — portrait tint state + bark condition + a counter
   moved by spite/mercy choices. One day of work, most of it art.
5. **Four target tracks** as arc-DSL content (the reference pattern
   in `arc.ts` already shows the shape: staged cards that appear at
   the right port at the right stage).
6. **Act III** — the race scenario + three-way endgame + epilogue
   variants, including the OPEN-ending world-patch (fuel price
   multiplier + a handful of port-mark rewrites).

## Why this fits this game

The campaign never fights the sandbox — it *is* the sandbox with a
knife hidden in it. Hauling freight builds the cover. Standing buys
the rumors. The used market is the detective. The ledger is the
courtroom. Crew trust is the conscience. And the ending choice is
about the one resource the whole game runs on — fuel — so the finale
is a referendum on the world the player has spent fifty hours paying
to cross. Bester's best idea was never the jaunting; it was that the
gutter man, transformed by rage, ends holding the thing the powerful
built their power on — and gives it away. That idea flies fine at
sub-light.
