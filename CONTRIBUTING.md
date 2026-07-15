# Contributing

## Source of truth

- `main` is the integration branch and is mirrored to GitHub at
  `origin`.
- Project-local agent skills in `.agents/` are versioned tooling. Update them
  with the code paths they describe.
- Do not commit `node_modules/`, `dist/`, `.env*`, raw generated assets, or
  local scratch data. `.gitignore` is the authority for these exclusions.

## Change workflow

1. Start from an up-to-date `main`.
2. Keep a change focused: behavior, tests, docs, and content schema changes
   land together.
3. Run `npm run ci` before committing. It checks deterministic RNG, content
   references, simulation purity, TypeScript, tests, production build, and the
   bundle budget.
4. Inspect `git diff --check` and `git status` before staging.
5. Commit with an imperative message, then upload with `git push origin main`.

GitHub Actions runs the same CI gate for every push and pull request. Do not
merge a failing workflow or bypass a content/schema check without a documented
follow-up.

## Structural rules

- New persistent state requires a migration in `state.ts` and a migration test.
- New content references require content-integrity coverage.
- New physical interactions extend `systems/interactions.ts`; do not add a
  screen-local priority rule.
- New stations provide scene data, berth, service discovery behavior, and a
  deterministic traversal test before visual polish expands them.
