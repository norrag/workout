import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Planned-day preview skeleton (N1): back link, W·D title, day/RIR line, the
 * not-planned-yet banner slot, counts caption, then the exercise rows.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading planned day">
      <Skeleton className="mb-3 h-3 w-32" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="mt-2 h-3 w-48" />
      <Skeleton className="mt-4 h-[76px] w-full" />
      <Skeleton className="mt-3 h-2.5 w-40" />
      <div className="mt-3 space-y-4">
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex items-center gap-3">
            <Skeleton className="h-[22px] w-[22px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <Skeleton className="h-2.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
