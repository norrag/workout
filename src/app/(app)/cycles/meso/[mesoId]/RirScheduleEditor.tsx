"use client";

import { useEffect } from "react";

/** Seed a per-week schedule from the linear ramp (mirrors engine `rirRamp`). */
export function seedSchedule(
  workingWeeks: number,
  start: number,
  end: number,
): number[] {
  return Array.from({ length: workingWeeks }, (_, i) => {
    const t = workingWeeks === 1 ? 1 : i / (workingWeeks - 1);
    return Math.round(start + (end - start) * t);
  });
}

/**
 * N18-B: week-by-week RIR editor, shared by the FinalizeSheet and the
 * edit-details sheet behind their ADVANCED disclosures. The toggle mirrors the
 * deload checkbox grammar; each working week gets the same 0–5 segmented row
 * as START/END RIR (any values in any order — flexibility is the point). The
 * deload week is engine-owned and shown as a note, never a row. `schedule`
 * doubles as the toggle state: null = the plain ramp.
 */
export function RirScheduleEditor({
  weeks,
  deload,
  rampStart,
  rampEnd,
  schedule,
  onChange,
}: {
  weeks: number;
  deload: boolean;
  rampStart: number;
  rampEnd: number;
  schedule: number[] | null;
  onChange: (schedule: number[] | null) => void;
}) {
  const working = deload ? weeks - 1 : weeks;

  // keep an active schedule aligned when the meso length / deload flag moves:
  // truncate, or extend by repeating the last week's RIR
  useEffect(() => {
    if (schedule && schedule.length !== working) {
      onChange(
        schedule.length > working
          ? schedule.slice(0, working)
          : [
              ...schedule,
              ...Array<number>(working - schedule.length).fill(
                schedule[schedule.length - 1] ?? rampEnd,
              ),
            ],
      );
    }
  }, [schedule, working, rampEnd, onChange]);

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          onChange(schedule ? null : seedSchedule(working, rampStart, rampEnd))
        }
        className="mt-4 flex w-full items-center gap-2.5 text-left"
      >
        <div
          className={`flex h-[18px] w-[18px] items-center justify-center border-[1.5px] border-ink text-[11px] font-bold ${
            schedule ? "bg-ink text-bg-base" : ""
          }`}
        >
          {schedule ? "✓" : ""}
        </div>
        <span className="text-xs font-semibold">
          Set each week independently
        </span>
      </button>

      {schedule && (
        <div className="mt-3">
          {schedule.map((rir, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 ${i === 0 ? "" : "mt-1.5"}`}
            >
              <span className="numeral w-[34px] flex-shrink-0 text-[11px] font-semibold text-ink-muted">
                W{i + 1}
              </span>
              <div className="flex flex-1 border-[1.5px] border-ink">
                {[0, 1, 2, 3, 4, 5].map((r, j) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      onChange(schedule.map((v, k) => (k === i ? r : v)))
                    }
                    className={`numeral flex-1 py-[9px] text-center text-[13px] ${
                      rir === r
                        ? "bg-ink font-bold text-bg-base"
                        : `font-medium ${j > 0 ? "border-l border-ink/25" : ""}`
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {deload && (
            <div className="mt-2 text-[9.5px] font-medium tracking-[0.1em] text-ink/45">
              W{weeks} DELOAD — RIR SET BY THE ENGINE
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsed-summary text for a ramp or schedule (shared by both sheets). */
export function rirSummary(
  schedule: number[] | null,
  start: number,
  end: number,
): string {
  return schedule ? `RIR BY WEEK: ${schedule.join("·")}` : `RIR RAMP: ${start} → ${end}`;
}
