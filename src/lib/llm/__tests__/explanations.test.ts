/**
 * N60 / doc 19 §6–§7 — the v3 write-site generation hook, run against a faked
 * service client and a stubbed model: the trigger gate (no trigger ⇒ no call),
 * facts-payload generation, structured-output parsing, the §6.2 post-check +
 * abstention path, per-decision failure isolation, and the stored row's shape
 * (coaching body + triggers audit + prompt_version 3).
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { generateDecisionExplanations, recentLines } from "../explanations";
import type { LlmCompletion } from "../openai";

// --- fake postgrest client ---------------------------------------------------

type TableData = Record<string, { data: unknown; error: unknown }>;

interface Upsert {
  table: string;
  row: Record<string, unknown>;
  options: Record<string, unknown> | undefined;
}

/** Chainable thenable builder: any filter/order/limit call returns itself;
 *  awaiting resolves the canned per-table result; upserts + inserts are
 *  recorded (inserts feed the llm_explanation_failures assertions). */
function fakeService(
  tables: TableData,
  upserts: Upsert[],
  inserts: Upsert[] = [],
): SupabaseClient<Database> {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        upsert(row: Record<string, unknown>, options?: Record<string, unknown>) {
          upserts.push({ table, row, options });
          return Promise.resolve({ error: null });
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row, options: undefined });
          return Promise.resolve({ error: null });
        },
        then(
          resolve: (v: unknown) => unknown,
          reject: (e: unknown) => unknown,
        ) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return new Proxy(builder, {
        get(target, prop: string) {
          if (prop in target) return target[prop];
          return () => new Proxy(builder, this as ProxyHandler<typeof builder>);
        },
      });
    },
  } as unknown as SupabaseClient<Database>;
}

const decisionRow = {
  id: "d1",
  workout_exercise_id: "we1",
  exercise_id: "ex1",
  microcycle_id: "mc1",
  mesocycle_id: "ms1",
  kind: "advance",
  inputs: {
    week: { targetRir: 2, isDeload: false },
    goalType: "hypertrophy",
    previous: { weight: 250, reps: 8, sets: 3, targetRir: 3 },
  },
  output: {
    weight: 250,
    reps: 9,
    sets: 3,
    targetRir: 2,
    trace: [
      {
        rule: "progression",
        detail: "earned; skipped by rate pacer",
        status: "paced",
        governor: "rate_pacer",
      },
    ],
  },
};

function tables(overrides: Partial<TableData> = {}): TableData {
  return {
    engine_decisions: { data: [decisionRow], error: null },
    exercises: { data: [{ id: "ex1", name: "Deadlift" }], error: null },
    // exercise_id rides along for the §10 session-note resolution (the fake
    // returns one canned result per table, both consumers pick their fields)
    workout_exercises: {
      data: [{ id: "we1", muscle_group_id: "mg1", exercise_id: "ex1" }],
      error: null,
    },
    muscle_groups: { data: [{ id: "mg1", name: "glutes" }], error: null },
    microcycles: { data: [{ id: "mc1", week_number: 2 }], error: null },
    mesocycles: { data: [{ id: "ms1", weeks: 5 }], error: null },
    logged_sets: {
      data: [
        { exercise_id: "ex1", performed_at: "2026-07-15T10:00:00Z", set_number: 1, weight: 255, reps: 8 },
        { exercise_id: "ex1", performed_at: "2026-07-15T10:05:00Z", set_number: 2, weight: 255, reps: 7 },
      ],
      error: null,
    },
    ...overrides,
  };
}

/** A session note on the exercise makes the decision TRIGGER (note gate, §6.1)
 *  so the model is called at all — the base `tables()` has no signal and skips. */
function triggeredTables(): TableData {
  return tables({
    exercise_feedback: {
      data: [
        {
          workout_exercise_id: "we1",
          notes: "grip started slipping late",
          created_at: "2026-07-15T11:00:00Z",
        },
      ],
      error: null,
    },
  });
}

/** The v3 structured reply — a grounded, actionable coaching line. */
const coaching: LlmCompletion = {
  text: '{"coaching_context":"Grip slipped late last session — secure it before the last set so it never costs you a rep.","note_class":"technique","abstain":false}',
  model: "gpt-5.6-luna",
  tokensIn: 260,
  tokensOut: 40,
};

describe("generateDecisionExplanations (v3)", () => {
  it("sends the FACTS payload, parses the reply, and stores body + triggers", async () => {
    const upserts: Upsert[] = [];
    const seen: string[] = [];
    const { stored, results } = await generateDecisionExplanations("u1", ["d1"], {
      service: fakeService(triggeredTables(), upserts),
      complete: async ({ input }) => {
        seen.push(input);
        return coaching;
      },
    });

    expect(stored).toBe(1);
    expect(results[0]).toMatchObject({
      decisionId: "d1",
      exercise: "Deadlift",
      ok: true,
      stored: true,
      disposition: "stored",
      triggers: ["note"],
      noteClass: "technique",
    });

    // the model sees the §5 facts object — one verdict per axis, no raw trace
    const facts = JSON.parse(seen[0]);
    expect(facts.exercise).toBe("Deadlift");
    expect(facts.prescription_change).toBe("reps_increased");
    expect(facts.pace_status).toBe("ahead");
    expect(JSON.stringify(facts)).not.toContain("rate_pacer");

    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("decision_explanations");
    expect(upserts[0].row).toMatchObject({
      decision_id: "d1",
      user_id: "u1",
      body: "Grip slipped late last session — secure it before the last set so it never costs you a rep.",
      prompt_version: 3,
      triggers: ["note"],
    });
    // §5: the decision id is the cache key — re-runs must be harmless
    expect(upserts[0].options).toMatchObject({
      onConflict: "decision_id",
      ignoreDuplicates: true,
    });
  });

  it("skips a decision with NO trigger — no API call, no row (§6.1)", async () => {
    const upserts: Upsert[] = [];
    let called = 0;
    const { stored, results } = await generateDecisionExplanations("u1", ["d1"], {
      // base tables: a routine mid-block paced advance, no note/pain/modulation
      service: fakeService(tables(), upserts),
      complete: async () => {
        called += 1;
        return coaching;
      },
    });
    expect(called).toBe(0);
    expect(stored).toBe(0);
    expect(upserts).toHaveLength(0);
    expect(results[0]).toMatchObject({ ok: true, stored: false, disposition: "skipped", triggers: [] });
  });

  it("abstention is a success path — a triggered call that stores nothing (§6.2)", async () => {
    const upserts: Upsert[] = [];
    const inserts: Upsert[] = [];
    const { stored, results } = await generateDecisionExplanations("u1", ["d1"], {
      service: fakeService(triggeredTables(), upserts, inserts),
      complete: async () => ({
        ...coaching,
        text: '{"coaching_context":null,"note_class":"normal_exertion","abstain":true}',
      }),
    });
    expect(stored).toBe(0);
    expect(upserts).toHaveLength(0);
    // abstention is NOT a failure — nothing lands in the failure log
    expect(inserts.filter((u) => u.table === "llm_explanation_failures")).toHaveLength(0);
    expect(results[0]).toMatchObject({ ok: true, stored: false, disposition: "abstained" });
  });

  it("discards output that fails the §6.2 post-check (no row, failure logged)", async () => {
    const upserts: Upsert[] = [];
    const inserts: Upsert[] = [];
    const { stored, results } = await generateDecisionExplanations("u1", ["d1"], {
      service: fakeService(triggeredTables(), upserts, inserts),
      complete: async () => ({
        ...coaching,
        // a number not present in the facts payload
        text: '{"coaching_context":"Push to 999 lb next week.","note_class":"technique","abstain":false}',
      }),
    });
    expect(stored).toBe(0);
    expect(upserts.filter((u) => u.table === "decision_explanations")).toHaveLength(0);
    expect(results[0]).toMatchObject({ ok: false, stored: false, disposition: "discarded", stage: "post_check" });
    const failureRows = inserts.filter((u) => u.table === "llm_explanation_failures");
    expect(failureRows).toHaveLength(1);
    expect(failureRows[0].row).toMatchObject({ user_id: "u1", decision_id: "d1", stage: "post_check" });
  });

  it("discards a note-only trigger when the note is non-actionable (§6.2)", async () => {
    const upserts: Upsert[] = [];
    const { stored, results } = await generateDecisionExplanations("u1", ["d1"], {
      service: fakeService(triggeredTables(), upserts),
      complete: async () => ({
        ...coaching,
        text: '{"coaching_context":"That burning pump shows patience.","note_class":"normal_exertion","abstain":false}',
      }),
    });
    expect(stored).toBe(0);
    expect(results[0]).toMatchObject({ ok: false, disposition: "discarded" });
  });

  it("isolates a per-decision failure from the rest of the burst", async () => {
    const second = { ...decisionRow, id: "d2" };
    const upserts: Upsert[] = [];
    const inserts: Upsert[] = [];
    let calls = 0;
    const { stored, results } = await generateDecisionExplanations("u1", ["d1", "d2"], {
      service: fakeService(
        { ...triggeredTables(), engine_decisions: { data: [decisionRow, second], error: null } },
        upserts,
        inserts,
      ),
      complete: async () => {
        calls += 1;
        if (calls === 1) throw new Error("model down");
        return coaching;
      },
    });
    expect(stored).toBe(1);
    expect(upserts).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed).toMatchObject({ stage: "generate", error: "model down", disposition: "error" });
    expect(inserts.filter((u) => u.table === "llm_explanation_failures")).toHaveLength(1);
  });

  it("is a no-op for an empty or foreign decision set", async () => {
    const upserts: Upsert[] = [];
    const { stored, results } = await generateDecisionExplanations("u1", ["dX"], {
      service: fakeService(
        tables({ engine_decisions: { data: [], error: null } }),
        upserts,
      ),
      complete: async () => coaching,
    });
    expect(stored).toBe(0);
    expect(results).toEqual([]);
    expect(upserts).toHaveLength(0);
  });

  it("overwrite=true upserts over an existing explanation (admin retesting)", async () => {
    const upserts: Upsert[] = [];
    const { stored } = await generateDecisionExplanations(
      "u1",
      ["d1"],
      { service: fakeService(triggeredTables(), upserts), complete: async () => coaching },
      { overwrite: true },
    );
    expect(stored).toBe(1);
    expect(upserts[0].options).toMatchObject({
      onConflict: "decision_id",
      ignoreDuplicates: false,
    });
  });
});

describe("recentLines", () => {
  it("folds newest-first sets into history-sheet lines, capped at 3 days", () => {
    const rows = [
      { exercise_id: "e", performed_at: "2026-07-15T10:00:00Z", set_number: 1, weight: 255, reps: 8 },
      { exercise_id: "e", performed_at: "2026-07-15T10:04:00Z", set_number: 2, weight: 255, reps: 7 },
      { exercise_id: "e", performed_at: "2026-07-12T10:00:00Z", set_number: 1, weight: 250, reps: 8 },
      { exercise_id: "e", performed_at: "2026-07-08T10:00:00Z", set_number: 1, weight: 265, reps: 7 },
      { exercise_id: "e", performed_at: "2026-07-01T10:00:00Z", set_number: 1, weight: 245, reps: 9 },
    ];
    expect(recentLines(rows).get("e")).toEqual([
      "Jul 15 · 255 × 8, 7",
      "Jul 12 · 250 × 8",
      "Jul 8 · 265 × 7",
    ]);
  });

  it("uses the day's top weight when sets vary", () => {
    const rows = [
      { exercise_id: "e", performed_at: "2026-07-15T10:00:00Z", set_number: 1, weight: 100, reps: 10 },
      { exercise_id: "e", performed_at: "2026-07-15T10:04:00Z", set_number: 2, weight: 105, reps: 8 },
    ];
    expect(recentLines(rows).get("e")).toEqual(["Jul 15 · 105 × 10, 8"]);
  });
});
