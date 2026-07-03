import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /templates skeleton (N1): title + NEW TEMPLATE button, search input, filter
 * chips, then the template cards.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading templates">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="mt-4 h-[46px] w-full" />
      <div className="mt-2.5 flex gap-1.5">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex items-center justify-between border-t border-ink/15 py-[15px]">
            <div>
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="mt-1.5 h-5 w-44" />
              <div className="mt-2 flex gap-1.5">
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-6 w-14" />
              </div>
            </div>
            <Skeleton className="h-4 w-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
