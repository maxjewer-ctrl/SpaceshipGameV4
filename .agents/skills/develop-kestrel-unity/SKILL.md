---
name: develop-kestrel-unity
description: Develop and maintain The Kestrel Run Unity port. Use when changing files under unity/, adding Unity gameplay, editing Kestrel.Sim, creating ship levels, updating Unity build scripts, or deciding whether logic belongs in pure simulation versus Unity presentation.
---

# Develop Kestrel Unity

## Workflow

Start with `scripts/unity.ps1 doctor` when Unity setup is uncertain. Use `scripts/unity.ps1 setup` after changing editor setup, scenes, build settings, or WebGL template files.

Keep deterministic game rules in `unity/Assets/Kestrel/Sim`. This assembly must not reference UnityEngine. Keep input, GameObjects, camera, interaction prompts, WebGL bridge, and presentation in `unity/Assets/Kestrel/Game`.

Use `docs/UNITY_LEVEL_BUILDING.md` as the level-authoring contract. Preserve stable module socket IDs; slots must be contiguous from `0`.

## Checks

Run `scripts/unity.ps1 sim-test` for pure C# changes. Run `scripts/unity.ps1 unity-test` after changing Unity runtime, editor tooling, scene setup, input, or interactions. Run `npm run ci` when shared repo behavior or browser legacy files are touched.

## Boundaries

Do not mix gameplay redesign with porting work. Preserve current save version `16` until a deliberate migration changes it. Keep the TypeScript browser game working during the Unity transition.
