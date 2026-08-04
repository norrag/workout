"use client";

import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { setSlotEffortAction } from "@/app/(app)/log/actions";
import type { LoggedExercise } from "@/lib/queries/logging";
import {
  effortRirLabel,
  repPositionLabel,
} from "@/lib/slot-effort-display";

/** The three scopes the sheet offers (doc 21 §8 — a week picker is friction on
 *  a lever meant to be one tap mid-session). */
const SCOPES = [
  { id: "this_week", label: "THIS WEEK" },
  { id: "rest_of_block", label: "REST OF BLOCK" },
  { id: "whole_block", label: "WHOLE BLOCK" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

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
  const clearing = chosen == null;
  const dirty =
    chosen !== (effort?.assignedRir ?? null) ||
    reason.trim() !== (effort?.reason ?? "") ||
    scope !== "this_week";
  const canSave =
    !readOnly && dirty && !(custom && customText.trim() !== "" && customRir == null);

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

  const chip =
    "border-[1.5px] px-3 py-2.5 text-[13px] font-bold tracking-[0.02em]";
  const chipOn = "border-accent bg-accent text-bg-base";
  const chipOff = "border-ink/30 text-ink/80";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Effort target"
      subtitle={`${we.exercise_name.toUpperCase()} — W${weekNumber}`}
    >
      {/* §4.1 — the week's own value, always, so an assignment reads as a
          departure rather than as the program's own idea */}
      <div className="flex items-baseline justify-between border-b border-ink/15 pb-2">
        <span className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
          {isDeload ? "DELOAD WEEK" : `WEEK ${weekNumber} RAMP`}
        </span>
        <span className="numeral text-[13px] font-bold text-ink">
          {weekRir} RIR
        </span>
      </div>

      <p className="mt-3 text-[12px] leading-[1.5] text-ink/65">
        Run this exercise at a different effort than the week asks. The weight is
        re-priced to meet it — easier means lighter, harder means heavier. Clear
        it and the week&apos;s ramp takes over again with nothing to unwind.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((step) => {
          const abs = weekRir + step;
          const active = !custom && value === abs;
          return (
            <button
              key={step}
              type="button"
              disabled={readOnly}
              onClick={() => {
                setCustom(false);
                setValue(abs);
              }}
              className={`numeral min-w-[3.5rem] ${chip} ${active ? chipOn : chipOff} disabled:opacity-40`}
            >
              RIR {abs}
            </button>
          );
        })}
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setCustom(true)}
          className={`min-w-[3.5rem] ${chip} ${
            custom ? chipOn : "border-dashed border-ink/40 text-ink/70"
          } disabled:opacity-40`}
        >
          CUSTOM
        </button>
      </div>

      {custom && (
        <div className="mt-3 flex items-center gap-2.5">
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
              className="numeral h-10 w-24 bg-transparent px-3 text-[15px] font-bold focus:outline-none"
            />
            <span className="pr-3 text-[11px] font-medium tracking-[0.08em] text-ink/55">
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

      <div className="mt-4 text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
        APPLIES TO
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={readOnly}
            onClick={() => setScope(s.id)}
            className={`${chip} ${scope === s.id ? chipOn : chipOff} disabled:opacity-40`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
        REASON
      </div>
      <input
        type="text"
        value={reason}
        disabled={readOnly}
        onChange={(e) => setReason(e.target.value)}
        placeholder="nerve flare — easing the lumbar load"
        aria-label="reason for the effort assignment"
        maxLength={500}
        className="mt-1.5 h-10 w-full border-[1.5px] border-ink bg-paper px-3 text-[13px] font-medium focus:outline-none disabled:opacity-40"
      />

      <button
        type="button"
        disabled={readOnly}
        onClick={() => {
          setCustom(false);
          setValue(null);
          setCustomText("");
        }}
        className={`mt-3 text-[10px] font-bold tracking-[0.12em] disabled:opacity-40 ${
          clearing ? "text-accent" : "text-ink/45"
        }`}
      >
        {clearing ? "■ " : ""}USE THE WEEK&apos;S RAMP ({weekRir} RIR)
      </button>

      {/* A4 — read-only disclosure of the two levers the connector owns */}
      {(effort?.setCap != null || effort?.repPosition != null) && (
        <div className="mt-4 border-t border-ink/15 pt-2.5">
          {effort?.setCap != null && (
            <div className="flex items-baseline justify-between py-1">
              <span className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
                WORKING-SET CAP
              </span>
              <span className="numeral text-[12px] font-medium text-ink/80">
                {effort.setCap}
              </span>
            </div>
          )}
          {effort?.repPosition != null && (
            <div className="flex items-baseline justify-between py-1">
              <span className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
                PRICED AT
              </span>
              <span className="text-[12px] font-medium text-ink/80">
                {repPositionLabel(effort.repPosition)}
              </span>
            </div>
          )}
          <p className="mt-1 text-[11px] leading-[1.45] text-ink/55">
            Set through the coach connector. This sheet changes the effort target
            only.
          </p>
        </div>
      )}

      {effort && (
        <p className="mt-3 text-[11px] leading-[1.45] text-ink/55">
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
        <p className="mt-3 text-[11px] leading-[1.45] text-ink/55">
          This session is closed. Its effort target is part of the record and
          can&apos;t be changed.
        </p>
      )}

      {error && (
        <p className="mt-3 border-l-2 border-ink/40 pl-2.5 text-[11.5px] leading-[1.45] text-ink/75">
          {error}
        </p>
      )}
      {warnings && warnings.length > 0 && (
        <div className="mt-3 border-l-2 border-ink/40 pl-2.5">
          <div className="text-[9px] font-semibold tracking-[0.16em] text-ink/45">
            SAVED — NOTE
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="mt-1 text-[11.5px] leading-[1.45] text-ink/75">
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
