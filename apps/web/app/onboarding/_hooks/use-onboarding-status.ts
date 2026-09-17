"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../../../lib/api-client";
import { OnboardingStatusResponseDto } from "@bookpro/contracts";

export function useOnboardingStatus() {
    const [status, setStatus] = useState<OnboardingStatusResponseDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await apiFetch<OnboardingStatusResponseDto>("/organization/onboarding/status");
            if (res.success && res.data) {
                setStatus(res.data);
            } else {
                setError(res.error?.message || "Failed to load onboarding status");
            }
        } catch (err: any) {
            setError(err.message || "Network error loading onboarding status");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    return {
        status,
        loading,
        error,
        refetch: fetchStatus,
        setStatus,
    };
}
