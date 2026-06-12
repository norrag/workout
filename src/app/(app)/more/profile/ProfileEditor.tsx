"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ProfileRow } from "@/lib/types/database";
import type { ExclusionWithExercise } from "@/lib/queries/exercises";
import {
  addExclusionAction,
  removeExclusionAction,
  saveProfileDetails,
  setEquipment,
  setExperience,
  type ProfileFormState,
} from "./actions";

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

const initialFormState: ProfileFormState = { error: null, saved: false };

/** Profile screen (fig 4.5). */
export function ProfileEditor({
  profile,
  exclusions,
  exercises,
}: {
  profile: ProfileRow;
  exclusions: ExclusionWithExercise[];
  exercises: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    saveProfileDetails,
    initialFormState,
  );
  const [, startTransition] = useTransition();
  const [experience, setExperienceLocal] = useState(
    profile.experience_level ?? "beginner",
  );
  const [equipment, setEquipmentLocal] = useState<string[]>(
    profile.preferred_equipment ?? [],
  );
  const [bodyweightChanged, setBodyweightChanged] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");

  const excludedIds = useMemo(
    () => new Set(exclusions.map((x) => x.exercise_id)),
    [exclusions],
  );
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises
      .filter((e) => !excludedIds.has(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [exercises, excludedIds, search]);

  const changeExperience = (level: typeof experience) => {
    setExperienceLocal(level);
    startTransition(() => setExperience(level));
  };

  const toggleEquipment = (value: string) => {
    const next = equipment.includes(value)
      ? equipment.filter((v) => v !== value)
      : [...equipment, value];
    setEquipmentLocal(next);
    startTransition(() => setEquipment(next));
  };

  return (
    <div className="flex flex-col gap-7">
      <Card header="Details">
        <form action={formAction} className="flex flex-col gap-4 pt-1">
          <input
            type="hidden"
            name="bodyweight_changed"
            value={String(bodyweightChanged)}
          />
          <Input
            label="Name"
            name="display_name"
            defaultValue={profile.display_name ?? ""}
            required
            maxLength={60}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Age"
              name="age"
              type="number"
              min={13}
              max={120}
              defaultValue={profile.age ?? ""}
            />
            <Input
              label="Height — cm"
              name="height_cm"
              type="number"
              min={90}
              max={250}
              defaultValue={profile.height_cm ?? ""}
            />
          </div>
          <Input
            label={`Bodyweight — ${profile.units}`}
            name="bodyweight"
            type="number"
            min={1}
            max={1000}
            step="0.1"
            defaultValue={profile.bodyweight ?? ""}
            onChange={() => setBodyweightChanged(true)}
          />
          {profile.bodyweight_updated_at && (
            <p className="label-caps -mt-2 text-[9px] font-medium text-ink/45">
              UPDATED {profile.bodyweight_updated_at.slice(0, 10)}
            </p>
          )}
          <Input
            label="Training since"
            name="training_since"
            type="date"
            defaultValue={profile.training_since ?? ""}
          />
          {state.error && <p className="text-sm text-accent">{state.error}</p>}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving" : state.saved ? "Saved" : "Save details"}
          </Button>
        </form>
      </Card>

      <Card header="Experience">
        <p className="mb-3 text-sm text-ink/55">
          Drives starting volumes and ramp aggressiveness.
        </p>
        <SegmentedControl
          options={[
            { value: "beginner", label: "BEGINNER" },
            { value: "intermediate", label: "INTERMEDIATE" },
            { value: "advanced", label: "ADVANCED" },
          ]}
          value={experience}
          onChange={changeExperience}
        />
      </Card>

      <Card header="Equipment access">
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
      </Card>

      <Card header="Excluded exercises">
        <p className="mb-3 text-sm text-ink/55">
          Excluded exercises never appear in pickers or templates.
        </p>
        <div className="flex flex-col">
          {exclusions.map((x) => (
            <div
              key={x.id}
              className="flex min-h-12 items-center justify-between border-b border-ink/15 py-2"
            >
              <div>
                <p className="text-sm font-semibold">{x.exercise_name}</p>
                {x.reason && (
                  <p className="label-caps text-[9px] font-medium text-ink/45">
                    {x.reason}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  startTransition(() => removeExclusionAction(x.id))
                }
                className="label-caps min-h-11 px-2 text-[10px] font-bold text-accent"
              >
                REMOVE
              </button>
            </div>
          ))}
        </div>
        <Chip
          dashed
          className="mt-3 w-full"
          onClick={() => setPickerOpen(true)}
        >
          + ADD EXCLUSION
        </Chip>
      </Card>

      <BottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="exclude exercise"
        subtitle="NEVER SHOWN IN PICKERS"
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Exercise name"
          />
          <Input
            label="Reason — optional"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={40}
            placeholder="e.g. LOW BACK"
          />
          <div className="flex flex-col">
            {candidates.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  startTransition(() =>
                    addExclusionAction(e.id, reason.trim() || null),
                  );
                  setPickerOpen(false);
                  setSearch("");
                  setReason("");
                }}
                className="flex min-h-12 items-center border-b border-ink/15 text-left text-sm font-semibold"
              >
                {e.name}
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="py-4 text-sm text-ink/45">No matches.</p>
            )}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
