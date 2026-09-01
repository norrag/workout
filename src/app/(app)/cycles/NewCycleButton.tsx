"use client";

import { useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { RedeemForm } from "@/components/RedeemForm";

/** `+ NEW` button + chooser sheet (fig 2.1b): macrocycle vs standalone meso,
 *  plus the share-code receptacle (N20 — redeem is kind-agnostic, so a code
 *  entered here routes to whatever it names). */
export function NewCycleButton() {
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

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Create new">
        <Link
          href="/cycles/new"
          className="mt-4 flex items-center gap-[13px] border-[1.5px] border-ink bg-paper px-[15px] py-3.5"
        >
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-ink text-[13px] font-extrabold text-bg-base">
            M
          </div>
          <div className="flex-1">
            <div className="text-base font-bold">Macrocycle</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink/60">
              A long-term goal arc that organizes several mesocycles.
            </div>
          </div>
          <div className="text-base font-bold">›</div>
        </Link>

        <Link
          href="/cycles/plan"
          className="mt-2.5 flex items-center gap-[13px] border-[1.5px] border-ink/35 px-[15px] py-3.5"
        >
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[13px] font-extrabold">
            m
          </div>
          <div className="flex-1">
            <div className="text-base font-bold">Standalone mesocycle</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink/60">
              A single training block, not tied to a macrocycle.
            </div>
          </div>
          <div className="text-base font-bold">›</div>
        </Link>

        <div className="mt-[15px] border-l-2 border-ink/30 pl-[11px] text-[11px] leading-snug text-ink/60">
          Planning a mesocycle <em>inside</em> a macrocycle? Use its{" "}
          <strong className="text-ink">+ PLAN</strong> rows instead — they keep
          it attached to the goal.
        </div>

        <div className="mt-[18px] border-t border-ink/15 pt-3 text-[10px] font-bold tracking-[0.14em] text-ink-muted">
          OR ADD FROM A CODE
        </div>
        <RedeemForm />
      </BottomSheet>
    </>
  );
}
