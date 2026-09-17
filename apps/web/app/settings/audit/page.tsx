"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../../components/shell/app-shell";
import { apiFetch } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";

type AuditLog = { id: string; actorType: string; actorId: string; action: string; resourceType: string; resourceId: string; payload?: Record<string, unknown>; ipAddress?: string; createdAt: string };

export default function AuditLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [actorType, setActorType] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.organizationId) return;
    const query = new URLSearchParams({ limit: "100" });
    if (actorType) query.set("actorType", actorType);
    apiFetch<{ logs: AuditLog[]; total: number }>(`/organizations/${user.organizationId}/audit-logs?${query}`).then((response) => {
      if (response.success && response.data) { setLogs(response.data.logs); setTotal(response.data.total); }
      else setError(response.error?.message || "Audit history could not be loaded.");
      setLoading(false);
    });
  }, [user?.organizationId, actorType]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => [log.action, log.actorType, log.resourceType, log.resourceId].some((value) => value.toLowerCase().includes(term)));
  }, [logs, search]);

  return (
    <div>
      <PageHeader title="Audit log" description="A tenant-scoped record of security-sensitive and operational actions." />
      <div className="audit-controls"><label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Action or resource" /></label><label>Actor type<select value={actorType} onChange={(event) => setActorType(event.target.value)}><option value="">All actors</option><option value="STAFF">Staff</option><option value="CUSTOMER">Customer</option><option value="AI">AI</option><option value="PLATFORM_SUPPORT">Platform support</option><option value="SYSTEM">System</option></select></label></div>
      {loading && <div className="operations-state">Loading audit history…</div>}
      {error && <div className="operations-state is-error" role="alert">{error}</div>}
      {!loading && !error && filtered.length === 0 && <div className="operations-empty">No audit events match the current filters.</div>}
      {!loading && !error && filtered.length > 0 && <section className="operations-panel"><div className="operations-panel-heading"><h2>Recorded events</h2><span>{total} total</span></div><div className="audit-list">{filtered.map((log) => <article key={log.id}><button onClick={() => setExpanded(expanded === log.id ? null : log.id)} aria-expanded={expanded === log.id}><time>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(log.createdAt))}</time><span><strong>{log.action}</strong><small>{log.actorType.toLowerCase()} · {log.resourceType}</small></span><span className="audit-resource">{log.resourceId}</span></button>{expanded === log.id && <pre>{JSON.stringify(log.payload || {}, null, 2)}</pre>}</article>)}</div></section>}
    </div>
  );
}
