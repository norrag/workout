"use client";

import { useState } from "react";

/** Monospace endpoint field with a copy button, in the ledger style. */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the value is selectable inline
    }
  }

  return (
    <div className="flex items-stretch border-[1.5px] border-ink">
      <code className="flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 text-[12px] tracking-tight">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 border-l-[1.5px] border-ink px-3 text-[9.5px] font-bold tracking-[0.12em]"
      >
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}
