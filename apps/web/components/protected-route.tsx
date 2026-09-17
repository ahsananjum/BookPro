"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ActorType, PermissionKey, RoleCode } from "@bookpro/contracts";
import { useAuth } from "../lib/auth-context";
import { usePathname } from "next/navigation";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermissions?: PermissionKey[];
  allowedRoles?: RoleCode[];
  allowedActorTypes?: ActorType[];
  platformAdminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions = [],
  allowedRoles,
  allowedActorTypes,
  platformAdminOnly = false,
}) => {
  const { user, loading, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const returnTo = pathname && pathname !== "/login" ? `?returnTo=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${returnTo}`);
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-medium">Verifying Session Security Context...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const missingPermissions = user.isPlatformAdmin ? [] : requiredPermissions.filter((p) => !hasPermission(p));
  const actorDenied = !user.isPlatformAdmin && !!allowedActorTypes && !allowedActorTypes.includes(user.actorType);
  const roleDenied = !user.isPlatformAdmin && !!allowedRoles && (!user.roleCode || !allowedRoles.includes(user.roleCode));
  const platformDenied = platformAdminOnly && !user.isPlatformAdmin;

  if (missingPermissions.length > 0 || actorDenied || roleDenied || platformDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20 text-red-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-400 mb-6">
            Your role capability baseline does not grant permission to view this resource.
          </p>
          <div className="bg-slate-950/60 rounded-lg p-3 text-xs font-mono text-red-300 mb-6 border border-red-900/40 text-left">
            {missingPermissions.length > 0
              ? `Missing capability: ${missingPermissions.join(", ")}`
              : "This account cannot access this workspace."}
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg transition-colors border border-slate-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
