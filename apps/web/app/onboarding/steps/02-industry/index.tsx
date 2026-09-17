"use client";

import React from "react";
import { ReferenceIndustryDto } from "@bookpro/contracts";
import { Sparkles, CheckCircle2 } from "../../../../components/icons";

interface StepIndustryProps {
    selectedIndustry: string;
    industries: ReferenceIndustryDto[];
    onSelect: (industryName: string) => void;
    error?: string;
}

export function StepIndustry({
    selectedIndustry,
    industries,
    onSelect,
    error,
}: StepIndustryProps) {
    return (
        <div>
            <div style={{ marginBottom: "16px" }}>
                <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: 0 }}>
                    Select your primary business vertical. BookPro uses this to configure workflow presets, appointment durations, and scheduling defaults.
                </p>
            </div>

            {error && (
                <p role="alert" style={{ color: "#fb7185", fontSize: "13px", marginBottom: "16px" }}>
                    {error}
                </p>
            )}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: "14px",
                }}
            >
                {industries.map((ind) => {
                    const isSelected = selectedIndustry === ind.name || selectedIndustry === ind.slug;
                    return (
                        <div
                            key={ind.id || ind.slug}
                            onClick={() => onSelect(ind.name)}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === " " || e.key === "Enter") {
                                    e.preventDefault();
                                    onSelect(ind.name);
                                }
                            }}
                            style={{
                                padding: "16px",
                                borderRadius: "12px",
                                border: isSelected
                                    ? "2px solid #38bdf8"
                                    : "1px solid rgba(255, 255, 255, 0.08)",
                                backgroundColor: isSelected
                                    ? "rgba(2, 132, 199, 0.16)"
                                    : "rgba(15, 23, 42, 0.6)",
                                cursor: "pointer",
                                boxShadow: isSelected ? "0 0 20px rgba(2, 132, 199, 0.3)" : "none",
                                transition: "all 0.15s ease",
                                outline: "none",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                            }}
                        >
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                                    <strong style={{ color: "#f8fafc", fontSize: "14.5px" }}>{ind.name}</strong>
                                    {isSelected && <CheckCircle2 size={16} color="#38bdf8" />}
                                </div>
                                <span style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.4", display: "block" }}>
                                    {ind.description}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: "20px", padding: "12px 16px", backgroundColor: "rgba(56, 189, 248, 0.06)", borderRadius: "10px", border: "1px solid rgba(56, 189, 248, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#38bdf8", fontSize: "12.5px" }}>
                    <Sparkles size={16} />
                    <span>You can customize every service, buffer, deposit, and resource rule at any time.</span>
                </div>
            </div>
        </div>
    );
}
