/**
 * Stable, canonical production origin for the connector endpoint. The copyable
 * MCP URL must be the one durable domain a user pastes into their AI client —
 * never a deployment-specific or preview host (those rotate and break the
 * saved connector). `NEXT_PUBLIC_APP_URL` overrides this (e.g. localhost in
 * dev, or a future custom domain); otherwise we fall back to this canonical
 * production alias rather than the request host.
 */
export const CANONICAL_APP_URL = "https://workout-zeta-murex.vercel.app";

/**
 * Resolve the origin to show in the copyable endpoint. `NEXT_PUBLIC_APP_URL`
 * is honored as an override only when it's a legitimately durable origin —
 * localhost (dev) or a non-`vercel.app` custom domain. An auto-generated
 * deployment alias (`*.vercel.app` that isn't the canonical host, e.g.
 * `workout-<hash>-…-projects.vercel.app`) rotates per deploy and would break
 * the saved connector, so we ignore it and fall back to the canonical domain.
 * This keeps the page self-correcting even if the env var is misconfigured in
 * Vercel. Unparseable / empty values fall back to canonical too.
 */
export function resolveOrigin(configured: string | undefined): string {
  const value = configured?.replace(/\/$/, "");
  if (!value) return CANONICAL_APP_URL;
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    return CANONICAL_APP_URL;
  }
  const canonicalHost = new URL(CANONICAL_APP_URL).hostname;
  if (host === canonicalHost) return value;
  // Reject auto-generated Vercel aliases; allow localhost + real custom domains.
  if (host.endsWith(".vercel.app")) return CANONICAL_APP_URL;
  return value;
}

/**
 * Resolve the remote MCP endpoint origin shown to a user. A connector saved in
 * Claude or ChatGPT must point at a publicly reachable, durable URL, so a
 * local development override is never appropriate here. Keep `resolveOrigin`
 * for flows such as local OAuth callbacks that genuinely need localhost.
 */
export function resolveConnectorOrigin(configured: string | undefined): string {
  const origin = resolveOrigin(configured);
  const host = new URL(origin).hostname;
  return host === "localhost" || host === "127.0.0.1"
    ? CANONICAL_APP_URL
    : origin;
}
