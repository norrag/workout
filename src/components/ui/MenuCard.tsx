import type { ReactNode } from "react";

/**
 * Menu card (figs 1.2/1.3): the single permitted shadow in the system —
 * a hard offset block behind a 1.5px ink frame.
 */
export function MenuCard({
  header,
  children,
  className = "",
}: {
  header?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border-[1.5px] border-ink bg-bg-base shadow-menu ${className}`}>
      {header && (
        <div className="label-caps border-b border-ink/25 px-4 pb-2 pt-3 text-[9.5px] font-semibold tracking-[0.16em] text-ink/55">
          {header}
        </div>
      )}
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  trailing,
  destructive = false,
  onClick,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  /** destructive rows carry the accent — the only red-adjacent state we have */
  destructive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between border-b border-ink/10 px-4 py-3 text-left text-sm last:border-b-0 ${
        destructive ? "font-bold text-accent" : "font-semibold text-ink"
      }`}
    >
      <span>{children}</span>
      {trailing && (
        <span className="label-caps text-[10px] font-semibold text-ink/50">
          {trailing}
        </span>
      )}
    </button>
  );
}
