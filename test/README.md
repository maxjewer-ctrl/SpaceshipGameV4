# The headless simulation harness

The automated regression net for The Kestrel Run (BETA_PLAN §4 Phase A). It
runs the **pure game logic in Node** — no browser, no WebGL, no DOM skeleton —
so it can gate every commit in CI in ~2 seconds.

This is deliberately *not* the same net as the browser skills:

- **`playtest-kestrel`** / **`see-the-game`** (`.claude/skills/`) drive and
  screenshot the real build. They are the interactive **feel/visual** net — a
  human or agent judges how the game plays and looks. Slow, needs a browser,
  not a pass/fail gate.
- **This harness** is the automated **stability** net — deterministic
  invariants that fail the build on a NaN, a negative resource, a soft-lock,
  or a broken migration, across hundreds of seeded runs.

They complement each other; neither replaces the other.

## What runs

| File | Gate |
| --- | --- |
| `scenarios.test.ts` | All 7 scenario presets build into a sound state (the entry points the whole game leans on). |
| `fuzz.test.ts` | Each scenario × 40 seeds × 40 in-game days: never NaN, negative, throws, or soft-locks. Failures print the exact `scenario/seed/day` so the bug reproduces from the seed. |
| `migration.test.ts` | A v1 (unversioned) save and every intermediate version migrate forward to a sound, playable state; migration is idempotent. |
| `golden.test.ts` | **Behaviour, not just liveness.** Each scenario × 4 fixed seeds × 30 days must reproduce a byte-identical state trace, pinned in `golden/fixtures/`. |

## Liveness vs. behaviour — why there are two nets

`fuzz.test.ts` proves the sim never *breaks*: no NaN, no negative fuel, no
soft-lock. That is a **liveness** net, and it would happily pass a refactor that
quietly changed every damage roll in the game — as long as the numbers stayed
positive.

`golden.test.ts` is the **behaviour** net. It pins the exact sequence of states
a given `(scenario, seed)` produces, so a change to the sim shows up as a diff
at an exact in-game day instead of as a vibe six weeks later. This is what makes
re-implementing `src/systems/` in another language survivable (see
`docs/PORTING.md`): the fixtures are a language-independent specification, and
`golden/canonical.ts` documents the serialization contract a port must match.

When a golden trace fails:

- **You refactored and expected no behaviour change** → that's a real bug. You
  changed the game. The failure names the exact day it first diverged. Fix the
  code; do not regenerate.
- **You deliberately changed balance/content** → expected. Check the printed
  diff is only what you intended, then `UPDATE_GOLDEN=1 npm test` and commit the
  fixture change *in the same commit*. A fixture diff in review is a feature: it
  shows a reviewer exactly which runs your tweak actually moved.

`harness.ts` holds the shared machinery: `loadSeeded()` (pin the RNG stream),
`checkInvariants()` (the beta invariant list), and `simulate()` (drive a run
forward, auto-dismissing blocking modals and asserting after every tick).

### Seeds actually reproduce now (they didn't before)

`loadSeeded()` used to pin `S.seed`/`S.rngState` *after* calling
`loadScenario()`. But a scenario draws from the RNG **while it is being built** —
crew bundles via `genBundle()`, then the opening market via `refreshMarket()` —
and `newState()` seeds itself from `crypto.getRandomValues() ^ Date.now()`. So
everything constructed during load came off a fresh random seed, and only the
rolls *after* load were pinned.

The practical effect: the promise below — "a bug at `trader/seed=8919/day=23`
becomes a one-line test that pins that seed forever" — **was not true**. The same
seed produced a different starting market on every run.

The seed is now threaded into construction (`loadScenario(name, seed)` →
`newState(shipName, seed)`), so it is pinned before the first roll. Same seed,
same ship, same crew, same market, same future. The dev console gets this too:
`__scenario('trader', 8919)` reproduces a run exactly.

## Running

```
npm test            # one-shot (CI uses this)
npm run test:watch  # watch mode while developing
npm run ci          # the whole gate: lint:rng + typecheck + test + build + bundle budget
```

## Scope and limits

- The harness force-dismisses (`clearModal`) any modal that blocks the day
  loop. It proves the *machinery* never breaks; it does **not** yet exercise
  the specific *choices* inside event/combat modals. Those want targeted
  tests, and get much easier once the ModalQueue + typed dispatcher land
  (BETA_PLAN §3.4) — a queued choice is callable data, not an onclick string.
- It drives the systems layer (`travel`, `market`, `scheduler`, `combat`
  resolution, migrations). It does **not** cover rendering, input, the walk
  sim, or audio — those live behind the browser skills.

## Adding coverage

When a balance finding or a bug is fixed, add a seeded regression here — not
just a memory note (BETA_PLAN §5). A bug found at `trader/seed=8919/day=23`
becomes a one-line test that pins that seed forever.
