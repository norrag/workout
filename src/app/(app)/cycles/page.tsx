import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import {
  listMacrocycles,
  listMesocyclesByMacro,
} from "@/lib/queries/cycles";
import { NewMacrocycleForm } from "./NewMacrocycleForm";

export default async function CyclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const macrocycles = await listMacrocycles(supabase);
  const mesocycles = await listMesocyclesByMacro(
    supabase,
    macrocycles.map((m) => m.id),
  );

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
        macrocycles.map((macro) => {
          const mesos = mesocycles.filter(
            (m) => m.macrocycle_id === macro.id,
          );
          return (
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

              {mesos.length > 0 && (
                <ul className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
                  {mesos.map((meso) => (
                    <li key={meso.id}>
                      <Link
                        href={`/cycles/meso/${meso.id}`}
                        className="flex min-h-11 items-center justify-between gap-2 py-2"
                      >
                        <span
                          className={`text-sm ${meso.status === "active" ? "text-accent" : ""}`}
                        >
                          {meso.name}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="numeral text-xs text-text-secondary">
                            {meso.weeks} wk · {meso.days_per_week} d · RIR{" "}
                            {meso.rir_start}–{meso.rir_end}
                          </span>
                          <span className="label-caps text-[10px] text-text-secondary">
                            {meso.status}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {macro.status === "active" && (
                <Link
                  href={`/cycles/${macro.id}/new-meso`}
                  className="label-caps mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-[6px] border border-border-subtle bg-bg-raised px-4 text-sm font-semibold"
                >
                  Plan mesocycle
                </Link>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
