"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";

type Session = { id: string; deviceName: string; ipAddress?: string; lastSeenAt: string; createdAt: string; expiresAt: string; current: boolean };

export default function SecuritySettingsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await apiFetch<Session[]>("/auth/sessions");
    if (response.success && response.data) setSessions(response.data);
    else setError(response.error?.message || "Active devices could not be loaded.");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function revoke(id: string) {
    const response = await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
    if (!response.success) return setError(response.error?.message || "The session could not be revoked.");
    const revokedCurrent = sessions.find((session) => session.id === id)?.current;
    if (revokedCurrent) window.location.href = "/login";
    else setSessions((current) => current.filter((session) => session.id !== id));
  }

  async function revokeOthers() {
    const response = await apiFetch<{ revoked: number }>("/auth/sessions/revoke-all", { method: "POST" });
    if (!response.success) return setError(response.error?.message || "Other sessions could not be revoked.");
    setSessions((current) => current.filter((session) => session.current));
  }

  return <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px", color: "var(--color-ink)" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "end", marginBottom: 32 }}><div><p style={{ textTransform: "uppercase", letterSpacing: ".12em", opacity: .65 }}>Account security</p><h1 style={{ margin: 0 }}>Active devices</h1><p>Review and revoke browser sessions. Revocation takes effect on the next request.</p></div><button onClick={revokeOthers}>Sign out other devices</button></header>
    {error && <p role="alert" style={{ color: "#e11d48" }}>{error}</p>}
    {loading ? <p>Loading active devices…</p> : <section style={{ display: "grid", gap: 12 }}>{sessions.map((session) => <article key={session.id} style={{ border: "1px solid rgba(148,163,184,.25)", borderRadius: 12, padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}><div><strong>{session.deviceName}{session.current ? " · This device" : ""}</strong><div style={{ opacity: .7, marginTop: 5 }}>{session.ipAddress || "IP unavailable"} · Last active {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.lastSeenAt))}</div></div><button onClick={() => revoke(session.id)}>Sign out</button></article>)}</section>}
  </main>;
}
