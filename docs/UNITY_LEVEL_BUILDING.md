# Unity Level Building

This is the first-pass workflow for hand-building Kestrel ship interiors in Unity.

Use Unity `6000.4.2f1` for the current local project. The migration plan still prefers `6000.3.x LTS` once that editor is installed locally.

## Commands

- `scripts/unity.ps1 doctor`: verify Unity, .NET, and WebGL support.
- `scripts/unity.ps1 setup`: create or refresh the starter scene and WebGL settings.
- `scripts/unity.ps1 sim-test`: run the GitHub-safe pure C# tests.
- `scripts/unity.ps1 unity-test`: run Unity EditMode and PlayMode tests locally.
- `scripts/unity.ps1 build-web-dev`: build the local WebGL development player.
- `scripts/unity.ps1 serve-web`: serve the WebGL build at `http://127.0.0.1:5174`.
- `scripts/unity.ps1 verify-slice`: setup, C# tests, Unity tests, level report,
  WebGL build verification, and shared browser CI.
- The WebGL development player includes a **Run acceptance** monitor. It checks
  scenario load, authored state, module swapping, explicit save/load, the first
  contract/travel loop, and a nonblank canvas capture.

## Authoring Rules

- Keep gameplay state and deterministic rules in `Kestrel.Sim`.
- Keep Unity input, cameras, GameObjects, bridge code, and presentation in `Kestrel.Game`.
- Give every module bay one stable integer slot matching the save model.
- Use `Kestrel > Level > Validate Open Level` before committing hand-built scene changes.
- Keep scene and prefab files text-serialized with visible meta files.

## Current Slice

The six-bay scene now loads the authored
`Assets/Resources/Kestrel/Prefabs/KestrelSixBayDeck.prefab`. It owns stable
module sockets `0..5`, room colliders, interaction anchors, an integrated
command deck, and an engine room. Visual revision 9 uses a narrow central spine
with three port/starboard room pairs, procedural plated materials, recessed
floor/wall/ceiling layers, practical emissive lighting, service conduits,
observation windows, recognizable fuel/cargo/berth/workshop equipment, a framed
drive core, and a stronger bridge silhouette with a command arch, wing consoles,
glass glow, and holo displays. `ShipDeckRuntime` remains the
orchestrator. Larger 8/10-bay
deterministic scenarios still use prototype geometry until their prefabs are
authored. The prioritized upgrade backlog lives in
[`UNITY_VISUAL_UPGRADE.md`](UNITY_VISUAL_UPGRADE.md).

The starter scene now contains an editor-visible prefab instance under
`Kestrel Runtime/Kestrel Ship Preview`. Open the Unity project at the `unity/`
directory, not at `unity/Assets/Scenes/`. During Play Mode the preview is hidden
and replaced by the runtime-authored deck. If the preview is missing, run
`scripts/unity.ps1 setup`, reopen `KestrelShipDeck.unity`, select
`Kestrel Ship Preview` in the Hierarchy, and press `F` to frame it.

## Fresh Session Handoff

Current verified state:

- `scripts/unity.ps1 setup` syncs `src/content/modules.json` into
  `Assets/Resources/KestrelContent/modules.json`.
- `Kestrel.Sim` scenarios use browser module keys such as `cargohold`,
  `quarters`, and `hydro`.
- Unity labels module sockets from the synced browser content catalog.
- EditMode tests cover deck generation, browser-content parsing, and content
  coverage for Unity scenarios.
- PlayMode tests cover runtime player/socket spawning.

Current validation rejects missing/duplicate/non-contiguous socket IDs,
non-finite transforms, missing room colliders, missing interaction anchors,
missing room references, and a missing captain-console anchor.

Recommended next task: pin browser traces for starvation and payroll, then add
them to the existing fuel/food/arrival travel kernel. Author the eight-bay
prefab only after that trace passes, keeping visual expansion behind simulation
proof.

Before handing off or committing, run:

```powershell
scripts/unity.ps1 sim-test
scripts/unity.ps1 unity-test
scripts/unity.ps1 build-web-dev
scripts/unity.ps1 verify
scripts/unity.ps1 verify-slice
npm run ci
```
