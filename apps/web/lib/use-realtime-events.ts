"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RealtimeEventHint } from "@bookpro/contracts";

export interface UseRealtimeEventsOptions {
    onEvent?: (hint: RealtimeEventHint) => void;
    enableAutoRefetch?: boolean;
}

export function useRealtimeEvents(
    organizationId?: string,
    options?: UseRealtimeEventsOptions
) {
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState<RealtimeEventHint | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const wasConnectedRef = useRef(false);
    const onEventRef = useRef(options?.onEvent);
    onEventRef.current = options?.onEvent;

    const performCanonicalRefetch = useCallback((orgId: string) => {
        // Authoritative Canonical Refetch: Invalidate all tenant queries upon reconnect
        queryClient.invalidateQueries({ queryKey: [orgId, "appointments"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "calendar"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "dashboard-overview"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "kpis"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "crm"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "analytics"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "payments"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "waitlist"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "staff"] });
        queryClient.invalidateQueries({ queryKey: [orgId, "services"] });
    }, [queryClient]);

    useEffect(() => {
        if (!organizationId) {
            setIsConnected(false);
            wasConnectedRef.current = false;
            return;
        }

        const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
        const sseUrl = `${apiBase}/realtime/sse?organizationId=${encodeURIComponent(organizationId)}`;

        const es = new EventSource(sseUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
            setIsConnected(true);
            // If reconnecting after a previous disconnection, perform full canonical refetch
            if (wasConnectedRef.current) {
                performCanonicalRefetch(organizationId);
            }
            wasConnectedRef.current = true;
        };

        es.onmessage = (event) => {
            try {
                const hint: RealtimeEventHint = JSON.parse(event.data);
                if (hint.type === "heartbeat" || hint.type === "connected") {
                    return;
                }

                setLastEvent(hint);

                // Invoke caller callback if provided
                if (onEventRef.current) {
                    onEventRef.current(hint);
                }

                // Authoritative Targeted Invalidation (Architecture §57 / §111)
                if (
                    hint.type.startsWith("appointment.") ||
                    hint.type.startsWith("booking_hold.")
                ) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "appointments"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "calendar"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "kpis"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "crm"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "dashboard-overview"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "analytics"] });
                } else if (
                    hint.type.startsWith("payment.") ||
                    hint.type.startsWith("refund.")
                ) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "payments"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "kpis"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "crm"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "dashboard-overview"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "analytics"] });
                } else if (hint.type.startsWith("staff.") || hint.type.startsWith("schedule.")) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "staff"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "calendar"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "dashboard-overview"] });
                } else if (hint.type.startsWith("customer.")) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "crm"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "customers"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "dashboard-overview"] });
                } else if (hint.type.startsWith("waitlist.")) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "waitlist"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "dashboard-overview"] });
                } else if (hint.type.startsWith("location.")) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "locations"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "calendar"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "dashboard-overview"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "staff"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "services"] });
                } else if (hint.type.startsWith("calendar.")) {
                    queryClient.invalidateQueries({ queryKey: [organizationId, "calendar"] });
                    queryClient.invalidateQueries({ queryKey: [organizationId, "appointments"] });
                }
            } catch {
                // Ignore parse errors on keepalives or malformed frames
            }
        };

        es.onerror = () => {
            setIsConnected(false);
        };

        return () => {
            es.close();
            eventSourceRef.current = null;
        };
    }, [organizationId, queryClient, performCanonicalRefetch]);

    return { isConnected, lastEvent };
}

