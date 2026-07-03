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
import { planGroupExercises } from "@/lib/planner/groups";

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
        .order("created_at", { ascending: false }),
      supabase
        .from("mesocycles")
        .select("*")
        .eq("user_id", userId)
        .neq("status", "draft")
        // newest first; standalone mesos render in this order, while
        // within-macro mesos are re-sorted by plan position in orderMesos.
        .order("created_at", { ascending: false }),
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
    status?: MesocycleRow["status"];
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
      status: input.status ?? "planned",
      template_id: input.template_id ?? null,
      start_date: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// draft mesocycles (2026-06-15) — "create mesocycle" is the *final* stage.
// Scratch/template/copy create a `draft`, plan it on the board, then finalize
// (name + weeks) → `planned`. One draft at a time: creating one clears any
// existing draft (the entry UI offers "continue editing" before that point).
// ---------------------------------------------------------------------------

/** The user's single in-progress draft, if any. */
export async function getDraftMeso(
  supabase: Client,
  userId: string,
): Promise<MesocycleRow | null> {
  const { data, error } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Start a fresh draft, clearing any existing draft first (one at a time). */
export async function createDraftMeso(
  supabase: Client,
  userId: string,
  opts: {
    name?: string;
    weeks?: number;
    includes_deload?: boolean;
    rir_start?: number;
    rir_end?: number;
  } = {},
): Promise<MesocycleRow> {
  const { error: clearError } = await supabase
    .from("mesocycles")
    .delete()
    .eq("user_id", userId)
    .eq("status", "draft");
  if (clearError) throw clearError;

  return createMesocycle(supabase, userId, {
    name: opts.name ?? "",
    weeks: opts.weeks ?? 5,
    includes_deload: opts.includes_deload ?? true,
    rir_start: opts.rir_start ?? 3,
    rir_end: opts.rir_end ?? 0,
    status: "draft",
  });
}

/** Finalize a draft into a planned meso (the create-mesocycle final stage). */
export async function finalizeDraftMeso(
  supabase: Client,
  userId: string,
  mesoId: string,
  input: { name: string; weeks: number },
): Promise<void> {
  const { error } = await supabase
    .from("mesocycles")
    .update({ name: input.name, weeks: input.weeks, status: "planned" })
    .eq("id", mesoId)
    .eq("user_id", userId)
    .eq("status", "draft");
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// edit a mesocycle's own top-level attributes (MCP `update_mesocycle`, 05 §Write).
// Structure lives on the planner board (saveMesoPlan / edit_mesocycle); this is
// the meso's own header: name, length, RIR ramp, deload flag, phase. The engine
// re-derives numbers from these on activation (or, for an active meso, the
// read-path freshness reconcile picks up RIR/deload changes) — never the LLM.
// ---------------------------------------------------------------------------

export interface MesoAttrPatch {
  name?: string;
  weeks?: number;
  includes_deload?: boolean;
  rir_start?: number;
  rir_end?: number;
  phase?: MesocycleRow["phase"];
}

export interface MesoAttrResult {
  ok: boolean;
  error?: string;
}

/**
 * Editable-in-place meso header. `name`/`phase` can change on any meso that
 * isn't finished; length/RIR/deload only while the meso hasn't been started
 * (draft/unplanned/planned) — once active its microcycles are materialized and
 * changing week count would desync them. Completed/abandoned mesos are frozen.
 */
export async function updateMesocycleAttrs(
  supabase: Client,
  userId: string,
  mesoId: string,
  patch: MesoAttrPatch,
): Promise<MesoAttrResult> {
  const { data: meso, error } = await supabase
    .from("mesocycles")
    .select("id, status")
    .eq("id", mesoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!meso) return { ok: false, error: "Mesocycle not found." };
  if (meso.status === "completed" || meso.status === "abandoned")
    return {
      ok: false,
      error: `a ${meso.status} mesocycle is frozen — its history is immutable.`,
    };

  const touchesShape =
    patch.weeks !== undefined ||
    patch.includes_deload !== undefined ||
    patch.rir_start !== undefined ||
    patch.rir_end !== undefined;
  const notStarted =
    meso.status === "draft" ||
    meso.status === "unplanned" ||
    meso.status === "planned";
  if (touchesShape && !notStarted)
    return {
      ok: false,
      error:
        "length / RIR ramp / deload can only change before a mesocycle is started; edit exercises with edit_mesocycle instead.",
    };

  const update: Partial<
    Pick<
      MesocycleRow,
      "name" | "phase" | "weeks" | "includes_deload" | "rir_start" | "rir_end"
    >
  > = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.phase !== undefined) update.phase = patch.phase;
  if (patch.weeks !== undefined) update.weeks = patch.weeks;
  if (patch.includes_deload !== undefined)
    update.includes_deload = patch.includes_deload;
  if (patch.rir_start !== undefined) update.rir_start = patch.rir_start;
  if (patch.rir_end !== undefined) update.rir_end = patch.rir_end;
  if (Object.keys(update).length === 0)
    return { ok: false, error: "no attributes to update were provided." };

  const { error: updErr } = await supabase
    .from("mesocycles")
    .update(update)
    .eq("id", mesoId)
    .eq("user_id", userId);
  if (updErr) throw updErr;
  return { ok: true };
}

export interface SlotFill extends MesoExerciseRow {
  exercise_name: string;
  exercise_equipment: string;
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
      // position is the day-level order (across groups); slot_number breaks ties
      // for legacy rows where position mirrored the group-local slot.
      .from("meso_exercises")
      .select("*")
      .eq("mesocycle_id", mesoId)
      .order("position")
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
  let exerciseMeta = new Map<string, { name: string; equipment: string }>();
  if (exerciseIds.length > 0) {
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, equipment_type")
      .in("id", exerciseIds);
    if (error) throw error;
    exerciseMeta = new Map(
      (data ?? []).map((e) => [
        e.id,
        { name: e.name, equipment: e.equipment_type },
      ]),
    );
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
              exercise_name: exerciseMeta.get(f.exercise_id)?.name ?? "",
              exercise_equipment:
                exerciseMeta.get(f.exercise_id)?.equipment ?? "",
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

/** Mesos that can be copied: planned/active/completed (drafts & placeholders excluded). */
export async function listCopyableMesos(
  supabase: Client,
  userId: string,
): Promise<MesocycleRow[]> {
  const { data, error } = await supabase
    .from("mesocycles")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["planned", "active", "completed"])
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

    let dayPos = 0; // day-wide order across groups (#2)
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
              position: ++dayPos,
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

/**
 * Duplicate a source mesocycle into a fresh `planned` meso — its settings (weeks,
 * deload, RIR ramp) and its whole planner board, copied via `copyMesoStructure`
 * (loads are NOT carried; the engine reseeds on activation). "Run last block back
 * with a few tweaks" as one action; the copy lands standalone and the caller may
 * then place it into a macro slot. Returns the new meso.
 */
export async function duplicateMesocycle(
  supabase: Client,
  userId: string,
  sourceMesoId: string,
  overrides: { name?: string } = {},
): Promise<{ meso: MesocycleRow | null; error: string | null }> {
  const { data: source, error } = await supabase
    .from("mesocycles")
    .select("name, weeks, includes_deload, rir_start, rir_end")
    .eq("id", sourceMesoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!source) return { meso: null, error: "Source mesocycle not found." };

  const meso = await createMesocycle(supabase, userId, {
    name: overrides.name ?? `${source.name} II`,
    weeks: source.weeks,
    includes_deload: source.includes_deload,
    rir_start: source.rir_start,
    rir_end: source.rir_end,
    status: "planned",
  });
  await copyMesoStructure(supabase, userId, sourceMesoId, meso.id);
  return { meso, error: null };
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
    .eq("mesocycle_id", mesoId);
  if (existingError) throw existingError;
  // smallest unused 1..7 (a week is 7 days; day_number ≤ 7 is a DB check). Not
  // max+1 — that would push a later add past 7 after a day was removed.
  const taken = new Set((existing ?? []).map((d) => d.day_number));
  let nextNumber = 0;
  for (let n = 1; n <= 7; n++) {
    if (!taken.has(n)) {
      nextNumber = n;
      break;
    }
  }
  if (nextNumber === 0) throw new Error("A week can hold at most 7 training days");

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

/** Add several muscle groups to a day at once (fig 2.6b multi-select),
 *  appending them after any existing groups, each with one open slot. */
export async function addDayGroups(
  supabase: Client,
  dayId: string,
  muscleGroupIds: string[],
  exerciseSlots = 1,
): Promise<void> {
  if (muscleGroupIds.length === 0) return;
  const { data: existing, error: existingError } = await supabase
    .from("meso_day_groups")
    .select("position")
    .eq("meso_day_id", dayId)
    .order("position", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;

  let position = existing?.[0]?.position ?? 0;
  const rows = muscleGroupIds.map((muscle_group_id) => ({
    meso_day_id: dayId,
    muscle_group_id,
    position: ++position,
    exercise_slots: exerciseSlots,
  }));
  const { error } = await supabase.from("meso_day_groups").insert(rows);
  if (error) throw error;
}

/**
 * Set a muscle-group's exercises from the fig 2.7 multi-select: the selected
 * exercises become the group's slots (1..n), retained exercises keep their
 * `initial_sets`, and the group's slot count is resized to match. Replaces the
 * group's fills wholesale (planning-only data — no logged history here).
 */
export async function setGroupExercises(
  supabase: Client,
  input: {
    mesocycle_id: string;
    meso_day_group_id: string;
    exercise_ids: string[];
    default_sets?: number;
  },
): Promise<void> {
  const { data: current, error: curError } = await supabase
    .from("meso_exercises")
    .select("exercise_id, initial_sets, position")
    .eq("meso_day_group_id", input.meso_day_group_id)
    .order("slot_number");
  if (curError) throw curError;

  // day-wide order (#2): keep retained exercises at their existing day position;
  // append brand-new ones after the day's current last position.
  const { data: grp, error: grpError } = await supabase
    .from("meso_day_groups")
    .select("meso_day_id, exercise_slots")
    .eq("id", input.meso_day_group_id)
    .single();
  if (grpError) throw grpError;
  const { data: dayGroups, error: dgError } = await supabase
    .from("meso_day_groups")
    .select("id")
    .eq("meso_day_id", grp.meso_day_id);
  if (dgError) throw dgError;
  const { data: dayEx, error: dayExError } = await supabase
    .from("meso_exercises")
    .select("exercise_id, position, meso_day_group_id")
    .in("meso_day_group_id", (dayGroups ?? []).map((g) => g.id));
  if (dayExError) throw dayExError;
  let dayMax = Math.max(0, ...(dayEx ?? []).map((e) => e.position));
  const oldPosInGroup = new Map(
    (dayEx ?? [])
      .filter((e) => e.meso_day_group_id === input.meso_day_group_id)
      .map((e) => [e.exercise_id, e.position]),
  );

  const layout = planGroupExercises(
    current ?? [],
    input.exercise_ids,
    input.default_sets ?? 3,
  );

  const { error: delError } = await supabase
    .from("meso_exercises")
    .delete()
    .eq("meso_day_group_id", input.meso_day_group_id);
  if (delError) throw delError;

  if (layout.length > 0) {
    const { error: insError } = await supabase.from("meso_exercises").insert(
      layout.map((l) => ({
        mesocycle_id: input.mesocycle_id,
        day_of_week: null,
        meso_day_group_id: input.meso_day_group_id,
        slot_number: l.slot_number,
        position: oldPosInGroup.get(l.exercise_id) ?? ++dayMax,
        exercise_id: l.exercise_id,
        initial_weight: null,
        initial_reps: null,
        initial_sets: l.initial_sets,
      })),
    );
    if (insError) throw insError;
  }

  const { error: updError } = await supabase
    .from("meso_day_groups")
    // keep the configured slot count — picking fewer leaves the rest open
    .update({ exercise_slots: Math.max(layout.length, grp.exercise_slots) })
    .eq("id", input.meso_day_group_id);
  if (updError) throw updError;
}

// ---------------------------------------------------------------------------
// staged plan save (fig 2.5 edit surface): the planner board edits a local
// working copy when editing a non-draft meso; SAVE CHANGES commits the whole
// plan at once. The planner tables hold no logged data, so the safe + simple
// reconcile is a wholesale replace — day_numbers are preserved by the caller
// so generated workouts (matched by day_number) still line up. Regeneration
// of open workouts for an active meso is handled separately (generation.ts).
// ---------------------------------------------------------------------------

export interface PlanGroupInput {
  muscle_group_id: string;
  exercise_slots: number;
  fills: {
    slot_number: number;
    exercise_id: string;
    initial_sets: number;
    /** day-level order across all groups (1..n); drives the flat board order */
    day_position: number;
  }[];
}

export interface PlanDayInput {
  day_number: number;
  label: string | null;
  weekday: number | null;
  groups: PlanGroupInput[];
}

export async function saveMesoPlan(
  supabase: Client,
  userId: string,
  mesoId: string,
  days: PlanDayInput[],
): Promise<void> {
  // R3: the wholesale replace (delete days → cascade groups/exercises →
  // re-insert) runs inside one DB transaction (`save_meso_plan`,
  // 20260702000005) so a mid-flight failure can never leave the plan wiped or
  // half-written — for an ACTIVE meso a wiped plan would cascade into open-
  // workout regeneration. Identity comes from auth.uid() inside the function
  // (SECURITY INVOKER + explicit meso-ownership guard); `userId` stays in the
  // signature for call-site clarity only.
  void userId;
  const { error } = await supabase.rpc("save_meso_plan", {
    p_mesocycle_id: mesoId,
    p_days: days,
  });
  if (error) throw error;
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

/**
 * Reorder a day's muscle groups: rewrite each group's `position` to its index
 * in `orderedGroupIds` (1..n). Scoped to the day; `position` has no unique
 * constraint, so a plain rewrite is safe (no temp-value swap dance). Used by
 * the live (draft) reorder path — staged edits reorder the local copy instead.
 */
export async function reorderDayGroups(
  supabase: Client,
  dayId: string,
  orderedGroupIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedGroupIds.length; i++) {
    const { error } = await supabase
      .from("meso_day_groups")
      .update({ position: i + 1 })
      .eq("id", orderedGroupIds[i])
      .eq("meso_day_id", dayId);
    if (error) throw error;
  }
}

/**
 * Reorder a day's exercises across ALL its groups (the flat day order, 08/#2):
 * rewrite each fill's day-level `position` to its index in `orderedFillIds`
 * (1..n). `slot_number` (group-local) is left untouched. Scoped per fill id
 * (RLS keeps it to the owner's meso). Live (draft) reorder path.
 */
export async function reorderDayExercises(
  supabase: Client,
  orderedFillIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedFillIds.length; i++) {
    const { error } = await supabase
      .from("meso_exercises")
      .update({ position: i + 1 })
      .eq("id", orderedFillIds[i]);
    if (error) throw error;
  }
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
