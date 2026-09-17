"use client";

import React from "react";
import { SaveState } from "../_hooks/use-save-status";
import { ClockSpinner } from "../../../components/animated-svgs";
import { CheckCircle2, AlertCircle } from "../../../components/icons";

interface SaveStatusIndicatorProps {
    saveState: SaveState;
    errorMessage?: string | null;
    onRetry?: () => void;
}

export function SaveStatusIndicator({ saveState, errorMessage, onRetry }: SaveStatusIndicatorProps) {
    if (saveState === "idle") return null;

    if (saveState === "saving") {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "#94a3b8",
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
                aria-live="polite"
            >
                <ClockSpinner size={14} />
                <span>Saving changes…</span>
            </div>
        );
    }

    if (saveState === "saved") {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "#34d399",
                    backgroundColor: "rgba(5, 150, 105, 0.12)",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "1px solid rgba(5, 150, 105, 0.3)",
                }}
                aria-live="polite"
            >
                <CheckCircle2 size={14} color="#34d399" />
                <span>Saved</span>
            </div>
        );
    }

    if (saveState === "error") {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "#fb7185",
                    backgroundColor: "rgba(225, 29, 72, 0.12)",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "1px solid rgba(225, 29, 72, 0.3)",
                }}
                role="alert"
            >
                <AlertCircle size={14} color="#fb7185" />
                <span>{errorMessage || "Couldn't save changes"}</span>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#38bdf8",
                            fontWeight: 700,
                            cursor: "pointer",
                            fontSize: "12px",
                            padding: 0,
                            textDecoration: "underline",
                        }}
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    return null;
}
