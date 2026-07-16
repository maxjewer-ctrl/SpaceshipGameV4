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

The first three levels are active now. `test/porting-parity.test.ts` derives
`test/porting/fixtures/scenario-projections.json` from the real browser scenario
loader. `test/porting-upkeep.test.ts` derives
`test/porting/fixtures/upkeep-traces.json` by running the browser's real day tick
through food shortage, missed payroll, recovery, and powered hydroponics.
`unity/Kestrel.Sim.Tests/SimTests.cs` reads both fixtures and checks all seven
C# projections, the first module-swap action, and every upkeep trace tick.
The scenario projection also pins the browser's `appearance.model` vocabulary;
Unity accepts exactly `explorer`, `female-explorer`, and `alien-explorer`, with
older or unknown values falling back to `explorer`.

`test/porting-lane-event.test.ts` pins the first bounded random encounter. The
browser's Mulberry32 seed `2` selects weighted pool index 13, the Tinker Barge,
and buying food changes 500cr/20 food to 470cr/30 food without advancing the
gameplay RNG again. Unity scenario construction also advances the identical RNG
stream by the browser-observed draw count, so each projected `rngState` matches.

Regenerate the projection only for an intentional browser behavior change:

```powershell
$env:UPDATE_PORTING = "1"
npx vitest run test/porting-parity.test.ts
Remove-Item Env:UPDATE_PORTING
```

Regenerate `upkeep-traces.json` the same way by substituting
`test/porting-upkeep.test.ts` in the command above.

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

The next deterministic vocabulary is also Unity-owned: docked and traveling
day ticks advance crew tenure, apply powered hydroponics output, consume one
ration per person, escalate and recover starvation, and make payroll. Four
starving days dismiss the last crew member; three missed payrolls dismiss the
first; six starving days end the run. These order-sensitive outcomes are pinned
to browser-derived traces.

The Tinker Barge's weighted selection, buy-food/decline outcomes, travel pause,
and Unity presentation are now portable. Other random lane events, remaining
Tinker trade options, generated markets, campaign scheduling, and advanced crew
modifiers remain browser-owned. They should enter C# one bounded vocabulary at
a time, with trace fixtures added before presentation work.

## Boundaries

- `Kestrel.Sim` contains deterministic state and rules and never references
  `UnityEngine`.
- `Kestrel.Game` owns input, cameras, prompts, GameObjects, and the WebGL bridge.
- Browser JSON remains content authority until an explicit migration changes it.
- Save version stays `16`; the Unity save is a portable subset and must not be
  advertised as a byte-compatible browser save until the full schema migrates.
- The portable subset includes `appearance.model`, and the in-game captain
  picker is required to persist it through rebuild, save, and load.
- The portable subset includes `rngState`, `travel.encountered`, and the current
  bounded `laneEvent`; unresolved travel cannot advance until the choice closes.
