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
 * reveal the note when the icon is tapped.
 *
 * PH32: tapping a row flips every row between the default weight×reps view and
 * an estimated-1RM view (the engine's stored per-set e1RM, session best), with
 * a quick fade. The flip is list-wide; default on load is always sets/reps.
 */
export function ExerciseHistoryList({ entries }: { entries: HistoryEntry[] }) {
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
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
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={flipped}
                  aria-label="Tap to toggle estimated 1RM"
                  onClick={() => setFlipped((f) => !f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setFlipped((f) => !f);
                    }
                  }}
                  className="flex w-full cursor-pointer items-baseline justify-between py-3 text-left"
                >
                  <div key={flipped ? "e" : "w"} className="metric-fade numeral text-base font-bold">
                    {flipped ? (
                      <>
                        {row.e1rm != null ? formatWeight(row.e1rm) : "—"} lb{" "}
                        <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/45">
                          E1RM
                        </span>
                      </>
                    ) : (
                      <>
                        {row.top_weight != null ? formatWeight(row.top_weight) : "—"}{" "}
                        lb{" "}
                        <span className="text-[13px] font-normal text-ink/50">×</span>{" "}
                        {row.reps}
                      </>
                    )}
                    {row.is_deload && (
                      <span className="ml-1.5 border border-ink/40 px-[5px] py-[2px] align-[2px] text-[8.5px] font-bold tracking-[0.1em]">
                        DELOAD
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 text-right text-[10px] font-semibold tracking-[0.1em] text-ink/55">
                    {hasNote && (
                      <button
                        type="button"
                        aria-label={noteOpen ? "hide session note" : "show session note"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenNote(noteOpen ? null : rowKey);
                        }}
                        className={`self-center ${noteOpen ? "text-accent" : "text-ink/45"}`}
                      >
                        <PencilGlyph size={15} />
                      </button>
                    )}
                    <span>
                      {row.coordinate} — {shortDate(row.performed_on)}
                    </span>
                  </div>
                </div>
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
