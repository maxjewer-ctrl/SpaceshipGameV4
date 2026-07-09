// Offline-first content hot-loading.
// Bundled JSON is always the baseline. When Supabase is configured and online,
// we fetch the content_* tables, cache them in localStorage, and overlay them —
// so you can write a new bark/rider/rumor in the dashboard at breakfast and every
// player has it by lunch, no redeploy. On any failure we fall back to the last
// cached copy, then to bundled JSON.
import { applyRemoteContent, type BarkDef, type RiderDef } from "../content";
import { getClient, isConfigured } from "./client";

const CACHE_KEY = "kestrel_content_cache_v1";

interface ContentBundle {
  barks: BarkDef[];
  riders: Record<string, RiderDef>;
  rumors: string[];
  fetchedAt: number;
}

function readCache(): ContentBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ContentBundle) : null;
  } catch { return null; }
}
function writeCache(b: ContentBundle) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(b)); } catch { /* quota */ }
}

// Map raw DB rows (snake_case columns) into the in-game content shapes.
function mapBarks(rows: any[]): BarkDef[] {
  return rows.map((r) => ({
    when: r.when, text: r.text,
    traits: r.traits ?? undefined,
    role: r.role ?? undefined,
    secretTag: r.secret_tag ?? undefined,
    wound: r.wound ?? undefined,
    origin: r.origin ?? undefined,
    sentimentMin: r.sentiment_min ?? undefined,
    sentimentMax: r.sentiment_max ?? undefined,
  }));
}
function mapRiders(rows: any[]): Record<string, RiderDef> {
  const out: Record<string, RiderDef> = {};
  for (const r of rows) out[r.key] = r.def as RiderDef;
  return out;
}

// Returns true if any content was applied (so the caller can re-render).
export async function loadRemoteContent(): Promise<boolean> {
  // If not configured, still honour a previously-seeded cache (e.g. from a build
  // that once had credentials). Otherwise nothing to do.
  if (!isConfigured()) {
    const cached = readCache();
    if (cached) { applyRemoteContent(cached); return true; }
    return false;
  }
  try {
    const c = await getClient();
    if (!c) return false;
    const [barks, riders, rumors] = await Promise.all([
      c.from("content_barks").select("*").eq("enabled", true),
      c.from("content_riders").select("*").eq("enabled", true),
      c.from("content_rumors").select("text").eq("enabled", true),
    ]);
    if (barks.error || riders.error || rumors.error) {
      throw barks.error || riders.error || rumors.error;
    }
    const bundle: ContentBundle = {
      barks: mapBarks(barks.data || []),
      riders: mapRiders(riders.data || []),
      rumors: (rumors.data || []).map((r: any) => r.text),
      fetchedAt: Date.now(),
    };
    writeCache(bundle);
    applyRemoteContent(bundle);
    return true;
  } catch (e) {
    console.warn("[supabase] content fetch failed, using cache/bundled:", e);
    const cached = readCache();
    if (cached) { applyRemoteContent(cached); return true; }
    return false;
  }
}
