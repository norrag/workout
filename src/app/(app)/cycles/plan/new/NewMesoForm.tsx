"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WeekTrack, type WeekTrackWeek } from "@/components/ui/WeekTrack";
import { createMesocycleAction, type FormState } from "../../actions";

const initialState: FormState = { error: null };

const RIR_START = 3;
const RIR_END = 0;

/** Mirrors the engine's linear ramp for the preview row (fig 2.7). */
function previewRamp(weeks: number, includesDeload: boolean): WeekTrackWeek[] {
  const working = includesDeload ? weeks - 1 : weeks;
  const out: WeekTrackWeek[] = [];
  for (let i = 0; i < working; i++) {
    const t = working === 1 ? 1 : i / (working - 1);
    out.push({
      label: `${Math.round(RIR_START + (RIR_END - RIR_START) * t)} RIR`,
      state: "future",
    });
  }
  if (includesDeload) out.push({ label: "DL", state: "future", isDeload: true });
  return out;
}

export function NewMesoForm({
  openSlots,
  preselectedSlot,
}: {
  openSlots: { id: string; label: string }[];
  preselectedSlot: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    createMesocycleAction,
    initialState,
  );
  const [weeks, setWeeks] = useState(5);
  const [includesDeload, setIncludesDeload] = useState(true);
  const [slotId, setSlotId] = useState<string | null>(
    preselectedSlot &&
      openSlots.some((s) => s.id === preselectedSlot)
      ? preselectedSlot
      : null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="weeks" value={weeks} />
      <input
        type="hidden"
        name="includes_deload"
        value={String(includesDeload)}
      />
      <input type="hidden" name="macro_slot_id" value={slotId ?? ""} />
      <input type="hidden" name="rir_start" value={RIR_START} />
      <input type="hidden" name="rir_end" value={RIR_END} />

      <Input label="Name" name="name" required maxLength={80} />

      {openSlots.length > 0 && (
        <fieldset>
          <legend className="label-caps mb-2 text-[10px] font-semibold text-ink/55">
            Placement
          </legend>
          <div className="flex flex-col gap-2">
            <Chip
              selected={slotId === null}
              onClick={() => setSlotId(null)}
              className="w-full"
            >
              STANDALONE
            </Chip>
            {openSlots.map((slot) => (
              <Chip
                key={slot.id}
                selected={slotId === slot.id}
                onClick={() => setSlotId(slot.id)}
                className="w-full"
              >
                {slot.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="label-caps mb-2 text-[10px] font-semibold text-ink/55">
          Weeks — including deload
        </legend>
        <SegmentedControl
          options={[4, 5, 6, 7, 8].map((w) => ({
            value: String(w),
            label: String(w),
          }))}
          value={String(weeks)}
          onChange={(v) => setWeeks(Number(v))}
        />
      </fieldset>

      <fieldset>
        <legend className="label-caps mb-2 text-[10px] font-semibold text-ink/55">
          Deload week
        </legend>
        <SegmentedControl
          options={[
            { value: "true", label: "DELOAD" },
            { value: "false", label: "NO DELOAD" },
          ]}
          value={String(includesDeload)}
          onChange={(v) => setIncludesDeload(v === "true")}
        />
      </fieldset>

      <div>
        <p className="label-caps mb-2 text-[10px] font-semibold text-ink/55">
          RIR ramp
        </p>
        <WeekTrack weeks={previewRamp(weeks, includesDeload)} />
        <p className="mt-2 text-sm text-ink/55">
          Effort ramps from {RIR_START} RIR to {RIR_END} RIR
          {includesDeload ? ", then a deload week" : ""}.
        </p>
      </div>

      {state.error && <p className="text-sm text-accent">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating" : "Create and plan days"}
      </Button>
    </form>
  );
}
