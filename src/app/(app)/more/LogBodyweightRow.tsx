"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { localDayIso, shortDate } from "@/lib/dates";
import { logBodyweightAction } from "./actions";

/**
 * doc 17 §5 / 09-changelog 2026-07-11 §1 — the bodyweight quick entry: a
 * settings-list row showing the latest measured point, opening a sheet that
 * appends a `source:'manual'` point (backdatable, same-day re-entry replaces).
 * Never touches `profiles.bodyweight` — that scalar is the engine input,
 * edited in the profile editor.
 */
export function LogBodyweightRow({
  latest,
  fallbackWeight,
}: {
  /** latest bodyweight_log point (any source) */
  latest: { weight: number; measured_on: string } | null;
  /** profile scalar — prefill before any point exists */
  fallbackWeight: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const openSheet = () => {
    setWeight(String(latest?.weight ?? fallbackWeight ?? ""));
    setDate(localDayIso());
    setError(null);
    setOpen(true);
  };

  const save = () =>
    startTransition(async () => {
      const result = await logBodyweightAction({
        weight: Number(weight),
        measured_on: date,
      });
      if (result.error) setError(result.error);
      else setOpen(false);
    });

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="flex w-full items-center justify-between border-b border-ink/15 py-3.5 text-left"
      >
        <div className="text-sm font-semibold">Log bodyweight</div>
        <div className="text-[9.5px] font-semibold tracking-[0.1em] text-ink/55">
          {latest ? (
            <>
              <span className="numeral">{latest.weight}</span> LB ·{" "}
              {shortDate(latest.measured_on)} ›
            </>
          ) : (
            "— ›"
          )}
        </div>
      </button>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="log bodyweight"
        subtitle="MEASUREMENT · LB"
      >
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={1000}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-label="bodyweight in pounds"
            autoFocus
            className="h-12 flex-1 border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink focus:outline-none"
          />
          <input
            type="date"
            value={date}
            max={localDayIso()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="measurement date"
            className="h-12 flex-1 border-[1.5px] border-ink bg-paper px-3.5 text-[15px] font-semibold text-ink focus:outline-none"
          />
        </div>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
          >
            SAVE
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
