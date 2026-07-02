import { formatWeight } from "@/lib/units";
import type { StrengthProgress } from "@/lib/queries/stats";

// I11 + PH37 — est-strength %-change per exercise and the muscle-group rollup.
// Shared by the meso Performance tab (P16) and the macro Performance tab (M8).
// No mockup exists for these sections (owner OK'd designing without one —
// rule-8 deviation recorded in PROGRESS); the row/label grammar mirrors the
// PRS THIS MESO list and the Balance bars.

function fmtPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export function StrengthProgressSection({
  strength,
  scopeLabel,
}: {
  strength: StrengthProgress;
  /** e.g. "THIS MESO" / "THIS MACROCYCLE" — names the trend window */
  scopeLabel: string;
}) {
  return (
    <>
      <div className="mt-4 border-t-[1.5px] border-ink">
        <div className="pt-[9px] text-[9px] font-semibold tracking-[0.12em] text-ink/50">
          EST. STRENGTH {scopeLabel} — ALL EXERCISES
        </div>
        {strength.exercises.map((s) => (
          <div
            key={s.exercise_id}
            className="flex items-baseline justify-between gap-3 border-b border-ink/15 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{s.exercise_name}</div>
              <div className="mt-[3px] text-[9px] font-semibold tracking-[0.12em] text-ink/55">
                <span className="numeral">
                  {formatWeight(Math.round(s.first_e1rm ?? 0))}
                </span>{" "}
                →{" "}
                <span className="numeral">
                  {formatWeight(Math.round(s.last_e1rm ?? 0))}
                </span>{" "}
                LB E1RM · <span className="numeral">{s.sessions}</span> SESSIONS
              </div>
            </div>
            <div className="numeral text-base font-extrabold">
              {s.score_pct != null ? fmtPct(s.score_pct) : "—"}
            </div>
          </div>
        ))}
        {strength.exercises.length === 0 && (
          <p className="py-3 text-sm text-ink/45">
            Not enough data yet — an exercise trends after 3 sessions.
          </p>
        )}
        {strength.exercises.length > 0 && (
          <p className="pt-2 text-[9px] leading-normal tracking-[0.04em] text-ink/45">
            EXERCISES LOGGED 3+ SESSIONS · FIRST → LAST NON-DELOAD SESSION ·
            E1RM IS AN ESTIMATE
          </p>
        )}
      </div>

      {strength.muscles.length > 0 && (
        <div className="mt-4 border-t-[1.5px] border-ink pt-2.5">
          <div className="mb-1.5 text-[9px] font-semibold tracking-[0.12em] text-ink/50">
            STRENGTH BY MUSCLE GROUP
          </div>
          <div className="grid grid-cols-2 gap-x-5">
            {strength.muscles.map((m) => (
              <div
                key={m.muscle_group}
                className="flex items-baseline justify-between border-b border-ink/15 py-[7px]"
              >
                <div className="text-[10.5px] font-bold tracking-[0.1em]">
                  {m.muscle_group.toUpperCase()}
                </div>
                <div className="numeral text-xs font-extrabold">
                  {m.score_pct != null ? fmtPct(m.score_pct) : "—"}
                </div>
              </div>
            ))}
          </div>
          <p className="pt-2 text-[9px] leading-normal tracking-[0.04em] text-ink/45">
            ROLE-WEIGHTED MEAN OF THE LIFTS ABOVE (PRIMARY 1.0 · SECONDARY 0.5)
          </p>
        </div>
      )}
    </>
  );
}
