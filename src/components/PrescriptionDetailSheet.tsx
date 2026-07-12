"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  prescriptionMatchesDecision,
  type PrescriptionAudit,
} from "@/lib/queries/audit";
import { getPrescriptionAuditAction } from "@/app/(app)/log/actions";
import { formatPrescription, formatWeight } from "@/lib/units";
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
  /** N44: the e1RM the prescribed weight × reps @ RIR implies (computed by the
   *  caller from active params; effective load for bodyweight movements) */
  prescribedE1rm: number | null;
  /** N44: the doc-16 target anchor A* that priced this row (`stepped` rows
   *  only); null = hold / pre-v20 / no decision */
  targetAnchor: number | null;
  /** N45: the measured recency anchor + the winning set it keyed on */
  measuredAnchor: number | null;
  anchorSource: {
    weight: number;
    reps: number;
    performed_at: string | null;
  } | null;
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

  // N33 S4 tripwire: the "re-verified, unchanged" inference is only valid while
  // the live numbers still ARE the decision's numbers. Every prescription write
  // now flows through the engine + records a decision, so a divergence here
  // means an out-of-band write (or a decision write that failed) — say so
  // instead of advertising a verification that never happened.
  const outOfBand =
    audit?.output != null &&
    !prescriptionMatchesDecision(
      {
        weight: target.prescribedWeight,
        reps: target.prescribedReps,
        sets: target.prescribedSets,
        targetRir: target.targetRir,
      },
      audit.output,
    );

  // the row stamp can be ahead of the decision version when a newer params version
  // was activated and re-verified the row WITHOUT changing the numbers (no new
  // decision is written then) — surface that as the audit signal it is.
  const reverified =
    !outOfBand &&
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

          {/* ink, not accent — orange is reserved for current position/selection (rule 7) */}
          {outOfBand && (
            <p className="mt-2 border-l-2 border-ink/40 pl-2.5 text-[11px] leading-[1.45] text-ink/70">
              Current numbers don&apos;t match this decision — they were set
              outside the engine. The rationale below describes the recorded
              decision, not the numbers shown above.
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

          {/* N44/N45: the e1RM ledger behind the numbers — what the sheet
              previously buried inside rationale strings. Estimates, per the
              honesty guardrails (doc 10 §9): labeled EST., one decimal. */}
          {(target.prescribedE1rm != null ||
            target.targetAnchor != null ||
            target.measuredAnchor != null) && (
            <div className="mt-4">
              <div className="text-[9.5px] font-semibold tracking-[0.16em] text-ink/50">
                EST. STRENGTH (e1RM)
              </div>
              <div className="mt-0.5">
                {target.prescribedE1rm != null && (
                  <FieldRow label="PRESCRIBED IMPLIES">
                    <span className="numeral">{target.prescribedE1rm} LB</span>
                  </FieldRow>
                )}
                {target.targetAnchor != null && (
                  <FieldRow label="TARGET ANCHOR A*">
                    <span className="numeral">{target.targetAnchor} LB</span>
                  </FieldRow>
                )}
                {target.measuredAnchor != null && (
                  <FieldRow label="MEASURED ANCHOR">
                    <span className="numeral">{target.measuredAnchor} LB</span>
                    {target.anchorSource && (
                      <span className="ml-1.5 text-[10px] text-ink/45">
                        ·{" "}
                        <span className="numeral">
                          {formatWeight(target.anchorSource.weight)} ×{" "}
                          {target.anchorSource.reps}
                        </span>
                        {target.anchorSource.performed_at
                          ? ` ON ${shortDate(target.anchorSource.performed_at).toUpperCase()}`
                          : ""}
                      </span>
                    )}
                  </FieldRow>
                )}
              </div>
            </div>
          )}

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

