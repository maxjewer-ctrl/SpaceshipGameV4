# Cross-language porting contract

The browser game remains the behavior oracle until a Unity slice passes the
same deterministic contract. A Unity feature is not considered ported because
it has a C# type with the same name; it is ported when browser-derived fixtures
and an end-to-end Unity acceptance flow both pass.

## Parity levels

1. **Projection parity** — the portable fields needed by the current Unity
   slice match for every deterministic browser scenario.
2. **Action parity** — the same input produces the same portable state change.
3. **Trace parity** — a sequence of simulation ticks produces the same
   canonical hashes and final state.
4. **Playable parity** — the Unity presentation can drive the same loop and
   persist it through save/load.

The first two levels are active now. `test/porting-parity.test.ts` derives
`test/porting/fixtures/scenario-projections.json` from the real browser scenario
loader. `unity/Kestrel.Sim.Tests/SimTests.cs` reads that same fixture and checks
all seven C# projections plus the first module-swap action.

Regenerate the projection only for an intentional browser behavior change:

```powershell
$env:UPDATE_PORTING = "1"
npx vitest run test/porting-parity.test.ts
Remove-Item Env:UPDATE_PORTING
```

Review the fixture diff before committing it. A fixture update and its matching
C# implementation belong in the same change.

## First playable loop

The first Unity-owned vertical slice is deliberately narrow:

1. Load `fresh` seed `8919`.
2. Accept the Foundry calibration contract at the captain console.
3. Depart Port Solace for Foundry.
4. Advance three deterministic travel days.
5. Dock, receive 240 credits and one prestige, and clear the job.
6. Save and reload the completed run.

Random lane events, generated markets, campaign scheduling, and crew modifiers
remain browser-owned. They should enter C# one bounded vocabulary at a time,
with trace fixtures added before presentation work.

## Boundaries

- `Kestrel.Sim` contains deterministic state and rules and never references
  `UnityEngine`.
- `Kestrel.Game` owns input, cameras, prompts, GameObjects, and the WebGL bridge.
- Browser JSON remains content authority until an explicit migration changes it.
- Save version stays `16`; the Unity save is a portable subset and must not be
  advertised as a byte-compatible browser save until the full schema migrates.
