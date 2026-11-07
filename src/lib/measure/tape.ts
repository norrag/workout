import { z } from "zod";

/** Doc 24: raw tape facts only. No link to prescription or profile inputs. */
export const TAPE_SITES = [
  {
    key: "chest",
    label: "Chest",
    group: "Chest",
    guidance: "Around the fullest part, after a normal breath out.",
    optional: false,
  },
  {
    key: "waist_navel",
    label: "Waist · navel",
    group: "Waist · navel",
    guidance:
      "Level with your navel, abdomen relaxed. Keep this landmark each time.",
    optional: false,
  },
  {
    key: "upper_arm_left",
    label: "Upper arm · left",
    group: "Upper arms · relaxed",
    side: "left",
    guidance: "Midpoint between shoulder and elbow, arms hanging relaxed.",
    optional: false,
  },
  {
    key: "upper_arm_right",
    label: "Upper arm · right",
    group: "Upper arms · relaxed",
    side: "right",
    guidance: "Midpoint between shoulder and elbow, arms hanging relaxed.",
    optional: false,
  },
  {
    key: "thigh_left",
    label: "Thigh · left",
    group: "Thighs · relaxed",
    side: "left",
    guidance:
      "Halfway between hip crease and top of kneecap. Measure standing.",
    optional: false,
  },
  {
    key: "thigh_right",
    label: "Thigh · right",
    group: "Thighs · relaxed",
    side: "right",
    guidance:
      "Halfway between hip crease and top of kneecap. Measure standing.",
    optional: false,
  },
  {
    key: "hips",
    label: "Hips",
    group: "Hips",
    guidance:
      "Around the fullest part of your hips and buttocks, feet together.",
    optional: true,
  },
  {
    key: "calf_left",
    label: "Calf · left",
    group: "Calves",
    side: "left",
    guidance: "Around the widest part, standing with weight even on both feet.",
    optional: true,
  },
  {
    key: "calf_right",
    label: "Calf · right",
    group: "Calves",
    side: "right",
    guidance: "Around the widest part, standing with weight even on both feet.",
    optional: true,
  },
  {
    key: "neck",
    label: "Neck",
    group: "Neck",
    guidance: "Just below the Adam's apple, looking straight ahead.",
    optional: true,
  },
  {
    key: "forearm_left",
    label: "Forearm · left",
    group: "Forearms",
    side: "left",
    guidance: "Around the widest part, arm relaxed and palm facing forward.",
    optional: true,
  },
  {
    key: "forearm_right",
    label: "Forearm · right",
    group: "Forearms",
    side: "right",
    guidance: "Around the widest part, arm relaxed and palm facing forward.",
    optional: true,
  },
] as const;

export type TapeSiteKey = (typeof TAPE_SITES)[number]["key"];
export type TapeUnit = "in" | "cm";
export type TapeReading = { site_key: TapeSiteKey; value_in: number };
export type TapeSession = {
  id: string;
  measured_on: string;
  input_unit: TapeUnit;
  note: string;
  readings: TapeReading[];
};

const siteKeySchema = z.enum(TAPE_SITES.map((s) => s.key));
export const tapeReadingSchema = z
  .object({
    site_key: siteKeySchema,
    value_in: z
      .number()
      .finite()
      .positive("Measurements must be above zero.")
      .max(150, "Check the measurement and unit."),
  })
  .strict();
export const tapeSessionSchema = z
  .object({
    id: z.uuid(),
    measured_on: z.iso
      .date()
      .refine((v) => v >= "1900-01-01", "Enter a date from 1900 onward."),
    input_unit: z.enum(["in", "cm"]),
    note: z.string().trim().max(500, "Keep the note under 500 characters."),
    readings: z
      .array(tapeReadingSchema)
      .min(1, "Enter at least one measurement.")
      .max(TAPE_SITES.length)
      .refine(
        (rows) => new Set(rows.map((r) => r.site_key)).size === rows.length,
        "Each site can be recorded once.",
      ),
  })
  .strict();

export function fromInches(value: number, unit: TapeUnit): number {
  return unit === "cm" ? value * 2.54 : value;
}
export function toInches(value: number, unit: TapeUnit): number {
  return Math.round((unit === "cm" ? value / 2.54 : value) * 10000) / 10000;
}
export function tapeValue(valueIn: number, unit: TapeUnit): string {
  return fromInches(valueIn, unit).toFixed(2);
}
export function tapeDelta(deltaIn: number, unit: TapeUnit): string {
  const rounded = Number(tapeValue(deltaIn, unit));
  return `${rounded > 0 ? "+" : ""}${Object.is(rounded, -0) ? "0.00" : rounded.toFixed(2)}`;
}
export function daySpan(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}
/** Client offset is bounded; allows the device's day without trusting its clock. */
export function todayAtOffset(now: Date, offsetMinutes: number): string {
  return new Date(now.getTime() - offsetMinutes * 60000)
    .toISOString()
    .slice(0, 10);
}
export function nextMonthlyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
/** Chronological, same-site-and-side only; never carry missing readings forward. */
export function siteHistory(sessions: TapeSession[], key: TapeSiteKey) {
  return sessions
    .flatMap((s) => {
      const r = s.readings.find((v) => v.site_key === key);
      return r
        ? [{ sessionId: s.id, date: s.measured_on, valueIn: r.value_in }]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function compareTapeSessions(
  latest: TapeSession,
  baseline: TapeSession | undefined,
) {
  return latest.readings.map((r) => {
    const previous = baseline?.readings.find((p) => p.site_key === r.site_key);
    return { ...r, deltaIn: previous ? r.value_in - previous.value_in : null };
  });
}
