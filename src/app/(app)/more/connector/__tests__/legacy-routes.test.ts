import { describe, expect, it } from "vitest";
import { legacyAiGuideDestination } from "../guide/legacy-routes";

describe("retired AI Manual routes", () => {
  it("returns setup readers to the setup page", () => {
    expect(legacyAiGuideDestination("setup")).toBe("/more/connector");
  });

  it.each([
    ["what-it-is", "what-it-opens-up"],
    ["the-rules", "staying-in-control"],
    ["macrocycles", "planning-and-building"],
    ["mesocycles", "planning-and-building"],
    ["analysis", "analysis-and-insight"],
    ["coaching", "coaching-in-context"],
    ["getting-good-answers", "working-with-it"],
    ["reading-answers", "reading-the-answer"],
  ])("maps %s to its consolidated Guide section", (chapter, section) => {
    expect(legacyAiGuideDestination(chapter)).toBe(
      `/more/guide/connecting-an-ai/${section}`,
    );
  });

  it("falls back to chapter 18 for an unknown legacy slug", () => {
    expect(legacyAiGuideDestination("unknown")).toBe(
      "/more/guide/connecting-an-ai",
    );
  });
});
