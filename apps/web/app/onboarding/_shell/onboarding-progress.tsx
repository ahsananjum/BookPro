"use client";

import React from "react";
import { GlassCard } from "../../../components/glass-card";
import { PulsingDot } from "../../../components/animated-svgs";
import {
    Building,
    Briefcase,
    Globe,
    CreditCard,
    Palette,
    ShieldAlert,
    Rocket,
    Clock,
    MapPin,
    Users,
    Scissors,
} from "../../../components/icons";

export interface StepDefinition {
    id: number;
    code: string;
    title: string;
    desc: string;
    icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
    optional?: boolean;
}

export const ONBOARDING_STEPS: StepDefinition[] = [
    { id: 1, code: "BUSINESS_DETAILS", title: "Business Details", icon: Building, desc: "Organization identity & primary contact" },
    { id: 2, code: "INDUSTRY", title: "Industry / Template", icon: Briefcase, desc: "Business vertical & booking presets" },
    { id: 3, code: "REGIONAL_SETTINGS", title: "Time Zone & Currency", icon: Globe, desc: "Scheduling clock & billing currency" },
    { id: 4, code: "LOCATION", title: "First Location", icon: MapPin, desc: "Physical branch, tax rate & hours" },
    { id: 5, code: "SERVICE", title: "First Service", icon: Scissors, desc: "Duration, authoritative price & buffer" },
    { id: 6, code: "STAFF", title: "First Staff Member", icon: Users, desc: "Practitioner profile & role link" },
    { id: 7, code: "AVAILABILITY", title: "Availability", icon: Clock, desc: "Weekly recurring operating schedule" },
    { id: 8, code: "PAYMENT", title: "Payment Setup", icon: CreditCard, desc: "Stripe Connect payout gateway", optional: true },
    { id: 9, code: "BRANDING", title: "Branding", icon: Palette, desc: "Logo asset upload & brand colors" },
    { id: 10, code: "POLICY", title: "Booking Policy", icon: ShieldAlert, desc: "Notice, cancellation & hold rules" },
    { id: 11, code: "PUBLISH", title: "Publish Booking Page", icon: Rocket, desc: "Domain integrity audit & live launch" },
];

interface OnboardingProgressProps {
    currentStep: number;
    completedSteps: string[];
    onStepClick: (stepId: number) => void;
}

export function OnboardingProgress({ currentStep, completedSteps, onStepClick }: OnboardingProgressProps) {
    const totalSteps = ONBOARDING_STEPS.length;
    const completedCount = completedSteps.length;
    const pct = Math.round((completedCount / totalSteps) * 100);

    return (
        <GlassCard variant="panel" glow="none" style={{ position: "sticky", top: "96px", padding: "20px" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <PulsingDot color="#38bdf8" size={5} />
                    <span style={{ fontSize: "11.5px", fontWeight: 800, color: "#38bdf8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Step {currentStep} of {totalSteps}
                    </span>
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>
                    {pct}% complete
                </span>
            </div>

            {/* Micro Progress Track */}
            <div
                style={{
                    width: "100%",
                    height: "4px",
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    borderRadius: "2px",
                    marginBottom: "16px",
                    overflow: "hidden",
                }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Onboarding completion progress"
            >
                <div
                    style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #0284c7, #38bdf8)",
                        borderRadius: "2px",
                        transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                />
            </div>

            <nav style={{ display: "grid", gap: "4px" }} aria-label="Onboarding steps navigation">
                {ONBOARDING_STEPS.map((step) => {
                    const isCurrent = step.id === currentStep;
                    const isDone = completedSteps.includes(step.code);
                    const isAccessible = isDone || step.id <= currentStep;

                    return (
                        <button
                            key={step.id}
                            onClick={() => {
                                if (isAccessible) onStepClick(step.id);
                            }}
                            disabled={!isAccessible}
                            aria-current={isCurrent ? "step" : undefined}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                border: isCurrent
                                    ? "1px solid rgba(56, 189, 248, 0.4)"
                                    : "1px solid transparent",
                                backgroundColor: isCurrent
                                    ? "rgba(2, 132, 199, 0.15)"
                                    : isDone
                                    ? "rgba(5, 150, 105, 0.06)"
                                    : "transparent",
                                color: isCurrent ? "#38bdf8" : isDone ? "#34d399" : isAccessible ? "#94a3b8" : "#475569",
                                cursor: isAccessible ? "pointer" : "not-allowed",
                                textAlign: "left",
                                width: "100%",
                                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                            }}
                        >
                            <div
                                style={{
                                    width: "24px",
                                    height: "24px",
                                    borderRadius: "50%",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    backgroundColor: isCurrent ? "#0284c7" : isDone ? "#059669" : isAccessible ? "#1e293b" : "rgba(15, 23, 42, 0.5)",
                                    color: isAccessible ? "#fff" : "#475569",
                                    flexShrink: 0,
                                }}
                            >
                                {isDone ? "✓" : step.id}
                            </div>

                            <div style={{ minWidth: 0, overflow: "hidden" }}>
                                <div
                                    style={{
                                        fontSize: "12.5px",
                                        fontWeight: isCurrent ? 800 : 600,
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                        overflow: "hidden",
                                    }}
                                >
                                    {step.title}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </nav>
        </GlassCard>
    );
}
