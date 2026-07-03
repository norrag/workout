"use client";

import { useState } from "react";
import { formatWeight } from "@/lib/units";
import type { StrengthProgress } from "@/lib/queries/stats";

// N9 — the macro Performance tab's primary statistic: est-strength gain per
// muscle group, each group expandable to the exercises that rolled into its
// number (role-weighted 1.0/0.5, same fold as the meso tab). Replaces the flat
// per-exercise list at macro scope — across a whole macro there are too many
// exercises for a flat list to read. An exercise linked to several groups
// appears under each (fractional credit is expected). No mockup exists for
// this section (rule-8 deviation carried from M8 — recorded in PROGRESS); the
// row/label grammar mirrors StrengthProgress.tsx.

function fmtPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function MuscleStrengthSection({
  strength,
  scopeLabel,
}: {
  strength: StrengthProgress;
  /** e.g. "THIS MACROCYCLE" — names the trend window */
  scopeLabel: string;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (group: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  return (
    <div className="mt-4 border-t-[1.5px] border-ink">
      <div className="pt-[9px] text-[9px] font-semibold tracking-[0.12em] text-ink/50">
        EST. STRENGTH {scopeLabel} — BY MUSCLE GROUP
      </div>
      {strength.muscles.map((m) => {
        const expanded = open.has(m.muscle_group);
        return (
          <div key={m.muscle_group} className="border-b border-ink/15">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggle(m.muscle_group)}
              className="flex w-full items-baseline justify-between gap-3 py-2.5 text-left active:bg-ink/5"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span aria-hidden className="text-[9px] text-ink/45">
                    {expanded ? "▾" : "▸"}
                  </span>
                  <span className="truncate text-sm font-bold tracking-[0.02em]">
                    {m.muscle_group.toUpperCase()}
                  </span>
                </div>
                <div className="mt-[3px] pl-[15px] text-[9px] font-semibold tracking-[0.12em] text-ink/55">
                  <span className="numeral">{m.lifts}</span>{" "}
                  {m.lifts === 1 ? "EXERCISE" : "EXERCISES"}
                </div>
              </div>
              <div className="numeral text-base font-extrabold">
                {m.score_pct != null ? fmtPct(m.score_pct) : "—"}
              </div>
            </button>
            {expanded && (
              <div className="mb-2.5 ml-[3px] border-l-2 border-ink/25 pl-3">
                {m.contributors.map((c) => (
                  <div
                    key={`${c.exercise_id}-${c.role}`}
                    className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-[7px] last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-bold">
                        {c.exercise_name}
                      </div>
                      <div className="mt-[2px] text-[8.5px] font-semibold tracking-[0.1em] text-ink/55">
                        <span className="numeral">
                          {formatWeight(Math.round(c.first_e1rm ?? 0))}
                        </span>{" "}
                        →{" "}
                        <span className="numeral">
                          {formatWeight(Math.round(c.last_e1rm ?? 0))}
                        </span>{" "}
                        LB E1RM · <span className="numeral">{c.sessions}</span>{" "}
                        SESSIONS
                        {c.role === "secondary" ? " · SECONDARY" : ""}
                      </div>
                    </div>
                    <div className="numeral text-sm font-extrabold">
                      {c.score_pct != null ? fmtPct(c.score_pct) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {strength.muscles.length === 0 && (
        <p className="py-3 text-sm text-ink/45">
          Not enough data yet — an exercise trends after 3 sessions.
        </p>
      )}
      {strength.muscles.length > 0 && (
        <p className="pt-2 text-[9px] leading-normal tracking-[0.04em] text-ink/45">
          ROLE-WEIGHTED MEAN (PRIMARY 1.0 · SECONDARY 0.5) · EXERCISES LOGGED
          3+ SESSIONS · FIRST → LAST NON-DELOAD SESSION · E1RM IS AN ESTIMATE
        </p>
      )}
    </div>
  );
}
