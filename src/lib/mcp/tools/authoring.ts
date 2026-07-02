import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assessMuscleVolume,
  volumeCountingWeights,
  type ExperienceLevel,
  type VolumeCountingWeights,
} from "@/lib/engine";
import { getProfile } from "@/lib/queries/profiles";
import {
  getActiveEngineParams,
  startMeso,
} from "@/lib/queries/generation";
import {
  attachMesoToMacro,
  manageMacroSlots,
  type MacroSlotAction,
} from "@/lib/queries/macro";
import {
  getMesoPlan,
  duplicateMesocycle,
  updateMesocycleAttrs,
  type MesoPlan,
} from "@/lib/queries/cycles";
import { listMuscleGroups } from "@/lib/queries/exercises";
import { getMusclesForExercises } from "@/lib/queries/exercises";
import { resolveSession, type McpExtra } from "../session";
import { toolResult } from "../envelope";
import { recordMcpWrite } from "../audit";
import { resolveMuscleGroupIds } from "./write";
import { formatMesoPlan } from "./read";

/**
 * MCP authoring surface for planning *into a macrocycle* (05 §Write, the
 * mesocycle-authoring needs doc). These tools close the gap where the connector
 * could only ever produce a standalone draft: place a plan in a macro slot,
 * edit a meso's own header, duplicate a block, manage a macro's slots, and — the
 * one real state change — activate a reviewed plan (gated, sequential). Plus a
 * non-persisting volume preview so a draft self-checks against the athlete's
 * landmarks before it's ever written. The engine still owns every prescribed
 * number; the LLM proposes structure. No tool takes a `user_id`; every write is
 * audited.
 */

function jsonResult(payload: Record<string, unknown>) {
  return toolResult(payload);
}

/** A fresh plan snapshot (day_id/slot_id/etc.) so the model can keep editing
 *  without a separate get_mesocycle round-trip (needs-doc force-multiplier #8). */
async function planSnapshot(
  client: Parameters<typeof getMesoPlan>[0],
  mesoId: string,
): Promise<Record<string, unknown>> {
  const plan = await getMesoPlan(client, mesoId);
  if (!plan) return { found: false };
  const exerciseIds = plan.days.flatMap((d) =>
    d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id)),
  );
  const roles = await getMusclesForExercises(client, exerciseIds);
  return formatMesoPlan(plan, roles);
}

// --- volume preview (pure) -------------------------------------------------

export interface GroupSets {
  muscle_group: string;
  sets: number;
}

/**
 * Aggregate a plan's slots into fractional weekly working sets per muscle
 * group (doc 10 §2, R14): when a slot's exercise roles are known, its
 * `initial_sets` credit 1.0 to each primary and 0.5 to each secondary muscle
 * (weights from `engine_params.volume`); slots without roles (proposed `days`
 * specs with no exercise ids, or unlinked exercises) credit the block's group
 * at the direct weight — matching the weekly-volume view's fallback. Pure.
 */
export function weeklySetsByGroup(
  days: {
    groups: {
      muscle_group: string;
      fills: { initial_sets: number | null; exercise_id?: string | null }[];
    }[];
  }[],
  rolesByExercise: Map<
    string,
    { name: string; role: "primary" | "secondary" }[]
  > = new Map(),
  weights: VolumeCountingWeights = { direct: 1.0, indirect: 0.5 },
): GroupSets[] {
  const byGroup = new Map<string, number>();
  const credit = (group: string, amount: number) =>
    byGroup.set(
      group,
      Math.round(((byGroup.get(group) ?? 0) + amount) * 100) / 100,
    );
  for (const day of days)
    for (const g of day.groups)
      for (const f of g.fills) {
        const sets = f.initial_sets ?? 0;
        const roles = f.exercise_id
          ? rolesByExercise.get(f.exercise_id)
          : undefined;
        if (roles && roles.length > 0) {
          for (const r of roles)
            credit(
              r.name,
              sets * (r.role === "primary" ? weights.direct : weights.indirect),
            );
        } else {
          credit(g.muscle_group, sets * weights.direct);
        }
      }
  return [...byGroup.entries()]
    .map(([muscle_group, sets]) => ({ muscle_group, sets }))
    .sort((a, b) => b.sets - a.sets);
}

/**
 * Assess weekly sets per muscle group against the experience-scaled MEV/MAV/MRV
 * band (10 §2). Pure given params + experience — the same landmark read as
 * get_muscle_balance, but over a proposed (unsaved) plan.
 */
export function previewVolume(
  groupSets: GroupSets[],
  params: Parameters<typeof assessMuscleVolume>[0],
  experience: ExperienceLevel,
) {
  const perMuscle = groupSets.map((g) => {
    const lm = assessMuscleVolume(params, g.muscle_group, g.sets, experience);
    return {
      muscle_group: g.muscle_group,
      weekly_sets: g.sets,
      landmark: lm
        ? { mev: lm.mev, mav: lm.mav, mrv: lm.mrv, zone: lm.zone, note: lm.note }
        : null,
    };
  });
  const belowMev = perMuscle
    .filter((m) => m.landmark?.zone === "below_mev")
    .map((m) => m.muscle_group);
  const aboveMrv = perMuscle
    .filter((m) => m.landmark?.zone === "above_mrv")
    .map((m) => m.muscle_group);
  return { perMuscle, belowMev, aboveMrv };
}

// --- place_mesocycle -------------------------------------------------------

export const PLACE_MESOCYCLE = "place_mesocycle";
function registerPlaceMesocycle(server: McpServer) {
  server.registerTool(
    PLACE_MESOCYCLE,
    {
      title: "Place mesocycle into a macrocycle",
      description:
        "Attach an existing standalone planned/draft mesocycle into a macrocycle " +
        "slot — rescuing a draft you built earlier so the athlete sees it in " +
        "context, no hand-placing. Omit position to fill the earliest open " +
        "(unplanned) slot; give a position to insert at that slot (a placeholder " +
        "there is absorbed and its phase inherited). The meso stays PLANNED for " +
        "in-app review and activation — placing never starts it.",
      inputSchema: {
        mesocycle_id: z.string().uuid(),
        macrocycle_id: z.string().uuid(),
        position: z.number().int().min(1).max(24).optional(),
      },
    },
    async (
      args: { mesocycle_id: string; macrocycle_id: string; position?: number },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const res = await attachMesoToMacro(
        client,
        userId,
        args.mesocycle_id,
        args.macrocycle_id,
        args.position ?? null,
      );
      if (!res.ok) return jsonResult({ ok: false, error: res.error });
      const summary = `placed mesocycle into the macrocycle at position ${res.position}`;
      await recordMcpWrite(userId, PLACE_MESOCYCLE, args, summary);
      return jsonResult({
        ok: true,
        mesocycle_id: args.mesocycle_id,
        position: res.position,
        consumed_placeholder: res.consumed_placeholder,
        summary: `${summary}. Review and activate it in-app (or with activate_mesocycle).`,
      });
    },
  );
}

// --- duplicate_mesocycle ---------------------------------------------------

export const DUPLICATE_MESOCYCLE = "duplicate_mesocycle";
function registerDuplicateMesocycle(server: McpServer) {
  server.registerTool(
    DUPLICATE_MESOCYCLE,
    {
      title: "Duplicate mesocycle",
      description:
        "Clone a mesocycle — its settings (weeks, deload, RIR ramp) and its whole " +
        "planner board — into a new PLANNED meso (\"run last block back with a few " +
        "tweaks\"). Loads are NOT carried; the engine reseeds from the user's best " +
        "on activation. Optionally place the copy straight into a macrocycle slot " +
        "(macrocycle_id, optional position). Edit it afterward with edit_mesocycle " +
        "/ update_mesocycle.",
      inputSchema: {
        source_mesocycle_id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        macrocycle_id: z.string().uuid().optional(),
        position: z.number().int().min(1).max(24).optional(),
      },
    },
    async (
      args: {
        source_mesocycle_id: string;
        name?: string;
        macrocycle_id?: string;
        position?: number;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const { meso, error } = await duplicateMesocycle(
        client,
        userId,
        args.source_mesocycle_id,
        { name: args.name },
      );
      if (error || !meso) return jsonResult({ ok: false, error: error ?? "failed" });

      let placement: { position?: number; consumed_placeholder?: boolean } = {};
      if (args.macrocycle_id) {
        const res = await attachMesoToMacro(
          client,
          userId,
          meso.id,
          args.macrocycle_id,
          args.position ?? null,
        );
        if (!res.ok)
          return jsonResult({
            ok: false,
            mesocycle_id: meso.id,
            error: `duplicated, but placing it failed: ${res.error} The copy is a standalone planned draft.`,
          });
        placement = { position: res.position, consumed_placeholder: res.consumed_placeholder };
      }

      const summary = args.macrocycle_id
        ? `duplicated mesocycle "${meso.name}" into the macrocycle at position ${placement.position}`
        : `duplicated mesocycle "${meso.name}" as a standalone planned draft`;
      await recordMcpWrite(userId, DUPLICATE_MESOCYCLE, args, summary);
      return jsonResult({
        ok: true,
        mesocycle_id: meso.id,
        ...placement,
        plan: await planSnapshot(client, meso.id),
        summary: `${summary}. Review, tweak, and activate it in-app.`,
      });
    },
  );
}

// --- update_mesocycle ------------------------------------------------------

export const UPDATE_MESOCYCLE = "update_mesocycle";
function registerUpdateMesocycle(server: McpServer) {
  server.registerTool(
    UPDATE_MESOCYCLE,
    {
      title: "Update mesocycle attributes",
      description:
        "Edit a mesocycle's own header in place — name, phase " +
        "(accumulation/intensification/peak), length in weeks, deload flag, and " +
        "RIR ramp (start/end) — without demolishing the plan or losing its macro " +
        "placement. name/phase change on any unfinished meso; weeks/deload/RIR only " +
        "before it's started (an active meso's weeks are fixed — its microcycles " +
        "exist). The engine re-derives the numbers; exercises are edited with " +
        "edit_mesocycle.",
      inputSchema: {
        mesocycle_id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        phase: z
          .enum(["accumulation", "intensification", "peak"])
          .nullable()
          .optional(),
        weeks: z.number().int().min(3).max(8).optional(),
        includes_deload: z.boolean().optional(),
        rir_start: z.number().int().min(0).max(6).optional(),
        rir_end: z.number().int().min(0).max(6).optional(),
      },
    },
    async (
      args: {
        mesocycle_id: string;
        name?: string;
        phase?: "accumulation" | "intensification" | "peak" | null;
        weeks?: number;
        includes_deload?: boolean;
        rir_start?: number;
        rir_end?: number;
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      const { mesocycle_id, ...patch } = args;
      if (
        patch.rir_start !== undefined &&
        patch.rir_end !== undefined &&
        patch.rir_end > patch.rir_start
      )
        return jsonResult({
          ok: false,
          error: "rir_end must be at or below rir_start (a meso ramps RIR down).",
        });
      const res = await updateMesocycleAttrs(client, userId, mesocycle_id, patch);
      if (!res.ok) return jsonResult({ ok: false, error: res.error });
      const summary = `updated mesocycle header (${Object.keys(patch).join(", ")})`;
      await recordMcpWrite(userId, UPDATE_MESOCYCLE, args, summary);
      return jsonResult({
        ok: true,
        mesocycle_id,
        plan: await planSnapshot(client, mesocycle_id),
        summary,
      });
    },
  );
}

// --- manage_macrocycle_slots -----------------------------------------------

export const MANAGE_MACROCYCLE_SLOTS = "manage_macrocycle_slots";
function registerManageMacrocycleSlots(server: McpServer) {
  server.registerTool(
    MANAGE_MACROCYCLE_SLOTS,
    {
      title: "Manage macrocycle slots",
      description:
        "Reshape a macrocycle's mesocycle slots: add an empty (unplanned) slot, " +
        "remove an unplanned placeholder, or reorder every slot (pass all its " +
        "mesocycle ids in the new order). Only unplanned placeholders can be added " +
        "or removed — planned/active/completed mesos and their logged history are " +
        "never destroyed (use delete_mesocycle for a planned block).",
      inputSchema: {
        macrocycle_id: z.string().uuid(),
        action: z.enum(["add", "remove", "reorder"]),
        mesocycle_id: z.string().uuid().optional(),
        ordered_mesocycle_ids: z.array(z.string().uuid()).min(1).max(24).optional(),
      },
    },
    async (
      args: {
        macrocycle_id: string;
        action: "add" | "remove" | "reorder";
        mesocycle_id?: string;
        ordered_mesocycle_ids?: string[];
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);

      let op: MacroSlotAction;
      if (args.action === "add") op = { action: "add" };
      else if (args.action === "remove") {
        if (!args.mesocycle_id)
          return jsonResult({ ok: false, error: "remove needs a mesocycle_id (the slot to drop)." });
        op = { action: "remove", mesocycle_id: args.mesocycle_id };
      } else {
        if (!args.ordered_mesocycle_ids)
          return jsonResult({
            ok: false,
            error: "reorder needs ordered_mesocycle_ids (every slot id, in the new order).",
          });
        op = { action: "reorder", ordered_ids: args.ordered_mesocycle_ids };
      }

      const { data: macro, error } = await client
        .from("macrocycles")
        .select("meso_length_weeks")
        .eq("id", args.macrocycle_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!macro) return jsonResult({ ok: false, error: "Macrocycle not found." });

      const res = await manageMacroSlots(
        client,
        userId,
        args.macrocycle_id,
        op,
        macro.meso_length_weeks,
      );
      if (!res.ok) return jsonResult({ ok: false, error: res.error });
      await recordMcpWrite(userId, MANAGE_MACROCYCLE_SLOTS, args, res.summary ?? "");
      return jsonResult({ ok: true, summary: res.summary });
    },
  );
}

// --- activate_mesocycle ----------------------------------------------------

export const ACTIVATE_MESOCYCLE = "activate_mesocycle";
function registerActivateMesocycle(server: McpServer) {
  server.registerTool(
    ACTIVATE_MESOCYCLE,
    {
      title: "Activate mesocycle",
      description:
        "Turn a reviewed PLANNED mesocycle into the live block: the engine builds " +
        "the microcycle ramp and seeds week 1. This is the one real state change " +
        "with consequences, so it requires confirm=\"activate\". Within a " +
        "macrocycle it is sequential — a future block can't start until every " +
        "earlier block is complete and none is currently active, so its " +
        "prescriptions are seeded from the latest results, never in advance. " +
        "Prefer letting the athlete activate in-app; use this only on explicit " +
        "request.",
      inputSchema: {
        mesocycle_id: z.string().uuid(),
        confirm: z.string(),
      },
    },
    async (
      args: { mesocycle_id: string; confirm: string },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      if (args.confirm !== "activate")
        return jsonResult({
          ok: false,
          error: 'activation needs confirm="activate" — this starts the block and seeds week 1.',
        });
      const profile = await getProfile(client, userId);
      if (!profile) return jsonResult({ ok: false, error: "The user has no profile yet." });
      const { error } = await startMeso(client, userId, args.mesocycle_id, profile);
      if (error) return jsonResult({ ok: false, error });
      const summary = "activated a mesocycle (engine seeded week 1)";
      await recordMcpWrite(userId, ACTIVATE_MESOCYCLE, { mesocycle_id: args.mesocycle_id }, summary);
      return jsonResult({
        ok: true,
        mesocycle_id: args.mesocycle_id,
        summary: `${summary}. It's now the live block; the athlete trains it from the Workout tab.`,
      });
    },
  );
}

// --- preview_mesocycle_volume ----------------------------------------------

const previewDaySchema = z.object({
  groups: z
    .array(
      z.object({
        muscle_group: z.string().min(1),
        exercises: z
          .array(z.object({ sets: z.number().int().min(1).max(10).optional() }))
          .min(1),
      }),
    )
    .min(1),
});

export const PREVIEW_MESOCYCLE_VOLUME = "preview_mesocycle_volume";
function registerPreviewMesocycleVolume(server: McpServer) {
  server.registerTool(
    PREVIEW_MESOCYCLE_VOLUME,
    {
      title: "Preview mesocycle volume",
      description:
        "Project a plan's weekly working sets per muscle group against the " +
        "athlete's experience-scaled MEV/MAV/MRV landmarks — WITHOUT writing " +
        "anything — so a draft self-checks before you commit it. Pass a " +
        "mesocycle_id to preview an existing plan, OR a `days` spec (each day's " +
        "muscle_group blocks with the exercises and their starting sets — the same " +
        "shape create_mesocycle takes, exercise ids optional here). Counting is " +
        "fractional (doc 10 §2): an existing plan's sets credit 1.0 per primary + " +
        "0.5 per secondary muscle of each exercise (matching get_muscle_balance); " +
        "a proposed `days` spec without exercise ids credits the block's group. " +
        "Advisory only (10 §9).",
      inputSchema: {
        mesocycle_id: z.string().uuid().optional(),
        days: z.array(previewDaySchema).min(1).max(7).optional(),
      },
    },
    async (
      args: {
        mesocycle_id?: string;
        days?: z.infer<typeof previewDaySchema>[];
      },
      extra: McpExtra,
    ) => {
      const { client, userId } = resolveSession(extra);
      if ((args.mesocycle_id == null) === (args.days == null))
        return jsonResult({
          ok: false,
          error: "pass exactly one of mesocycle_id (an existing plan) or days (a proposed plan).",
        });

      const [profile, { params }] = await Promise.all([
        getProfile(client, userId),
        getActiveEngineParams(client),
      ]);
      const experience = (profile?.experience_level ?? "intermediate") as ExperienceLevel;

      let groupSets: GroupSets[];
      let source: string;
      if (args.mesocycle_id != null) {
        const plan = await getMesoPlan(client, args.mesocycle_id);
        if (!plan) return jsonResult({ ok: false, error: "Mesocycle not found." });
        // R14: fractional counting via each exercise's muscle roles
        const roles = await getMusclesForExercises(
          client,
          plan.days.flatMap((d) =>
            d.groups.flatMap((g) => g.fills.map((f) => f.exercise_id)),
          ),
        );
        groupSets = weeklySetsByGroup(
          planToGroupDays(plan),
          roles,
          volumeCountingWeights(params),
        );
        source = args.mesocycle_id;
      } else {
        // resolve muscle-group names so a typo fails cleanly, then aggregate the
        // proposed spec (each day counted once per week)
        const names = args.days!.flatMap((d) => d.groups.map((g) => g.muscle_group));
        const { missing } = resolveMuscleGroupIds(names, await listMuscleGroups(client));
        if (missing.length > 0)
          return jsonResult({
            ok: false,
            error: `unknown muscle group(s): ${missing.join(", ")}. Use exact library names.`,
          });
        groupSets = weeklySetsByGroup(
          args.days!.map((d) => ({
            groups: d.groups.map((g) => ({
              muscle_group: g.muscle_group,
              fills: g.exercises.map((e) => ({ initial_sets: e.sets ?? 3 })),
            })),
          })),
        );
        source = "proposed plan";
      }

      const { perMuscle, belowMev, aboveMrv } = previewVolume(groupSets, params, experience);
      const advisory: string[] = [];
      if (belowMev.length > 0)
        advisory.push(`Below MEV (likely under-dosed): ${belowMev.join(", ")}.`);
      if (aboveMrv.length > 0)
        advisory.push(`Above MRV (likely beyond recovery): ${aboveMrv.join(", ")}.`);
      if (advisory.length === 0)
        advisory.push("Every parameterized muscle group lands at or above MEV.");

      return jsonResult({
        ok: true,
        source,
        experience_level: experience,
        weekly_sets_per_muscle: perMuscle,
        below_mev: belowMev,
        above_mrv: aboveMrv,
        advisory: advisory.join(" "),
        note:
          "Week-1 planned sets vs MEV/MAV/MRV, scaled for the athlete's experience. " +
          "Nothing was written. Advisory only — heuristic landmarks with large " +
          "individual variance (10 §9).",
      });
    },
  );
}

/** Project a fetched MesoPlan into the group/fills shape weeklySetsByGroup wants. */
function planToGroupDays(plan: MesoPlan) {
  return plan.days.map((d) => ({
    groups: d.groups.map((g) => ({
      muscle_group: g.muscle_group,
      fills: g.fills.map((f) => ({
        initial_sets: f.initial_sets,
        exercise_id: f.exercise_id,
      })),
    })),
  }));
}

// --- registry --------------------------------------------------------------

export function registerAuthoringTools(server: McpServer) {
  registerPlaceMesocycle(server);
  registerDuplicateMesocycle(server);
  registerUpdateMesocycle(server);
  registerManageMacrocycleSlots(server);
  registerActivateMesocycle(server);
  registerPreviewMesocycleVolume(server);
}
