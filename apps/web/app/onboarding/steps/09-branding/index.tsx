"use client";

import React, { useState } from "react";
import { Upload, Trash2, Palette, Sparkles, CheckCircle2 } from "../../../../components/icons";
import { apiFetch } from "../../../../lib/api-client";
import { sanitizeErrorMessage } from "../../../../lib/error-utils";

export interface BrandingData {
    brandName: string;
    logoUrl: string;
    primaryColor: string;
    accentColor?: string;
}

const BRAND_PALETTES = [
    { name: "Sky Sapphire", primary: "#0284c7", accent: "#38bdf8" },
    { name: "Emerald Vitality", primary: "#059669", accent: "#34d399" },
    { name: "Royal Amethyst", primary: "#7c3aed", accent: "#a78bfa" },
    { name: "Crimson Luxe", primary: "#e11d48", accent: "#fb7185" },
    { name: "Amber Warmth", primary: "#d97706", accent: "#fbbf24" },
    { name: "Dark Modernist", primary: "#334155", accent: "#94a3b8" },
];

interface StepBrandingProps {
    data: BrandingData;
    serviceName?: string;
    onChange: (field: keyof BrandingData, value: string) => void;
    orgId?: string;
}

export function StepBranding({
    data,
    serviceName = "Consultation Service",
    onChange,
    orgId,
}: StepBrandingProps) {
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadError, setUploadError] = useState("");

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingLogo(true);
        setUploadError("");

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result as string;
                const res = await apiFetch<any>(
                    "/storage/upload",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            base64,
                            fileName: file.name,
                            mimeType: file.type || "image/png",
                            orgId,
                        }),
                    },
                    orgId
                );

                if (res.success && res.data) {
                    const fileUrl = res.data.url || res.data.publicUrl || `/api/v1/storage/files/${res.data.storageKey}`;
                    onChange("logoUrl", fileUrl);
                } else {
                    setUploadError(sanitizeErrorMessage(res.error, "Failed to upload logo image.").message);
                }
                setUploadingLogo(false);
            };
            reader.readAsDataURL(file);
        } catch (err: any) {
            setUploadError(sanitizeErrorMessage(err, "Error processing image file.").message);
            setUploadingLogo(false);
        }
    };

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "28px" }}>
            {/* Left Form Inputs */}
            <div style={{ display: "grid", gap: "20px" }}>
                <div>
                    <label
                        htmlFor="brand-name"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Public Brand Display Name
                    </label>
                    <input
                        id="brand-name"
                        type="text"
                        value={data.brandName}
                        onChange={(e) => onChange("brandName", e.target.value)}
                        placeholder="e.g. Lumina Wellness"
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
                        Displayed on booking banners, customer emails, invoices, and portal titles.
                    </span>
                </div>

                {/* Logo Uploader */}
                <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                        Brand Logo Asset
                    </label>

                    {data.logoUrl ? (
                        <div
                            style={{
                                padding: "16px",
                                borderRadius: "10px",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                backgroundColor: "rgba(15, 23, 42, 0.6)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <img
                                    src={data.logoUrl}
                                    alt="Brand Logo Preview"
                                    style={{
                                        height: "48px",
                                        maxWidth: "140px",
                                        objectFit: "contain",
                                        borderRadius: "6px",
                                        backgroundColor: "#0f172a",
                                        padding: "4px",
                                    }}
                                />
                                <div>
                                    <span style={{ color: "#34d399", fontSize: "12.5px", fontWeight: 700, display: "block" }}>
                                        ✓ Logo Uploaded
                                    </span>
                                    <span style={{ color: "#64748b", fontSize: "11.5px" }}>Stored in BookPro asset storage</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onChange("logoUrl", "")}
                                style={{
                                    padding: "6px 12px",
                                    backgroundColor: "rgba(225, 29, 72, 0.1)",
                                    border: "1px solid rgba(225, 29, 72, 0.3)",
                                    borderRadius: "6px",
                                    color: "#fb7185",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                }}
                            >
                                <Trash2 size={13} /> Remove
                            </button>
                        </div>
                    ) : (
                        <div
                            style={{
                                border: "2px dashed rgba(56, 189, 248, 0.35)",
                                borderRadius: "12px",
                                padding: "24px",
                                textAlign: "center",
                                backgroundColor: "rgba(14, 165, 233, 0.04)",
                                position: "relative",
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileUpload}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    opacity: 0,
                                    width: "100%",
                                    height: "100%",
                                    cursor: "pointer",
                                }}
                            />
                            {uploadingLogo ? (
                                <p style={{ color: "#38bdf8", fontSize: "13px", margin: 0 }}>
                                    Uploading asset to storage…
                                </p>
                            ) : (
                                <div>
                                    <Upload size={28} color="#38bdf8" style={{ margin: "0 auto 8px" }} />
                                    <strong style={{ color: "#f8fafc", fontSize: "13.5px", display: "block" }}>
                                        Click or drop logo image here
                                    </strong>
                                    <span style={{ color: "#64748b", fontSize: "12px" }}>PNG, JPG, SVG, WebP up to 5MB</span>
                                </div>
                            )}
                        </div>
                    )}

                    {uploadError && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "6px" }}>
                            {uploadError}
                        </p>
                    )}
                </div>

                {/* Curated Color Palettes */}
                <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                        Curated Brand Palettes
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
                        {BRAND_PALETTES.map((pal) => {
                            const isCurrent = data.primaryColor === pal.primary;
                            return (
                                <button
                                    key={pal.name}
                                    type="button"
                                    onClick={() => {
                                        onChange("primaryColor", pal.primary);
                                        onChange("accentColor", pal.accent);
                                    }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "8px 10px",
                                        borderRadius: "8px",
                                        border: isCurrent ? "2px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                                        backgroundColor: isCurrent ? "rgba(2, 132, 199, 0.15)" : "rgba(15, 23, 42, 0.6)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    <span
                                        style={{
                                            width: "18px",
                                            height: "18px",
                                            borderRadius: "50%",
                                            backgroundColor: pal.primary,
                                            boxShadow: "0 0 8px rgba(0,0,0,0.5)",
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ fontSize: "12px", color: isCurrent ? "#f8fafc" : "#94a3b8", fontWeight: 600 }}>
                                        {pal.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Primary & Accent Color Inputs */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                        <label
                            htmlFor="brand-primary"
                            style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                        >
                            Primary Color
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <input
                                id="brand-primary"
                                type="color"
                                value={data.primaryColor || "#0284c7"}
                                onChange={(e) => onChange("primaryColor", e.target.value)}
                                style={{
                                    width: "38px",
                                    height: "38px",
                                    borderRadius: "6px",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: "transparent",
                                }}
                            />
                            <input
                                type="text"
                                value={data.primaryColor || "#0284c7"}
                                onChange={(e) => onChange("primaryColor", e.target.value)}
                                placeholder="#0284c7"
                                style={{
                                    flex: 1,
                                    padding: "8px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                                    color: "#fff",
                                    fontSize: "13px",
                                    fontFamily: "monospace",
                                    outline: "none",
                                }}
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="brand-accent"
                            style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                        >
                            Accent Color
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <input
                                id="brand-accent"
                                type="color"
                                value={data.accentColor || "#38bdf8"}
                                onChange={(e) => onChange("accentColor", e.target.value)}
                                style={{
                                    width: "38px",
                                    height: "38px",
                                    borderRadius: "6px",
                                    border: "none",
                                    cursor: "pointer",
                                    backgroundColor: "transparent",
                                }}
                            />
                            <input
                                type="text"
                                value={data.accentColor || "#38bdf8"}
                                onChange={(e) => onChange("accentColor", e.target.value)}
                                placeholder="#38bdf8"
                                style={{
                                    flex: 1,
                                    padding: "8px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                                    color: "#fff",
                                    fontSize: "13px",
                                    fontFamily: "monospace",
                                    outline: "none",
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Live Preview Panel */}
            <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                    Live Customer Portal Preview
                </label>
                <div
                    style={{
                        borderRadius: "14px",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        backgroundColor: "#0b101e",
                        overflow: "hidden",
                        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
                    }}
                >
                    {/* Header Strip with Primary Color */}
                    <div
                        style={{
                            height: "6px",
                            backgroundColor: data.primaryColor || "#0284c7",
                        }}
                    />

                    <div style={{ padding: "20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                            {data.logoUrl ? (
                                <img
                                    src={data.logoUrl}
                                    alt="Logo preview"
                                    style={{ height: "36px", objectFit: "contain", borderRadius: "6px" }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "8px",
                                        backgroundColor: data.primaryColor || "#0284c7",
                                        display: "grid",
                                        placeItems: "center",
                                        color: "#fff",
                                        fontWeight: 900,
                                        fontSize: "16px",
                                    }}
                                >
                                    {(data.brandName || "B").charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <strong style={{ color: "#f8fafc", fontSize: "15px", display: "block" }}>
                                    {data.brandName || "Your Business Name"}
                                </strong>
                                <span style={{ color: "#64748b", fontSize: "11.5px" }}>Public Booking Portal</span>
                            </div>
                        </div>

                        {/* Sample Service Booking Card */}
                        <div
                            style={{
                                padding: "14px",
                                borderRadius: "10px",
                                backgroundColor: "rgba(255, 255, 255, 0.04)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                marginBottom: "14px",
                            }}
                        >
                            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#f8fafc", marginBottom: "4px" }}>
                                {serviceName}
                            </div>
                            <div style={{ fontSize: "12px", color: data.accentColor || "#38bdf8", fontWeight: 600 }}>
                                ✓ Instant Confirmation • Active Branch
                            </div>
                        </div>

                        {/* CTA Button with Primary Color */}
                        <button
                            type="button"
                            style={{
                                width: "100%",
                                padding: "10px",
                                borderRadius: "8px",
                                border: "none",
                                backgroundColor: data.primaryColor || "#0284c7",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: "13px",
                                cursor: "default",
                            }}
                        >
                            Book Appointment
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
