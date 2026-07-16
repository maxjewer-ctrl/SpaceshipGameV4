---
name: playtest-kestrel-unity
description: Playtest The Kestrel Run Unity WebGL build in a browser. Use when asked to live play, verify movement, inspect the ship deck, test module rearranging, check save/load persistence, or exercise window.kestrel browser commands.
---

# Playtest Kestrel Unity

## Workflow

Build the local player with `scripts/unity.ps1 build-web-dev`, then serve it with `scripts/unity.ps1 serve-web`. Open `http://127.0.0.1:5174`.

Use the browser console bridge:

```js
window.kestrel.ready
window.kestrel.command("loadScenario", { scenario: "fresh", seed: 8919 })
window.kestrel.command("loadScenario", { scenario: "trader", seed: 424242 })
window.kestrel.command("movePlayerToSlot", { slot: 3 })
window.kestrel.command("swapModules", { slotA: 1, slotB: 2 })
window.kestrel.command("save")
window.kestrel.command("load")
window.kestrel.state()
```

Also use real input: WASD to walk, Shift to sprint, and E to interact near prompts.

## Pass Criteria

Confirm the WebGL build loads without console errors, the deck renders, the player moves through cockpit/corridor/modules/engine, module labels update after swapping, and save/load preserves the current ship state.
