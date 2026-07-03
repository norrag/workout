import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /cycles/meso/[mesoId]/plan skeleton (N1): the planner board — back/close
 * row, title, meta, macro-context strip, day tabs, day caption row, exercise
 * rows with an open slot, and the primary action at the bottom.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading planner">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-4" />
      </div>
      <Skeleton className="mt-2.5 h-7 w-36" />
      <Skeleton className="mt-1 h-3 w-44" />
      <Skeleton className="mt-3 h-9 w-full" />
      <Skeleton className="mt-4 h-10 w-full" />
      <div className="mt-2 flex items-center justify-between">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-2.5 w-20" />
      </div>
      <div className="mt-3 space-y-4">
        {Array.from({ length: 4 }).map((_, r) => (
          <div key={r} className="flex items-center gap-3">
            <Skeleton className="h-[22px] w-[22px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </div>
        ))}
        <Skeleton className="h-12 w-full" />
      </div>
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-3 h-[52px] w-full" />
    </div>
  );
}
