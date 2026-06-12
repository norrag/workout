"use client";

import { useCallback, useRef } from "react";

/**
 * Snap-to-stop slider (08, fig 1.4): hairline track with tick stops, ink
 * fill up to the value, rectangular orange thumb (current position).
 * No numbers shown — endpoints carry the meaning.
 */
export function SnapSlider({
  value,
  onChange,
  max = 10,
  label,
  leftLabel,
  rightLabel,
  centerLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  /** accessible name for the slider */
  label: string;
  leftLabel: string;
  rightLabel: string;
  centerLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const snapFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const next = Math.round(Math.min(1, Math.max(0, ratio)) * max);
      if (next !== value) onChange(next);
    },
    [max, onChange, value],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = max;
    if (next !== null) {
      e.preventDefault();
      onChange(Math.min(max, Math.max(0, next)));
    }
  };

  const pct = (value / max) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          snapFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) snapFromPointer(e.clientX);
        }}
        className="relative h-11 cursor-pointer touch-none select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink"
      >
        {/* track + fill */}
        <div className="absolute inset-x-0 top-[21px] h-0.5 bg-ink/20" />
        <div
          className="absolute left-0 top-[21px] h-0.5 bg-ink"
          style={{ width: `${pct}%` }}
        />
        {/* tick stops */}
        <div className="absolute inset-x-0 top-[17px] flex h-2.5 justify-between">
          {Array.from({ length: max + 1 }, (_, i) => (
            <div key={i} className="w-px bg-ink/40" />
          ))}
        </div>
        {/* thumb — current position, the orange concern of this control */}
        <div
          className="absolute top-[8px] h-7 w-5 -translate-x-1/2 bg-accent"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="label-caps flex justify-between text-[9px] font-semibold text-ink/55">
        <span>{leftLabel}</span>
        {centerLabel && <span className="font-bold text-ink">{centerLabel}</span>}
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
