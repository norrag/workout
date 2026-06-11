"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { startMesocycleAction, type MesoFormState } from "../../actions";

const initialState: MesoFormState = { error: null };

export function StartMesoButton({ mesoId }: { mesoId: string }) {
  const [state, formAction, pending] = useActionState(
    startMesocycleAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="mesocycle_id" value={mesoId} />
      {state.error && <p className="text-sm text-warning">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Generating week 1" : "Start mesocycle"}
      </Button>
    </form>
  );
}
