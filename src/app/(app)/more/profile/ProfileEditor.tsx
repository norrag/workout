"use client";

import { useMemo, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { ProfileRow } from "@/lib/types/database";
import type { ExclusionWithExercise } from "@/lib/queries/exercises";
import {
  formatHeight,
  isImperial,
  cmToFeetInches,
  feetInchesToCm,
} from "@/lib/units";
import {
  addExclusionAction,
  clearBodyFatAction,
  removeExclusionAction,
  setEquipment,
  setExperience,
  setGender,
  updateProfileField,
} from "./actions";

const GENDERS = [
  { value: "female", label: "FEMALE" },
  { value: "male", label: "MALE" },
  { value: "other", label: "OTHER" },
  { value: "undisclosed", label: "PREFER NOT" },
] as const;

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

const KNOWN_EQUIPMENT = new Set<string>(EQUIPMENT);

type EditableField = "display_name" | "age" | "height_cm" | "bodyweight" | "training_since";

const FIELD_META: Record<
  EditableField,
  { label: string; type: string; hint?: string }
> = {
  display_name: { label: "NAME", type: "text" },
  age: { label: "AGE", type: "number" },
  height_cm: { label: "HEIGHT", type: "number" },
  bodyweight: { label: "BODYWEIGHT", type: "number" },
  training_since: { label: "TRAINING SINCE", type: "date" },
};

// body-fat estimate bands (store the midpoint %); a visual/text picker keeps
// it accessible — feeds the FFMI proximity target model (10-spec §5).
const BODY_FAT_BANDS = [
  { mid: 10, label: "~10%" },
  { mid: 14, label: "~14%" },
  { mid: 18, label: "~18%" },
  { mid: 23, label: "~23%" },
  { mid: 29, label: "~29%" },
  { mid: 35, label: "35%+" },
] as const;

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
  // imperial height edits in feet + inches (PH28); the canonical cm is derived
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [experience, setExperienceLocal] = useState(
    profile.experience_level ?? "beginner",
  );
  // Drop any legacy/unknown equipment values (e.g. pre-pivot "free_weights")
  // so a toggle never resends a value the canonical vocabulary rejects.
  const [equipment, setEquipmentLocal] = useState<string[]>(
    (profile.preferred_equipment ?? []).filter((v) => KNOWN_EQUIPMENT.has(v)),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [bodyFat, setBodyFatLocal] = useState<number | null>(
    profile.body_fat_pct,
  );
  const [gender, setGenderLocal] = useState(profile.gender ?? "undisclosed");

  const units = profile.units;
  const imperial = isImperial(units);

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
      value: formatHeight(profile.height_cm, units) ?? "—",
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
              if (row.field === "height_cm" && imperial) {
                if (profile.height_cm != null) {
                  const { feet, inches } = cmToFeetInches(profile.height_cm);
                  setHeightFeet(String(feet));
                  setHeightInches(String(inches));
                } else {
                  setHeightFeet("");
                  setHeightInches("");
                }
              }
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

      {/* sex — calibrates the macrocycle muscle-gain target */}
      <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        SEX
      </div>
      <div className="mt-2 flex border-[1.5px] border-ink">
        {GENDERS.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={gender === opt.value}
            onClick={() => {
              setGenderLocal(opt.value);
              startTransition(() => setGender(opt.value));
            }}
            className={`flex-1 py-2.5 text-center text-[10px] tracking-[0.08em] ${
              gender === opt.value
                ? "bg-ink font-bold text-bg-base"
                : `font-medium text-ink/55 ${i > 0 ? "border-l border-ink/30" : ""}`
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-[7px] text-[11px] font-medium leading-normal text-ink/60">
        Calibrates the realistic muscle-gain target on your macrocycles.
      </p>

      {/* body fat estimate (optional) */}
      <div className="mt-5 flex items-baseline justify-between">
        <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
          BODY FAT — ESTIMATE
        </div>
        <div className="text-[9px] font-medium tracking-[0.1em] text-ink/45">
          OPTIONAL
        </div>
      </div>
      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {BODY_FAT_BANDS.map(({ mid, label }) => {
          const on = bodyFat != null && Math.abs(bodyFat - mid) < 2.5;
          return (
            <button
              key={mid}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const next = on ? null : mid;
                setBodyFatLocal(next);
                startTransition(() =>
                  next == null
                    ? clearBodyFatAction()
                    : updateProfileField("body_fat_pct", String(next)).then(
                        () => undefined,
                      ),
                );
              }}
              className={`py-2 text-center text-[10px] tracking-[0.04em] ${
                on
                  ? "bg-ink font-bold text-bg-base"
                  : "border border-ink/35 font-medium text-ink/55"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-[7px] text-[11px] font-medium leading-normal text-ink/60">
        Pick the closest. With your height and weight this estimates how much
        muscle you carry vs. your potential — the single biggest input to a
        realistic macrocycle target. Skip it and we fall back to training age.
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
      {editing &&
        (() => {
          const imperialHeight = editing === "height_cm" && imperial;
          const inputClass =
            "h-12 w-full border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink focus:outline-none";
          const save = () =>
            startTransition(async () => {
              // imperial height is captured as feet + inches; persist canonical cm
              const value = imperialHeight
                ? String(
                    feetInchesToCm(
                      Number(heightFeet || 0),
                      Number(heightInches || 0),
                    ),
                  )
                : editValue;
              const result = await updateProfileField(editing, value);
              if (result.error) setEditError(result.error);
              else setEditing(null);
            });
          return (
            <BottomSheet
              open
              onClose={() => setEditing(null)}
              title={FIELD_META[editing].label.toLowerCase()}
              subtitle={
                editing === "height_cm"
                  ? imperial
                    ? "FEET / INCHES"
                    : "CENTIMETERS"
                  : editing === "bodyweight"
                    ? units.toUpperCase()
                    : undefined
              }
            >
              {imperialHeight ? (
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={8}
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(e.target.value)}
                      aria-label="height feet"
                      autoFocus
                      className={inputClass}
                    />
                    <span className="text-[13px] font-semibold text-ink/55">
                      ft
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={11}
                      value={heightInches}
                      onChange={(e) => setHeightInches(e.target.value)}
                      aria-label="height inches"
                      className={inputClass}
                    />
                    <span className="text-[13px] font-semibold text-ink/55">
                      in
                    </span>
                  </div>
                </div>
              ) : (
                <input
                  type={FIELD_META[editing].type}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  autoFocus
                  className={inputClass}
                />
              )}
              {editError && (
                <p className="mt-2 text-sm text-accent">{editError}</p>
              )}
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
                  onClick={save}
                  className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base"
                >
                  SAVE
                </button>
              </div>
            </BottomSheet>
          );
        })()}

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
