"use client";

import { useEffect, useRef, useState } from "react";
import { PencilGlyph } from "@/components/ui/PencilGlyph";
import { formatWeight } from "@/lib/units";
import { shortDateWithYear as shortDate } from "@/lib/dates";
import type { HistoryEntry } from "@/lib/queries/history";
import { getExerciseHistoryAction } from "@/app/(app)/log/actions";

/**
 * The 3.2 history content: sessions grouped by meso — current meso in full
 * ink, earlier mesos dimmed. Shared by the history sheet and the exercise
 * detail page. Rows with a session log note (09 §8) carry a note icon and
 * reveal the note when the icon is tapped.
 *
 * PH32: tapping a row flips every row between the default weight×reps view and
 * an estimated-1RM view (the engine's stored per-set e1RM, averaged across the
 * session's working sets — N2), with a quick fade. The flip is list-wide;
 * default on load is always sets/reps.
 *
 * T-I2 (#3): for a bodyweight exercise the flip shows the session-average
 * EFFECTIVE load (bodyweight ± entered) instead of e1RM — the load the engine
 * actually trains, surfaced the same minimal way the e1RM is for other lifts.
 *
 * N30: history is paged. `entries` is the first page; when `nextCursor` is
 * non-null a sentinel row at the bottom lazy-loads older pages (via
 * IntersectionObserver, with the row itself tappable as the fallback) until
 * the cursor comes back null — full history is always reachable.
 *
 * N15: the Performance drill-down opens this list scoped to a cycle's mesos
 * (`mesoIds`, threaded through the pager). Every entry point starts on
 * sets/reps — the PH32 default holds (owner reverted the drill-down's
 * e1RM-first opening, 2026-07-04).
 */
export function ExerciseHistoryList({
  entries,
  exerciseId,
  nextCursor = null,
  mesoIds,
}: {
  entries: HistoryEntry[];
  /** required for paging — without it the list renders `entries` only */
  exerciseId?: string;
  /** cursor for the next (older) page, from the first page's fetch */
  nextCursor?: string | null;
  /** N15: scope older-page fetches to these mesocycles */
  mesoIds?: string[];
}) {
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [older, setOlder] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // guards the observer against firing again while a page is in flight
  const busyRef = useRef(false);

  const all = older.length > 0 ? [...entries, ...older] : entries;

  const loadOlder = async () => {
    if (!exerciseId || !cursor || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const page = await getExerciseHistoryAction(exerciseId, cursor, mesoIds);
      setOlder((cur) => [...cur, ...page.entries]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor || failed) return;
    const observer = new IntersectionObserver(
      (obsEntries) => {
        if (obsEntries.some((e) => e.isIntersecting)) void loadOlder();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, failed]);

  // a bodyweight exercise carries a per-session effective load; the flip surfaces
  // that in place of e1RM for these lifts.
  const isBodyweight = all.some((e) => e.effective_load != null);
  const flipValue = isBodyweight
    ? (e: HistoryEntry) => e.effective_load
    : (e: HistoryEntry) => e.e1rm;
  const flipLabel = isBodyweight ? "EFF LOAD" : "E1RM";
  const groups: { meso: string; rows: HistoryEntry[] }[] = [];
  for (const e of all) {
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
                  aria-label={
                    isBodyweight
                      ? "Tap to toggle effective load"
                      : "Tap to toggle estimated 1RM"
                  }
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
                        {flipValue(row) != null ? formatWeight(flipValue(row)!) : "—"} lb{" "}
                        <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/45">
                          {flipLabel}
                          {row.avg_rir != null && (
                            <> · ~{row.avg_rir} RIR</>
                          )}
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
      {exerciseId && cursor && (
        <div ref={sentinelRef}>
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loading}
            className="w-full py-3.5 text-center text-[10px] font-bold tracking-[0.14em] text-ink/45"
          >
            {failed
              ? "COULDN’T LOAD OLDER — TAP TO RETRY"
              : loading
                ? "LOADING OLDER…"
                : "LOAD OLDER"}
          </button>
        </div>
      )}
    </>
  );
}
