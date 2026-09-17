/* Hallmark · macrostructure: Tactical Minimal Poster · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S4 R5 V5
 */
import React from "react";
import Link from "next/link";
import { Button, Card, Badge } from "@bookpro/ui";

export default function NotFound() {
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
        overflow: "hidden",
      }}
    >
      {/* Background Radial Element */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, oklch(58% 0.22 264 / 10%), transparent 70%)",
          filter: "blur(80px)",
          pointerEvents: "none",
        }}
      />

      <div style={{ width: "100%", maxWidth: "520px", position: "relative", zIndex: 10 }}>
        <Card glow style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <div style={{ display: "inline-block", marginBottom: "1rem" }}>
            <Badge variant="warning">404 // ROUTE_NOT_FOUND</Badge>
          </div>

          <h1
            style={{
              fontSize: "5rem",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              background: "linear-gradient(135deg, var(--color-ink), var(--color-accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "1rem",
            }}
          >
            404
          </h1>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem", letterSpacing: "-0.01em" }}>
            Unmapped Navigation Target
          </h2>

          <p style={{ color: "var(--color-ink-muted)", fontSize: "0.875rem", marginBottom: "2rem", lineHeight: 1.6 }}>
            The requested path does not correspond to an active route or resource in the BookPro platform workspace.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: "1rem" }}>
            <Link href="/" passHref legacyBehavior>
              <Button variant="primary" size="md">
                Return to Control Console
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
