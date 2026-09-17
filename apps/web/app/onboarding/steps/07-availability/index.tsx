"use client";

import React from "react";
import { Clock, User, MapPin, Globe } from "../../../../components/icons";

export interface DayAvailability {
    active: boolean;
    start: string;
    end: string;
}

export type WeeklyAvailabilityState = Record<number, DayAvailability>;

interface StepAvailabilityProps {
    availability: WeeklyAvailabilityState;
    staffName: string;
    locationName?: string;
    timezone?: string;
    onChange: (day: number, field: keyof DayAvailability, val: any) => void;
    onApplyWeekdays: () => void;
    error?: string;
}

const DAYS_MAP = [
    { day: 1, name: "Monday" },
    { day: 2, name: "Tuesday" },
    { day: 3, name: "Wednesday" },
    { day: 4, name: "Thursday" },
    { day: 5, name: "Friday" },
    { day: 6, name: "Saturday" },
    { day: 0, name: "Sunday" },
];

export function StepAvailability({
    availability,
    staffName,
    locationName,
    timezone,
    onChange,
    onApplyWeekdays,
    error,
}: StepAvailabilityProps) {
    return (
        <div>
            {/* Context Badge */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "12px 16px",
                    backgroundColor: "rgba(15, 23, 42, 0.7)",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    marginBottom: "20px",
                    flexWrap: "wrap",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#f8fafc" }}>
                    <User size={15} color="#38bdf8" />
                    <span>Staff: <strong>{staffName || "Service Provider"}</strong></span>
                </div>
                {locationName && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#f8fafc" }}>
                        <MapPin size={15} color="#34d399" />
                        <span>Location: <strong>{locationName}</strong></span>
                    </div>
                )}
                {timezone && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#94a3b8" }}>
                        <Globe size={15} />
                        <span>Time Zone: <strong>{timezone}</strong></span>
                    </div>
                )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <p style={{ color: "#94a3b8", fontSize: "13.5px", margin: 0 }}>
                    Define the recurring weekly working shifts when this provider is available for bookings.
                </p>
                <button
                    type="button"
                    onClick={onApplyWeekdays}
                    style={{
                        padding: "6px 14px",
                        backgroundColor: "rgba(56, 189, 248, 0.1)",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        borderRadius: "6px",
                        color: "#38bdf8",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    Copy Mon to Mon–Fri
                </button>
            </div>

            {error && (
                <p role="alert" style={{ color: "#fb7185", fontSize: "13px", marginBottom: "16px" }}>
                    {error}
                </p>
            )}

            <div style={{ display: "grid", gap: "8px" }}>
                {DAYS_MAP.map(({ day, name }) => {
                    const setting = availability[day] || { active: false, start: "09:00", end: "17:00" };
                    return (
                        <div
                            key={day}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "12px 18px",
                                borderRadius: "10px",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                backgroundColor: setting.active ? "rgba(2, 132, 199, 0.08)" : "rgba(15, 23, 42, 0.4)",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "140px" }}>
                                <input
                                    type="checkbox"
                                    id={`avail-day-${day}`}
                                    checked={setting.active}
                                    onChange={(e) => onChange(day, "active", e.target.checked)}
                                    style={{ width: "18px", height: "18px", accentColor: "#0284c7" }}
                                />
                                <label htmlFor={`avail-day-${day}`} style={{ color: "#f8fafc", fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}>
                                    {name}
                                </label>
                            </div>

                            {setting.active ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <input
                                        type="time"
                                        value={setting.start}
                                        onChange={(e) => onChange(day, "start", e.target.value)}
                                        style={{
                                            padding: "6px 12px",
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
                                        value={setting.end}
                                        onChange={(e) => onChange(day, "end", e.target.value)}
                                        style={{
                                            padding: "6px 12px",
                                            borderRadius: "6px",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                            backgroundColor: "#0f172a",
                                            color: "#fff",
                                            fontSize: "13px",
                                        }}
                                    />
                                </div>
                            ) : (
                                <span style={{ color: "#64748b", fontSize: "13px" }}>Off duty</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
