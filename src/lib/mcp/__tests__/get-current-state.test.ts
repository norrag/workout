import { describe, it, expect } from "vitest";
import type {
  CurrentState,
} from "@/lib/queries/cycles";
import type {
  MacrocycleRow,
  MesocycleRow,
  MicrocycleRow,
  WorkoutRow,
} from "@/lib/types/database";
import {
  formatCurrentState,
  registerGetCurrentState,
  GET_CURRENT_STATE,
} from "../tools/get-current-state";
import { registerTools } from "../tools";
import { registerResources } from "../resources";
import { verifyMcpToken } from "../auth";
import { captureServer, fakeAuthInfo, fakeExtra } from "./harness";

// --- fixtures --------------------------------------------------------------

function meso(overrides: Partial<MesocycleRow> = {}): MesocycleRow {
  return {
    id: "m1",
    macrocycle_id: "M1",
    position: 2,
    phase: "accumulation",
    user_id: "u1",
    name: "Block 2",
    weeks: 5,
    days_per_week: 4,
    includes_deload: true,
    rir_start: 3,
    rir_end: 0,
    rir_schedule: null,
    status: "active",
    template_id: null,
    start_date: "2026-06-01",
    last_reconcile_sig: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function macro(overrides: Partial<MacrocycleRow> = {}): MacrocycleRow {
  return {
    id: "M1",
    user_id: "u1",
    name: "Summer Bulk",
    goal_type: "hypertrophy",
    goal_notes: null,
    target_metrics: {},
    duration_months: 4,
    meso_length_weeks: 5,
    recommended_duration_months: 4,
    target_low: null,
    target_high: null,
    target_unit: null,
    target_direction: null,
    rate_low: null,
    rate_high: null,
    plan_inputs: null,
    start_date: "2026-06-01",
    target_end_date: null,
    status: "active",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function micro(overrides: Partial<MicrocycleRow> = {}): MicrocycleRow {
  return {
    id: "w1",
    mesocycle_id: "m1",
    user_id: "u1",
    week_number: 3,
    target_rir: 1,
    is_deload: false,
    start_date: "2026-06-15",
    status: "active",
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
    ...overrides,
  };
}

function workout(overrides: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    id: "k1",
    microcycle_id: "w1",
    user_id: "u1",
    day_number: 2,
    scheduled_date: "2026-06-17",
    performed_at: null,
    status: "planned",
    notes: null,
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
    ...overrides,
  };
}

// --- formatCurrentState ----------------------------------------------------

describe("formatCurrentState", () => {
  it("reports no active mesocycle when nothing is in progress", () => {
    const state: CurrentState = {
      macrocycle: null,
      mesocycle: null,
      microcycle: null,
      nextWorkout: null,
    };
    const out = formatCurrentState(state);
    expect(out.has_active_mesocycle).toBe(false);
    expect(out.mesocycle).toBeNull();
    expect(out.next_workout).toBeNull();
    expect(out.summary).toMatch(/no active mesocycle/i);
  });

  it("shapes a full active state with week/day coordinate and target RIR", () => {
    const out = formatCurrentState({
      macrocycle: macro(),
      mesocycle: meso(),
      microcycle: micro(),
      nextWorkout: workout(),
    });
    expect(out.has_active_mesocycle).toBe(true);
    expect(out.macrocycle).toEqual({
      name: "Summer Bulk",
      goal_type: "hypertrophy",
      duration_months: 4,
    });
    expect(out.mesocycle?.rir_ramp).toEqual({ start: 3, end: 0, schedule: null });
    expect(out.microcycle?.target_rir).toBe(1);
    expect(out.next_workout).toMatchObject({
      id: "k1",
      week_number: 3,
      day_number: 2,
      status: "planned",
    });
    expect(out.summary).toMatch(/week 3, day 2/);
    expect(out.summary).toMatch(/target RIR 1/);
  });

  it("flags a deload week in the summary", () => {
    const out = formatCurrentState({
      macrocycle: macro(),
      mesocycle: meso(),
      microcycle: micro({ is_deload: true, target_rir: 4 }),
      nextWorkout: workout(),
    });
    expect(out.microcycle?.is_deload).toBe(true);
    expect(out.summary).toMatch(/deload week/i);
  });

  it("handles an active meso with no open workout", () => {
    const out = formatCurrentState({
      macrocycle: null,
      mesocycle: meso({ macrocycle_id: null, position: null }),
      microcycle: null,
      nextWorkout: null,
    });
    expect(out.has_active_mesocycle).toBe(true);
    expect(out.macrocycle).toBeNull();
    expect(out.next_workout).toBeNull();
    expect(out.summary).toMatch(/no open workout/i);
  });
});

// --- registration + identity contract --------------------------------------

describe("get_current_state registration", () => {
  it("registers the tool with an empty input schema (no user_id arg — rule #5)", () => {
    const { server, tools } = captureServer();
    registerGetCurrentState(server);
    const tool = tools.get(GET_CURRENT_STATE);
    expect(tool).toBeDefined();
    expect(tool!.config.inputSchema).toEqual({});
  });

  it("is included by registerTools", () => {
    const { server, tools } = captureServer();
    registerTools(server);
    expect(tools.has(GET_CURRENT_STATE)).toBe(true);
  });

  it("registers the current-cycle resource", () => {
    const { server, resources } = captureServer();
    registerResources(server);
    expect(resources.get("current-cycle")?.uri).toBe("workout://current-cycle");
  });
});

describe("identity is required and comes from the session", () => {
  it("rejects an unauthenticated tool call", async () => {
    const { server, tools } = captureServer();
    registerGetCurrentState(server);
    const tool = tools.get(GET_CURRENT_STATE)!;
    await expect(tool.handler({}, fakeExtra(undefined))).rejects.toThrow(
      /authenticated session/i,
    );
  });

  it("rejects a session whose token carries no user id", async () => {
    const { server, tools } = captureServer();
    registerGetCurrentState(server);
    const tool = tools.get(GET_CURRENT_STATE)!;
    const authInfo = fakeAuthInfo("u1");
    authInfo.extra = {}; // simulate a token with no `sub`
    await expect(tool.handler({}, fakeExtra(authInfo))).rejects.toThrow(
      /user id/i,
    );
  });
});

describe("verifyMcpToken", () => {
  it("denies a request with no bearer token", async () => {
    await expect(verifyMcpToken(new Request("http://x"))).resolves.toBeUndefined();
  });

  it("denies a malformed bearer token", async () => {
    await expect(
      verifyMcpToken(new Request("http://x"), "not-a-jwt"),
    ).resolves.toBeUndefined();
  });
});
