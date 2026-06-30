import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENGINE_PARAMS,
  equipmentTypes,
  toEngineEquipment,
} from "../params";
import { roundToStep } from "../rules/rounding";

describe("toEngineEquipment", () => {
  it("passes canonical buckets through unchanged", () => {
    for (const eq of equipmentTypes) {
      expect(toEngineEquipment(eq)).toBe(eq);
    }
  });

  it("maps the imported library's wider vocabulary to canonical buckets", () => {
    expect(toEngineEquipment("smith machine")).toBe("smith");
    expect(toEngineEquipment("bodyweight only")).toBe("bodyweight");
    expect(toEngineEquipment("bodyweight loadable")).toBe("bodyweight");
    expect(toEngineEquipment("machine assistance")).toBe("machine");
    expect(toEngineEquipment("freemotion")).toBe("cable");
  });

  it("falls back to other for anything unrecognized", () => {
    expect(toEngineEquipment("kayak")).toBe("other");
    expect(toEngineEquipment("")).toBe("other");
  });

  it("normalization is loss-free for load math (same step as its bucket)", () => {
    // every extra label must price loads identically to the bucket it maps to,
    // so storing the CSV value verbatim never changes a prescription
    const cases: [string, string][] = [
      ["smith machine", "smith"],
      ["bodyweight only", "bodyweight"],
      ["bodyweight loadable", "bodyweight"],
      ["machine assistance", "machine"],
      ["freemotion", "cable"],
    ];
    for (const [raw, bucket] of cases) {
      // the loadable step (what every prescription rounds to) must match the bucket
      expect(
        roundToStep(123.4, toEngineEquipment(raw), DEFAULT_ENGINE_PARAMS),
      ).toBe(
        roundToStep(123.4, toEngineEquipment(bucket), DEFAULT_ENGINE_PARAMS),
      );
    }
  });
});
