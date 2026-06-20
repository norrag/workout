import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/http/same-origin";

function req(headers: Record<string, string>): Request {
  return new Request("https://app.example.com/api/oauth/decision", {
    method: "POST",
    headers,
  });
}

describe("isSameOrigin (CSRF guard)", () => {
  it("allows same-origin posts via Sec-Fetch-Site", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "same-origin" }), "app.example.com")).toBe(true);
    expect(isSameOrigin(req({ "sec-fetch-site": "same-site" }), "app.example.com")).toBe(true);
    expect(isSameOrigin(req({ "sec-fetch-site": "none" }), "app.example.com")).toBe(true);
  });

  it("blocks cross-site posts via Sec-Fetch-Site", () => {
    expect(isSameOrigin(req({ "sec-fetch-site": "cross-site" }), "app.example.com")).toBe(false);
  });

  it("falls back to Origin vs host when Sec-Fetch-Site is absent", () => {
    expect(
      isSameOrigin(req({ origin: "https://app.example.com" }), "app.example.com"),
    ).toBe(true);
    expect(
      isSameOrigin(req({ origin: "https://evil.example.org" }), "app.example.com"),
    ).toBe(false);
  });

  it("blocks when Origin is present but host is unknown or malformed", () => {
    expect(isSameOrigin(req({ origin: "https://app.example.com" }), null)).toBe(false);
    expect(isSameOrigin(req({ origin: "not-a-url" }), "app.example.com")).toBe(false);
  });

  it("allows requests with neither header (non-browser clients cannot CSRF)", () => {
    expect(isSameOrigin(req({}), "app.example.com")).toBe(true);
  });

  it("prefers Sec-Fetch-Site over a spoofed matching Origin", () => {
    // A cross-site browser request cannot forge Sec-Fetch-Site, so it wins.
    expect(
      isSameOrigin(
        req({ "sec-fetch-site": "cross-site", origin: "https://app.example.com" }),
        "app.example.com",
      ),
    ).toBe(false);
  });
});
