import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * NEVER import this from a client component — the service key must stay on the server.
 * Access is limited to smb_* tables/functions by the app's own queries.
 *
 * Only ONE secret is required at deploy time: SUPABASE_SERVICE_ROLE_KEY.
 * The project URL is public and defaults to the known project; it can still be
 * overridden with NEXT_PUBLIC_SUPABASE_URL.
 */
const DEFAULT_URL = "https://cpvzwqptzcxnwzfzgrmt.supabase.co";

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
}

/** True once the one required secret is present. */
export function isConfigured(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belum di-set. Tambahkan di Railway → Variables.",
    );
  }
  cached = createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
