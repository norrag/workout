/**
 * Register a WORKOUT OAuth client with BodySpec's Keycloak realm via
 * anonymous OIDC dynamic client registration (RFC 7591; doc 15 §8.1).
 *
 * Run ONCE PER ENVIRONMENT by a human (the sandbox can't persist the
 * resulting secrets — see docs/deployment/manual-operations.md → "BodySpec
 * OAuth client registration"):
 *
 *   npx tsx scripts/register-bodyspec-client.ts http://localhost:3000
 *   npx tsx scripts/register-bodyspec-client.ts https://workout-zeta-murex.vercel.app
 *
 * Then:
 *   - set BODYSPEC_CLIENT_ID to the printed client_id (Vercel env var /
 *     local .env.local),
 *   - store the printed registration_access_token in the env secret store —
 *     it is the ONLY credential that can later update or delete the client;
 *     a client whose token is lost can only be abandoned (doc 15 §8.1).
 *
 * Deliberately self-contained: no imports from src/ (server-only modules
 * don't load under plain tsx), no dependencies beyond fetch.
 */

const REGISTRATION_ENDPOINT =
  "https://auth.bodyspec.com/realms/bodyspec/clients-registrations/openid-connect";

async function main() {
  const origin = process.argv[2]?.replace(/\/$/, "");
  if (!origin || !/^https?:\/\//.test(origin)) {
    console.error(
      "Usage: npx tsx scripts/register-bodyspec-client.ts <app-origin>\n" +
        "  e.g. npx tsx scripts/register-bodyspec-client.ts http://localhost:3000",
    );
    process.exit(1);
  }
  const redirectUri = `${origin}/api/integrations/bodyspec/callback`;
  const host = new URL(origin).hostname;

  const res = await fetch(REGISTRATION_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: `workout (${host})`,
      redirect_uris: [redirectUri],
      // public client: PKCE only, no client secret (doc 15 §8.1)
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile email offline_access",
    }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`Registration failed (HTTP ${res.status}):`);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log("Registered BodySpec OAuth client.\n");
  console.log(`  client_id:                 ${body.client_id}`);
  console.log(`  redirect_uri:              ${redirectUri}`);
  console.log(`  registration_access_token: ${body.registration_access_token}`);
  console.log(`  registration_client_uri:   ${body.registration_client_uri}`);
  console.log(
    "\nNext steps (docs/deployment/manual-operations.md → BodySpec):\n" +
      "  1. Set BODYSPEC_CLIENT_ID to the client_id above for this environment.\n" +
      "  2. Store the registration_access_token in the env secret store —\n" +
      "     it can never be recovered and is the only way to manage the client.\n" +
      "  3. Record the registration in manual-operations.md.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
