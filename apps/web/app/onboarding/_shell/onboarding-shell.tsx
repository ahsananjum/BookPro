"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ONBOARDING_STEPS, OnboardingProgress } from "./onboarding-progress";
import { MobileProgressBar } from "./mobile-progress-bar";
import { SaveStatusIndicator } from "./save-status-indicator";
import { SaveState } from "../_hooks/use-save-status";
import { GlassCard } from "../../../components/glass-card";
import { FloatingParticles } from "../../../components/animated-svgs";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from "../../../components/icons";

interface OnboardingShellProps {
    currentStep: number;
    completedSteps: string[];
    saveState: SaveState;
    errorMessage?: string | null;
    successMessage?: string | null;
    loading?: boolean;
    isPublished?: boolean;
    onStepChange: (stepId: number) => void;
    onNext: () => void;
    onPrev: () => void;
    onSaveAndExit: () => void;
    onSkip?: () => void;
    children: React.ReactNode;
}

export function OnboardingShell({
    currentStep,
    completedSteps,
    saveState,
    errorMessage,
    successMessage,
    loading = false,
    isPublished = false,
    onStepChange,
    onNext,
    onPrev,
    onSaveAndExit,
    onSkip,
    children,
}: OnboardingShellProps) {
    const router = useRouter();
    const headingRef = useRef<HTMLHeadingElement>(null);
    const activeStepObj = ONBOARDING_STEPS.find((s) => s.id === currentStep) || ONBOARDING_STEPS[0];
    const ActiveIcon = activeStepObj.icon;
    const isFirstStep = currentStep === 1;
    const isLastStep = currentStep === ONBOARDING_STEPS.length;
    const isOptional = activeStepObj.optional;

    useEffect(() => {
        if (headingRef.current) {
            headingRef.current.focus();
        }
    }, [currentStep]);

    return (
        <div className="glass-container" style={{ minHeight: "100vh", position: "relative", backgroundColor: "#060913" }}>
            <FloatingParticles count={12} />

            {/* Top Global Header */}
            <header
                style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    backgroundColor: "rgba(10, 15, 26, 0.9)",
                    backdropFilter: "blur(20px)",
                    padding: "14px 28px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    position: "sticky",
                    top: 0,
                    zIndex: 30,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Link
                        href="/app"
                        style={{
                            textDecoration: "none",
                            color: "#f8fafc",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <span
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "linear-gradient(135deg, #0284c7, #7c3aed)",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 900,
                                color: "#fff",
                                fontSize: "16px",
                            }}
                        >
                            B
                        </span>
                        <span style={{ fontWeight: 800, fontSize: "18px" }}>
                            Book<span style={{ color: "#38bdf8" }}>Pro</span>
                        </span>
                    </Link>
                    <span style={{ color: "#475569" }}>/</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#94a3b8" }}>
                        Guided Business Setup
                    </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <SaveStatusIndicator saveState={saveState} errorMessage={errorMessage} />
                    <button
                        onClick={onSaveAndExit}
                        disabled={loading}
                        style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#94a3b8",
                            backgroundColor: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            borderRadius: "8px",
                            padding: "6px 14px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                        }}
                    >
                        Save & exit
                    </button>
                </div>
            </header>

            {/* Mobile Progress Bar (< 768px) */}
            <div className="onboarding-mobile-bar">
                <MobileProgressBar
                    currentStep={currentStep}
                    completedSteps={completedSteps}
                    onStepClick={onStepChange}
                />
            </div>

            {/* Main Layout Grid */}
            <div
                className="onboarding-main-layout"
                style={{
                    maxWidth: "1160px",
                    margin: "28px auto",
                    padding: "0 20px 60px",
                    display: "grid",
                    gridTemplateColumns: "280px 1fr",
                    gap: "28px",
                    position: "relative",
                    zIndex: 10,
                }}
            >
                {/* Desktop Left Sidebar */}
                <aside className="onboarding-sidebar">
                    <OnboardingProgress
                        currentStep={currentStep}
                        completedSteps={completedSteps}
                        onStepClick={onStepChange}
                    />
                </aside>

                {/* Right Step Content Container */}
                <main style={{ minWidth: 0 }}>
                    <GlassCard variant="elevated" glow="primary" style={{ padding: "32px" }}>
                        {/* Step Header */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                marginBottom: "24px",
                                paddingBottom: "18px",
                                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                            }}
                        >
                            <div
                                style={{
                                    width: "52px",
                                    height: "52px",
                                    borderRadius: "14px",
                                    background: "linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(124, 58, 237, 0.2))",
                                    border: "1px solid rgba(56, 189, 248, 0.4)",
                                    display: "grid",
                                    placeItems: "center",
                                    color: "#38bdf8",
                                    flexShrink: 0,
                                }}
                            >
                                <ActiveIcon size={26} />
                            </div>
                            <div>
                                <span
                                    style={{
                                        fontSize: "11px",
                                        fontWeight: 800,
                                        color: "#38bdf8",
                                        letterSpacing: "0.06em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Step {currentStep} of {ONBOARDING_STEPS.length}
                                </span>
                                <h2
                                    ref={headingRef}
                                    tabIndex={-1}
                                    style={{
                                        fontSize: "22px",
                                        fontWeight: 800,
                                        color: "#f8fafc",
                                        margin: "2px 0 0",
                                        outline: "none",
                                    }}
                                >
                                    {activeStepObj.title}
                                </h2>
                                <p style={{ color: "#94a3b8", fontSize: "13px", margin: "2px 0 0" }}>
                                    {activeStepObj.desc}
                                </p>
                            </div>
                        </div>

                        {/* Top Error Alert Banner */}
                        {errorMessage && (
                            <div
                                style={{
                                    padding: "12px 16px",
                                    backgroundColor: "rgba(225, 29, 72, 0.15)",
                                    border: "1px solid rgba(225, 29, 72, 0.4)",
                                    borderRadius: "10px",
                                    color: "#fb7185",
                                    marginBottom: "20px",
                                    fontSize: "13.5px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                }}
                                role="alert"
                            >
                                <AlertCircle size={18} />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        {/* Top Success Alert Banner */}
                        {successMessage && (
                            <div
                                style={{
                                    padding: "12px 16px",
                                    backgroundColor: "rgba(5, 150, 105, 0.15)",
                                    border: "1px solid rgba(5, 150, 105, 0.4)",
                                    borderRadius: "10px",
                                    color: "#34d399",
                                    marginBottom: "20px",
                                    fontSize: "13.5px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                }}
                            >
                                <CheckCircle2 size={18} />
                                <span>{successMessage}</span>
                            </div>
                        )}

                        {/* Step Form Content with smooth hardware-accelerated fade-in transition */}
                        <div key={currentStep} className="step-transition-container" style={{ minHeight: "280px" }}>
                            {children}
                        </div>

                        {/* Navigation Footer Controls (hidden if already published on step 11) */}
                        {!(isLastStep && isPublished) && (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginTop: "32px",
                                    paddingTop: "20px",
                                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                                    flexWrap: "wrap",
                                    gap: "12px",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={onPrev}
                                    disabled={isFirstStep || loading}
                                    style={{
                                        padding: "11px 18px",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(255, 255, 255, 0.12)",
                                        backgroundColor: isFirstStep ? "rgba(15, 23, 42, 0.3)" : "rgba(15, 23, 42, 0.8)",
                                        color: isFirstStep ? "#475569" : "#cbd5e1",
                                        cursor: isFirstStep || loading ? "not-allowed" : "pointer",
                                        fontWeight: 700,
                                        fontSize: "13.5px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                    }}
                                >
                                    <ArrowLeft size={16} /> Back
                                </button>

                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    {isOptional && onSkip && (
                                        <button
                                            type="button"
                                            onClick={onSkip}
                                            disabled={loading}
                                            style={{
                                                padding: "11px 18px",
                                                borderRadius: "8px",
                                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                                backgroundColor: "transparent",
                                                color: "#94a3b8",
                                                cursor: loading ? "not-allowed" : "pointer",
                                                fontWeight: 600,
                                                fontSize: "13.5px",
                                            }}
                                        >
                                            Skip for now
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={onNext}
                                        disabled={loading}
                                        style={{
                                            padding: "12px 24px",
                                            borderRadius: "10px",
                                            border: "none",
                                            background: isLastStep
                                                ? "linear-gradient(135deg, #059669, #10b981)"
                                                : "linear-gradient(135deg, #0284c7, #2563eb)",
                                            color: "#fff",
                                            fontWeight: 800,
                                            fontSize: "14px",
                                            cursor: loading ? "not-allowed" : "pointer",
                                            opacity: loading ? 0.7 : 1,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            boxShadow: isLastStep
                                                ? "0 4px 20px rgba(16, 185, 129, 0.35)"
                                                : "0 4px 20px rgba(2, 132, 199, 0.35)",
                                        }}
                                    >
                                        {loading ? (
                                            "Saving…"
                                        ) : isLastStep ? (
                                            "🚀 Publish Booking Page"
                                        ) : (
                                            <>
                                                Continue <ArrowRight size={16} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </GlassCard>
                </main>
            </div>

            {/* Responsive Media Query Styles */}
            <style jsx>{`
                @media (max-width: 768px) {
                    .onboarding-sidebar {
                        display: none !important;
                    }
                    .onboarding-mobile-bar {
                        display: block !important;
                    }
                    .onboarding-main-layout {
                        grid-template-columns: 1fr !important;
                        margin: 12px auto !important;
                        padding: 0 12px 40px !important;
                    }
                }
            `}</style>
        </div>
    );
}
