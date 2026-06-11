"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  applyActivationPlan,
  createMacrocycle,
  createMesocyclePlan,
  getMesocycleDetail,
  listMesocyclesByMacro,
} from "@/lib/queries/cycles";
import { getActiveEngineParams } from "@/lib/queries/engine";
import { getProfile } from "@/lib/queries/profiles";
import { buildActivationPlan } from "@/lib/plan/activation";
import {
  DEFAULT_INITIAL_SETS,
  RIR_END,
  RIR_START,
} from "@/lib/plan/constants";
import type { EquipmentType } from "@/lib/types/database";

const macroSchema = z.object({
  name: z.string().min(1).max(80),
  goal_type: z.enum(["cut", "gain", "maintain"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  target_end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export interface MacroFormState {
  error: string | null;
}

export async function createMacrocycleAction(
  _prev: MacroFormState,
  formData: FormData,
): Promise<MacroFormState> {
  const parsed = macroSchema.safeParse({
    name: formData.get("name"),
    goal_type: formData.get("goal_type"),
    start_date: formData.get("start_date"),
    target_end_date: formData.get("target_end_date") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await createMacrocycle(supabase, user.id, parsed.data);
  revalidatePath("/cycles");
  return { error: null };
}

const slotSchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  position: z.number().int().min(1),
  exercise_id: z.string().uuid(),
});

// The RIR ramp is built in (docs/08-ui-design-corpus.md §5) and set/rep
// detail belongs to the week — the plan payload is structure + exercises only.
const mesoPlanSchema = z
  .object({
    macrocycle_id: z.string().uuid(),
    name: z.string().min(1).max(80),
    weeks: z.number().int().min(3).max(6),
    days_per_week: z.number().int().min(1).max(7),
    includes_deload: z.boolean(),
    exercises: z.array(slotSchema).min(1),
  })
  .refine(
    (p) => p.exercises.every((e) => e.day_of_week <= p.days_per_week),
    { message: "Exercise assigned to a day outside the plan" },
  )
  .refine(
    (p) =>
      Array.from({ length: p.days_per_week }, (_, i) => i + 1).every((day) =>
        p.exercises.some((e) => e.day_of_week === day),
      ),
    { message: "Every day needs at least one exercise" },
  );

export interface MesoFormState {
  error: string | null;
}

export async function createMesocycleAction(
  _prev: MesoFormState,
  formData: FormData,
): Promise<MesoFormState> {
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("plan")));
  } catch {
    return { error: "Malformed plan payload" };
  }
  const parsed = mesoPlanSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const meso = await createMesocyclePlan(supabase, user.id, {
    ...parsed.data,
    rir_start: RIR_START,
    rir_end: RIR_END,
    start_date: null,
    exercises: parsed.data.exercises.map((slot) => ({
      ...slot,
      initial_weight: null,
      initial_reps: null,
      initial_sets: DEFAULT_INITIAL_SETS,
    })),
  });
  revalidatePath("/cycles");
  redirect(`/cycles/meso/${meso.id}`);
}

export async function startMesocycleAction(
  _prev: MesoFormState,
  formData: FormData,
): Promise<MesoFormState> {
  const idParse = z.string().uuid().safeParse(formData.get("mesocycle_id"));
  if (!idParse.success) return { error: "Invalid mesocycle" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const detail = await getMesocycleDetail(supabase, idParse.data);
  if (!detail) return { error: "Mesocycle not found" };
  const { meso, planItems } = detail;
  if (meso.status !== "planned") {
    return { error: "Only a planned mesocycle can be started" };
  }
  const siblings = await listMesocyclesByMacro(supabase, [meso.macrocycle_id]);
  if (siblings.some((m) => m.status === "active")) {
    return { error: "Another mesocycle in this macro is already active" };
  }

  const [profile, { params }] = await Promise.all([
    getProfile(supabase, user.id),
    getActiveEngineParams(supabase),
  ]);
  if (!profile) return { error: "Profile missing" };

  const { data: exercises, error: exError } = await supabase
    .from("exercises")
    .select("id, equipment_type")
    .in("id", [...new Set(planItems.map((p) => p.exercise_id))]);
  if (exError) throw exError;
  const equipmentByExercise = Object.fromEntries(
    (exercises ?? []).map((e) => [e.id, e.equipment_type as EquipmentType]),
  );

  const startDate =
    meso.start_date ?? new Date().toISOString().slice(0, 10);
  const plan = buildActivationPlan(
    meso,
    planItems,
    equipmentByExercise,
    {
      units: profile.units,
      experienceLevel: profile.experience_level ?? "beginner",
    },
    params,
    startDate,
  );

  await applyActivationPlan(supabase, user.id, meso, plan);
  revalidatePath("/cycles");
  revalidatePath(`/cycles/meso/${meso.id}`);
  revalidatePath("/today");
  return { error: null };
}
