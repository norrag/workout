"use client";

import { useTransition } from "react";
import { setUnits } from "./actions";

/** LB/KG mini toggle (fig 4.4). */
export function UnitsToggle({ units }: { units: "lb" | "kg" }) {
  const [, startTransition] = useTransition();
  return (
    <div className="flex border-[1.5px] border-ink">
      {(["lb", "kg"] as const).map((u) => (
        <button
          key={u}
          type="button"
          aria-pressed={units === u}
          onClick={() => startTransition(() => setUnits(u))}
          className={`px-4 py-[7px] text-[10px] tracking-[0.1em] ${
            units === u
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
