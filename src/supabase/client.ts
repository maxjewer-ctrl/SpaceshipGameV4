// Supabase client — lazily created, and only if credentials are present.
// The game is offline-first: with no env vars this module is inert and the
// game runs entirely on bundled JSON content + localStorage saves.
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = (): boolean => !!(URL && KEY);

let _client: SupabaseClient | null = null;

// Dynamically imports supabase-js only when actually needed, so an unconfigured
// build never pays for the library at startup.
export async function getClient(): Promise<SupabaseClient | null> {
  if (!isConfigured()) return null;
  if (_client) return _client;
  const { createClient } = await import("@supabase/supabase-js");
  _client = createClient(URL!, KEY!, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

// Anonymous sign-in — zero-friction identity for cloud saves & the shared dead.
// Safe to call repeatedly; resolves to the current user id or null.
export async function ensureAnonUser(): Promise<string | null> {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signIn, error } = await c.auth.signInAnonymously();
  if (error) { console.warn("[supabase] anon sign-in failed:", error.message); return null; }
  return signIn.user?.id ?? null;
}
