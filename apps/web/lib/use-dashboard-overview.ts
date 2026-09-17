"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { apiFetch } from "./api-client";
import { buildTenantQueryKey } from "./query-key";
import { DashboardOverviewResponseDto } from "@bookpro/contracts";

export function useDashboardOverview(locationIdFilter?: string, currencyOverride?: string) {
    const { user } = useAuth();

    return useQuery({
        queryKey: buildTenantQueryKey(
            user?.organizationId,
            "dashboard-overview",
            locationIdFilter || "all",
            currencyOverride || "default"
        ),
        queryFn: async () => {
            const params = new URLSearchParams();
            if (locationIdFilter) params.append("locationId", locationIdFilter);
            if (currencyOverride) params.append("currency", currencyOverride);
            const queryParam = params.toString() ? `?${params.toString()}` : "";
            const response = await apiFetch<DashboardOverviewResponseDto>(
                `/organization/dashboard${queryParam}`
            );
            if (!response.success || !response.data) {
                throw new Error(response.error?.message || "Failed to load dashboard overview.");
            }
            return response.data;
        },
        enabled: !!user?.organizationId && user.actorType === "STAFF",
        staleTime: 60 * 1000, // 1 minute
        refetchInterval: 120 * 1000, // 2 minutes background refetch
    });
}
