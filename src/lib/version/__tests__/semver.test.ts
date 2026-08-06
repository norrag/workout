import { describe, expect, it } from "vitest";
import { compare, format, parse, step, tryParse } from "../semver";

describe("parse", () => {
  it("reads the three digits", () => {
    expect(parse("1.2.3")).toEqual({ major: 1, feature: 2, fix: 3 });
  });

  it("rejects anything that is not three numeric digits", () => {
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "1.2.x", "", "1.2.3-rc1"])
      expect(tryParse(bad)).toBeNull();
    expect(() => parse("v1.0.0")).toThrow(/not a version/);
  });

  it("round-trips through format", () => {
    expect(format(parse("10.4.11"))).toBe("10.4.11");
  });
});

describe("compare", () => {
  it("orders numerically, not lexically", () => {
    // the whole reason this is not a string comparison
    expect(compare("1.10.0", "1.9.0")).toBe(1);
    expect(compare("1.0.10", "1.0.9")).toBe(1);
    expect(compare("2.0.0", "10.0.0")).toBe(-1);
  });

  it("is zero for equal versions and antisymmetric otherwise", () => {
    expect(compare("1.1.0", "1.1.0")).toBe(0);
    expect(compare("1.1.0", "1.0.9")).toBe(1);
    expect(compare("1.0.9", "1.1.0")).toBe(-1);
  });
});

describe("step", () => {
  it("names the digit that advanced", () => {
    expect(step("1.0.0", "1.0.1")).toBe("fix");
    expect(step("1.0.3", "1.1.0")).toBe("feature");
    expect(step("1.4.2", "2.0.0")).toBe("major");
    expect(step("1.0.0", "1.0.0")).toBe("same");
    expect(step("1.2.0", "1.1.0")).toBe("backwards");
  });

  it("requires digits to the right to reset (§4.1)", () => {
    expect(step("1.0.3", "1.1.1")).toBe("malformed");
    expect(step("1.4.2", "2.1.0")).toBe("malformed");
    expect(step("1.4.2", "2.0.1")).toBe("malformed");
  });
});
