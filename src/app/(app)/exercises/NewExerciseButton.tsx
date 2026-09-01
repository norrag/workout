"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { RedeemForm } from "@/components/RedeemForm";

/**
 * `+ NEW` button + chooser sheet (N23): mirrors the template/cycle trays. Two
 * paths to a new exercise — build a blank custom one, or add a copy from a
 * share code. The code input is the same kind-agnostic RedeemForm as the other
 * trays (a meso/template code entered here still routes to the right place),
 * but this tray is where a user holding an *exercise* code will look for it.
 */
export function NewExerciseButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`border-[1.5px] border-ink px-3.5 py-[9px] text-[11px] font-bold tracking-[0.1em] ${
          open ? "bg-ink text-bg-base" : ""
        }`}
      >
        + NEW
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="New exercise">
        <Link
          href="/exercises/new"
          className="mt-4 flex w-full items-center gap-[13px] border-[1.5px] border-ink bg-paper px-[15px] py-3.5 text-left"
        >
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-ink text-[13px] font-extrabold text-bg-base">
            E
          </div>
          <div className="flex-1">
            <div className="text-base font-bold">Blank exercise</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink/60">
              Name it, pick equipment and muscles, set the load step.
            </div>
          </div>
          <div className="text-base font-bold">›</div>
        </Link>

        <div className="mt-[18px] border-t border-ink/15 pt-3 text-[10px] font-bold tracking-[0.14em] text-ink-muted">
          OR ADD FROM A CODE
        </div>
        <RedeemForm />
      </BottomSheet>
    </>
  );
}
