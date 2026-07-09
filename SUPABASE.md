# Supabase setup — content backend

The game runs **fully offline** on bundled JSON. Supabase is purely additive: it
lets you write new crew barks, mission riders, and rumors in a dashboard and have
every player pick them up at their next boot — **no redeploy**. It's also the
foundation for cloud saves and the "shared dead" universe in later phases.

There is exactly **one manual step only you can do**: create the project. Then
this repo wires the rest.

## 1. Create the project (5 minutes, once)

1. Go to <https://supabase.com> → **New project**. Pick a name and a region.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **service_role** key → used only for seeding (keep it secret)

## 2. Create the tables

Open **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and **Run**. This creates every
table (content, saves, the shared-dead scaffolding) with row-level security.

## 3. Point the game at it

```bash
cp .env.example .env
# then edit .env and paste your URL + anon key
```

`.env` is gitignored. Restart `npm run dev`. On boot the game fetches the
`content_*` tables, caches them in `localStorage`, and overlays them on the
bundled content. If Supabase is unreachable it silently falls back to the cache,
then to bundled JSON — play is never blocked on the network.

## 4. Seed the content tables from local JSON

The tables start empty. Push the bundled content up (barks, riders, rumors):

```bash
SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
SUPABASE_SERVICE_KEY="your-service-role-key" \
npm run seed
```

(The service key bypasses RLS to write read-only content tables. Never put it in
`.env` committed to git or anywhere the browser can see it.)

## 5. Go nuts

From here, adding content is a database row, not a code change:

- **A new crew bark** → insert into `content_barks`
  (`when`, `text`, optional `traits`, `role`, `secret_tag`, `wound`, `origin`).
  Text may use `{name}` `{origin}` `{want}` `{wound}` `{tell}` placeholders.
- **A new delayed consequence** → insert into `content_riders`
  (`key`, `def` JSON: `{ class, title, text, log, effects:[...], combat:{...} }`).
  Plant it from code with `plantDelay(minDays, maxDays, "your_key")`.
- **A new rumor** → insert into `content_rumors` (`text`).

Reload the game; it's live. The bundled JSON in `src/content/` stays as the
offline baseline and the canonical schema example.

## What's wired today vs. scaffolded for later

| Live now | Scaffolded (tables exist, wiring lands in later phases) |
|---|---|
| `content_barks`, `content_riders`, `content_rumors` (read + overlay) | `saves` cloud sync, `captains`/`derelicts` (the shared dead) |
| Anonymous auth helper (`ensureAnonUser`) | `content_events` DSL interpreter, `content_names`, `story_flags` |
| Offline-first cache + fallback | `sector_heat`, `market_flow`, `news` (Edge-Function cron aggregates) |
