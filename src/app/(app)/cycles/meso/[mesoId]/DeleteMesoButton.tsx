"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteMesoAction } from "../../actions";

/**
 * Delete a mesocycle (fig 2.2 footer). Confirms in a sheet; when the meso has
 * logged history the warning is stronger and an acknowledgement is required.
 */
export function DeleteMesoButton({
  mesoId,
  mesoName,
  loggedSets,
  hasHistory,
}: {
  mesoId: string;
  mesoName: string;
  loggedSets: number;
  hasHistory: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAck(false);
          setOpen(true);
        }}
        className="mt-2.5 w-full border border-accent/50 py-3 text-center text-[11px] font-semibold tracking-[0.1em] text-accent"
      >
        DELETE MESOCYCLE
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
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
            onClick={() => setOpen(false)}
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
    </>
  );
}
