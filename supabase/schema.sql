-- THE KESTREL RUN — Supabase schema v1
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- Design rules (from PLAN.md §4):
--   * RLS everywhere. Players write only their own rows.
--   * content_* tables are READ-ONLY to clients (you seed them via service key).
--   * Aggregates (sector_heat, market_flow, news) are written only by Edge
--     Functions on a cron — never by the client.
-- Everything the game reads today lives in the CONTENT section at the bottom;
-- the rest is the roadmap scaffolding so future phases have a home.

-- =====================================================================
-- WHO
-- =====================================================================
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  handle      text,
  created_at  timestamptz not null default now(),
  settings    jsonb not null default '{}'::jsonb
);

create table if not exists lineages (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  house_name  text not null,
  motto       text,
  created_at  timestamptz not null default now()
);

create table if not exists captains (
  id              uuid primary key default gen_random_uuid(),
  lineage_id      uuid not null references lineages(id) on delete cascade,
  name            text not null,
  born_day        int  not null default 1,
  died_day        int,
  cause_of_death  text,
  final_log       text,
  stats           jsonb not null default '{}'::jsonb,
  alive           boolean not null default true
);

-- =====================================================================
-- SAVES (cloud sync — last-write-wins on updated_at)
-- =====================================================================
create table if not exists saves (
  profile_id  uuid not null references profiles(id) on delete cascade,
  slot        int  not null default 0,
  state       jsonb not null,
  version     int  not null,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, slot)
);

-- =====================================================================
-- THE SHARED DEAD (async multiplayer — written via Edge Functions later)
-- =====================================================================
create table if not exists derelicts (
  id           uuid primary key default gen_random_uuid(),
  captain_id   uuid references captains(id) on delete set null,
  system_seed  text not null,
  x            double precision,
  y            double precision,
  ship_name    text,
  cause        text,
  final_log    text,
  salvage      jsonb not null default '{}'::jsonb,
  found_count  int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists sector_heat (
  system_seed text primary key,
  danger      double precision not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists market_flow (
  planet_key  text not null,
  good        text not null,
  net_flow    bigint not null default 0,
  day         int not null,
  primary key (planet_key, good, day)
);

create table if not exists news (
  id       uuid primary key default gen_random_uuid(),
  day      int not null,
  headline text not null,
  body     text,
  source   text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- CONTENT  (the "go nuts" tables — you write; everyone reads)
-- The game reads content_barks / content_riders / content_rumors TODAY.
-- =====================================================================

-- Crew one-liners keyed to (personality × situation × ledger).
create table if not exists content_barks (
  id           uuid primary key default gen_random_uuid(),
  "when"       text not null,            -- situation: depart, patrol, quiet, combat_start, ...
  text         text not null,            -- may use {name} {origin} {want} {wound} {tell}
  traits       text[],                   -- fires only if crew has ANY of these traits
  role         text,                     -- gate to a crew role (pilot, gunner, ...)
  secret_tag   text,                     -- gate to a hidden secret (union_deserter, ...)
  wound        text,                     -- gate to a wound tag (left_behind, ...)
  origin       text,                     -- substring-match against crew origin
  sentiment_min int,                     -- ledger threshold (fondness)
  sentiment_max int,                     -- ledger threshold (grievance)
  author       text,
  enabled      boolean not null default true
);

-- Delayed consequences (Chekhov's Cargo). `def` is the full RiderDef JSON:
--   { class, title, text, log, effects:[...], combat:{...} }
create table if not exists content_riders (
  id       uuid primary key default gen_random_uuid(),
  key      text unique not null,
  def      jsonb not null,
  author   text,
  enabled  boolean not null default true
);

-- Cantina rumors (some become collectible leads later).
create table if not exists content_rumors (
  id             uuid primary key default gen_random_uuid(),
  text           text not null,
  links_event_key text,
  enabled        boolean not null default true
);

-- Travel/mission event decks (Phase 1 interpreter target — schema ready now).
create table if not exists content_events (
  id        uuid primary key default gen_random_uuid(),
  key       text unique not null,
  weight    int not null default 1,
  min_depth int not null default 0,
  biome     text[],
  requires  jsonb not null default '{}'::jsonb,
  body      jsonb not null,
  author    text,
  enabled   boolean not null default true
);

-- Name fragments (ships, captains, stations, moons) — thousands of cheap rows.
create table if not exists content_names (
  id       uuid primary key default gen_random_uuid(),
  kind     text not null,
  fragment text not null
);

-- Per-player arc progress.
create table if not exists story_flags (
  profile_id uuid not null references profiles(id) on delete cascade,
  flag       text not null,
  value      jsonb not null default 'true'::jsonb,
  primary key (profile_id, flag)
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table profiles       enable row level security;
alter table lineages       enable row level security;
alter table captains       enable row level security;
alter table saves          enable row level security;
alter table story_flags    enable row level security;
alter table content_barks  enable row level security;
alter table content_riders enable row level security;
alter table content_rumors enable row level security;
alter table content_events enable row level security;
alter table content_names  enable row level security;
alter table derelicts      enable row level security;

-- Players own their own rows.
create policy "own profile"  on profiles    for all using (auth.uid() = id)          with check (auth.uid() = id);
create policy "own saves"    on saves       for all using (auth.uid() = profile_id)  with check (auth.uid() = profile_id);
create policy "own flags"    on story_flags for all using (auth.uid() = profile_id)  with check (auth.uid() = profile_id);
create policy "own lineages" on lineages    for all using (auth.uid() = profile_id)  with check (auth.uid() = profile_id);
create policy "own captains" on captains    for all
  using (exists (select 1 from lineages l where l.id = captains.lineage_id and l.profile_id = auth.uid()))
  with check (exists (select 1 from lineages l where l.id = captains.lineage_id and l.profile_id = auth.uid()));

-- Content is world-readable, client-unwritable (seed via the service-role key).
create policy "read barks"  on content_barks  for select using (true);
create policy "read riders" on content_riders for select using (true);
create policy "read rumors" on content_rumors for select using (true);
create policy "read events" on content_events for select using (true);
create policy "read names"  on content_names  for select using (true);

-- Derelicts: anyone may read the shared dead; inserts go through Edge Functions.
create policy "read derelicts" on derelicts for select using (true);
