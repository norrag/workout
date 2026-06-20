import { describe, it, expect } from "vitest";
import { CANONICAL_APP_URL, resolveOrigin } from "../endpoint";

describe("resolveOrigin", () => {
  it("falls back to the canonical domain when unset or empty", () => {
    expect(resolveOrigin(undefined)).toBe(CANONICAL_APP_URL);
    expect(resolveOrigin("")).toBe(CANONICAL_APP_URL);
  });

  it("keeps the canonical host as-is", () => {
    expect(resolveOrigin(CANONICAL_APP_URL)).toBe(CANONICAL_APP_URL);
  });

  it("strips a trailing slash from honored overrides", () => {
    expect(resolveOrigin(`${CANONICAL_APP_URL}/`)).toBe(CANONICAL_APP_URL);
    expect(resolveOrigin("http://localhost:3000/")).toBe(
      "http://localhost:3000",
    );
  });

  it("ignores auto-generated Vercel deployment aliases", () => {
    expect(
      resolveOrigin("https://workout-garron-duprees-projects.vercel.app"),
    ).toBe(CANONICAL_APP_URL);
    expect(resolveOrigin("https://workout-bcohv3it8-foo.vercel.app")).toBe(
      CANONICAL_APP_URL,
    );
    expect(resolveOrigin("https://workout-git-main-foo.vercel.app")).toBe(
      CANONICAL_APP_URL,
    );
  });

  it("honors localhost (dev) overrides", () => {
    expect(resolveOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("honors a real custom (non-vercel.app) domain override", () => {
    expect(resolveOrigin("https://workout.example.com")).toBe(
      "https://workout.example.com",
    );
  });

  it("falls back to canonical for unparseable values", () => {
    expect(resolveOrigin("not a url")).toBe(CANONICAL_APP_URL);
  });
});
