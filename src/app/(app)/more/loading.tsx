import { Skeleton } from "@/components/ui/Skeleton";

/**
 * /more skeleton (N1): logotype, title, profile card, SETTINGS rows, sign-out
 * button, version line.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-4 h-[104px] w-full" />
      <Skeleton className="mt-6 h-4 w-24" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: 3 }).map((_, r) => (
          <div key={r} className="flex items-center justify-between py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-6 h-2.5 w-40" />
    </div>
  );
}
