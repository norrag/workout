import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
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
    rir_ramp: {
      start: number;
      end: number;
      /** N18-B: explicit per-working-week override; null = the linear ramp */
      schedule: number[] | null;
    };
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
  /**
   * doc 21 §8 — exercise-level RIR assignments live this week. Present only
   * when something is assigned, so a plan without one reads exactly as it did
   * before the lever existed.
   */
  effort_assignments?: {
    day_number: number;
    exercise_id: string;
    exercise_name: string | null;
    target_rir: number;
    week_target_rir: number;
    set_cap: number | null;
    /** doc 21 §4.2 — `bottom|center|top` or an explicit rep count; null = the
     *  climb schedule decides (the default) */
    rep_position: string | number | null;
    reason: string | null;
    backed_off: boolean;
  }[];
  /** one-line orientation for the model */
  summary: string;
}

/** Pure shaping of the query result — unit-testable without I/O. */
export function formatCurrentState(state: CurrentState): CurrentStatePayload {
  const { macrocycle, mesocycle, microcycle, nextWorkout } = state;
  const effort = state.slotEffort ?? [];

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
  // doc 21 §8: state the authored effort level before anything narrates the
  // engine's reasoning — the numbers on those slots are a coach's ask, not a
  // progression decision. The RIR sentence covers only the slots that actually
  // carry a RIR assignment; a slot carrying just a set cap or a rep position is
  // not "running at an assigned RIR" and gets its own clause (doc 21 Phase 4).
  const rirAssigned = effort.filter((e) => e.assignedRir != null);
  const otherLevers = effort.filter(
    (e) => e.setCap != null || e.repPosition != null,
  );
  if (rirAssigned.length > 0) {
    summary += ` ${rirAssigned.length} exercise${rirAssigned.length === 1 ? " runs" : "s run"} at an assigned RIR this week (${rirAssigned
      .map(
        (e) =>
          `day ${e.dayNumber} ${e.exerciseName ?? e.exerciseId}: RIR ${e.rir}${
            e.reason ? ` — ${e.reason}` : ""
          }`,
      )
      .join("; ")}), overriding the week's ramp; no progression is earned on a slot running easier than its week.`;
  }
  if (otherLevers.length > 0) {
    summary += ` ${otherLevers.length} exercise${otherLevers.length === 1 ? " carries" : "s carry"} an authored ${otherLevers.length === 1 ? "limit" : "limits"} this week (${otherLevers
      .map((e) => {
        const parts = [
          e.setCap != null
            ? `capped at ${e.setCap} set${e.setCap === 1 ? "" : "s"}`
            : null,
          e.repPosition != null ? `priced at ${repPositionWords(e.repPosition)}` : null,
        ].filter(Boolean);
        return `day ${e.dayNumber} ${e.exerciseName ?? e.exerciseId}: ${parts.join(", ")}`;
      })
      .join("; ")}).`;
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
          rir_ramp: {
            start: mesocycle.rir_start,
            end: mesocycle.rir_end,
            schedule: mesocycle.rir_schedule,
          },
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
    ...(effort.length > 0
      ? {
          effort_assignments: effort.map((e) => ({
            day_number: e.dayNumber,
            exercise_id: e.exerciseId,
            exercise_name: e.exerciseName,
            target_rir: e.rir,
            week_target_rir: e.weekRir,
            set_cap: e.setCap,
            rep_position: e.repPosition,
            reason: e.reason,
            backed_off: e.backedOff,
          })),
        }
      : {}),
    summary,
  };
}

/** doc 21 §4.2 — the rep position in words, for the prose summary. */
function repPositionWords(position: string | number): string {
  if (typeof position === "number") return `${position} reps`;
  return position === "bottom"
    ? "the bottom of the rep window"
    : position === "top"
      ? "the top of the rep window"
      : "the middle of the rep window";
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
        "target RIR, plus any exercise-level RIR assignment running this week " +
        "(an authored effort level that overrides the week's ramp for one " +
        "exercise, with its reason), plus any working-set cap or rep position " +
        "assigned to a slot. Call this first to ground any coaching or " +
        "planning. More than one mesocycle can be live at once (a standalone " +
        "block running alongside a macrocycle's block); the one reported here " +
        "is the one holding the most recently logged set — the block the " +
        "athlete is actually training right now. Takes no arguments — it " +
        "always reports the authenticated user's own state.",
      inputSchema: {},
    },
    async (_args: Record<string, never>, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const state = await getCurrentState(client, userId, { includeSlotEffort: true });
      const payload = formatCurrentState(state);
      return toolResult(payload as unknown as Record<string, unknown>);
    },
  );
}
