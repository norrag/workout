import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /exercises skeleton (N1): title + NEW button, search input, the two filter
 * axes (muscle / equipment chips), then the exercise list rows.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading exercises">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-20" />
      </div>
      <Skeleton className="mt-4 h-[46px] w-full" />
      <div className="mt-2.5 flex items-center gap-2">
        <Skeleton className="h-3 w-[52px]" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-3 w-[52px]" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="mt-4 space-y-5 border-t border-ink/15 pt-4">
        {Array.from({ length: 7 }).map((_, r) => (
          <div key={r} className="flex items-center justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-2.5 w-52" />
            </div>
            <Skeleton className="h-4 w-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
