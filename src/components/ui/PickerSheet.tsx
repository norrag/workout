"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MuscleChip } from "./MuscleChip";

export interface PickerItem {
  id: string;
  name: string;
  /** secondary line, e.g. equipment type */
  detail: string | null;
  /** primary muscle group, drives the categorical chip and filters */
  muscle: string | null;
}

/**
 * Full-height picker for 9+ options (docs/08-ui-design-corpus.md): search
 * field, muscle filter chips, tap = pick + dismiss.
 */
export function PickerSheet({
  title,
  items,
  onPick,
  onClose,
}: {
  title: string;
  items: PickerItem[];
  onPick: (item: PickerItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const muscles = useMemo(
    () =>
      [...new Set(items.map((i) => i.muscle).filter((m): m is string => !!m))].sort(),
    [items],
  );

  const visible = items.filter(
    (i) =>
      (!muscle || i.muscle === muscle) &&
      (!search || i.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-bg-base"
    >
      <div className="flex items-center justify-between border-b border-border-subtle p-4">
        <h2 className="label-caps text-sm font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="label-caps min-h-11 px-2 text-xs font-semibold text-text-secondary"
        >
          Close
        </button>
      </div>

      <div className="flex flex-col gap-3 p-4 pb-2">
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="min-h-11 w-full rounded-[6px] border border-border-subtle bg-bg-raised px-3 text-base placeholder:text-text-secondary/60 focus:border-accent focus:outline-none"
        />
        {muscles.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {muscles.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={muscle === m}
                onClick={() => setMuscle(muscle === m ? null : m)}
                className={`label-caps min-h-9 shrink-0 rounded-[6px] border px-2.5 text-[10px] font-semibold ${
                  muscle === m
                    ? "border-accent text-accent"
                    : "border-border-subtle text-text-secondary"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto px-4 pb-8">
        {visible.length === 0 && (
          <li className="py-6 text-center text-sm text-text-secondary">
            No matches.
          </li>
        )}
        {visible.map((item) => (
          <li key={item.id} className="border-b border-border-subtle">
            <button
              type="button"
              onClick={() => onPick(item)}
              className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
            >
              <span>
                <span className="block text-sm">{item.name}</span>
                {item.detail && (
                  <span className="block text-xs text-text-secondary">
                    {item.detail}
                  </span>
                )}
              </span>
              <MuscleChip name={item.muscle} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
