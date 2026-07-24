/**
 * doc 19 / N60 follow-up — the editable coaching-prompt data layer. The pure
 * version-floor logic (DB prompts must clear the serving cut) and the
 * deletion-impact guard (never destroy an active or referenced prompt) are
 * tested against a faked Supabase query chain, in isolation.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { COACHING_PROMPT_VERSION } from "@/lib/llm/coaching";
import {
  nextCoachingPromptVersion,
  getActiveCoachingPrompt,
  proposeCoachingPrompt,
  getCoachingPromptDeletionImpact,
} from "../coaching-prompts";

type Resp = { data?: unknown; count?: number; error?: unknown };
type Handler = (
  table: string,
  ctx: { single: boolean; count: boolean; insert?: Record<string, unknown> },
) => Resp;

function fakeClient(handler: Handler): SupabaseClient<Database> {
  function makeBuilder(table: string) {
    const ctx: { single: boolean; count: boolean; insert?: Record<string, unknown> } = {
      single: false,
      count: false,
    };
    const builder: Record<string, unknown> = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) ctx.count = true;
        return builder;
      },
      insert(row: Record<string, unknown>) {
        ctx.insert = row;
        return Promise.resolve(handler(table, ctx));
      },
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle() {
        ctx.single = true;
        return Promise.resolve(handler(table, ctx));
      },
      then(resolve: (v: unknown) => unknown) {
        return Promise.resolve(handler(table, ctx)).then(resolve);
      },
    };
    return builder;
  }
  return { from: (table: string) => makeBuilder(table) } as unknown as SupabaseClient<Database>;
}

describe("nextCoachingPromptVersion (serving-cut floor)", () => {
  it("floors the first DB prompt above the code fallback version", () => {
    // an empty table must not produce version 1 — that would never serve
    expect(nextCoachingPromptVersion(null)).toBe(COACHING_PROMPT_VERSION + 1);
  });

  it("increments from the highest existing version when it is above the floor", () => {
    expect(nextCoachingPromptVersion(COACHING_PROMPT_VERSION + 3)).toBe(
      COACHING_PROMPT_VERSION + 4,
    );
    expect(nextCoachingPromptVersion(12)).toBe(13);
  });

  it("never drops below the floor even if a stale low version exists", () => {
    expect(nextCoachingPromptVersion(2)).toBe(COACHING_PROMPT_VERSION + 1);
  });
});

describe("getActiveCoachingPrompt", () => {
  it("returns null when no row is active (caller falls back to the code const)", async () => {
    const client = fakeClient((t) => (t === "coaching_prompts" ? { data: null } : {}));
    expect(await getActiveCoachingPrompt(client)).toBeNull();
  });

  it("returns the active version + body when one is active", async () => {
    const client = fakeClient((t) =>
      t === "coaching_prompts" ? { data: { version: 5, body: "be an analyst" } } : {},
    );
    expect(await getActiveCoachingPrompt(client)).toEqual({ version: 5, body: "be an analyst" });
  });
});

describe("proposeCoachingPrompt", () => {
  it("inserts an inactive row at the floored next version", async () => {
    let captured: Record<string, unknown> | undefined;
    const client = fakeClient((t, ctx) => {
      if (t !== "coaching_prompts") return {};
      if (ctx.insert) {
        captured = ctx.insert;
        return {};
      }
      // the "top version" lookup: table empty
      return { data: null };
    });
    const version = await proposeCoachingPrompt(client, "a".repeat(60), "first edit");
    expect(version).toBe(COACHING_PROMPT_VERSION + 1);
    expect(captured).toMatchObject({
      version: COACHING_PROMPT_VERSION + 1,
      is_active: false,
      notes: "first edit",
    });
  });

  it("increments past the existing top version", async () => {
    const client = fakeClient((t, ctx) => {
      if (t !== "coaching_prompts") return {};
      if (ctx.insert) return {};
      return { data: { version: 7 } };
    });
    expect(await proposeCoachingPrompt(client, "b".repeat(60), null)).toBe(8);
  });
});

describe("getCoachingPromptDeletionImpact", () => {
  it("reports not-found when the version doesn't exist", async () => {
    const client = fakeClient((t) => (t === "coaching_prompts" ? { data: null } : { count: 0 }));
    const out = await getCoachingPromptDeletionImpact(client, 9);
    expect(out).toMatchObject({ found: false, deletable: false });
  });

  it("is not deletable while active", async () => {
    const client = fakeClient((t) =>
      t === "coaching_prompts" ? { data: { version: 5, is_active: true } } : { count: 0 },
    );
    const out = await getCoachingPromptDeletionImpact(client, 5);
    expect(out).toMatchObject({ isActive: true, deletable: false });
  });

  it("is not deletable when referenced by stored explanations", async () => {
    const client = fakeClient((t) =>
      t === "coaching_prompts" ? { data: { version: 5, is_active: false } } : { count: 12 },
    );
    const out = await getCoachingPromptDeletionImpact(client, 5);
    expect(out).toMatchObject({ explanationRefs: 12, deletable: false });
  });

  it("is deletable for an unused inactive draft", async () => {
    const client = fakeClient((t) =>
      t === "coaching_prompts" ? { data: { version: 6, is_active: false } } : { count: 0 },
    );
    const out = await getCoachingPromptDeletionImpact(client, 6);
    expect(out).toMatchObject({ found: true, deletable: true });
  });
});
