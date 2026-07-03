"use client";

import { useActionState } from "react";
import { startMesoAction, type FormState } from "../../actions";

const initialState: FormState = { error: null };

/**
 * START MESOCYCLE. When the page already knows activation is gated (another
 * live block, or earlier siblings in the macro unfinished — I12), the button
 * renders disabled with the reason up front instead of failing on tap; the
 * server re-checks on submit regardless (the gate lives in `startMeso`).
 */
export function StartMesoForm({
  mesoId,
  blockReason = null,
}: {
  mesoId: string;
  blockReason?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    startMesoAction,
    initialState,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="meso_id" value={mesoId} />
      <button
        type="submit"
        disabled={pending || blockReason != null}
        className="w-full bg-ink py-[13px] text-center text-[11px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
      >
        {pending ? "GENERATING W1" : "START MESOCYCLE"}
      </button>
      {blockReason != null && !state.error && (
        <p className="mt-2 text-xs leading-normal text-ink/55">
          {blockReason}
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-xs text-accent">{state.error}</p>
      )}
    </form>
  );
}
