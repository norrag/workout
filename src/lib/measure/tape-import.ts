import { z } from "zod";
import {
  TAPE_SITES,
  tapeSessionSchema,
  toInches,
  todayAtOffset,
  type TapeSession,
} from "./tape";
import { tapeEntryWarnings } from "./tape-plausibility";

export const measurementImportArgs = z
  .object({
    sessions: z
      .array(
        z
          .object({
            date: z.iso.date().refine((v) => v >= "1900-01-01"),
            unit: z.enum(["in", "cm"]),
            note: z.string().trim().max(500).default(""),
            readings: z
              .array(
                z
                  .object({
                    site_key: z.enum(TAPE_SITES.map((s) => s.key)),
                    value: z.number().finite().positive().max(381),
                  })
                  .strict(),
              )
              .min(1)
              .max(12),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    utc_offset_minutes: z
      .number()
      .int()
      .min(-840)
      .max(840)
      .default(0)
      .describe("Local UTC offset in minutes, e.g. -360 for UTC-06:00."),
    commit: z.boolean().default(false),
    confirm_unusual_values: z.boolean().default(false),
  })
  .strict()
  .superRefine((args, ctx) => {
    if (new Set(args.sessions.map((s) => s.date)).size !== args.sessions.length)
      ctx.addIssue({
        code: "custom",
        path: ["sessions"],
        message: "Combine readings for each date into one session.",
      });
  });

export function normalizeMeasurementImport(
  input: z.input<typeof measurementImportArgs>,
  now = new Date(),
) {
  const args = measurementImportArgs.parse(input);
  // todayAtOffset uses JavaScript's opposite-sign timezone-offset convention.
  const today = todayAtOffset(now, -args.utc_offset_minutes);
  const sessions = args.sessions
    .map((s) => {
      if (s.date > today)
        throw new Error("Measurement dates cannot be in the future.");
      return tapeSessionSchema.parse({
        id: "00000000-0000-4000-8000-000000000000", // only a validation placeholder; DB assigns identity
        measured_on: s.date,
        input_unit: s.unit,
        note: s.note,
        readings: s.readings.map((r) => ({
          site_key: r.site_key,
          value_in: toInches(r.value, s.unit),
        })),
      });
    })
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  return { args, sessions };
}

export function previewMeasurementImport(
  sessions: TapeSession[],
  history: TapeSession[],
) {
  const warnings = sessions.flatMap((s) =>
    tapeEntryWarnings({ ...s, id: `import-${s.measured_on}` }, [
      ...history.filter(
        (h) => !sessions.some((v) => v.measured_on === h.measured_on),
      ),
      ...sessions.map((v) => ({ ...v, id: `import-${v.measured_on}` })),
    ]).map((w) => ({ date: s.measured_on, ...w })),
  );
  return { warnings, warning_units: "in" as const };
}
