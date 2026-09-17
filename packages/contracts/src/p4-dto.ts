/**
 * BookPro Phase P4 — Availability & Scheduling DTOs
 */

export interface CandidateSlot {
    startTime: string; // Canonical UTC ISO-8601
    endTime: string;   // Canonical UTC ISO-8601
    formattedStartTime: string; // Formatted in requested presentation timezone
    formattedEndTime: string;   // Formatted in requested presentation timezone
    presentationTimezone: string;
    staffId: string;
    staffName?: string;
    locationId: string;
    serviceId: string;
    availableCapacity: number;
    allocatedResourceIds?: string[];
}

export interface SearchAvailabilityRequest {
    organizationId: string;
    locationId: string;
    serviceId: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    staffId?: string;  // Optional specific staff filter
    presentationTimezone?: string; // e.g. "Asia/Karachi", "UTC"
    partySize?: number; // Defaults to 1
    addonIds?: string[];
}

export interface SearchAvailabilityResponse {
    organizationId: string;
    locationId: string;
    serviceId: string;
    presentationTimezone: string;
    startDate: string;
    endDate: string;
    totalAvailableSlots: number;
    slots: CandidateSlot[];
}

export type SearchAvailabilityInput = SearchAvailabilityRequest;

export interface ValidateAvailabilityRequest {
    organizationId: string;
    locationId: string;
    serviceId: string;
    staffId: string;
    startTime: string; // Canonical UTC ISO-8601
    partySize?: number;
    addonIds?: string[];
    resourceIds?: string[];
}

export type ValidateAvailabilityInput = ValidateAvailabilityRequest;

export interface ValidateAvailabilityResponse {
    isAvailable: boolean;
    reason?: string;
    startTime: string;
    endTime: string;
    staffId: string;
    locationId: string;
    serviceId: string;
    availableCapacity: number;
}
