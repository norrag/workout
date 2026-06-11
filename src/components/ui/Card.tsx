import type { ReactNode } from "react";

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
    <section
      className={`surface-gradient rounded-[8px] border border-border-subtle bg-bg-surface p-4 ${className}`}
    >
      {header !== undefined && (
        <h2 className="label-caps mb-3 text-xs font-semibold text-text-secondary">
          {header}
        </h2>
      )}
      {children}
    </section>
  );
}
