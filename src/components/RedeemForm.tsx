"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptShareCodeAction } from "@/app/(app)/share/actions";

const DESTINATION = {
  exercise: (id: string) => `/exercises/${id}`,
  template: (id: string) => `/templates/${id}`,
  mesocycle: (id: string) => `/cycles/meso/${id}`,
} as const;

/** Redeem-a-share-code form (copy-on-accept, F5/F6 — house style, not mocked). */
export function RedeemForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const redeem = () =>
    startTransition(async () => {
      const result = await acceptShareCodeAction(code);
      if (result.error || !result.objectType || !result.objectId) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(DESTINATION[result.objectType](result.objectId));
    });

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          maxLength={8}
          placeholder="Have a share code?"
          aria-label="share code"
          className="numeral h-[42px] flex-1 border border-ink/40 bg-paper px-3 text-[13px] font-semibold tracking-[0.14em] text-ink placeholder:font-normal placeholder:tracking-normal placeholder:text-ink/45 focus:outline-none"
        />
        <button
          type="button"
          disabled={pending || code.trim().length < 8}
          onClick={redeem}
          className="border-[1.5px] border-ink px-4 text-[11px] font-bold tracking-[0.1em] disabled:opacity-40"
        >
          {pending ? "ADDING…" : "ADD"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
    </div>
  );
}
