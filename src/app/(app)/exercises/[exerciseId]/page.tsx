import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExerciseHistory } from "@/lib/queries/history";
import { getExerciseOverview } from "@/lib/queries/exercises";
import { getActiveEngineParams } from "@/lib/queries/generation";
import { getExerciseIncrementOverride } from "@/lib/queries/exercise-overrides";
import { toEngineEquipment, coerceLoadType } from "@/lib/engine";
import { formatWeight } from "@/lib/units";
import { ExerciseHistoryList } from "@/components/ExerciseHistoryList";
import { ShareRow } from "@/components/ShareRow";
import { ExercisePinnedNote } from "./ExercisePinnedNote";
import { ExerciseSettingsMenu } from "./ExerciseSettingsMenu";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function bestDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

function firstDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const m = MONTHS[d.getMonth()];
  return `${m.charAt(0)}${m.slice(1).toLowerCase()} '${String(d.getFullYear()).slice(2)}`;
}

/** full integer with thousands separators, e.g. 3150 → "3,150". */
function comma(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** compact tonnage, e.g. 4200 → "4.2k", 612000 → "612k", 940 → "940". */
function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

const TABS = ["overview", "history"] as const;
type Tab = (typeof TABS)[number];

/**
 * Exercise page (figs 3.1a/3.1b): OVERVIEW (lifetime aggregates from
 * v_exercise_overview + est-1RM across the current macro) and HISTORY
 * (sessions grouped by meso). Replaces the simple detail page; the day-view
 * "View exercise ›" menu and the library list both land here.
 */
export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { exerciseId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: exercise, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", exerciseId)
    .maybeSingle();
  if (error) throw error;
  if (!exercise) notFound();

  const [
    { data: links, error: linkError },
    { data: groups, error: groupError },
    { data: pinned, error: pinnedError },
    overview,
    history,
    activeParams,
    incrementOverride,
  ] = await Promise.all([
    supabase.from("exercise_muscle_groups").select("*").eq("exercise_id", exercise.id),
    supabase.from("muscle_groups").select("*"),
    supabase
      .from("exercise_notes")
      .select("*")
      .eq("user_id", user.id)
      .eq("exercise_id", exercise.id)
      .eq("is_pinned", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getExerciseOverview(supabase, user.id, exercise.id),
    getExerciseHistory(supabase, user.id, exercise.id),
    getActiveEngineParams(supabase),
    getExerciseIncrementOverride(supabase, user.id, exercise.id),
  ]);
  if (linkError) throw linkError;
  if (groupError) throw groupError;
  if (pinnedError) throw pinnedError;

  // engine default loadable step for this exercise, for the increment-override
  // editor. The override sets the exercise's rounding step (the load the engine
  // rounds every prescription to), so the editor's default is that rounding step.
  // (T-I4 retired the legacy experience-scaled `increment`.)
  const defaultStep =
    activeParams.params.rounding[toEngineEquipment(exercise.equipment_type)] ?? 5;

  // The load-step (weight-increment) control is meaningless for bodyweight-only
  // lifts — the engine progresses them on reps at fixed bodyweight and never adds
  // load, so the increment is inert. Hide the control rather than surface a
  // setting that does nothing (PH36). Loadable/assisted keep it: there the step
  // rounds the added/assist weight.
  const loadType = coerceLoadType(exercise.load_type, exercise.equipment_type);
  const showLoadStep = loadType !== "bodyweight_only";

  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const primary = (links ?? []).find((l) => l.role === "primary");
  const secondary = (links ?? []).filter((l) => l.role === "secondary");
  const metaLine = [
    primary ? groupName.get(primary.muscle_group_id)?.toUpperCase() : null,
    exercise.equipment_type.toUpperCase(),
    secondary.length > 0
      ? `ALSO ${secondary
          .map((l) => groupName.get(l.muscle_group_id)?.toUpperCase())
          .filter(Boolean)
          .join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ov = overview.overview;
  const maxBar = Math.max(
    1,
    ...overview.macroBars.map((b) => b.e1rm ?? 0),
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/exercises"
          className="block text-[10px] font-medium tracking-[0.12em] text-ink/55"
        >
          ‹ EXERCISES
        </Link>
        {showLoadStep && (
          <ExerciseSettingsMenu
            exerciseId={exercise.id}
            defaultStep={defaultStep}
            override={incrementOverride}
          />
        )}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="text-[28px] font-extrabold leading-none tracking-[-0.02em]">
          {exercise.name}
        </h1>
        {exercise.user_id !== null && (
          <div className="border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            CUSTOM
          </div>
        )}
      </div>
      <div className="mt-2 text-[10.5px] font-medium tracking-[0.12em] text-ink/55">
        {metaLine}
      </div>

      {/* OVERVIEW | HISTORY tabs (3.1a/3.1b) */}
      <div className="mt-4 flex border-[1.5px] border-ink">
        {TABS.map((t, i) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={`/exercises/${exercise.id}?tab=${t}`}
              className={`flex-1 py-2.5 text-center text-[10px] tracking-[0.1em] ${
                active
                  ? "bg-ink font-bold text-bg-base"
                  : `font-medium text-ink/55 ${i > 0 ? "border-l border-ink/30" : ""}`
              }`}
            >
              {t.toUpperCase()}
            </Link>
          );
        })}
      </div>

      {tab === "overview" ? (
        <>
          <div className="mt-3.5 flex items-baseline justify-between border-b-[1.5px] border-ink pb-2.5">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-ink/55">
              LAST PERFORMED
            </span>
            <span className="numeral text-[11px] font-bold tracking-[0.06em]">
              {ov?.last_performed_at
                ? `${bestDate(ov.last_performed_at)}${overview.lastCoordinate ? ` · ${overview.lastCoordinate}` : ""}`
                : "Never"}
            </span>
          </div>

          <div className="mt-4 text-[9.5px] font-bold tracking-[0.14em] text-ink/55">
            ALL-TIME BESTS
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-px border-[1.5px] border-ink bg-ink">
            <BestCell
              value={ov?.weight_pr != null ? formatWeight(ov.weight_pr) : "—"}
              suffix={ov?.weight_pr_reps != null ? `× ${ov.weight_pr_reps}` : null}
              label="WEIGHT PR · LB"
            />
            <BestCell
              value={ov?.best_e1rm != null ? formatWeight(ov.best_e1rm) : "—"}
              suffix="lb"
              label="EST. 1RM"
            />
            <BestCell
              value={ov?.volume_pr_weight != null ? formatWeight(ov.volume_pr_weight) : "—"}
              suffix={ov?.volume_pr_reps != null ? `× ${ov.volume_pr_reps}` : null}
              label={
                ov?.volume_pr != null
                  ? `VOLUME PR · ${comma(ov.volume_pr)} LB`
                  : "VOLUME PR"
              }
            />
            <BestCell
              value={ov?.best_session_volume != null ? compact(ov.best_session_volume) : "—"}
              suffix="lb"
              label="BEST SESSION VOL"
            />
          </div>

          {overview.macroBars.length > 0 && (
            <>
              <div className="mt-[18px] flex justify-between text-[9px] font-semibold tracking-[0.12em] text-ink/50">
                <span>
                  EST. 1RM — ACROSS {overview.macroName?.toUpperCase() ?? "MACRO"}
                </span>
                {overview.macroPosition && (
                  <span className="font-bold text-accent">{overview.macroPosition}</span>
                )}
              </div>
              <div className="mt-2.5 flex items-stretch gap-2">
                {overview.macroBars.map((bar) => (
                  <div key={bar.label} className="flex flex-1 flex-col gap-1">
                    <div
                      className={`numeral text-center text-[11px] ${
                        bar.state === "current"
                          ? "font-bold text-accent"
                          : bar.e1rm != null
                            ? "font-bold"
                            : "font-medium text-ink/40"
                      }`}
                    >
                      {bar.e1rm != null ? formatWeight(bar.e1rm) : "—"}
                    </div>
                    <div className="flex h-11 items-end">
                      {bar.state === "current" ? (
                        <div
                          className="w-full border-2 border-accent"
                          style={{ height: `${barPct(bar.e1rm, maxBar)}%` }}
                        />
                      ) : bar.e1rm != null ? (
                        <div
                          className="w-full bg-ink"
                          style={{ height: `${barPct(bar.e1rm, maxBar)}%` }}
                        />
                      ) : (
                        <div className="h-full w-full border border-dashed border-ink/30" />
                      )}
                    </div>
                    <div
                      className={`text-center text-[8.5px] font-semibold tracking-[0.1em] ${
                        bar.state === "current" ? "font-bold text-accent" : "text-ink/55"
                      }`}
                    >
                      {bar.label}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-[18px] flex border-t-[1.5px] border-ink pt-3">
            <Stat value={ov ? String(ov.times_trained) : "0"} label="TIMES TRAINED" />
            <Stat
              value={ov?.total_volume != null ? compact(ov.total_volume) : "—"}
              label="TOTAL VOLUME · LB"
              divider
            />
            <Stat
              value={ov?.first_logged_at ? firstDate(ov.first_logged_at) : "—"}
              label="FIRST LOGGED"
              divider
            />
          </div>

          {exercise.description && (
            <p className="mt-5 text-[13px] leading-[1.55] text-ink/80">
              {exercise.description}
            </p>
          )}
          <ExercisePinnedNote
            exerciseId={exercise.id}
            initial={pinned?.body ?? null}
          />

          {exercise.user_id === user.id && (
            <ShareRow objectType="exercise" objectId={exercise.id} />
          )}
        </>
      ) : (
        <div className="mt-5">
          <ExerciseHistoryList entries={history} />
        </div>
      )}
    </div>
  );
}

function barPct(e1rm: number | null, max: number): number {
  if (e1rm == null) return 100;
  // floor the visible height so small values still read as a bar
  return Math.max(12, Math.round((e1rm / max) * 100));
}

function BestCell({
  value,
  suffix,
  label,
}: {
  value: string;
  suffix: string | null;
  label: string;
}) {
  return (
    <div className="bg-bg-base px-3 py-[11px]">
      <div className="numeral text-[20px] font-extrabold tracking-[-0.01em]">
        {value}
        {suffix && (
          <span className="ml-1 text-[12px] font-semibold text-ink/50">{suffix}</span>
        )}
      </div>
      <div className="mt-[3px] text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
        {label}
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  divider,
}: {
  value: string;
  label: string;
  divider?: boolean;
}) {
  return (
    <div className={`flex-1 ${divider ? "border-l border-ink/20 pl-3.5" : ""}`}>
      <div className="numeral text-[18px] font-extrabold">{value}</div>
      <div className="mt-0.5 text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
        {label}
      </div>
    </div>
  );
}
