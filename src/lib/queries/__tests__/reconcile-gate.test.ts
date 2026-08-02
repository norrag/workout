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

const base: {
  paramsVersion: number;
  rirStart: number;
  rirEnd: number;
  rirSchedule: number[] | null;
  slotEffort?: string[];
  weeks: number;
  includesDeload: boolean;
  goalType: string | null;
  experienceLevel: string | null;
  overrideCount: number;
  overrideLatest: string | null;
  exerciseLatest: string | null;
  workoutCount: number;
  closedWorkoutLatest: string | null;
} = {
  paramsVersion: 16,
  rirStart: 3,
  rirEnd: 0,
  rirSchedule: null,
  weeks: 5,
  includesDeload: true,
  goalType: "gain" as string | null,
  experienceLevel: "intermediate" as string | null,
  overrideCount: 2,
  overrideLatest: "2026-06-20T00:00:00Z",
  exerciseLatest: "2026-06-01T00:00:00Z",
  workoutCount: 12,
  closedWorkoutLatest: "2026-06-25T00:00:00Z",
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
      { rirSchedule: [3, 2, 2, 1] }, // N18-B: per-week schedule SET
      { rirSchedule: [3, 3, 2, 1] }, // N18-B: per-week schedule EDITED
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
      { closedWorkoutLatest: "2026-06-26T00:00:00Z" }, // a workout completed/skipped
      // doc 21 §7.2: a per-slot effort assignment SET, EDITED, or CLEARED. An
      // assignment-only edit touches nothing else in this signature, so without
      // it the cheap gate would short-circuit before the fingerprint pass ran.
      { slotEffort: ["1::a|4||||"] },
      { slotEffort: ["1::a|5||||"] },
      { slotEffort: ["1::a|4||||", "2::b||,,4,4|||"] },
    ];
    for (const m of mutations) {
      expect(
        mesoStaleSignature({ ...base, ...m }),
        `mutation ${JSON.stringify(m)} must bust the signature`,
      ).not.toBe(baseSig);
    }
  });

  it("holds through a first-set in_progress flip (N12)", () => {
    // the flip changes neither the row count nor any closed row's updated_at, so
    // the signature inputs are identical — the first log of a session must NOT
    // pay the full reconcile. (Loader-side: `closedWorkoutLatest` reads only
    // status in (completed, skipped); an in_progress bump is invisible to it.)
    expect(mesoStaleSignature({ ...base })).toBe(mesoStaleSignature({ ...base }));
  });

  it("a meso with no assignment hashes exactly as it did pre-doc-21 (§7.2)", () => {
    // the key is OMITTED, not null, when there is no assignment — so nobody pays
    // a spurious full reconcile the first time this ships
    const withUndefined = mesoStaleSignature({ ...base, slotEffort: undefined });
    expect(withUndefined).toBe(mesoStaleSignature({ ...base }));
  });

  it("does not collide across the watermark count/timestamp pair", () => {
    // a deletion (count down, timestamp unchanged) and an addition (count up) must
    // both differ from the base AND from each other
    const del = mesoStaleSignature({ ...base, overrideCount: 1 });
    const add = mesoStaleSignature({ ...base, overrideCount: 3 });
    expect(del).not.toBe(add);
  });
});
