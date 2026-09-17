"use client";

import React from "react";
import { ReferenceCountryDto } from "@bookpro/contracts";

export interface BusinessDetailsData {
    name: string;
    country: string;
    phone: string;
    email: string;
    website: string;
}

interface StepBusinessDetailsProps {
    data: BusinessDetailsData;
    countries: ReferenceCountryDto[];
    onChange: (field: keyof BusinessDetailsData, value: string) => void;
    errors: Partial<Record<keyof BusinessDetailsData, string>>;
}

export function StepBusinessDetails({
    data,
    countries,
    onChange,
    errors,
}: StepBusinessDetailsProps) {
    const selectedCountry = countries.find((c) => c.code === data.country);

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ gridColumn: "span 2" }}>
                <label
                    htmlFor="business-name"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Business Name <span style={{ color: "#38bdf8" }}>*</span>
                </label>
                <input
                    id="business-name"
                    type="text"
                    value={data.name}
                    onChange={(e) => onChange("name", e.target.value)}
                    placeholder="e.g. Luma Studio"
                    required
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "business-name-error" : "business-name-desc"}
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
                <span id="business-name-desc" style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    The public business name customers will recognize on your booking portal, customer portal, and receipts.
                </span>
                {errors.name && (
                    <p id="business-name-error" role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.name}
                    </p>
                )}
            </div>

            <div>
                <label
                    htmlFor="business-country"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Country / Region <span style={{ color: "#38bdf8" }}>*</span>
                </label>
                <select
                    id="business-country"
                    value={data.country}
                    onChange={(e) => onChange("country", e.target.value)}
                    aria-invalid={!!errors.country}
                    aria-describedby={errors.country ? "business-country-error" : "business-country-desc"}
                    style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: errors.country ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "#0f172a",
                        color: "#fff",
                        fontSize: "14px",
                        outline: "none",
                    }}
                >
                    <option value="">Select country…</option>
                    {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                            {c.name} ({c.dialCode})
                        </option>
                    ))}
                </select>
                <span id="business-country-desc" style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Authoritative jurisdiction used for regional defaults, taxes, and suggested currencies.
                </span>
                {errors.country && (
                    <p id="business-country-error" role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.country}
                    </p>
                )}
            </div>

            <div>
                <label
                    htmlFor="business-phone"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Business Contact Phone
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                    {selectedCountry?.dialCode && (
                        <div
                            style={{
                                padding: "12px 14px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                backgroundColor: "rgba(15, 23, 42, 0.9)",
                                color: "#38bdf8",
                                fontSize: "14px",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                display: "grid",
                                placeItems: "center",
                            }}
                            title={`Dial code for ${selectedCountry.name}`}
                        >
                            {selectedCountry.dialCode}
                        </div>
                    )}
                    <input
                        id="business-phone"
                        type="tel"
                        value={data.phone}
                        onChange={(e) => onChange("phone", e.target.value)}
                        placeholder="e.g. 555-0199"
                        aria-describedby="business-phone-desc"
                        style={{
                            flex: 1,
                            width: "100%",
                            padding: "12px 14px",
                            borderRadius: "8px",
                            border: errors.phone ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                </div>
                <span id="business-phone-desc" style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Shown to clients for appointment confirmations, SMS notifications, and receipts.
                </span>
            </div>

            <div>
                <label
                    htmlFor="business-email"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Official Business Email
                </label>
                <input
                    id="business-email"
                    type="email"
                    value={data.email}
                    onChange={(e) => onChange("email", e.target.value)}
                    placeholder="contact@example.com"
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "business-email-error" : "business-email-desc"}
                    style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: errors.email ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "rgba(15, 23, 42, 0.8)",
                        color: "#fff",
                        fontSize: "14px",
                        outline: "none",
                    }}
                />
                <span id="business-email-desc" style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Public inquiries and automated notification sender address.
                </span>
                {errors.email && (
                    <p id="business-email-error" role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.email}
                    </p>
                )}
            </div>

            <div>
                <label
                    htmlFor="business-website"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Website (Optional)
                </label>
                <input
                    id="business-website"
                    type="text"
                    value={data.website}
                    onChange={(e) => onChange("website", e.target.value)}
                    placeholder="e.g. lumastudio.com"
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
                <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Linked on your customer booking portal and email notifications. (https:// added automatically if omitted)
                </span>
            </div>
        </div>
    );
}
