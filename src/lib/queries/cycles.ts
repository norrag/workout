import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  MacrocycleRow,
  MacroSlotRow,
  MesocycleRow,
  MesoDayGroupRow,
  MesoDayRow,
  MesoExerciseRow,
  MicrocycleRow,
  SlotGoalType,
  WorkoutRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// cycles overview (fig 2.1) — macros with goal-arc slots and their mesos,
// plus standalone mesos
// ---------------------------------------------------------------------------

export interface MacroWithSlots extends MacrocycleRow {
  slots: (MacroSlotRow & { mesocycle: MesocycleRow | null })[];
  /** mesos attached to the macro but not placed in a goal slot */
  unslotted: MesocycleRow[];
}

export interface CyclesOverview {
  macros: MacroWithSlots[];
  standaloneMesos: MesocycleRow[];
}

export async function getCyclesOverview(
  supabase: Client,
  userId: string,
): Promise<CyclesOverview> {
  const [
    { data: macros, error: macroError },
    { data: slots, error: slotError },
    { data: mesos, error: mesoError },
  ] = await Promise.all([
    supabase
      .from("macrocycles")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false }),
    supabase
      .from("macro_slots")
      .select("*")
      .eq("user_id", userId)
      .order("slot_number"),
    supabase
      .from("mesocycles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at"),
  ]);
  if (macroError) throw macroError;
  if (slotError) throw slotError;
  if (mesoError) throw mesoError;

  const mesoBySlot = new Map(
    (mesos ?? [])
      .filter((m) => m.macro_slot_id)
      .map((m) => [m.macro_slot_id!, m]),
  );

  return {
    macros: (macros ?? []).map((macro) => ({
      ...macro,
      slots: (slots ?? [])
        .filter((s) => s.macrocycle_id === macro.id)
        .map((s) => ({ ...s, mesocycle: mesoBySlot.get(s.id) ?? null })),
      unslotted: (mesos ?? []).filter(
        (m) => m.macrocycle_id === macro.id && !m.macro_slot_id,
      ),
    })),
    standaloneMesos: (mesos ?? []).filter((m) => !m.macrocycle_id),
  };
}

export async function listMacrocycles(
  supabase: Client,
): Promise<MacrocycleRow[]> {
  const { data, error } = await supabase
    .from("macrocycles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createMacrocycle(
  supabase: Client,
  userId: string,
  input: Pick<MacrocycleRow, "name" | "goal_type" | "start_date"> &
    Partial<Pick<MacrocycleRow, "goal_notes" | "target_end_date">> & {
      slots?: { goal_type: SlotGoalType; label: string | null }[];
    },
): Promise<MacrocycleRow> {
  const { data, error } = await supabase
    .from("macrocycles")
    .insert({
      user_id: userId,
      name: input.name,
      goal_type: input.goal_type,
      goal_notes: input.goal_notes ?? null,
      target_metrics: {},
      start_date: input.start_date,
      target_end_date: input.target_end_date ?? null,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;

  if (input.slots && input.slots.length > 0) {
    const { error: slotError } = await supabase.from("macro_slots").insert(
      input.slots.map((slot, i) => ({
        macrocycle_id: data.id,
        user_id: userId,
        slot_number: i + 1,
        goal_type: slot.goal_type,
        label: slot.label,
      })),
    );
    if (slotError) throw slotError;
  }
  return data;
}

// ---------------------------------------------------------------------------
// mesocycles — creation (fig 2.7) and the groups-first plan (figs 2.4–2.6)
// ---------------------------------------------------------------------------

export async function createMesocycle(
  supabase: Client,
  userId: string,
  input: {
    name: string;
    weeks: number;
    includes_deload: boolean;
    rir_start: number;
    rir_end: number;
    macro_slot_id: string | null;
    template_id?: string | null;
  },
): Promise<MesocycleRow> {
  let macrocycleId: string | null = null;
  if (input.macro_slot_id) {
    const { data: slot, error: slotError } = await supabase
      .from("macro_slots")
      .select("macrocycle_id")
      .eq("id", input.macro_slot_id)
      .single();
    if (slotError) throw slotError;
    macrocycleId = slot.macrocycle_id;
  }

  const { data, error } = await supabase
    .from("mesocycles")
    .insert({
      user_id: userId,
      macrocycle_id: macrocycleId,
      macro_slot_id: input.macro_slot_id,
      name: input.name,
      weeks: input.weeks,
      days_per_week: 1, // updated as days are added on the planner board
      includes_deload: input.includes_deload,
      rir_start: input.rir_start,
      rir_end: input.rir_end,
      status: "planned",
      template_id: input.template_id ?? null,
      start_date: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export interface SlotFill extends MesoExerciseRow {
  exercise_name: string;
}

export interface PlannedGroup extends MesoDayGroupRow {
  muscle_group: string;
  fills: SlotFill[];
}

export interface PlannedDay extends MesoDayRow {
  groups: PlannedGroup[];
}

export interface MesoPlan {
  meso: MesocycleRow;
  days: PlannedDay[];
}

export async function getMesoPlan(
  supabase: Client,
  mesoId: string,
): Promise<MesoPlan | null> {
  const { data: meso, error: mesoError } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("id", mesoId)
    .maybeSingle();
  if (mesoError) throw mesoError;
  if (!meso) return null;

  const [
    { data: days, error: dayError },
    { data: fills, error: fillError },
    { data: muscleGroups, error: mgError },
  ] = await Promise.all([
    supabase
      .from("meso_days")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("day_number"),
    supabase
      .from("meso_exercises")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("slot_number"),
    supabase.from("muscle_groups").select("*"),
  ]);
  if (dayError) throw dayError;
  if (fillError) throw fillError;
  if (mgError) throw mgError;

  const dayIds = (days ?? []).map((d) => d.id);
  let groups: MesoDayGroupRow[] = [];
  if (dayIds.length > 0) {
    const { data, error } = await supabase
      .from("meso_day_groups")
      .select("*")
      .in("meso_day_id", dayIds)
      .order("position");
    if (error) throw error;
    groups = data ?? [];
  }

  const exerciseIds = [...new Set((fills ?? []).map((f) => f.exercise_id))];
  let exerciseNames = new Map<string, string>();
  if (exerciseIds.length > 0) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", exerciseIds);
    if (error) throw error;
    exerciseNames = new Map((data ?? []).map((e) => [e.id, e.name]));
  }

  const mgNameById = new Map((muscleGroups ?? []).map((g) => [g.id, g.name]));

  // days auto-sort by weekday (08 §3 — no manual reorder); unset weekdays last
  const sortedDays = [...(days ?? [])].sort(
    (a, b) => (a.weekday ?? 8) - (b.weekday ?? 8) || a.day_number - b.day_number,
  );

  return {
    meso,
    days: sortedDays.map((day) => ({
      ...day,
      groups: groups
        .filter((g) => g.meso_day_id === day.id)
        .map((g) => ({
          ...g,
          muscle_group: mgNameById.get(g.muscle_group_id) ?? "",
          fills: (fills ?? [])
            .filter((f) => f.meso_day_group_id === g.id)
            .map((f) => ({
              ...f,
              exercise_name: exerciseNames.get(f.exercise_id) ?? "",
            })),
        })),
    })),
  };
}

export async function addMesoDay(
  supabase: Client,
  userId: string,
  mesoId: string,
  input: { label: string | null; weekday: number | null },
): Promise<MesoDayRow> {
  const { data: existing, error: existingError } = await supabase
    .from("meso_days")
    .select("day_number")
    .eq("mesocycle_id", mesoId)
    .order("day_number", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const nextNumber = (existing?.[0]?.day_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("meso_days")
    .insert({
      mesocycle_id: mesoId,
      user_id: userId,
      day_number: nextNumber,
      label: input.label,
      weekday: input.weekday,
    })
    .select()
    .single();
  if (error) throw error;
  await syncDaysPerWeek(supabase, mesoId);
  return data;
}

export async function updateMesoDay(
  supabase: Client,
  dayId: string,
  patch: Partial<Pick<MesoDayRow, "label" | "weekday">>,
): Promise<void> {
  const { error } = await supabase
    .from("meso_days")
    .update(patch)
    .eq("id", dayId);
  if (error) throw error;
}

export async function removeMesoDay(
  supabase: Client,
  dayId: string,
  mesoId: string,
): Promise<void> {
  const { error } = await supabase.from("meso_days").delete().eq("id", dayId);
  if (error) throw error;
  await syncDaysPerWeek(supabase, mesoId);
}

async function syncDaysPerWeek(supabase: Client, mesoId: string): Promise<void> {
  const { count, error } = await supabase
    .from("meso_days")
    .select("*", { count: "exact", head: true })
    .eq("mesocycle_id", mesoId);
  if (error) throw error;
  const { error: updateError } = await supabase
    .from("mesocycles")
    .update({ days_per_week: Math.max(1, count ?? 1) })
    .eq("id", mesoId);
  if (updateError) throw updateError;
}

export async function addDayGroup(
  supabase: Client,
  dayId: string,
  muscleGroupId: string,
  exerciseSlots: number,
): Promise<MesoDayGroupRow> {
  const { data: existing, error: existingError } = await supabase
    .from("meso_day_groups")
    .select("position")
    .eq("meso_day_id", dayId)
    .order("position", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;

  const { data, error } = await supabase
    .from("meso_day_groups")
    .insert({
      meso_day_id: dayId,
      muscle_group_id: muscleGroupId,
      position: (existing?.[0]?.position ?? 0) + 1,
      exercise_slots: exerciseSlots,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDayGroup(
  supabase: Client,
  groupId: string,
  patch: Partial<Pick<MesoDayGroupRow, "exercise_slots">>,
): Promise<void> {
  const { error } = await supabase
    .from("meso_day_groups")
    .update(patch)
    .eq("id", groupId);
  if (error) throw error;
}

export async function removeDayGroup(
  supabase: Client,
  groupId: string,
): Promise<void> {
  const { error } = await supabase
    .from("meso_day_groups")
    .delete()
    .eq("id", groupId);
  if (error) throw error;
}

/** Fill an exercise slot on the planner board (fig 2.6 picker result). */
export async function fillSlot(
  supabase: Client,
  input: {
    mesocycle_id: string;
    meso_day_group_id: string;
    slot_number: number;
    exercise_id: string;
    initial_sets: number;
  },
): Promise<MesoExerciseRow> {
  // replace whatever held the slot before
  const { error: clearError } = await supabase
    .from("meso_exercises")
    .delete()
    .eq("meso_day_group_id", input.meso_day_group_id)
    .eq("slot_number", input.slot_number);
  if (clearError) throw clearError;

  const { data, error } = await supabase
    .from("meso_exercises")
    .insert({
      mesocycle_id: input.mesocycle_id,
      day_of_week: null,
      meso_day_group_id: input.meso_day_group_id,
      slot_number: input.slot_number,
      position: input.slot_number,
      exercise_id: input.exercise_id,
      initial_weight: null,
      initial_reps: null,
      initial_sets: input.initial_sets,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function clearSlot(
  supabase: Client,
  mesoExerciseId: string,
): Promise<void> {
  const { error } = await supabase
    .from("meso_exercises")
    .delete()
    .eq("id", mesoExerciseId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// current position — macro → meso → micro → next workout. Standalone mesos
// (no macro) are first-class (08 §3).
// ---------------------------------------------------------------------------

export interface CurrentState {
  macrocycle: MacrocycleRow | null;
  mesocycle: MesocycleRow | null;
  microcycle: MicrocycleRow | null;
  nextWorkout: WorkoutRow | null;
}

export async function getCurrentState(
  supabase: Client,
  userId: string,
): Promise<CurrentState> {
  const { data: mesocycle, error: mesoError } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mesoError) throw mesoError;
  if (!mesocycle)
    return { macrocycle: null, mesocycle: null, microcycle: null, nextWorkout: null };

  let macrocycle: MacrocycleRow | null = null;
  if (mesocycle.macrocycle_id) {
    const { data, error } = await supabase
      .from("macrocycles")
      .select("*")
      .eq("id", mesocycle.macrocycle_id)
      .maybeSingle();
    if (error) throw error;
    macrocycle = data;
  }

  const { data: microcycle, error: microError } = await supabase
    .from("microcycles")
    .select("*")
    .eq("mesocycle_id", mesocycle.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (microError) throw microError;
  if (!microcycle)
    return { macrocycle, mesocycle, microcycle: null, nextWorkout: null };

  const { data: nextWorkout, error: workoutError } = await supabase
    .from("workouts")
    .select("*")
    .eq("microcycle_id", microcycle.id)
    .in("status", ["planned", "in_progress"])
    .order("day_number")
    .limit(1)
    .maybeSingle();
  if (workoutError) throw workoutError;

  return { macrocycle, mesocycle, microcycle, nextWorkout: nextWorkout ?? null };
}
