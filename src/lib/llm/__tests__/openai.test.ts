/**
 * N58 / doc 18 §7.2 — the thin Responses API client: text extraction, retry
 * discipline (one retry, transient-only), and usage accounting. Fetch is
 * stubbed; no network.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCompletion, explanationModel, extractOutputText } from "../openai";

const request = {
  instructions: "explain",
  input: "{}",
  maxOutputTokens: 120,
};

function okResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

const completionBody = {
  model: "gpt-5.6-luna",
  status: "completed",
  output: [
    { type: "reasoning", content: [] },
    {
      type: "message",
      content: [{ type: "output_text", text: "  A paced hold.  " }],
    },
  ],
  usage: { input_tokens: 600, output_tokens: 40 },
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_EXPLANATION_MODEL;
});

describe("extractOutputText", () => {
  it("joins message output_text items and skips reasoning items", () => {
    expect(extractOutputText(completionBody.output)).toBe("A paced hold.");
  });

  it("is empty when no message content exists", () => {
    expect(extractOutputText([{ type: "reasoning" }])).toBe("");
  });
});

describe("explanationModel", () => {
  it("defaults to gpt-5.6-luna and honors the env override", () => {
    expect(explanationModel()).toBe("gpt-5.6-luna");
    process.env.OPENAI_EXPLANATION_MODEL = "gpt-5.7-luna";
    expect(explanationModel()).toBe("gpt-5.7-luna");
  });
});

describe("createCompletion", () => {
  it("returns text + usage and pins reasoning effort to none", async () => {
    let sent: Record<string, unknown> | null = null;
    const result = await createCompletion(request, async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return okResponse(completionBody);
    });
    expect(result).toEqual({
      text: "A paced hold.",
      model: "gpt-5.6-luna",
      tokensIn: 600,
      tokensOut: 40,
    });
    expect(sent).toMatchObject({
      model: "gpt-5.6-luna",
      max_output_tokens: 120,
      reasoning: { effort: "none" },
      store: false,
    });
  });

  it("retries once on a 5xx then succeeds", async () => {
    let calls = 0;
    const result = await createCompletion(request, async () => {
      calls += 1;
      return calls === 1
        ? new Response("upstream", { status: 503 })
        : okResponse(completionBody);
    });
    expect(calls).toBe(2);
    expect(result.text).toBe("A paced hold.");
  });

  it("does not retry a deterministic 4xx", async () => {
    let calls = 0;
    await expect(
      createCompletion(request, async () => {
        calls += 1;
        return new Response("bad request", { status: 400 });
      }),
    ).rejects.toThrow("400");
    expect(calls).toBe(1);
  });

  it("throws after the single retry is exhausted", async () => {
    let calls = 0;
    await expect(
      createCompletion(request, async () => {
        calls += 1;
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
    expect(calls).toBe(2);
  });

  it("throws on an empty completion and without a key", async () => {
    await expect(
      createCompletion(request, async () =>
        okResponse({ ...completionBody, output: [] }),
      ),
    ).rejects.toThrow("empty");
    delete process.env.OPENAI_API_KEY;
    await expect(createCompletion(request)).rejects.toThrow("OPENAI_API_KEY");
  });
});
