"use client";

import { useEffect } from "react";
import {
  boundaryReport,
  postClientError,
} from "@/lib/observability/post-client-error";

/**
 * Root error boundary (R20). Renders only when the root layout itself throws —
 * every route below `(app)`/`(auth)` is caught by their segment boundaries
 * first — so it must be fully self-contained: it replaces `<html>/<body>` and
 * cannot assume the layout's stylesheet or font pipeline survived. Inline
 * styles carry the ledger palette (cream `#F4F0E6` / ink `#17140F`, square
 * corners, tracked all-caps label) per hard rule #7.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("root layout error", error);
    postClientError(boundaryReport("root", error));
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F4F0E6",
          color: "#17140F",
          fontFamily:
            "'Archivo', ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "24rem",
            margin: "0 1.5rem",
            border: "1.5px solid #17140F",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              opacity: 0.55,
            }}
          >
            SOMETHING WENT WRONG
          </div>
          <p style={{ marginTop: "0.75rem", fontSize: "14px", lineHeight: 1.6 }}>
            The app hit an error it couldn&apos;t recover from. Try again — if
            it keeps happening, reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              width: "100%",
              border: "1.5px solid #17140F",
              background: "transparent",
              color: "#17140F",
              padding: "0.75rem 0",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              cursor: "pointer",
            }}
          >
            TRY AGAIN
          </button>
        </div>
      </body>
    </html>
  );
}
