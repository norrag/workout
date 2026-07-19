/**
 * N56 — doc 14 §5 parity for `explain_prescription`: the freshness reconcile
 * runs on EVERY surface that displays prescriptions, this tool included, so
 * the decision it reports can never disagree with what the app screens show
 * for the same row. Pinned here: the reconcile runs (for the caller's active
 * meso, with the resolved active params) BEFORE the decision read; no active
 * meso ⇒ no reconcile; and a freshness hiccup degrades to the stored numbers
 * (reported loudly, never failing the tool call).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

const ensureFreshPrescriptions = vi.fn(async () => {
  calls.push("reconcile");
  return { generated: 0, refreshed: 1 };
});
vi.mock("@/lib/queries/regeneration", () => ({
  ensureFreshPrescriptions: (...args: unknown[]) =>
    ensureFreshPrescriptions(...(args as [])),
}));

const activeParams = { version: 21, params: { stub: true } };
vi.mock("@/lib/queries/generation", () => ({
  getActiveEngineParams: vi.fn(async () => activeParams),
}));

const decision = {
  exercise_id: "11111111-1111-4111-8111-111111111111",
  exercise_name: "Deadlift",
  workout_exercise_id: "we-1",
  coordinate: "W2·D4",
  decided_at: "2026-07-11T18:00:00Z",
  params_version: 21,
  inputs: {},
  output: { weight: 250, reps: 8, sets: 3, targetRir: 2 },
};
const getLatestPrescriptionDecision = vi.fn(async () => {
  calls.push("decision");
  return decision;
});
vi.mock("@/lib/queries/progression", () => ({
  getLatestPrescriptionDecision: (...args: unknown[]) =>
    getLatestPrescriptionDecision(...(args as [])),
  projectNextPrescription: vi.fn(async () => null),
}));

const reportError = vi.fn(async () => undefined);
vi.mock("@/lib/observability/report", () => ({
  reportError: (...args: unknown[]) => reportError(...(args as [])),
}));

/** Chainable stub for the active-meso lookup the freshness step performs. */
function fakeClient(result: { data: unknown; error: unknown } | Error) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = async () => {
    if (result instanceof Error) throw result;
    return result;
  };
  return {
    from: (table: string) => {
      calls.push(`from:${table}`);
      return builder;
    },
  };
}

const USER = "user-1";
function mockSession(client: unknown) {
  return { client, userId: USER, token: "t" };
}
const resolveSession = vi.fn();
vi.mock("../session", () => ({
  resolveSession: (...args: unknown[]) => resolveSession(...(args as [])),
}));

import { registerReadTools, EXPLAIN_PRESCRIPTION } from "../tools/read";
import { captureServer, fakeExtra } from "./harness";

function explainHandler() {
  const { server, tools } = captureServer();
  registerReadTools(server);
  return tools.get(EXPLAIN_PRESCRIPTION)!.handler;
}

type ToolResult = {
  structuredContent?: { data?: Record<string, unknown> };
};

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("explain_prescription — doc 14 §5 freshness parity (N56)", () => {
  it("reconciles the active meso before reading the decision", async () => {
    resolveSession.mockReturnValue(
      mockSession(fakeClient({ data: { id: "meso-1" }, error: null })),
    );
    const out = (await explainHandler()(
      { exercise_id: decision.exercise_id },
      fakeExtra(),
    )) as ToolResult;

    expect(ensureFreshPrescriptions).toHaveBeenCalledExactlyOnceWith(
      USER,
      "meso-1",
      activeParams,
    );
    // the reconcile runs BEFORE the decision read, so the answer reflects it
    expect(calls.indexOf("reconcile")).toBeGreaterThan(-1);
    expect(calls.indexOf("reconcile")).toBeLessThan(calls.indexOf("decision"));
    expect(out.structuredContent?.data).toMatchObject({
      found: true,
      source: "recorded",
    });
  });

  it("skips the reconcile when the user has no active meso", async () => {
    resolveSession.mockReturnValue(
      mockSession(fakeClient({ data: null, error: null })),
    );
    const out = (await explainHandler()(
      { exercise_id: decision.exercise_id },
      fakeExtra(),
    )) as ToolResult;

    expect(ensureFreshPrescriptions).not.toHaveBeenCalled();
    expect(out.structuredContent?.data).toMatchObject({ source: "recorded" });
  });

  it("degrades to the stored numbers (loudly) when freshness fails", async () => {
    resolveSession.mockReturnValue(
      mockSession(fakeClient(new Error("network down"))),
    );
    const out = (await explainHandler()(
      { exercise_id: decision.exercise_id },
      fakeExtra(),
    )) as ToolResult;

    expect(ensureFreshPrescriptions).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(
      "mcp:explain-prescription-freshness",
      expect.any(Error),
      { userId: USER },
    );
    // the tool call itself still answers from the recorded decision
    expect(out.structuredContent?.data).toMatchObject({
      found: true,
      source: "recorded",
    });
  });
});
