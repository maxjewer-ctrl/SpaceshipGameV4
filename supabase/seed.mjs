// Seed the Supabase content_* tables from the bundled local JSON.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node supabase/seed.mjs
// The service-role key bypasses RLS (content tables are read-only to clients),
// so keep it OUT of the browser and out of git — it lives only in your shell/CI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars first.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const content = (name) =>
  JSON.parse(readFileSync(resolve(here, "../src/content", name), "utf8"));

const barksJson = content("barks.json");
const ridersJson = content("riders.json");
const flavorJson = content("flavor.json");

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const clearAll = (table) => sb.from(table).delete().not("id", "is", null);

async function run() {
  // --- barks ---
  const barkRows = barksJson.map((b) => ({
    when: b.when, text: b.text,
    traits: b.traits ?? null, role: b.role ?? null,
    secret_tag: b.secretTag ?? null, wound: b.wound ?? null, origin: b.origin ?? null,
    sentiment_min: b.sentimentMin ?? null, sentiment_max: b.sentimentMax ?? null,
    author: "seed", enabled: true,
  }));
  await clearAll("content_barks");
  const bark = await sb.from("content_barks").insert(barkRows);
  if (bark.error) throw bark.error;
  console.log(`✓ seeded ${barkRows.length} barks`);

  // --- riders (upsert on unique key) ---
  const riderRows = Object.entries(ridersJson).map(([key, def]) => ({
    key, def, author: "seed", enabled: true,
  }));
  const rider = await sb.from("content_riders").upsert(riderRows, { onConflict: "key" });
  if (rider.error) throw rider.error;
  console.log(`✓ seeded ${riderRows.length} riders`);

  // --- rumors ---
  const rumorRows = (flavorJson.rumors || []).map((text) => ({ text, enabled: true }));
  await clearAll("content_rumors");
  const rumor = await sb.from("content_rumors").insert(rumorRows);
  if (rumor.error) throw rumor.error;
  console.log(`✓ seeded ${rumorRows.length} rumors`);

  console.log("Done. Reload the game — new content flows in at boot.");
}

run().catch((e) => { console.error("Seed failed:", e.message || e); process.exit(1); });
