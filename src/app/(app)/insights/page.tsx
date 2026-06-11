import { Card } from "@/components/ui/Card";

export default function InsightsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="label-caps text-lg font-bold">Insights</h1>
      <Card>
        <p className="text-sm text-text-secondary">
          Exercise history, muscle-group volume, and meso summaries appear here
          once you have logged training. Charts land with Phase 6.
        </p>
      </Card>
    </div>
  );
}
