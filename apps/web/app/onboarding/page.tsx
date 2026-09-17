"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "../../components/protected-route";
import { useAuth } from "../../lib/auth-context";
import { apiFetch } from "../../lib/api-client";
import { useOnboardingStatus } from "./_hooks/use-onboarding-status";
import { useReferenceData } from "./_hooks/use-reference-data";
import { useSaveStatus } from "./_hooks/use-save-status";
import { useUnsavedWarning } from "./_hooks/use-unsaved-warning";
import { OnboardingShell } from "./_shell/onboarding-shell";
import { StepBusinessDetails, BusinessDetailsData } from "./steps/01-business-details";
import { StepIndustry } from "./steps/02-industry";
import { StepRegionalSettings, RegionalSettingsData } from "./steps/03-regional-settings";
import { StepLocation, LocationData } from "./steps/04-location";
import { StepService, ServiceData } from "./steps/05-service";
import { StepStaff, StaffData } from "./steps/06-staff";
import { StepAvailability, WeeklyAvailabilityState } from "./steps/07-availability";
import { StepPayment, PaymentData } from "./steps/08-payment";
import { StepBranding, BrandingData } from "./steps/09-branding";
import { StepPolicy, PolicyData } from "./steps/10-booking-policy";
import { StepPublish } from "./steps/11-publish";
import { ClockSpinner } from "../../components/animated-svgs";
import { sanitizeErrorMessage } from "../../lib/error-utils";

export default function OnboardingPage() {
    return (
        <ProtectedRoute>
            <OnboardingWizard />
        </ProtectedRoute>
    );
}

function OnboardingWizard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, refetchUser } = useAuth();
    const { status, loading: loadingStatus, refetch: refetchStatus } = useOnboardingStatus();
    const { timezones, currencies, countries, industries, loading: loadingRef } = useReferenceData();
    const { saveState, errorMessage, startSaving, finishSaved, failSaving, resetSaveState } = useSaveStatus();

    const [currentStep, setCurrentStep] = useState<number>(1);
    const [isDirty, setIsDirty] = useState(false);
    const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
    const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
    const [createdLocationId, setCreatedLocationId] = useState<string | null>(null);
    const [createdServiceId, setCreatedServiceId] = useState<string | null>(null);
    const [createdStaffId, setCreatedStaffId] = useState<string | null>(null);

    // Step 1: Business Details
    const [businessDetails, setBusinessDetails] = useState<BusinessDetailsData>({
        name: "",
        country: "US",
        phone: "",
        email: "",
        website: "",
    });

    // Step 2: Industry
    const [selectedIndustry, setSelectedIndustry] = useState<string>("");

    // Step 3: Regional Settings
    const [regionalSettings, setRegionalSettings] = useState<RegionalSettingsData>({
        timezone: "UTC",
        currency: "USD",
    });

    // Step 4: First Location
    const [locationData, setLocationData] = useState<LocationData>({
        name: "",
        slug: "",
        address: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
        phone: "",
        taxRatePct: "0",
        instructions: "",
        operatingHours: {
            monday: { active: true, open: "09:00", close: "18:00" },
            tuesday: { active: true, open: "09:00", close: "18:00" },
            wednesday: { active: true, open: "09:00", close: "18:00" },
            thursday: { active: true, open: "09:00", close: "18:00" },
            friday: { active: true, open: "09:00", close: "18:00" },
            saturday: { active: false, open: "10:00", close: "16:00" },
            sunday: { active: false, open: "10:00", close: "16:00" },
        },
    });

    // Step 5: First Service
    const [serviceData, setServiceData] = useState<ServiceData>({
        name: "",
        description: "",
        durationMin: 45,
        price: "35.00",
        currency: "USD",
        bufferAfterMin: 0,
        depositType: "NONE",
        depositValue: "0",
    });

    // Step 6: First Staff
    const [staffData, setStaffData] = useState<StaffData>({
        mode: "OWNER",
        fullName: "",
        displayName: "",
        email: "",
        title: "Principal Practitioner",
        bio: "",
        roleCode: "STAFF",
    });

    // Step 7: Availability
    const [availability, setAvailability] = useState<WeeklyAvailabilityState>({
        1: { active: true, start: "09:00", end: "17:00" }, // Mon
        2: { active: true, start: "09:00", end: "17:00" }, // Tue
        3: { active: true, start: "09:00", end: "17:00" }, // Wed
        4: { active: true, start: "09:00", end: "17:00" }, // Thu
        5: { active: true, start: "09:00", end: "17:00" }, // Fri
        6: { active: false, start: "10:00", end: "16:00" }, // Sat
        0: { active: false, start: "10:00", end: "16:00" }, // Sun
    });

    // Step 8: Payment
    const [paymentData, setPaymentData] = useState<PaymentData>({
        paymentIntent: "ONLINE",
    });

    // Step 9: Branding
    const [brandingData, setBrandingData] = useState<BrandingData>({
        brandName: "",
        logoUrl: "",
        primaryColor: "#0284c7",
        accentColor: "#0ea5e9",
    });

    // Step 10: Policy
    const [policyData, setPolicyData] = useState<PolicyData>({
        minNoticeHours: 24,
        maxNoticeDays: 60,
        cancelCutoffHours: 24,
        cancelFeeType: "NONE",
        cancelFeeValue: 0,
        rescheduleCutoffHours: 12,
        holdDurationMinutes: 10,
    });

    const initializedRef = useRef(false);

    useUnsavedWarning(isDirty);

    // Synchronize initial authoritative data ONLY on first load
    useEffect(() => {
        if (!status || initializedRef.current) return;
        initializedRef.current = true;

        const org = status.organization;

        // Resume step from database or query param on initial load
        const paramStep = searchParams.get("step");
        if (paramStep && parseInt(paramStep, 10) >= 1 && parseInt(paramStep, 10) <= 11) {
            setCurrentStep(parseInt(paramStep, 10));
        } else if (org.onboardingStep && org.onboardingStep >= 1 && org.onboardingStep <= 11) {
            setCurrentStep(org.onboardingStep);
        }

        // Initialize Step 1
        setBusinessDetails({
            name: org.name || user?.organizationName || "",
            country: org.country || "US",
            phone: org.phone || "",
            email: org.email || user?.email || "",
            website: org.website || "",
        });

        // Initialize Step 2
        if (org.industry) {
            setSelectedIndustry(org.industry);
        }

        // Initialize Step 3
        const devTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        setRegionalSettings({
            timezone: org.timezone && org.timezone !== "UTC" ? org.timezone : devTz,
            currency: org.currency || "USD",
        });

        // Initialize Step 4
        if (status.firstLocation) {
            setCreatedLocationId(status.firstLocation.id);
            const loc = status.firstLocation;
            const parsedHours: Record<string, { active: boolean; open: string; close: string }> = {
                monday: { active: true, open: "09:00", close: "18:00" },
                tuesday: { active: true, open: "09:00", close: "18:00" },
                wednesday: { active: true, open: "09:00", close: "18:00" },
                thursday: { active: true, open: "09:00", close: "18:00" },
                friday: { active: true, open: "09:00", close: "18:00" },
                saturday: { active: false, open: "10:00", close: "16:00" },
                sunday: { active: false, open: "10:00", close: "16:00" },
            };

            if (loc.operatingHours && typeof loc.operatingHours === "object") {
                for (const [dayKey, intervals] of Object.entries(loc.operatingHours)) {
                    const k = dayKey.toLowerCase();
                    if (Array.isArray(intervals) && intervals.length > 0 && intervals[0]?.start && intervals[0]?.end) {
                        parsedHours[k] = { active: true, open: intervals[0].start, close: intervals[0].end };
                    } else if (Array.isArray(intervals) && intervals.length === 0) {
                        parsedHours[k] = { active: false, open: "09:00", close: "18:00" };
                    } else if (typeof intervals === "object" && intervals !== null) {
                        const obj = intervals as any;
                        parsedHours[k] = {
                            active: obj.active !== false,
                            open: obj.open || obj.start || "09:00",
                            close: obj.close || obj.end || "18:00",
                        };
                    }
                }
            }

            setLocationData({
                name: loc.name,
                slug: loc.slug,
                address: loc.address || "",
                city: loc.city || "",
                state: loc.state || "",
                postalCode: loc.postalCode || "",
                country: loc.country || org.country || "US",
                phone: loc.phone || "",
                taxRatePct: loc.taxRatePct !== null ? String(loc.taxRatePct) : "0",
                instructions: loc.instructions || "",
                operatingHours: parsedHours,
            });
        }

        // Initialize Step 5
        if (status.firstService) {
            setCreatedServiceId(status.firstService.id);
            const svc = status.firstService;
            setServiceData({
                name: svc.name,
                description: svc.description || "",
                durationMin: svc.durationMin || 45,
                price: (svc.priceCents / 100).toFixed(2),
                currency: svc.currency || org.currency || "USD",
                bufferAfterMin: svc.bufferAfterMin || 0,
                depositType: (svc.depositType as any) || "NONE",
                depositValue: svc.depositValue !== null ? String(svc.depositValue) : "0",
            });
        }

        // Initialize Step 6
        if (status.firstStaff) {
            setCreatedStaffId(status.firstStaff.id);
            const stf = status.firstStaff;
            setStaffData({
                mode: stf.isOwner ? "OWNER" : "TEAM_MEMBER",
                fullName: stf.displayName,
                displayName: stf.displayName,
                email: stf.email || "",
                title: stf.title || "Principal Practitioner",
                bio: stf.bio || "",
                roleCode: (stf.roleCode as any) || "STAFF",
            });
        } else if (user) {
            setStaffData((prev) => ({
                ...prev,
                fullName: user.fullName || "",
                displayName: user.fullName || "",
                email: user.email || "",
            }));
        }

        // Initialize Step 7 Availability from database if configured
        if (status.firstStaff?.availabilities && status.firstStaff.availabilities.length > 0) {
            const loadedAvail: WeeklyAvailabilityState = {
                1: { active: false, start: "09:00", end: "17:00" },
                2: { active: false, start: "09:00", end: "17:00" },
                3: { active: false, start: "09:00", end: "17:00" },
                4: { active: false, start: "09:00", end: "17:00" },
                5: { active: false, start: "09:00", end: "17:00" },
                6: { active: false, start: "10:00", end: "16:00" },
                0: { active: false, start: "10:00", end: "16:00" },
            };
            for (const a of status.firstStaff.availabilities) {
                if (loadedAvail[a.dayOfWeek] !== undefined) {
                    loadedAvail[a.dayOfWeek] = {
                        active: true,
                        start: a.startTime,
                        end: a.endTime,
                    };
                }
            }
            setAvailability(loadedAvail);
        }

        // Initialize Step 8
        if (org.paymentIntent) {
            setPaymentData({ paymentIntent: org.paymentIntent as any });
        }

        // Initialize Step 9
        setBrandingData({
            brandName: org.brandName || org.name || user?.organizationName || "",
            logoUrl: org.logoUrl || "",
            primaryColor: org.primaryColor || "#0284c7",
            accentColor: (org as any).accentColor || "#0ea5e9",
        });

        // Initialize Step 10
        if (status.policy) {
            const pol = status.policy;
            setPolicyData({
                minNoticeHours: pol.minNoticeHours ?? 24,
                maxNoticeDays: pol.maxNoticeDays ?? 60,
                cancelCutoffHours: pol.cancelCutoffHours ?? 24,
                cancelFeeType: (pol.cancelFeeType as any) || "NONE",
                cancelFeeValue: pol.cancelFeeValue ?? 0,
                rescheduleCutoffHours: pol.rescheduleCutoffHours ?? 12,
                holdDurationMinutes: pol.holdDurationMinutes ?? 10,
            });
        }

        // Check if already published
        if (org.bookingEnabled && org.onboardingCompleted) {
            const appBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
            setPublishedUrl(`${appBaseUrl}/book/${org.bookingSlug || org.slug || "workspace"}`);
        }
    }, [status, searchParams, user]);

    // Step 1 validation & save
    const saveStep1 = async () => {
        const errors: Record<string, string> = {};
        if (!businessDetails.name.trim()) errors.name = "Business name is required";
        if (!businessDetails.country) errors.country = "Country is required";
        if (Object.keys(errors).length > 0) {
            setStepErrors(errors);
            throw new Error("Please complete all required fields");
        }

        let cleanWebsite = businessDetails.website.trim();
        if (cleanWebsite && !/^https?:\/\//i.test(cleanWebsite)) {
            cleanWebsite = `https://${cleanWebsite}`;
            setBusinessDetails((prev) => ({ ...prev, website: cleanWebsite }));
        }

        const res = await apiFetch("/organization/current", {
            method: "PUT",
            body: JSON.stringify({
                name: businessDetails.name.trim(),
                country: businessDetails.country,
                phone: businessDetails.phone.trim() || undefined,
                email: businessDetails.email.trim() || undefined,
                website: cleanWebsite || undefined,
                brandName: brandingData.brandName || businessDetails.name.trim(),
            }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save business details").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 1 }) });
    };

    // Step 2 validation & save
    const saveStep2 = async () => {
        if (!selectedIndustry) throw new Error("Please select an industry category to continue");

        const res = await apiFetch("/organization/current", {
            method: "PUT",
            body: JSON.stringify({ industry: selectedIndustry }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save industry category").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 2 }) });
    };

    // Step 3 validation & save
    const saveStep3 = async () => {
        const errors: Record<string, string> = {};
        if (!regionalSettings.timezone) errors.timezone = "Time zone is required";
        if (!regionalSettings.currency) errors.currency = "Currency is required";
        if (Object.keys(errors).length > 0) {
            setStepErrors(errors);
            throw new Error("Please select both time zone and currency");
        }

        const res = await apiFetch("/organization/current", {
            method: "PUT",
            body: JSON.stringify({
                timezone: regionalSettings.timezone,
                currency: regionalSettings.currency,
            }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save regional settings").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 3 }) });
    };

    // Step 4 validation & save
    const saveStep4 = async () => {
        const errors: Record<string, string> = {};
        if (!locationData.name.trim()) errors.name = "Location name is required";
        if (Object.keys(errors).length > 0) {
            setStepErrors(errors);
            throw new Error("Please enter a location name");
        }

        const autoSlug = locationData.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "main-branch";

        const transformedHours: Record<string, Array<{ start: string; end: string }>> = {};
        if (locationData.operatingHours && typeof locationData.operatingHours === "object") {
            for (const [dayKey, dayVal] of Object.entries(locationData.operatingHours)) {
                if (dayVal.active && dayVal.open && dayVal.close && dayVal.close > dayVal.open) {
                    transformedHours[dayKey.toLowerCase()] = [{ start: dayVal.open, end: dayVal.close }];
                } else {
                    transformedHours[dayKey.toLowerCase()] = [];
                }
            }
        }

        const existingLocationId = createdLocationId || status?.firstLocation?.id;
        const payload = {
            name: locationData.name.trim(),
            slug: locationData.slug || autoSlug,
            timezone: regionalSettings.timezone || "UTC",
            address: locationData.address.trim() || undefined,
            city: locationData.city.trim() || undefined,
            state: locationData.state.trim() || undefined,
            postalCode: locationData.postalCode.trim() || undefined,
            country: locationData.country || businessDetails.country || "US",
            phone: locationData.phone.trim() || undefined,
            taxRatePct: parseFloat(locationData.taxRatePct) || 0,
            operatingHours: transformedHours,
            instructions: locationData.instructions.trim() || undefined,
        };

        const res = existingLocationId
            ? await apiFetch<any>(`/locations/${existingLocationId}`, { method: "PUT", body: JSON.stringify(payload) })
            : await apiFetch<any>("/locations", { method: "POST", body: JSON.stringify(payload) });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save location details").message);
        if (res.data?.id) {
            setCreatedLocationId(res.data.id);
        }
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 4 }) });
    };

    // Step 5 validation & save
    const saveStep5 = async () => {
        const errors: Record<string, string> = {};
        if (!serviceData.name.trim()) errors.name = "Service title is required";
        if (!serviceData.durationMin || serviceData.durationMin < 1) errors.durationMin = "Duration must be at least 1 minute";
        const priceNum = parseFloat(serviceData.price);
        if (isNaN(priceNum) || priceNum < 0) errors.price = "Enter a valid non-negative price";
        if (Object.keys(errors).length > 0) {
            setStepErrors(errors);
            throw new Error("Please review service fields");
        }

        const existingServiceId = createdServiceId || status?.firstService?.id;
        let locationId = createdLocationId || status?.firstLocation?.id;
        if (!locationId) {
            const locRes = await apiFetch<any[]>("/locations");
            if (locRes.success && locRes.data && locRes.data.length > 0) {
                locationId = locRes.data[0].id;
                setCreatedLocationId(locationId || null);
            }
        }

        const payload = {
            name: serviceData.name.trim(),
            description: serviceData.description.trim() || undefined,
            durationMin: serviceData.durationMin,
            priceCents: Math.round(priceNum * 100),
            currency: regionalSettings.currency || "USD",
            postBufferMin: serviceData.bufferAfterMin || 0,
            depositType: serviceData.depositType,
            depositValue: serviceData.depositType !== "NONE" ? parseFloat(serviceData.depositValue) || 0 : 0,
            eligibleLocationIds: locationId ? [locationId] : undefined,
        };

        const res = existingServiceId
            ? await apiFetch<any>(`/services/${existingServiceId}`, { method: "PUT", body: JSON.stringify(payload) })
            : await apiFetch<any>("/services", { method: "POST", body: JSON.stringify(payload) });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save service").message);
        if (res.data?.id) {
            setCreatedServiceId(res.data.id);
        }
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 5 }) });
    };

    // Step 6 validation & save
    const saveStep6 = async () => {
        const errors: Record<string, string> = {};
        if (!staffData.displayName.trim()) errors.displayName = "Staff name is required";
        if (!staffData.email.trim()) errors.email = "Valid work email is required";
        if (Object.keys(errors).length > 0) {
            setStepErrors(errors);
            throw new Error("Please fill in required staff profile details");
        }

        let locationId = createdLocationId || status?.firstLocation?.id;
        if (!locationId) {
            const locRes = await apiFetch<any[]>("/locations");
            if (locRes.success && locRes.data && locRes.data.length > 0) {
                locationId = locRes.data[0].id;
                setCreatedLocationId(locationId || null);
            }
        }

        let serviceId = createdServiceId || status?.firstService?.id;
        if (!serviceId) {
            const svcRes = await apiFetch<any[]>("/services");
            if (svcRes.success && svcRes.data && svcRes.data.length > 0) {
                serviceId = svcRes.data[0].id;
                setCreatedServiceId(serviceId || null);
            }
        }

        const existingStaffId = createdStaffId || status?.firstStaff?.id;

        const payload = {
            userId: staffData.mode === "OWNER" ? user?.userId : undefined,
            email: staffData.email.trim().toLowerCase(),
            fullName: staffData.fullName.trim() || staffData.displayName.trim(),
            displayName: staffData.displayName.trim(),
            title: staffData.title.trim() || undefined,
            bio: staffData.bio.trim() || undefined,
            roleCode: staffData.mode === "OWNER" ? "OWNER" : staffData.roleCode,
            locationIds: locationId ? [locationId] : undefined,
            serviceIds: serviceId ? [serviceId] : undefined,
        };

        const res = existingStaffId
            ? await apiFetch<any>(`/staff/${existingStaffId}`, { method: "PUT", body: JSON.stringify(payload) })
            : await apiFetch<any>("/staff", { method: "POST", body: JSON.stringify(payload) });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save staff profile").message);
        if (res.data?.id) {
            setCreatedStaffId(res.data.id);
        }
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 6 }) });
    };

    // Step 7 validation & save
    const saveStep7 = async () => {
        let staffId = createdStaffId || status?.firstStaff?.id;
        if (!staffId) {
            const listRes = await apiFetch<any[]>("/staff");
            if (listRes.success && listRes.data && listRes.data.length > 0) {
                staffId = listRes.data[0].id;
                setCreatedStaffId(staffId || null);
            }
        }

        if (!staffId) throw new Error("Staff profile not found. Please complete Step 6 first.");

        let locationId = createdLocationId || status?.firstLocation?.id;
        if (!locationId) {
            const locRes = await apiFetch<any[]>("/locations");
            if (locRes.success && locRes.data && locRes.data.length > 0) {
                locationId = locRes.data[0].id;
                setCreatedLocationId(locationId || null);
            }
        }

        const activeDays = Object.entries(availability).filter(([_, v]) => v.active);
        if (activeDays.length === 0) throw new Error("Please enable working hours for at least one day");

        // Validate start < end
        for (const [day, setting] of activeDays) {
            if (setting.start >= setting.end) {
                throw new Error(`Invalid hours for day ${day}: End time must be after start time`);
            }
        }

        const availabilities = activeDays.map(([dayStr, v]) => ({
            dayOfWeek: parseInt(dayStr, 10),
            startTime: v.start,
            endTime: v.end,
            locationId: locationId || undefined,
        }));

        const res = await apiFetch(`/staff/${staffId}/availability`, {
            method: "PUT",
            body: JSON.stringify({ availabilities }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save availability schedule").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 7 }) });
    };

    // Step 8 validation & save
    const saveStep8 = async () => {
        const res = await apiFetch("/organization/current", {
            method: "PUT",
            body: JSON.stringify({
                paymentIntent: paymentData.paymentIntent,
            }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save payment preferences").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 8 }) });
    };

    // Step 9 validation & save
    const saveStep9 = async () => {
        const res = await apiFetch("/organization/current", {
            method: "PUT",
            body: JSON.stringify({
                brandName: brandingData.brandName || businessDetails.name,
                logoUrl: brandingData.logoUrl || undefined,
                primaryColor: brandingData.primaryColor || "#0284c7",
                accentColor: brandingData.accentColor || "#0ea5e9",
            }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to save branding assets").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 9 }) });
    };

    // Step 10 validation & save
    const saveStep10 = async () => {
        const res = await apiFetch("/policies", {
            method: "PUT",
            body: JSON.stringify({
                minNoticeHours: policyData.minNoticeHours,
                maxNoticeDays: policyData.maxNoticeDays,
                cancelCutoffHours: policyData.cancelCutoffHours,
                cancelFeeType: policyData.cancelFeeType,
                cancelFeeValue: policyData.cancelFeeValue,
                rescheduleCutoffHours: policyData.rescheduleCutoffHours,
                holdDurationMinutes: policyData.holdDurationMinutes,
            }),
        });

        if (!res.success) throw new Error(sanitizeErrorMessage(res.error, "Failed to update booking policies").message);
        await apiFetch("/organization/onboarding/step", { method: "POST", body: JSON.stringify({ step: 10 }) });
    };

    // Step 11 Publish & Launch
    const saveStep11 = async () => {
        const res = await apiFetch<any>("/organization/publish", { method: "POST" });
        if (!res.success) {
            throw new Error(
                sanitizeErrorMessage(res.error, "Failed to publish booking portal. Please verify all requirements.").message
            );
        }

        const appBaseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
        const slug = status?.organization?.bookingSlug || status?.organization?.slug || "workspace";
        const portalUrl = res.data?.publicUrl || `${appBaseUrl}/book/${slug}`;
        setPublishedUrl(portalUrl);

        await refetchUser();
        await refetchStatus();
    };

    const handleNext = async () => {
        resetSaveState();
        setStepErrors({});
        startSaving();

        try {
            if (currentStep === 1) await saveStep1();
            else if (currentStep === 2) await saveStep2();
            else if (currentStep === 3) await saveStep3();
            else if (currentStep === 4) await saveStep4();
            else if (currentStep === 5) await saveStep5();
            else if (currentStep === 6) await saveStep6();
            else if (currentStep === 7) await saveStep7();
            else if (currentStep === 8) await saveStep8();
            else if (currentStep === 9) await saveStep9();
            else if (currentStep === 10) await saveStep10();
            else if (currentStep === 11) {
                await saveStep11();
                finishSaved();
                setIsDirty(false);
                return;
            }

            finishSaved();
            setIsDirty(false);

            if (currentStep < 11) {
                const nextStep = currentStep + 1;
                setCurrentStep(nextStep);
                window.history.replaceState(null, "", `/onboarding?step=${nextStep}`);
            }

            // Silent background status update so badges refresh
            refetchStatus();
        } catch (err: any) {
            const sanitized = sanitizeErrorMessage(err, "Failed to save changes. Please review your inputs.");
            failSaving(sanitized.message);
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            resetSaveState();
            setStepErrors({});
            const prevStep = currentStep - 1;
            setCurrentStep(prevStep);
            window.history.replaceState(null, "", `/onboarding?step=${prevStep}`);
        }
    };

    const handleSaveAndExit = async () => {
        startSaving();
        try {
            if (currentStep === 1) await saveStep1();
            else if (currentStep === 2) await saveStep2();
            else if (currentStep === 3) await saveStep3();
            else if (currentStep === 4) await saveStep4();
            else if (currentStep === 5) await saveStep5();
            else if (currentStep === 6) await saveStep6();
            else if (currentStep === 7) await saveStep7();
            else if (currentStep === 8) await saveStep8();
            else if (currentStep === 9) await saveStep9();
            else if (currentStep === 10) await saveStep10();

            setIsDirty(false);
            router.push("/app");
        } catch {
            router.push("/app");
        }
    };

    const handleSkip = () => {
        if (currentStep === 8) {
            handleNext();
        }
    };

    if (loadingStatus && !status) {
        return (
            <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", backgroundColor: "#060913" }}>
                <div style={{ textAlign: "center", color: "#94a3b8" }}>
                    <ClockSpinner size={36} />
                    <p style={{ marginTop: "16px", fontSize: "14px", fontWeight: 600 }}>Loading setup progress…</p>
                </div>
            </div>
        );
    }

    return (
        <OnboardingShell
            currentStep={currentStep}
            completedSteps={status?.completedSteps || []}
            saveState={saveState}
            errorMessage={errorMessage}
            loading={saveState === "saving"}
            isPublished={!!publishedUrl}
            onStepChange={(step) => {
                resetSaveState();
                setStepErrors({});
                setCurrentStep(step);
                window.history.replaceState(null, "", `/onboarding?step=${step}`);
            }}
            onNext={handleNext}
            onPrev={handlePrev}
            onSaveAndExit={handleSaveAndExit}
            onSkip={currentStep === 8 ? handleSkip : undefined}
        >
            {/* Step 1: Business Details */}
            {currentStep === 1 && (
                <StepBusinessDetails
                    data={businessDetails}
                    countries={countries}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setBusinessDetails((prev) => ({ ...prev, [f]: v }));
                    }}
                    errors={stepErrors}
                />
            )}

            {/* Step 2: Industry */}
            {currentStep === 2 && (
                <StepIndustry
                    selectedIndustry={selectedIndustry}
                    industries={industries}
                    onSelect={(ind) => {
                        setIsDirty(true);
                        setSelectedIndustry(ind);
                    }}
                    error={stepErrors.industry}
                />
            )}

            {/* Step 3: Regional Settings */}
            {currentStep === 3 && (
                <StepRegionalSettings
                    data={regionalSettings}
                    timezones={timezones}
                    currencies={currencies}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setRegionalSettings((prev) => ({ ...prev, [f]: v }));
                    }}
                    errors={stepErrors}
                />
            )}

            {/* Step 4: First Location */}
            {currentStep === 4 && (
                <StepLocation
                    data={locationData}
                    countries={countries}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setLocationData((prev) => ({ ...prev, [f]: v }));
                    }}
                    errors={stepErrors}
                />
            )}

            {/* Step 5: First Service */}
            {currentStep === 5 && (
                <StepService
                    data={serviceData}
                    currency={regionalSettings.currency}
                    locationName={locationData.name || status?.firstLocation?.name}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setServiceData((prev) => ({ ...prev, [f]: v }));
                    }}
                    errors={stepErrors}
                />
            )}

            {/* Step 6: First Staff */}
            {currentStep === 6 && (
                <StepStaff
                    data={staffData}
                    ownerUser={user ? { fullName: user.fullName, email: user.email } : null}
                    locationName={locationData.name || status?.firstLocation?.name}
                    serviceName={serviceData.name || status?.firstService?.name}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setStaffData((prev) => ({ ...prev, [f]: v }));
                    }}
                    errors={stepErrors}
                />
            )}

            {/* Step 7: Availability */}
            {currentStep === 7 && (
                <StepAvailability
                    availability={availability}
                    staffName={staffData.displayName || user?.fullName || "Staff Member"}
                    locationName={locationData.name || status?.firstLocation?.name}
                    timezone={regionalSettings.timezone}
                    onChange={(day, f, v) => {
                        setIsDirty(true);
                        setAvailability((prev) => ({
                            ...prev,
                            [day]: { ...prev[day], [f]: v },
                        }));
                    }}
                    onApplyWeekdays={() => {
                        setIsDirty(true);
                        const mon = availability[1];
                        setAvailability((prev) => ({
                            ...prev,
                            2: { ...mon },
                            3: { ...mon },
                            4: { ...mon },
                            5: { ...mon },
                        }));
                    }}
                    error={errorMessage || undefined}
                />
            )}

            {/* Step 8: Payment */}
            {currentStep === 8 && (
                <StepPayment
                    data={paymentData}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setPaymentData((prev) => ({ ...prev, [f]: v }));
                    }}
                    onStatusRefresh={refetchStatus}
                />
            )}

            {/* Step 9: Branding */}
            {currentStep === 9 && (
                <StepBranding
                    data={brandingData}
                    serviceName={serviceData.name || status?.firstService?.name}
                    orgId={user?.organizationId}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setBrandingData((prev) => ({ ...prev, [f]: v }));
                    }}
                />
            )}

            {/* Step 10: Policy */}
            {currentStep === 10 && (
                <StepPolicy
                    data={policyData}
                    currency={regionalSettings.currency}
                    onChange={(f, v) => {
                        setIsDirty(true);
                        setPolicyData((prev) => ({ ...prev, [f]: v }));
                    }}
                />
            )}

            {/* Step 11: Publish */}
            {currentStep === 11 && (
                <StepPublish
                    status={status}
                    publishedUrl={publishedUrl}
                    onGoToStep={(s) => {
                        resetSaveState();
                        setCurrentStep(s);
                    }}
                    onGoToWorkspace={() => router.push("/app")}
                />
            )}
        </OnboardingShell>
    );
}
