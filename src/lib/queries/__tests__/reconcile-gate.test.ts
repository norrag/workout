/**
 * Reconcile gate (WS-J #1) conservatism proof. `reconcilePrescriptions` skips the
 * full per-row freshness pass when the live meso staleness signature matches the
 * stored stamp. That is only safe if the signature changes whenever ANY input that
 * feeds a prescription's dependency fingerprint changes — a missed change would
 * leave a stale prescription. This test pins exactly that: flipping each signature
 * component must change the hash. (A coarse watermark may also OVER-trigger; that
 * only costs a harmless extra reconcile and is not a correctness risk.)
 */
import { describe, expect, it } from "vitest";
import { mesoStaleSignature } from "../regeneration";

const base = {
  paramsVersion: 16,
  rirStart: 3,
  rirEnd: 0,
  weeks: 5,
  includesDeload: true,
  goalType: "gain" as string | null,
  experienceLevel: "intermediate" as string | null,
  overrideCount: 2,
  overrideLatest: "2026-06-20T00:00:00Z" as string | null,
  exerciseLatest: "2026-06-01T00:00:00Z" as string | null,
  workoutCount: 12,
  workoutLatest: "2026-06-25T00:00:00Z" as string | null,
};

describe("mesoStaleSignature (reconcile gate #1)", () => {
  it("is stable + deterministic for identical inputs", () => {
    expect(mesoStaleSignature({ ...base })).toBe(mesoStaleSignature({ ...base }));
  });

  it("changes when ANY fingerprint-relevant input changes (conservatism)", () => {
    const baseSig = mesoStaleSignature(base);
    const mutations: Array<Partial<typeof base>> = [
      { paramsVersion: 17 }, // engine_params activation
      { rirStart: 4 }, // meso RIR ramp edit
      { rirEnd: 1 },
      { weeks: 6 },
      { includesDeload: false },
      { goalType: "cut" }, // macro goal change
      { goalType: null },
      { experienceLevel: "advanced" }, // profile experience change
      { overrideCount: 3 }, // an override ADDED
      { overrideCount: 1 }, // an override DELETED
      { overrideLatest: "2026-06-21T00:00:00Z" }, // an override EDITED
      { exerciseLatest: "2026-06-02T00:00:00Z" }, // a library equipment/load_type edit
      { workoutCount: 13 }, // a workout was generated (week advance)
      { workoutLatest: "2026-06-26T00:00:00Z" }, // a workout completed/skipped
    ];
    for (const m of mutations) {
      expect(
        mesoStaleSignature({ ...base, ...m }),
        `mutation ${JSON.stringify(m)} must bust the signature`,
      ).not.toBe(baseSig);
    }
  });

  it("does not collide across the watermark count/timestamp pair", () => {
    // a deletion (count down, timestamp unchanged) and an addition (count up) must
    // both differ from the base AND from each other
    const del = mesoStaleSignature({ ...base, overrideCount: 1 });
    const add = mesoStaleSignature({ ...base, overrideCount: 3 });
    expect(del).not.toBe(add);
  });
});
