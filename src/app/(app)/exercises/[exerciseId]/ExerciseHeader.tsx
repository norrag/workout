"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AnchoredMenu, MenuRow } from "@/components/ui/AnchoredMenu";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ShareRow } from "@/components/ShareRow";
import type { ExerciseDeletionImpact } from "@/lib/queries/exercises";
import {
  deleteCustomExerciseAction,
  type FormState,
} from "@/app/(app)/exercises/actions";
import { LoadStepSheet } from "./LoadStepSheet";

/**
 * N22 — the exercise page header, styled after the meso header (P16 grammar):
 * sticky brand row (back link honors the N4 `?from=` origin), title + CUSTOM
 * badge, and a [share][⋮] icon cluster on the shared AnchoredMenu. The ⋮ menu
 * surfaces what used to hide behind a faint `⋯` or at the bottom of the
 * OVERVIEW tab: the Load-step sheet (I13 — shown disabled on bodyweight-only
 * lifts rather than vanishing, so the setting is discoverable), sharing
 * (owned custom exercises), and delete (owned custom, same guards as the MCP
 * tool: never with logged sets or plan references).
 */
export function ExerciseHeader({
  exerciseId,
  name,
  metaLine,
  backHref,
  backLabel,
  isCustom,
  isOwned,
  loadStep,
  deletionImpact,
}: {
  exerciseId: string;
  name: string;
  metaLine: string;
  backHref: string;
  backLabel: string;
  isCustom: boolean;
  /** the signed-in user owns this custom exercise (share/delete available) */
  isOwned: boolean;
  loadStep: {
    /** false on bodyweight-only lifts — the engine never adds load (PH36) */
    enabled: boolean;
    defaultStep: number;
    override: number | null;
  };
  /** non-null only for owned custom exercises */
  deletionImpact: ExerciseDeletionImpact | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const iconBtn =
    "flex h-7 w-7 items-center justify-center border border-ink/35";

  return (
    <div className="sticky top-0 z-20 -mx-4 bg-bg-base px-4 pb-3 pt-2 shadow-[0_8px_16px_-12px_rgba(23,20,15,0.55)]">
      {/* brand row — back link + context (day-view header grammar) */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="text-[10px] font-medium tracking-[0.12em] text-ink/55"
        >
          {backLabel}
        </Link>
        <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink/55">
          LIBRARY
        </div>
      </div>

      {/* title + header actions */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <h1 className="min-w-0 text-[28px] font-extrabold leading-none tracking-[-0.02em]">
          {name}
        </h1>
        <div className="flex shrink-0 gap-2">
          {isOwned && (
            <button
              type="button"
              aria-label="share exercise"
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
            aria-label="exercise options"
            onClick={() => setMenuOpen(true)}
            className={`${iconBtn} text-[15px] leading-none ${menuOpen ? "border-ink bg-ink text-bg-base" : ""}`}
          >
            ⋮
          </button>
        </div>
      </div>

      {/* meta + badge */}
      <div className="mt-2 flex items-center justify-between">
        <div className="text-[10.5px] font-medium tracking-[0.12em] text-ink/55">
          {metaLine}
        </div>
        {isCustom && (
          <div className="shrink-0 border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink/55">
            CUSTOM
          </div>
        )}
      </div>

      <AnchoredMenu
        open={menuOpen}
        triggerRef={menuBtnRef}
        label="exercise options"
        onClose={() => setMenuOpen(false)}
      >
        <div className="border-b border-ink/15 px-4 pb-1.5 pt-2.5 text-[9px] font-bold tracking-[0.14em] text-ink/45">
          EXERCISE
        </div>
        {/* I13 load step — disabled (not hidden) on bodyweight-only lifts so
            the setting stays discoverable; the engine progresses those on reps */}
        <MenuRow
          label="Load step"
          disabled={!loadStep.enabled}
          trailing={
            loadStep.enabled
              ? loadStep.override != null
                ? `+${fmtStep(loadStep.override)} LB`
                : "DEFAULT"
              : "BODYWEIGHT"
          }
          onClick={() => {
            setMenuOpen(false);
            setStepOpen(true);
          }}
        />
        {isOwned && (
          <MenuRow
            label="Share exercise"
            onClick={() => {
              setMenuOpen(false);
              setShareOpen(true);
            }}
          />
        )}
        {isOwned && (
          <MenuRow
            label="Delete exercise"
            destructive
            onClick={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          />
        )}
      </AnchoredMenu>

      <BottomSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share exercise"
        subtitle={name.toUpperCase()}
      >
        <p className="text-[13px] leading-relaxed text-ink/70">
          Mint a one-time code — whoever redeems it gets their own copy of this
          exercise.
        </p>
        <ShareRow objectType="exercise" objectId={exerciseId} />
      </BottomSheet>

      {loadStep.enabled && (
        <LoadStepSheet
          open={stepOpen}
          onClose={() => setStepOpen(false)}
          exerciseId={exerciseId}
          defaultStep={loadStep.defaultStep}
          override={loadStep.override}
        />
      )}

      {deletionImpact && deleteOpen && (
        <DeleteExerciseSheet
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          exerciseId={exerciseId}
          name={name}
          impact={deletionImpact}
        />
      )}
    </div>
  );
}

function fmtStep(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

// ---------------------------------------------------------------------------
// Delete confirm sheet — same guards as the MCP delete_custom_exercise tool:
// logged history is never destroyed (hard rule #5), and a movement still in a
// plan or generated workout is refused with the reason instead of a DB error.
// Deletable exercises get a plain confirm; blocked ones explain themselves.
// ---------------------------------------------------------------------------

const DELETE_INITIAL: FormState = { error: null };

function DeleteExerciseSheet({
  open,
  onClose,
  exerciseId,
  name,
  impact,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  name: string;
  impact: ExerciseDeletionImpact;
}) {
  const [state, formAction, pending] = useActionState(
    deleteCustomExerciseAction,
    DELETE_INITIAL,
  );

  const blockers = [
    impact.loggedSets > 0
      ? `${impact.loggedSets} logged ${impact.loggedSets === 1 ? "set" : "sets"} reference it — logged history is never destroyed`
      : null,
    impact.plannedRefs > 0
      ? `${impact.plannedRefs} planned slot${impact.plannedRefs === 1 ? "" : "s"} still use it`
      : null,
    impact.workoutRefs > 0
      ? `${impact.workoutRefs} generated workout${impact.workoutRefs === 1 ? "" : "s"} still use it`
      : null,
  ].filter(Boolean) as string[];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Delete exercise"
      subtitle={name.toUpperCase()}
    >
      {impact.deletable ? (
        <p className="text-[13px] leading-relaxed text-ink">
          This permanently deletes <strong>{name}</strong> from your library.
          It has no logged history and isn&apos;t in any plan. This can&apos;t
          be undone.
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink">
            <strong>{name}</strong> can&apos;t be deleted:
          </p>
          <ul className="mt-2.5 space-y-1.5 text-[12.5px] leading-normal text-ink/75">
            {blockers.map((b) => (
              <li key={b} className="border-l-2 border-ink/30 pl-2.5">
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-normal text-ink/60">
            To stop it being recommended without deleting it, exclude it from
            planning instead.
          </p>
        </>
      )}

      {state.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}

      <div className="mt-5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          {impact.deletable ? "Cancel" : "Close"}
        </button>
        {impact.deletable && (
          <form action={formAction}>
            <input type="hidden" name="exercise_id" value={exerciseId} />
            <button
              type="submit"
              disabled={pending}
              className="bg-accent px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
            >
              {pending ? "DELETING…" : "DELETE"}
            </button>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}
