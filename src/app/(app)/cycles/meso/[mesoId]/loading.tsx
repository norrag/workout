import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /cycles/meso/[mesoId] skeleton (N1): the sticky header block (back link,
 * title + icon buttons, meta line + badge, progress hairline), then the
 * Overview panel — tab strip, day tabs, caption, and exercise rows.
 * Also the fallback for child segments without their own loading file
 * (e.g. /stats, which redirects into the toggle).
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading mesocycle">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Skeleton className="h-7 w-44" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-7" />
          <Skeleton className="h-7 w-7" />
          <Skeleton className="h-7 w-7" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="mt-2 h-[3px] w-full" />
      <Skeleton className="mt-4 h-9 w-full" />
      <Skeleton className="mt-4 h-10 w-full" />
      <Skeleton className="mt-2 h-2.5 w-48" />
      <div className="mt-3 space-y-4">
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex items-center gap-3">
            <Skeleton className="h-[22px] w-[22px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2.5 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
