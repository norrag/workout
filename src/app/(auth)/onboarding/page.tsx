"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: OnboardingState = { error: null };

const equipmentOptions = [
  { value: "free_weights", label: "Free weights" },
  { value: "machines", label: "Machines" },
  { value: "cables", label: "Cables" },
  { value: "bodyweight", label: "Bodyweight" },
] as const;

function RadioRow({
  name,
  options,
  defaultValue,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <label key={opt.value} className="flex-1">
          <input
            type="radio"
            name={name}
            value={opt.value}
            defaultChecked={opt.value === defaultValue}
            className="peer sr-only"
            required
          />
          <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-[6px] border border-border-subtle bg-bg-raised px-2 text-center text-sm text-text-secondary peer-checked:border-accent peer-checked:text-accent">
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="text-sm text-text-secondary">
        A few details to calibrate your starting prescriptions.
      </p>
      <Input label="Name" name="display_name" required maxLength={60} />
      <Input label="Age" name="age" type="number" min={13} max={120} required />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1.5 text-xs font-semibold text-text-secondary">
          Gender
        </legend>
        <RadioRow
          name="gender"
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
            { value: "other", label: "Other" },
            { value: "undisclosed", label: "Skip" },
          ]}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1.5 text-xs font-semibold text-text-secondary">
          Experience
        </legend>
        <RadioRow
          name="experience_level"
          options={[
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
          ]}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1.5 text-xs font-semibold text-text-secondary">
          Units
        </legend>
        <RadioRow
          name="units"
          options={[
            { value: "lb", label: "lb" },
            { value: "kg", label: "kg" },
          ]}
          defaultValue="lb"
        />
      </fieldset>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1.5 text-xs font-semibold text-text-secondary">
          Preferred equipment
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {equipmentOptions.map((opt) => (
            <label key={opt.value}>
              <input
                type="checkbox"
                name="preferred_equipment"
                value={opt.value}
                className="peer sr-only"
              />
              <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-[6px] border border-border-subtle bg-bg-raised px-2 text-sm text-text-secondary peer-checked:border-accent peer-checked:text-accent">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {state.error && <p className="text-sm text-warning">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving" : "Start training"}
      </Button>
    </form>
  );
}
