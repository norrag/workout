"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { createMacrocycleAction, type FormState } from "../actions";

const initialState: FormState = { error: null };

const GOAL_TYPES = ["cut", "gain", "maintain", "peak"] as const;
type GoalType = (typeof GOAL_TYPES)[number];

interface SlotDraft {
  goal_type: GoalType;
  label: string | null;
}

/**
 * Macro creation: name, date range, ordered goal-arc slots (fig 2.1 —
 * "CUT → BULK → BULK II → PEAK"). Tapping a slot cycles its goal type.
 */
export function NewMacroForm() {
  const [state, formAction, pending] = useActionState(
    createMacrocycleAction,
    initialState,
  );
  const [slots, setSlots] = useState<SlotDraft[]>([
    { goal_type: "gain", label: null },
  ]);

  const cycleGoal = (index: number) =>
    setSlots((cur) =>
      cur.map((s, i) =>
        i === index
          ? {
              ...s,
              goal_type:
                GOAL_TYPES[
                  (GOAL_TYPES.indexOf(s.goal_type) + 1) % GOAL_TYPES.length
                ],
            }
          : s,
      ),
    );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="slots" value={JSON.stringify(slots)} />
      <Input label="Name" name="name" required maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Starts" name="start_date" type="date" required />
        <Input label="Target end" name="target_end_date" type="date" />
      </div>

      <fieldset>
        <legend className="label-caps mb-2 text-[10px] font-semibold text-ink/55">
          Goal arc — tap a slot to change its goal
        </legend>
        <div className="flex flex-col gap-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="numeral w-6 text-[10px] font-semibold text-ink/45">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Chip selected className="flex-1" onClick={() => cycleGoal(i)}>
                {slot.goal_type.toUpperCase()}
              </Chip>
              <button
                type="button"
                aria-label={`remove slot ${i + 1}`}
                disabled={slots.length === 1}
                onClick={() =>
                  setSlots((cur) => cur.filter((_, j) => j !== i))
                }
                className="label-caps min-h-11 px-2 text-[10px] font-bold text-accent disabled:opacity-30"
              >
                REMOVE
              </button>
            </div>
          ))}
        </div>
        <Chip
          dashed
          className="mt-2 w-full"
          disabled={slots.length >= 12}
          onClick={() =>
            setSlots((cur) => [...cur, { goal_type: "gain", label: null }])
          }
        >
          + ADD SLOT
        </Chip>
      </fieldset>

      {state.error && <p className="text-sm text-accent">{state.error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Creating" : "Create macrocycle"}
      </Button>
    </form>
  );
}
