/* Hallmark · macrostructure: System Exception Diagnostic Frame · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S4 R5 V5
 */
"use client";

import React, { useEffect } from "react";
import { Button, Card, Badge } from "@bookpro/ui";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Web Application Error Boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-paper)",
        color: "var(--color-ink)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        position: "relative",
      }}
    >
      <div style={{ width: "100%", maxWidth: "540px", position: "relative", zIndex: 10 }}>
        <Card
          style={{
            borderColor: "oklch(63% 0.22 25 / 50%)",
            boxShadow: "0 0 30px 0 oklch(63% 0.22 25 / 20%)",
            padding: "2.5rem 2rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <Badge variant="error">CRITICAL // RENDER_EXCEPTION</Badge>
            {error.digest && (
              <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono)", color: "var(--color-ink-dim)" }}>
                DIGEST: {error.digest}
              </span>
            )}
          </div>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "0.75rem" }}>
            System Exception Intercepted
          </h1>

          <p style={{ color: "var(--color-ink-muted)", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            An unexpected error occurred during page rendering. The error context has been captured.
          </p>

          {/* Exception Details Box */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "oklch(14% 0.02 260)",
              border: "1px solid var(--color-border-subtle)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--color-danger)",
              marginBottom: "1.75rem",
              wordBreak: "break-word",
            }}
          >
            {error.message || "Unknown client execution exception."}
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <Button variant="primary" size="md" onClick={() => reset()}>
              Re-attempt Rendering
            </Button>
            <Button variant="secondary" size="md" onClick={() => (window.location.href = "/")}>
              Return to Safety
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
