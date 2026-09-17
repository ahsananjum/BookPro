"use client";

import React, { useEffect, useState } from "react";
import { Activity, Building2, Database, Server } from "lucide-react";
import { PageHeader } from "../../components/shell/app-shell";
import { apiFetch } from "../../lib/api-client";

type Health = { timestamp: string; database: { status: string; latencyMs: number }; redis: { status: string; latencyMs: number }; activeTenantsCount: number; totalBookings24h: number; jobQueues: { waiting: number; failed: number }; integrations: { googleCalendar: { connectedCount: number; failingCount: number }; stripe: { webhooks24h: number; failures24h: number }; geminiAI: { status: string } } };
type Tenant = { id: string; name: string; slug: string; planCode: string; isActive: boolean; locationsCount: number; staffCount: number; monthlyBookingsCount: number };
type FailedJob = { id: string; name: string; failedReason: string; attemptsMade: number; organizationId?: string | null };

export default function PlatformPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [healthResponse, tenantResponse, jobsResponse] = await Promise.all([apiFetch<Health>("/platform/health"), apiFetch<Tenant[]>("/platform/tenants"), apiFetch<FailedJob[]>("/platform/failed-jobs")]);
    if (!healthResponse.success || !tenantResponse.success || !jobsResponse.success) {
      setError("Platform operations could not be loaded. Verify service health and your platform administrator session.");
      return;
    }
    setHealth(healthResponse.data || null); setTenants(tenantResponse.data || []); setFailedJobs(jobsResponse.data || []);
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Platform operations" description="Live system health, tenant status and failed background work." actions={<button className="workspace-action" onClick={load}>Refresh</button>} />
      {error && <div className="operations-state is-error" role="alert">{error}</div>}
      {!health && !error && <div className="operations-state">Loading live platform status…</div>}
      {health && (
        <>
          <section className="platform-metrics">
            <article><Database /><small>PostgreSQL</small><strong>{health.database.status}</strong><span>{health.database.latencyMs} ms</span></article>
            <article><Server /><small>Redis</small><strong>{health.redis.status}</strong><span>{health.redis.latencyMs} ms</span></article>
            <article><Building2 /><small>Active tenants</small><strong>{health.activeTenantsCount}</strong><span>{health.totalBookings24h} bookings in 24h</span></article>
            <article><Activity /><small>Failed jobs</small><strong>{health.jobQueues.failed}</strong><span>{health.jobQueues.waiting} waiting</span></article>
          </section>
          <section className="operations-panel">
            <div className="operations-panel-heading"><h2>Tenant directory</h2><span>{tenants.length} loaded</span></div>
            <div className="table-scroll"><table className="operations-table"><thead><tr><th>Organization</th><th>Plan</th><th>Locations</th><th>Staff</th><th>30-day bookings</th><th>Status</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><strong>{tenant.name}</strong><small>{tenant.slug}</small></td><td>{tenant.planCode}</td><td>{tenant.locationsCount}</td><td>{tenant.staffCount}</td><td>{tenant.monthlyBookingsCount}</td><td>{tenant.isActive ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div>
          </section>
          <section className="operations-panel">
            <div className="operations-panel-heading"><h2>Failed background work</h2><span>{failedJobs.length} recent</span></div>
            {failedJobs.length === 0 ? <div className="operations-empty">No failed jobs are currently recorded.</div> : <div className="failed-job-list">{failedJobs.map((job) => <article key={job.id}><strong>{job.name}</strong><span>{job.failedReason}</span><small>{job.attemptsMade} attempts</small></article>)}</div>}
          </section>
        </>
      )}
    </div>
  );
}
