"use client";

import { useState, useTransition } from "react";
import { createShareCodeAction } from "@/app/(app)/share/actions";

/** Mint-a-share-code row (F5/F6 sharing — house style, not mocked). */
export function ShareRow({
  objectType,
  objectId,
}: {
  objectType: "exercise" | "template" | "mesocycle";
  objectId: string;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (code)
    return (
      <div className="mt-2.5 border border-ink/35 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            SHARE CODE
          </span>
          <span className="numeral text-base font-extrabold tracking-[0.18em]">
            {code}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-normal text-ink/60">
          One redemption — whoever enters it gets their own copy.
        </p>
      </div>
    );

  return (
    <div className="mt-2.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createShareCodeAction({
              object_type: objectType,
              object_id: objectId,
            });
            setCode(result.code);
            setError(result.error);
          })
        }
        className="w-full border border-ink/35 py-3 text-center text-[11px] font-semibold tracking-[0.1em] text-ink/70 disabled:opacity-40"
      >
        {pending ? "SHARING…" : "SHARE — GET CODE"}
      </button>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
    </div>
  );
}
