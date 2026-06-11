import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { listMacrocycles } from "@/lib/queries/cycles";
import { NewMacrocycleForm } from "./NewMacrocycleForm";

export default async function CyclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const macrocycles = await listMacrocycles(supabase);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="label-caps text-lg font-bold">Cycles</h1>

      {macrocycles.length === 0 ? (
        <Card header="New macrocycle">
          <p className="mb-4 text-sm text-text-secondary">
            The macrocycle sets your long-term direction: cut, gain, or
            maintain. Mesocycles inside it do the work.
          </p>
          <NewMacrocycleForm />
        </Card>
      ) : (
        macrocycles.map((macro) => (
          <Card key={macro.id} header={macro.status}>
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">{macro.name}</p>
              <p className="label-caps text-xs text-text-secondary">
                {macro.goal_type}
              </p>
            </div>
            <p className="numeral mt-1 text-sm text-text-secondary">
              {macro.start_date}
              {macro.target_end_date ? ` — ${macro.target_end_date}` : ""}
            </p>
            <p className="mt-3 text-sm text-text-secondary">
              Mesocycle planning lands in the next phase.
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
