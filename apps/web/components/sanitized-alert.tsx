"use client";

import React, { useState } from "react";
import { AlertCircle, Check, Copy } from "./icons";
import { SanitizedError } from "../lib/error-utils";

interface SanitizedAlertProps {
  error: string | SanitizedError | null | undefined;
  style?: React.CSSProperties;
  className?: string;
  onDismiss?: () => void;
}

export function SanitizedAlert({ error, style, className, onDismiss }: SanitizedAlertProps) {
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const message = typeof error === "string" ? error : error.message;
  const refId = typeof error === "string" ? undefined : error.refId;

  const handleCopyRef = async () => {
    if (!refId) return;
    try {
      await navigator.clipboard.writeText(refId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="alert"
      className={className}
      style={{
        padding: "12px 16px",
        backgroundColor: "rgba(225, 29, 72, 0.12)",
        border: "1px solid rgba(244, 63, 94, 0.35)",
        borderRadius: "10px",
        color: "#fda4af",
        fontSize: "13.5px",
        lineHeight: 1.5,
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        marginBottom: "18px",
        ...style,
      }}
    >
      <AlertCircle size={18} color="#f43f5e" style={{ flexShrink: 0, marginTop: "2px" }} />
      <div style={{ flex: 1 }}>
        <div>{message}</div>
        {refId && (
          <div
            style={{
              marginTop: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              color: "#94a3b8",
              backgroundColor: "rgba(15, 23, 42, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "2px 8px",
              borderRadius: "4px",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            <span>Ref: #{refId}</span>
            <button
              type="button"
              onClick={handleCopyRef}
              style={{
                background: "none",
                border: "none",
                padding: "0 2px",
                color: copied ? "#34d399" : "#38bdf8",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                fontSize: "10.5px",
              }}
              title="Copy error reference code"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: "2px",
            lineHeight: 1,
          }}
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}
