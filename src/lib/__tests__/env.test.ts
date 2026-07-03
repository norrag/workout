import { describe, it, expect } from "vitest";
import { parseSupabasePublicEnv } from "../env";

// R22 — env misconfiguration must surface as a loud, named error at first
// use, not a generic 500 from inside @supabase/ssr.

describe("parseSupabasePublicEnv (R22)", () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  };

  it("passes a well-formed env through, stripping the URL's trailing slash", () => {
    expect(
      parseSupabasePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/",
      }),
    ).toEqual({ url: "https://abc.supabase.co", anonKey: "anon-key" });
  });

  it("accepts the CI placeholder shape (localhost URL)", () => {
    expect(() =>
      parseSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
      }),
    ).not.toThrow();
  });

  it("names a missing var (the typo'd-Vercel-var case)", () => {
    expect(() =>
      parseSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY.*missing/);
  });

  it("rejects a non-URL value with the var named", () => {
    expect(() =>
      parseSupabasePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "not a url",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*URL/);
  });

  it("rejects an empty anon key (set-but-blank env entry)", () => {
    expect(() =>
      parseSupabasePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("reports BOTH vars when both are wrong (one loud, complete error)", () => {
    expect(() => parseSupabasePublicEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_ANON_KEY/s,
    );
  });
});
