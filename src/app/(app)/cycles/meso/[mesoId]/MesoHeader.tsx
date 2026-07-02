"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchoredMenu, MenuRow } from "@/components/ui/AnchoredMenu";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ShareRow } from "@/components/ShareRow";
import {
  deleteMesoAction,
  saveMesoAsTemplateAction,
} from "../../actions";

// P16 — the meso page header, styled after the day-view header (sticky, brand
// row, collapsible dropdown, progress bar): the calendar gets its own button
// (drops down the week × day matrix, days clickable), share gets its own
// button (opens the share sheet), and edit / save-as-template / delete live
// in the ⋮ menu — same grammar as the day view's WorkoutOptionsMenu.

export interface MesoCalendarCell {
  dayNumber: number;
  /** e.g. "MON" (weekday set) or "D2" */
  header: string;
  state: "done" | "next" | "current" | "planned" | "empty";
  href: string | null;
}

export interface MesoCalendarWeek {
  key: string;
  weekNumber: number;
  isDeload: boolean;
  targetRir: number;
  cells: MesoCalendarCell[];
  isCurrent: boolean;
  isComplete: boolean;
  isUnbuilt: boolean;
}

export function MesoHeader({
  mesoId,
  mesoName,
  status,
  contextLabel,
  metaLine,
  rampLine,
  deloadLine,
  progressPct,
  calendar,
  hasFills,
  hasHistory,
  loggedSets,
}: {
  mesoId: string;
  mesoName: string;
  status: string;
  /** top-right caps label — the macrocycle name, or STANDALONE */
  contextLabel: string;
  metaLine: string;
  rampLine: string;
  deloadLine: string | null;
  /** 0–100 completed-workout share of the whole planned grid */
  progressPct: number;
  calendar: MesoCalendarWeek[];
  hasFills: boolean;
  hasHistory: boolean;
  loggedSets: number;
}) {
  const router = useRouter();
  const [calOpen, setCalOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [savingTemplate, startTemplate] = useTransition();
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const iconBtn =
    "flex h-7 w-7 items-center justify-center border border-ink/35";

  const saveTemplate = () => {
    startTemplate(async () => {
      const fd = new FormData();
      fd.set("meso_id", mesoId);
      // redirects to the new template on success, back here with
      // ?error=template on failure (the page renders the error line)
      await saveMesoAsTemplateAction(fd);
      setMenuOpen(false);
    });
  };

  const gridCols = (n: number) => ({
    gridTemplateColumns: `44px 52px repeat(${Math.max(n, 1)}, 1fr)`,
  });
  const nDays = calendar[0]?.cells.length ?? 1;

  return (
    <div className="sticky top-0 z-20 -mx-4 bg-bg-base px-4 pb-3 pt-2 shadow-[0_8px_16px_-12px_rgba(23,20,15,0.55)]">
      {/* brand row — back link + cycle context (day-view header grammar) */}
      <div className="flex items-center justify-between">
        <Link
          href="/cycles"
          className="text-[10px] font-medium tracking-[0.12em] text-ink/55"
        >
          ‹ CYCLES
        </Link>
        <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink/55">
          {contextLabel.toUpperCase()}
        </div>
      </div>

      {/* title + header actions */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <h1 className="min-w-0 truncate text-[27px] font-extrabold leading-none tracking-[-0.02em]">
          {mesoName}
        </h1>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label="calendar"
            aria-expanded={calOpen}
            onClick={() => {
              setAnimate(true);
              setCalOpen((v) => !v);
            }}
            className={`${iconBtn} ${calOpen ? "border-ink bg-ink text-bg-base" : ""}`}
          >
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect
                x="1.5"
                y="2.5"
                width="11"
                height="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M1.5 5.5h11M4.5 1v3M9.5 1v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
          </button>
          {hasFills && (
            <button
              type="button"
              aria-label="share mesocycle"
              onClick={() => setShareOpen(true)}
              className={iconBtn}
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M2.5 7v5h9V7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 8.5V1.5M4.5 3.5 7 1l2.5 2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            ref={menuBtnRef}
            aria-label="mesocycle options"
            onClick={() => setMenuOpen(true)}
            className={`${iconBtn} text-[15px] leading-none ${menuOpen ? "border-ink bg-ink text-bg-base" : ""}`}
          >
            ⋮
          </button>
        </div>
      </div>

      {/* meta + status */}
      <div className="mt-2 flex items-center justify-between pb-3">
        <div className="text-[10.5px] font-medium tracking-[0.1em] text-ink/55">
          {metaLine}
        </div>
        {status === "active" ? (
          <div className="border-[1.5px] border-accent px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-accent">
            CURRENT
          </div>
        ) : (
          <div className="border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            {status.toUpperCase()}
          </div>
        )}
      </div>

      {/* collapsible calendar — the week × day matrix (was the page body) */}
      <div
        className={`grid ${animate ? "transition-all duration-300" : ""}`}
        style={{
          gridTemplateRows: calOpen ? "1fr" : "0fr",
          opacity: calOpen ? 1 : 0,
          marginBottom: calOpen ? 12 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="border-[1.5px] border-ink px-2.5 pb-2 pt-0.5">
            <div
              className="grid items-center gap-1.5 pb-[5px] pt-[9px] text-[9px] font-semibold tracking-[0.12em] text-ink/50"
              style={gridCols(nDays)}
            >
              <div>WK</div>
              <div>RIR</div>
              {(calendar[0]?.cells ?? []).map((c) => (
                <div key={c.dayNumber} className="text-center">
                  {c.header}
                </div>
              ))}
            </div>
            {calendar.map((week) => (
              <div
                key={week.key}
                className="grid items-center gap-1.5 border-t border-ink/15 py-1.5"
                style={gridCols(nDays)}
              >
                <div
                  className={`text-[15px] font-bold ${week.isComplete || week.isCurrent ? "" : "text-ink/50"} ${week.isDeload ? "text-[13px] tracking-[0.06em]" : ""}`}
                >
                  {week.isDeload ? "DL" : week.weekNumber}
                </div>
                <div
                  className={`numeral text-xs ${
                    week.isCurrent
                      ? "font-bold text-accent"
                      : week.isComplete
                        ? "font-semibold text-ink/60"
                        : "font-semibold text-ink/45"
                  }`}
                >
                  {week.targetRir}
                </div>
                {week.cells.map((cell) => {
                  const base =
                    cell.state === "done"
                      ? "flex h-[38px] items-center justify-center bg-ink text-xs text-bg-base"
                      : cell.state === "next"
                        ? "flex h-[38px] items-center justify-center border-2 border-accent text-[9.5px] font-bold tracking-[0.06em] text-accent"
                        : cell.state === "current"
                          ? "flex h-[38px] items-center justify-center border border-ink/35 text-[9.5px] font-medium text-ink/50"
                          : `flex h-[38px] items-center justify-center text-[9px] font-medium tracking-[0.06em] text-ink/40 ${
                              week.isDeload || week.isUnbuilt
                                ? "border border-dashed border-ink/35"
                                : "border border-ink/[0.22]"
                            }`;
                  const label = cell.state === "done" ? "✓" : `D${cell.dayNumber}`;
                  return cell.href ? (
                    <Link key={cell.dayNumber} href={cell.href} className={base}>
                      {label}
                    </Link>
                  ) : (
                    <div key={cell.dayNumber} className={base} />
                  );
                })}
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t-[1.5px] border-ink pt-2 text-[9.5px] font-medium tracking-[0.1em] text-ink/50">
              <span>{rampLine}</span>
              {deloadLine && <span>{deloadLine}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* meso progress — completed workouts over the planned grid */}
      <div className="relative h-[3px] bg-ink">
        <div
          className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <AnchoredMenu
        open={menuOpen}
        triggerRef={menuBtnRef}
        label="mesocycle options"
        onClose={() => setMenuOpen(false)}
      >
        <div className="border-b border-ink/15 px-4 pb-1.5 pt-2.5 text-[9px] font-bold tracking-[0.14em] text-ink/45">
          MESOCYCLE
        </div>
        {/* Once any set is logged the plan is locked here — edits are made
            from the workout page so the engine and history stay consistent. */}
        <MenuRow
          label={status === "planned" ? "Edit plan" : "Edit weeks"}
          disabled={hasHistory || savingTemplate}
          trailing={hasHistory ? "LOCKED" : undefined}
          onClick={() => {
            setMenuOpen(false);
            router.push(`/cycles/meso/${mesoId}/plan`);
          }}
        />
        {hasFills && (
          <MenuRow
            label={savingTemplate ? "Saving template…" : "Save as template"}
            disabled={savingTemplate}
            onClick={saveTemplate}
          />
        )}
        <MenuRow
          label="Delete mesocycle"
          destructive
          disabled={savingTemplate}
          onClick={() => {
            setMenuOpen(false);
            setAck(false);
            setDeleteOpen(true);
          }}
        />
      </AnchoredMenu>

      <BottomSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share mesocycle"
        subtitle={mesoName.toUpperCase()}
      >
        <p className="text-[13px] leading-relaxed text-ink/70">
          Mint a one-time code — whoever redeems it gets their own copy of this
          plan.
        </p>
        <ShareRow objectType="mesocycle" objectId={mesoId} />
      </BottomSheet>

      <BottomSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete mesocycle"
        subtitle={mesoName.toUpperCase()}
      >
        {hasHistory ? (
          <p className="text-[13px] leading-relaxed text-ink">
            This permanently deletes <strong>{mesoName}</strong> and all of its
            logged history — <span className="numeral">{loggedSets}</span> logged{" "}
            {loggedSets === 1 ? "set" : "sets"}, every workout, and the week
            structure. This can&apos;t be undone.
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink">
            This permanently deletes <strong>{mesoName}</strong> and its planned
            structure. This can&apos;t be undone.
          </p>
        )}

        {hasHistory && (
          <button
            type="button"
            onClick={() => setAck((v) => !v)}
            className="mt-4 flex items-center gap-2"
          >
            <div
              className={`flex h-[18px] w-[18px] items-center justify-center text-[11px] ${
                ack ? "bg-accent text-bg-base" : "border-[1.5px] border-ink/40"
              }`}
            >
              {ack ? "✓" : ""}
            </div>
            <span className="text-xs font-semibold">
              I understand this erases logged history
            </span>
          </button>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <form action={deleteMesoAction}>
            <input type="hidden" name="meso_id" value={mesoId} />
            <SubmitButton
              disabled={hasHistory && !ack}
              pendingLabel="DELETING…"
              className="bg-accent px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
            >
              DELETE
            </SubmitButton>
          </form>
        </div>
      </BottomSheet>
    </div>
  );
}
