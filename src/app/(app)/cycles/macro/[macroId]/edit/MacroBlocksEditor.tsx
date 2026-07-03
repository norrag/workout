"use client";

import { useState, useTransition } from "react";
import { manageMacroSlotsAction } from "../../../actions";

export interface BlockRow {
  id: string;
  name: string;
  status: string;
  position: number | null;
  phase: string | null;
}

/**
 * I12 — direct block management on the macro edit page: reorder future
 * blocks (▲▼), remove unplanned placeholders (✕), append a new placeholder.
 * History is structurally safe: completed/active blocks render without
 * controls, a ▲/▼ never crosses one, and remove only exists on placeholders
 * (the server refuses anything else regardless). Changes apply immediately —
 * they are not staged with the form above.
 */
export function MacroBlocksEditor({
  macroId,
  blocks,
}: {
  macroId: string;
  blocks: BlockRow[];
}) {
  const [pending, startOp] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (op: Parameters<typeof manageMacroSlotsAction>[0]["op"]) => {
    setError(null);
    startOp(async () => {
      const result = await manageMacroSlotsAction({ macro_id: macroId, op });
      if (result?.error) setError(result.error);
    });
  };

  // only not-yet-started blocks may move; a swap must not cross a locked row
  const movable = (b: BlockRow) =>
    b.status === "planned" || b.status === "unplanned";
  const swap = (i: number, j: number) => {
    const ordered = blocks.map((b) => b.id);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    run({ action: "reorder", ordered_ids: ordered });
  };

  const badge = (status: string) =>
    status === "active"
      ? "CURRENT"
      : status === "completed"
        ? "DONE"
        : status === "unplanned"
          ? "OPEN SLOT"
          : status.toUpperCase();

  const arrowBtn =
    "flex h-7 w-7 items-center justify-center border border-ink/35 text-[10px] leading-none disabled:opacity-25";

  return (
    <div className="mt-2 border-t-[1.5px] border-ink pt-5">
      <div className="text-[10px] font-semibold tracking-[0.14em] text-ink/55">
        BLOCKS — REORDER · ADD · REMOVE
      </div>
      <p className="mt-1.5 text-[10px] leading-normal text-ink/50">
        Applies immediately. Started and completed blocks are fixed; only open
        slots can be removed.
      </p>

      <div className={`mt-3 border-t border-ink/15 ${pending ? "opacity-50" : ""}`}>
        {blocks.map((b, i) => {
          const canUp = i > 0 && movable(b) && movable(blocks[i - 1]);
          const canDown =
            i < blocks.length - 1 && movable(b) && movable(blocks[i + 1]);
          return (
            <div
              key={b.id}
              className="flex items-center gap-2.5 border-b border-ink/15 py-2.5"
            >
              <span className="numeral w-7 shrink-0 text-[11px] font-bold text-ink/45">
                M{b.position ?? i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[13px] font-semibold ${
                    movable(b) ? "" : "text-ink/45"
                  } ${b.status === "unplanned" ? "text-ink/55" : ""}`}
                >
                  {b.name}
                </span>
                <span className="label-caps block text-[8.5px] font-medium tracking-[0.12em] text-ink/45">
                  {badge(b.status)}
                  {b.phase ? ` · ${b.phase}` : ""}
                </span>
              </span>
              {movable(b) && (
                <span className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    aria-label={`move ${b.name} up`}
                    disabled={pending || !canUp}
                    onClick={() => swap(i, i - 1)}
                    className={arrowBtn}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`move ${b.name} down`}
                    disabled={pending || !canDown}
                    onClick={() => swap(i, i + 1)}
                    className={arrowBtn}
                  >
                    ▼
                  </button>
                  {b.status === "unplanned" && (
                    <button
                      type="button"
                      aria-label={`remove ${b.name}`}
                      disabled={pending}
                      onClick={() =>
                        run({ action: "remove", mesocycle_id: b.id })
                      }
                      className={arrowBtn}
                    >
                      ✕
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => run({ action: "add" })}
        className="mt-3 w-full border-[1.5px] border-dashed border-ink/45 py-[11px] text-center text-[10px] font-bold tracking-[0.12em] text-ink/70 disabled:opacity-40"
      >
        + ADD BLOCK
      </button>

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
    </div>
  );
}
