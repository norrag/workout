import { describe, it, expect } from "vitest";
import { DEFAULT_ENGINE_PARAMS } from "@/lib/engine";
import {
  CURRENT_PARAMS_SCHEMA_VERSION,
  canonicalize,
  hashParams,
  materializeParams,
  resolveProvenance,
} from "../params-provenance";

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
