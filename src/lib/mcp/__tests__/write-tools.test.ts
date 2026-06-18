import { describe, it, expect, beforeAll } from "vitest";
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
  DELETE_MESOCYCLE,
  DELETE_MACROCYCLE,
  DELETE_TEMPLATE,
  DELETE_CUSTOM_EXERCISE,
} from "../tools/write";
import { hashArgs } from "../audit";
import { captureServer, fakeExtra, fakeAuthInfo } from "./harness";

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
  DELETE_MESOCYCLE,
  DELETE_MACROCYCLE,
  DELETE_TEMPLATE,
  DELETE_CUSTOM_EXERCISE,
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

// --- create_mesocycle: template_id XOR days (§5.9) -------------------------
// The structure-source guard runs before any DB call, so it is exercised with a
// constructed RLS client (no network on construction) and no query is reached.

describe("create_mesocycle structure source (§5.9)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  });

  function createMesoHandler() {
    const { server, tools } = captureServer();
    registerWriteTools(server);
    return tools.get(CREATE_MESOCYCLE)!.handler;
  }

  function bodyOf(result: unknown): Record<string, unknown> {
    const r = result as { content: { text: string }[] };
    return JSON.parse(r.content[0].text).data;
  }

  it("rejects when neither template_id nor days is provided", async () => {
    const handler = createMesoHandler();
    const out = bodyOf(
      await handler({ name: "Block", weeks: 5 }, fakeExtra(fakeAuthInfo("u1"))),
    );
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/exactly one/i);
  });

  it("rejects when both template_id and days are provided", async () => {
    const handler = createMesoHandler();
    const out = bodyOf(
      await handler(
        {
          name: "Block",
          weeks: 5,
          template_id: "11111111-1111-1111-1111-111111111111",
          days: [
            {
              day_number: 1,
              groups: [
                {
                  muscle_group: "Chest",
                  exercises: [{ exercise_id: "22222222-2222-2222-2222-222222222222" }],
                },
              ],
            },
          ],
        },
        fakeExtra(fakeAuthInfo("u1")),
      ),
    );
    expect(out.ok).toBe(false);
    expect(String(out.error)).toMatch(/exactly one/i);
  });
});
