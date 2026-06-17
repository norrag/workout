import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Default loading boundary for the app tabs — paints instantly on navigation
 * (paired with BottomNav prefetch) so a tapped tab acknowledges before its RSC
 * data resolves. Heavy day-view routes override this with DayViewSkeleton.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-3 h-8 w-44" />
      <Skeleton className="mb-6 h-3 w-56" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
