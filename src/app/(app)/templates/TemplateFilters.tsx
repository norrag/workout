"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DAYS = ["2", "3", "4", "5", "6", "7"];
const SPLITS: { value: string; label: string }[] = [
  { value: "full_body", label: "Full body" },
  { value: "upper_lower", label: "Upper / lower" },
  { value: "push_pull_legs", label: "Push pull legs" },
  { value: "upper", label: "Upper" },
  { value: "lower", label: "Lower" },
  { value: "arms", label: "Arms" },
  { value: "legs", label: "Legs" },
  { value: "other", label: "Other" },
];
const GENDERS: { value: string; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const selectClass =
  "h-[38px] w-full appearance-none border-[1.5px] border-ink/35 bg-bg-base px-2.5 text-[12px] font-semibold text-ink focus:border-ink focus:outline-none";

/** Templates filter bar (fig 3.3): days/week, split, intended audience. Updates
 *  the URL query so the server page re-queries. */
export function TemplateFilters({
  days,
  emphasis,
  gender,
}: {
  days?: string;
  emphasis?: string;
  gender?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2">
      <label className="block">
        <span className="text-[8.5px] font-bold tracking-[0.12em] text-ink/45">
          DAYS / WK
        </span>
        <select
          value={days ?? ""}
          onChange={(e) => setParam("days", e.target.value)}
          className={`${selectClass} mt-1`}
        >
          <option value="">Any</option>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[8.5px] font-bold tracking-[0.12em] text-ink/45">
          SPLIT
        </span>
        <select
          value={emphasis ?? ""}
          onChange={(e) => setParam("emphasis", e.target.value)}
          className={`${selectClass} mt-1`}
        >
          <option value="">Any</option>
          {SPLITS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[8.5px] font-bold tracking-[0.12em] text-ink/45">
          FOR
        </span>
        <select
          value={gender ?? ""}
          onChange={(e) => setParam("gender", e.target.value)}
          className={`${selectClass} mt-1`}
        >
          <option value="">Anyone</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
