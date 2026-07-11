import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  pkceChallenge,
  randomUrlSafe,
  BODYSPEC_AUTHORIZATION_ENDPOINT,
} from "../oauth";

describe("PKCE helpers (RFC 7636)", () => {
  it("computes the S256 challenge — RFC 7636 appendix B vector", async () => {
    expect(
      await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates 43-char URL-safe verifiers/state, unique per call", () => {
    const a = randomUrlSafe();
    const b = randomUrlSafe();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("builds the authorization URL with PKCE + offline_access", () => {
    const url = new URL(
      buildAuthorizationUrl({
        clientId: "client-1",
        redirectUri: "http://localhost:3000/api/integrations/bodyspec/callback",
        state: "st",
        codeChallenge: "ch",
      }),
    );
    expect(url.origin + url.pathname).toBe(BODYSPEC_AUTHORIZATION_ENDPOINT);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/bodyspec/callback",
    );
    // offline_access rides every flow — sync must work between visits (§8.2)
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email offline_access",
    );
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("code_challenge")).toBe("ch");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
