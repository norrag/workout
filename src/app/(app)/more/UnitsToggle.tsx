"use client";

import { useTransition } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { setUnits } from "./actions";

export function UnitsToggle({ units }: { units: "lb" | "kg" }) {
  const [, startTransition] = useTransition();
  return (
    <SegmentedControl
      options={[
        { value: "lb", label: "LB" },
        { value: "kg", label: "KG" },
      ]}
      value={units}
      onChange={(next) => startTransition(() => setUnits(next))}
      className="w-32"
    />
  );
}
