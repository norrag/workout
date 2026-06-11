"use client";

import { useCallback, useRef } from "react";

export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  label,
  format = (v: number) => String(v),
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
  format?: (v: number) => string;
}) {
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clamp = useCallback(
    (v: number) =>
      Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, v)),
    [min, max],
  );

  const bump = useCallback(
    (dir: 1 | -1) => onChange(clamp(Math.round((value + dir * step) * 100) / 100)),
    [clamp, onChange, step, value],
  );

  // long-press to accelerate
  const startHold = (dir: 1 | -1) => {
    stopHold();
    holdTimer.current = setInterval(() => bump(dir), 120);
  };
  const stopHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
  };

  const btn =
    "flex h-11 w-11 items-center justify-center rounded-[6px] border border-border-subtle bg-bg-raised text-lg text-text-primary active:border-accent select-none";

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="label-caps text-[10px] font-semibold text-text-secondary">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`decrease ${label ?? "value"}`}
          className={btn}
          onClick={() => bump(-1)}
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          −
        </button>
        <span className="numeral min-w-14 text-center text-2xl font-semibold">
          {format(value)}
        </span>
        <button
          type="button"
          aria-label={`increase ${label ?? "value"}`}
          className={btn}
          onClick={() => bump(1)}
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          +
        </button>
      </div>
    </div>
  );
}
