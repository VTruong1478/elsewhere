"use client";

import { useEffect } from "react";
import { captureEvent } from "@/lib/analytics";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, which
 * app/error.tsx sits inside of and therefore cannot catch.
 *
 * Replaces the whole document, so it must render its own <html>/<body>. Styles
 * are inline because globals.css is loaded by the root layout — the very thing
 * that has failed by the time this renders — so design tokens are unavailable.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);

    if (process.env.NODE_ENV === "production") {
      captureEvent("error_boundary_shown", {
        error_message: error.message,
        ...(error.digest ? { error_digest: error.digest } : {}),
        pathname: "global-error",
      });
    }
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
          padding: "24px",
          backgroundColor: "#EFEBE0",
          color: "#2F2F2F",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "8px", lineHeight: 1.5, color: "#6B6A62" }}>
            Elsewhere failed to load. Try again — if it keeps happening, reload
            the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "24px",
              padding: "12px 24px",
              border: "none",
              borderRadius: "8px",
              backgroundColor: "#4F5D3F",
              color: "#FFFFFF",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
