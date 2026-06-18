import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TemplateRow } from "@/lib/types/database";
import { getMesoPlan } from "./cycles";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// templates (fig 3.3) — list, detail, planner round-trip (07 Phase 5)
// ---------------------------------------------------------------------------

export interface TemplateFilters {
  search?: string;
  /** training days per week */
  days?: number;
  /** templates.emphasis (split) */
  emphasis?: string;
  /** 'female' | 'male' — includes 'any'-tagged templates too */
  gender?: string;
}

export async function listTemplates(
  supabase: Client,
  opts: TemplateFilters = {},
): Promise<TemplateRow[]> {
  let query = supabase.from("templates").select("*").order("name");
  if (opts.search) query = query.ilike("name", `%${opts.search}%`);
  if (opts.days) query = query.eq("days_per_week", opts.days);
  if (opts.emphasis) query = query.eq("emphasis", opts.emphasis);
  // a gender filter includes the gender-neutral ("any") templates
  if (opts.gender === "female" || opts.gender === "male")
    query = query.in("intended_gender", [opts.gender, "any"]);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface TemplateFill {
  slot_number: number;
  exercise_id: string;
  exercise_name: string;
  equipment_type: string;
  default_sets: number;
}

export interface TemplateGroup {
  muscle_group_id: string;
  muscle_group: string;
  position: number;
  exercise_slots: number;
  fills: TemplateFill[];
}

export interface TemplateDayDetail {
  day_number: number;
  label: string | null;
  groups: TemplateGroup[];
}

export interface TemplateDetail {
  template: TemplateRow;
  days: TemplateDayDetail[];
}

/**
 * Template detail in the groups-first shape. Days seeded or saved before the
 * pivot may carry exercises without a group link — those are grouped by the
 * exercise's primary muscle group so the planner board can always prefill.
 */
export async function getTemplateDetail(
  supabase: Client,
  templateId: string,
): Promise<TemplateDetail | null> {
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) return null;

  const { data: days, error: dayError } = await supabase
    .from("template_days")
    .select("*")
    .eq("template_id", templateId)
    .order("day_number");
  if (dayError) throw dayError;
  const dayIds = (days ?? []).map((d) => d.id);
  if (dayIds.length === 0) return { template, days: [] };

  const [
    { data: groups, error: groupError },
    { data: fills, error: fillError },
    { data: muscleGroups, error: mgError },
  ] = await Promise.all([
    supabase
      .from("template_day_groups")
      .select("*")
      .in("template_day_id", dayIds)
      .order("position"),
    supabase
      .from("template_exercises")
      .select("*")
      .in("template_day_id", dayIds)
      .order("position"),
    supabase.from("muscle_groups").select("*"),
  ]);
  if (groupError) throw groupError;
  if (fillError) throw fillError;
  if (mgError) throw mgError;

  const exerciseIds = [...new Set((fills ?? []).map((f) => f.exercise_id))];
  let exerciseById = new Map<
    string,
    { name: string; equipment_type: string }
  >();
  let primaryByExercise = new Map<string, string>();
  if (exerciseIds.length > 0) {
    const [
      { data: exercises, error: exError },
      { data: links, error: linkError },
    ] = await Promise.all([
      supabase
        .from("exercises")
        .select("id, name, equipment_type")
        .in("id", exerciseIds),
      supabase
        .from("exercise_muscle_groups")
        .select("*")
        .in("exercise_id", exerciseIds)
        .eq("role", "primary"),
    ]);
    if (exError) throw exError;
    if (linkError) throw linkError;
    exerciseById = new Map(
      (exercises ?? []).map((e) => [
        e.id,
        { name: e.name, equipment_type: e.equipment_type },
      ]),
    );
    primaryByExercise = new Map(
      (links ?? []).map((l) => [l.exercise_id, l.muscle_group_id]),
    );
  }
  const mgName = new Map((muscleGroups ?? []).map((g) => [g.id, g.name]));

  const detailDays: TemplateDayDetail[] = (days ?? []).map((day) => {
    const declared: TemplateGroup[] = (groups ?? [])
      .filter((g) => g.template_day_id === day.id)
      .map((g) => ({
        muscle_group_id: g.muscle_group_id,
        muscle_group: mgName.get(g.muscle_group_id) ?? "",
        position: g.position,
        exercise_slots: g.exercise_slots,
        fills: [],
      }));
    const groupIdToGroup = new Map(
      (groups ?? [])
        .filter((g) => g.template_day_id === day.id)
        .map((g, i) => [g.id, declared[i]]),
    );

    const dayFills = (fills ?? []).filter((f) => f.template_day_id === day.id);
    const derived = new Map<string, TemplateGroup>();
    for (const fill of dayFills) {
      const ex = exerciseById.get(fill.exercise_id);
      if (!ex) continue; // exercise not visible to this user
      let group = fill.template_day_group_id
        ? groupIdToGroup.get(fill.template_day_group_id)
        : undefined;
      if (!group) {
        const mgId = primaryByExercise.get(fill.exercise_id);
        if (!mgId) continue;
        group =
          declared.find((g) => g.muscle_group_id === mgId) ?? derived.get(mgId);
        if (!group) {
          group = {
            muscle_group_id: mgId,
            muscle_group: mgName.get(mgId) ?? "",
            position: declared.length + derived.size + 1,
            exercise_slots: 0,
            fills: [],
          };
          derived.set(mgId, group);
        }
      }
      group.fills.push({
        slot_number: fill.slot_number ?? group.fills.length + 1,
        exercise_id: fill.exercise_id,
        exercise_name: ex.name,
        equipment_type: ex.equipment_type,
        default_sets: fill.default_sets,
      });
    }
    const allGroups = [...declared, ...derived.values()].map((g) => ({
      ...g,
      exercise_slots: Math.max(g.exercise_slots, g.fills.length),
    }));
    return {
      day_number: day.day_number,
      label: day.label,
      groups: allGroups.filter((g) => g.exercise_slots > 0),
    };
  });

  return { template, days: detailDays };
}

/**
 * Prefill a freshly created meso's planner board from a template
 * (start-from-template, 08 §4). Excluded exercises never land on the board —
 * their slots stay open for the picker.
 */
export async function applyTemplateToMeso(
  supabase: Client,
  userId: string,
  mesoId: string,
  templateId: string,
): Promise<void> {
  const detail = await getTemplateDetail(supabase, templateId);
  if (!detail || detail.days.length === 0) return;

  const { data: exclusions, error: exclError } = await supabase
    .from("excluded_exercises")
    .select("exercise_id")
    .eq("user_id", userId);
  if (exclError) throw exclError;
  const excluded = new Set((exclusions ?? []).map((x) => x.exercise_id));

  for (const day of detail.days) {
    const { data: mesoDay, error: dayError } = await supabase
      .from("meso_days")
      .insert({
        mesocycle_id: mesoId,
        user_id: userId,
        day_number: day.day_number,
        label: day.label,
        weekday: null,
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

      const fills = group.fills.filter((f) => !excluded.has(f.exercise_id));
      if (fills.length > 0) {
        const { error: fillError } = await supabase
          .from("meso_exercises")
          .insert(
            fills.map((f) => ({
              mesocycle_id: mesoId,
              day_of_week: null,
              meso_day_group_id: mesoGroup.id,
              slot_number: f.slot_number,
              position: ++dayPos,
              exercise_id: f.exercise_id,
              initial_weight: null,
              initial_reps: null,
              initial_sets: f.default_sets,
            })),
          );
        if (fillError) throw fillError;
      }
    }
  }

  const { error: updateError } = await supabase
    .from("mesocycles")
    .update({ days_per_week: detail.days.length, template_id: templateId })
    .eq("id", mesoId);
  if (updateError) throw updateError;
}

// ---------------------------------------------------------------------------
// delete a template (MCP undo for create_template, §5.8). Only the user's own
// templates are deletable — stock templates (user_id is null) are shared
// library data. Templates carry no logged history, so there is nothing to
// protect beyond ownership; `template_days`/`template_exercises` cascade with
// the row. RLS `templates_delete_own`. A meso started from this template keeps
// its own copied plan (it references no template rows), so it is unaffected.
// ---------------------------------------------------------------------------

export async function deleteTemplate(
  supabase: Client,
  userId: string,
  templateId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data: template, error: findError } = await supabase
    .from("templates")
    .select("id, user_id")
    .eq("id", templateId)
    .maybeSingle();
  if (findError) throw findError;
  if (!template) return { ok: false, error: "Template not found." };
  if (template.user_id !== userId)
    return { ok: false, error: "Only your own (custom) templates can be deleted." };

  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true, error: null };
}

const UPPER_GROUPS = new Set([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "traps",
  "forearms",
]);
const LOWER_GROUPS = new Set([
  "quads",
  "hamstrings",
  "glutes",
  "calves",
]);

/** Emphasis for a saved template (schema vocabulary), from the groups it trains. */
export function templateEmphasis(groupNames: string[]): string {
  const hasUpper = groupNames.some((g) => UPPER_GROUPS.has(g.toLowerCase()));
  const hasLower = groupNames.some((g) => LOWER_GROUPS.has(g.toLowerCase()));
  if (hasUpper && hasLower) return "full_body";
  if (hasUpper) return "upper";
  if (hasLower) return "lower";
  return "other";
}

/** Save a planned/run meso back as a reusable template (`template_day_groups` round-trip). */
export async function saveMesoAsTemplate(
  supabase: Client,
  userId: string,
  mesoId: string,
): Promise<{ template: TemplateRow | null; error: string | null }> {
  const plan = await getMesoPlan(supabase, mesoId);
  if (!plan) return { template: null, error: "Mesocycle not found." };
  const { meso, days } = plan;
  if (days.length === 0)
    return { template: null, error: "Plan at least one day first." };

  const groupNames = days.flatMap((d) => d.groups.map((g) => g.muscle_group));
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .insert({
      user_id: userId,
      name: meso.name,
      emphasis: templateEmphasis(groupNames),
      intended_gender: "any",
      days_per_week: days.length,
      description: null,
      source_template_id: meso.template_id,
    })
    .select()
    .single();
  if (templateError) throw templateError;

  for (const day of days) {
    const { data: templateDay, error: dayError } = await supabase
      .from("template_days")
      .insert({
        template_id: template.id,
        day_number: day.day_number,
        label: day.label,
      })
      .select()
      .single();
    if (dayError) throw dayError;

    for (const group of day.groups) {
      const { data: templateGroup, error: groupError } = await supabase
        .from("template_day_groups")
        .insert({
          template_day_id: templateDay.id,
          muscle_group_id: group.muscle_group_id,
          position: group.position,
          exercise_slots: group.exercise_slots,
        })
        .select()
        .single();
      if (groupError) throw groupError;

      if (group.fills.length > 0) {
        const { error: fillError } = await supabase
          .from("template_exercises")
          .insert(
            group.fills.map((f) => ({
              template_day_id: templateDay.id,
              template_day_group_id: templateGroup.id,
              slot_number: f.slot_number,
              exercise_id: f.exercise_id,
              position: f.slot_number ?? 1,
              default_sets: f.initial_sets,
              default_rep_range: null,
            })),
          );
        if (fillError) throw fillError;
      }
    }
  }

  return { template, error: null };
}
