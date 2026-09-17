import { Controller, Sse, Headers, Query, MessageEvent, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { RealtimeService } from "./realtime.service";
import { Observable, merge, interval, of } from "rxjs";
import { map } from "rxjs/operators";
import { ReqContext, Authenticated } from "@bookpro/server-core";
import { RequestContext } from "@bookpro/contracts";

@Controller("realtime")
export class RealtimeController {
    constructor(private readonly realtimeService: RealtimeService) { }

    @Sse("sse")
    @Authenticated()
    streamEvents(
        @Headers("x-organization-id") headerOrgId?: string,
        @Query("organizationId") queryOrgId?: string,
        @Headers("last-event-id") lastEventId?: string,
        @Query("lastEventId") queryLastEventId?: string,
        @ReqContext() ctx?: RequestContext,
    ): Observable<MessageEvent> {
        const authOrgId = ctx?.organizationId;

        if (!authOrgId) {
            throw new UnauthorizedException("Authenticated organization context is required to stream real-time events");
        }

        // Validate requested organization matches authenticated organization (prevent cross-tenant sniffing)
        const requestedOrgId = queryOrgId || headerOrgId || authOrgId;
        if (requestedOrgId !== authOrgId) {
            throw new ForbiddenException("Cross-tenant real-time subscription is forbidden");
        }

        const effectiveLastEventId = lastEventId || queryLastEventId || null;

        // 1. Initial Connection / Reconnect Handshake frame with reconnectStrategy & cursor
        const init$ = of({
            id: `conn_${Date.now()}`,
            type: "connected",
            data: JSON.stringify({
                type: "connected",
                organizationId: authOrgId,
                timestamp: new Date().toISOString(),
                reconnectStrategy: "canonical_refetch",
                lastEventId: effectiveLastEventId,
            }),
        } as MessageEvent);

        // 2. Heartbeat keepalive every 15s to keep connections alive through proxies/NAT/ALBs
        const heartbeat$ = interval(15000).pipe(
            map(() => ({
                id: `hb_${Date.now()}`,
                type: "heartbeat",
                data: JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() }),
            } as MessageEvent)),
        );

        // 3. Authenticated tenant-scoped Redis Pub/Sub events stream
        const events$ = this.realtimeService.getEventStream(authOrgId);

        return merge(init$, heartbeat$, events$);
    }
}

