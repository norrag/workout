"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { RedeemForm } from "@/components/RedeemForm";
import { startScratchDraftAction } from "../cycles/actions";

/**
 * `+ NEW` button + chooser sheet (PH27): mirrors the create-cycle tray. Two
 * paths to a new template — start a blank planner draft, or add one from a share
 * code (the redeem flow moved off the page list into this tray).
 */
export function NewTemplateButton() {
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

      <BottomSheet open={open} onClose={() => setOpen(false)} title="New template">
        {/* Blank template = open the planner board (a fresh draft); build the
            split there, then SAVE AS TEMPLATE. */}
        <form action={startScratchDraftAction}>
          <SubmitButton className="mt-4 flex w-full items-center gap-[13px] border-[1.5px] border-ink bg-paper px-[15px] py-3.5 text-left">
            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center bg-ink text-[13px] font-extrabold text-bg-base">
              T
            </div>
            <div className="flex-1">
              <div className="text-base font-bold">Blank template</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink/60">
                Build the split on the planner, then save it as a template.
              </div>
            </div>
            <div className="text-base font-bold">›</div>
          </SubmitButton>
        </form>

        <div className="mt-[18px] border-t border-ink/15 pt-3 text-[10px] font-bold tracking-[0.14em] text-ink-muted">
          OR ADD FROM A CODE
        </div>
        <RedeemForm />
      </BottomSheet>
    </>
  );
}
