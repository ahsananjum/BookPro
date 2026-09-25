"use client";

import React from "react";
import { Scissors, MapPin } from "../../../../components/icons";

export interface ServiceData {
    name: string;
    description: string;
    category?: string;
    imageUrl?: string;
    durationMin: number;
    price: string;
    currency: string;
    bufferAfterMin?: number;
    preBufferMin?: number;
    postBufferMin?: number;
    depositType: "NONE" | "PERCENTAGE" | "FIXED";
    depositValue: string;
    capacity?: number;
    minParticipants?: number;
    maxParticipants?: number;
    preparationInstructions?: string;
    taxBehavior?: "EXCLUSIVE" | "INCLUSIVE" | "NONE";
}

interface StepServiceProps {
    data: ServiceData;
    currency: string;
    locationName?: string;
    onChange: (field: keyof ServiceData, value: any) => void;
    errors: Partial<Record<keyof ServiceData, string>>;
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];
const BUFFER_PRESETS = [0, 5, 10, 15, 30];

export function StepService({
    data,
    currency,
    locationName,
    onChange,
    errors,
}: StepServiceProps) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {locationName && (
                <div
                    style={{
                        gridColumn: "span 2",
                        padding: "10px 14px",
                        backgroundColor: "rgba(56, 189, 248, 0.08)",
                        borderRadius: "8px",
                        border: "1px solid rgba(56, 189, 248, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "13px",
                        color: "#38bdf8",
                    }}
                >
                    <MapPin size={16} />
                    <span>
                        Assigned to branch: <strong>{locationName}</strong>
                    </span>
                </div>
            )}

            <div>
                <label
                    htmlFor="svc-name"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Service Title <span style={{ color: "#38bdf8" }}>*</span>
                </label>
                <input
                    id="svc-name"
                    type="text"
                    value={data.name}
                    onChange={(e) => onChange("name", e.target.value)}
                    placeholder="e.g. Initial Consultation / Signature Haircut"
                    required
                    aria-invalid={!!errors.name}
                    style={{
                        width: "100%",
                        padding: "12px 14px",
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
                    htmlFor="svc-category"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Category (Optional)
                </label>
                <input
                    id="svc-category"
                    type="text"
                    value={data.category || ""}
                    onChange={(e) => onChange("category", e.target.value)}
                    placeholder="e.g. Wellness / Consultation / Beauty"
                    style={{
                        width: "100%",
                        padding: "12px 14px",
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
                    htmlFor="svc-desc"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Service Description (Optional)
                </label>
                <textarea
                    id="svc-desc"
                    rows={2}
                    value={data.description}
                    onChange={(e) => onChange("description", e.target.value)}
                    placeholder="Briefly explain what customers can expect during this appointment…"
                    style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#fff",
                        fontSize: "13px",
                        outline: "none",
                        resize: "vertical",
                    }}
                />
            </div>

            <div style={{ gridColumn: "span 2" }}>
                <label
                    htmlFor="svc-prep"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Client Preparation Instructions (Optional)
                </label>
                <input
                    id="svc-prep"
                    type="text"
                    value={data.preparationInstructions || ""}
                    onChange={(e) => onChange("preparationInstructions", e.target.value)}
                    placeholder="e.g. Please arrive 10 minutes before session. Wear comfortable attire."
                    style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#fff",
                        fontSize: "13px",
                        outline: "none",
                    }}
                />
            </div>

            {/* Duration Presets + Custom Input */}
            <div>
                <label
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Duration (Minutes) <span style={{ color: "#38bdf8" }}>*</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                    {DURATION_PRESETS.map((dur) => (
                        <button
                            key={dur}
                            type="button"
                            onClick={() => onChange("durationMin", dur)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: data.durationMin === dur ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.12)",
                                backgroundColor: data.durationMin === dur ? "rgba(2, 132, 199, 0.2)" : "rgba(15, 23, 42, 0.6)",
                                color: data.durationMin === dur ? "#38bdf8" : "#cbd5e1",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor: "pointer",
                            }}
                        >
                            {dur}m
                        </button>
                    ))}
                </div>
                <input
                    type="number"
                    min="1"
                    value={data.durationMin || ""}
                    onChange={(e) => onChange("durationMin", parseInt(e.target.value, 10) || 15)}
                    style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: errors.durationMin ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#fff",
                        fontSize: "13px",
                    }}
                />
                {errors.durationMin && (
                    <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.durationMin}
                    </p>
                )}
            </div>

            {/* Price Input with Currency Context */}
            <div>
                <label
                    htmlFor="svc-price"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Price ({currency || "USD"}) <span style={{ color: "#38bdf8" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                    <span
                        style={{
                            position: "absolute",
                            left: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "#94a3b8",
                            fontWeight: 700,
                            fontSize: "14px",
                        }}
                    >
                        {currency}
                    </span>
                    <input
                        id="svc-price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={data.price}
                        onChange={(e) => onChange("price", e.target.value)}
                        placeholder="0.00"
                        style={{
                            width: "100%",
                            padding: "12px 14px 12px 64px",
                            borderRadius: "8px",
                            border: errors.price ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>
                {errors.price && (
                    <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.price}
                    </p>
                )}
            </div>

            {/* Buffer Time */}
            <div>
                <label
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Clean-Up Buffer After (Minutes)
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                    {BUFFER_PRESETS.map((buf) => (
                        <button
                            key={buf}
                            type="button"
                            onClick={() => {
                                onChange("postBufferMin", buf);
                                onChange("bufferAfterMin", buf);
                            }}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: (data.postBufferMin ?? data.bufferAfterMin ?? 0) === buf ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.12)",
                                backgroundColor: (data.postBufferMin ?? data.bufferAfterMin ?? 0) === buf ? "rgba(2, 132, 199, 0.2)" : "rgba(15, 23, 42, 0.6)",
                                color: (data.postBufferMin ?? data.bufferAfterMin ?? 0) === buf ? "#38bdf8" : "#cbd5e1",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor: "pointer",
                            }}
                        >
                            {buf === 0 ? "None" : `${buf}m`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Slot Capacity */}
            <div>
                <label
                    htmlFor="svc-capacity"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Slot Capacity (Simultaneous Clients)
                </label>
                <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                    {[1, 2, 5, 10, 20].map((cap) => (
                        <button
                            key={cap}
                            type="button"
                            onClick={() => onChange("capacity", cap)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: (data.capacity || 1) === cap ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.12)",
                                backgroundColor: (data.capacity || 1) === cap ? "rgba(2, 132, 199, 0.2)" : "rgba(15, 23, 42, 0.6)",
                                color: (data.capacity || 1) === cap ? "#38bdf8" : "#cbd5e1",
                                fontWeight: 700,
                                fontSize: "12px",
                                cursor: "pointer",
                            }}
                        >
                            {cap === 1 ? "1 (Single)" : cap}
                        </button>
                    ))}
                </div>
                <input
                    id="svc-capacity"
                    type="number"
                    min="1"
                    value={data.capacity || 1}
                    onChange={(e) => onChange("capacity", Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#fff",
                        fontSize: "13px",
                    }}
                />
                <p style={{ color: "#94a3b8", fontSize: "11px", marginTop: "4px" }}>
                    {(data.capacity || 1) === 1
                        ? "Individual 1-on-1 session. Slot disappears once booked."
                        : `Group capacity of ${data.capacity || 1} attendees. Slot remains bookable until all spots fill.`}
                </p>
            </div>

            {/* Deposit Requirement Policy */}
            <div>
                <label
                    htmlFor="svc-deposit-type"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Online Deposit Policy
                </label>
                <select
                    id="svc-deposit-type"
                    value={data.depositType}
                    onChange={(e) => onChange("depositType", e.target.value as any)}
                    style={{
                        width: "100%",
                        padding: "12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "#0f172a",
                        color: "#fff",
                        fontSize: "13px",
                    }}
                >
                    <option value="NONE">No Deposit (Pay In Person)</option>
                    <option value="PERCENTAGE">Percentage Deposit (%)</option>
                    <option value="FIXED">Fixed Amount Deposit ({currency})</option>
                </select>

                {data.depositType !== "NONE" && (
                    <div style={{ marginTop: "10px" }}>
                        <label
                            style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}
                        >
                            {data.depositType === "PERCENTAGE" ? "Deposit Percentage (%)" : `Fixed Deposit (${currency})`}
                        </label>
                        <input
                            type="number"
                            min="1"
                            max={data.depositType === "PERCENTAGE" ? "100" : undefined}
                            value={data.depositValue}
                            onChange={(e) => onChange("depositValue", e.target.value)}
                            placeholder={data.depositType === "PERCENTAGE" ? "25" : "15.00"}
                            style={{
                                width: "100%",
                                padding: "10px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                backgroundColor: "rgba(15, 23, 42, 0.8)",
                                color: "#fff",
                                fontSize: "13px",
                            }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
