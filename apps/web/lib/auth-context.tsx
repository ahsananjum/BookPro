"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { PermissionKey, RoleCode, ActorType } from "@bookpro/contracts";
import { apiFetch } from "./api-client";

export interface UserSession {
  userId: string;
  email: string;
  fullName: string;
  actorType: ActorType;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  currency?: string;
  onboardingCompleted?: boolean | null;
  onboardingStep?: number | null;
  membershipId?: string;
  customerId?: string;
  roleCode?: RoleCode;
  permissions: PermissionKey[];
  locationIds?: string[];
  isPlatformAdmin: boolean;
  emailVerifiedAt?: string | null;
}

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  refetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: PermissionKey) => boolean;
  hasRole: (...roles: RoleCode[]) => boolean;
  selectOrganization: (organizationId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refetchUser: async () => {},
  logout: async () => {},
  hasPermission: () => false,
  hasRole: () => false,
  selectOrganization: async () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      const res = await apiFetch<UserSession>("/auth/me");
      if (res.success && res.data) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const logout = async () => {
    await apiFetch("/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  };

  const hasPermission = (perm: PermissionKey): boolean => {
    if (!user) return false;
    if (user.isPlatformAdmin) return true;
    return user.permissions.includes(perm);
  };

  const hasRole = (...roles: RoleCode[]): boolean => {
    if (!user) return false;
    if (user.isPlatformAdmin) return true;
    return !!user.roleCode && roles.includes(user.roleCode);
  };

  const selectOrganization = async (organizationId: string): Promise<boolean> => {
    const response = await apiFetch("/auth/select-organization", {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    });
    if (!response.success) return false;
    await fetchCurrentUser();
    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refetchUser: fetchCurrentUser,
        logout,
        hasPermission,
        hasRole,
        selectOrganization,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
