const KNOWN = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "forearms",
  "traps",
] as const;

/**
 * Categorical muscle-group label (docs/08-ui-design-corpus.md): three short
 * bars in the group's color + all-caps name. A label, never a button.
 */
export function MuscleChip({ name }: { name: string | null }) {
  const slug = name?.toLowerCase() ?? "";
  const color = (KNOWN as readonly string[]).includes(slug)
    ? `var(--color-mg-${slug})`
    : "var(--color-text-secondary)";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="flex items-end gap-[2px]">
        {[5, 8, 11].map((h) => (
          <span
            key={h}
            className="w-[3px] rounded-[1px]"
            style={{ height: h, backgroundColor: color }}
          />
        ))}
      </span>
      <span
        className="label-caps text-[10px] font-semibold"
        style={{ color }}
      >
        {name ?? "—"}
      </span>
    </span>
  );
}
