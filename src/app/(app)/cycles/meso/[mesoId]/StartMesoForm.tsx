"use client";

import { useActionState } from "react";
import { startMesoAction, type FormState } from "../../actions";

const initialState: FormState = { error: null };

export function StartMesoForm({ mesoId }: { mesoId: string }) {
  const [state, formAction, pending] = useActionState(
    startMesoAction,
    initialState,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="meso_id" value={mesoId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-ink py-[13px] text-center text-[11px] font-bold tracking-[0.1em] text-bg-base disabled:opacity-40"
      >
        {pending ? "GENERATING W1" : "START MESOCYCLE"}
      </button>
      {state.error && (
        <p className="mt-2 text-xs text-accent">{state.error}</p>
      )}
    </form>
  );
}
