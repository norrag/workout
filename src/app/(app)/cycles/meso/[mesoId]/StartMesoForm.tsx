"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { startMesoAction, type FormState } from "../../actions";

const initialState: FormState = { error: null };

export function StartMesoForm({ mesoId }: { mesoId: string }) {
  const [state, formAction, pending] = useActionState(
    startMesoAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="meso_id" value={mesoId} />
      {state.error && <p className="text-sm text-accent">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Generating week 1" : "Start mesocycle"}
      </Button>
    </form>
  );
}
