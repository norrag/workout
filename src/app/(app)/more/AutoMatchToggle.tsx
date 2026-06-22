"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { setAutoMatchWeights } from "./actions";

/** ON/OFF mini toggle for the auto-match-weights setting (doc 11). */
export function AutoMatchToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [, startTransition] = useTransition();
  const toast = useToast();
  return (
    <div className="flex border-[1.5px] border-ink">
      {([true, false] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={on === value}
          onClick={() => {
            if (on === value) return;
            const prev = on;
            setOn(value);
            // Online-only (CLAUDE.md): a failed write rolls the control back and
            // surfaces a quiet ledger note instead of escaping the transition and
            // tripping the app-error page.
            startTransition(async () => {
              try {
                await setAutoMatchWeights(value);
              } catch {
                setOn(prev);
                toast("Couldn't save that setting");
              }
            });
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
