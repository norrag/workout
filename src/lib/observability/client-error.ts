import { z } from "zod";

/**
 * The body a client error boundary POSTs to `/api/client-error` (R20). The
 * endpoint is reachable pre-auth (the `(auth)` and root boundaries must be able
 * to report), so the schema is deliberately tight: enum'd boundary, hard length
 * caps, no free-form objects — a junk payload is a 400, not a Sentry event.
 */
export const clientErrorSchema = z.object({
  boundary: z.enum(["root", "app", "auth"]),
  message: z.string().min(1).max(2_000),
  stack: z.string().max(8_000).optional(),
  /** Next's server-error digest, when present — ties the client report to the
   *  server-side log entry for the same error */
  digest: z.string().max(128).optional(),
  /** pathname where the boundary rendered */
  path: z.string().max(1_024).optional(),
});

export type ClientErrorReport = z.infer<typeof clientErrorSchema>;
