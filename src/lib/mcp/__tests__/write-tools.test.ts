import { describe, it, expect } from "vitest";
import {
  resolveMuscleGroupIds,
  registerWriteTools,
  CREATE_MACROCYCLE,
  CREATE_MESOCYCLE,
  CREATE_TEMPLATE,
  CREATE_CUSTOM_EXERCISE,
  UPDATE_MACROCYCLE_GOALS,
  MANAGE_EXCLUSIONS,
  LOG_NOTE,
} from "../tools/write";
import { hashArgs } from "../audit";
import { captureServer, fakeExtra } from "./harness";

// --- resolveMuscleGroupIds (pure) ------------------------------------------

describe("resolveMuscleGroupIds", () => {
  const groups = [
    { id: "g1", name: "Chest" },
    { id: "g2", name: "Quads" },
  ];

  it("maps names case-insensitively and trims", () => {
    const { byName, missing } = resolveMuscleGroupIds(["chest", "  Quads "], groups);
    expect(byName.get("chest")).toBe("g1");
    expect(byName.get("  Quads ")).toBe("g2");
    expect(missing).toEqual([]);
  });

  it("collects unknown names without duplicates", () => {
    const { byName, missing } = resolveMuscleGroupIds(
      ["Chest", "Calves", "Calves"],
      groups,
    );
    expect(byName.get("Chest")).toBe("g1");
    expect(missing).toEqual(["Calves"]);
  });
});

// --- hashArgs --------------------------------------------------------------

describe("hashArgs", () => {
  it("is deterministic and sensitive to content", () => {
    const a = hashArgs({ x: 1, y: "two" });
    expect(a).toEqual(hashArgs({ x: 1, y: "two" }));
    expect(a).not.toEqual(hashArgs({ x: 1, y: "three" }));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles null/undefined args", () => {
    expect(hashArgs(undefined)).toEqual(hashArgs(null));
  });
});

// --- registration + contracts ----------------------------------------------

const ALL_WRITE_TOOLS = [
  CREATE_MACROCYCLE,
  CREATE_MESOCYCLE,
  CREATE_TEMPLATE,
  CREATE_CUSTOM_EXERCISE,
  UPDATE_MACROCYCLE_GOALS,
  MANAGE_EXCLUSIONS,
  LOG_NOTE,
];

describe("write-tool registration", () => {
  it("registers every Slice 3 write tool", () => {
    const { server, tools } = captureServer();
    registerWriteTools(server);
    for (const name of ALL_WRITE_TOOLS) {
      expect(tools.has(name), name).toBe(true);
    }
  });

  it("no write tool takes a user_id argument (hard rule #5)", () => {
    const { server, tools } = captureServer();
    registerWriteTools(server);
    for (const [, tool] of tools) {
      const schema = (tool.config.inputSchema ?? {}) as Record<string, unknown>;
      expect(Object.keys(schema)).not.toContain("user_id");
    }
  });

  it("rejects unauthenticated calls before any write happens", async () => {
    const { server, tools } = captureServer();
    registerWriteTools(server);
    for (const name of ALL_WRITE_TOOLS) {
      const tool = tools.get(name)!;
      await expect(
        tool.handler({}, fakeExtra(undefined)),
        name,
      ).rejects.toThrow(/authenticated session/i);
    }
  });
});
