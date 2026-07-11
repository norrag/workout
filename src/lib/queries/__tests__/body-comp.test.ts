/**
 * doc 17 §6 5b (N34) — the DEXA folds: the scan-bracketing composition
 * change with its LSC guardrails, the same-machine mass-verdict fallback,
 * and the consented profile-update proposal rule. The view + Supabase I/O
 * (v_body_comp_history deltas, cross-user RLS) live in tests/rls/rls.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  BF_PCT_NOISE_BAND,
  FAT_LSC_LB,
  LEAN_LSC_LB,
  dexaBodyDataForSpan,
  scanCompForSpan,
  scanProfileProposal,
  type ScanCompPoint,
} from "../body-comp";
import { macroRetrospective } from "../macro-retrospective";

const scan = (
  scanned_at: string,
  values: Partial<Omit<ScanCompPoint, "scanned_at">> = {},
): ScanCompPoint => ({
  scanned_at,
  scanner_model: "GE Lunar iDXA",
  weight_lb: 184,
  body_fat_pct: 25,
  lean_mass_lb: 132,
  fat_mass_lb: 45,
  ...values,
});

const spanStart = "2026-03-01T18:00:00Z";
const spanEnd = "2026-06-28T18:00:00Z";

describe("scanCompForSpan — the bracketing composition fold", () => {
  it("two same-machine scans at the endpoints measure the change", () => {
    const comp = scanCompForSpan(
      [
        scan("2026-03-02T10:00:00Z"),
        scan("2026-06-27T10:00:00Z", {
          lean_mass_lb: 134.6,
          fat_mass_lb: 44.6,
          weight_lb: 186.1,
          body_fat_pct: 24.4,
        }),
      ],
      spanStart,
      spanEnd,
    );
    expect(comp).not.toBeNull();
    expect(comp!.sameScanner).toBe(true);
    expect(comp!.deltaLeanLb).toBe(2.6);
    expect(comp!.deltaFatLb).toBe(-0.4);
    expect(comp!.deltaWeightLb).toBe(2.1);
    expect(comp!.deltaBodyFatPct).toBe(-0.6);
    // 2.6 clears the ~2 lb lean LSC; 0.4 does not (doc 15 §6.1)
    expect(comp!.leanWithinNoise).toBe(false);
    expect(comp!.fatWithinNoise).toBe(true);
  });

  it("returns null when a scan sits outside the ±14-day tolerance of an endpoint", () => {
    const comp = scanCompForSpan(
      [scan("2026-02-01T10:00:00Z"), scan("2026-06-27T10:00:00Z")],
      spanStart,
      spanEnd,
    );
    expect(comp).toBeNull();
  });

  it("returns null when only one scan brackets both endpoints (one scan is not a change)", () => {
    const only = scan("2026-03-02T10:00:00Z");
    expect(scanCompForSpan([only], spanStart, "2026-03-10T18:00:00Z")).toBeNull();
  });

  it("a cross-scanner bracket is flagged, never graded (doc 15 §6.2 rule 2)", () => {
    const comp = scanCompForSpan(
      [
        scan("2026-03-02T10:00:00Z"),
        scan("2026-06-27T10:00:00Z", {
          scanner_model: "GE Lunar Prodigy",
          lean_mass_lb: 137,
        }),
      ],
      spanStart,
      spanEnd,
    );
    expect(comp!.sameScanner).toBe(false);
    // deltas ride as flagged context, but no noise claim is made
    expect(comp!.deltaLeanLb).toBe(5);
    expect(comp!.leanWithinNoise).toBeNull();
    expect(comp!.fatWithinNoise).toBeNull();
    expect(comp!.note).toMatch(/different scanners/);
  });

  it("an unknown scanner model on either side is not comparable", () => {
    const comp = scanCompForSpan(
      [
        scan("2026-03-02T10:00:00Z", { scanner_model: null }),
        scan("2026-06-27T10:00:00Z"),
      ],
      spanStart,
      spanEnd,
    );
    expect(comp!.sameScanner).toBe(false);
  });

  it("scans closer than a quarterly cadence carry the hint-not-trend note", () => {
    const comp = scanCompForSpan(
      [scan("2026-03-02T10:00:00Z"), scan("2026-03-30T10:00:00Z")],
      spanStart,
      "2026-03-29T18:00:00Z",
    );
    expect(comp!.note).toMatch(/hint, not a trend/);
    // and a same-machine quarterly-plus pair does not
    const quarterly = scanCompForSpan(
      [scan("2026-03-02T10:00:00Z"), scan("2026-06-27T10:00:00Z")],
      spanStart,
      spanEnd,
    );
    expect(quarterly!.note).not.toMatch(/hint/);
  });

  it("missing fields degrade that delta to null without killing the fold", () => {
    const comp = scanCompForSpan(
      [
        scan("2026-03-02T10:00:00Z", { weight_lb: null }),
        scan("2026-06-27T10:00:00Z"),
      ],
      spanStart,
      spanEnd,
    );
    expect(comp!.deltaWeightLb).toBeNull();
    expect(comp!.deltaLeanLb).not.toBeNull();
  });

  it("LSC constants are the doc 15 §6.1 working bands", () => {
    expect(LEAN_LSC_LB).toBe(2);
    expect(FAT_LSC_LB).toBe(2);
    expect(BF_PCT_NOISE_BAND).toBe(1);
  });
});

describe("dexaBodyDataForSpan — the mass verdict's DEXA fallback", () => {
  const comp = scanCompForSpan(
    [
      scan("2026-03-02T10:00:00Z"),
      scan("2026-06-27T10:00:00Z", { weight_lb: 189.5 }),
    ],
    spanStart,
    spanEnd,
  );

  it("grades measured scan weight from a same-machine bracket", () => {
    expect(dexaBodyDataForSpan(comp)).toEqual({
      measuredDeltaLb: 5.5,
      source: "dexa",
    });
  });

  it("refuses a cross-scanner bracket and missing weights", () => {
    expect(
      dexaBodyDataForSpan({ ...comp!, sameScanner: false }),
    ).toBeNull();
    expect(
      dexaBodyDataForSpan({ ...comp!, deltaWeightLb: null }),
    ).toBeNull();
    expect(dexaBodyDataForSpan(null)).toBeNull();
  });

  it("flips the retrospective mass row to a graded DEXA verdict", () => {
    const retro = macroRetrospective(
      {
        goalType: "hypertrophy",
        targetLow: 4,
        targetHigh: 8,
        targetUnit: "lb",
        targetDirection: "gain",
      },
      {
        estStrengthPct: null,
        qualifyingLifts: 0,
        minQualifyingLifts: 3,
        muscles: [],
      },
      null,
      { adherencePct: null, sessionsLogged: 0, totalVolume: 0 },
      { completed: 1, abandoned: 0, notBuilt: 0 },
      dexaBodyDataForSpan(comp),
      comp,
    );
    expect(retro.mass).toMatchObject({
      measured: true,
      measuredDeltaLb: 5.5,
      verdict: "within band",
    });
    expect(retro.mass!.note).toMatch(/DEXA/);
    expect(retro.composition).toBe(comp);
  });
});

describe("scanProfileProposal — consented, never silent, never nagging", () => {
  const freshScan = {
    id: "scan-1",
    scanned_at: "2026-07-08T17:00:00Z",
    weight_lb: 184.53,
    body_fat_pct: 25.5,
    profile_applied_at: null,
    profile_dismissed_at: null,
  };
  const profile = {
    bodyweight: 190,
    body_fat_pct: 28,
    bodyweight_updated_at: "2026-06-01T09:00:00Z",
  };

  it("proposes the measured values (rounded to 0.1) beside the current ones", () => {
    expect(scanProfileProposal(freshScan, profile)).toEqual({
      scanId: "scan-1",
      scannedAt: "2026-07-08T17:00:00Z",
      weightLb: 184.5,
      bodyFatPct: 25.5,
      currentBodyweight: 190,
      currentBodyFatPct: 28,
    });
  });

  it("never re-proposes a resolved scan (applied or dismissed)", () => {
    expect(
      scanProfileProposal(
        { ...freshScan, profile_applied_at: "2026-07-09T00:00:00Z" },
        profile,
      ),
    ).toBeNull();
    expect(
      scanProfileProposal(
        { ...freshScan, profile_dismissed_at: "2026-07-09T00:00:00Z" },
        profile,
      ),
    ).toBeNull();
  });

  it("a backfilled scan older than the profile's own freshness never nags", () => {
    expect(
      scanProfileProposal(freshScan, {
        ...profile,
        bodyweight_updated_at: "2026-07-10T09:00:00Z",
      }),
    ).toBeNull();
  });

  it("proposes nothing when the scan matches the profile already", () => {
    expect(
      scanProfileProposal(freshScan, {
        bodyweight: 184.5,
        body_fat_pct: 25.5,
        bodyweight_updated_at: null,
      }),
    ).toBeNull();
  });

  it("offers only the fields the scan measured and that differ", () => {
    const bfOnly = scanProfileProposal(
      { ...freshScan, weight_lb: null },
      { ...profile, bodyweight: null },
    );
    expect(bfOnly).toMatchObject({ weightLb: null, bodyFatPct: 25.5 });
    const weightOnly = scanProfileProposal(freshScan, {
      ...profile,
      body_fat_pct: 25.5,
    });
    expect(weightOnly).toMatchObject({ weightLb: 184.5, bodyFatPct: null });
  });

  it("a null profile bodyweight is a difference (first measurement)", () => {
    expect(
      scanProfileProposal(freshScan, {
        bodyweight: null,
        body_fat_pct: null,
        bodyweight_updated_at: null,
      }),
    ).toMatchObject({ weightLb: 184.5, bodyFatPct: 25.5 });
  });
});
