"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { setUnits } from "./actions";

/** LB/KG mini toggle (fig 4.4). */
export function UnitsToggle({ units }: { units: "lb" | "kg" }) {
  const [value, setValue] = useState(units);
  const [, startTransition] = useTransition();
  const toast = useToast();
  return (
    <div className="flex border-[1.5px] border-ink">
      {(["lb", "kg"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={value === u}
          onClick={() => {
            if (value === u) return;
            const prev = value;
            setValue(u);
            // A failed write reverts the control and surfaces a quiet note rather
            // than escaping the transition into the app-error page (online-only).
            startTransition(async () => {
              try {
                await setUnits(u);
              } catch {
                setValue(prev);
                toast("Couldn't save that setting");
              }
            });
          }}
          className={`px-4 py-[7px] text-[10px] tracking-[0.1em] ${
            value === u
              ? "bg-ink font-bold text-bg-base"
              : "font-medium text-ink/55"
          }`}
        >
          {u.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
