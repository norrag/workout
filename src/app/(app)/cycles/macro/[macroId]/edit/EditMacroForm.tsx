"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
// WS-J bundle split: leaf import so the client chunk carries only the macro
// planner, not the whole engine barrel (prescribe/rules/summary).
import {
  planMacrocycle,
  suggestMesoLength,
  type MacroGoal,
  type MacroPlan,
  type MacroProfile,
  type MacroRange,
} from "@/lib/engine/macro";
import type { EngineParams } from "@/lib/engine/params";
import type { MacroGoalType } from "@/lib/types/database";
import { editMacrocycleAction, type FormState } from "../../../actions";
import type { MacroEditImpact } from "@/lib/queries/macro";

const initialState: FormState = { error: null };

const GOALS: { value: MacroGoal; label: string }[] = [
  { value: "hypertrophy", label: "HYPERTROPHY" },
  { value: "strength", label: "STRENGTH" },
  { value: "cut", label: "CUT" },
  { value: "maintain", label: "MAINTAIN" },
];

const DURATIONS = [3, 6, 12] as const;
const MESO_LENGTHS = [4, 5, 6] as const;

const GOAL_NOUN: Record<MacroGoal, string> = {
  hypertrophy: "lean mass",
  strength: "on key lifts",
  cut: "bodyweight",
  maintain: "",
};

function fmtRange(r: MacroRange): string {
  const unit = r.unit === "%" ? "%" : ` ${r.unit}`;
  const sign = r.direction === "loss" ? "−" : "+";
  if (r.direction === "none") return "—";
  return r.low === r.high
    ? `${sign}${r.low}${unit}`
    : `${sign}${r.low}–${r.high}${unit}`;
}

function fmtRate(r: MacroRange): string {
  const unit = r.unit === "%" ? "%" : ` ${r.unit}`;
  const sign = r.direction === "loss" ? "−" : "+";
  if (r.direction === "none") return "";
  const body =
    r.low === r.high ? `${r.low}${unit}` : `${r.low}–${r.high}${unit}`;
  return `≈ ${sign}${body} / month`;
}

export interface EditMacroInitial {
  name: string;
  goal_type: MacroGoalType;
  duration_months: number | null;
  meso_length_weeks: number;
  goal_notes: string | null;
}

export function EditMacroForm({
  macroId,
  profile,
  params,
  initial,
  impact,
}: {
  macroId: string;
  profile: MacroProfile;
  params: EngineParams;
  initial: EditMacroInitial;
  impact: MacroEditImpact;
}) {
  const [state, formAction, pending] = useActionState(
    editMacrocycleAction,
    initialState,
  );
  const router = useRouter();
  const [goal, setGoal] = useState<MacroGoal>(initial.goal_type);
  const initialMonths = initial.duration_months ?? 6;
  const isPreset = (DURATIONS as readonly number[]).includes(initialMonths);
  const [duration, setDuration] = useState<number | "custom">(
    isPreset ? initialMonths : "custom",
  );
  const [customMonths, setCustomMonths] = useState(
    isPreset ? 8 : initialMonths,
  );
  const [mesoLength, setMesoLength] = useState(initial.meso_length_weeks);
  // start from the user's saved choice; auto-suggest only after they change duration
  const [mesoTouched, setMesoTouched] = useState(true);

  const durationMonths = duration === "custom" ? customMonths : duration;

  useEffect(() => {
    if (!mesoTouched) setMesoLength(suggestMesoLength(durationMonths));
  }, [durationMonths, mesoTouched]);

  const plan: MacroPlan = useMemo(
    () =>
      planMacrocycle(
        {
          goal,
          profile,
          durationMonths: duration === "custom" ? customMonths : duration,
          mesoLengthWeeks: mesoLength,
        },
        params,
      ),
    [goal, duration, customMonths, mesoLength, profile, params],
  );

  const noun = GOAL_NOUN[goal];

  // re-plan impact: only unplanned slots move (locked mesos are immutable)
  const finalTotal = Math.max(plan.mesoCount, impact.lockedCount);
  const finalUnplanned = finalTotal - impact.lockedCount;
  const slotDelta = finalUnplanned - impact.unplannedCount;
  const replanNote = (() => {
    if (impact.lockedCount === 0)
      return `Plans ${finalUnplanned} open mesocycle slot${finalUnplanned === 1 ? "" : "s"}.`;
    const kept = `Keeps your ${impact.lockedCount} planned/active/completed mesocycle${impact.lockedCount === 1 ? "" : "s"}`;
    if (slotDelta > 0)
      return `${kept}; adds ${slotDelta} open slot${slotDelta === 1 ? "" : "s"}.`;
    if (slotDelta < 0)
      return `${kept}; removes ${-slotDelta} not-yet-planned slot${-slotDelta === -1 ? "" : "s"}.`;
    return `${kept}; open slots unchanged.`;
  })();

  return (
    <form action={formAction}>
      <input type="hidden" name="macro_id" value={macroId} />
      <input type="hidden" name="goal_type" value={goal} />
      <input type="hidden" name="meso_length_weeks" value={mesoLength} />
      <input type="hidden" name="duration_months" value={durationMonths} />

      <div className="mt-[18px] text-[9.5px] font-semibold tracking-[0.14em] text-ink/55">
        NAME
      </div>
      <input
        name="name"
        required
        maxLength={80}
        defaultValue={initial.name}
        className="mt-[7px] h-11 w-full border-[1.5px] border-ink bg-paper px-[13px] text-[14px] font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
        placeholder="e.g. 26-2 · Off-Season"
      />

      <div className="mt-4 text-[9.5px] font-semibold tracking-[0.14em] text-ink/55">
        GOAL
      </div>
      <div className="mt-[7px] grid grid-cols-2 gap-1.5">
        {GOALS.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => setGoal(g.value)}
            className={`flex h-10 items-center justify-center text-[10.5px] tracking-[0.1em] ${
              goal === g.value
                ? "bg-ink font-bold text-bg-base"
                : "border-[1.5px] border-ink/35 font-semibold text-ink/60"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[9.5px] font-semibold tracking-[0.14em] text-ink/55">
        DURATION
      </div>
      <div className="mt-[7px] flex gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDuration(d)}
            className={`flex h-10 flex-1 items-center justify-center text-[11px] tracking-[0.06em] ${
              duration === d
                ? "bg-ink font-bold text-bg-base"
                : "border-[1.5px] border-ink/35 font-semibold text-ink/60"
            }`}
          >
            {d} MO
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDuration("custom")}
          className={`flex h-10 flex-1 items-center justify-center text-[11px] tracking-[0.06em] ${
            duration === "custom"
              ? "bg-ink font-bold text-bg-base"
              : "border-[1.5px] border-dashed border-ink/40 font-semibold text-ink/55"
          }`}
        >
          CUSTOM
        </button>
      </div>
      {duration === "custom" && (
        <div className="mt-2 flex items-center gap-2.5">
          <input
            type="number"
            min={1}
            max={60}
            value={customMonths}
            onChange={(e) =>
              setCustomMonths(
                Math.max(1, Math.min(60, Number(e.target.value) || 1)),
              )
            }
            className="numeral h-10 w-20 border-[1.5px] border-ink bg-paper px-3 text-center text-[15px] font-bold focus:outline-none"
          />
          <span className="text-[11px] font-medium tracking-[0.08em] text-ink/55">
            MONTHS
          </span>
        </div>
      )}

      <div className="mt-4 flex items-baseline justify-between">
        <div className="text-[9.5px] font-semibold tracking-[0.14em] text-ink/55">
          MESOCYCLE LENGTH
        </div>
        <div className="text-[9px] font-medium tracking-[0.06em] text-ink/50">
          {mesoTouched ? "incl. deload" : "SUGGESTED · incl. deload"}
        </div>
      </div>
      <div className="mt-[7px] flex gap-1.5">
        {MESO_LENGTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => {
              setMesoTouched(true);
              setMesoLength(w);
            }}
            className={`flex h-10 flex-1 items-center justify-center text-[11px] ${
              mesoLength === w
                ? "bg-ink font-bold text-bg-base"
                : "border-[1.5px] border-ink/35 font-semibold text-ink/60"
            }`}
          >
            {w} WK
          </button>
        ))}
      </div>

      <div className="mt-4 text-[9.5px] font-semibold tracking-[0.14em] text-ink/55">
        GOAL NOTES <span className="text-ink/35">· OPTIONAL</span>
      </div>
      <textarea
        name="goal_notes"
        maxLength={280}
        rows={2}
        defaultValue={initial.goal_notes ?? ""}
        className="mt-[7px] w-full resize-none border-[1.5px] border-ink/35 bg-paper px-[13px] py-2.5 text-[13px] font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
        placeholder="e.g. lean off-season, prioritize back width"
      />

      {/* engine output (recomputed live) */}
      <div className="mt-[18px] border-[1.5px] border-ink bg-paper px-[15px] py-3.5">
        <div className="text-[9.5px] font-bold tracking-[0.14em] text-accent">
          YOUR TARGET
        </div>
        {plan.target.direction === "none" ? (
          <div className="mt-1.5 text-[20px] font-extrabold leading-tight tracking-[-0.01em]">
            Recomposition — no weight target
          </div>
        ) : (
          <div className="mt-1.5 flex items-baseline gap-2">
            <div className="text-[30px] font-extrabold leading-none tracking-[-0.02em]">
              {fmtRange(plan.target)}
            </div>
            <div className="text-[12px] font-semibold text-ink/60">
              {noun ? `${noun} · ` : ""}
              {plan.durationMonths} mo
            </div>
          </div>
        )}
        {plan.target.direction !== "none" && (
          <div className="mt-[7px] text-[11px] font-semibold tracking-[0.02em] text-accent">
            {fmtRate(plan.perMonthRate)}
          </div>
        )}
        <div className="mt-[7px] text-[11px] leading-normal text-ink/65">
          {plan.durationMonths} months at {mesoLength}-week blocks fits{" "}
          <strong className="text-ink">
            {plan.mesoCount} mesocycle{plan.mesoCount === 1 ? "" : "s"}
          </strong>
          .
        </div>
        <div className="mt-3 flex gap-1">
          {plan.phases.map((_, i) => (
            <div
              key={i}
              className={`flex h-[30px] flex-1 items-center justify-center text-[8px] font-bold tracking-[0.04em] ${
                i < impact.lockedCount
                  ? "bg-ink text-bg-base"
                  : "border-[1.5px] border-dashed border-ink/40 font-semibold text-ink/55"
              }`}
            >
              M{i + 1}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] leading-normal text-ink/55">
          {replanNote}
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}

      <div className="mt-[18px] mb-6 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base disabled:opacity-40"
        >
          {pending ? "SAVING" : "SAVE CHANGES"}
        </button>
      </div>

      <div className="mb-4 text-[10px] leading-normal text-ink/50">
        {plan.rationale}
      </div>
    </form>
  );
}
