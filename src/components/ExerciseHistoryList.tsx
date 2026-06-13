import type { HistoryEntry } from "@/lib/queries/history";

function shortDate(iso: string): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/**
 * The 3.2 history content: sessions grouped by meso — current meso in full
 * ink, earlier mesos dimmed. Shared by the history sheet and the exercise
 * detail page.
 */
export function ExerciseHistoryList({ entries }: { entries: HistoryEntry[] }) {
  const groups: { meso: string; rows: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const last = groups.at(-1);
    if (last && last.meso === e.meso_name) last.rows.push(e);
    else groups.push({ meso: e.meso_name, rows: [e] });
  }

  if (groups.length === 0)
    return <p className="py-4 text-sm text-ink/45">Never logged.</p>;

  return (
    <>
      {groups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-6" : ""}>
          <div
            className={`border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em] ${gi > 0 ? "text-ink/55" : ""}`}
          >
            {group.meso.toUpperCase()}
          </div>
          {group.rows.map((row, ri) => (
            <div
              key={ri}
              className={`flex items-baseline justify-between border-b border-ink/15 py-3 ${gi > 0 ? "text-ink/55" : ""}`}
            >
              <div className="numeral text-base font-bold">
                {row.top_weight} lb{" "}
                <span className="text-[13px] font-normal text-ink/50">×</span>{" "}
                {row.reps}
                {row.is_deload && (
                  <span className="ml-1.5 border border-ink/40 px-[5px] py-[2px] align-[2px] text-[8.5px] font-bold tracking-[0.1em]">
                    DELOAD
                  </span>
                )}
              </div>
              <div className="text-right text-[10px] font-semibold tracking-[0.1em] text-ink/55">
                {row.coordinate} — {shortDate(row.performed_on)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
