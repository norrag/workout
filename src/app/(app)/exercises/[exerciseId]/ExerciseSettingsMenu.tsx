"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { setIncrementOverrideAction } from "@/app/(app)/exercises/actions";

/** lb plate-math jumps / kg micro-load jumps; the union with the engine default
 *  + any current override is what the user chooses from. */
const PRESETS: Record<"kg" | "lb", number[]> = {
  lb: [2.5, 5, 10, 15, 25],
  kg: [1, 2.5, 5, 7.5, 10],
};

/** trim a step to a clean label: 5 → "5", 2.5 → "2.5". */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * Per-exercise engine settings, opened from the Exercise page header `⋯` (the
 * mockup's overflow affordance, fig 3.1a). The first tunable is the editable
 * weight increment (doc 14 phase 3) — the per-set load step the engine adds on a
 * met prescription. Picking a value overrides the equipment default for this lift
 * only; "USE DEFAULT" clears it. The change re-stamps this exercise's planned
 * prescriptions on next view (the read-path freshness reconcile), so it never
 * touches logged history.
 */
export function ExerciseSettingsMenu({
  exerciseId,
  units,
  defaultStep,
  override,
}: {
  exerciseId: string;
  units: "kg" | "lb";
  defaultStep: number;
  override: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(override);
  const [pending, startSaving] = useTransition();

  // chips: presets ∪ the engine default ∪ the current override, sorted
  const steps = [
    ...new Set([...PRESETS[units], defaultStep, ...(override != null ? [override] : [])]),
  ].sort((a, b) => a - b);

  const dirty = selected !== override;

  const save = () => {
    startSaving(async () => {
      await setIncrementOverrideAction({
        exercise_id: exerciseId,
        weight_increment: selected,
      });
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        aria-label="exercise settings"
        onClick={() => {
          setSelected(override);
          setOpen(true);
        }}
        className="-mr-1 px-1.5 text-[16px] leading-none text-ink/45"
      >
        ⋯
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Load step"
        subtitle="PER-SET WEIGHT JUMP FOR THIS EXERCISE"
      >
        <p className="text-[12px] leading-[1.5] text-ink/65">
          The weight the engine adds when you hit a prescription. Overrides the
          equipment default for this exercise only.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {steps.map((step) => {
            const active = selected === step;
            return (
              <button
                key={step}
                type="button"
                onClick={() => setSelected(step)}
                className={`numeral min-w-[3.5rem] border-[1.5px] px-3 py-2.5 text-[13px] font-bold tracking-[0.02em] ${
                  active
                    ? "border-accent bg-accent text-bg-base"
                    : "border-ink/30 text-ink/80"
                }`}
              >
                +{fmt(step)} {units}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`mt-3 text-[10px] font-bold tracking-[0.12em] ${
            selected === null ? "text-accent" : "text-ink/45"
          }`}
        >
          {selected === null ? "■ " : ""}USE DEFAULT (+{fmt(defaultStep)} {units})
        </button>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={save}
            className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
          >
            SAVE
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
