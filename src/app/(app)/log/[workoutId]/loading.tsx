import { DayViewSkeleton } from "@/components/ui/DayViewSkeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-3 h-3 w-20" />
      <DayViewSkeleton />
    </div>
  );
}
