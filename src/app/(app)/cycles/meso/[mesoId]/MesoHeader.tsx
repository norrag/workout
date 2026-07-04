"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchoredMenu, MenuRow } from "@/components/ui/AnchoredMenu";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ShareRow } from "@/components/ShareRow";
import {
  deleteMesoAction,
  duplicateMesoAction,
  placeMesoAction,
  saveMesoAsTemplateAction,
  updateMesoDetailsAction,
  type FormState,
  type MesoDetailsState,
} from "../../actions";

/** A macrocycle the place sheet can land this meso in, with the position the
 *  default placement would give it (computed server-side via the same pure
 *  `planMacroPlacement` the write uses). */
export interface PlaceTarget {
  id: string;
  name: string;
  goalType: string;
  /** M{n} the meso would become */
  position: number;
  /** true = fills an existing open slot; false = appends/grows the macro */
  consumesPlaceholder: boolean;
  blocks: number;
}

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
  backHref = "/cycles",
  backLabel = "‹ CYCLES",
  contextLabel,
  metaLine,
  rampLine,
  deloadLine,
  progressPct,
  calendar,
  hasFills,
  hasHistory,
  loggedSets,
  weeks,
  rirStart,
  rirEnd,
  includesDeload,
  placeTargets = null,
}: {
  mesoId: string;
  mesoName: string;
  status: string;
  /** N27: origin-aware back link — defaults to the cycles list */
  backHref?: string;
  backLabel?: string;
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
  weeks: number;
  rirStart: number;
  rirEnd: number;
  includesDeload: boolean;
  /** non-null ⇒ a standalone planned meso that may be placed into a macro */
  placeTargets?: PlaceTarget[] | null;
}) {
  const router = useRouter();
  const [calOpen, setCalOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [savingTemplate, startTemplate] = useTransition();
  const [duplicating, startDuplicate] = useTransition();
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

  const duplicate = () => {
    startDuplicate(async () => {
      const fd = new FormData();
      fd.set("meso_id", mesoId);
      // redirects to the duplicated meso on success, back here with
      // ?error=duplicate on failure
      await duplicateMesoAction(fd);
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
          href={backHref}
          className="text-[10px] font-medium tracking-[0.12em] text-ink/55"
        >
          {backLabel}
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
        {/* I12: name is editable until the meso completes; weeks/RIR/deload
            lock once it starts (the sheet greys them with a note) */}
        {status !== "completed" && status !== "abandoned" && (
          <MenuRow
            label="Edit details"
            disabled={savingTemplate || duplicating}
            onClick={() => {
              setMenuOpen(false);
              setDetailsOpen(true);
            }}
          />
        )}
        {/* I12: one-tap re-run — settings + board copied into a fresh planned
            meso (no loads; the engine reseeds on activation) */}
        <MenuRow
          label={duplicating ? "Duplicating…" : "Duplicate mesocycle"}
          disabled={savingTemplate || duplicating}
          onClick={duplicate}
        />
        {/* I12: a standalone planned meso can be placed into a macrocycle —
            fills the earliest open slot or appends as the next block */}
        {placeTargets != null && (
          <MenuRow
            label="Place into macrocycle"
            disabled={savingTemplate || duplicating}
            onClick={() => {
              setMenuOpen(false);
              setPlaceOpen(true);
            }}
          />
        )}
        {hasFills && (
          <MenuRow
            label={savingTemplate ? "Saving template…" : "Save as template"}
            disabled={savingTemplate || duplicating}
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

      {detailsOpen && (
        <EditDetailsSheet
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          mesoId={mesoId}
          mesoName={mesoName}
          status={status}
          weeks={weeks}
          rirStart={rirStart}
          rirEnd={rirEnd}
          includesDeload={includesDeload}
        />
      )}

      {placeTargets != null && placeOpen && (
        <PlaceSheet
          open={placeOpen}
          onClose={() => setPlaceOpen(false)}
          mesoId={mesoId}
          targets={placeTargets}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// I12 — edit the meso header in place. Name is free until completion; weeks /
// RIR ramp / deload lock once the meso starts (microcycles are materialized).
// Same control grammar as the planner's finalize sheet (fig 2.8).
// ---------------------------------------------------------------------------

const DETAILS_INITIAL: MesoDetailsState = { error: null };

function EditDetailsSheet({
  open,
  onClose,
  mesoId,
  mesoName,
  status,
  weeks: initialWeeks,
  rirStart: initialRirStart,
  rirEnd: initialRirEnd,
  includesDeload: initialDeload,
}: {
  open: boolean;
  onClose: () => void;
  mesoId: string;
  mesoName: string;
  status: string;
  weeks: number;
  rirStart: number;
  rirEnd: number;
  includesDeload: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateMesoDetailsAction,
    DETAILS_INITIAL,
  );
  const [weeks, setWeeks] = useState(initialWeeks);
  const [rirStart, setRirStart] = useState(initialRirStart);
  const [rirEnd, setRirEnd] = useState(initialRirEnd);
  const [deload, setDeload] = useState(initialDeload);
  // shape (length/ramp/deload) is editable only before the meso starts
  const shapeLocked = status !== "planned";

  useEffect(() => {
    if (state.saved) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const stepBtn =
    "numeral flex-1 py-[13px] text-center text-[15px] disabled:opacity-40";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Edit details"
      subtitle={shapeLocked ? "NAME ONLY — RAMP LOCKED ONCE STARTED" : "NAME · LENGTH · RIR RAMP"}
    >
      <form action={formAction}>
        <input type="hidden" name="meso_id" value={mesoId} />

        <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
          NAME
        </div>
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={mesoName}
          className="mt-2 h-12 w-full border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
        />

        {!shapeLocked && (
          <>
            <input type="hidden" name="weeks" value={weeks} />
            <input type="hidden" name="rir_start" value={rirStart} />
            <input type="hidden" name="rir_end" value={rirEnd} />
            <input type="hidden" name="includes_deload" value={String(deload)} />

            <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
              WEEKS{deload ? " — INCLUDING DELOAD" : ""}
            </div>
            <div className="mt-2 flex border-[1.5px] border-ink">
              {[3, 4, 5, 6, 7, 8].map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeeks(w)}
                  className={`${stepBtn} ${
                    weeks === w
                      ? "bg-ink font-bold text-bg-base"
                      : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
                START RIR
              </div>
              <div className="mt-2 flex border-[1.5px] border-ink">
                {[0, 1, 2, 3, 4, 5].map((r, i) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRirStart(r);
                      if (r < rirEnd) setRirEnd(r);
                    }}
                    className={`${stepBtn} ${
                      rirStart === r
                        ? "bg-ink font-bold text-bg-base"
                        : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
                END RIR
              </div>
              <div className="mt-2 flex border-[1.5px] border-ink">
                {[0, 1, 2, 3, 4, 5].map((r, i) => (
                  <button
                    key={r}
                    type="button"
                    disabled={r > rirStart}
                    onClick={() => setRirEnd(r)}
                    className={`${stepBtn} ${
                      rirEnd === r
                        ? "bg-ink font-bold text-bg-base"
                        : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDeload((v) => !v)}
              className="mt-5 flex w-full items-center gap-2.5 text-left"
            >
              <div
                className={`flex h-[18px] w-[18px] items-center justify-center border-[1.5px] border-ink text-[11px] font-bold ${
                  deload ? "bg-ink text-bg-base" : ""
                }`}
              >
                {deload ? "✓" : ""}
              </div>
              <span className="text-xs font-semibold">
                Final week is a deload
              </span>
            </button>
          </>
        )}

        {state.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
          >
            {pending ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// I12 — place a standalone planned meso into a macrocycle. One tap per macro:
// the meso fills the earliest open slot (inheriting its phase) or appends as
// the next block; the row states which so there's no surprise. Lands on the
// macro timeline.
// ---------------------------------------------------------------------------

function PlaceSheet({
  open,
  onClose,
  mesoId,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  mesoId: string;
  targets: PlaceTarget[];
}) {
  const [placing, startPlacing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);

  const place = (macroId: string) => {
    setPickedId(macroId);
    setError(null);
    startPlacing(async () => {
      // redirects to the macro timeline on success
      const result: FormState = await placeMesoAction({
        meso_id: mesoId,
        macro_id: macroId,
      });
      if (result?.error) {
        setError(result.error);
        setPickedId(null);
      }
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Place into macrocycle"
      subtitle="FILLS THE NEXT OPEN SLOT — LOADS RESEED ON START"
    >
      {targets.length === 0 ? (
        <div>
          <p className="text-sm leading-normal text-ink/70">
            No macrocycles yet. Create one and this mesocycle can slot into its
            plan.
          </p>
          <Link
            href="/cycles/new"
            className="mt-4 block border-[1.5px] border-dashed border-ink/45 py-[13px] text-center text-[11px] font-bold tracking-[0.1em] text-ink/70"
          >
            + NEW MACROCYCLE
          </Link>
        </div>
      ) : (
        <div className="border-t border-ink/15">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={placing}
              onClick={() => place(t.id)}
              className="flex w-full items-center justify-between border-b border-ink/15 py-[13px] text-left active:bg-ink/5 disabled:opacity-50"
            >
              <span className="min-w-0 pr-3">
                <span className="block truncate text-sm font-semibold">
                  {t.name}
                </span>
                <span className="label-caps mt-0.5 block text-[9.5px] font-medium tracking-[0.1em] text-ink/50">
                  {t.goalType} · {t.blocks} BLOCK{t.blocks === 1 ? "" : "S"}
                </span>
              </span>
              <span className="label-caps shrink-0 text-[9.5px] font-bold tracking-[0.1em] text-ink/70">
                {placing && pickedId === t.id
                  ? "PLACING…"
                  : t.consumesPlaceholder
                    ? `FILLS M${t.position}`
                    : `ADDS AS M${t.position}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
    </BottomSheet>
  );
}
