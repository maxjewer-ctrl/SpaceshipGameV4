---
name: see-kestrel-unity
description: Capture and inspect what The Kestrel Run Unity WebGL build renders. Use when visual verification is needed for the Unity ship deck, camera framing, nonblank WebGL output, module labels, interaction prompts, or screenshot artifacts.
---

# See Kestrel Unity

## Workflow

Build and serve the WebGL player with:

```powershell
scripts/unity.ps1 build-web-dev
scripts/unity.ps1 serve-web
```

Open `http://127.0.0.1:5174`, wait for `window.kestrel.ready === true`, then call:

```js
window.kestrel.capture()
```

The capture returns a PNG data URL in `window.kestrel.lastCapture`. Store screenshots under `.shots/` when a task needs persistent visual evidence.

## Visual Checks

Verify the canvas is nonblank, the player is framed over the shoulder, labels do not dominate the view, and cockpit-to-engine traversal remains visible at desktop size.
