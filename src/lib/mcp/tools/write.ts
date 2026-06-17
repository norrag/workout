import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MacroGoalType, EquipmentType } from "@/lib/types/database";
import { getProfile } from "@/lib/queries/profiles";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  createMacrocycleWithMesos,
  updateMacrocycle,
  type EditMacroInput,
} from "@/lib/queries/macro";
import {
  createMesocycle,
  saveMesoPlan,
  type PlanDayInput,
} from "@/lib/queries/cycles";
import {
  createCustomExercise,
  listMuscleGroups,
  addExclusion,
  removeExclusionByExercise,
} from "@/lib/queries/exercises";
import { savePinnedNote, clearPinnedNote } from "@/lib/queries/logging";
import { saveMesoAsTemplate } from "@/lib/queries/templates";
import { resolveSession, type McpExtra } from "../session";
import { recordMcpWrite } from "../audit";

/**
 * Slice 3 write/planning tools (07 Phase 6, 05 §Write). The model proposes
 * *structure*; the **engine** fills every prescribed number (loads, reps, sets,
 * targets) — see `createMacrocycleWithMesos` / `startMeso`. Writes are
 * draft/append only: mesocycles land as `planned` for in-app review, notes/
 * exclusions are reversible, and **no tool deletes logged history** (hard rule
 * #5). Every successful write records a `mcp_write_audit` row. Identity is
 * always the session's; no tool takes a `user_id`.
 */

function jsonResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

// --- muscle-group name resolution (pure) -----------------------------------

export interface GroupResolution {
  byName: Map<string, string>;
  missing: string[];
}

/** Map requested muscle-group names onto the library's ids (case-insensitive). */
export function resolveMuscleGroupIds(
  names: string[],
  groups: { id: string; name: string }[],
): GroupResolution {
  const idByLower = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));
  const byName = new Map<string, string>();
  const missing: string[] = [];
  for (const name of names) {
    const id = idByLower.get(name.trim().toLowerCase());
    if (id) byName.set(name, id);
    else if (!missing.includes(name)) missing.push(name);
  }
  return { byName, missing };
}

// --- create_macrocycle -----------------------------------------------------

export const CREATE_MACROCYCLE = "create_macrocycle";
function registerCreateMacrocycle(server: McpServer) {
  server.registerTool(
    CREATE_MACROCYCLE,
    {
      title: "Create macrocycle",
      description:
        "Draft a macrocycle from a goal and block length. The ENGINE computes the " +
        "profile-personalized target, a recommended timeframe, the mesocycle count, " +
        "and suggested phases — you never invent those numbers. Creates the macro " +
        "with its unplanned mesocycle placeholders for the user to plan in-app.",
      inputSchema: {
        name: z.string().min(1).max(80),
        goal: z.enum(["hypertrophy", "strength", "cut", "maintain"]),
        meso_length_weeks: z.number().int().min(3).max(8),
        duration_months: z.number().int().min(1).max(24).optional(),
        goal_notes: z.string().max(500).optional(),
      },
    },
    async (
      args: {
        name: string;
        goal: MacroGoalType;
        meso_length_weeks: number;
        duration_months?: number;
        goal_notes?: string;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const profile = await getProfile(client, userId);
      if (!profile)
        return jsonResult({ ok: false, error: "The user has no profile yet." });
      const { params } = await getActiveEngineParams(client);
      const macro = await createMacrocycleWithMesos(
        client,
        userId,
        {
          name: args.name,
          goal_type: args.goal,
          duration_months: args.duration_months ?? null,
          meso_length_weeks: args.meso_length_weeks,
          start_date: new Date().toISOString().slice(0, 10),
          goal_notes: args.goal_notes ?? null,
        },
        profile,
        params,
      );
      const summary = `created macrocycle "${args.name}" (${args.goal})`;
      await recordMcpWrite(userId, CREATE_MACROCYCLE, args, summary);
      return jsonResult({
        ok: true,
        macrocycle_id: macro.id,
        summary: `${summary}. The engine sized its mesocycle placeholders; plan them in-app.`,
      });
    },
  );
}

// --- create_mesocycle ------------------------------------------------------

const mesoDaySchema = z.object({
  day_number: z.number().int().min(1).max(7),
  label: z.string().max(40).optional(),
  weekday: z.number().int().min(1).max(7).optional(),
  groups: z
    .array(
      z.object({
        muscle_group: z.string().min(1),
        exercises: z
          .array(
            z.object({
              exercise_id: z.string().uuid(),
              sets: z.number().int().min(1).max(10).optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export const CREATE_MESOCYCLE = "create_mesocycle";
function registerCreateMesocycle(server: McpServer) {
  server.registerTool(
    CREATE_MESOCYCLE,
    {
      title: "Create mesocycle",
      description:
        "Draft a groups-first mesocycle (days → muscle-group blocks → exercises) " +
        "as a PLANNED meso for in-app review before activation. You set the " +
        "structure and RIR ramp; the engine computes the actual loads/reps/sets " +
        "when the meso is started. Get exercise ids from search_exercises. " +
        "Standalone (not attached to a macro slot — do that in-app).",
      inputSchema: {
        name: z.string().min(1).max(80),
        weeks: z.number().int().min(3).max(8),
        includes_deload: z.boolean().optional(),
        rir_start: z.number().int().min(0).max(6).optional(),
        rir_end: z.number().int().min(0).max(6).optional(),
        days: z.array(mesoDaySchema).min(1).max(7),
      },
    },
    async (
      args: {
        name: string;
        weeks: number;
        includes_deload?: boolean;
        rir_start?: number;
        rir_end?: number;
        days: z.infer<typeof mesoDaySchema>[];
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);

      // resolve every muscle-group name up front so a typo fails cleanly
      const groupNames = args.days.flatMap((d) => d.groups.map((g) => g.muscle_group));
      const { byName, missing } = resolveMuscleGroupIds(
        groupNames,
        await listMuscleGroups(client),
      );
      if (missing.length > 0)
        return jsonResult({
          ok: false,
          error: `unknown muscle group(s): ${missing.join(", ")}. Use exact library names.`,
        });

      const meso = await createMesocycle(client, userId, {
        name: args.name,
        weeks: args.weeks,
        includes_deload: args.includes_deload ?? true,
        rir_start: args.rir_start ?? 3,
        rir_end: args.rir_end ?? 0,
        status: "planned",
      });

      const days: PlanDayInput[] = args.days.map((day) => ({
        day_number: day.day_number,
        label: day.label ?? null,
        weekday: day.weekday ?? null,
        groups: day.groups.map((g) => ({
          muscle_group_id: byName.get(g.muscle_group)!,
          exercise_slots: g.exercises.length,
          fills: g.exercises.map((ex, i) => ({
            slot_number: i + 1,
            exercise_id: ex.exercise_id,
            initial_sets: ex.sets ?? 3,
          })),
        })),
      }));
      await saveMesoPlan(client, userId, meso.id, days);

      const summary = `drafted mesocycle "${args.name}" (${args.weeks} wk, ${args.days.length} day/wk) as planned`;
      await recordMcpWrite(userId, CREATE_MESOCYCLE, args, summary);
      return jsonResult({
        ok: true,
        mesocycle_id: meso.id,
        summary: `${summary}. Review and start it in-app; the engine sets the numbers on activation.`,
      });
    },
  );
}

// --- create_template -------------------------------------------------------

export const CREATE_TEMPLATE = "create_template";
function registerCreateTemplate(server: McpServer) {
  server.registerTool(
    CREATE_TEMPLATE,
    {
      title: "Create template",
      description:
        "Save an existing mesocycle's structure as a reusable template (days, " +
        "muscle-group blocks, slot fills). Pass the mesocycle id.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const { template, error } = await saveMesoAsTemplate(client, userId, mesocycle_id);
      if (error || !template) return jsonResult({ ok: false, error: error ?? "failed" });
      const summary = `saved template "${template.name}" from a mesocycle`;
      await recordMcpWrite(userId, CREATE_TEMPLATE, { mesocycle_id }, summary);
      return jsonResult({ ok: true, template_id: template.id, summary });
    },
  );
}

// --- create_custom_exercise ------------------------------------------------

export const CREATE_CUSTOM_EXERCISE = "create_custom_exercise";
function registerCreateCustomExercise(server: McpServer) {
  server.registerTool(
    CREATE_CUSTOM_EXERCISE,
    {
      title: "Create custom exercise",
      description:
        "Add a custom exercise to the user's library: name, equipment type, " +
        "optional description, and its muscle groups (by name, each primary or " +
        "secondary).",
      inputSchema: {
        name: z.string().min(1).max(80),
        equipment_type: z.string().min(1),
        description: z.string().max(500).optional(),
        muscle_groups: z
          .array(
            z.object({
              muscle_group: z.string().min(1),
              role: z.enum(["primary", "secondary"]),
            }),
          )
          .min(1),
      },
    },
    async (
      args: {
        name: string;
        equipment_type: string;
        description?: string;
        muscle_groups: { muscle_group: string; role: "primary" | "secondary" }[];
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const { byName, missing } = resolveMuscleGroupIds(
        args.muscle_groups.map((m) => m.muscle_group),
        await listMuscleGroups(client),
      );
      if (missing.length > 0)
        return jsonResult({
          ok: false,
          error: `unknown muscle group(s): ${missing.join(", ")}.`,
        });
      const exercise = await createCustomExercise(client, userId, {
        name: args.name,
        equipment_type: args.equipment_type as EquipmentType,
        description: args.description ?? null,
        muscle_groups: args.muscle_groups.map((m) => ({
          muscle_group_id: byName.get(m.muscle_group)!,
          role: m.role,
        })),
      });
      const summary = `created custom exercise "${args.name}"`;
      await recordMcpWrite(userId, CREATE_CUSTOM_EXERCISE, args, summary);
      return jsonResult({ ok: true, exercise_id: exercise.id, summary });
    },
  );
}

// --- update_macrocycle_goals -----------------------------------------------

export const UPDATE_MACROCYCLE_GOALS = "update_macrocycle_goals";
function registerUpdateMacrocycleGoals(server: McpServer) {
  server.registerTool(
    UPDATE_MACROCYCLE_GOALS,
    {
      title: "Update macrocycle goals",
      description:
        "Edit a macrocycle's goal / duration / block length / name / notes. The " +
        "engine recomputes the target and phases. Only unplanned mesocycle slots " +
        "reconcile; planned/active/completed mesos and logged history are never " +
        "touched.",
      inputSchema: {
        macrocycle_id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        goal: z.enum(["hypertrophy", "strength", "cut", "maintain"]).optional(),
        meso_length_weeks: z.number().int().min(3).max(8).optional(),
        duration_months: z.number().int().min(1).max(24).nullable().optional(),
        goal_notes: z.string().max(500).nullable().optional(),
      },
    },
    async (
      args: {
        macrocycle_id: string;
        name?: string;
        goal?: MacroGoalType;
        meso_length_weeks?: number;
        duration_months?: number | null;
        goal_notes?: string | null;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const profile = await getProfile(client, userId);
      if (!profile) return jsonResult({ ok: false, error: "The user has no profile yet." });

      const { data: macro, error } = await client
        .from("macrocycles")
        .select("*")
        .eq("id", args.macrocycle_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!macro) return jsonResult({ ok: false, error: "Macrocycle not found." });

      const input: EditMacroInput = {
        name: args.name ?? macro.name,
        goal_type: args.goal ?? macro.goal_type,
        meso_length_weeks: args.meso_length_weeks ?? macro.meso_length_weeks,
        duration_months:
          args.duration_months !== undefined
            ? args.duration_months
            : macro.duration_months,
        goal_notes:
          args.goal_notes !== undefined ? args.goal_notes : macro.goal_notes,
      };
      const { params } = await getActiveEngineParams(client);
      await updateMacrocycle(client, userId, args.macrocycle_id, input, profile, params);
      const summary = `updated macrocycle "${input.name}" goals (engine re-planned open slots)`;
      await recordMcpWrite(userId, UPDATE_MACROCYCLE_GOALS, args, summary);
      return jsonResult({ ok: true, macrocycle_id: args.macrocycle_id, summary });
    },
  );
}

// --- manage_exclusions -----------------------------------------------------

export const MANAGE_EXCLUSIONS = "manage_exclusions";
function registerManageExclusions(server: McpServer) {
  server.registerTool(
    MANAGE_EXCLUSIONS,
    {
      title: "Manage exclusions",
      description:
        "Add or remove an excluded exercise (excluded movements never appear in " +
        "pickers and should never be recommended). Provide the exercise id and, " +
        "for an add, an optional reason.",
      inputSchema: {
        action: z.enum(["add", "remove"]),
        exercise_id: z.string().uuid(),
        reason: z.string().max(200).optional(),
      },
    },
    async (
      args: { action: "add" | "remove"; exercise_id: string; reason?: string },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      if (args.action === "add")
        await addExclusion(client, userId, args.exercise_id, args.reason ?? null);
      else await removeExclusionByExercise(client, userId, args.exercise_id);
      const summary = `${args.action === "add" ? "excluded" : "un-excluded"} an exercise`;
      await recordMcpWrite(userId, MANAGE_EXCLUSIONS, args, summary);
      return jsonResult({ ok: true, summary });
    },
  );
}

// --- log_note --------------------------------------------------------------

export const LOG_NOTE = "log_note";
function registerLogNote(server: McpServer) {
  server.registerTool(
    LOG_NOTE,
    {
      title: "Log a pinned exercise note",
      description:
        "Set (or clear) the durable PINNED note on an exercise — cross-workout " +
        "context like grip, setup, or a nagging caveat. An empty body clears it. " +
        "Per-session log notes are written in the live workout, not here.",
      inputSchema: {
        exercise_id: z.string().uuid(),
        body: z.string().max(1000),
      },
    },
    async (
      args: { exercise_id: string; body: string },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const trimmed = args.body.trim();
      if (trimmed.length === 0) {
        await clearPinnedNote(client, userId, args.exercise_id);
        await recordMcpWrite(userId, LOG_NOTE, { exercise_id: args.exercise_id }, "cleared a pinned note");
        return jsonResult({ ok: true, summary: "cleared the pinned note" });
      }
      await savePinnedNote(client, userId, args.exercise_id, trimmed);
      await recordMcpWrite(userId, LOG_NOTE, { exercise_id: args.exercise_id }, "set a pinned note");
      return jsonResult({ ok: true, summary: "set the pinned note" });
    },
  );
}

// --- registry --------------------------------------------------------------

export function registerWriteTools(server: McpServer) {
  registerCreateMacrocycle(server);
  registerCreateMesocycle(server);
  registerCreateTemplate(server);
  registerCreateCustomExercise(server);
  registerUpdateMacrocycleGoals(server);
  registerManageExclusions(server);
  registerLogNote(server);
}
