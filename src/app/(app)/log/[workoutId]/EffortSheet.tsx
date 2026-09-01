"use client";

import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GuardedGuideLink } from "@/components/ui/GuardedGuideLink";
import { InfoDot } from "@/components/ui/InfoDot";
import { GUIDE_LINKS } from "@/lib/guide-links";
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
 * They differ in exactly one thing, and it is easy to miss: only `whole_block`
 * covers the **deload** week. That is not a UI choice — a flat
 * `meso_exercises.target_rir` governs every week the per-week schedule doesn't,
 * and the deload falls off the end of that schedule by construction (§4.1). The
 * scoped forms write a schedule, so the deload keeps its own target.
 *
 * `rest_of_block` is labelled WORKING WEEKS rather than "rest of block" because
 * that is what it is *in effect*: it writes from this week forward, and the
 * weeks behind it cannot change anyway — a session that is completed, in
 * progress or skipped is already trained, and `planEffortEdits`,
 * `regenerateOpenWorkouts` and hard rule #5 each independently keep it that way.
 * Writing forward-only rather than rewriting weeks 1..n is the strictly safer
 * form of the same outcome, so the stored plan never gains an edit that could
 * not have had an effect.
 */
const SCOPES = [
  { id: "this_week", label: "THIS WEEK" },
  { id: "rest_of_block", label: "WORKING WEEKS" },
  { id: "whole_block", label: "ALL WEEKS" },
] as const;
type Scope = (typeof SCOPES)[number]["id"];

/** What each scope reaches, in one short line under the block. */
function scopeHelp(scope: Scope, weekNumber: number): string {
  switch (scope) {
    case "this_week":
      return `Week ${weekNumber} only.`;
    case "rest_of_block":
      return "Every working week — not the deload.";
    case "whole_block":
      return "Every working week and the deload.";
  }
}

/**
 * The RIR values offered, left to right. `0` is absolute — taken to failure, the
 * hardest thing this lever can ask for — and the rest are steps EASIER than the
 * week's own target, resolved to absolute values on selection (A2 stores
 * absolutes; the steps are relative only because "two notches easier" is how the
 * request is actually formed). A step can never collide with the 0 cell, since
 * every step is at least 1 above a week RIR that is itself ≥ 0.
 */
const EASIER_STEPS = [1, 2, 4, 8];

function rirOptions(weekRir: number): number[] {
  return [0, ...EASIER_STEPS.map((step) => weekRir + step)];
}

/** doc 21 §3 — what the column accepts; the ASK is unbounded in principle and
 *  30 is what the app persists. */
const RIR_MAX = 30;

function parseRir(text: string): number | null {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 0 && n <= RIR_MAX ? n : null;
}

/**
 * doc 21 Phase 6 — the **Effort target** sheet: assign this slot's target RIR
 * for this week, the block's working weeks, or all of them, with a reason.
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
    const onCell = assigned != null && rirOptions(weekRir).includes(assigned);
    setValue(assigned);
    setCustom(assigned != null && !onCell);
    setCustomText(assigned != null && !onCell ? String(assigned) : "");
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

  // The settings vocabulary (fig 4.4 / the profile editor) at the settings
  // SCALE — 10px tracked caps in contiguous button BLOCKS, paper with no fill
  // when unselected — but with **accent** on the selected cell rather than the
  // settings screens' ink. Hard rule 7 reserves orange for current position and
  // selection, which is exactly what a selected cell is; the settings screens
  // predate that reading and the Load-step sheet already fills with accent.
  // What was wrong before this pass was only the SCALE: Load step's 13px bold
  // chips read a full size larger than every other choice control in the app.
  const label = "text-[10px] font-semibold tracking-[0.14em] text-ink-muted";
  const help = "mt-[7px] text-[11px] font-medium leading-normal text-ink/60";
  const blockCell = "flex-1 py-2.5 text-center text-[10px] tracking-[0.1em]";
  const cellOn = "bg-accent font-bold text-bg-base";
  const cellOff = "font-medium text-ink-muted";
  const wideOff =
    "border border-dashed border-ink/40 font-medium text-ink-muted";

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

      {/* N81 — the lever this sheet exists to set. `22c` §C2 had it as
          "covered by an extended rir / new key"; it took its own key,
          because the week's ramp and one exercise's override are two
          different things to a reader looking at both on this screen. */}
      <div className={`mt-5 flex items-center gap-1.5 ${label}`}>
        TARGET RIR
        <InfoDot term="exercise_target_rir" small staged />
      </div>
      <div className="mt-2 flex border-[1.5px] border-ink">
        {rirOptions(weekRir).map((abs, i) => {
          const active = !custom && value === abs;
          return (
            <button
              key={abs}
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
            <span className="pr-3 text-[10px] font-medium tracking-[0.1em] text-ink-muted">
              RIR
            </span>
          </div>
          {/* ink, not accent: inside this sheet accent now means SELECTED, so
              an orange error string would compete with the filled cells */}
          {customInvalid && (
            <span className="text-[10px] font-medium leading-[1.3] text-ink/70">
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
      <p className={help}>{scopeHelp(scope, weekNumber)}</p>

      <div className={`mt-5 ${label}`}>REASON</div>
      <input
        type="text"
        value={reason}
        disabled={readOnly}
        onChange={(e) => setReason(e.target.value)}
        placeholder="why this exercise runs differently"
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
                <div className="numeral text-[9.5px] font-semibold tracking-[0.1em] text-ink-muted">
                  {effort.setCap}
                </div>
              </div>
            )}
            {effort?.repPosition != null && (
              <div className="flex items-baseline justify-between border-b border-ink/15 py-[11px]">
                <div className="text-sm font-semibold">Priced at</div>
                <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-muted">
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
          <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted">
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

      {/* doc 22 Phase 7c, audit §3.3 — one slot off the week's ramp reprices
          the load, and no line on this sheet says so. The budget rule sends the
          `SET BY YOUR COACH` block's candidate here too: one link per surface,
          and this is the section that covers the whole sheet. */}
      <GuardedGuideLink
        rule
        className="mt-5"
        to={GUIDE_LINKS.effortTarget}
        from={`/log/${we.workout_id}`}
        dirty={dirty}
        body="Your effort target hasn't been saved. Discard it and leave?"
      />

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
