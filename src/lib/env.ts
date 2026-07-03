import { z } from "zod";

/**
 * Validated Supabase environment access (R22). The client factories used
 * non-null assertions, so a missing/typo'd var passed the build (CI supplies
 * placeholders) and failed opaquely as request-time 500s from inside
 * @supabase/ssr. Every factory now reads through here: one loud, named error
 * at first use instead. `next.config.ts` additionally asserts presence at
 * build time so a Vercel misconfiguration can't ship at all.
 *
 * NEXT_PUBLIC_* must be referenced as static `process.env.NAME` member
 * expressions (never dynamically) so Next can inline them into client
 * bundles — which is also why this module reads them itself instead of
 * accepting a `process.env` object from the caller.
 *
 * The service-role key is deliberately NOT read here — hard rule #4 confines
 * it to `src/lib/supabase/service.ts`.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ required_error: "missing (check the Vercel env vars)" })
    .url("must be a URL (e.g. https://<ref>.supabase.co)"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string({ required_error: "missing (check the Vercel env vars)" })
    .min(1, "must not be empty"),
});

export interface SupabasePublicEnv {
  /** project URL, trailing slash stripped */
  url: string;
  anonKey: string;
}

/** Pure parse step, exported for unit tests. Throws with every offending var
 *  named — the whole point is a diagnosable error instead of a generic 500. */
export function parseSupabasePublicEnv(raw: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}): SupabasePublicEnv {
  const parsed = publicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Supabase environment misconfigured — ${problems}`);
  }
  return {
    url: parsed.data.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""),
    anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

let cached: SupabasePublicEnv | null = null;

/** The validated public Supabase env, parsed once per runtime. */
export function supabasePublicEnv(): SupabasePublicEnv {
  if (!cached) {
    cached = parseSupabasePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  }
  return cached;
}
