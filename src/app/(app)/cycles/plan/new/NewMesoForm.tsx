"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createMesocycleAction, type FormState } from "../../actions";

const initialState: FormState = { error: null };

const RIR_START = 3;
const RIR_END = 0;

export interface PlacementMacro {
  id: string;
  name: string;
  start_date: string;
  target_end_date: string | null;
  slots: {
    id: string;
    slot_number: number;
    label: string;
    goal_type: string;
    state: "done" | "filled" | "open";
  }[];
}

function shortMonthYear(iso: string): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const d = new Date(`${iso}T12:00:00`);
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** Create-meso form (fig 2.7): name, macro-placement timeline, weeks 4–8. */
export function NewMesoForm({
  macros,
  preselectedSlot,
  templateId = null,
  defaultName = "",
}: {
  macros: PlacementMacro[];
  preselectedSlot: string | null;
  templateId?: string | null;
  defaultName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createMesocycleAction,
    initialState,
  );
  const router = useRouter();
  const [weeks, setWeeks] = useState(5);
  const [slotId, setSlotId] = useState<string | null>(
    preselectedSlot &&
      macros.some((m) => m.slots.some((s) => s.id === preselectedSlot && s.state === "open"))
      ? preselectedSlot
      : null,
  );

  const selectedMacro = macros.find((m) =>
    m.slots.some((s) => s.id === slotId),
  );
  const selectedSlot = selectedMacro?.slots.find((s) => s.id === slotId);

  return (
    <form action={formAction}>
      <input type="hidden" name="weeks" value={weeks} />
      <input type="hidden" name="includes_deload" value="true" />
      <input type="hidden" name="macro_slot_id" value={slotId ?? ""} />
      <input type="hidden" name="rir_start" value={RIR_START} />
      <input type="hidden" name="rir_end" value={RIR_END} />
      {templateId && <input type="hidden" name="template_id" value={templateId} />}

      <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        NAME
      </div>
      <input
        name="name"
        required
        maxLength={80}
        defaultValue={defaultName}
        className="mt-2 h-12 w-full border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink placeholder:text-ink/40 focus:outline-none"
        placeholder="e.g. Jul '26 — Bulk II"
      />

      {macros.map((macro) => (
        <div key={macro.id}>
          <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            MACRO PLACEMENT — {macro.name.toUpperCase()}
          </div>
          <div className="mt-2 flex gap-[5px]">
            {macro.slots.map((slot) => {
              const selected = slotId === slot.id;
              const base =
                "flex h-[34px] flex-1 items-center justify-center text-[9.5px] tracking-[0.06em]";
              if (slot.state !== "open")
                return (
                  <div
                    key={slot.id}
                    className={`${base} bg-ink font-semibold text-bg-base`}
                  >
                    {slot.label}
                    {slot.state === "done" ? " ✓" : ""}
                  </div>
                );
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSlotId(selected ? null : slot.id)}
                  className={
                    selected
                      ? `${base} border-2 border-accent font-extrabold text-accent`
                      : `${base} border border-dashed border-ink/40 font-medium text-ink/45`
                  }
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[9px] font-medium tracking-[0.1em] text-ink/50">
            <span>{shortMonthYear(macro.start_date)}</span>
            {selectedMacro?.id === macro.id && selectedSlot ? (
              <span className="font-bold text-accent">
                SLOT {selectedSlot.slot_number} OF {macro.slots.length} — GOAL:{" "}
                {selectedSlot.label}
              </span>
            ) : (
              <span>TAP AN OPEN SLOT — OR LEAVE STANDALONE</span>
            )}
            <span>
              {macro.target_end_date ? shortMonthYear(macro.target_end_date) : "—"}
            </span>
          </div>
        </div>
      ))}

      <div className="mt-5 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        WEEKS — INCLUDING DELOAD
      </div>
      <div className="mt-2 flex border-[1.5px] border-ink">
        {[4, 5, 6, 7, 8].map((w, i) => (
          <button
            key={w}
            type="button"
            onClick={() => setWeeks(w)}
            className={`numeral flex-1 py-[13px] text-center text-[15px] ${
              weeks === w
                ? "bg-ink font-bold text-bg-base"
                : `font-medium ${i > 0 ? "border-l border-ink/25" : ""}`
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      <div className="mt-[7px] text-[10px] font-medium tracking-[0.08em] text-ink/50">
        RIR RAMP: {RIR_START} → {RIR_END} · W{weeks} DELOAD AT 4 RIR
      </div>

      {state.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}

      <div className="mt-6 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
        >
          {pending ? "CREATING" : "CREATE"}
        </button>
      </div>
    </form>
  );
}
