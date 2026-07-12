import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabasePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/** RLS-scoped server client bound to the request's auth cookies. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // called from a Server Component — middleware refreshes sessions
        }
      },
    },
  });
}

/**
 * Request-deduped verified auth (N53): on a hard load the (app) layout gates
 * with `auth.getUser()` and the page then repeats the same call for its own
 * queries — two serialized Supabase round-trips behind the splash. React
 * `cache()` collapses them to one per server render pass. The middleware
 * deliberately does NOT verify (see lib/supabase/middleware.ts), so this is
 * the single authoritative auth check of a request.
 */
export const getRequestAuth = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});
