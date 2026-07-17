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
| Live WebGL acceptance | Complete | 13/13 checks, including captain, lane-event, and named-checkpoint persistence, with evidence under `.shots/unity/latest/` |
| Resumable playtest checkpoints | Complete | Named WebGL checkpoints preserve the full portable v16 state, including pending encounters |
| Captain appearance parity | Complete | All three browser model IDs are Unity-native, player-selectable, and persisted in v16 saves |
| Browser RNG parity | Complete | Unity uses browser-compatible Mulberry32 and pins all scenario `rngState` values |
| First random lane event | Complete | Weighted Tinker Barge selection, buy-food/decline choice UI, travel pause, and resolved save/load |
| Full browser v16 save parity | In progress | Unity persists the bounded portable subset plus appearance, RNG, travel-event, and upkeep state |
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

Use the **Playtest checkpoints** controls to save and resume named points. The
same operations are available to automated playtests:

```js
window.kestrel.command("saveCheckpoint", { name: "before-tinker-choice" })
window.kestrel.command("loadCheckpoint", { name: "before-tinker-choice" })
window.kestrel.command("deleteCheckpoint", { name: "before-tinker-choice" })
window.kestrel.state().playtestCheckpoints
```

Checkpoint names are normalized to lowercase slugs and remain in browser local
storage across WebGL reloads and rebuilds. Keep durable screenshot evidence
under `.shots/unity/playthroughs/<date>/`.

## Next transfer slice

Port the Distress Signal as the second bounded lane event. Pin both player
choices and the seeded rescue payout before bringing over its delayed guild
echo; keep the scheduler consequence separate until its trace is explicit. In
parallel with that gameplay transfer, the next presentation pass remains the
diegetic HUD described in `UNITY_VISUAL_UPGRADE.md`.
