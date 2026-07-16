# Unity port status

Updated 2026-07-16. The durable progress measure is proven playable behavior,
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
| Live WebGL acceptance | Complete | 8/8 checks, including captain persistence, with evidence under `.shots/unity/latest/` |
| Captain appearance parity | Complete | All three browser model IDs are Unity-native, player-selectable, and persisted in v16 saves |
| Full browser v16 save parity | In progress | Unity persists the bounded portable subset plus `appearance.model` |
| Tick-trace parity | Complete | Browser-derived starvation, payroll, recovery, and hydroponics traces pass in C# |
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

Port the first deterministic random lane-event kernel. Pin the browser event
selection and outcome trace for one bounded encounter, reproduce it in
`Kestrel.Sim`, and expose only the resulting decision and state through the
captain console and bridge. In parallel with that gameplay transfer, the next
presentation pass is the diegetic HUD described in `UNITY_VISUAL_UPGRADE.md`.
