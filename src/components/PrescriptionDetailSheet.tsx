"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { PrescriptionAudit } from "@/lib/queries/audit";
import { getPrescriptionAuditAction } from "@/app/(app)/log/actions";
import { formatPrescription } from "@/lib/units";
import { shortDate } from "@/lib/dates";

export interface PrescriptionDetailTarget {
  workoutExerciseId: string;
  exerciseName: string;
  equipmentType: string;
  /** the row's legible "verified accurate as of Vx" stamp (workout_exercises.params_version) */
  paramsVersion: number | null;
  /** the live prescribed numbers, shown for verification */
  prescribedWeight: number | null;
  prescribedReps: number | null;
  prescribedSets: number | null;
  targetRir: number | null;
}

/** A version number as a tracked label, or an em dash when unknown. Pure. */
export function versionLabel(version: number | null): string {
  return version == null ? "—" : `V${version}`;
}

const KIND_LABEL: Record<PrescriptionAudit["kind"], string> = {
  seed: "SEED",
  advance: "ADVANCE",
};

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-2">
      <span className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
        {label}
      </span>
      <span className="text-right text-[12px] font-medium text-ink/80">{children}</span>
    </div>
  );
}

/**
 * Prescription detail / audit reveal (owner request 2026-06-25) — opened from the
 * exercise dropdown in the day view. Shows the live prescribed weight × reps × sets
 * @ RIR (for verification), the decision kind, the legible version stamps
 * (verified-accurate-as-of vs last-computed-under), and the engine rationale + trace,
 * so the user can confirm a version bump verified the row. Fetches the latest
 * decision on open (mirrors HistorySheet). No mockup figure — light-ledger styling
 * per rule #8; deviation recorded in PROGRESS.md.
 */
export function PrescriptionDetailSheet({
  target,
  onClose,
}: {
  target: PrescriptionDetailTarget | null;
  onClose: () => void;
}) {
  const [audit, setAudit] = useState<PrescriptionAudit | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!target) {
      setAudit(null);
      setLoaded(false);
      return;
    }
    let active = true;
    setLoaded(false);
    getPrescriptionAuditAction(target.workoutExerciseId)
      .then((a) => {
        if (active) {
          setAudit(a);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [target]);

  if (!target) return null;

  // the row stamp can be ahead of the decision version when a newer params version
  // was activated and re-verified the row WITHOUT changing the numbers (no new
  // decision is written then) — surface that as the audit signal it is.
  const reverified =
    target.paramsVersion != null &&
    audit != null &&
    target.paramsVersion > audit.decisionVersion;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Prescription detail"
      subtitle={`${target.exerciseName.toUpperCase()} — ${target.equipmentType.toUpperCase()}`}
    >
      {!loaded ? (
        <p className="py-4 text-sm text-ink/45">Loading…</p>
      ) : (
        <div className="pb-2">
          <FieldRow label="DECISION KIND">
            {audit ? KIND_LABEL[audit.kind] : "—"}
          </FieldRow>
          <FieldRow label="VERIFIED AS OF">
            <span className="numeral">{versionLabel(target.paramsVersion)}</span>
          </FieldRow>
          <FieldRow label="COMPUTED UNDER">
            <span className="numeral">
              {versionLabel(audit?.decisionVersion ?? null)}
            </span>
            {audit && (
              <span className="ml-1.5 text-[10px] text-ink/45">
                · {shortDate(audit.decidedAt)}
              </span>
            )}
          </FieldRow>

          {reverified && (
            <p className="mt-2 text-[11px] leading-[1.45] text-ink/55">
              Re-verified under{" "}
              <span className="numeral">{versionLabel(target.paramsVersion)}</span> —
              numbers unchanged since{" "}
              <span className="numeral">{versionLabel(audit!.decisionVersion)}</span>.
            </p>
          )}

          <div className="mt-4">
            <div className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
              PRESCRIPTION
            </div>
            <p className="numeral mt-1.5 text-[14px] font-bold leading-[1.4] tracking-[-0.01em] text-ink">
              {formatPrescription(
                target.prescribedWeight,
                target.prescribedReps,
                target.prescribedSets,
                target.targetRir,
              )}
            </p>
            {audit?.rationale && (
              <p className="mt-1.5 text-[12px] leading-[1.5] text-ink/70">
                {audit.rationale}
              </p>
            )}
          </div>

          {audit && audit.trace.length > 0 && (
            <div className="mt-4">
              <div className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
                TRACE
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {audit.trace.map((step, i) => (
                  <li
                    key={`${step.rule}-${i}`}
                    className="border-l-2 border-ink/25 pl-2.5 text-[11.5px] leading-[1.45] text-ink/70"
                  >
                    <span className="font-semibold tracking-[0.08em] text-ink/55">
                      {step.rule.toUpperCase()}
                    </span>
                    {step.detail ? ` — ${step.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!audit && (
            <p className="mt-3 text-[11.5px] leading-[1.5] text-ink/55">
              No recorded engine decision for this prescription yet. It will be
              stamped on the next reconcile.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

