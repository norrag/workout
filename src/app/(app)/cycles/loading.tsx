import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /cycles skeleton (N1): title row with the NEW CYCLE button, then two macro
 * groups — name/date line, goal line, and indented meso rows — mirroring the
 * real list's rhythm so the swap to live data doesn't shift the page.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading cycles">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="mt-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="mt-2 h-3 w-48" />
          <div className="ml-1 mt-3 space-y-3 pl-3.5">
            {Array.from({ length: 3 }).map((_, r) => (
              <div key={r} className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-2.5 w-44" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
