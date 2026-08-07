import { describe, expect, it } from "vitest";
import { resolveOrigin } from "../origin";

/**
 * doc 22 §9.4.4 / §9.4.6 — deep-link entry.
 *
 * `from` reaches this function straight off the query string, so the two
 * properties that matter are that it never becomes an off-site link, and that
 * an unrecognized value degrades to the chapter breadcrumb rather than to a
 * back button pointing somewhere wrong.
 */
describe("resolveOrigin", () => {
  it("names the screens Phase 7 will link from", () => {
    expect(resolveOrigin("/workout")).toEqual({
      href: "/workout",
      label: "WORKOUT",
    });
    expect(resolveOrigin("/log/abc-123")?.label).toBe("WORKOUT");
    expect(resolveOrigin("/cycles/meso/9/plan")?.label).toBe("CYCLES");
    expect(resolveOrigin("/exercises/42")?.label).toBe("EXERCISES");
    expect(resolveOrigin("/templates")?.label).toBe("TEMPLATES");
  });

  it("takes the longest matching prefix, so More's children keep their names", () => {
    expect(resolveOrigin("/more")?.label).toBe("MORE");
    expect(resolveOrigin("/more/profile")?.label).toBe("PROFILE");
    expect(resolveOrigin("/more/connector")?.label).toBe("AI CONNECTOR");
    expect(resolveOrigin("/more/account")?.label).toBe("MORE");
  });

  it("keeps the caller's own query and hash on the way back", () => {
    expect(resolveOrigin("/log/abc?exercise=7#set-3")).toEqual({
      href: "/log/abc?exercise=7#set-3",
      label: "WORKOUT",
    });
  });

  it("never resolves to somewhere off this app", () => {
    for (const hostile of [
      "//evil.example.com",
      "/\\evil.example.com",
      "https://evil.example.com",
      "/workout\\..\\evil",
      "javascript:alert(1)",
      "workout",
    ]) {
      expect(resolveOrigin(hostile), hostile).toBeNull();
    }
  });

  it("drops an unrecognized in-app path rather than guessing a label", () => {
    // a wrong-looking back link is worse than none: the chapter breadcrumb
    // still stands, and it is always correct
    expect(resolveOrigin("/nope")).toBeNull();
    expect(resolveOrigin("/workoutish")).toBeNull();
    expect(resolveOrigin(undefined)).toBeNull();
    expect(resolveOrigin("")).toBeNull();
  });
});
