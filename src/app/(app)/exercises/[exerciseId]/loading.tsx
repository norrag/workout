import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /exercises/[exerciseId] skeleton (N1): back link + settings button, title +
 * badge, meta line, OVERVIEW|HISTORY tabs, last-performed row, best-set grid,
 * e1RM bars, and the three-stat strip.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading exercise">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-7" />
      </div>
      <div className="mt-3 flex items-start justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="mt-2 h-3 w-52" />
      <Skeleton className="mt-4 h-9 w-full" />
      <Skeleton className="mt-3.5 h-8 w-full" />
      <Skeleton className="mt-4 h-3 w-28" />
      <div className="mt-2.5 grid grid-cols-2 gap-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full" />
        ))}
      </div>
      <Skeleton className="mt-[18px] h-3 w-48" />
      <Skeleton className="mt-2.5 h-[72px] w-full" />
      <div className="mt-[18px] flex gap-px">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 flex-1" />
        ))}
      </div>
    </div>
  );
}
