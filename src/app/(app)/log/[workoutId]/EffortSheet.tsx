"use client";

import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { setSlotEffortAction } from "@/app/(app)/log/actions";
import type { LoggedExercise } from "@/lib/queries/logging";
import {
  effortRirLabel,
  repPositionLabel,
} from "@/lib/slot-effort-display";

/**
 * The three scopes the sheet offers (doc 21 §8 — a week picker is friction on a
 * lever meant to be one tap mid-session).
 *
 * They differ in how far FORWARD the assignment reaches, and in one thing that
 * is easy to miss: only `whole_block` covers the **deload** week. That is not a
 * UI choice — a flat `meso_exercises.target_rir` governs every week the per-week
 * schedule doesn't, and the deload falls off the end of that schedule by
 * construction (§4.1). The scoped forms write a schedule, so the deload keeps
 * its own target.
 *
 * What they do NOT differ in: none of them can reach backwards. A week whose
 * session for this day is completed, in progress or skipped is already trained,
 * and three independent layers keep it that way — `planEffortEdits` refuses an
 * op that NAMES such a week, `regenerateOpenWorkouts` skips completed
 * microcycles and any started workout inside a live one, and hard rule #5 never
 * lets a logged set be rewritten by anything. `EVERY WEEK` therefore reads as
 * "every week that hasn't happened yet"; the copy under the block says so
 * rather than leaving the athlete to infer it.
 */
const SCOPES = [
  { id: "this_week", label: "THIS WEEK" },
  { id: "rest_of_block", label: "REST OF BLOCK" },
  { id: "whole_block", label: "EVERY WEEK" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

/** What each scope actually reaches, said plainly under the block. */
function scopeHelp(scope: Scope, weekNumber: number): string {
  switch (scope) {
    case "this_week":
      return `Week ${weekNumber} only — the rest of the block stays on the ramp.`;
    case "rest_of_block":
      return `Week ${weekNumber} to the end of the block's working weeks. The deload keeps its own target.`;
    case "whole_block":
      return "Every working week and the deload week.";
  }
}

/** Steps offered relative to the week's own RIR. Absolute values are what get
 *  stored (A2) — the chips are relative only because "two notches easier" is
 *  how the request is actually formed. */
const STEPS = [1, 2, 4, 8];

/** doc 21 §3 — what the column accepts; the ASK is unbounded in principle and
 *  30 is what the app persists. */
const RIR_MAX = 30;

function parseRir(text: string): number | null {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 0 && n <= RIR_MAX ? n : null;
}

/**
 * doc 21 Phase 6 — the **Effort target** sheet: assign this slot's target RIR
 * for this week, the rest of the block, or the whole block, with a reason.
 *
 * Built to the Load-step precedent (doc 14 phase 3, `LoadStepSheet.tsx`) per §8,
 * and deliberately minimal per A4: MCP remains the primary surface, and the
 * set cap / rep position **read** here rather than being editable — a lever the
 * sheet cannot change must still be visible where the athlete looks for it.
 *
 * Two things this sheet will not do silently (§4.1):
 * - it states the week's own value first, so an assignment is always read as a
 *   departure from something rather than as the program's own idea;
 * - it keeps the server's warnings on screen after a save instead of closing
 *   over them — an assignment that makes a week harder than programmed, or that
 *   reaches the deload, is legitimate and must be *said*.
 */
export function EffortSheet({
  we,
  mesocycleId,
  dayNumber,
  weekNumber,
  weekRir,
  isDeload,
  readOnly,
  onClose,
}: {
  we: LoggedExercise | null;
  mesocycleId: string;
  dayNumber: number;
  weekNumber: number;
  weekRir: number;
  isDeload: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const effort = we?.slot_effort ?? null;
  const [value, setValue] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const [scope, setScope] = useState<Scope>("this_week");
  const [reason, setReason] = useState("");
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startSaving] = useTransition();

  // seed from the current assignment each time the sheet opens
  useEffect(() => {
    if (!we) return;
    const assigned = we.slot_effort?.assignedRir ?? null;
    const isChip =
      assigned != null && STEPS.some((s) => weekRir + s === assigned);
    setValue(assigned);
    setCustom(assigned != null && !isChip);
    setCustomText(assigned != null && !isChip ? String(assigned) : "");
    setScope("this_week");
    setReason(we.slot_effort?.reason ?? "");
    setWarnings(null);
    setError(null);
  }, [we, weekRir]);

  if (!we) return null;

  const customRir = parseRir(customText);
  const chosen = custom ? customRir : value;
  const customInvalid = custom && customText.trim() !== "" && customRir == null;
  // "use the week's ramp" is an explicit CHOICE, not the absence of one — an
  // empty CUSTOM field must not read as a request to clear the assignment, or
  // opening the sheet and tapping CUSTOM would arm a delete.
  const clearing = !custom && value == null;
  const dirty =
    chosen !== (effort?.assignedRir ?? null) ||
    reason.trim() !== (effort?.reason ?? "") ||
    scope !== "this_week";
  const canSave = !readOnly && dirty && (clearing || chosen != null);

  const save = () => {
    setError(null);
    setWarnings(null);
    startSaving(async () => {
      const result = await setSlotEffortAction({
        workout_id: we.workout_id,
        mesocycle_id: mesocycleId,
        day_number: dayNumber,
        exercise_id: we.exercise_id,
        week_number: weekNumber,
        scope,
        target_rir: chosen,
        clear: clearing,
        reason: reason.trim() === "" ? null : reason.trim(),
      });
      if (!result.ok) {
        setError(result.error ?? "That didn't save.");
        return;
      }
      // §4.1: a warning is the whole reason this sheet doesn't just close
      if (result.warnings && result.warnings.length > 0) {
        setWarnings(result.warnings);
        return;
      }
      onClose();
    });
  };

  // The settings vocabulary (fig 4.4 / the profile editor), not the Load-step
  // sheet's: 10px tracked caps, ink fill on selection, paper otherwise, and
  // contiguous button BLOCKS rather than loose chips. The Load-step precedent
  // governs the sheet's SHAPE (title, subtitle, chips, clear affordance,
  // Cancel/SAVE) — its chip scale reads a full size larger than every other
  // choice control in the app, which is what the owner caught here.
  const label = "text-[10px] font-semibold tracking-[0.14em] text-ink/55";
  const help = "mt-[7px] text-[11px] font-medium leading-normal text-ink/60";
  const blockCell = "flex-1 py-2.5 text-center text-[10px] tracking-[0.1em]";
  const cellOn = "bg-ink font-bold text-bg-base";
  const cellOff = "font-medium text-ink/55";
  const wideOff =
    "border border-dashed border-ink/40 font-medium text-ink/55";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Effort target"
      subtitle={`${we.exercise_name.toUpperCase()} — W${weekNumber}`}
    >
      {/* §4.1 — the week's own value, always, so an assignment reads as a
          departure rather than as the program's own idea */}
      <div className="flex items-baseline justify-between border-b border-ink/15 pb-2.5">
        <div className={label}>
          {isDeload ? "DELOAD WEEK" : `WEEK ${weekNumber} RAMP`}
        </div>
        <div className="numeral text-[15px] font-bold">{weekRir} RIR</div>
      </div>

      <p className="mt-3 text-[11px] font-medium leading-normal text-ink/60">
        Run this exercise at a different effort than the week asks. The weight is
        re-priced to meet it — easier means lighter, harder means heavier. Clear
        it and the week&apos;s ramp takes over again with nothing to unwind.
      </p>

      <div className={`mt-5 ${label}`}>TARGET RIR</div>
      <div className="mt-2 flex border-[1.5px] border-ink">
        {STEPS.map((step, i) => {
          const abs = weekRir + step;
          const active = !custom && value === abs;
          return (
            <button
              key={step}
              type="button"
              disabled={readOnly}
              aria-pressed={active}
              onClick={() => {
                setCustom(false);
                setValue(abs);
              }}
              className={`numeral ${blockCell} disabled:opacity-40 ${
                active
                  ? cellOn
                  : `${cellOff} ${i > 0 ? "border-l border-ink/30" : ""}`
              }`}
            >
              RIR {abs}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={readOnly}
        aria-pressed={custom}
        onClick={() => setCustom(true)}
        className={`mt-1.5 w-full py-2 text-center text-[10px] tracking-[0.06em] disabled:opacity-40 ${
          custom ? cellOn : wideOff
        }`}
      >
        {custom && customRir != null ? `CUSTOM — ${customRir} RIR` : "CUSTOM VALUE"}
      </button>

      {custom && (
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex items-center border-[1.5px] border-ink bg-paper">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={RIR_MAX}
              autoFocus
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={String(weekRir)}
              aria-label="custom target RIR"
              className="numeral h-9 w-20 bg-transparent px-3 text-[15px] font-bold focus:outline-none"
            />
            <span className="pr-3 text-[10px] font-medium tracking-[0.1em] text-ink/55">
              RIR
            </span>
          </div>
          {customInvalid && (
            <span className="text-[10px] font-medium leading-[1.3] text-accent">
              Enter a whole number 0–{RIR_MAX}.
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={readOnly}
        aria-pressed={clearing}
        onClick={() => {
          setCustom(false);
          setValue(null);
          setCustomText("");
        }}
        className={`mt-1.5 w-full py-2 text-center text-[10px] tracking-[0.06em] disabled:opacity-40 ${
          clearing ? cellOn : wideOff
        }`}
      >
        USE THE WEEK&apos;S RAMP ({weekRir} RIR)
      </button>

      <div className={`mt-5 ${label}`}>APPLIES TO</div>
      <div className="mt-2 flex border-[1.5px] border-ink">
        {SCOPES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            disabled={readOnly}
            aria-pressed={scope === s.id}
            onClick={() => setScope(s.id)}
            className={`${blockCell} disabled:opacity-40 ${
              scope === s.id
                ? cellOn
                : `${cellOff} ${i > 0 ? "border-l border-ink/30" : ""}`
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className={help}>
        {scopeHelp(scope, weekNumber)} Weeks you have already trained never
        change — a performed session is the record of what you did.
      </p>

      <div className={`mt-5 ${label}`}>REASON</div>
      <input
        type="text"
        value={reason}
        disabled={readOnly}
        onChange={(e) => setReason(e.target.value)}
        placeholder="nerve flare — easing the lumbar load"
        aria-label="reason for the effort assignment"
        maxLength={500}
        className="mt-2 h-10 w-full border-[1.5px] border-ink bg-paper px-3 text-[13px] font-medium focus:outline-none disabled:opacity-40"
      />

      {/* A4 — read-only disclosure of the two levers the connector owns */}
      {(effort?.setCap != null || effort?.repPosition != null) && (
        <>
          <div className={`mt-5 ${label}`}>SET BY YOUR COACH</div>
          <div className="mt-1">
            {effort?.setCap != null && (
              <div className="flex items-baseline justify-between border-b border-ink/15 py-[11px]">
                <div className="text-sm font-semibold">Working-set cap</div>
                <div className="numeral text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
                  {effort.setCap}
                </div>
              </div>
            )}
            {effort?.repPosition != null && (
              <div className="flex items-baseline justify-between border-b border-ink/15 py-[11px]">
                <div className="text-sm font-semibold">Priced at</div>
                <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
                  {repPositionLabel(effort.repPosition)}
                </div>
              </div>
            )}
          </div>
          <p className={help}>
            Set through the AI connector. This sheet changes the effort target
            only.
          </p>
        </>
      )}

      {effort && (
        <p className={help}>
          This week is priced at{" "}
          <span className="numeral">
            {effortRirLabel(effort.rir, effort.measuring)}
          </span>
          {effort.measuring
            ? "."
            : " — priced normally, but too far from failure to read as a strength measurement."}
        </p>
      )}

      {readOnly && (
        <p className={help}>
          This session is closed. Its effort target is part of the record and
          can&apos;t be changed.
        </p>
      )}

      {error && (
        <p className="mt-4 border-l-2 border-ink/40 pl-2.5 text-[11px] font-medium leading-normal text-ink/75">
          {error}
        </p>
      )}
      {warnings && warnings.length > 0 && (
        <div className="mt-4 border-l-2 border-ink/40 pl-2.5">
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/50">
            SAVED — NOTE
          </div>
          {warnings.map((w, i) => (
            <p
              key={i}
              className="mt-1 text-[11px] font-medium leading-normal text-ink/75"
            >
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          {warnings ? "Done" : "Cancel"}
        </button>
        {!warnings && (
          <button
            type="button"
            disabled={!canSave || pending}
            onClick={save}
            className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
          >
            SAVE
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
