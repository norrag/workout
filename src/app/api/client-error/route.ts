import { isSameOrigin } from "@/lib/http/same-origin";
import { clientErrorSchema } from "@/lib/observability/client-error";
import { reportEvent } from "@/lib/observability/report";

/**
 * Client error intake (R20): the three error boundaries POST here so a crash
 * that only ever existed in a user's browser still lands in the server-side
 * error funnel. Reachable pre-auth by design (the sign-in flow must be able to
 * report its own crashes); the zod schema's enum + hard length caps and the
 * same-origin guard bound what an anonymous caller can inject, and the
 * response never echoes anything back.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request, request.headers.get("host"))) {
    return new Response(null, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const { boundary, message, stack, digest, path } = parsed.data;
  await reportEvent({
    scope: `client:${boundary}`,
    name: "ClientBoundaryError",
    message,
    stack: stack ?? null,
    context: { digest: digest ?? null, path: path ?? null },
  });

  return new Response(null, { status: 204 });
}
