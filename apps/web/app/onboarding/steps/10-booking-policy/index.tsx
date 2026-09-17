"use client";

import React from "react";
import { ShieldAlert, CheckCircle2 } from "../../../../components/icons";

export interface PolicyData {
    minNoticeHours: number;
    maxNoticeDays: number;
    cancelCutoffHours: number;
    cancelFeeType: "NONE" | "PERCENTAGE" | "FIXED";
    cancelFeeValue: number;
    rescheduleCutoffHours: number;
    holdDurationMinutes: number;
}

interface StepPolicyProps {
    data: PolicyData;
    currency?: string;
    onChange: (field: keyof PolicyData, value: any) => void;
}

export function StepPolicy({ data, currency = "USD", onChange }: StepPolicyProps) {
    return (
        <div style={{ display: "grid", gap: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                {/* Minimum Notice Hours */}
                <div>
                    <label
                        htmlFor="min-notice"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Minimum Notice Required to Book
                    </label>
                    <select
                        id="min-notice"
                        value={data.minNoticeHours}
                        onChange={(e) => onChange("minNoticeHours", parseInt(e.target.value, 10))}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "#0f172a",
                            color: "#fff",
                            fontSize: "13.5px",
                        }}
                    >
                        <option value={1}>1 hour in advance</option>
                        <option value={2}>2 hours in advance</option>
                        <option value={4}>4 hours in advance</option>
                        <option value={12}>12 hours in advance</option>
                        <option value={24}>24 hours in advance</option>
                        <option value={48}>48 hours in advance</option>
                    </select>
                    <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                        Prevents last-minute unexpected bookings on provider calendars.
                    </span>
                </div>

                {/* Advance Booking Window */}
                <div>
                    <label
                        htmlFor="max-notice"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Advance Booking Window
                    </label>
                    <select
                        id="max-notice"
                        value={data.maxNoticeDays}
                        onChange={(e) => onChange("maxNoticeDays", parseInt(e.target.value, 10))}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "#0f172a",
                            color: "#fff",
                            fontSize: "13.5px",
                        }}
                    >
                        <option value={7}>Up to 7 days ahead</option>
                        <option value={14}>Up to 14 days ahead</option>
                        <option value={30}>Up to 30 days ahead</option>
                        <option value={60}>Up to 60 days ahead</option>
                        <option value={90}>Up to 90 days ahead</option>
                    </select>
                    <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                        How far into the future clients can reserve appointments.
                    </span>
                </div>

                {/* Cancellation Cutoff Window */}
                <div>
                    <label
                        htmlFor="cancel-cutoff"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Cancellation Cutoff Window (Hours)
                    </label>
                    <input
                        id="cancel-cutoff"
                        type="number"
                        min="0"
                        value={data.cancelCutoffHours}
                        onChange={(e) => onChange("cancelCutoffHours", parseInt(e.target.value, 10) || 0)}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                        }}
                    />
                    <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                        Cancellations before this window are eligible for full refund.
                    </span>
                </div>

                {/* Late Cancellation Penalty Fee */}
                <div>
                    <label
                        htmlFor="cancel-fee-type"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Late Cancellation Penalty
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <select
                            id="cancel-fee-type"
                            value={data.cancelFeeType}
                            onChange={(e) => onChange("cancelFeeType", e.target.value as any)}
                            style={{
                                flex: 1,
                                padding: "12px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                backgroundColor: "#0f172a",
                                color: "#fff",
                                fontSize: "13px",
                            }}
                        >
                            <option value="NONE">No Fee</option>
                            <option value="PERCENTAGE">Percentage (%)</option>
                            <option value="FIXED">Fixed Amount ({currency})</option>
                        </select>
                        {data.cancelFeeType !== "NONE" && (
                            <input
                                type="number"
                                min="0"
                                max={data.cancelFeeType === "PERCENTAGE" ? "100" : undefined}
                                value={data.cancelFeeValue}
                                onChange={(e) => onChange("cancelFeeValue", parseFloat(e.target.value) || 0)}
                                placeholder="50"
                                style={{
                                    width: "90px",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                                    color: "#fff",
                                    fontSize: "13.5px",
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* Rescheduling Cutoff */}
                <div>
                    <label
                        htmlFor="resched-cutoff"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Rescheduling Cutoff Window (Hours)
                    </label>
                    <input
                        id="resched-cutoff"
                        type="number"
                        min="0"
                        value={data.rescheduleCutoffHours}
                        onChange={(e) => onChange("rescheduleCutoffHours", parseInt(e.target.value, 10) || 0)}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                        }}
                    />
                </div>

                {/* Hold Duration */}
                <div>
                    <label
                        htmlFor="hold-duration"
                        style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}
                    >
                        Temporary Booking Hold Duration (Minutes)
                    </label>
                    <input
                        id="hold-duration"
                        type="number"
                        min="1"
                        max="60"
                        value={data.holdDurationMinutes}
                        onChange={(e) => onChange("holdDurationMinutes", parseInt(e.target.value, 10) || 10)}
                        style={{
                            width: "100%",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backgroundColor: "rgba(15, 23, 42, 0.8)",
                            color: "#fff",
                            fontSize: "13.5px",
                        }}
                    />
                    <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                        Time slot is temporarily held while customer enters card details.
                    </span>
                </div>
            </div>

            {/* Plain English Policy Summary Card */}
            <div
                style={{
                    padding: "16px 20px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(2, 132, 199, 0.08)",
                    border: "1px solid rgba(56, 189, 248, 0.25)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#38bdf8", fontWeight: 700, fontSize: "13.5px", marginBottom: "8px" }}>
                    <ShieldAlert size={16} />
                    <span>Customer-Facing Policy Summary</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "20px", color: "#cbd5e1", fontSize: "13px", lineHeight: "1.6" }}>
                    <li>Customers can book appointments from <strong>{data.minNoticeHours} hours</strong> up to <strong>{data.maxNoticeDays} days</strong> in advance.</li>
                    <li>Free cancellation is available until <strong>{data.cancelCutoffHours} hours</strong> before the scheduled appointment time.</li>
                    {data.cancelFeeType !== "NONE" && (
                        <li>Late cancellations incur a penalty of <strong>{data.cancelFeeType === "PERCENTAGE" ? `${data.cancelFeeValue}%` : `${data.cancelFeeValue} ${currency}`}</strong>.</li>
                    )}
                    <li>Rescheduling closes <strong>{data.rescheduleCutoffHours} hours</strong> before the appointment.</li>
                </ul>
            </div>
        </div>
    );
}
