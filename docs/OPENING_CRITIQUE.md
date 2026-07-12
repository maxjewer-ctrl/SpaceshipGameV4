# THE OPENING — a hard look

Where the first hour pulls its punch, and what to do about it. Written after
playing the prologue and the early open game end to end (2026-07-11).
Items marked ✅ were addressed in the same pass as this document.

## What already works

The prologue (DEAD RECKONING) is a genuinely strong cold open: stakes before
systems, a named death the player inherits, choices that write to real ledgers.
The Solace arrival — debts before opportunities — is the right shape. Keep all
of it. The problems start *after* the prologue ends.

## Where it falls short

### 1. The handoff cliff ("YOURS NOW" → now what?) ✅
The prologue ends with +1 prestige and a pat on the shoulder, and the player
lands in an open game whose only visible horizon is **a number: 12★**. The
"giant adventure" is real — two campaigns and a conspiracy — but for the next
several hours the game *looks* like a freight spreadsheet.

**Fixed this pass:** the grey-coat woman is now a visible, unexplained
cantina fixture from day one — same table, same drink, other patrons shrug
when asked — and grows louder as prestige climbs past 8★, before the stage-0
meeting unlocks at 12★. The rumor pool now carries the three campaign hooks
as ambient noise (the Meridian anniversary, Verge's bad radio nights, Elysium
as a spacer's myth, "four seconds" heard and forgotten) long before any of
them fire for real.

### 2. Solo play is too frictionless ✅
Problems literally solved themselves: a coolant rupture or a meteor swarm was
one auto-resolved log line whether or not anyone qualified was aboard. That's
backwards — the fantasy is *needing* a crew. A ship run alone should feel like
running a restaurant alone during a dinner rush.

**Fixed this pass:** crew-gap damage control. No mechanic → the coolant
rupture is a valve-guessing scramble that vents fuel and chews hull until you
find the right one. No pilot → the meteor swarm is a manual-helm gamble. No
med bay → sick passengers demand food, credits and sleepless nights, or their
fare. Every minigame ends by telling you, in prose, exactly which hire would
have made it a footnote.

**Also fixed:** the captain now picks a pre-command specialty at game start
and can personally cover that one station — solving the "who's even flying
this thing on day one" problem — but at a cost: contracts pay 10% less while
they're still moonlighting below decks, and the star-map departure screen now
shows an explicit ⚠ warning card listing every uncovered role before you cast
off. The frustration is now a choice you can see coming, not an ambush.

### 3. Crew were interchangeable stat blocks ✅
`genRecruit()` names were random; hiring felt like buying a module with a
salary. No faces, no reasons to pick THIS pilot over that one, no politics
walking up your ramp.

**Fixed this pass:** the named twelve (docs/CREW_DOSSIERS.md,
content/characters.json) — two per role, spread across home worlds, each with
alliances, an honest or dishonest agenda, and a landmine or a gift. Hiring Ada
Nnamdi means flying a Meridian witness through Union scans. Hiring Miri Datta
means better margins and a Syndicate file on your routes. Recruitment is now a
narrative act. **Still to do:** agenda *beats* — the moments where those
agendas actually bill you or pay you (see roadmap).

### 4. Combat's first lesson was a corpse ✅
"Battle stations" vs a Corsair with starter gear was unwinnable *even with
perfect aim* (playtested: 3 perfect locks, 36/76 enemy hull down, own hull
80→18). The game taught "don't fight what you can't kill" by killing you.

**Fixed this pass:** (a) a lone Corsair no longer brings an escort — it's now
a hard-but-honest fight for a two-gun ship; escorts are reserved for true
warships (60+ hull / gunships / hunters); (b) the pirate hail now shows an
honest tactical readout — *"OUTGUNNED. This is how ships die."* — on the
Battle stations button when four good salvos can't crack the lead; (c) the
aim box now always spawns ON the reticle's sweep path, so a perfect shot is
never denied by dice.

### 5. The station walk is atmospheric but empty on first dock
Port Solace's deck is seven rooms and (usually) two or three NPCs. The
undercity — the best writing in the station set — has no reason to be visited
in the first hour; most players won't know it exists. The concourse says
"everyone passes through eventually" and contains nobody.

**Fix direction:** first-dock density. Vance should *summon* you (prologue
does this — keep that pattern for skip-prologue starts too). One undercity
hook in the first cantina visit ("Kord's paying for hands — down past the
berths, mind the dark"). Ambient walkers/vendor stalls on the concourse, even
non-interactive, would halve the emptiness at minimal cost.

### 6. The intro modal is a wall of text
The skip-path opening is four paragraphs into an input box. Functional, but
it reads like a manual, not a hook. The prologue solved this for its path;
the skip path deserves one strong image (the grey coat, the crate, the 12★
promise) instead of an economy briefing.

### 7. No sense of the sector's *scale of story* early
The Broadcast (day 18) is the first hint that the universe is stranger than
freight. Before that, nothing tilts. One early, cheap, non-interactive beat —
a preacher station reading names, a "no anomalies" report repeated too often,
Bapu humming four seconds the player can't place yet — would put the cold
draft under the floorboards from hour one. (Hiring Bapu now does exactly
this; see dossiers.)

## Priority order (pull-the-player-in per unit of work)

1. ~~Grey-coat visible at Solace + campaign-hook rumor track (#1, #7)~~ ✅
2. First-dock summons + undercity breadcrumb (#5) — small
3. ~~Agenda beats for the named twelve (#3 follow-through)~~ ✅ six of twelve;
   Ada/Brix/Elias/Tomas/Imogen/Bapu beats still open
4. Skip-path intro rewrite (#6) — trivial
5. Concourse ambient walkers (#5) — medium, graphics pass
