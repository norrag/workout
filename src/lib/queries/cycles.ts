import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  MacrocycleRow,
  MesocycleRow,
  MesoDayGroupRow,
  MesoDayRow,
  MesoExerciseRow,
  MicrocycleRow,
  WorkoutRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// cycles overview (fig 2.1) — macrocycles with their ordered mesocycles
// (some `unplanned` placeholders) plus standalone mesos. "Slots" are retired
// (09 2026-06-13 §4); a macro's progression is its positioned mesocycles.
// ---------------------------------------------------------------------------

export interface MacroWithMesos extends MacrocycleRow {
  /** ordered by position (placeholders included) */
  mesos: MesocycleRow[];
}

export interface CyclesOverview {
  macros: MacroWithMesos[];
  standaloneMesos: MesocycleRow[];
}

/** Mesos ordered by macro position; placeholders last, then by creation. */
function orderMesos(mesos: MesocycleRow[]): MesocycleRow[] {
  return [...mesos].sort(
    (a, b) =>
      (a.position ?? 99) - (b.position ?? 99) ||
      a.created_at.localeCompare(b.created_at),
  );
}

export async function getCyclesOverview(
  supabase: Client,
  userId: string,
): Promise<CyclesOverview> {
  const [{ data: macros, error: macroError }, { data: mesos, error: mesoError }] =
    await Promise.all([
      supabase
        .from("macrocycles")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false }),
      supabase
        .from("mesocycles")
        .select("*")
        .eq("user_id", userId)
        .order("created_at"),
    ]);
  if (macroError) throw macroError;
  if (mesoError) throw mesoError;

  return {
    macros: (macros ?? []).map((macro) => ({
      ...macro,
      mesos: orderMesos(
        (mesos ?? []).filter((m) => m.macrocycle_id === macro.id),
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

// ---------------------------------------------------------------------------
// mesocycles — standalone creation (fig 2.4 from-scratch/template path) and
// the groups-first plan (figs 2.5/2.6). In-macro mesos are created by the
// macrocycle engine (see queries/macro.ts) and planned via `+ PLAN`.
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
    template_id?: string | null;
  },
): Promise<MesocycleRow> {
  const { data, error } = await supabase
    .from("mesocycles")
    .insert({
      user_id: userId,
      macrocycle_id: null,
      position: null,
      phase: null,
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

// ---------------------------------------------------------------------------
// copy a mesocycle (fig 2.4 option 01) — carry the planner structure forward.
// The loads are NOT copied: `startMeso` reseeds every slot from the user's
// all-time best (v_exercise_prs), so a copy literally "starts from where you
// left off" without dragging stale numbers along.
// ---------------------------------------------------------------------------

/** Mesos that can be copied: anything that's been planned (placeholders excluded). */
export async function listCopyableMesos(
  supabase: Client,
  userId: string,
): Promise<MesocycleRow[]> {
  const { data, error } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "unplanned")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

interface CopySourceFill {
  slot_number: number | null;
  exercise_id: string;
  initial_sets: number;
}
interface CopySourceGroup {
  muscle_group_id: string;
  position: number;
  exercise_slots: number;
  fills: CopySourceFill[];
}
interface CopySourceDay {
  day_number: number;
  label: string | null;
  weekday: number | null;
  groups: CopySourceGroup[];
}

export interface CopyFillPlan {
  slot_number: number;
  exercise_id: string;
  initial_sets: number;
}
export interface CopyGroupPlan {
  muscle_group_id: string;
  position: number;
  exercise_slots: number;
  fills: CopyFillPlan[];
}
export interface CopyDayPlan {
  day_number: number;
  label: string | null;
  weekday: number | null;
  groups: CopyGroupPlan[];
}

/**
 * Pure: map a source meso's planner structure into copy-insert rows, dropping
 * excluded exercises. A dropped fill leaves its slot open (the group's slot
 * count is preserved) so the picker can replace it. Slot numbers fall back to
 * their position when the source left them unset.
 */
export function planMesoCopy(
  days: CopySourceDay[],
  excluded: Set<string>,
): CopyDayPlan[] {
  return days.map((day) => ({
    day_number: day.day_number,
    label: day.label,
    weekday: day.weekday,
    groups: day.groups.map((group) => ({
      muscle_group_id: group.muscle_group_id,
      position: group.position,
      exercise_slots: Math.max(group.exercise_slots, group.fills.length),
      fills: group.fills
        .filter((f) => !excluded.has(f.exercise_id))
        .map((f, i) => ({
          slot_number: f.slot_number ?? i + 1,
          exercise_id: f.exercise_id,
          initial_sets: f.initial_sets,
        })),
    })),
  }));
}

/**
 * Clone a source meso's planner board (days → groups → slot fills) onto a
 * freshly created target meso. Mirrors `applyTemplateToMeso`; honors the user's
 * exclusion list. No-op if the source has no plan (or isn't visible via RLS).
 */
export async function copyMesoStructure(
  supabase: Client,
  userId: string,
  sourceMesoId: string,
  targetMesoId: string,
): Promise<void> {
  const source = await getMesoPlan(supabase, sourceMesoId);
  if (!source || source.days.length === 0) return;

  const { data: exclusions, error: exclError } = await supabase
    .from("excluded_exercises")
    .select("exercise_id")
    .eq("user_id", userId);
  if (exclError) throw exclError;
  const excluded = new Set((exclusions ?? []).map((x) => x.exercise_id));

  const dayPlans = planMesoCopy(source.days, excluded);

  for (const day of dayPlans) {
    const { data: mesoDay, error: dayError } = await supabase
      .from("meso_days")
      .insert({
        mesocycle_id: targetMesoId,
        user_id: userId,
        day_number: day.day_number,
        label: day.label,
        weekday: day.weekday,
      })
      .select()
      .single();
    if (dayError) throw dayError;

    for (const group of day.groups) {
      const { data: mesoGroup, error: groupError } = await supabase
        .from("meso_day_groups")
        .insert({
          meso_day_id: mesoDay.id,
          muscle_group_id: group.muscle_group_id,
          position: group.position,
          exercise_slots: group.exercise_slots,
        })
        .select()
        .single();
      if (groupError) throw groupError;

      if (group.fills.length > 0) {
        const { error: fillError } = await supabase
          .from("meso_exercises")
          .insert(
            group.fills.map((f) => ({
              mesocycle_id: targetMesoId,
              day_of_week: null,
              meso_day_group_id: mesoGroup.id,
              slot_number: f.slot_number,
              position: f.slot_number,
              exercise_id: f.exercise_id,
              initial_weight: null,
              initial_reps: null,
              initial_sets: f.initial_sets,
            })),
          );
        if (fillError) throw fillError;
      }
    }
  }

  const { error: updateError } = await supabase
    .from("mesocycles")
    .update({ days_per_week: Math.max(1, dayPlans.length) })
    .eq("id", targetMesoId);
  if (updateError) throw updateError;
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
// delete a mesocycle (user-initiated). FK cascades remove its microcycles,
// workouts, logged_sets, planner days/groups/fills — so deleting an active or
// completed meso destroys logged history; the UI warns accordingly. (RLS:
// `mesocycles_all_own` is `for all`; the child cascade bypasses RLS by design.)
// ---------------------------------------------------------------------------

export interface MesoDeletionImpact {
  loggedSets: number;
  hasHistory: boolean;
}

export async function getMesoDeletionImpact(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<MesoDeletionImpact> {
  const { count, error } = await supabase
    .from("logged_sets")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("mesocycle_id", mesoId);
  if (error) throw error;
  const loggedSets = count ?? 0;
  return { loggedSets, hasHistory: loggedSets > 0 };
}

export async function deleteMesocycle(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<void> {
  const { error } = await supabase
    .from("mesocycles")
    .delete()
    .eq("id", mesoId)
    .eq("user_id", userId);
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
