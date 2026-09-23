"use client";

import React from "react";

export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.25rem",
          padding: "2.5rem 3rem",
          borderRadius: "1rem",
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ position: "relative", width: "48px", height: "48px" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "3px solid rgba(56, 189, 248, 0.15)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "3px solid transparent",
              borderTopColor: "#38bdf8",
              borderRightColor: "#0284c7",
              animation: "spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite",
            }}
          />
        </div>

        <div style={{ textAlign: "center" }}>
          <div
            style={{
              color: "#f8fafc",
              fontSize: "0.9375rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Loading Workspace
          </div>
          <div
            style={{
              color: "#94a3b8",
              fontSize: "0.75rem",
              fontFamily: "ui-monospace, monospace",
              marginTop: "0.25rem",
            }}
          >
            Synchronizing state...
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
