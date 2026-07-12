# Portrait key manifest

Drop portrait files in THIS folder as `<key>.png` (or `.webp`/`.jpg`) and the
dialogue UI picks them up automatically — no code changes needed (resolver:
`src/ui/portraits.ts`). Until a file exists, that character shows a styled
icon tile, so partial delivery is fine.

**Format:** square, ~256×256 works well (rendered at 76px, sometimes larger
later). Bust/head-and-shoulders framing, dark background reads best against
the CRT panel styling.

## The named twelve (crew — see docs/CREW_DOSSIERS.md for looks/vibe)

| key | who |
|---|---|
| `dez` | Dessa "Dez" Okonkwo — pilot, farm-raised, loyal/cautious |
| `vex` | Callum Vex — pilot, flash ex-racer, reckless/proud |
| `brix` | Brix Halloway — mechanic, Foundry prodigy, dreamer/stoic |
| `tomas` | Tomas — mechanic, freed (or not) bondsman, gentle/weary |
| `ada` | Sgt. Adaeze "Ada" Nnamdi — gunner, ex-Union marine, stoic/haunted |
| `rook` | Rook Vandermeer — gunner, ex-pirate, chatty/cynical |
| `imogen` | Dr. Imogen Hale — medic, atoning researcher, gentle/haunted |
| `corbin` | "Saint" Corbin — medic, undercity street-doc, chatty/gentle |
| `bapu` | Bapu Okafor — cook, generation-ship elder, devout/gentle |
| `nyla` | Nyla Sorrensen — cook, sharp survivor, greedy/loyal |
| `elias` | Elias Wren-Kohl — quartermaster, ruined auditor, proud/cautious |
| `miri` | Mirelle "Miri" Datta — quartermaster, Syndicate bookkeeper, chatty/greedy |

## Fixed characters

| key | who |
|---|---|
| `juno` | Juno Vale — prologue engineer, Foundry smelter decks, gruff/loyal |
| `voss` | Dr. Elara Voss — the woman in the grey coat (main arc) |

## Generic crew fallbacks (procedural hires, one per role)

`crew_pilot` · `crew_mechanic` · `crew_gunner` · `crew_medic` · `crew_cook` · `crew_quartermaster`

## Station NPCs (keys = their id in content/npcs.json)

| key | who |
|---|---|
| `harbormaster_vance` | Harbormaster Sela Vance — corrupt dockmaster |
| `refugees_aldren` | The Aldren family — man, woman, sleeping child |
| `dockboss_kord` | Dock Boss Kord — prosthetic arm, crate throne |
| `bonded_tomas` | Tomas at the recycler line (pre-recruitment) |
| `informant_wren` | Wren — cantina information broker |
| `organizer_yun` | Organizer Yun — quiet Frontier recruiter |
| `brother_calis` | Brother Calis — Church of the Open Door |
| `lieutenant_farr` | Lieutenant Farr — Union signals clerk |
| `survivor_ondine` | Ondine — Teller's Claim survivor |
| `advocate_reyes` | Advocate Ihsan Reyes — the Tribunal's counsel |
| `witness_marek` | Cpl. Ellis Marek — gunnery log-keeper in hiding |
| `witness_senn` | Dr. Halvard Senn — perpetrator with a good memory |
| `mr_grey` | Mr. Grey — the buyout fixer |

(If an npcs.json id differs from the above, the id in the JSON wins — the
resolver uses it verbatim.)
