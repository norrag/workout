import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS, engineParamsSchema } from "@/lib/engine";
import {
  CURRENT_PARAMS_SCHEMA_VERSION,
  canonicalize,
  hashParams,
  materializeParams,
  resolveProvenance,
} from "../params-provenance";

// the v11 deltas (standalone-prescription investigation 2026-06-23), built the
// same way the 20260624000002 migration materialized them.
const V11_PARAMS = engineParamsSchema.parse({
  ...DEFAULT_ENGINE_PARAMS,
  e1rm: {
    ...DEFAULT_ENGINE_PARAMS.e1rm,
    brzycki_max_eff_reps: 10,
    session_value_confidence_weights: { high: 1, moderate: 0.6, low: 0.3 },
  },
  seed_from_anchor: true,
  hold_rep_consistent: true,
  session_dampen_require_both: true,
});

describe("canonicalize", () => {
  it("is independent of key order", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it("sorts nested keys but preserves array order", () => {
    expect(canonicalize({ x: { b: 1, a: 2 }, list: [3, 1, 2] })).toBe(
      '{"list":[3,1,2],"x":{"a":2,"b":1}}',
    );
  });
});

describe("hashParams", () => {
  it("is stable across key order", () => {
    expect(hashParams({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashParams({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("changes when a value changes", () => {
    expect(hashParams({ a: 1 })).not.toBe(hashParams({ a: 2 }));
  });
});

describe("resolveProvenance", () => {
  it("flags a complete materialized snapshot as replayable", () => {
    const p = resolveProvenance(
      DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>,
    );
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    );
  });

  it("matches the v10 migration hash (code + migration stay in lockstep)", () => {
    // the active engine_params v10 row hard-codes this sha256; if DEFAULT changes
    // without re-seeding the migration, this fails loudly rather than silently
    // shipping an unreplayable active row.
    expect(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    ).toBe("399102c44ecade41439b96d4f496a807b2737248cf5aca2e6d79d7c1a3bf09c4");
  });

  it("v11 is a complete, replayable snapshot matching the migration hash", () => {
    const p = resolveProvenance(V11_PARAMS as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION); // no shape bump
    expect(p.params_hash).toBe(
      "43102e52f88144649c0a546ea81513b7132dc6f2e4d064dd7d5ffec6fc35b8e0",
    );
  });

  it("v12 is a complete, replayable snapshot matching the migration hash", () => {
    const v12 = engineParamsSchema.parse({
      ...V11_PARAMS,
      climb_on_performed_reps: true,
      bound_to_target_window: true,
    });
    const p = resolveProvenance(v12 as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      "0fd04a7772cf3ee4e09db97e1390a40afaf857bf0ae3e6afef4ee0c567b66268",
    );
  });

  it("v14 is a complete, replayable snapshot matching the migration hash", () => {
    // v14 = v12 + retire_prior_peak_seed (T-I5). (v13 is a throwaway hosted test
    // row with no migration — skipped.) The flag is `.optional()`, so v12/earlier
    // rows are byte-identical and the new row stays replayable.
    const v14 = engineParamsSchema.parse({
      ...V11_PARAMS,
      climb_on_performed_reps: true,
      bound_to_target_window: true,
      retire_prior_peak_seed: true,
    });
    const p = resolveProvenance(v14 as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      "6b7bce05f0c2002038c1e8ad1e9ffa328626a947e41c74971045074bfcdf4ace",
    );
  });

  it("v15 is a complete, replayable snapshot matching the migration hash", () => {
    // v15 = v14 + deload_anchor_rir + deload.target_rir 4→6 (anchor-based deload).
    // deload_anchor_rir is `.optional()`, so v14/earlier rows are byte-identical.
    const v15 = engineParamsSchema.parse({
      ...V11_PARAMS,
      climb_on_performed_reps: true,
      bound_to_target_window: true,
      retire_prior_peak_seed: true,
      deload_anchor_rir: true,
      deload: { ...V11_PARAMS.deload, target_rir: 6 },
    });
    const p = resolveProvenance(v15 as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      "437679f0707850638b85e77478c3b53be24d726fd58f689b637825eb94c00084",
    );
  });

  it("v16 is a complete, replayable snapshot matching the migration hash", () => {
    // v16 = v15 + bodyweight_model (T-I2). The flag is `.optional()`, so v15/earlier
    // rows are byte-identical and the new row stays replayable.
    const v16 = engineParamsSchema.parse({
      ...V11_PARAMS,
      climb_on_performed_reps: true,
      bound_to_target_window: true,
      retire_prior_peak_seed: true,
      deload_anchor_rir: true,
      deload: { ...V11_PARAMS.deload, target_rir: 6 },
      bodyweight_model: true,
    });
    const p = resolveProvenance(v16 as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      "20d84f6eb6245c9355d058e6729c708b85cdcce424eba000ff3076520760e478",
    );
  });

  it("v17 is a complete, replayable snapshot matching the migration hash", () => {
    // v17 = v16 + pain_cut_gate (R8: doc 10 §3 step 0 — the joint-pain hard gate
    // on set counts). The field is `.optional()`, so v16/earlier rows are
    // byte-identical and the new row stays replayable.
    const v17 = engineParamsSchema.parse({
      ...V11_PARAMS,
      climb_on_performed_reps: true,
      bound_to_target_window: true,
      retire_prior_peak_seed: true,
      deload_anchor_rir: true,
      deload: { ...V11_PARAMS.deload, target_rir: 6 },
      bodyweight_model: true,
      pain_cut_gate: 3,
    });
    const p = resolveProvenance(v17 as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      "72b58d846a4b1ea372cfbbc2f0fd9ee98d36f7ca5ef3de3b86ec463e133f433e",
    );
  });

  it("v18 is a complete, replayable snapshot matching the migration hash", () => {
    // v18 = v17 with the session-dampen thresholds rescaled onto the unified
    // 0–10 slider scale (I14: fatigue 3→8, performance 1→3; stored
    // workout_feedback rescaled round(x × 2.5) in the same migration). Value
    // change inside existing fields — no shape bump; older rows stay valid
    // under the widened .max(10) bounds and replay their own 0–4 inputs.
    const v18 = engineParamsSchema.parse({
      ...V11_PARAMS,
      climb_on_performed_reps: true,
      bound_to_target_window: true,
      retire_prior_peak_seed: true,
      deload_anchor_rir: true,
      deload: { ...V11_PARAMS.deload, target_rir: 6 },
      bodyweight_model: true,
      pain_cut_gate: 3,
      session_fatigue_dampen_threshold: 8,
      session_performance_dampen_threshold: 3,
    });
    const p = resolveProvenance(v18 as unknown as Record<string, unknown>);
    expect(p.is_replayable).toBe(true);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION);
    expect(p.params_hash).toBe(
      "fede4627ed64d19b5134e0bb055d500007496a0fc6aee6b0964335d56f91acbd",
    );
  });

  it("pain_cut_gate is absent from DEFAULT (v10), preserving its hash", () => {
    expect(canonicalize(DEFAULT_ENGINE_PARAMS)).not.toContain("pain_cut_gate");
    expect(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    ).toBe("399102c44ecade41439b96d4f496a807b2737248cf5aca2e6d79d7c1a3bf09c4");
  });

  it("bodyweight_model is absent from DEFAULT (v10), preserving its hash", () => {
    expect(canonicalize(DEFAULT_ENGINE_PARAMS)).not.toContain("bodyweight_model");
    expect(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    ).toBe("399102c44ecade41439b96d4f496a807b2737248cf5aca2e6d79d7c1a3bf09c4");
  });

  it("deload_anchor_rir is absent from DEFAULT (v10), preserving its hash", () => {
    expect(canonicalize(DEFAULT_ENGINE_PARAMS)).not.toContain("deload_anchor_rir");
    expect(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    ).toBe("399102c44ecade41439b96d4f496a807b2737248cf5aca2e6d79d7c1a3bf09c4");
  });

  it("retire_prior_peak_seed is absent from DEFAULT (v10), preserving its hash", () => {
    // the new flag is `.optional()`: a v10/v12 row without it must hash unchanged,
    // or every pre-v14 row would flip non-replayable and the fingerprint would churn.
    expect(canonicalize(DEFAULT_ENGINE_PARAMS)).not.toContain("retire_prior_peak_seed");
    expect(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    ).toBe("399102c44ecade41439b96d4f496a807b2737248cf5aca2e6d79d7c1a3bf09c4");
  });

  it("the optional v11 fields leave v10's canonical hash untouched", () => {
    // the gated fields are `.optional()`, so a v10 row (without them) must still
    // hash to the same sha256 it did before — otherwise every pre-v11 row would
    // flip to non-replayable and the freshness fingerprint would churn.
    expect(
      hashParams(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    ).toBe("399102c44ecade41439b96d4f496a807b2737248cf5aca2e6d79d7c1a3bf09c4");
    expect(canonicalize(DEFAULT_ENGINE_PARAMS)).not.toContain("brzycki_max_eff_reps");
  });

  it("flags a partial (defaults-needed) version as not replayable", () => {
    // a valid-but-incomplete set: drops the optional metric blocks, which the
    // schema fills with defaults — so reading it injects values it never stored.
    const partial = {
      ...(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    };
    delete partial.e1rm;
    delete partial.macro_target;
    const p = resolveProvenance(partial);
    expect(p.is_replayable).toBe(false);
    expect(p.schema_version).toBe(CURRENT_PARAMS_SCHEMA_VERSION); // still parses
  });

  it("marks an invalid (pre-schema) version as schema_version 1, not replayable", () => {
    const p = resolveProvenance({ increment_kg: { barbell: 2.5 } });
    expect(p.is_replayable).toBe(false);
    expect(p.schema_version).toBe(1);
  });
});

describe("materializeParams", () => {
  it("resolves defaults for a partial set", () => {
    const partial = {
      ...(DEFAULT_ENGINE_PARAMS as unknown as Record<string, unknown>),
    };
    delete partial.key_lifts;
    const full = materializeParams(partial);
    expect(full.key_lifts).toEqual({ n: 5, selection: "frequency" });
  });

  it("throws on invalid params so they can never be activated", () => {
    expect(() => materializeParams({ nonsense: true })).toThrow();
  });
});
