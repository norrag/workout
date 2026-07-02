import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MacroGoalType, EquipmentType } from "@/lib/types/database";
import { getProfile } from "@/lib/queries/profiles";
import { getActiveEngineParams } from "@/lib/queries/generation";
import {
  createMacrocycleWithMesos,
  updateMacrocycle,
  getMacroDeletionImpact,
  deleteMacrocycle,
  attachMesoToMacro,
  type EditMacroInput,
} from "@/lib/queries/macro";
import {
  createMesocycle,
  saveMesoPlan,
  getMesoDeletionImpact,
  deleteMesocycle,
  type PlanDayInput,
} from "@/lib/queries/cycles";
import {
  createCustomExercise,
  findUnknownExerciseIds,
  listMuscleGroups,
  addExclusion,
  removeExclusionByExercise,
  getExerciseDeletionImpact,
  deleteCustomExercise,
} from "@/lib/queries/exercises";
import { savePinnedNote, clearPinnedNote } from "@/lib/queries/logging";
import {
  saveMesoAsTemplate,
  applyTemplateToMeso,
  getTemplateDetail,
  deleteTemplate,
} from "@/lib/queries/templates";
import { resolveSession, type McpExtra } from "../session";
import { toolResult, type EnvelopeOpts } from "../envelope";
import { recordMcpWrite } from "../audit";
import { registerEditMesocycle } from "./edit";

/**
 * Slice 3 write/planning tools (07 Phase 6, 05 §Write). The model proposes
 * *structure*; the **engine** fills every prescribed number (loads, reps, sets,
 * targets) — see `createMacrocycleWithMesos` / `startMeso`. Writes are
 * draft/append only: mesocycles land as `planned` for in-app review, notes/
 * exclusions are reversible, and **no tool deletes logged history** (hard rule
 * #5). Every successful write records a `mcp_write_audit` row. Identity is
 * always the session's; no tool takes a `user_id`.
 */

function jsonResult(payload: Record<string, unknown>, opts: EnvelopeOpts = {}) {
  return toolResult(payload, opts);
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

/**
 * R3: validate a hand-built day plan BEFORE anything is written. Two shapes
 * zod can't see slip through name resolution and violate DB uniques mid-save:
 * a repeated day_number (`meso_days` unique) and two group entries resolving
 * to the same muscle group in one day — e.g. "Chest"/"chest" — (`meso_day_groups`
 * unique). Pure; returns the refusal message or null.
 */
export function validateMesoDayPlan(
  days: { day_number: number; groups: { muscle_group: string }[] }[],
  idByName: Map<string, string>,
): string | null {
  const seenDays = new Set<number>();
  for (const day of days) {
    if (seenDays.has(day.day_number))
      return `day_number ${day.day_number} appears more than once — one entry per day.`;
    seenDays.add(day.day_number);
    const seenGroups = new Map<string, string>();
    for (const g of day.groups) {
      const id = idByName.get(g.muscle_group);
      if (!id) continue; // unknown names are reported separately
      const first = seenGroups.get(id);
      if (first != null)
        return `day ${day.day_number} lists muscle group "${g.muscle_group}" twice (as "${first}") — merge its exercises into one block.`;
      seenGroups.set(id, g.muscle_group);
    }
  }
  return null;
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
          .min(1)
          // a muscle-group block holds at most 10 slots (DB check + planner cap);
          // bound it here so an oversized request fails clean, not mid-save (R3)
          .max(10),
      }),
    )
    .min(1)
    .max(20),
});

export const CREATE_MESOCYCLE = "create_mesocycle";
function registerCreateMesocycle(server: McpServer) {
  server.registerTool(
    CREATE_MESOCYCLE,
    {
      title: "Create mesocycle",
      description:
        "Draft a PLANNED meso for in-app review before activation, one of two ways: " +
        "(a) pass a template_id from search_templates to start from that template's " +
        "structure (the fastest path), or (b) build it from scratch by passing days " +
        "(groups-first: days → muscle-group blocks → exercises, exercise ids from " +
        "search_exercises). Pass exactly one of template_id or days. You set the " +
        "RIR ramp; the engine computes the actual loads/reps/sets when the meso is " +
        "started. Pass macrocycle_id (and optional position) to author it straight " +
        "into a macro slot — filling the earliest open slot by default; omit it for " +
        "a standalone draft you can place later with place_mesocycle. The meso lands " +
        "PLANNED (an unapproved draft) for the athlete to open, edit, and activate.",
      inputSchema: {
        name: z.string().min(1).max(80),
        weeks: z.number().int().min(3).max(8),
        includes_deload: z.boolean().optional(),
        rir_start: z.number().int().min(0).max(6).optional(),
        rir_end: z.number().int().min(0).max(6).optional(),
        template_id: z.string().uuid().optional(),
        days: z.array(mesoDaySchema).min(1).max(7).optional(),
        macrocycle_id: z.string().uuid().optional(),
        position: z.number().int().min(1).max(24).optional(),
      },
    },
    async (
      args: {
        name: string;
        weeks: number;
        includes_deload?: boolean;
        rir_start?: number;
        rir_end?: number;
        template_id?: string;
        days?: z.infer<typeof mesoDaySchema>[];
        macrocycle_id?: string;
        position?: number;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);

      // exactly one structure source: a template to start from, or a hand-built
      // day plan — never both, never neither
      if ((args.template_id == null) === (args.days == null))
        return jsonResult({
          ok: false,
          error: "pass exactly one of template_id (start from a template) or days (build from scratch).",
        });

      // optionally author straight into a macro slot; returns a placement note or
      // an error that leaves the created meso standing as a standalone draft
      const placeIntoMacro = async (
        mesoId: string,
      ): Promise<
        | { ok: true; note: string; position?: number }
        | { ok: false; error: string }
      > => {
        if (!args.macrocycle_id) return { ok: true, note: "" };
        const res = await attachMesoToMacro(
          client,
          userId,
          mesoId,
          args.macrocycle_id,
          args.position ?? null,
        );
        if (!res.ok)
          return {
            ok: false,
            error: `created the meso, but placing it into the macro failed: ${res.error} It's a standalone planned draft — place it with place_mesocycle.`,
          };
        return { ok: true, note: ` in the macrocycle at position ${res.position}`, position: res.position };
      };

      // --- start-from-template path (§5.9): templates are discoverable via
      // search_templates but had no execution path; wire that here.
      if (args.template_id != null) {
        const detail = await getTemplateDetail(client, args.template_id);
        if (!detail)
          return jsonResult({ ok: false, error: "template not found or not visible." });
        if (detail.days.length === 0)
          return jsonResult({ ok: false, error: "that template has no days to start from." });

        const meso = await createMesocycle(client, userId, {
          name: args.name,
          weeks: args.weeks,
          includes_deload: args.includes_deload ?? true,
          rir_start: args.rir_start ?? 3,
          rir_end: args.rir_end ?? 0,
          template_id: args.template_id,
          status: "planned",
        });
        await applyTemplateToMeso(client, userId, meso.id, args.template_id);

        const placed = await placeIntoMacro(meso.id);
        if (!placed.ok)
          return jsonResult({ ok: false, mesocycle_id: meso.id, error: placed.error });

        const summary = `drafted mesocycle "${args.name}" (${args.weeks} wk) from template "${detail.template.name}" as planned${placed.note}`;
        await recordMcpWrite(
          userId,
          CREATE_MESOCYCLE,
          { name: args.name, weeks: args.weeks, template_id: args.template_id, macrocycle_id: args.macrocycle_id },
          summary,
        );
        return jsonResult({
          ok: true,
          mesocycle_id: meso.id,
          position: placed.position,
          summary: `${summary}. Review and start it in-app; the engine sets the numbers on activation.`,
        });
      }

      const days = args.days!;
      // resolve every muscle-group name up front so a typo fails cleanly
      const groupNames = days.flatMap((d) => d.groups.map((g) => g.muscle_group));
      const { byName, missing } = resolveMuscleGroupIds(
        groupNames,
        await listMuscleGroups(client),
      );
      if (missing.length > 0)
        return jsonResult({
          ok: false,
          error: `unknown muscle group(s): ${missing.join(", ")}. Use exact library names.`,
        });

      // R3: everything that could fail the save is validated BEFORE any write —
      // duplicate day_numbers / same-group-twice-per-day (DB unique violations)
      // and unknown exercise ids (mirrors edit_mesocycle's check)
      const planError = validateMesoDayPlan(days, byName);
      if (planError) return jsonResult({ ok: false, error: planError });
      const unknown = await findUnknownExerciseIds(
        client,
        days.flatMap((d) =>
          d.groups.flatMap((g) => g.exercises.map((e) => e.exercise_id)),
        ),
      );
      if (unknown.length > 0)
        return jsonResult({
          ok: false,
          error: `unknown or not-visible exercise id(s): ${unknown.join(", ")}.`,
        });

      const meso = await createMesocycle(client, userId, {
        name: args.name,
        weeks: args.weeks,
        includes_deload: args.includes_deload ?? true,
        rir_start: args.rir_start ?? 3,
        rir_end: args.rir_end ?? 0,
        status: "planned",
      });

      const planDays: PlanDayInput[] = days.map((day) => {
        let dayPos = 0; // day-wide order across groups (#2)
        return {
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
            day_position: ++dayPos,
          })),
        })),
        };
      });
      try {
        await saveMesoPlan(client, userId, meso.id, planDays);
      } catch (e) {
        // the save is atomic (R3), so a failure left an EMPTY draft — remove it
        // rather than strand an orphan the model would recreate on retry
        await client.from("mesocycles").delete().eq("id", meso.id);
        throw e;
      }

      const placed = await placeIntoMacro(meso.id);
      if (!placed.ok)
        return jsonResult({ ok: false, mesocycle_id: meso.id, error: placed.error });

      const summary = `drafted mesocycle "${args.name}" (${args.weeks} wk, ${days.length} day/wk) as planned${placed.note}`;
      await recordMcpWrite(userId, CREATE_MESOCYCLE, args, summary);
      return jsonResult({
        ok: true,
        mesocycle_id: meso.id,
        position: placed.position,
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

// --- delete tools (§5.8 undo for the create tools) -------------------------
// Each refuses to touch logged history — past workouts are immutable (hard rule
// #5 / the review's editor note). They only ever remove planning artifacts a
// user (or the model) created by mistake.

export const DELETE_MESOCYCLE = "delete_mesocycle";
function registerDeleteMesocycle(server: McpServer) {
  server.registerTool(
    DELETE_MESOCYCLE,
    {
      title: "Delete mesocycle",
      description:
        "Delete a mesocycle the user created (undo for create_mesocycle). Refused " +
        "if any sets have been logged in it — logged history is never destroyed. " +
        "Use this only to remove a planned/empty block created by mistake.",
      inputSchema: { mesocycle_id: z.string().uuid() },
    },
    async ({ mesocycle_id }: { mesocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const impact = await getMesoDeletionImpact(client, userId, mesocycle_id);
      if (impact.hasHistory)
        return jsonResult({
          ok: false,
          error: `cannot delete: ${impact.loggedSets} logged set(s) exist in this mesocycle. Logged history is never destroyed.`,
        });
      await deleteMesocycle(client, userId, mesocycle_id);
      const summary = "deleted a planned mesocycle";
      await recordMcpWrite(userId, DELETE_MESOCYCLE, { mesocycle_id }, summary);
      return jsonResult({ ok: true, summary });
    },
  );
}

export const DELETE_MACROCYCLE = "delete_macrocycle";
function registerDeleteMacrocycle(server: McpServer) {
  server.registerTool(
    DELETE_MACROCYCLE,
    {
      title: "Delete macrocycle",
      description:
        "Delete a macrocycle the user created, along with its (unplanned/planned) " +
        "mesocycle placeholders (undo for create_macrocycle). Refused if any sets " +
        "have been logged under it or it holds an active/completed mesocycle — " +
        "logged history is never destroyed.",
      inputSchema: { macrocycle_id: z.string().uuid() },
    },
    async ({ macrocycle_id }: { macrocycle_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const impact = await getMacroDeletionImpact(client, userId, macrocycle_id);
      if (!impact.found)
        return jsonResult({ ok: false, error: "Macrocycle not found." });
      if (impact.hasHistory)
        return jsonResult({
          ok: false,
          error: `cannot delete: ${impact.loggedSets} logged set(s) exist under this macrocycle. Logged history is never destroyed.`,
        });
      if (impact.blockingMesos.length > 0)
        return jsonResult({
          ok: false,
          error: `cannot delete: it holds ${impact.blockingMesos.length} active/completed mesocycle(s) (${impact.blockingMesos
            .map((m) => `"${m.name}"`)
            .join(", ")}). Only an unstarted macrocycle can be removed.`,
        });
      await deleteMacrocycle(client, userId, macrocycle_id);
      const summary = `deleted a macrocycle and its ${impact.mesoCount} placeholder meso(s)`;
      await recordMcpWrite(userId, DELETE_MACROCYCLE, { macrocycle_id }, summary);
      return jsonResult({ ok: true, summary });
    },
  );
}

export const DELETE_TEMPLATE = "delete_template";
function registerDeleteTemplate(server: McpServer) {
  server.registerTool(
    DELETE_TEMPLATE,
    {
      title: "Delete template",
      description:
        "Delete one of the user's own templates (undo for create_template). Stock " +
        "library templates cannot be deleted. A mesocycle already started from the " +
        "template keeps its own copied plan and is unaffected.",
      inputSchema: { template_id: z.string().uuid() },
    },
    async ({ template_id }: { template_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const { ok, error } = await deleteTemplate(client, userId, template_id);
      if (!ok) return jsonResult({ ok: false, error });
      const summary = "deleted a custom template";
      await recordMcpWrite(userId, DELETE_TEMPLATE, { template_id }, summary);
      return jsonResult({ ok: true, summary });
    },
  );
}

export const DELETE_CUSTOM_EXERCISE = "delete_custom_exercise";
function registerDeleteCustomExercise(server: McpServer) {
  server.registerTool(
    DELETE_CUSTOM_EXERCISE,
    {
      title: "Delete custom exercise",
      description:
        "Delete a custom exercise the user added (undo for create_custom_exercise). " +
        "Refused for stock library exercises, for any exercise with logged sets " +
        "(deleting it would rewrite the past), and for one still referenced by a " +
        "planned mesocycle or generated workout. To stop recommending a movement " +
        "without deleting it, use manage_exclusions instead.",
      inputSchema: { exercise_id: z.string().uuid() },
    },
    async ({ exercise_id }: { exercise_id: string }, extra: McpExtra) => {
      const { client, userId } = resolveSession(extra);
      const impact = await getExerciseDeletionImpact(client, userId, exercise_id);
      if (!impact.found)
        return jsonResult({ ok: false, error: "Exercise not found." });
      if (!impact.isCustom)
        return jsonResult({
          ok: false,
          error: "that is a stock library exercise — only your own custom exercises can be deleted.",
        });
      if (impact.loggedSets > 0)
        return jsonResult({
          ok: false,
          error: `cannot delete: ${impact.loggedSets} logged set(s) reference this exercise. Logged history is never destroyed — exclude it instead (manage_exclusions).`,
        });
      if (impact.plannedRefs > 0 || impact.workoutRefs > 0)
        return jsonResult({
          ok: false,
          error: `cannot delete: still used by ${impact.plannedRefs} planned slot(s) and ${impact.workoutRefs} generated workout(s). Remove it from those first, or exclude it (manage_exclusions).`,
        });
      await deleteCustomExercise(client, userId, exercise_id);
      const summary = "deleted a custom exercise";
      await recordMcpWrite(userId, DELETE_CUSTOM_EXERCISE, { exercise_id }, summary);
      return jsonResult({ ok: true, summary });
    },
  );
}

// --- registry --------------------------------------------------------------

export function registerWriteTools(server: McpServer) {
  registerCreateMacrocycle(server);
  registerCreateMesocycle(server);
  registerEditMesocycle(server);
  registerCreateTemplate(server);
  registerCreateCustomExercise(server);
  registerUpdateMacrocycleGoals(server);
  registerManageExclusions(server);
  registerLogNote(server);
  registerDeleteMesocycle(server);
  registerDeleteMacrocycle(server);
  registerDeleteTemplate(server);
  registerDeleteCustomExercise(server);
}
