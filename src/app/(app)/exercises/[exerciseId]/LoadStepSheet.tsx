"use client";

import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GuardedGuideLink } from "@/components/ui/GuardedGuideLink";
import { GUIDE_LINKS } from "@/lib/guide-links";
import { setIncrementOverrideAction } from "@/app/(app)/exercises/actions";

/** lb plate-math jumps; the union with the engine default + any current
 *  override is what the user chooses from. */
const PRESETS = [2.5, 5, 10, 15, 25];

/** trim a step to a clean label: 5 → "5", 2.5 → "2.5". */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** the largest custom increment we accept; the action caps the same value so a
 *  fat-fingered entry can't poison the engine (which clamps/rounds regardless). */
const MAX_STEP = 1000;

/** parse a custom-step entry; null when it isn't a sane positive load jump. */
function parseStep(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n <= MAX_STEP ? n : null;
}

/**
 * Per-exercise Load-step sheet (I13, doc 14 phase 3) — the editable weight
 * increment: the per-set load step the engine adds on a met prescription.
 * Picking a preset, or typing a CUSTOM value for the odd machine/plate jump the
 * presets don't cover, overrides the equipment default for this lift only;
 * "USE DEFAULT" clears it. The change re-stamps this exercise's planned
 * prescriptions on next view (the read-path freshness reconcile), so it never
 * touches logged history.
 *
 * N22: controlled (open/onClose) — driven from the ExerciseHeader ⋮ menu
 * rather than its own faint `⋯` trigger, so the setting is discoverable.
 */
export function LoadStepSheet({
  open,
  onClose,
  exerciseId,
  defaultStep,
  override,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  defaultStep: number;
  override: number | null;
}) {
  const [selected, setSelected] = useState<number | null>(override);
  // custom mode: the override (or chosen value) is a free-typed step, not a chip
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [pending, startSaving] = useTransition();

  // chips: presets ∪ the engine default, sorted; a custom override lives in the
  // text field instead so it doesn't masquerade as a preset
  const steps = [...new Set([...PRESETS, defaultStep])].sort((a, b) => a - b);

  // seed from the current override each time the sheet opens: a value that isn't
  // a chip (an odd custom jump) opens in custom mode with the field prefilled.
  useEffect(() => {
    if (!open) return;
    const isCustom = override != null && !steps.includes(override);
    setCustom(isCustom);
    setCustomText(isCustom ? fmt(override) : "");
    setSelected(isCustom ? null : override);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, override]);

  // the value we'd save: a parsed custom entry, the chosen chip, or null (default)
  const customStep = parseStep(customText);
  const value = custom ? customStep : selected;
  const customInvalid = custom && customText.trim() !== "" && customStep === null;
  const dirty = value !== override;
  const canSave = dirty && !(custom && customStep === null);

  const save = () => {
    startSaving(async () => {
      await setIncrementOverrideAction({
        exercise_id: exerciseId,
        weight_increment: value,
      });
      onClose();
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Load step"
      subtitle="PER-SET WEIGHT JUMP FOR THIS EXERCISE"
    >
      <p className="text-[12px] leading-[1.5] text-ink/65">
        The weight the engine adds when you hit a prescription. Overrides the
        equipment default for this exercise only. Steps run from the last weight
        you entered — enter 88 with a 10 lb step and the next stops are 98 and
        78.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {steps.map((step) => {
          const active = !custom && selected === step;
          return (
            <button
              key={step}
              type="button"
              onClick={() => {
                setCustom(false);
                setSelected(step);
              }}
              className={`numeral min-w-[3.5rem] border-[1.5px] px-3 py-2.5 text-[13px] font-bold tracking-[0.02em] ${
                active
                  ? "border-accent bg-accent text-bg-base"
                  : "border-ink/30 text-ink/80"
              }`}
            >
              +{fmt(step)} lb
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`min-w-[3.5rem] border-[1.5px] px-3 py-2.5 text-[13px] font-bold tracking-[0.02em] ${
            custom
              ? "border-accent bg-accent text-bg-base"
              : "border-dashed border-ink/40 text-ink/70"
          }`}
        >
          CUSTOM
        </button>
      </div>

      {custom && (
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

      <button
        type="button"
        onClick={() => {
          setCustom(false);
          setSelected(null);
        }}
        className={`mt-3 text-[10px] font-bold tracking-[0.12em] ${
          !custom && selected === null ? "text-accent" : "text-ink/45"
        }`}
      >
        {!custom && selected === null ? "■ " : ""}USE DEFAULT (+{fmt(defaultStep)} lb)
      </button>

      {/* doc 22 Phase 7c, audit §3.3 — the paragraph above states the
          step-off-the-last-entered-weight rule (N67) in two sentences; the
          section is where the rest of it lives. Guarded: a chosen-but-unsaved
          step is exactly the state a navigation would drop. */}
      <GuardedGuideLink
        rule
        className="mt-5"
        to={GUIDE_LINKS.loadStep}
        from={`/exercises/${exerciseId}`}
        dirty={dirty}
        body="Your load step hasn't been saved. Discard it and leave?"
      />

      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave || pending}
          onClick={save}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
        >
          SAVE
        </button>
      </div>
    </BottomSheet>
  );
}
