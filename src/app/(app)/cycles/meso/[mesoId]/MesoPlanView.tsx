"use client";

import { useState } from "react";

// P16 — the meso Overview panel: the planner board rendered read-only (view
// the plan and its days; editing goes through the header ⋮ menu → planner
// board). Mirrors the board's day tabs + flat ordered exercise list (fig 2.5)
// without the edit affordances.

export interface PlanViewFill {
  id: string;
  exercise_name: string;
  equipment: string;
  initial_sets: number;
  muscle_group: string;
  /** flat day-level order (across groups) */
  day_position: number;
}

export interface PlanViewDay {
  id: string;
  day_number: number;
  label: string | null;
  weekday: number | null;
  fills: PlanViewFill[];
  /** unfilled slots per muscle group, in group order */
  openSlots: { muscle_group: string; count: number }[];
}

const WEEKDAY_LABELS = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function dayTabLabel(day: PlanViewDay): string {
  return day.weekday
    ? (WEEKDAY_LABELS[day.weekday] ?? `D${day.day_number}`)
    : `DAY ${day.day_number}`;
}

function badge(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function MesoPlanView({ days }: { days: PlanViewDay[] }) {
  const [activeDayId, setActiveDayId] = useState<string | null>(
    days[0]?.id ?? null,
  );
  const activeDay = days.find((d) => d.id === activeDayId) ?? days[0] ?? null;

  if (days.length === 0)
    return (
      <p className="mt-4 text-sm text-ink/60">
        Nothing planned yet — open the header menu and choose{" "}
        <strong className="text-ink">Edit plan</strong> to build this
        mesocycle.
      </p>
    );

  return (
    <div>
      <div className="mt-4 flex border-[1.5px] border-ink">
        {days.map((day, i) => {
          const active = day.id === activeDay?.id;
          return (
            <button
              key={day.id}
              type="button"
              onClick={() => setActiveDayId(day.id)}
              className={`flex-1 py-[11px] text-center text-[11px] tracking-[0.08em] ${
                active
                  ? "bg-ink font-bold text-bg-base"
                  : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
              }`}
            >
              {dayTabLabel(day)}
            </button>
          );
        })}
      </div>

      {activeDay && (
        <>
          <div className="mt-2 text-[9px] font-semibold tracking-[0.1em] text-ink-muted">
            {dayTabLabel(activeDay)}
            {activeDay.label ? ` "${activeDay.label.toUpperCase()}"` : ""} —{" "}
            <span className="numeral">{activeDay.fills.length}</span>{" "}
            {activeDay.fills.length === 1 ? "EXERCISE" : "EXERCISES"} ·{" "}
            <span className="numeral">
              {activeDay.fills.reduce((n, f) => n + f.initial_sets, 0)}
            </span>{" "}
            SETS
          </div>

          <div className="mt-3">
            {[...activeDay.fills]
              .sort((a, b) => a.day_position - b.day_position)
              .map((fill) => (
                <div
                  key={fill.id}
                  className="flex items-center gap-3 border-b border-ink/[0.18] py-2.5 pl-0.5 last:border-b-0"
                >
                  <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[9px] font-extrabold">
                    {badge(fill.muscle_group)}
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-semibold">
                      {fill.exercise_name}
                    </div>
                    <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink-muted">
                      {fill.muscle_group.toUpperCase()} ·{" "}
                      {fill.equipment.toUpperCase()} · START{" "}
                      <span className="numeral">{fill.initial_sets}</span> SETS
                    </div>
                  </div>
                </div>
              ))}

            {activeDay.openSlots.flatMap((slot) =>
              Array.from({ length: slot.count }, (_, k) => (
                <div
                  key={`${activeDay.id}-${slot.muscle_group}-open-${k}`}
                  className="mt-2 flex w-full items-center gap-3 border-[1.5px] border-dashed border-ink/50 px-2.5 py-2.5"
                >
                  <div className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border-[1.5px] border-dashed border-ink/45 text-[9px] font-extrabold text-ink-muted">
                    {badge(slot.muscle_group)}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink/60">
                      {slot.muscle_group} — open slot
                    </div>
                    <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink/45">
                      OPEN SLOT · {slot.muscle_group.toUpperCase()}
                    </div>
                  </div>
                </div>
              )),
            )}

            {activeDay.fills.length === 0 && activeDay.openSlots.length === 0 && (
              <p className="text-sm text-ink/60">Nothing planned for this day.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
