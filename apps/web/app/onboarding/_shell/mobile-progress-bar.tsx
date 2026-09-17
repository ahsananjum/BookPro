"use client";

import React, { useState } from "react";
import { ONBOARDING_STEPS } from "./onboarding-progress";
import { PulsingDot } from "../../../components/animated-svgs";

interface MobileProgressBarProps {
    currentStep: number;
    completedSteps: string[];
    onStepClick: (stepId: number) => void;
}

export function MobileProgressBar({ currentStep, completedSteps, onStepClick }: MobileProgressBarProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const activeStep = ONBOARDING_STEPS.find((s) => s.id === currentStep) || ONBOARDING_STEPS[0];
    const totalSteps = ONBOARDING_STEPS.length;
    const pct = Math.round((currentStep / totalSteps) * 100);

    return (
        <>
            <div
                style={{
                    backgroundColor: "rgba(10, 15, 26, 0.95)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                        <PulsingDot color="#38bdf8" size={4} />
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Step {currentStep} of {totalSteps}
                        </span>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc" }}>
                        {activeStep.title}
                    </div>
                </div>

                <button
                    onClick={() => setDrawerOpen(true)}
                    style={{
                        padding: "6px 12px",
                        backgroundColor: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "8px",
                        color: "#94a3b8",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    View Steps
                </button>
            </div>

            {/* Progress track */}
            <div style={{ height: "3px", width: "100%", backgroundColor: "rgba(255, 255, 255, 0.06)" }}>
                <div
                    style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, #0284c7, #38bdf8)",
                        transition: "width 0.3s ease",
                    }}
                />
            </div>

            {/* Drawer Modal */}
            {drawerOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.75)",
                        backdropFilter: "blur(8px)",
                        zIndex: 100,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                    }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="All onboarding steps"
                >
                    <div
                        style={{
                            backgroundColor: "#0f172a",
                            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
                            borderTopLeftRadius: "16px",
                            borderTopRightRadius: "16px",
                            padding: "20px",
                            maxHeight: "80vh",
                            overflowY: "auto",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <strong style={{ color: "#f8fafc", fontSize: "16px" }}>All Setup Steps</strong>
                            <button
                                onClick={() => setDrawerOpen(false)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "#94a3b8",
                                    fontSize: "18px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: "grid", gap: "6px" }}>
                            {ONBOARDING_STEPS.map((step) => {
                                const isCurrent = step.id === currentStep;
                                const isDone = completedSteps.includes(step.code);
                                const isAccessible = isDone || step.id <= currentStep;

                                return (
                                    <button
                                        key={step.id}
                                        onClick={() => {
                                            if (isAccessible) {
                                                onStepClick(step.id);
                                                setDrawerOpen(false);
                                            }
                                        }}
                                        disabled={!isAccessible}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "12px",
                                            padding: "10px 12px",
                                            borderRadius: "10px",
                                            border: isCurrent
                                                ? "1px solid rgba(56, 189, 248, 0.4)"
                                                : "1px solid transparent",
                                            backgroundColor: isCurrent
                                                ? "rgba(2, 132, 199, 0.15)"
                                                : isDone
                                                ? "rgba(5, 150, 105, 0.08)"
                                                : "transparent",
                                            color: isCurrent ? "#38bdf8" : isDone ? "#34d399" : isAccessible ? "#cbd5e1" : "#475569",
                                            cursor: isAccessible ? "pointer" : "not-allowed",
                                            textAlign: "left",
                                            width: "100%",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: "26px",
                                                height: "26px",
                                                borderRadius: "50%",
                                                display: "grid",
                                                placeItems: "center",
                                                fontSize: "11px",
                                                fontWeight: 800,
                                                backgroundColor: isCurrent ? "#0284c7" : isDone ? "#059669" : "#1e293b",
                                                color: "#fff",
                                            }}
                                        >
                                            {isDone ? "✓" : step.id}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "13px", fontWeight: 700 }}>{step.title}</div>
                                            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{step.desc}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
