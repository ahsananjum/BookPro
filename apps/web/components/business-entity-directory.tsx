"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionKey } from "@bookpro/contracts";
import { apiFetch } from "../lib/api-client";
import { useAuth } from "../lib/auth-context";
import { PageHeader } from "./shell/app-shell";

type EntityKind = "staff" | "services" | "locations" | "resources";
type Entity = Record<string, any> & { id: string };
type Field = { key: string; label: string; type?: "text" | "email" | "number" | "select"; required?: boolean; options?: Array<{ value: string; label: string }> };

const directoryConfig: Record<EntityKind, { title: string; description: string; endpoint: string; read: PermissionKey; manage: PermissionKey }> = {
  staff: { title: "Staff", description: "Manage real staff profiles and account memberships for this organization.", endpoint: "/staff", read: PermissionKey.STAFF_READ, manage: PermissionKey.STAFF_MANAGE },
  services: { title: "Services", description: "Manage the authoritative service catalog used by availability, pricing, and booking.", endpoint: "/services", read: PermissionKey.SERVICE_READ, manage: PermissionKey.SERVICE_MANAGE },
  locations: { title: "Locations", description: "Manage operating locations, public slugs, timezones, and contact details.", endpoint: "/locations", read: PermissionKey.LOCATION_READ, manage: PermissionKey.LOCATION_MANAGE },
  resources: { title: "Resources", description: "Manage rooms, equipment, and other capacity constrained inventory.", endpoint: "/resources", read: PermissionKey.RESOURCE_READ, manage: PermissionKey.RESOURCE_MANAGE },
};

function describe(kind: EntityKind, entity: Entity) {
  if (kind === "staff") return { name: entity.displayName, detail: [entity.title, entity.membership?.user?.email].filter(Boolean).join(" · "), meta: entity.roleCode || entity.membership?.roleCode || "STAFF" };
  if (kind === "services") return { name: entity.name, detail: `${entity.durationMin} minutes · ${entity.currency} ${((entity.priceCents || 0) / 100).toFixed(2)}`, meta: entity.category || "Service" };
  if (kind === "locations") return { name: entity.name, detail: [entity.city, entity.state, entity.country].filter(Boolean).join(", ") || entity.address || "Address not set", meta: entity.timezone };
  return { name: entity.name, detail: [entity.type, entity.location?.name].filter(Boolean).join(" · "), meta: `Quantity ${entity.quantity || 1}` };
}

export function BusinessEntityDirectory({ kind }: { kind: EntityKind }) {
  const config = directoryConfig[kind];
  const { user, hasPermission } = useAuth();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [locations, setLocations] = useState<Entity[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const canManage = hasPermission(config.manage);

  const fields = useMemo<Field[]>(() => {
    if (kind === "staff") return [
      { key: "fullName", label: "Legal/full name", required: true }, { key: "displayName", label: "Display name", required: true },
      { key: "email", label: "Email", type: "email", required: true }, { key: "title", label: "Job title" },
      { key: "roleCode", label: "Role", type: "select", required: true, options: ["STAFF", "RECEPTIONIST", "MANAGER", "ADMIN"].map((value) => ({ value, label: value.toLowerCase() })) },
    ];
    if (kind === "services") return [
      { key: "name", label: "Service name", required: true }, { key: "category", label: "Category" },
      { key: "durationMin", label: "Duration (minutes)", type: "number", required: true }, { key: "price", label: "Price", type: "number", required: true },
      { key: "currency", label: "Currency (ISO 4217)", required: true },
    ];
    if (kind === "locations") return [
      { key: "name", label: "Location name", required: true }, { key: "slug", label: "Public slug", required: true },
      { key: "timezone", label: "IANA timezone", required: true }, { key: "address", label: "Street address" },
      { key: "city", label: "City" }, { key: "state", label: "State / region" }, { key: "postalCode", label: "Postal code" },
      { key: "country", label: "Country code", required: true }, { key: "email", label: "Public email", type: "email" }, { key: "phone", label: "Public phone" },
    ];
    return [
      { key: "name", label: "Resource name", required: true }, { key: "type", label: "Resource type", required: true },
      { key: "locationId", label: "Location", type: "select", required: true, options: locations.map((location) => ({ value: location.id, label: location.name })) },
      { key: "quantity", label: "Quantity", type: "number", required: true },
    ];
  }, [kind, locations]);

  const load = useCallback(async () => {
    if (!user?.organizationId || !hasPermission(config.read)) return;
    setLoading(true);
    const response = await apiFetch<Entity[]>(config.endpoint);
    if (response.success) setEntities(response.data || []);
    else setMessage({ type: "error", text: response.error?.message || `Unable to load ${config.title.toLowerCase()}.` });
    if (kind === "resources") {
      const locationResponse = await apiFetch<Entity[]>("/locations");
      if (locationResponse.success) setLocations(locationResponse.data || []);
    }
    setLoading(false);
  }, [config.endpoint, config.read, config.title, hasPermission, kind, user?.organizationId]);

  useEffect(() => { load(); }, [load]);

  function requestBody() {
    if (kind === "staff") return { ...form, roleCode: form.roleCode || "STAFF", bookingVisible: true };
    if (kind === "services") return { name: form.name, category: form.category || undefined, durationMin: Number(form.durationMin), priceCents: Math.round(Number(form.price) * 100), currency: form.currency.toUpperCase(), preBufferMin: 0, postBufferMin: 0, depositType: "NONE", depositValue: 0, taxBehavior: "EXCLUSIVE", capacity: form.capacity ? Number(form.capacity) : 1, minParticipants: 1, maxParticipants: form.capacity ? Number(form.capacity) : 1 };
    if (kind === "locations") return { ...form, country: form.country.toUpperCase() };
    return { name: form.name, type: form.type, locationId: form.locationId, quantity: Number(form.quantity) };
  }

  async function createEntity(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage(null);
    const response = await apiFetch<Entity>(config.endpoint, { method: "POST", body: JSON.stringify(requestBody()) });
    setSaving(false);
    if (!response.success) return setMessage({ type: "error", text: response.error?.message || "The record could not be created." });
    setForm({}); setShowCreate(false); setMessage({ type: "success", text: `${config.title.slice(0, -1)} created.` }); await load();
  }

  async function archiveEntity(entity: Entity) {
    const label = describe(kind, entity).name;
    if (!window.confirm(`Archive ${label}? Existing historical records remain intact.`)) return;
    const response = await apiFetch<Entity>(`${config.endpoint}/${entity.id}`, { method: "DELETE" });
    if (!response.success) return setMessage({ type: "error", text: response.error?.message || "The record could not be archived." });
    setMessage({ type: "success", text: `${label} archived.` }); await load();
  }

  if (!hasPermission(config.read)) return <div className="directory-empty">Your role does not have permission to view this organization resource.</div>;

  return <div>
    <PageHeader title={config.title} description={config.description} actions={canManage ? <button className="workspace-action" onClick={() => setShowCreate((open) => !open)}>{showCreate ? "Close" : `Add ${config.title.slice(0, -1).toLowerCase()}`}</button> : undefined} />
    {message && <div className={`directory-message ${message.type}`}>{message.text}</div>}
    {showCreate && <form className="directory-form" onSubmit={createEntity}>
      <div className="operations-panel-heading"><div><h2>Create {config.title.slice(0, -1).toLowerCase()}</h2><span>Saved directly to the active organization.</span></div></div>
      <div className="directory-fields">{fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.type === "select" ? <select required={field.required} value={form[field.key] || ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}><option value="">Select…</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type || "text"} min={field.type === "number" ? "0" : undefined} step={field.key === "price" ? "0.01" : undefined} required={field.required} value={form[field.key] || ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />}</label>)}</div>
      <button className="workspace-action" disabled={saving}>{saving ? "Saving…" : "Create"}</button>
    </form>}
    <section className="operations-panel">
      <div className="operations-panel-heading"><div><h2>Active records</h2><span>{entities.length} in this organization</span></div></div>
      {loading ? <p className="directory-empty">Loading authoritative records…</p> : entities.length === 0 ? <p className="directory-empty">No records yet. {canManage ? "Create the first one to continue setup." : "Ask an organization administrator to complete setup."}</p> : <div className="directory-list">{entities.map((entity) => { const summary = describe(kind, entity); return <article key={entity.id}><div><strong>{summary.name}</strong><span>{summary.detail}</span></div><small>{summary.meta}</small>{canManage && <button onClick={() => archiveEntity(entity)}>Archive</button>}</article>; })}</div>}
    </section>
  </div>;
}
