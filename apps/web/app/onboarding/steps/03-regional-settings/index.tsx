"use client";

import React, { useState, useMemo } from "react";
import { ReferenceTimezoneDto, ReferenceCurrencyDto } from "@bookpro/contracts";
import { Globe, Sparkles } from "../../../../components/icons";

export interface RegionalSettingsData {
    timezone: string;
    currency: string;
}

interface StepRegionalSettingsProps {
    data: RegionalSettingsData;
    timezones: ReferenceTimezoneDto[];
    currencies: ReferenceCurrencyDto[];
    suggestedTimezone?: string;
    suggestedCurrency?: string;
    onChange: (field: keyof RegionalSettingsData, value: string) => void;
    errors: Partial<Record<keyof RegionalSettingsData, string>>;
}

export function StepRegionalSettings({
    data,
    timezones,
    currencies,
    suggestedTimezone,
    suggestedCurrency,
    onChange,
    errors,
}: StepRegionalSettingsProps) {
    const deviceTimezone = useMemo(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch {
            return "UTC";
        }
    }, []);

    const [tzSearch, setTzSearch] = useState("");
    const [currSearch, setCurrSearch] = useState("");

    const filteredTimezones = useMemo(() => {
        if (!tzSearch.trim()) return timezones;
        const q = tzSearch.toLowerCase();
        return timezones.filter(
            (t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)
        );
    }, [timezones, tzSearch]);

    const filteredCurrencies = useMemo(() => {
        if (!currSearch.trim()) return currencies;
        const q = currSearch.toLowerCase();
        return currencies.filter(
            (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
        );
    }, [currencies, currSearch]);

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Timezone Section */}
            <div>
                <label
                    htmlFor="tz-select"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Operating Time Zone <span style={{ color: "#38bdf8" }}>*</span>
                </label>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                    {data.timezone === deviceTimezone && (
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "3px 8px",
                                backgroundColor: "rgba(56, 189, 248, 0.1)",
                                borderRadius: "6px",
                                border: "1px solid rgba(56, 189, 248, 0.3)",
                                color: "#38bdf8",
                                fontSize: "11px",
                                fontWeight: 700,
                            }}
                        >
                            <Sparkles size={12} />
                            <span>Matches current device ({deviceTimezone})</span>
                        </div>
                    )}
                    {suggestedTimezone && data.timezone !== suggestedTimezone && (
                        <button
                            type="button"
                            onClick={() => onChange("timezone", suggestedTimezone)}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "3px 8px",
                                backgroundColor: "rgba(52, 211, 153, 0.1)",
                                borderRadius: "6px",
                                border: "1px solid rgba(52, 211, 153, 0.3)",
                                color: "#34d399",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            <Sparkles size={12} />
                            <span>Set to country default: {suggestedTimezone}</span>
                        </button>
                    )}
                </div>

                <div style={{ marginBottom: "6px" }}>
                    <input
                        type="text"
                        placeholder="Search timezone by city or region…"
                        value={tzSearch}
                        onChange={(e) => setTzSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            backgroundColor: "rgba(15, 23, 42, 0.6)",
                            color: "#fff",
                            fontSize: "12.5px",
                            marginBottom: "6px",
                            outline: "none",
                        }}
                    />
                </div>

                <select
                    id="tz-select"
                    value={data.timezone}
                    onChange={(e) => onChange("timezone", e.target.value)}
                    size={6}
                    aria-invalid={!!errors.timezone}
                    aria-describedby="tz-desc"
                    style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "8px",
                        border: errors.timezone ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "#0f172a",
                        color: "#fff",
                        fontSize: "13px",
                        outline: "none",
                    }}
                >
                    {filteredTimezones.map((tz) => (
                        <option key={tz.id} value={tz.id} style={{ padding: "6px 8px" }}>
                            {tz.label} {tz.id === deviceTimezone ? "★ (Device)" : ""}
                        </option>
                    ))}
                </select>
                <span id="tz-desc" style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Canonical IANA clock used for appointment booking slots, calendar synchronization, and daylight saving shifts.
                </span>
                {errors.timezone && (
                    <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.timezone}
                    </p>
                )}
            </div>

            {/* Currency Section */}
            <div>
                <label
                    htmlFor="currency-select"
                    style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                >
                    Billing & Display Currency <span style={{ color: "#38bdf8" }}>*</span>
                </label>

                {suggestedCurrency && data.currency !== suggestedCurrency && (
                    <div style={{ marginBottom: "8px" }}>
                        <button
                            type="button"
                            onClick={() => onChange("currency", suggestedCurrency)}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "3px 8px",
                                backgroundColor: "rgba(52, 211, 153, 0.1)",
                                borderRadius: "6px",
                                border: "1px solid rgba(52, 211, 153, 0.3)",
                                color: "#34d399",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer",
                            }}
                        >
                            <Sparkles size={12} />
                            <span>Set to country default: {suggestedCurrency}</span>
                        </button>
                    </div>
                )}

                <div style={{ marginBottom: "6px" }}>
                    <input
                        type="text"
                        placeholder="Search currency code or name…"
                        value={currSearch}
                        onChange={(e) => setCurrSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            backgroundColor: "rgba(15, 23, 42, 0.6)",
                            color: "#fff",
                            fontSize: "12.5px",
                            marginBottom: "6px",
                            outline: "none",
                        }}
                    />
                </div>

                <select
                    id="currency-select"
                    value={data.currency}
                    onChange={(e) => onChange("currency", e.target.value)}
                    size={6}
                    aria-invalid={!!errors.currency}
                    aria-describedby="curr-desc"
                    style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "8px",
                        border: errors.currency ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                        backgroundColor: "#0f172a",
                        color: "#fff",
                        fontSize: "13px",
                        outline: "none",
                    }}
                >
                    {filteredCurrencies.map((c) => (
                        <option key={c.code} value={c.code} style={{ padding: "6px 8px" }}>
                            {c.code} — {c.name} ({c.symbol})
                        </option>
                    ))}
                </select>
                <span id="curr-desc" style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    Primary currency code for service pricing, online deposits, invoices, and Stripe payouts.
                </span>
                {errors.currency && (
                    <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                        {errors.currency}
                    </p>
                )}
            </div>
        </div>
    );
}
