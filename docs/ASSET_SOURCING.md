# Asset Sourcing — when to pay Meshy, when to download free

Written 2026-07-14. This document sets the rule for where a new 3D asset comes
from. Read it **before** adding a `scripts/meshy/manifests/*.json` entry or
running `npm run meshy:batch`. Meshy generations cost credits and ship with
4096px texture surprises that `scripts/meshy/shrink-texture.mjs` /
`shrink-models.mjs` exist only to clean up (see commit `0782ac9`: a raw batch
landed the bundle at 413MB). Free CC0 kits arrive game-ready. So the default is
**download**, and Meshy is the exception you justify.

## The principle

> Spend the Meshy budget on assets **no one else can have** — the things that
> are specific to this game's fiction. Everything generic is already modelled,
> free, CC0, and style-consistent somewhere. Download the barrels like everyone
> else.

A cargo crate is a cargo crate. The Kestrel is the Kestrel.

## The threshold — does this need a Meshy call?

Generate with Meshy **only if the asset clears all three gates**. If it fails
any one, source it free.

1. **Identity.** Is it a *named, specific* thing in the fiction that a player
   would recognise as unique — the player's ship, a player-captain body, a
   rostered crew member with a dossier (`docs/CREW_DOSSIERS.md`)? A generic
   instance ("a barrel", "a console", "a market stall") fails this gate.

2. **Findability.** Could ~20 minutes across Kenney + Quaternius + poly.pizza
   plausibly turn up *nothing* style-compatible? Generic sci-fi props fail this
   gate — crates, barrels, pipes, panels, chairs, generators, dishes, and
   antennae are the most-modelled objects in the free-asset world.

3. **Silhouette weight.** Does the camera actually dwell on it as a hero
   element, or is it set dressing at the edge of frame? Background dressing
   fails this gate — nobody inspects the topology of a barrel 15 metres away.

Practically: **characters and the ship pass; props almost never do.** If you
find yourself writing a Meshy prompt for a piece of furniture, stop.

## Where to get free assets

| Source | License | Notes |
| --- | --- | --- |
| [Kenney.nl](https://kenney.nl) — Space Kit, Sci-Fi RTS, Furniture Kit | **CC0** | Already the source for the `kenney-*.glb` in this repo. Uniform low-poly style, tiny textures, game-ready. First stop for props. |
| [Quaternius](https://quaternius.com) — Ultimate Space Kit, Sci-Fi packs | **CC0** | Another consistent low-poly library; good for ships, modular corridors, props. |
| [poly.pizza](https://poly.pizza) | **Mixed — check each model** | Indexes thousands of GLBs. Some are CC0, some **CC-BY** (attribution required, mostly the legacy Google Poly imports). Read the licence field on the model page before downloading; if CC-BY, log the attribution (see below). |

Prefer **CC0** so there is no attribution obligation. Only reach for a CC-BY
model when nothing CC0 fits, and record the credit.

## Licensing hygiene

- **CC0** requires no attribution, but still record provenance so we can prove
  the asset is free if the project is ever distributed or audited.
- **CC-BY** requires crediting the author. Keep a running credits list (a
  `CREDITS.md` at repo root, or a section here) with model name, author, source
  URL, and licence for every non-CC0 asset that ships.
- Never commit an asset whose licence you did not read. "It was on the internet"
  is not a licence.

## Naming + pipeline convention

- **Free-sourced props** keep a source prefix so provenance is legible at a
  glance: `kenney-*` already does this. Adopt `quaternius-*` and `poly-*` the
  same way. Bespoke assets stay unprefixed by source (`ship-*`, `cockpit-*`,
  `crew-*`, `captain*`).
- Free low-poly GLBs usually need **no** texture shrink — that pass exists for
  Meshy's oversized bakes. Run `npm run meshy:shrink` only if a downloaded asset
  actually ships a large embedded texture; most CC0 kits are already small.
- Drop free GLBs in `src/assets/models/` alongside the rest; `walk3d.ts` /
  `props3d.ts` load them by `new URL(...)` the same way regardless of origin.

## Current inventory — audit

Classified against the threshold. "Bespoke" = correctly Meshy-worth. "Generic"
= should have been (or should become) a free download.

| Asset group | Verdict | Reasoning |
| --- | --- | --- |
| `ship`, `cargo-hauler`, `cargo-shuttle` | **Bespoke** | The player's vessel and its silhouette are hero identity. Keep on Meshy. |
| `captain`, `captain-female`, `captain-alien`, `player-captain-*` | **Bespoke** | Player avatar. Keep. (Rig status: `crew-rigging-pilot` memory / `playerModel3d.ts`.) |
| `crew-ada` … `crew-vex` (14) | **Bespoke** | Named roster with dossiers; each is a specific character. Keep. |
| `cockpit-*` (breaker-panel, cable-tray, command-console, comms-radar-stack, overhead-lockers, navigation-holo) | **Generic** | Sci-fi cockpit dressing — abundant free. Candidates to replace with CC0. |
| `ship-*` room props (engine-core, hydro-planter, med-bed, shield-generator, smuggler-hatch, weapons-rack, workbench, lux-berth) | **Generic** | Module furniture; camera passes over them. Free-sourceable. |
| `station-*` props (auction-lot, cantina-booth, customs-podium, drydock, listening-array, market-kiosk, memorial-lighthouse, recycler-line) | **Mostly generic** | Booths, kiosks, podiums are generic. A couple (memorial-lighthouse) may carry station identity per `docs/STATION_IDENTITY.md` — judge individually. |
| `barrel-stack`, `cargo-crate`, `fuel-tank`, `beacon-lamp`, `mooring-post`, `satellite-dish`, `water-tower`, `windmill-turbine` | **Generic** | The textbook "download the barrels" case. Replace opportunistically. |
| `kenney-*` | **Already free (CC0)** | The pattern to follow. |

**Action, not a mandate to churn:** don't rip out working generic props for
their own sake — the credits are already spent. But **stop generating new
generic props**, and when a prop needs to change anyway (restyle, LOD, a broken
mesh), swap in a CC0 replacement instead of re-rolling Meshy.

## TL;DR decision line

```
New asset needed
  ├─ Named ship / player / rostered crew?  ── yes ──▶ Meshy (hero budget)
  └─ A generic prop / furniture / dressing? ─ yes ──▶ Kenney → Quaternius → poly.pizza (CC0 first)
```
