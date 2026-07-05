"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar, type FilterAxis } from "@/components/ui/FilterBar";

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

const FILTER_KEYS = ["days", "emphasis", "gender"] as const;

/**
 * Template search + filters (figs 3.3 / 2.4): the shared FilterBar chip
 * grammar (N29) driven by URL params so the server page re-queries. Used by
 * the Templates tab and the plan-a-meso template picker — one panel, one
 * filter vocabulary. The search form is a plain GET submit that preserves the
 * active chips via hidden inputs.
 */
export function TemplateFilterPanel({
  q,
  days,
  emphasis,
  gender,
  count,
}: {
  q?: string;
  days?: string;
  emphasis?: string;
  gender?: string;
  count: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const replaceWith = (next: URLSearchParams) => {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    replaceWith(next);
  };

  const clearAll = () => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((k) => next.delete(k));
    replaceWith(next);
  };

  const axes: FilterAxis[] = [
    {
      key: "days",
      label: "DAYS",
      options: DAYS.map((d) => ({ value: d, label: d })),
      value: days ?? null,
    },
    {
      key: "emphasis",
      label: "SPLIT",
      options: SPLITS,
      value: emphasis ?? null,
    },
    {
      key: "gender",
      label: "FOR",
      options: GENDERS,
      value: gender ?? null,
      allLabel: "ANYONE",
    },
  ];

  return (
    <>
      <form method="get">
        {/* keep active filters when submitting a search */}
        {days && <input type="hidden" name="days" value={days} />}
        {emphasis && <input type="hidden" name="emphasis" value={emphasis} />}
        {gender && <input type="hidden" name="gender" value={gender} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search"
          className="mt-4 h-[46px] w-full border-[1.5px] border-ink bg-paper px-3.5 text-sm text-ink placeholder:text-ink/45 focus:outline-none"
        />
      </form>
      <FilterBar
        className="mt-2.5"
        axes={axes}
        onChange={setParam}
        onClearAll={clearAll}
        summary={{ visible: count, noun: "TEMPLATES" }}
      />
    </>
  );
}
