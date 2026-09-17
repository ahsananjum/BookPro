"use client";

import React from "react";
import { UserCheck, Users, MapPin, Scissors } from "../../../../components/icons";

export interface StaffData {
    mode: "OWNER" | "TEAM_MEMBER";
    fullName: string;
    displayName: string;
    email: string;
    title: string;
    bio: string;
    roleCode: "STAFF" | "MANAGER" | "ADMIN";
}

interface StepStaffProps {
    data: StaffData;
    ownerUser: { fullName: string; email: string } | null;
    locationName?: string;
    serviceName?: string;
    onChange: (field: keyof StaffData, value: any) => void;
    errors: Partial<Record<keyof StaffData, string>>;
}

export function StepStaff({
    data,
    ownerUser,
    locationName,
    serviceName,
    onChange,
    errors,
}: StepStaffProps) {
    return (
        <div style={{ display: "grid", gap: "20px" }}>
            {/* Mode Selector */}
            <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "8px" }}>
                    Who will provide appointments for this service?
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div
                        onClick={() => {
                            onChange("mode", "OWNER");
                            if (ownerUser) {
                                onChange("fullName", ownerUser.fullName);
                                onChange("displayName", ownerUser.fullName);
                                onChange("email", ownerUser.email);
                            }
                        }}
                        style={{
                            padding: "16px",
                            borderRadius: "10px",
                            border: data.mode === "OWNER" ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                            backgroundColor: data.mode === "OWNER" ? "rgba(2, 132, 199, 0.15)" : "rgba(15, 23, 42, 0.5)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                            <UserCheck size={18} color={data.mode === "OWNER" ? "#38bdf8" : "#94a3b8"} />
                            <strong style={{ color: "#f8fafc", fontSize: "14.5px" }}>I do (Myself)</strong>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            Link your existing owner account as the primary service provider.
                        </span>
                    </div>

                    <div
                        onClick={() => {
                            onChange("mode", "TEAM_MEMBER");
                            if (data.mode === "OWNER") {
                                onChange("fullName", "");
                                onChange("displayName", "");
                                onChange("email", "");
                            }
                        }}
                        style={{
                            padding: "16px",
                            borderRadius: "10px",
                            border: data.mode === "TEAM_MEMBER" ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                            backgroundColor: data.mode === "TEAM_MEMBER" ? "rgba(2, 132, 199, 0.15)" : "rgba(15, 23, 42, 0.5)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                            <Users size={18} color={data.mode === "TEAM_MEMBER" ? "#38bdf8" : "#94a3b8"} />
                            <strong style={{ color: "#f8fafc", fontSize: "14.5px" }}>Someone on my team</strong>
                        </div>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                            Add a practitioner, stylist, or specialist team member.
                        </span>
                    </div>
                </div>
            </div>

            {/* Entity Links Feedback */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {locationName && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#38bdf8", padding: "6px 12px", backgroundColor: "rgba(56, 189, 248, 0.08)", borderRadius: "6px" }}>
                        <MapPin size={14} /> Assigned to: <strong>{locationName}</strong>
                    </div>
                )}
                {serviceName && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#34d399", padding: "6px 12px", backgroundColor: "rgba(5, 150, 105, 0.08)", borderRadius: "6px" }}>
                        <Scissors size={14} /> Qualified for: <strong>{serviceName}</strong>
                    </div>
                )}
            </div>

            {/* Form Fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                    <label
                        htmlFor="staff-name"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Full Name / Display Name <span style={{ color: "#38bdf8" }}>*</span>
                    </label>
                    <input
                        id="staff-name"
                        type="text"
                        value={data.displayName}
                        onChange={(e) => {
                            onChange("displayName", e.target.value);
                            onChange("fullName", e.target.value);
                        }}
                        placeholder="e.g. Sarah Jenkins"
                        required
                        aria-invalid={!!errors.displayName}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: errors.displayName ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                    {errors.displayName && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                            {errors.displayName}
                        </p>
                    )}
                </div>

                <div>
                    <label
                        htmlFor="staff-title"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Professional Title
                    </label>
                    <input
                        id="staff-title"
                        type="text"
                        value={data.title}
                        onChange={(e) => onChange("title", e.target.value)}
                        placeholder="e.g. Master Stylist / Senior Consultant"
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
                        htmlFor="staff-email"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Work Email Address <span style={{ color: "#38bdf8" }}>*</span>
                    </label>
                    <input
                        id="staff-email"
                        type="email"
                        value={data.email}
                        onChange={(e) => onChange("email", e.target.value)}
                        placeholder="e.g. sarah@business.com"
                        required
                        disabled={data.mode === "OWNER"}
                        aria-invalid={!!errors.email}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: errors.email ? "1px solid #fb7185" : "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: data.mode === "OWNER" ? "rgba(15, 23, 42, 0.4)" : "rgba(15, 23, 42, 0.8)",
                            color: data.mode === "OWNER" ? "#94a3b8" : "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    />
                    {errors.email && (
                        <p role="alert" style={{ color: "#fb7185", fontSize: "12px", marginTop: "4px" }}>
                            {errors.email}
                        </p>
                    )}
                </div>

                <div>
                    <label
                        htmlFor="staff-role"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Access Role
                    </label>
                    <select
                        id="staff-role"
                        value={data.roleCode}
                        onChange={(e) => onChange("roleCode", e.target.value as any)}
                        disabled={data.mode === "OWNER"}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "#0f172a",
                            color: "#fff",
                            fontSize: "14px",
                            outline: "none",
                        }}
                    >
                        <option value="STAFF">Staff (Calendar & Own Appointments)</option>
                        <option value="MANAGER">Manager (Location Management)</option>
                        <option value="ADMIN">Admin (Full Organization Access)</option>
                    </select>
                </div>

                <div style={{ gridColumn: "span 2" }}>
                    <label
                        htmlFor="staff-bio"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Public Bio / Specializations
                    </label>
                    <textarea
                        id="staff-bio"
                        rows={2}
                        value={data.bio}
                        onChange={(e) => onChange("bio", e.target.value)}
                        placeholder="Brief summary of certifications, specialties, and experience…"
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
            </div>
        </div>
    );
}
