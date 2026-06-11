"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { equipmentTypes } from "@/lib/engine/params";
import { createExerciseAction, type ExerciseFormState } from "./actions";

const initialState: ExerciseFormState = { error: null };

export function NewExerciseForm({
  muscleGroups,
}: {
  muscleGroups: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createExerciseAction,
    initialState,
  );

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        New custom exercise
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Name" name="name" placeholder="Belt squat" required />
      <SelectField label="Equipment" name="equipment_type" required>
        {equipmentTypes.map((eq) => (
          <option key={eq} value={eq}>
            {eq}
          </option>
        ))}
      </SelectField>
      <SelectField label="Primary muscle" name="primary_muscle_group_id" required>
        <option value="">Choose</option>
        {muscleGroups.map((mg) => (
          <option key={mg.id} value={mg.id}>
            {mg.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Secondary muscle" name="secondary_muscle_group_id">
        <option value="">None</option>
        {muscleGroups.map((mg) => (
          <option key={mg.id} value={mg.id}>
            {mg.name}
          </option>
        ))}
      </SelectField>
      <Input label="Notes" name="notes" placeholder="Setup cues" />
      {state.error && <p className="text-sm text-warning">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving" : "Save exercise"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SelectField({
  label,
  name,
  required,
  children,
}: {
  label: string;
  name: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="label-caps text-xs font-semibold text-text-secondary"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        required={required}
        className="min-h-11 rounded-[6px] border border-border-subtle bg-bg-raised px-3 text-base focus:border-accent focus:outline-none"
      >
        {children}
      </select>
    </div>
  );
}
