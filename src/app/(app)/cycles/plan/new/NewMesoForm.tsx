"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createMesocycleAction, type FormState } from "../../actions";

const initialState: FormState = { error: null };

/** Create a standalone mesocycle (fig 2.4 from-scratch / template / copy path). */
export function NewMesoForm({
  templateId = null,
  copyMesoId = null,
  defaultName = "",
  defaultWeeks = 5,
  defaultDeload = true,
  defaultRirStart = 3,
  defaultRirEnd = 0,
}: {
  templateId?: string | null;
  copyMesoId?: string | null;
  defaultName?: string;
  defaultWeeks?: number;
  defaultDeload?: boolean;
  defaultRirStart?: number;
  defaultRirEnd?: number;
}) {
  const [state, formAction, pending] = useActionState(
    createMesocycleAction,
    initialState,
  );
  const router = useRouter();
  const [weeks, setWeeks] = useState(defaultWeeks);

  return (
    <form action={formAction}>
      <input type="hidden" name="weeks" value={weeks} />
      <input type="hidden" name="includes_deload" value={String(defaultDeload)} />
      <input type="hidden" name="rir_start" value={defaultRirStart} />
      <input type="hidden" name="rir_end" value={defaultRirEnd} />
      {templateId && <input type="hidden" name="template_id" value={templateId} />}
      {copyMesoId && <input type="hidden" name="copy_meso_id" value={copyMesoId} />}

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
        RIR RAMP: {defaultRirStart} → {defaultRirEnd}
        {defaultDeload ? ` · W${weeks} DELOAD AT 4 RIR` : ""}
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
