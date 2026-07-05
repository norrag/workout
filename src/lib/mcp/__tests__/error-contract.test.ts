/**
 * R25 — converged failure contract. The surface previously spoke two failure
 * dialects: thrown → `isError` + `{code,message,detail}` vs an in-band
 * `{ok:false, error}` envelope with `isError` UNSET, so a consumer had to
 * check both. The composition-root wrapper now flags any enveloped `ok: false`
 * payload with `isError: true` as well — one signal, both dialects. Pinned
 * here through the same wrapper `registerTools` applies.
 */
import { describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "../tools";
import { toolResult } from "../envelope";
import { captureServer, fakeExtra } from "./harness";

vi.mock("@/lib/observability/report", () => ({
  reportError: vi.fn(async () => undefined),
}));

type ToolResult = {
  isError?: boolean;
  structuredContent?: { data?: Record<string, unknown>; error?: unknown };
};

function registerAndCall(
  handlerResult: unknown,
): Promise<ToolResult> {
  const { server, tools } = captureServer();
  const guarded = withErrorHandling(server);
  guarded.registerTool(
    "probe",
    { description: "probe" } as never,
    (async () => handlerResult) as never,
  );
  return Promise.resolve(
    tools.get("probe")!.handler({}, fakeExtra()) as Promise<ToolResult>,
  );
}

describe("R25 — converged failure contract", () => {
  it("an in-band domain refusal ({ok:false}) is flagged isError", async () => {
    const out = await registerAndCall(
      toolResult({ ok: false, error: "Mesocycle not found." }),
    );
    expect(out.isError).toBe(true);
    // the readable body agents already parse is untouched
    expect(out.structuredContent?.data).toEqual({
      ok: false,
      error: "Mesocycle not found.",
    });
  });

  it("a successful write ({ok:true}) is NOT flagged", async () => {
    const out = await registerAndCall(toolResult({ ok: true, summary: "done" }));
    expect(out.isError).toBeUndefined();
  });

  it("a read payload without an ok discriminator is NOT flagged", async () => {
    const out = await registerAndCall(
      toolResult({ found: false, summary: "No mesocycle visible for that id." }),
    );
    expect(out.isError).toBeUndefined();
  });

  it("a thrown value still serializes to the structured error, isError set", async () => {
    const { server, tools } = captureServer();
    const guarded = withErrorHandling(server);
    guarded.registerTool(
      "boom",
      { description: "boom" } as never,
      (async () => {
        throw Object.assign(new Error("db exploded"), { code: "500X" });
      }) as never,
    );
    const out = (await tools.get("boom")!.handler({}, fakeExtra())) as ToolResult;
    expect(out.isError).toBe(true);
    expect(out.structuredContent?.error).toMatchObject({
      code: "500X",
      message: "db exploded",
    });
  });
});
