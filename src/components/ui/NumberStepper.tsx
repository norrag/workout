"use client";

import { useCallback, useEffect, useRef } from "react";

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
  // Track the latest value in a ref so a held repeat accumulates from the most
  // recent step instead of the value captured when the interval was created.
  const valueRef = useRef(value);
  valueRef.current = value;

  const clamp = useCallback(
    (v: number) =>
      Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, v)),
    [min, max],
  );

  const bump = useCallback(
    (dir: 1 | -1) => {
      const next = clamp(Math.round((valueRef.current + dir * step) * 100) / 100);
      valueRef.current = next;
      onChange(next);
    },
    [clamp, onChange, step],
  );

  const stopHold = useCallback(() => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
  }, []);

  // long-press to accelerate
  const startHold = useCallback(
    (dir: 1 | -1) => {
      stopHold();
      holdTimer.current = setInterval(() => bump(dir), 120);
    },
    [bump, stopHold],
  );

  // Guarantee the repeat timer is cleared if the stepper unmounts mid-press.
  useEffect(() => stopHold, [stopHold]);

  const btn =
    "flex h-11 w-11 items-center justify-center border border-ink/35 bg-paper text-lg text-ink active:border-ink select-none";

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="label-caps text-[10px] font-semibold text-ink/55">
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
