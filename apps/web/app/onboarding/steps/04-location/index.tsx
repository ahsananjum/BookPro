"use client";

import React from "react";
import { ReferenceCountryDto } from "@bookpro/contracts";

export interface LocationOperatingDay {
    active: boolean;
    open: string;
    close: string;
}

export interface LocationData {
    name: string;
    slug: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
    taxRatePct: string;
    instructions: string;
    operatingHours: Record<string, LocationOperatingDay>;
}

interface StepLocationProps {
    data: LocationData;
    countries: ReferenceCountryDto[];
    onChange: (field: keyof LocationData, value: any) => void;
    errors: Partial<Record<keyof LocationData, string>>;
}

const DAYS_OF_WEEK = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
];

export function StepLocation({
    data,
    countries,
    onChange,
    errors,
}: StepLocationProps) {
    const handleNameChange = (val: string) => {
        onChange("name", val);
        const autoSlug = val
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        onChange("slug", autoSlug || "main-branch");
    };

    const handleDayToggle = (dayKey: string, active: boolean) => {
        onChange("operatingHours", {
            ...data.operatingHours,
            [dayKey]: {
                ...(data.operatingHours[dayKey] || { open: "09:00", close: "18:00" }),
                active,
            },
        });
    };

    const handleDayTimeChange = (dayKey: string, field: "open" | "close", val: string) => {
        onChange("operatingHours", {
            ...data.operatingHours,
            [dayKey]: {
                ...(data.operatingHours[dayKey] || { open: "09:00", close: "18:00", active: true }),
                [field]: val,
            },
        });
    };

    const copyMondayToWeekdays = () => {
        const mon = data.operatingHours.monday || { active: true, open: "09:00", close: "18:00" };
        const updated = { ...data.operatingHours };
        ["tuesday", "wednesday", "thursday", "friday"].forEach((d) => {
            updated[d] = { ...mon };
        });
        onChange("operatingHours", updated);
    };

    return (
        <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                    <label
                        htmlFor="loc-name"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Location / Branch Name <span style={{ color: "#38bdf8" }}>*</span>
                    </label>
                    <input
                        id="loc-name"
                        type="text"
                        value={data.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="e.g. Downtown Main Branch"
                        required
                        aria-invalid={!!errors.name}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: errors.name ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                    {errors.name && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                            {errors.name}
                        </p>
                    )}
                </div>

                <div>
                    <label
                        htmlFor="loc-tax"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Sales Tax Rate (%)
                    </label>
                    <input
                        id="loc-tax"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={data.taxRatePct}
                        onChange={(e) => onChange("taxRatePct", e.target.value)}
                        placeholder="e.g. 5.0"
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <label
                        htmlFor="loc-address"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Street Address
                    </label>
                    <input
                        id="loc-address"
                        type="text"
                        value={data.address}
                        onChange={(e) => onChange("address", e.target.value)}
                        placeholder="e.g. 100 Main Boulevard, Suite 400"
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>

                <div>
                    <label
                        htmlFor="loc-city"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        City
                    </label>
                    <input
                        id="loc-city"
                        type="text"
                        value={data.city}
                        onChange={(e) => onChange("city", e.target.value)}
                        placeholder="e.g. New York / Lahore"
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>

                <div>
                    <label
                        htmlFor="loc-postal"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Postal / ZIP Code
                    </label>
                    <input
                        id="loc-postal"
                        type="text"
                        value={data.postalCode}
                        onChange={(e) => onChange("postalCode", e.target.value)}
                        placeholder="e.g. 10001 / 54000"
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <label
                        htmlFor="loc-instructions"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Customer Arrival & Parking Notes
                    </label>
                    <input
                        id="loc-instructions"
                        type="text"
                        value={data.instructions}
                        onChange={(e) => onChange("instructions", e.target.value)}
                        placeholder="e.g. Parking available behind the building. Ring buzzer #4 for entrance."
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>
            </div>

            {/* Operating Hours Schedule */}
            <div style={{ marginTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div>
                        <label style={{ fontSize: "13px", fontWeight: 700, color: "#cbd5e1", display: "block" }}>
                            Location Operating Hours
                        </label>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                            General open & closing schedule for this branch.
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={copyMondayToWeekdays}
                        style={{
                            padding: "6px 12px",
                            backgroundColor: "rgba(56, 189, 248, 0.08)",
                            border: "1px solid rgba(56, 189, 248, 0.25)",
                            borderRadius: "6px",
                            color: "#38bdf8",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        Copy Mon to Mon–Fri
                    </button>
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                    {DAYS_OF_WEEK.map(({ key, label }) => {
                        const setting = data.operatingHours[key] || { active: false, open: "09:00", close: "18:00" };
                        return (
                            <div
                                key={key}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 16px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255, 255, 255, 0.08)",
                                    backgroundColor: setting.active ? "rgba(2, 132, 199, 0.08)" : "rgba(15, 23, 42, 0.4)",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "130px" }}>
                                    <input
                                        type="checkbox"
                                        id={`loc-day-${key}`}
                                        checked={setting.active}
                                        onChange={(e) => handleDayToggle(key, e.target.checked)}
                                        style={{ width: "16px", height: "16px", accentColor: "#0284c7" }}
                                    />
                                    <label htmlFor={`loc-day-${key}`} style={{ color: "#f8fafc", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>
                                        {label}
                                    </label>
                                </div>

                                {setting.active ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <input
                                            type="time"
                                            value={setting.open}
                                            onChange={(e) => handleDayTimeChange(key, "open", e.target.value)}
                                            style={{
                                                padding: "6px 10px",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                backgroundColor: "#0f172a",
                                                color: "#fff",
                                                fontSize: "13px",
                                            }}
                                        />
                                        <span style={{ color: "#64748b", fontSize: "12px" }}>to</span>
                                        <input
                                            type="time"
                                            value={setting.close}
                                            onChange={(e) => handleDayTimeChange(key, "close", e.target.value)}
                                            style={{
                                                padding: "6px 10px",
                                                borderRadius: "6px",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                backgroundColor: "#0f172a",
                                                color: "#fff",
                                                fontSize: "13px",
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <span style={{ color: "#64748b", fontSize: "12px" }}>Closed</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
