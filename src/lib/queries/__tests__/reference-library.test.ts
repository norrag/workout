import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mergeLibrary, filterLibraryExercises } from "../exercises";
import type { ExerciseRow } from "@/lib/types/database";

// WS-J #7 — the exercise library is served as cached GLOBAL stock rows merged
// with the user's live custom rows. These tests pin the merge/filter parity
// with the SQL the reads replaced (`order("name")`, `ilike %search%`,
// equipment equality) and statically guard the cache's stock-only scoping.

function ex(name: string, over: Partial<ExerciseRow> = {}): ExerciseRow {
  return {
    id: over.id ?? name,
    user_id: null,
    legacy_id: null,
    name,
    equipment_type: "barbell" as ExerciseRow["equipment_type"],
    load_type: null,
    description: null,
    notes: null,
    video_url: null,
    source_exercise_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("mergeLibrary", () => {
  it("interleaves custom rows into the stock list in name order", () => {
    const merged = mergeLibrary(
      { exercises: [ex("Bench Press"), ex("Squat")], links: [] },
      { exercises: [ex("Cable Fly", { user_id: "u1" })], links: [] },
    );
    expect(merged.exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Cable Fly",
      "Squat",
    ]);
  });

  it("indexes links across both slices by exercise id", () => {
    const merged = mergeLibrary(
      {
        exercises: [ex("Bench Press", { id: "bp" })],
        links: [
          { exercise_id: "bp", muscle_group_id: "chest", role: "primary" },
          { exercise_id: "bp", muscle_group_id: "triceps", role: "secondary" },
        ],
      },
      {
        exercises: [ex("Cable Fly", { id: "cf", user_id: "u1" })],
        links: [{ exercise_id: "cf", muscle_group_id: "chest", role: "primary" }],
      },
    );
    expect(merged.linksByExercise.get("bp")).toEqual([
      { muscle_group_id: "chest", role: "primary" },
      { muscle_group_id: "triceps", role: "secondary" },
    ]);
    expect(merged.linksByExercise.get("cf")).toEqual([
      { muscle_group_id: "chest", role: "primary" },
    ]);
  });
});

describe("filterLibraryExercises", () => {
  const rows = [
    ex("Bench Press"),
    ex("Incline Bench Press", {
      equipment_type: "dumbbell" as ExerciseRow["equipment_type"],
    }),
    ex("Squat"),
  ];

  it("returns everything with no filters", () => {
    expect(filterLibraryExercises(rows, {})).toHaveLength(3);
  });

  it("matches search case-insensitively as a substring (ilike parity)", () => {
    expect(
      filterLibraryExercises(rows, { search: "bench" }).map((e) => e.name),
    ).toEqual(["Bench Press", "Incline Bench Press"]);
    expect(filterLibraryExercises(rows, { search: "PRESS" })).toHaveLength(2);
    expect(filterLibraryExercises(rows, { search: "deadlift" })).toHaveLength(0);
  });

  it("filters equipment by exact equality", () => {
    expect(
      filterLibraryExercises(rows, {
        equipment: "dumbbell" as ExerciseRow["equipment_type"],
      }).map((e) => e.name),
    ).toEqual(["Incline Bench Press"]);
  });

  it("combines search and equipment", () => {
    expect(
      filterLibraryExercises(rows, {
        search: "bench",
        equipment: "dumbbell" as ExerciseRow["equipment_type"],
      }).map((e) => e.name),
    ).toEqual(["Incline Bench Press"]);
  });
});

describe("reference cache scoping (static guard)", () => {
  // The Data Cache is shared across users, so reference.ts must only ever
  // cache GLOBAL rows: the stock-library read stays `user_id IS NULL`-scoped
  // and no per-user filter (which would bake one user's view into the shared
  // cache) may appear. Mirrors the predict.ts static import guard pattern.
  const src = readFileSync(
    path.join(__dirname, "..", "reference.ts"),
    "utf8",
  );

  it("stock exercises read is scoped to user_id IS NULL", () => {
    expect(src).toContain('.is("user_id", null)');
    expect(src).toContain('.is("exercises.user_id", null)');
  });

  it("never filters by a specific user (nothing per-user may be cached)", () => {
    expect(src).not.toMatch(/eq\(\s*["']user_id["']/);
  });

  it("only touches the two global reference tables", () => {
    const tables = [...src.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(
      new Set(["muscle_groups", "exercises", "exercise_muscle_groups"]),
    );
  });
});
