import { describe, expect, it } from "vitest";
// the drift guard is a bare-node script (no build step, runs on `npm ci` alone
// in CI), so its pure helpers are imported straight from the .mjs
import { diffMigrations, migrationStem } from "../../../scripts/check-migrations.mjs";

describe("migrationStem", () => {
  it("strips a leading timestamp and the .sql extension", () => {
    expect(migrationStem("20260802000004_slot_rep_position.sql")).toBe(
      "slot_rep_position",
    );
  });

  // the hosted `name` column is recorded inconsistently across this project's
  // history — both forms must normalize to the same stem or the guard reports
  // false drift on half the table
  it("normalizes the full-basename and stem-only hosted name forms alike", () => {
    expect(migrationStem("20260702000005_write_integrity")).toBe(
      "write_integrity",
    );
    expect(migrationStem("write_integrity")).toBe("write_integrity");
  });

  it("leaves a stem containing digits intact", () => {
    expect(migrationStem("20260712000001_engine_params_v23_strength_model.sql")).toBe(
      "engine_params_v23_strength_model",
    );
  });
});

describe("diffMigrations", () => {
  // the exact shape of the incident this guard exists to catch: the repo file
  // carries a 20260802 timestamp, the hosted row would have carried a
  // 20260804 apply-time version — comparing versions would have missed it
  it("flags a repo migration with no hosted counterpart", () => {
    const { missing } = diffMigrations(
      ["20260802000001_exercise_level_rir.sql", "20260802000004_slot_rep_position.sql"],
      ["exercise_level_rir"],
    );
    expect(missing).toEqual(["20260802000004_slot_rep_position.sql"]);
  });

  it("matches across the version/name mismatch rather than by filename", () => {
    const { missing, unknown } = diffMigrations(
      ["20260802000004_slot_rep_position.sql"],
      ["slot_rep_position"],
    );
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it("reports hosted-only rows separately (informational, never a failure)", () => {
    const { missing, unknown } = diffMigrations(
      ["20260802000001_exercise_level_rir.sql"],
      ["exercise_level_rir", "some_hotfix_applied_directly"],
    );
    expect(missing).toEqual([]);
    expect(unknown).toEqual(["some_hotfix_applied_directly"]);
  });

  it("is clean when every repo migration is applied", () => {
    const repo = [
      "20260611000001_initial_schema.sql",
      "20260702000005_write_integrity.sql",
    ];
    expect(diffMigrations(repo, ["initial_schema", "20260702000005_write_integrity"]))
      .toEqual({ missing: [], unknown: [] });
  });

  // these two predate the hosted schema_migrations table (earliest tracked
  // version is 20260613004448) and are verified live by object existence. A
  // guard that reports two permanent known-good failures is one people learn
  // to scroll past — which is how the real drift survived two days.
  it("baselines the pre-tracking migrations instead of reporting them forever", () => {
    const { missing } = diffMigrations(
      [
        "20260611000001_initial_schema.sql",
        "20260612000001_design_pivot.sql",
        "20260802000004_slot_rep_position.sql",
      ],
      [],
    );
    expect(missing).toEqual(["20260802000004_slot_rep_position.sql"]);
  });
});
