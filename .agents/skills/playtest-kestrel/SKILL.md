---
name: playtest-kestrel
description: Play and test The Kestrel Run in a browser like a real player — drive the ship UI, walk the decks, run trade, trigger travel events, and fight full combats headlessly via the dev server. Use when asked to playtest, verify a campaign/encounter end to end, feel-test game balance, or reproduce an in-game bug.
---

# Playtesting The Kestrel Run

The game is a browser TypeScript app (Vite). It exposes debug accessors on
`window`, and every onclick-driven UI action goes through one dispatcher —
`window.dispatch(action, args)` — so you can play it end to end from the
browser MCP tools without clicking a single button.

> To **see** what the game renders (screenshots hang in the preview browser),
> use the **see-the-game** skill — `window.__shot()` → `.shots/latest.png` →
> Read. This skill is about DRIVING the game; that one is about SEEING it.

## 1. Launch & reset

```
preview_start { name: "game" }            # starts vite (see .Codex/launch.json), opens tab "seed"
```

Reset to a clean slate (the save lives in localStorage):

```js
localStorage.removeItem('kestrelrun'); location.reload();
```

After any source edit, Vite HMR reloads the page — it will re-run boot, and
with no save that pops the **intro modal**. Dismiss or drive it (see §4).

## 2. Jump to any point in the game: scenarios

`window.__scenario(name)` rebuilds the save at a known state and returns a
confirmation string. `__scenario()` with no arg lists all presets:

- `fresh` — clean start, docked Solace, 500cr (prologue skipped)
- `trader` — day 14, 2 cargo holds, pilot+mechanic, 1,800cr
- `fighter` — day 20, 2×weapons + shields + armory, gunner, engine Mk-II
- `silence` — day 17: the Broadcast fires on the next day tick
- `arc` — 12★, day 30, kitted: the grey-coat hook is live at Solace
- `run` — THE RUN in progress (arc stage 5, 14-day deadline, provisioned)
- `reckoning` — Voss arc resolved + broadcast: Tribunal threads live

Source: `src/debug/scenarios.ts`. Add presets there when a new phase needs
repeatable testing.

## 3. The two accessors you always need

- `window.__S()` → the live `GameState` object (read anything: `credits`,
  `fuel`, `food`, `hull`, `day`, `loc`, `docked`, `travel`, `crew`, `jobs`,
  `modules`, `cargo`, `flags`, `disposition`, `campaign`, `logLines`, …).
- `window.__modal()` → **define this yourself first** (below). It is the ONLY
  reliable way to know if a modal is actually open.

### CRITICAL: the modal probe

`closeModal()` only removes the `.show` class from `#overlay`; it leaves the old
HTML sitting in `#modal`. So `document.querySelector('#modal h2')` returns
**stale text even when no modal is up**. Always gate on the overlay class:

```js
window.__modal = () => {
  const ov = document.getElementById('overlay');
  if (!ov.classList.contains('show')) return null;          // <-- the real signal
  return {
    h2:  (document.querySelector('#modal h2')||{}).textContent,
    body:[...document.querySelectorAll('#modal p')].map(p=>p.textContent).join(' '),
    btns:[...document.querySelectorAll('#modal .choices button')].map(b=>b.textContent.trim()),
  };
};
```

To click a modal choice: `document.querySelectorAll('#modal .choices button')[i].click()`.

## 4. The action API — `window.dispatch(action, args)`

Handlers used to be individual `window.<name>(...)` globals; they now live in
`src/dispatch.ts`'s action table, and the ONE thing still on `window` for this
surface is `dispatch`. Call as `window.dispatch('<name>', [arg1, arg2, ...])`
— e.g. `window.dispatch('buyFuel', [10])`, `window.dispatch('nav', ['ship'])`.
(Dev/debug accessors below in §3 — anything `__`-prefixed — were never part of
this and stay bare globals: `window.__S()`, `window.__scenario(...)`, etc.)

The important actions:

- **Navigation**: `nav` (arg: `'ship'|'map'|'stationwalk'|'shipwalk'|'travel'`), `ptab` (arg: tab).
- **Provisioning / trade** (docked): `buyFuel(n)`, `buyFood(n)`, `buyGood('ore'|'med'|'lux', n)`, `sellGood(g,n)`, `buyMod(type, mark)`, `sellMod(idx)`, `upgradeEngine()`, `buySlots()`, `repairShip()`, `repairSystems()`.
- **Market**: read `__S().market` for `missions`, `recruits`, `prices`, `rumors`. `acceptMission(i)`, `hire(i)`.
- **Travel**: `depart(destId)` then `advanceDay()` per day (or `waitDay()` in port).
- **Combat**: `startCombat(enemy, onWin, onEscape)`, `cAct(action)`, `endCombat()`.
- **Prologue** (DEAD RECKONING): `introStart()`, `introAct(key)`.

Each of the above is one action name — call it via
`window.dispatch('<name>', [<args>])`.

Planet ids: `meridian foundry solace kestrel havens verge` (+ hidden `gate anechoic`).
Module ids: `fueltank cargohold cabin quarters hydro medbay weapons shields armory workshop smuggler luxcabin reactor`.

## 5. Walking the decks & stations (3D view, 2D simulation)

The visible walk screen uses a Three.js third-person presenter when WebGL is
available and falls back to canvas otherwise. Harness coordinates and behavior
remain entirely 2D and unchanged.

Walk screens (`shipwalk`, `stationwalk`) render to a `<canvas>` and run their own
rAF loop. Two debug helpers bypass the sprite movement:

- `window.__walkGoto(x, y)` → teleport (bypasses collision) and re-scan for the
  nearest door/actor.
- `window.__walkPos()` → current `{x,y}`.
- `window.dispatch('walkInteract')` → fire the nearest door/actor (same as
  pressing **E**).

So to trigger a room: `__walkGoto(cx, cy); dispatch('walkInteract');`

**Station room centers** (world is 1000×700; `src/ui/stationwalk.ts`):
`harbor ~765,115 · concourse ~690,375 · market ~385,295 · cantina ~150,165 · docks ~550,595 · drydock ~870,610 · undercity ~205,615`.
Doors into services: harbormaster/cantina/exchange/drydock sit at the bottom
edge of their room; the docks room has *Board your ship* and *Departure board*.

**Ship interior** (`src/ui/shipwalk.ts`): cockpit is at the left (~135,335),
engine room is far right — its x depends on how many module bays you have:
`engineX = 30 + 210 + 230 + bays*230`, center `≈ engineX+105, 320`. Prologue
repair/EVA doors live in the cockpit or engine room per stage.

## 6. Travel events — two kinds, watch the log not just modals

`advanceDay()` rolls a travel event ~42% of days (`src/systems/events.ts`
`rollEvent`). Two shapes:

- **Decision events** open a modal (pirates, patrol-with-contraband, distress,
  trader, passenger offer). Handle via `__modal()` + button click.
- **Auto-resolve events** just push to `logLines` and apply (meteor, breakdown,
  salvage, quiet-bark, clean patrol scan). No modal — a solo/clean captain sees
  a lot of these as pure log flavor.

So after each `advanceDay()`, check **both** `__modal()` **and**
`__S().logLines[0].m`. A day with no modal is NOT necessarily a quiet day.

Loop pattern:

```js
window.dispatch('depart', ['verge']);
for (let i=0;i<12;i++){
  const s=window.__S();
  if(!s.travel){ /* arrived */ break; }
  window.dispatch('advanceDay');
  const m=window.__modal();
  if(m){ /* a decision event / arrival — handle it, then break or continue */ break; }
  // else read s.logLines[0] for the auto-resolved beat
}
```

## 7. Combat — a phased timing duel

`startCombat` builds a modal with phases `command → target → aim → over`. Drive
it with `dispatch('cAct', [...])`:

1. `cAct('move:laser')` (or `torpedo`/`ion`/`evasive`/`flee`/`bribe`). Weapons
   moves go to the target phase; `evasive`/`flee`/`bribe` resolve immediately.
2. `cAct('target:<id>')` — pick a hostile (ids 0=Lead, 1=Escort, 2=Screen; a
   Corsair/heavy spawns escorts).
3. `cAct('aim')` — starts the reticle. **Timing matters**: `aimScore` reads
   `Date.now()` vs `aimStart` and follows a fixed Lissajous path; you fire when
   the reticle crosses the randomly-placed target box.
4. `cAct('release')` — fires. Grade = wild/glancing/solid/perfect by accuracy.
5. When `result` is set, `cAct` is replaced by a **Continue** button →
   `endCombat()` (which runs the onWin/onEscape callback, or game-over on death).

**Timing across MCP calls fails** — seconds pass between separate tool calls, so
a separate `aim` then `release` almost always reads as a *wild shot*. To fire
well, do it in ONE synchronous block with a busy-wait to the optimal instant:

```js
// after dispatch('cAct',['move:laser']); dispatch('cAct',['target:0']); dispatch('cAct',['aim']);
const box=document.querySelector('.aim-box');
const bx=+box.style.left.slice(0,-1)*1||parseFloat(box.style.left), by=parseFloat(box.style.top);
const aim=1.02; // scenario.aim — see SCENARIOS; or just try ~1.0
const speed=1.12*aim, win=36; // laser; torpedo speed 1.45/win 27; ion 0.92/win 46
const score=el=>{const x=50+Math.sin(el*speed*3.1)*38,y=50+Math.sin(el*speed*2.2+1.7)*25;return Math.max(0,1-Math.hypot(x-bx,y-by)/win);};
let best=0,bt=0.2; for(let el=0.2;el<3;el+=0.005){const s=score(el); if(s>best){best=s;bt=el;}}
const t0=Date.now(); while(Date.now()-t0 < bt*1000){}   // busy-wait
window.dispatch('cAct', ['release']);
```

Note: because the box is random but the reticle path is fixed, some boxes cap
below a perfect lock even at the ideal instant — that's expected.

## 8. Crew-gap damage control (minigames when a specialist is missing)

Travel hazards WITHOUT the right crew open interactive modals instead of
auto-resolving (`src/systems/damagecontrol.ts`, dispatch actions `dcValve`/
`dcVector`/`dcCare`):
- **No mechanic** + breakdown → valve-guessing scramble (wrong = −hull −fuel,
  repeat until right).
- **No pilot** + meteor swarm → pick 1 of 3 vectors; wrong = big hull hit +
  25% module damage.
- **No med bay** + sick passenger → pay −3 food −25cr for a 60% cure, or eat
  the half-fare.
With the specialist aboard these stay one-line log events. When playtesting
travel legs, remember a crewless ship now stops on modals for these.

## 9. Balance / feel notes learned (verify, don't assume — may drift)

- Weapons bay is 600cr; a fresh captain (500cr) can't afford one until after a
  cargo run — early combat is flee/bribe territory by design.
- A lone Pirate Corsair (55 hull) no longer brings an escort (escorts start at
  60 hull / gunship-class) — it's winnable with 2 weapons bays and good aim.
  The pirate hail shows an "OUTGUNNED" tell on the fight button when
  `stats().dmg * 4 < enemy hull`.
- The combat aim box always spawns ON the reticle sweep path now — a perfect
  lock is always physically possible.
- Medicine bought cheap on Meridian (~32) sells ~55 at Verge — a real,
  intended arbitrage; long hauls are where the money and the risk both live.
- Named recruits (the twelve, `content/characters.json`) surface in their home
  cantinas; hiring sets `char_<key>`. Ada Nnamdi is a walking patrol landmine
  (union_deserter) — great for drama testing.

## 10. Always finish with

- `read_console_messages { onlyErrors: true }` — confirm no runtime errors.
- Report state deltas from `__S()` (credits/hull/fuel/prestige/disposition) and
  quote the log lines that fired, so the human sees what actually happened.
