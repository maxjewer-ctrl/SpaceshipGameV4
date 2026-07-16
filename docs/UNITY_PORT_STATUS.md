# Unity port status

Updated 2026-07-15. The durable progress measure is proven playable behavior,
not file count.

| Gate | Status | Evidence |
|---|---|---|
| Clean Unity baseline | Complete | `e2b0f35` on `codex/unity-transfer` |
| Pure simulation host | Complete | .NET tests and Unity `noEngineReferences` assembly |
| Browser scenario projection | Complete | Seven browser-derived scenario fixtures consumed by C# tests |
| First action parity | Complete | Fresh-scenario module swap matches the browser fixture |
| Authored six-bay ship | Complete | Resource prefab with slots 0–5, room colliders, anchors, cockpit, and engine room |
| Ship-interior visual read | Complete | Visual revision 3: command deck, framed spine corridor, paired furnished module rooms, ceiling lights, and visible drive core |
| Level contract validation | Complete | Socket count/order, duplicate IDs, transforms, colliders, room references, and console anchor |
| First contract/travel loop | Complete | Accept → depart → three days → arrive → pay → save/load |
| Repeatable automated gate | Complete | `scripts/unity.ps1 verify-slice` |
| Live WebGL acceptance | Complete | 6/6 checks, clean browser console, `.shots/unity/latest/live-acceptance.png` |
| Full browser v16 save parity | Not started | Unity currently persists the bounded portable subset |
| Tick-trace parity | Next | Port day upkeep and a quiet travel trace before random events |
| Stations, economy, combat, campaigns | Browser-owned | Move only after the preceding simulation vocabulary is pinned |

## Standard checkpoint

Run:

```powershell
scripts/unity.ps1 verify-slice
scripts/unity.ps1 serve-web
```

Then click **Run acceptance** in the development monitor. The same flow is
available from browser developer tools:

```js
await window.kestrel.runAcceptance()
```

Keep the resulting validation JSON, acceptance result, state, and screenshot
under `.shots/unity/latest/` while reviewing the change.

For visual reviews, the WebGL development monitor also exposes **Cockpit**,
**Midship**, and **Engine** inspection views. Treat all three as required visual
evidence for deck-layout or camera changes.

## Next transfer slice

Complete the deterministic day-upkeep kernel. Fuel burn, food consumption, and
arrival payment are now present; pin a browser trace for starvation and payroll,
then reproduce it in `Kestrel.Sim` before adding random lane events. Expose only
the resulting state through the existing captain console and bridge.
