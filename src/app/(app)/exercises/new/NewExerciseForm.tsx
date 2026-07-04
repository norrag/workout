"use client";

import { useActionState, useState } from "react";
import type { MuscleGroupRow } from "@/lib/types/database";
import {
  customExerciseEquipment as EQUIPMENT,
  type CustomExerciseEquipment,
} from "@/lib/types/equipment";
import { createCustomExerciseAction, type FormState } from "../actions";

/** lb plate-math jumps offered for the load step — same vocabulary as the
 *  exercise page's Load-step sheet so create and edit read as one control. */
const STEP_PRESETS = [2.5, 5, 10, 15, 25];
const MAX_STEP = 1000;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** what the entered weight means, per bodyweight equipment kind (R12) —
 *  surfaced inline so the pick is informed, not a guess. */
const LOAD_HINTS: Partial<Record<CustomExerciseEquipment, string>> = {
  "bodyweight only": "The load is your bodyweight — push-up, air squat.",
  "bodyweight loadable": "Entered weight is ADDED to bodyweight — weighted pull-up.",
  "machine assistance": "Entered weight is assistance REMOVED — assisted dip.",
};

/**
 * Create custom exercise (08 §4, described not mocked; N22 rebuild). Ledger
 * sections with dividers; the load step is settable at creation (was
 * create-then-edit) via the same preset-chip grammar as the Load-step sheet,
 * hidden for bodyweight-only equipment where the engine progresses reps and
 * the step is inert (PH36).
 */
export function NewExerciseForm({
  muscleGroups,
  defaultSteps,
}: {
  muscleGroups: MuscleGroupRow[];
  /** engine default rounding step per creatable equipment value */
  defaultSteps: Record<CustomExerciseEquipment, number>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createCustomExerciseAction,
    { error: null },
  );
  const [equipment, setEquipment] = useState<CustomExerciseEquipment>("machine");
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [secondaryIds, setSecondaryIds] = useState<string[]>([]);
  // load step: null = equipment default (no override), number = preset chip,
  // "custom" = free-typed value in the text field
  const [step, setStep] = useState<number | null>(null);
  const [customStep, setCustomStep] = useState(false);
  const [customText, setCustomText] = useState("");

  const toggleSecondary = (id: string) =>
    setSecondaryIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 4),
    );

  const defaultStep = defaultSteps[equipment] ?? 5;
  // the engine never adds load to a bodyweight-only lift — no step to set
  const stepApplies = equipment !== "bodyweight only";
  const parsedCustom = (() => {
    const n = Number(customText);
    return Number.isFinite(n) && n > 0 && n <= MAX_STEP ? n : null;
  })();
  const customInvalid =
    customStep && customText.trim() !== "" && parsedCustom === null;
  const stepValue = !stepApplies ? null : customStep ? parsedCustom : step;

  const label = "text-[10px] font-semibold tracking-[0.14em] text-ink/55";
  const section = "mt-6 border-t border-ink/15 pt-5";
  const chip = (selected: boolean) =>
    `px-2.5 py-2 text-[10px] font-semibold tracking-[0.08em] ${
      selected ? "bg-ink text-bg-base" : "border border-ink/40 text-ink/70"
    }`;
  const stepChip = (selected: boolean) =>
    `numeral min-w-[3.5rem] border-[1.5px] px-3 py-2.5 text-[13px] font-bold tracking-[0.02em] ${
      selected
        ? "border-accent bg-accent text-bg-base"
        : "border-ink/30 text-ink/80"
    }`;

  return (
    <form action={formAction} className="mt-5">
      <input type="hidden" name="equipment_type" value={equipment} />
      <input type="hidden" name="primary_muscle_group_id" value={primaryId ?? ""} />
      <input type="hidden" name="secondary" value={JSON.stringify(secondaryIds)} />
      <input
        type="hidden"
        name="weight_increment"
        value={stepValue != null ? String(stepValue) : ""}
      />

      <div className={label}>NAME</div>
      <input
        name="name"
        maxLength={80}
        required
        placeholder="e.g. Banded Hip Thrust"
        className="mt-[7px] h-11 w-full border-[1.5px] border-ink bg-paper px-3 text-sm font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
      />

      <div className={section}>
        <div className={label}>EQUIPMENT</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EQUIPMENT.map((eq) => (
            <button
              key={eq}
              type="button"
              aria-pressed={equipment === eq}
              onClick={() => setEquipment(eq)}
              className={chip(equipment === eq)}
            >
              {eq.toUpperCase()}
            </button>
          ))}
        </div>
        {LOAD_HINTS[equipment] && (
          <p className="mt-2 text-[11px] leading-normal text-ink/60">
            {LOAD_HINTS[equipment]}
          </p>
        )}
      </div>

      <div className={section}>
        <div className={label}>PRIMARY MUSCLE GROUP</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {muscleGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={primaryId === g.id}
              onClick={() => {
                setPrimaryId(g.id);
                setSecondaryIds((cur) => cur.filter((x) => x !== g.id));
              }}
              className={chip(primaryId === g.id)}
            >
              {g.name.toUpperCase()}
            </button>
          ))}
        </div>

        <div className={`mt-5 ${label}`}>SECONDARY — OPTIONAL</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {muscleGroups
            .filter((g) => g.id !== primaryId)
            .map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={secondaryIds.includes(g.id)}
                onClick={() => toggleSecondary(g.id)}
                className={chip(secondaryIds.includes(g.id))}
              >
                {g.name.toUpperCase()}
              </button>
            ))}
        </div>
      </div>

      {/* N22 — load step at creation (was create-then-edit). Same chips as the
          Load-step sheet; DEFAULT keeps the equipment step (no override row). */}
      {stepApplies && (
        <div className={section}>
          <div className={label}>LOAD STEP</div>
          <p className="mt-1.5 text-[11px] leading-normal text-ink/60">
            The weight the engine adds when you hit a prescription. Leave on
            default unless this machine jumps differently.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCustomStep(false);
                setStep(null);
              }}
              className={stepChip(!customStep && step === null)}
            >
              DEFAULT +{fmt(defaultStep)} lb
            </button>
            {STEP_PRESETS.filter((p) => p !== defaultStep).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setCustomStep(false);
                  setStep(p);
                }}
                className={stepChip(!customStep && step === p)}
              >
                +{fmt(p)} lb
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomStep(true)}
              className={`min-w-[3.5rem] border-[1.5px] px-3 py-2.5 text-[13px] font-bold tracking-[0.02em] ${
                customStep
                  ? "border-accent bg-accent text-bg-base"
                  : "border-dashed border-ink/40 text-ink/70"
              }`}
            >
              CUSTOM
            </button>
          </div>
          {customStep && (
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex items-center border-[1.5px] border-ink bg-paper">
                <span className="pl-3 text-[15px] font-bold text-ink/45">+</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  max={MAX_STEP}
                  autoFocus
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder={fmt(defaultStep)}
                  aria-label="custom load step"
                  className="numeral h-10 w-24 bg-transparent px-2 text-[15px] font-bold focus:outline-none"
                />
                <span className="pr-3 text-[11px] font-medium tracking-[0.08em] text-ink/55">
                  lb
                </span>
              </div>
              {customInvalid && (
                <span className="text-[10px] font-medium leading-[1.3] text-accent">
                  Enter a number above 0 and up to {MAX_STEP}.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className={section}>
        <div className={label}>DESCRIPTION — OPTIONAL</div>
        <textarea
          name="description"
          maxLength={500}
          rows={2}
          placeholder="Setup, cues, anything a picker card should say"
          className="mt-[7px] w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
        />

        <div className={`mt-4 ${label}`}>NOTES — OPTIONAL</div>
        <textarea
          name="notes"
          maxLength={500}
          rows={2}
          placeholder="Private notes — only you see these"
          className="mt-[7px] w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
        />
      </div>

      {state.error && <p className="mt-3 text-xs text-accent">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || primaryId === null || customInvalid}
        className="mt-6 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base disabled:opacity-40"
      >
        {pending ? "CREATING…" : "CREATE EXERCISE"}
      </button>
      <p className="mt-2.5 text-[11px] leading-normal text-ink/60">
        Custom exercises are visible only to you — share them from the
        exercise page.
      </p>
    </form>
  );
}
