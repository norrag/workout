"use client";

import { useMemo, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ProfileRow } from "@/lib/types/database";
import type { ExclusionWithExercise } from "@/lib/queries/exercises";
import {
  addExclusionAction,
  removeExclusionAction,
  setEquipment,
  setExperience,
  updateProfileField,
} from "./actions";

const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "bodyweight",
  "bands",
  "kettlebell",
] as const;

type EditableField = "display_name" | "age" | "height_cm" | "bodyweight" | "training_since";

const FIELD_META: Record<
  EditableField,
  { label: string; type: string; hint?: string }
> = {
  display_name: { label: "NAME", type: "text" },
  age: { label: "AGE", type: "number" },
  height_cm: { label: "HEIGHT", type: "number", hint: "Centimeters" },
  bodyweight: { label: "BODYWEIGHT", type: "number" },
  training_since: { label: "TRAINING SINCE", type: "date" },
};

function formatHeight(heightCm: number | null, units: string): string {
  if (heightCm == null) return "—";
  if (units === "kg") return `${heightCm} CM`;
  const totalIn = Math.round(heightCm / 2.54);
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}

function shortDate(iso: string): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** Profile (fig 4.5): data rows, experience, equipment access, exclusions. */
export function ProfileEditor({
  profile,
  exclusions,
  exercises,
}: {
  profile: ProfileRow;
  exclusions: ExclusionWithExercise[];
  exercises: { id: string; name: string }[];
}) {
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [experience, setExperienceLocal] = useState(
    profile.experience_level ?? "beginner",
  );
  const [equipment, setEquipmentLocal] = useState<string[]>(
    profile.preferred_equipment ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");

  const units = profile.units;

  const rows: { field: EditableField; value: React.ReactNode; raw: string }[] = [
    {
      field: "display_name",
      value: profile.display_name ?? "—",
      raw: profile.display_name ?? "",
    },
    {
      field: "age",
      value: <span className="numeral">{profile.age ?? "—"}</span>,
      raw: profile.age != null ? String(profile.age) : "",
    },
    {
      field: "height_cm",
      value: formatHeight(profile.height_cm, units),
      raw: profile.height_cm != null ? String(profile.height_cm) : "",
    },
    {
      field: "bodyweight",
      value: (
        <span className="numeral">
          {profile.bodyweight != null
            ? `${profile.bodyweight} ${units.toUpperCase()}`
            : "—"}{" "}
          {profile.bodyweight_updated_at && (
            <span className="text-[9px] font-medium tracking-[0.1em] text-ink/50">
              UPDATED {shortDate(profile.bodyweight_updated_at)}
            </span>
          )}
        </span>
      ),
      raw: profile.bodyweight != null ? String(profile.bodyweight) : "",
    },
    {
      field: "training_since",
      value: profile.training_since ? (
        <span className="numeral">{profile.training_since}</span>
      ) : (
        "—"
      ),
      raw: profile.training_since ?? "",
    },
  ];

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

  return (
    <div>
      {/* data rows */}
      <div className="mt-1 border-t-[1.5px] border-ink">
        {rows.map((row) => (
          <button
            key={row.field}
            type="button"
            onClick={() => {
              setEditing(row.field);
              setEditValue(row.raw);
              setEditError(null);
            }}
            className="flex w-full items-baseline justify-between border-b border-ink/15 py-3 text-left"
          >
            <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
              {FIELD_META[row.field].label}
            </div>
            <div className="text-[15px] font-bold">{row.value}</div>
          </button>
        ))}
      </div>

      {/* experience */}
      <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        TRAINING EXPERIENCE
      </div>
      <div className="mt-2 flex border-[1.5px] border-ink">
        {(["beginner", "intermediate", "advanced"] as const).map((level, i) => (
          <button
            key={level}
            type="button"
            aria-pressed={experience === level}
            onClick={() => {
              setExperienceLocal(level);
              startTransition(() => setExperience(level));
            }}
            className={`flex-1 py-2.5 text-center text-[10px] tracking-[0.1em] ${
              experience === level
                ? "bg-ink font-bold text-bg-base"
                : `font-medium text-ink/55 ${i > 0 ? "border-l border-ink/30" : ""}`
            }`}
          >
            {level.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="mt-[7px] text-[11px] font-medium leading-normal text-ink/60">
        Drives starting volumes and how aggressively autoregulation ramps.
      </p>

      {/* equipment access */}
      <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        EQUIPMENT ACCESS
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {EQUIPMENT.map((value) => {
          const on = equipment.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = on
                  ? equipment.filter((v) => v !== value)
                  : [...equipment, value];
                setEquipmentLocal(next);
                startTransition(() => setEquipment(next));
              }}
              className={`px-3 py-2 text-[10px] tracking-[0.1em] ${
                on
                  ? "bg-ink font-bold text-bg-base"
                  : "border border-ink/35 font-medium text-ink/55"
              }`}
            >
              {value.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* exclusions */}
      <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        EXCLUDED EXERCISES
      </div>
      <div className="mt-1">
        {exclusions.map((x) => (
          <div
            key={x.id}
            className="flex items-baseline justify-between border-b border-ink/15 py-[11px]"
          >
            <div className="text-sm font-semibold">{x.exercise_name}</div>
            <button
              type="button"
              onClick={() => startTransition(() => removeExclusionAction(x.id))}
              className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55"
            >
              {x.reason ? `${x.reason.toUpperCase()} · ` : ""}✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="mt-3 w-full border border-dashed border-ink/40 py-[11px] text-center text-[10.5px] font-semibold tracking-[0.1em] text-ink/60"
      >
        + ADD EXCLUSION
      </button>
      <p className="mt-[7px] text-[11px] font-medium leading-normal text-ink/60">
        Excluded movements never appear in pickers or templates.
      </p>

      {/* single-field edit sheet */}
      {editing && (
        <BottomSheet
          open
          onClose={() => setEditing(null)}
          title={FIELD_META[editing].label.toLowerCase()}
          subtitle={
            editing === "height_cm"
              ? "CENTIMETERS"
              : editing === "bodyweight"
                ? units.toUpperCase()
                : undefined
          }
        >
          <input
            type={FIELD_META[editing].type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
            className="h-12 w-full border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink focus:outline-none"
          />
          {editError && <p className="mt-2 text-sm text-accent">{editError}</p>}
          <div className="mt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-3 text-[13px] font-semibold text-ink/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  const result = await updateProfileField(editing, editValue);
                  if (result.error) setEditError(result.error);
                  else setEditing(null);
                })
              }
              className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
            >
              SAVE
            </button>
          </div>
        </BottomSheet>
      )}

      {/* exclusion picker */}
      <BottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add exclusion"
        subtitle="NEVER SHOWN IN PICKERS OR TEMPLATES"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="h-[42px] w-full border-[1.5px] border-ink bg-paper px-3 text-[13px] text-ink placeholder:text-ink/45 focus:outline-none"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={40}
          placeholder="Reason — e.g. LOW BACK (optional)"
          className="mt-2 h-[42px] w-full border border-ink/35 bg-paper px-3 text-[13px] text-ink placeholder:text-ink/45 focus:outline-none"
        />
        <div className="mt-2 max-h-[40dvh] overflow-y-auto">
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
              className="flex min-h-12 w-full items-center border-b border-ink/15 text-left text-sm font-semibold"
            >
              {e.name}
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="py-4 text-sm text-ink/45">No matches.</p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
