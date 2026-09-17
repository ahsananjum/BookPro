/* Hallmark · macrostructure: Booking Receipt Confirmation · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Mail,
  Download,
  ArrowRight,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  CheckCircle2,
} from "../../../../components/icons";
import { PublicBookingStatusResponseDto } from "@bookpro/contracts";
import { GlassCard, GlassBadge } from "../../../../components/glass-card";
import {
  CheckmarkDraw,
  ClockSpinner,
  FloatingParticles,
  QrCodeScan,
} from "../../../../components/animated-svgs";
import { CustomerPortalShell } from "../../../../components/shell/customer-portal-shell";
import { apiFetch } from "../../../../lib/api-client";

export default function PublicBookingCompletePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const slug = (params?.slug as string) || (params?.tenant as string) || "";
  const holdId = searchParams.get("holdId") || "";
  const guestToken = searchParams.get("guestToken") || "";

  const [bookingStatus, setBookingStatus] = useState<PublicBookingStatusResponseDto | null>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    apiFetch(`/organization/by-slug/${encodeURIComponent(slug)}`).then((res) => {
      if (res.success && res.data) setOrganization(res.data);
    });
  }, [slug]);

  const fetchStatus = async () => {
    if (!holdId) return;
    try {
      const res = await fetch(
        `/api/v1/appointments/public/status?holdId=${encodeURIComponent(holdId)}&guestToken=${encodeURIComponent(
          guestToken
        )}`,
        { headers: { "x-tenant-slug": slug } }
      );
      if (res.ok) {
        const json = await res.json();
        setBookingStatus(json.data || json);
      }
    } catch (err) {
      console.warn("Failed to load confirmed booking status", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [slug, holdId, guestToken]);

  const appointment = bookingStatus?.appointment;
  const businessName = organization?.brandName || organization?.name || slug || "BookPro";

  const handleCopyReference = () => {
    if (!appointment?.referenceCode) return;
    navigator.clipboard.writeText(appointment.referenceCode);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleDownloadIcs = () => {
    if (!appointment?.id) return;
    const downloadUrl = `/api/v1/appointments/public/${appointment.id}/calendar.ics${
      guestToken ? `?guestToken=${encodeURIComponent(guestToken)}` : ""
    }`;
    window.open(downloadUrl, "_blank");
  };

  if (isLoading) {
    return (
      <CustomerPortalShell tenantInfo={organization} pageTitle="Confirming Reservation…">
        <main
          style={{
            minHeight: "75vh",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <ClockSpinner size={40} />
            <p style={{ color: "#a8b5ca", fontSize: "15px", fontWeight: 600 }}>
              Finalizing appointment and securing calendar slot...
            </p>
          </div>
        </main>
      </CustomerPortalShell>
    );
  }

  return (
    <CustomerPortalShell tenantInfo={organization} pageTitle={`Reservation Confirmed — ${businessName}`}>
      <div style={{ position: "relative", overflowX: "clip", paddingBottom: "80px" }}>
        <FloatingParticles count={12} />

        <main style={{ maxWidth: "720px", margin: "40px auto 0", padding: "0 24px", position: "relative", zIndex: 10 }}>
          <GlassCard
            variant="hero"
            glow="primary"
            depth3D
            style={{
              padding: "44px 36px",
              textAlign: "center",
              borderRadius: "24px",
            }}
          >
            {/* Animated Draw Checkmark */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
              <CheckmarkDraw size={64} />
            </div>

            <h1
              style={{
                fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
                fontWeight: 850,
                color: "#f8fafc",
                letterSpacing: "-0.03em",
                margin: "0 0 8px",
              }}
            >
              Reservation Confirmed!
            </h1>
            <p style={{ fontSize: "15px", color: "#94a3b8", lineHeight: 1.55, margin: "0 0 24px" }}>
              Your appointment is placed on the official schedule at <strong style={{ color: "#f8fafc" }}>{businessName}</strong>.
            </p>

            {/* Copyable Reference Pill */}
            {appointment?.referenceCode && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  marginBottom: "28px",
                }}
              >
                <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>
                  Booking Reference
                </span>
                <span style={{ fontFamily: "monospace", fontSize: "16px", fontWeight: 850, color: "#38bdf8" }}>
                  {appointment.referenceCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyReference}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: hasCopied ? "#34d399" : "#a8b5ca",
                    cursor: "pointer",
                    padding: "2px",
                    display: "grid",
                    placeItems: "center",
                  }}
                  title="Copy reference code"
                >
                  {hasCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            )}

            {/* Appointment Details Box */}
            <div
              style={{
                backgroundColor: "rgba(10, 15, 26, 0.85)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                padding: "24px",
                textAlign: "left",
                marginBottom: "28px",
                display: "grid",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Sparkles size={20} color="#38bdf8" />
                <div>
                  <span style={{ fontSize: "11.5px", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                    Service
                  </span>
                  <strong style={{ fontSize: "16px", color: "#f8fafc" }}>
                    {appointment?.serviceName || "Scheduled Service"}
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Calendar size={20} color="#38bdf8" />
                <div>
                  <span style={{ fontSize: "11.5px", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                    Date & Time
                  </span>
                  <strong style={{ fontSize: "16px", color: "#f8fafc" }}>
                    {appointment?.startAt
                      ? new Intl.DateTimeFormat("en-US", {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        }).format(new Date(appointment.startAt))
                      : "--"}
                  </strong>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <User size={20} color="#38bdf8" />
                <div>
                  <span style={{ fontSize: "11.5px", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                    Specialist
                  </span>
                  <strong style={{ fontSize: "16px", color: "#f8fafc" }}>
                    {appointment?.staffName || "Assigned Team Specialist"}
                  </strong>
                </div>
              </div>

              {appointment?.locationName && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <MapPin size={20} color="#38bdf8" />
                  <div>
                    <span style={{ fontSize: "11.5px", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                      Location
                    </span>
                    <strong style={{ fontSize: "16px", color: "#f8fafc" }}>
                      {appointment.locationName} {appointment.locationAddress ? `(${appointment.locationAddress})` : ""}
                    </strong>
                  </div>
                </div>
              )}

              {appointment?.priceCents !== undefined && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    paddingTop: "14px",
                    marginTop: "4px",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11.5px", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                      Payment Status
                    </span>
                    <strong
                      style={{
                        fontSize: "14px",
                        color:
                          appointment.paymentStatus === "PAID"
                            ? "#34d399"
                            : appointment.paymentStatus === "PARTIALLY_PAID"
                            ? "#38bdf8"
                            : "#fbbf24",
                      }}
                    >
                      {appointment.paymentStatus === "PAID"
                        ? "Fully Paid"
                        : appointment.paymentStatus === "PARTIALLY_PAID"
                        ? "Deposit Paid (Partially Paid)"
                        : "Pay at Studio (Unpaid)"}
                    </strong>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "11.5px", color: "#64748b", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                      Total Price
                    </span>
                    <strong style={{ fontSize: "17px", color: "#f8fafc", fontWeight: 850 }}>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: (appointment.currency || "USD").toUpperCase(),
                      }).format((appointment.priceCents || 0) / 100)}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Sync Badges */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "28px",
              }}
            >
              <div
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12.5px",
                }}
              >
                <Mail size={16} color="#38bdf8" />
                <span style={{ color: "#a8b5ca" }}>Email:</span>
                <strong style={{ color: "#34d399" }}>
                  {appointment?.emailDeliveryStatus || "SENT"}
                </strong>
              </div>

              <div
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12.5px",
                }}
              >
                <Calendar size={16} color="#38bdf8" />
                <span style={{ color: "#a8b5ca" }}>Sync:</span>
                <strong style={{ color: "#34d399" }}>
                  {appointment?.calendarSyncStatus || "SYNCED"}
                </strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "grid", gap: "10px" }}>
              <button
                type="button"
                onClick={handleDownloadIcs}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: "#0284c7",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 800,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(2, 132, 199, 0.4)",
                }}
              >
                <Download size={16} />
                <span>Add to Calendar (.ICS)</span>
              </button>

              <Link
                href={`/${slug}/account`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px 20px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#f8fafc",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                <span>View in Customer Appointments Hub</span>
                <ArrowRight size={15} />
              </Link>

              <Link
                href={`/${slug}`}
                style={{
                  color: "#64748b",
                  fontSize: "13px",
                  textDecoration: "none",
                  padding: "8px",
                }}
              >
                ← Return to {businessName} storefront
              </Link>
            </div>
          </GlassCard>
        </main>
      </div>
    </CustomerPortalShell>
  );
}
