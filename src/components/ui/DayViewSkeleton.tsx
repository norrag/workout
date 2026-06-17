import { Skeleton } from "@/components/ui/Skeleton";

/**
 * DayViewSkeleton — the loading placeholder for the Workout tab and any deep
 * /log day view (fig 1.1). Mirrors the real layout's rhythm: title, week track,
 * context caption, then exercise blocks each with a header and the
 * LB/REPS/LOG set grid, so the swap to live data doesn't shift the page.
 */
export function DayViewSkeleton() {
  return (
    <div role="status" aria-label="Loading workout">
      <Skeleton className="mb-4 h-3 w-24" />
      <Skeleton className="mb-3 h-8 w-48" />
      {/* week track */}
      <div className="mb-3 flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 flex-1" />
        ))}
      </div>
      <Skeleton className="mb-6 h-3 w-40" />
      {/* exercise blocks */}
      {Array.from({ length: 3 }).map((_, b) => (
        <div key={b} className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, r) => (
              <div
                key={r}
                className="grid grid-cols-[20px_1fr_1fr_44px] items-center gap-2.5"
              >
                <Skeleton className="h-4 w-3 justify-self-center" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-[21px] w-[21px] justify-self-center" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
