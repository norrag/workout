"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { Input } from "@/components/ui/Input";
import { equipmentTypes } from "@/lib/engine/params";
import { createExerciseAction, type ExerciseFormState } from "./actions";

const initialState: ExerciseFormState = { error: null };
const NONE = "none";

export function NewExerciseForm({
  muscleGroups,
}: {
  muscleGroups: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string>(NONE);
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

  const nameById = new Map(muscleGroups.map((mg) => [mg.id, mg.name]));
  const ready = equipment !== null && primary !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="equipment_type" value={equipment ?? ""} />
      <input
        type="hidden"
        name="primary_muscle_group_id"
        value={primary ?? ""}
      />
      <input
        type="hidden"
        name="secondary_muscle_group_id"
        value={secondary === NONE ? "" : secondary}
      />

      <Input label="Name" name="name" placeholder="Belt squat" required />

      <Field label="Equipment">
        <ChoiceChips
          label="Equipment"
          options={equipmentTypes}
          value={equipment}
          onChange={setEquipment}
        />
      </Field>

      <Field label="Primary muscle">
        <ChoiceChips
          label="Primary muscle"
          options={muscleGroups.map((mg) => mg.id)}
          value={primary}
          onChange={setPrimary}
          render={(id) => nameById.get(id) ?? id}
        />
      </Field>

      <Field label="Secondary muscle">
        <ChoiceChips
          label="Secondary muscle"
          options={[NONE, ...muscleGroups.map((mg) => mg.id)]}
          value={secondary}
          onChange={setSecondary}
          render={(id) => (id === NONE ? "none" : (nameById.get(id) ?? id))}
        />
      </Field>

      <Input label="Notes" name="notes" placeholder="Setup cues" />
      {state.error && <p className="text-sm text-warning">{state.error}</p>}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !ready}
          className="flex-1"
        >
          {pending ? "Saving" : "Save exercise"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps text-xs font-semibold text-text-secondary">
        {label}
      </span>
      {children}
    </div>
  );
}
