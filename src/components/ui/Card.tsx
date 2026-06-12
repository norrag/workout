import type { ReactNode } from "react";

/**
 * Ruled section — the ledger system builds structure from rules, not
 * boxes: a tracked all-caps header over a 1.5px ink rule, content below.
 */
export function Card({
  header,
  children,
  className = "",
}: {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {header !== undefined && (
        <h2 className="label-caps border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
          {header}
        </h2>
      )}
      <div className={header !== undefined ? "pt-3" : ""}>{children}</div>
    </section>
  );
}
