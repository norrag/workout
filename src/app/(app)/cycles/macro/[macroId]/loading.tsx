import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /cycles/macro/[macroId] skeleton (N1): the sticky header block (brand row,
 * title + ⋮ button, meta line + status badge — the N24 shared header), the
 * three-way tab strip, then the Overview panel's timeline rows and the 2×2
 * stat grid.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading macrocycle">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-7 w-7" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="mt-4 h-9 w-full" />
      <Skeleton className="mt-4 h-3 w-36" />
      <div className="mt-3 space-y-3">
        {Array.from({ length: 4 }).map((_, r) => (
          <div key={r} className="flex items-center gap-[11px]">
            <Skeleton className="h-[22px] w-[22px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-40" />
            </div>
            <Skeleton className="h-1.5 w-[46px]" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-3 w-40" />
      <div className="mt-2.5 grid grid-cols-2 gap-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
