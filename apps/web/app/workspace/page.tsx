/* Hallmark · macrostructure: Staff Practitioner Day Workspace · genre: modern-minimal · theme: Midnight
 * pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, MapPin, UserRound, CheckCircle, Clock } from "lucide-react";
import { Play, CheckCheck, AlertCircle } from "../../components/icons";
import { PageHeader } from "../../components/shell/app-shell";
import { apiFetch } from "../../lib/api-client";
import { useAuth } from "../../lib/auth-context";
import { GlassCard, GlassBadge } from "../../components/glass-card";
import { PulsingDot, ClockSpinner } from "../../components/animated-svgs";

type StaffProfile = {
  id: string;
  membershipId: string;
  displayName: string;
  title?: string;
  staffLocations?: Array<{ location: { name: string } }>;
  availabilities?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
};

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  customer?: { fullName: string; email?: string; phone?: string };
  service?: { name: string; durationMin: number };
  location?: { name: string };
};

export default function StaffWorkspacePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = async () => {
    if (!user?.membershipId) return;
    setLoading(true);
    setError(null);

    const staffResponse = await apiFetch<StaffProfile[]>("/staff");
    const ownProfile = staffResponse.success ? staffResponse.data?.find((item) => item.membershipId === user?.membershipId) : undefined;

    if (!ownProfile) {
      setError("Your staff profile is not configured. Ask an administrator to complete your staff setup.");
      setLoading(false);
      return;
    }

    setProfile(ownProfile);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const appointmentResponse = await apiFetch<Appointment[]>(
      `/appointments?staffId=${encodeURIComponent(ownProfile.id)}&startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`
    );

    if (appointmentResponse.success && appointmentResponse.data) {
      setAppointments(appointmentResponse.data);
    } else {
      setError(appointmentResponse.error?.message || "Today's appointments could not be loaded.");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user?.membershipId]);

  const upcoming = useMemo(
    () => appointments.filter((appointment) => !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status)),
    [appointments]
  );

  const handleStatusChange = async (appointmentId: string, nextStatus: string) => {
    setActionLoading(appointmentId);
    let endpoint = `/appointments/${appointmentId}/status`;
    let body: any = { status: nextStatus };

    if (nextStatus === "CHECKED_IN") {
      endpoint = `/appointments/${appointmentId}/check-in`;
      body = {};
    }

    const res = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (res.success) {
      loadData();
    } else {
      setError(res.error?.message || `Failed to transition appointment to ${nextStatus}.`);
    }
    setActionLoading(null);
  };

  return (
    <div>
      <PageHeader
        title={profile ? `Good day, ${profile.displayName}` : "Your Workday"}
        description={profile?.title || "Your assigned appointments, schedule, and client arrivals for today."}
      />

      {loading && (
        <div style={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: "8px", padding: "20px 0" }}>
          <ClockSpinner size={20} /> Loading your assigned schedule…
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "rgba(225, 29, 72, 0.15)",
            border: "1px solid rgba(225, 29, 72, 0.4)",
            borderRadius: "10px",
            color: "#fb7185",
            marginBottom: "20px",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
          role="alert"
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && profile && (
        <>
          {/* Summary Metric Cards */}
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "28px",
            }}
          >
            <GlassCard variant="card" glow="subtle" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(2, 132, 199, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    display: "grid",
                    placeItems: "center",
                    color: "#38bdf8",
                  }}
                >
                  <UserRound size={20} />
                </div>
                <div>
                  <small style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                    Staff Profile
                  </small>
                  <strong style={{ color: "#f8fafc", fontSize: "16px", display: "block" }}>
                    {profile.displayName}
                  </strong>
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="card" glow="subtle" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    border: "1px solid rgba(52, 211, 153, 0.3)",
                    display: "grid",
                    placeItems: "center",
                    color: "#34d399",
                  }}
                >
                  <MapPin size={20} />
                </div>
                <div>
                  <small style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                    Assigned Location
                  </small>
                  <strong style={{ color: "#f8fafc", fontSize: "15px", display: "block" }}>
                    {profile.staffLocations?.map((item) => item.location.name).join(", ") || "All Assigned Locations"}
                  </strong>
                </div>
              </div>
            </GlassCard>

            <GlassCard variant="card" glow="subtle" style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(168, 85, 247, 0.15)",
                    border: "1px solid rgba(192, 132, 252, 0.3)",
                    display: "grid",
                    placeItems: "center",
                    color: "#c084fc",
                  }}
                >
                  <CalendarClock size={20} />
                </div>
                <div>
                  <small style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>
                    Remaining Today
                  </small>
                  <strong style={{ color: "#f8fafc", fontSize: "16px", display: "block" }}>
                    {upcoming.length} appointment{upcoming.length === 1 ? "" : "s"}
                  </strong>
                </div>
              </div>
            </GlassCard>
          </section>

          {/* Today's Schedule & Interactive Check-in */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <PulsingDot color="#34d399" size={5} />
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#f8fafc", margin: 0 }}>
                  Today&apos;s Appointments
                </h2>
              </div>
              <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                {new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date())}
              </span>
            </div>

            {appointments.length === 0 ? (
              <GlassCard variant="panel" style={{ padding: "36px", textAlign: "center" }}>
                <Clock size={36} color="#64748b" style={{ margin: "0 auto 8px" }} />
                <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
                  No appointments are assigned to you today. Enjoy your day or review upcoming days in your calendar!
                </p>
              </GlassCard>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {appointments.map((appointment) => {
                  const isPendingAction = actionLoading === appointment.id;

                  return (
                    <GlassCard
                      key={appointment.id}
                      variant="card"
                      glow="subtle"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "110px 1fr 140px auto",
                        alignItems: "center",
                        gap: "16px",
                        padding: "18px 24px",
                      }}
                    >
                      <div>
                        <time style={{ color: "#38bdf8", fontWeight: 800, fontSize: "15px", display: "block" }}>
                          {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
                            new Date(appointment.startAt)
                          )}
                        </time>
                        <span style={{ color: "#64748b", fontSize: "12px" }}>
                          {appointment.service?.durationMin || 45} mins
                        </span>
                      </div>

                      <div>
                        <strong style={{ color: "#f8fafc", fontSize: "16px", display: "block" }}>
                          {appointment.customer?.fullName || "Walk-in / Guest"}
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                          {appointment.service?.name || "Service"} • {appointment.location?.name || "Branch"}
                        </span>
                      </div>

                      <div>
                        <GlassBadge
                          variant={
                            appointment.status === "COMPLETED"
                              ? "success"
                              : appointment.status === "CHECKED_IN"
                              ? "purple"
                              : appointment.status === "IN_PROGRESS"
                              ? "warning"
                              : "info"
                          }
                        >
                          {appointment.status.toLowerCase().replaceAll("_", " ")}
                        </GlassBadge>
                      </div>

                      {/* State transition triggers */}
                      <div style={{ display: "flex", gap: "8px" }}>
                        {appointment.status === "CONFIRMED" && (
                          <button
                            onClick={() => handleStatusChange(appointment.id, "CHECKED_IN")}
                            disabled={isPendingAction}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid rgba(52, 211, 153, 0.4)",
                              backgroundColor: "rgba(5, 150, 105, 0.15)",
                              color: "#34d399",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <CheckCircle size={13} /> Check In
                          </button>
                        )}

                        {appointment.status === "CHECKED_IN" && (
                          <button
                            onClick={() => handleStatusChange(appointment.id, "IN_PROGRESS")}
                            disabled={isPendingAction}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid rgba(251, 191, 36, 0.4)",
                              backgroundColor: "rgba(217, 119, 6, 0.15)",
                              color: "#fcd34d",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Play size={13} /> Start Service
                          </button>
                        )}

                        {appointment.status === "IN_PROGRESS" && (
                          <button
                            onClick={() => handleStatusChange(appointment.id, "COMPLETED")}
                            disabled={isPendingAction}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "1px solid rgba(56, 189, 248, 0.4)",
                              backgroundColor: "rgba(2, 132, 199, 0.15)",
                              color: "#38bdf8",
                              fontSize: "12px",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <CheckCheck size={13} /> Complete
                          </button>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
