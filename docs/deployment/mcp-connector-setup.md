# MCP connector — setup & test runbook

Everything needed to take the MCP connector from "code merged" to "a user
connects Claude and asks about their training." Pairs with
[05-mcp-connector.md](../05-mcp-connector.md) (design) and
[manual-operations.md](manual-operations.md) (the human-only steps).

> **Hosting model — no separate project.** WORKOUT's MCP server is **co-hosted
> inside the same Next.js app/deployment** at `/api/mcp` (05 §Transport: "same
> deployment, shared code"). This is deliberate and differs from the pattern
> where an MCP server is a standalone Vercel project (e.g. the separate
> `ngs-inventory-mcp`). It's the right call here because:
> - the tools are thin wrappers over the app's own `src/lib/queries/` layer,
>   the pure engine, and the shared `v_*` views — co-hosting means **zero code
>   duplication and one definition of progress**;
> - the transport is **stateless Streamable HTTP** (no SSE, no Redis, no
>   long-lived connections), so there's no isolation/scaling reason to split it
>   out — it's just another serverless route;
> - Supabase is the OAuth **authorization server**, so the app only has to be a
>   **resource server** + host a small consent page — not a standalone auth
>   service.
>
> If we ever need independent scaling or a separate security boundary, it can be
> extracted later; nothing about the current design requires it.

---

## Architecture in one picture

```
Claude (MCP client)
   │  1. POST /api/mcp  (no token)
   ▼
WORKOUT app (Vercel)                         Supabase (auth server)
   /api/mcp  ── 401 + WWW-Authenticate ─────────────┐
   /.well-known/oauth-protected-resource ───────────┤ points client at
                                                     │ <url>/auth/v1
   │  2. client discovers AS, registers (DCR),       │
   │     redirects user to authorize ────────────────▶ /auth/v1/oauth/authorize
   │  3. Supabase redirects user to the app's        │
   /oauth/consent  ◀───── consent screen ────────────┤  (Site URL + Auth Path)
   /api/oauth/decision ── approve ──▶ supabase ───────▶ issues code → token
   │  4. client calls /api/mcp with Bearer <JWT>     │
   ▼                                                  │
   /api/mcp verifies JWT against JWKS ◀───────────────┘ <url>/auth/v1/.well-known/jwks.json
   → runs tools under the user's RLS
```

**Status of each piece**

| Piece | Where | Status |
|---|---|---|
| Resource server `/api/mcp` (JWT verify, RLS, tools) | app code | ✅ shipped (Slice 1) |
| Protected-resource metadata (RFC 9728) | app code | ✅ shipped (Slice 1) |
| `get_current_state` tool + `current-cycle` resource | app code | ✅ shipped (Slice 1) |
| **Consent UI** `/oauth/consent` + `/api/oauth/decision` | app code | ⛔ **not built yet** — required; Claude will build this |
| **OAuth 2.1 server enabled** | Supabase dashboard | ⛔ **human step** |
| **Authorization Path + Site URL** | Supabase dashboard | ⛔ **human step** |
| Env vars present on Vercel | Vercel dashboard | ⚠️ verify (no *new* vars required) |

---

## Project facts (this project)

- Supabase project ref: `juqvbiymmdcggctdqoiq`
- Supabase URL: `https://juqvbiymmdcggctdqoiq.supabase.co`
- Token **issuer** (`iss`): `https://juqvbiymmdcggctdqoiq.supabase.co/auth/v1`
- JWKS (ES256, **live**): `https://juqvbiymmdcggctdqoiq.supabase.co/auth/v1/.well-known/jwks.json`
- AS discovery (RFC 8414): `https://juqvbiymmdcggctdqoiq.supabase.co/.well-known/oauth-authorization-server/auth/v1`
- OIDC discovery: `https://juqvbiymmdcggctdqoiq.supabase.co/auth/v1/.well-known/openid-configuration`
- Authorize endpoint: `https://juqvbiymmdcggctdqoiq.supabase.co/auth/v1/oauth/authorize`
- Token endpoint: `https://juqvbiymmdcggctdqoiq.supabase.co/auth/v1/oauth/token`
- Vercel project: `workout` (`prj_v61WGPV7lXimhVeAHczFzpNU5pGl`, team `garron-duprees-projects`) — Git-connected (prod = `main`, preview = PRs)
- MCP endpoint (prod): `https://<your-app-domain>/api/mcp`

---

## Step 1 — (human) Enable the Supabase OAuth 2.1 server

Dashboard → project `juqvbiymmdcggctdqoiq`:

1. **Authentication → OAuth Server** → enable **OAuth 2.1 server**.
   *(Beta, free during beta. This is what makes the `oauth/authorize`,
   `oauth/token`, and AS discovery endpoints exist — today they 404.)*
2. Set **Authorization Path** to `/oauth/consent`.
3. (Recommended) Enable **Dynamic Client Registration** so Claude can register
   itself. *Caution: this lets any MCP client register; acceptable for a
   personal app, revisit before a public launch.*
4. **Authentication → URL Configuration** → set **Site URL** to the app origin
   and add it to **Redirect URLs**:
   - Production: `https://<your-app-domain>`
   - Local dev: `http://localhost:3000`

**Verify it's on** (replace ref if needed):

```bash
curl -s https://juqvbiymmdcggctdqoiq.supabase.co/.well-known/oauth-authorization-server/auth/v1 | head -c 400
# Expect JSON with authorization_endpoint / token_endpoint / jwks_uri (not a 404).
```

## Step 2 — (Claude) Build the consent UI

Required app code, not yet built (tracked as a follow-up slice). It is:

- `app/oauth/consent/page.tsx` — reads `authorization_id`, requires a signed-in
  WORKOUT user (redirect to `/sign-in` preserving the id), calls
  `supabase.auth.oauth.getAuthorizationDetails(id)`, renders a ledger-styled
  consent screen (client name, redirect URI, requested scopes) with
  Approve/Deny.
- `app/api/oauth/decision/route.ts` — POST handler calling
  `approveAuthorization` / `denyAuthorization` and redirecting to the returned
  `redirect_url`.

`@supabase/supabase-js@2.108+` (installed) exposes these methods. The path must
match the **Authorization Path** from Step 1 (`/oauth/consent`).

> Until this exists, a connecting client reaches the consent redirect and has
> nowhere to land — so the handshake can't complete even with the server
> enabled. Build Step 2 and do Step 1 together.

## Step 3 — (human) Verify Vercel environment variables

No **new** variables are required for the connector — it reads the same Supabase
config the app already uses. Confirm these exist for **Production and Preview**
(Vercel → project `workout` → Settings → Environment Variables):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL; also derives the JWT issuer + JWKS. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Used by the token-bound RLS client. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role (audit writes, admin reads) — server-only. |
| `NEXT_PUBLIC_APP_URL` | ⚠️ recommended | Shown as the endpoint on `/more/connector`; resource-URL fallback. Set to the prod domain. |
| `MCP_AUTH_ISSUER` | optional | Override only if the AS issuer differs from `<url>/auth/v1`. Leave unset. |

## Step 4 — Deploy

Merging to `main` auto-deploys via the existing Git integration. (Preview
deploys land on each PR.) No manual deploy needed.

---

## Testing

### A. Resource server + discovery (works **today**, before Step 1)

```bash
APP=https://<your-app-domain>

# 1. Protected-resource metadata — expect JSON with authorization_servers
curl -s $APP/.well-known/oauth-protected-resource

# 2. Unauthenticated call — expect 401 + WWW-Authenticate: Bearer ... resource_metadata=...
curl -s -D - -o /dev/null -X POST $APP/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### B. Authenticated tool call with a real token (works today via a user JWT)

```bash
URL=https://juqvbiymmdcggctdqoiq.supabase.co
ANON=<anon-key>
# Mint a user session token (or copy one from a logged-in browser session):
TOKEN=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"<you>","password":"<pw>"}' | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

curl -s -X POST $APP/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_current_state","arguments":{}}}'
# Expect a result whose content/structuredContent is the caller's current training state.
```

### C. End-to-end from Claude (after Steps 1 + 2)

1. In Claude → Settings → **Connectors** → **Add custom connector**.
2. Paste the MCP URL: `https://<your-app-domain>/api/mcp`.
3. Claude discovers the AS, you're sent to `/oauth/consent`, sign in to WORKOUT
   and **Approve**.
4. Ask: *"What's my current mesocycle and next workout?"* — Claude should call
   `get_current_state` and answer from your real data.

---

## Revocation

- From the AI client: remove the WORKOUT connector.
- From Supabase: the user's OAuth grant can be revoked (Authentication → Users /
  the OAuth grants surface). A first-class in-app revocation list on
  `/more/connector` is a follow-up (depends on the OAuth-grants read API).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| AS discovery URL 404s | OAuth server not enabled (Step 1). |
| Client gets to a blank/404 page after "Authorize" | Consent UI not built (Step 2) or Authorization Path ≠ `/oauth/consent`. |
| Redirect loop / "redirect not allowed" | App origin missing from Site URL / Redirect URLs (Step 1.4). |
| `401 invalid_token` with a real token | Token issuer ≠ `<url>/auth/v1`, expired token, or `NEXT_PUBLIC_SUPABASE_URL` unset on the deployment. |
| Endpoint shows `undefined/api/mcp` on `/more/connector` | `NEXT_PUBLIC_APP_URL` not set (Step 3). |
