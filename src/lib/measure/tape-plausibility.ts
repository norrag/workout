import {
  tapeReadingSchema,
  toInches,
  type TapeSession,
  type TapeSiteKey,
  type TapeUnit,
} from "./tape";

/** Entry-error heuristics, not clinical reference intervals or growth limits. */
export const TAPE_ENTRY_RANGES_IN: Record<
  TapeSiteKey,
  readonly [number, number]
> = {
  chest: [20, 80],
  waist_navel: [18, 90],
  hips: [20, 90],
  upper_arm_left: [5, 30],
  upper_arm_right: [5, 30],
  forearm_left: [4, 24],
  forearm_right: [4, 24],
  neck: [8, 30],
  thigh_left: [10, 50],
  thigh_right: [10, 50],
  calf_left: [6, 35],
  calf_right: [6, 35],
};

/** Decimal entry only; never interpret hexadecimal or exponent text as tape. */
export function parseTapeNumber(text: string): number {
  const value = text.trim();
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : NaN;
}

export function validTapeEntry(
  text: string,
  site: TapeSiteKey,
  unit: TapeUnit,
): boolean {
  return tapeReadingSchema.safeParse({
    site_key: site,
    value_in: toInches(parseTapeNumber(text), unit),
  }).success;
}

export type TapeEntryWarning = {
  siteKey: TapeSiteKey;
  valueIn: number;
  rangeIn: readonly [number, number];
  previous: { date: string; valueIn: number } | null;
  reasons: ("range" | "change")[];
};

/** Same site/side, latest strictly earlier date. Missing readings stay missing. */
export function tapeEntryWarnings(
  session: TapeSession,
  history: TapeSession[],
): TapeEntryWarning[] {
  const earlier = history
    .filter((s) => s.id !== session.id && s.measured_on < session.measured_on)
    .sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  return session.readings.flatMap((reading) => {
    const rangeIn = TAPE_ENTRY_RANGES_IN[reading.site_key];
    const previousSession = earlier.find((s) =>
      s.readings.some((r) => r.site_key === reading.site_key),
    );
    const previousReading = previousSession?.readings.find(
      (r) => r.site_key === reading.site_key,
    );
    const previous =
      previousReading && previousSession
        ? {
            date: previousSession.measured_on,
            valueIn: previousReading.value_in,
          }
        : null;
    const reasons: TapeEntryWarning["reasons"] = [];
    if (reading.value_in < rangeIn[0] || reading.value_in > rangeIn[1])
      reasons.push("range");
    // Require both a substantial absolute and relative difference. No rate or
    // biological inference is made; the user can always confirm the value.
    if (
      previous &&
      Math.abs(reading.value_in - previous.valueIn) >
        Math.max(2, previous.valueIn * 0.2)
    )
      reasons.push("change");
    return reasons.length
      ? [
          {
            siteKey: reading.site_key,
            valueIn: reading.value_in,
            rangeIn,
            previous,
            reasons,
          },
        ]
      : [];
  });
}
