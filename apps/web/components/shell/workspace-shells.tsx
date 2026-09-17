"use client";

import React from "react";
import { ActorType, RoleCode } from "@bookpro/contracts";
import { ProtectedRoute } from "../protected-route";
import { AppShell } from "./app-shell";
import { businessNavigation, platformNavigation, staffNavigation } from "./navigation";

export function BusinessWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedActorTypes={[ActorType.STAFF]} allowedRoles={[RoleCode.OWNER, RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.RECEPTIONIST]}>
      <AppShell navigation={businessNavigation} productLabel="Business workspace">{children}</AppShell>
    </ProtectedRoute>
  );
}

export function StaffWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedActorTypes={[ActorType.STAFF]} allowedRoles={[RoleCode.STAFF, RoleCode.OWNER, RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.RECEPTIONIST]}>
      <AppShell navigation={staffNavigation} productLabel="Staff workspace">{children}</AppShell>
    </ProtectedRoute>
  );
}

export function PlatformWorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute platformAdminOnly>
      <AppShell navigation={platformNavigation} productLabel="Platform administration">{children}</AppShell>
    </ProtectedRoute>
  );
}
