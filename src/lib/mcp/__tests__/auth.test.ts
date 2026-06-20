import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JWTPayload } from "jose";

// Mock jose so we can drive verifyMcpToken's claim handling without real keys.
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "JWKS_STUB"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";
import { verifyMcpToken } from "@/lib/mcp/auth";

const mockJwtVerify = vi.mocked(jwtVerify);

function resolvePayload(payload: JWTPayload) {
  mockJwtVerify.mockResolvedValue({
    payload,
    protectedHeader: { alg: "ES256" },
  } as unknown as Awaited<ReturnType<typeof mockJwtVerify>>);
}

const req = new Request("https://app.example.com/api/mcp");

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.SUPABASE_JWT_ISSUER;
  delete process.env.MCP_JWT_AUDIENCE;
  mockJwtVerify.mockReset();
});

describe("verifyMcpToken", () => {
  it("returns undefined when no bearer token is present", async () => {
    expect(await verifyMcpToken(req, undefined)).toBeUndefined();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("resolves identity for a valid authenticated user token", async () => {
    resolvePayload({
      sub: "user-123",
      role: "authenticated",
      scope: "openid email",
      client_id: "claude",
      exp: 9999999999,
    });
    const auth = await verifyMcpToken(req, "good.jwt.token");
    expect(auth).toBeDefined();
    expect(auth?.extra).toEqual({ userId: "user-123" });
    expect(auth?.scopes).toEqual(["openid", "email"]);
    expect(auth?.clientId).toBe("claude");
  });

  it("rejects the service_role project key (not an end-user token)", async () => {
    resolvePayload({ sub: "svc", role: "service_role" });
    expect(await verifyMcpToken(req, "service.key")).toBeUndefined();
  });

  it("rejects the anon project key", async () => {
    resolvePayload({ sub: "anon", role: "anon" });
    expect(await verifyMcpToken(req, "anon.key")).toBeUndefined();
  });

  it("rejects a token with no subject", async () => {
    resolvePayload({ role: "authenticated" });
    expect(await verifyMcpToken(req, "no.sub")).toBeUndefined();
  });

  it("treats an invalid signature / expired token as unauthenticated", async () => {
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));
    expect(await verifyMcpToken(req, "tampered")).toBeUndefined();
  });

  it("pins asymmetric algorithms and the issuer (blocks alg confusion)", async () => {
    resolvePayload({ sub: "u", role: "authenticated" });
    await verifyMcpToken(req, "tok");
    const opts = mockJwtVerify.mock.calls[0][2] as {
      algorithms?: string[];
      issuer?: string;
      audience?: string;
    };
    expect(opts.algorithms).toEqual(["RS256", "ES256", "EdDSA"]);
    expect(opts.issuer).toBe("https://proj.supabase.co/auth/v1");
    expect(opts.audience).toBeUndefined();
  });

  it("enforces audience binding when MCP_JWT_AUDIENCE is configured", async () => {
    process.env.MCP_JWT_AUDIENCE = "https://app.example.com/api/mcp";
    resolvePayload({ sub: "u", role: "authenticated" });
    await verifyMcpToken(req, "tok");
    const opts = mockJwtVerify.mock.calls[0][2] as { audience?: string };
    expect(opts.audience).toBe("https://app.example.com/api/mcp");
  });
});
