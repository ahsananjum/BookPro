import { ApiResponseEnvelope, RequestHeaders } from "@bookpro/contracts";

function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export async function apiFetch<T>(
    endpoint: string,
    options: RequestInit = {},
    orgId?: string
): Promise<ApiResponseEnvelope<T>> {
    return apiFetchInternal<T>(endpoint, options, orgId, true);
}

let activeRefreshPromise: Promise<boolean> | null = null;

async function requestTokenRefresh(baseUrl: string, correlationId: string): Promise<boolean> {
    if (!activeRefreshPromise) {
        activeRefreshPromise = (async () => {
            try {
                const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        [RequestHeaders.REQUEST_ID]: generateUUID(),
                        [RequestHeaders.CORRELATION_ID]: correlationId,
                    },
                });
                return refreshResponse.ok;
            } catch {
                return false;
            } finally {
                activeRefreshPromise = null;
            }
        })();
    }
    return activeRefreshPromise;
}

async function apiFetchInternal<T>(endpoint: string, options: RequestInit, orgId: string | undefined, mayRefresh: boolean): Promise<ApiResponseEnvelope<T>> {
    const baseUrl = typeof window !== "undefined" ? "/api/v1" : (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000/api/v1");
    let url: string;
    if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
        url = endpoint;
    } else if (endpoint.startsWith("/api/v1")) {
        url = endpoint;
    } else {
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        url = `${baseUrl}${cleanEndpoint}`;
    }

    const requestId = generateUUID();
    const correlationId = requestId;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        [RequestHeaders.REQUEST_ID]: requestId,
        [RequestHeaders.CORRELATION_ID]: correlationId,
        ...(orgId ? { [RequestHeaders.ORGANIZATION_ID]: orgId } : {}),
        ...(options.headers as Record<string, string>),
    };

    try {
        const res = await fetch(url, {
            ...options,
            headers,
            credentials: "include",
        });

        if (res.status === 401 && mayRefresh && endpoint !== "/auth/login" && endpoint !== "/auth/refresh" && endpoint !== "/auth/mfa/complete") {
            const refreshed = await requestTokenRefresh(baseUrl, correlationId);
            if (refreshed) return apiFetchInternal<T>(endpoint, options, orgId, false);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            return {
                success: false,
                error: {
                    code: "INVALID_RESPONSE",
                    message: res.status >= 400
                        ? `Server error (${res.status}): ${res.statusText}`
                        : "Received non-JSON response from server",
                    requestId,
                    correlationId,
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const json = await res.json();

        if (!res.ok) {
            const firstDetail = Array.isArray(json.details) && json.details.length > 0 ? json.details[0]?.message : undefined;
            const message = firstDetail || json.detail || json.message || (typeof json.error === "string" ? json.error : json.error?.message) || json.title || `Server error (${res.status})`;
            return {
                success: false,
                error: {
                    code: json.code || json.title || "HTTP_ERROR",
                    message,
                    details: json.details,
                    requestId: json.requestId || requestId,
                    correlationId: json.correlationId || correlationId,
                    timestamp: json.timestamp || new Date().toISOString(),
                },
            };
        }

        if (Array.isArray(json) || (typeof json === "object" && json !== null && !("success" in json))) {
            return {
                success: true,
                data: json as T,
            };
        }

        return json as ApiResponseEnvelope<T>;

    } catch (err: any) {
        return {
            success: false,
            error: {
                code: "NETWORK_ERROR",
                message: err.message || "Failed to execute fetch request",
                requestId,
                correlationId,
                timestamp: new Date().toISOString(),
            },
        };
    }
}
