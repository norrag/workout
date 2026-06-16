"use client";

import { useActionState, useRef, useState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const initialState: OnboardingState = { error: null };

// canonical equipment vocabulary (exercises.equipment_type, fig 4.5)
const EQUIPMENT = [
  { value: "barbell", label: "BARBELL" },
  { value: "dumbbell", label: "DUMBBELL" },
  { value: "machine", label: "MACHINE" },
  { value: "cable", label: "CABLE" },
  { value: "smith", label: "SMITH" },
  { value: "bodyweight", label: "BODYWEIGHT" },
  { value: "bands", label: "BANDS" },
  { value: "kettlebell", label: "KETTLEBELL" },
] as const;

const STEPS = ["ABOUT YOU", "EXPERIENCE", "EQUIPMENT", "UNITS"] as const;

/**
 * Onboarding as the 08 §4 sequence: name/age/height/bodyweight →
 * experience level → equipment access → units. One form, four panels;
 * everything submits together at the end.
 */
export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState,
  );
  const [step, setStep] = useState(0);
  const [experience, setExperience] = useState<
    "beginner" | "intermediate" | "advanced"
  >("beginner");
  const [gender, setGender] = useState<
    "female" | "male" | "other" | "undisclosed"
  >("undisclosed");
  const [equipment, setEquipment] = useState<string[]>([
    "barbell",
    "dumbbell",
    "machine",
    "cable",
  ]);
  const [units, setUnits] = useState<"lb" | "kg">("lb");
  const formRef = useRef<HTMLFormElement>(null);

  const next = () => {
    if (step === 0 && !formRef.current?.reportValidity()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const toggleEquipment = (value: string) =>
    setEquipment((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <span className="label-caps text-[10px] font-bold tracking-[0.14em]">
          {STEPS[step]}
        </span>
        <span className="numeral text-[10px] font-semibold text-ink/45">
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 ${i < step ? "bg-ink" : i === step ? "bg-accent" : "bg-ink/15"}`}
          />
        ))}
      </div>

      {/* hidden carriers so all panels submit regardless of which is shown */}
      <input type="hidden" name="experience_level" value={experience} />
      <input type="hidden" name="gender" value={gender} />
      {equipment.map((v) => (
        <input key={v} type="hidden" name="preferred_equipment" value={v} />
      ))}
      <input type="hidden" name="units" value={units} />

      <div className={step === 0 ? "flex flex-col gap-5" : "hidden"}>
        <p className="text-sm text-ink/55">
          A few details to calibrate your starting prescriptions.
        </p>
        <Input label="Name" name="display_name" required maxLength={60} />
        <Input label="Age" name="age" type="number" min={13} max={120} required />
        <div className="flex flex-col gap-1.5">
          <span className="label-caps text-[10px] font-semibold text-ink/55">
            Sex — calibrates muscle-gain targets
          </span>
          <SegmentedControl
            options={[
              { value: "female", label: "FEMALE" },
              { value: "male", label: "MALE" },
              { value: "other", label: "OTHER" },
              { value: "undisclosed", label: "PREFER NOT" },
            ]}
            value={gender}
            onChange={setGender}
          />
        </div>
        <Input
          label="Height — cm"
          name="height_cm"
          type="number"
          min={90}
          max={250}
          inputMode="numeric"
        />
        <Input
          label={`Bodyweight — ${units}`}
          name="bodyweight"
          type="number"
          min={1}
          max={1000}
          step="0.1"
          inputMode="decimal"
        />
      </div>

      <div className={step === 1 ? "flex flex-col gap-5" : "hidden"}>
        <p className="text-sm text-ink/55">
          Experience sets your starting volumes and how aggressively loads
          ramp.
        </p>
        <SegmentedControl
          options={[
            { value: "beginner", label: "BEGINNER" },
            { value: "intermediate", label: "INTERMEDIATE" },
            { value: "advanced", label: "ADVANCED" },
          ]}
          value={experience}
          onChange={setExperience}
        />
        <p className="text-sm text-ink/55">
          {experience === "beginner"
            ? "Under two years of consistent lifting. Larger load jumps, conservative volume."
            : experience === "intermediate"
              ? "Two to five years. Standard progression increments."
              : "Five plus years. Smaller increments, volume does the work."}
        </p>
      </div>

      <div className={step === 2 ? "flex flex-col gap-5" : "hidden"}>
        <p className="text-sm text-ink/55">
          What you train with. Pickers favor what you have access to.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {EQUIPMENT.map((opt) => (
            <Chip
              key={opt.value}
              selected={equipment.includes(opt.value)}
              onClick={() => toggleEquipment(opt.value)}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className={step === 3 ? "flex flex-col gap-5" : "hidden"}>
        <p className="text-sm text-ink/55">
          Loads, increments, and history in one unit. Change it any time in
          More.
        </p>
        <SegmentedControl
          options={[
            { value: "lb", label: "LB" },
            { value: "kg", label: "KG" },
          ]}
          value={units}
          onChange={setUnits}
        />
      </div>

      {state.error && <p className="text-sm text-accent">{state.error}</p>}

      <div className="flex gap-2">
        {step > 0 && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            onClick={next}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            disabled={pending}
          >
            {pending ? "Saving" : "Start training"}
          </Button>
        )}
      </div>
    </form>
  );
}
