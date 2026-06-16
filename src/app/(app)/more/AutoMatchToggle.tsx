"use client";

import { useState, useTransition } from "react";
import { setAutoMatchWeights } from "./actions";

/** ON/OFF mini toggle for the auto-match-weights setting (doc 11). */
export function AutoMatchToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [, startTransition] = useTransition();
  return (
    <div className="flex border-[1.5px] border-ink">
      {([true, false] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={on === value}
          onClick={() => {
            setOn(value);
            startTransition(() => setAutoMatchWeights(value));
          }}
          className={`px-4 py-[7px] text-[10px] tracking-[0.1em] ${
            on === value
              ? "bg-ink font-bold text-bg-base"
              : "font-medium text-ink/55"
          }`}
        >
          {value ? "ON" : "OFF"}
        </button>
      ))}
    </div>
  );
}
