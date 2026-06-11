"use client";

import { useActionState } from "react";
import { createMacrocycleAction, type MacroFormState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: MacroFormState = { error: null };

export function NewMacrocycleForm() {
  const [state, formAction, pending] = useActionState(
    createMacrocycleAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Name" name="name" placeholder="Summer block" required />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1.5 text-xs font-semibold text-text-secondary">
          Goal
        </legend>
        <div className="flex gap-2">
          {(["gain", "cut", "maintain"] as const).map((goal) => (
            <label key={goal} className="flex-1">
              <input
                type="radio"
                name="goal_type"
                value={goal}
                className="peer sr-only"
                required
              />
              <span className="label-caps flex min-h-11 cursor-pointer items-center justify-center rounded-[6px] border border-border-subtle bg-bg-raised text-xs font-semibold text-text-secondary peer-checked:border-accent peer-checked:text-accent">
                {goal}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Input label="Start date" name="start_date" type="date" required />
      <Input label="Target end date" name="target_end_date" type="date" />
      {state.error && <p className="text-sm text-warning">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating" : "Create macrocycle"}
      </Button>
    </form>
  );
}
