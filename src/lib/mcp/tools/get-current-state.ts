import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentState, type CurrentState } from "@/lib/queries/cycles";
import { resolveSession, type McpExtra } from "../session";
import { toolResult } from "../envelope";

/**
 * `get_current_state` — the model's grounding call: the user's active
 * macrocycle → mesocycle → microcycle → next workout, with the RIR target for
 * the week. Identity comes from the session; takes no arguments.
 */

export interface CurrentStatePayload {
  has_active_mesocycle: boolean;
  macrocycle: {
    name: string;
    goal_type: string;
    duration_months: number | null;
  } | null;
  mesocycle: {
    name: string;
    position: number | null;
    phase: string | null;
    weeks: number;
    days_per_week: number;
    includes_deload: boolean;
    rir_ramp: { start: number; end: number };
    status: string;
  } | null;
  microcycle: {
    week_number: number;
    target_rir: number;
    is_deload: boolean;
    status: string;
  } | null;
  next_workout: {
    id: string;
    week_number: number | null;
    day_number: number;
    status: string;
    scheduled_date: string | null;
  } | null;
  /** one-line orientation for the model */
  summary: string;
}

/** Pure shaping of the query result — unit-testable without I/O. */
export function formatCurrentState(state: CurrentState): CurrentStatePayload {
  const { macrocycle, mesocycle, microcycle, nextWorkout } = state;

  let summary: string;
  if (!mesocycle) {
    summary =
      "No active mesocycle. The user has nothing in progress; suggest planning one.";
  } else if (!nextWorkout) {
    summary = `Active mesocycle "${mesocycle.name}" but no open workout — the current week may be complete or awaiting generation.`;
  } else {
    const coord = microcycle
      ? `week ${microcycle.week_number}, day ${nextWorkout.day_number}`
      : `day ${nextWorkout.day_number}`;
    const rir =
      microcycle != null ? `, target RIR ${microcycle.target_rir}` : "";
    const deload = microcycle?.is_deload ? " (deload week)" : "";
    summary = `Active mesocycle "${mesocycle.name}" — next workout is ${coord}${rir}${deload}.`;
  }

  return {
    has_active_mesocycle: mesocycle != null,
    macrocycle: macrocycle
      ? {
          name: macrocycle.name,
          goal_type: macrocycle.goal_type,
          duration_months: macrocycle.duration_months,
        }
      : null,
    mesocycle: mesocycle
      ? {
          name: mesocycle.name,
          position: mesocycle.position,
          phase: mesocycle.phase,
          weeks: mesocycle.weeks,
          days_per_week: mesocycle.days_per_week,
          includes_deload: mesocycle.includes_deload,
          rir_ramp: { start: mesocycle.rir_start, end: mesocycle.rir_end },
          status: mesocycle.status,
        }
      : null,
    microcycle: microcycle
      ? {
          week_number: microcycle.week_number,
          target_rir: microcycle.target_rir,
          is_deload: microcycle.is_deload,
          status: microcycle.status,
        }
      : null,
    next_workout: nextWorkout
      ? {
          id: nextWorkout.id,
          week_number: microcycle?.week_number ?? null,
          day_number: nextWorkout.day_number,
          status: nextWorkout.status,
          scheduled_date: nextWorkout.scheduled_date,
        }
      : null,
    summary,
  };
}

export const GET_CURRENT_STATE = "get_current_state";

export function registerGetCurrentState(server: McpServer) {
  server.registerTool(
    GET_CURRENT_STATE,
    {
      title: "Get current training state",
      description:
        "The user's current position in their training: active macrocycle → " +
        "mesocycle → microcycle (week) → next workout, including this week's " +
        "target RIR. Call this first to ground any coaching or planning. " +
        "Takes no arguments — it always reports the authenticated user's own state.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const state = await getCurrentState(client, userId);
      const payload = formatCurrentState(state);
      return toolResult(payload as unknown as Record<string, unknown>);
    },
  );
}
