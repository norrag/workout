import type { EquipmentType } from "./database";

/**
 * Runtime equipment vocabularies (R12). `EquipmentType` in database.ts is the
 * compile-time union, but boundary schemas (zod, hard rule #6) need runtime
 * arrays to enumerate — and database.ts is destined to be replaced by generated
 * output, so the arrays live here.
 */

/**
 * The full stored `exercises.equipment_type` vocabulary — the DB check
 * constraint (20260615000006): canonical engine buckets plus the labels the
 * imported library stores verbatim. Use for FILTERS over existing rows.
 */
export const equipmentTypeValues = [
  "dumbbell",
  "barbell",
  "machine",
  "cable",
  "smith",
  "bodyweight",
  "bands",
  "kettlebell",
  "other",
  "smith machine",
  "bodyweight only",
  "bodyweight loadable",
  "machine assistance",
  "freemotion",
] as const satisfies readonly EquipmentType[];

// compile-time exhaustiveness: adding a value to `EquipmentType` without
// listing it above fails the build (filters must see the whole vocabulary).
type MissingFromVocabulary = Exclude<
  EquipmentType,
  (typeof equipmentTypeValues)[number]
>;
const vocabularyIsExhaustive: [MissingFromVocabulary] extends [never]
  ? true
  : never = true;
void vocabularyIsExhaustive;

/**
 * The vocabulary offered when CREATING a custom exercise (app form + MCP).
 * Bare "bodyweight" is deliberately absent: it says nothing about how the
 * entered weight maps to effective load, so rows created with it were stuck
 * with the `load_type` column default ('external') and wrong e1RM/effective-load
 * math forever (R12). The three load-typed labels take its place — each derives
 * its `load_type` honestly via `toEngineLoadType` at insert:
 *
 *   bodyweight only     → bodyweight_only     (push-up: load IS the bodyweight)
 *   bodyweight loadable → bodyweight_loadable (weighted pull-up: entered = added)
 *   machine assistance  → bodyweight_assisted (assisted dip: entered = assistance)
 */
export const customExerciseEquipment = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "bands",
  "kettlebell",
  "bodyweight only",
  "bodyweight loadable",
  "machine assistance",
  "other",
] as const satisfies readonly EquipmentType[];

export type CustomExerciseEquipment = (typeof customExerciseEquipment)[number];
