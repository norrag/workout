"use client";

import { useState } from "react";
import { PencilGlyph } from "@/components/ui/PencilGlyph";
import { formatWeight } from "@/lib/units";
import type { HistoryEntry } from "@/lib/queries/history";

function shortDate(iso: string): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getDate()} ${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/**
 * The 3.2 history content: sessions grouped by meso — current meso in full
 * ink, earlier mesos dimmed. Shared by the history sheet and the exercise
 * detail page. Rows with a session log note (09 §8) carry a note icon and
 * reveal the note when tapped.
 */
export function ExerciseHistoryList({ entries }: { entries: HistoryEntry[] }) {
  const [openNote, setOpenNote] = useState<string | null>(null);
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
          {group.rows.map((row, ri) => {
            const rowKey = `${gi}-${ri}`;
            const hasNote = !!row.session_note;
            const noteOpen = openNote === rowKey;
            return (
              <div
                key={ri}
                className={`border-b border-ink/15 ${gi > 0 ? "text-ink/55" : ""}`}
              >
                <button
                  type="button"
                  disabled={!hasNote}
                  onClick={() => setOpenNote(noteOpen ? null : rowKey)}
                  className="flex w-full items-baseline justify-between py-3 text-left disabled:cursor-default"
                >
                  <div className="numeral text-base font-bold">
                    {row.top_weight != null ? formatWeight(row.top_weight) : "—"}{" "}
                    {row.unit}{" "}
                    <span className="text-[13px] font-normal text-ink/50">×</span>{" "}
                    {row.reps}
                    {row.is_deload && (
                      <span className="ml-1.5 border border-ink/40 px-[5px] py-[2px] align-[2px] text-[8.5px] font-bold tracking-[0.1em]">
                        DELOAD
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 text-right text-[10px] font-semibold tracking-[0.1em] text-ink/55">
                    {hasNote && (
                      <span
                        aria-label="has a session note"
                        className={`self-center ${noteOpen ? "text-accent" : "text-ink/45"}`}
                      >
                        <PencilGlyph size={15} />
                      </span>
                    )}
                    <span>
                      {row.coordinate} — {shortDate(row.performed_on)}
                    </span>
                  </div>
                </button>
                {hasNote && noteOpen && (
                  <div className="border-l-2 border-ink/30 pb-3 pl-2.5 text-[11px] leading-[1.5] text-ink/65">
                    {row.session_note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
