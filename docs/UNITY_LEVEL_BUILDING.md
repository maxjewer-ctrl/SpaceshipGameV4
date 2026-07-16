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

## Authoring Rules

- Keep gameplay state and deterministic rules in `Kestrel.Sim`.
- Keep Unity input, cameras, GameObjects, bridge code, and presentation in `Kestrel.Game`.
- Give every module bay one stable integer slot matching the save model.
- Use `Kestrel > Level > Validate Open Level` before committing hand-built scene changes.
- Keep scene and prefab files text-serialized with visible meta files.

## Current Slice

The current scene is generated at runtime by `ShipDeckRuntime`. It creates 6-bay and 8-bay layouts, an over-the-shoulder player controller, module sockets, a captain console interaction, save/load, and the browser bridge. Replace generated rooms with hand-authored prefabs incrementally while preserving the socket IDs.

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

Recommended next task:

Create the first hand-authored ship interior prefab set:

- Keep slot IDs stable and contiguous.
- Start with the 6-bay hull.
- Replace generated floor/wall cubes with authored room prefabs.
- Keep `ShipDeckRuntime` as the orchestrator until prefab loading is tested.
- Add validation for missing socket transforms, duplicate slots, missing
  colliders, and missing interaction anchors.

Before handing off or committing, run:

```powershell
scripts/unity.ps1 sim-test
scripts/unity.ps1 unity-test
scripts/unity.ps1 build-web-dev
scripts/unity.ps1 verify
npm run ci
```
