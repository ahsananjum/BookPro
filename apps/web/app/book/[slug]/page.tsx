"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Lock,
  AlertTriangle,
  RefreshCw,
  XCircle,
  FileText,
  Shield,
  Info,
  Loader2,
  Users,
} from "../../../components/icons";
import styles from "./booking.module.css";
import { StripePaymentSection } from "./payment-element";
import { CanonicalHoldReviewDto } from "@bookpro/contracts";
import { CustomerPortalShell } from "../../../components/shell/customer-portal-shell";
import { ClockSpinner, FloatingParticles } from "../../../components/animated-svgs";
import { syncServerTime, getServerNow } from "../../../lib/time-sync";
import { useRealtimeEvents } from "../../../lib/use-realtime-events";

interface ServiceItem {
  id: string;
  name: string;
  description?: string | null;
  durationMin: number;
  priceCents: number;
  currency: string;
  imageUrl?: string | null;
  category?: string | null;
  preparationInstructions?: string | null;
  preBufferMin?: number;
  postBufferMin?: number;
  minParticipants?: number;
  maxParticipants?: number;
  taxBehavior?: "EXCLUSIVE" | "INCLUSIVE" | "NONE";
  depositType?: string | null;
  depositValue?: number | null;
  capacity?: number | null;
  isActive?: boolean;
}

interface LocationItem {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  timezone?: string;
}

interface StaffItem {
  id: string;
  displayName: string;
  fullName?: string;
  roleCode?: string;
  title?: string;
  bio?: string;
  avatarUrl?: string | null;
  calendarColor?: string;
  skills?: string[];
  bookingVisible?: boolean;
  isActive?: boolean;
  staffLocations?: Array<{ locationId: string; location?: LocationItem }>;
  staffServices?: Array<{ serviceId: string; service?: ServiceItem; customPriceCents?: number | null; customDurationMin?: number | null }>;
}

interface IntakeFormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "radio" | "checkbox";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface IntakeFormItem {
  id: string;
  name: string;
  description?: string;
  isGlobal?: boolean;
  isRequired?: boolean;
  fields: IntakeFormField[];
}

function parseApiError(json: any, fallback: string): string {
  if (!json) return fallback;
  if (typeof json === "string") return json;
  if (json.message) {
    if (typeof json.message === "string") return json.message;
    if (typeof json.message === "object" && json.message.message) return String(json.message.message);
  }
  if (json.error) {
    if (typeof json.error === "string") return json.error;
    if (typeof json.error === "object" && json.error.message) return String(json.error.message);
  }
  if (Array.isArray(json.details) && json.details.length > 0) {
    const detailMsgs = json.details
      .map((d: any) => d.message || d.detail || (typeof d === "string" ? d : JSON.stringify(d)))
      .filter(Boolean);
    if (detailMsgs.length > 0) return detailMsgs.join("; ");
  }
  if (json.detail && typeof json.detail === "string") return json.detail;
  if (json.title && typeof json.title === "string") return json.title;
  return fallback;
}

export default function PublicBookingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) || (params?.tenant as string) || "";

  // Step navigation: 1 = Service & Staff, 2 = Date & Slot, 3 = Details & Intake, 4 = Review & Pay
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Business Data
  const [businessInfo, setBusinessInfo] = useState<{
    id?: string;
    name: string;
    brandName?: string;
    logoUrl?: string | null;
    stripeConnected?: boolean;
    currency?: string;
    defaultLocale?: string;
    timezone?: string;
    policy?: {
      minNoticeHours?: number;
      maxNoticeDays?: number;
      cancelCutoffHours?: number;
      cancelFeeType?: string;
      cancelFeeValue?: number;
      holdDurationMinutes?: number;
    } | null;
  }>({ name: slug || "Studio", currency: "USD", defaultLocale: "en-US" });
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffItem[]>([]);
  const [intakeForms, setIntakeForms] = useState<IntakeFormItem[]>([]);

  // Selections
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // null = Any Staff
  const { todayStr, maxDateStr, dayOptions } = useMemo(() => {
    const timeZone = businessInfo.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = getServerNow();
    const maxDays = businessInfo.policy?.maxNoticeDays ?? 60;

    const toIsoDate = (d: Date) => {
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
      return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
    };

    const formatShort = (d: Date) =>
      d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    const todayIso = toIsoDate(now);
    const maxDate = new Date(now.getTime());
    maxDate.setDate(maxDate.getDate() + maxDays);
    const maxDateIso = toIsoDate(maxDate);

    // Generate up to 7 dynamic quick tabs (or fewer if maxDays < 7)
    const quickTabCount = Math.min(Math.max(1, maxDays), 7);
    const options = [];
    for (let i = 0; i < quickTabCount; i++) {
      const targetDate = new Date(now.getTime());
      targetDate.setDate(targetDate.getDate() + i);
      const iso = toIsoDate(targetDate);
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : targetDate.toLocaleDateString("en-US", { weekday: "short" });
      options.push({
        key: iso,
        label,
        sub: formatShort(targetDate),
      });
    }

    return {
      todayStr: todayIso,
      maxDateStr: maxDateIso,
      dayOptions: options,
    };
  }, [businessInfo.timezone, businessInfo.policy?.maxNoticeDays]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = getServerNow();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [availableSlots, setAvailableSlots] = useState<
    Array<{ startAt: string; endAt: string; availableStaffIds?: string[] }>
  >([]);
  const [slotFetchStatus, setSlotFetchStatus] = useState<
    "IDLE" | "FETCHING" | "AVAILABLE" | "WAITLIST" | "ERROR"
  >("IDLE");
  const [slotFetchError, setSlotFetchError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slotRefreshNonce, setSlotRefreshNonce] = useState(0);
  const [partySize, setPartySize] = useState<number>(1);

  // Active Hold State
  const [holdId, setHoldId] = useState<string | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [holdTimeLeftSec, setHoldTimeLeftSec] = useState<number | null>(null);
  const [isHoldExpired, setIsHoldExpired] = useState(false);
  useEffect(() => {
    if (!holdId) setSelectedDate(todayStr);
  }, [todayStr, holdId]);

  useEffect(() => {
    setPartySize(1);
  }, [selectedServiceId]);

  // Guest Details & Intake State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [intakeResponses, setIntakeResponses] = useState<
    Record<string, Record<string, any>>
  >({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Review & Payment Snapshot State
  const [canonicalReview, setCanonicalReview] = useState<CanonicalHoldReviewDto | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string>(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");
  const [paymentConversion, setPaymentConversion] = useState<{ originalAmountCents?: number; originalCurrency?: string; exchangeRate?: number; usdCents?: number } | undefined>(undefined);
  const [connectedAccountId, setConnectedAccountId] = useState<string | undefined>(undefined);

  const [isCreatingPaymentIntent, setIsCreatingPaymentIntent] = useState(false);
  const [isSubmittingDetails, setIsSubmittingDetails] = useState(false);
  const [isReservingSlot, setIsReservingSlot] = useState(false);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Coupon / Promo Code State
  const [couponInput, setCouponInput] = useState<string>("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string>("");
  const [appliedDiscountCents, setAppliedDiscountCents] = useState<number>(0);
  const [applyingCoupon, setApplyingCoupon] = useState<boolean>(false);
  const [couponMessage, setCouponMessage] = useState<{ error: boolean; text: string } | null>(null);

  // Priority Waitlist In-line Registration State
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistCustomerName, setWaitlistCustomerName] = useState("");
  const [waitlistCustomerEmail, setWaitlistCustomerEmail] = useState("");
  const [waitlistCustomerPhone, setWaitlistCustomerPhone] = useState("");
  const [waitlistDateOption, setWaitlistDateOption] = useState<"SPECIFIC" | "WEEK" | "FORTNIGHT">("SPECIFIC");
  const [waitlistTimeWindow, setWaitlistTimeWindow] = useState<"ANY" | "MORNING" | "AFTERNOON" | "EVENING">("ANY");
  const [waitlistStaffChoice, setWaitlistStaffChoice] = useState<string>("ANY");
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const [waitlistSubmittedResult, setWaitlistSubmittedResult] = useState<{ position?: number; entryId?: string } | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  const handleJoinPriorityWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistCustomerName.trim() || !waitlistCustomerEmail.trim()) {
      setWaitlistError("Name and email are required to join the priority waitlist.");
      return;
    }
    if (!selectedServiceId || !selectedLocationId) {
      setWaitlistError("Please choose a service and location first.");
      return;
    }

    setIsJoiningWaitlist(true);
    setWaitlistError(null);

    try {
      const now = new Date(selectedDate || todayStr);
      let startDateStr = selectedDate;
      let endDateStr = selectedDate;

      if (waitlistDateOption === "WEEK") {
        const end = new Date(now.getTime() + 7 * 86400000);
        endDateStr = end.toISOString().split("T")[0];
      } else if (waitlistDateOption === "FORTNIGHT") {
        const end = new Date(now.getTime() + 14 * 86400000);
        endDateStr = end.toISOString().split("T")[0];
      }

      const res = await fetch("/api/v1/waitlist/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-slug": slug,
        },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          locationId: selectedLocationId,
          staffId: waitlistStaffChoice === "ANY" ? undefined : waitlistStaffChoice,
          allowFallbackStaff: waitlistStaffChoice === "ANY",
          requestedStartDate: `${startDateStr}T00:00:00.000Z`,
          requestedEndDate: `${endDateStr}T23:59:59.999Z`,
          preferredTimeWindow: waitlistTimeWindow,
          customerName: waitlistCustomerName.trim(),
          customerEmail: waitlistCustomerEmail.trim(),
          customerPhone: waitlistCustomerPhone.trim() || undefined,
          source: "CUSTOMER_PORTAL",
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseApiError(json, "Failed to register on priority waitlist."));
      }

      const data = json.data || json;
      setWaitlistSubmittedResult({
        position: data.position || 1,
        entryId: data.id,
      });
    } catch (err: any) {
      setWaitlistError(err.message || "Network error while joining waitlist.");
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  // Auto-fill promo code, preselected service, and preselected staff from URL query parameter
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const cpn = urlParams.get("coupon");
    if (cpn) {
      setCouponInput(cpn.toUpperCase());
    }
    const srv = urlParams.get("serviceId") || urlParams.get("service");
    if (srv) {
      setSelectedServiceId(srv);
    }
    const stf = urlParams.get("staffId") || urlParams.get("staff");
    if (stf) {
      setSelectedStaffId(stf);
    }
    const loc = urlParams.get("locationId") || urlParams.get("location");
    if (loc) {
      setSelectedLocationId(loc);
    }
  }, []);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || !selectedServiceId || !businessInfo?.id) {
      setCouponMessage({ error: true, text: "Please select a service first to apply promo code." });
      return;
    }
    setApplyingCoupon(true);
    setCouponMessage(null);
    try {
      const res = await fetch(`/api/v1/organizations/${businessInfo.id}/pricing/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-slug": slug },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          locationId: selectedLocationId || undefined,
          staffId: selectedStaffId || undefined,
          couponCode: couponInput.trim().toUpperCase(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const quote = data.data || data;
        if (quote.discountCents > 0) {
          setAppliedDiscountCents(quote.discountCents);
          setAppliedCouponCode(quote.appliedCouponCode || couponInput.trim().toUpperCase());
          setCouponMessage({
            error: false,
            text: `✓ Code applied! You save ${formatCurrency(quote.discountCents, quote.currency)}`,
          });
        } else {
          setAppliedDiscountCents(0);
          setAppliedCouponCode("");
          setCouponMessage({
            error: true,
            text: quote.couponError?.message || "Promo code could not be applied or minimum spend not reached.",
          });
        }
      } else {
        setCouponMessage({ error: true, text: parseApiError(data, "Invalid promo code.") });
      }
    } catch {
      setCouponMessage({ error: true, text: "Failed to validate promo code." });
    } finally {
      setApplyingCoupon(false);
    }
  };

  const [isOffline, setIsOffline] = useState(false);
  const holdAttemptKeys = useRef<Record<string, string>>({});

  // Keep an active hold recoverable across reloads without putting it in a long-lived
  // auth store. The server token still authorizes every resume request.
  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const key = `bookpro:booking:${slug}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { holdId?: string; guestToken?: string; expiresAt?: string };
      if (!saved.holdId || !saved.guestToken || !saved.expiresAt || new Date(saved.expiresAt) <= new Date()) {
        window.sessionStorage.removeItem(key);
        return;
      }
      setHoldId(saved.holdId);
      setGuestToken(saved.guestToken);
      setHoldExpiresAt(new Date(saved.expiresAt));
      fetch(`/api/v1/holds/public/${encodeURIComponent(saved.holdId)}?guestToken=${encodeURIComponent(saved.guestToken)}`, { headers: { "x-tenant-slug": slug } })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error("Your reservation could not be resumed.")))
        .then((payload) => {
          const review = payload.data || payload;
          if (review.status !== "ACTIVE") throw new Error("Your reservation is no longer active.");
          if (review.guestToken) setGuestToken(review.guestToken);
          if (review.organization) setBusinessInfo(review.organization);
          setCanonicalReview(review.detailsCompletedAt ? review : null);
          setCurrentStep(review.detailsCompletedAt ? 4 : 3);
        })
        .catch(() => {
          window.sessionStorage.removeItem(key);
          setHoldId(null);
          setGuestToken(null);
          setHoldExpiresAt(null);
          setGeneralError("Your reservation could not be resumed. Please choose a new time.");
        });
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }, [slug]);

  // Hydrate hold directly if arriving from AI Receptionist (?fromAi=true&holdId=...)
  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const isFromAi = urlParams.get("fromAi") === "true";
    const queryHoldId = urlParams.get("holdId");
    const queryGuestToken = urlParams.get("guestToken") || "";

    if (queryHoldId) {
      setHoldId(queryHoldId);
      if (queryGuestToken) setGuestToken(queryGuestToken);

      fetch(
        `/api/v1/holds/public/${encodeURIComponent(queryHoldId)}${
          queryGuestToken ? `?guestToken=${encodeURIComponent(queryGuestToken)}` : ""
        }`,
        { headers: { "x-tenant-slug": slug }, credentials: "include" }
      )
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Your reservation hold could not be resumed."))))
        .then((payload) => {
          const review = payload.data || payload;
          if (review.status !== "ACTIVE") throw new Error("Your reservation hold is no longer active.");
          if (review.guestToken) setGuestToken(review.guestToken);
          if (review.organization) setBusinessInfo(review.organization);
          if (review.expiresAt) setHoldExpiresAt(new Date(review.expiresAt));
          setCanonicalReview(review);
          if (review.detailsCompletedAt) {
            setCurrentStep(4);
          } else {
            if (review.guestName) setFullName(review.guestName);
            if (review.guestEmail) setEmail(review.guestEmail);
            if (review.guestPhone) setPhone(review.guestPhone);
            setCurrentStep(3);
          }
        })
        .catch((err) => {
          console.warn("Could not load hold from AI Receptionist:", err);
          setGeneralError("Your reservation hold could not be resumed or has expired. Please select a time slot.");
        });
    }
  }, [slug]);

  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const key = `bookpro:booking:${slug}`;
    if (holdId && guestToken && holdExpiresAt) window.sessionStorage.setItem(key, JSON.stringify({ holdId, guestToken, expiresAt: holdExpiresAt.toISOString() }));
    else window.sessionStorage.removeItem(key);
  }, [slug, holdId, guestToken, holdExpiresAt]);

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  // Load initial organization profile, services, locations, and staff using coordinated authoritative payload
  useEffect(() => {
    if (!slug) return;

    const controller = new AbortController();
    const headers = { "x-tenant-slug": slug };

    const loadBootstrapData = async () => {
      try {
        // 1. Authoritative Organization Profile with Embedded Services, Locations, Staff, and Policy
        const res = await fetch(`/api/v1/organization/by-slug/${encodeURIComponent(slug)}`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load organization profile");
        const json = await res.json();
        const org = json?.data || json;
        if (!org || controller.signal.aborted) return;

        if (org.serverTime) {
          syncServerTime(org.serverTime);
        }

        setBusinessInfo({
          id: org.id,
          name: org.name || slug,
          brandName: org.brandName,
          logoUrl: org.logoUrl,
          stripeConnected: org.stripeConnected,
          currency: org.currency || "USD",
          defaultLocale: org.defaultLocale || "en-US",
          timezone: org.timezone || "UTC",
          policy: org.policy || null,
        });

        const queryParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const queryServiceId = queryParams?.get("serviceId") || queryParams?.get("service");
        const queryLocationId = queryParams?.get("locationId") || queryParams?.get("location");

        // Services: Use embedded services if provided, else fallback to services endpoint
        let activeServices = Array.isArray(org.services) ? org.services.filter((s: any) => s.isActive !== false) : [];
        if (activeServices.length === 0) {
          try {
            const sRes = await fetch(`/api/v1/services?slug=${encodeURIComponent(slug)}&activeOnly=true`, {
              headers,
              signal: controller.signal,
            });
            if (sRes.ok) {
              const sData = await sRes.json();
              const list = Array.isArray(sData) ? sData : sData?.data || [];
              activeServices = list.filter((s: any) => s.isActive !== false);
            }
          } catch (e: any) {
            if (e.name !== "AbortError") console.warn("Fallback service load error:", e);
          }
        }
        if (!controller.signal.aborted) {
          setServices(activeServices);
          setSelectedServiceId((prev) => {
            if (queryServiceId && activeServices.some((s: any) => s.id === queryServiceId)) return queryServiceId;
            if (prev && activeServices.some((s: any) => s.id === prev)) return prev;
            return activeServices[0]?.id || "";
          });
        }

        // Locations: Use embedded locations if provided, else fallback to locations endpoint
        let activeLocations = Array.isArray(org.locations) ? org.locations : [];
        if (activeLocations.length === 0) {
          try {
            const lRes = await fetch(`/api/v1/locations?slug=${encodeURIComponent(slug)}`, {
              headers,
              signal: controller.signal,
            });
            if (lRes.ok) {
              const lData = await lRes.json();
              activeLocations = Array.isArray(lData) ? lData : lData?.data || [];
            }
          } catch (e: any) {
            if (e.name !== "AbortError") console.warn("Fallback location load error:", e);
          }
        }
        if (!controller.signal.aborted) {
          setLocations(activeLocations);
          setSelectedLocationId((prev) => {
            if (queryLocationId && activeLocations.some((l: any) => l.id === queryLocationId)) return queryLocationId;
            if (prev && activeLocations.some((l: any) => l.id === prev)) return prev;
            return activeLocations[0]?.id || "";
          });
        }

        // Staff: Use embedded staff profiles if provided, else fallback to staff endpoint
        let activeStaff = Array.isArray(org.staffProfiles) ? org.staffProfiles : [];
        if (activeStaff.length === 0) {
          try {
            const stRes = await fetch(
              `/api/v1/staff?slug=${encodeURIComponent(slug)}&activeOnly=true&bookingVisibleOnly=true`,
              { headers, signal: controller.signal }
            );
            if (stRes.ok) {
              const stData = await stRes.json();
              activeStaff = Array.isArray(stData) ? stData : stData?.data || [];
            }
          } catch (e: any) {
            if (e.name !== "AbortError") console.warn("Fallback staff load error:", e);
          }
        }
        if (!controller.signal.aborted) {
          setStaffList(activeStaff);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Failed to load organization bootstrap data:", err);
        }
      }
    };

    loadBootstrapData();

    return () => {
      controller.abort();
    };
  }, [slug]);

  // Real-time synchronization for customer booking portal
  useRealtimeEvents(businessInfo?.id, {
    onEvent: (hint) => {
      if (
        hint.type.startsWith("location.") ||
        hint.type.startsWith("staff.") ||
        hint.type.startsWith("schedule.") ||
        hint.type.startsWith("booking_hold.") ||
        hint.type.startsWith("appointment.") ||
        hint.type.startsWith("service.")
      ) {
        setSlotRefreshNonce((prev) => prev + 1);

        if (hint.type.startsWith("location.")) {
          fetch(`/api/v1/locations?slug=${encodeURIComponent(slug)}`, {
            headers: { "x-tenant-slug": slug },
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              const list = Array.isArray(data) ? data : data?.data || [];
              if (list.length > 0) {
                setLocations(list);
                setSelectedLocationId((prev) => {
                  if (prev && list.some((l: any) => l.id === prev)) return prev;
                  return list[0].id;
                });
              }
            })
            .catch(() => {});
        }

        fetch(`/api/v1/staff?slug=${encodeURIComponent(slug)}&activeOnly=true&bookingVisibleOnly=true`, {
          headers: { "x-tenant-slug": slug },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const list = Array.isArray(data) ? data : data?.data || [];
            if (list.length > 0) setStaffList(list);
          })
          .catch(() => {});
      }
    },
  });

  // Window focus live synchronization (re-fetch active services if returning to tab)
  useEffect(() => {
    if (!slug) return;
    const handleFocus = () => {
      if (holdId) return; // do not disrupt if user is in middle of active hold
      setSlotRefreshNonce((prev) => prev + 1);
      fetch(`/api/v1/services?slug=${encodeURIComponent(slug)}&activeOnly=true`, {
        headers: { "x-tenant-slug": slug },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const list = Array.isArray(data) ? data : data?.data || [];
          const activeOnly = list.filter((s: any) => s.isActive !== false);
          if (activeOnly.length > 0) {
            setServices(activeOnly);
          }
        })
        .catch(() => {});
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [slug, holdId]);

  // Load dynamic intake forms when service changes
  useEffect(() => {
    if (!slug || !selectedServiceId) return;

    fetch(`/api/v1/intake-forms?serviceId=${encodeURIComponent(selectedServiceId)}`, {
      headers: { "x-tenant-slug": slug },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        setIntakeForms(list);
      })
      .catch((err) => console.warn("Failed to load intake forms", err));
  }, [slug, selectedServiceId]);

  // Load availability slots when service, location, staff, or date changes
  useEffect(() => {
    if (!slug || !selectedServiceId || !selectedLocationId || !selectedDate) {
      setAvailableSlots([]);
      setSlotFetchStatus("IDLE");
      return;
    }

    if (selectedDate < todayStr) {
      setSelectedDate(todayStr);
      return;
    }
    if (selectedDate > maxDateStr) {
      setSelectedDate(maxDateStr);
      return;
    }

    const controller = new AbortController();
    setSlotFetchStatus("FETCHING");
    setSlotFetchError(null);

    const queryParams = new URLSearchParams({
      serviceId: selectedServiceId,
      locationId: selectedLocationId,
      startDate: selectedDate,
      endDate: selectedDate,
      partySize: String(partySize),
    });
    if (selectedStaffId) {
      queryParams.set("staffId", selectedStaffId);
    }

    fetch(`/api/v1/availability?${queryParams.toString()}`, {
      headers: { "x-tenant-slug": slug },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (controller.signal.aborted) return;
        const rawSlots = Array.isArray(data) ? data : data?.data || data?.slots || [];
        const nowMs = getServerNow().getTime();
        const normalized = rawSlots.map((s: any) => ({
          ...s,
          startAt: s.startAt || s.startTime,
          endAt: s.endAt || s.endTime,
          staffId: s.staffId || (s.availableStaffIds && s.availableStaffIds[0]) || undefined,
        }));
        // Strictly filter out any past slots across all dates using authoritative server time
        const validSlots = normalized.filter((slot: any) => {
          if (!slot.startAt) return false;
          const slotMs = new Date(slot.startAt).getTime();
          if (isNaN(slotMs)) return false;
          return slotMs > nowMs;
        });
        setAvailableSlots(validSlots);
        setSlotFetchStatus(validSlots.length > 0 ? "AVAILABLE" : "WAITLIST");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn("Failed to load availability slots", err);
        setAvailableSlots([]);
        setSlotFetchStatus("ERROR");
        setSlotFetchError("Unable to load slots for this date. Please check your connection or choose another date.");
      });

    return () => {
      controller.abort();
    };
  }, [slug, selectedServiceId, selectedLocationId, selectedStaffId, selectedDate, todayStr, maxDateStr, slotRefreshNonce, partySize]);

  // Live Ticking Hold Timer protected against clock tampering
  useEffect(() => {
    if (!holdExpiresAt) {
      setHoldTimeLeftSec(null);
      return;
    }

    const initialRemainingSec = Math.max(
      0,
      Math.floor((holdExpiresAt.getTime() - getServerNow().getTime()) / 1000)
    );
    const startPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
    setHoldTimeLeftSec(initialRemainingSec);

    const interval = setInterval(() => {
      const currentPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsedSec = Math.floor((currentPerf - startPerf) / 1000);
      const remainingSec = Math.max(0, initialRemainingSec - elapsedSec);
      setHoldTimeLeftSec(remainingSec);

      if (remainingSec <= 0) {
        setIsHoldExpired(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId),
    [services, selectedServiceId]
  );
  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId),
    [locations, selectedLocationId]
  );
  const selectedStaff = useMemo(
    () => staffList.find((s) => s.id === selectedStaffId),
    [staffList, selectedStaffId]
  );

  const eligibleStaffList = useMemo(() => {
    return staffList.filter((st) => {
      if (st.isActive === false || st.bookingVisible === false) return false;
      if (selectedLocationId && st.staffLocations && st.staffLocations.length > 0) {
        const worksAtLocation = st.staffLocations.some((sl: any) => (sl.locationId || sl.id) === selectedLocationId);
        if (!worksAtLocation) return false;
      }
      if (selectedServiceId && st.staffServices && st.staffServices.length > 0) {
        const offersService = st.staffServices.some((ss: any) => (ss.serviceId || ss.id) === selectedServiceId);
        if (!offersService) return false;
      }
      return true;
    });
  }, [staffList, selectedServiceId, selectedLocationId]);

  // Format countdown string mm:ss
  const formattedCountdown = useMemo(() => {
    if (holdTimeLeftSec === null) return null;
    const m = Math.floor(holdTimeLeftSec / 60);
    const s = holdTimeLeftSec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }, [holdTimeLeftSec]);

  // Auto-initiate Payment Intent when arriving on Step 4
  useEffect(() => {
    if (
      currentStep === 4 &&
      holdId &&
      guestToken &&
      canonicalReview?.quote?.payableNowCents &&
      canonicalReview.quote.payableNowCents > 0 &&
      !paymentClientSecret &&
      !isCreatingPaymentIntent
    ) {
      initiatePaymentIntent(holdId, guestToken);
    }
  }, [currentStep, holdId, guestToken, canonicalReview, paymentClientSecret, isCreatingPaymentIntent]);

  // Locale-aware dynamic multi-currency formatter
  const formatCurrency = (amountCents: number, currencyCode?: string) => {
    const currency = (
      currencyCode ||
      canonicalReview?.quote?.currency ||
      selectedService?.currency ||
      businessInfo?.currency ||
      "USD"
    ).toUpperCase();
    const amount = (amountCents || 0) / 100;
    try {
      return new Intl.NumberFormat(businessInfo?.defaultLocale || "en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  // Step 2 -> Step 3: Reserve Slot via Atomic Hold
  const handleReserveSlot = async (slotStartAt: string, slotStaffId?: string) => {
    if (!selectedServiceId || !selectedLocationId) return;

    setIsReservingSlot(true);
    setGeneralError(null);
    setSelectedSlot(slotStartAt);

    try {
      const attemptKey = `${selectedServiceId}:${selectedLocationId}:${selectedStaffId || slotStaffId || "any"}:${slotStartAt}`;
      const idempotencyKey = holdAttemptKeys.current[attemptKey] || `hold_${crypto.randomUUID()}`;
      holdAttemptKeys.current[attemptKey] = idempotencyKey;
      const res = await fetch(`/api/v1/holds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-slug": slug,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          locationId: selectedLocationId,
          staffId: selectedStaffId || slotStaffId || undefined,
          startAt: slotStartAt,
          partySize,
          idempotencyKey,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseApiError(json, "Slot reservation failed. It may have just been booked."));
      }

      const holdData = json.data || json;
      setHoldId(holdData.id);
      setGuestToken(holdData.guestToken);
      setHoldExpiresAt(new Date(holdData.expiresAt));
      setIsHoldExpired(false);
      setCurrentStep(3);
    } catch (err: any) {
      setGeneralError(err.message || "Failed to reserve slot.");
    } finally {
      setIsReservingSlot(false);
    }
  };

  // Step 3 -> Step 4: Persist Guest Details & Validate Intake Questions
  const handlePersistDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdId || !guestToken) return;

    // Validate Contact Fields
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = "Full name is required";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Valid email address is required";
    }

    // Validate Intake Required Fields
    for (const form of intakeForms) {
      const formResp = intakeResponses[form.id] || {};
      for (const field of form.fields) {
        const val = formResp[field.id];
        if (field.required && (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0))) {
          errors[`intake_${form.id}_${field.id}`] = `Please answer: ${field.label}`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmittingDetails(true);
    setGeneralError(null);

    try {
      const formattedIntake = intakeForms.map((form) => ({
        intakeFormId: form.id,
        responses: intakeResponses[form.id] || {},
      }));

      const res = await fetch(`/api/v1/holds/public/${holdId}/details`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-slug": slug,
        },
        body: JSON.stringify({
          guestToken,
          fullName: fullName.trim(),
          email: email.toLowerCase().trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
          consentMarketing,
          intakeResponses: formattedIntake,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseApiError(json, "Failed to save details."));
      }

      const result = json.data || json;
      if (result.guestToken) {
        setGuestToken(result.guestToken); // rotated token
      }
      if (result.review) {
        setCanonicalReview(result.review);
        setBusinessInfo(result.review.organization);
      }

      // Check if online payment is required
      const payableNow = result.review?.quote?.payableNowCents ?? 0;
      setCurrentStep(4);

      if (payableNow > 0) {
        initiatePaymentIntent(holdId, result.guestToken || guestToken);
      }
    } catch (err: any) {
      setGeneralError(err.message || "Failed to submit details.");
    } finally {
      setIsSubmittingDetails(false);
    }
  };

  // Step 4: Initiate Payment Intent
  const initiatePaymentIntent = async (activeHoldId: string, activeGuestToken: string) => {
    setIsCreatingPaymentIntent(true);
    try {
      const idempotencyKey = `pi_${activeHoldId}`;
      const res = await fetch(`/api/v1/payments/public/payment-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-slug": slug,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          bookingHoldId: activeHoldId,
          guestToken: activeGuestToken,
          idempotencyKey,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        console.warn("Payment intent notice:", json);
        setGeneralError(parseApiError(json, "Unable to initialize payment gateway."));
        return;
      }

      const piData = json?.data || json;
      if (piData?.clientSecret) {
        setPaymentClientSecret(piData.clientSecret);
        if (piData.publishableKey) {
          setStripePublishableKey(piData.publishableKey);
        }
        setConnectedAccountId(piData.connectedAccountId);
        if (piData.originalCurrency && piData.originalCurrency !== piData.currency) {
          setPaymentConversion({
            originalAmountCents: piData.originalAmountCents,
            originalCurrency: piData.originalCurrency,
            exchangeRate: piData.exchangeRate,
            usdCents: piData.amountCents,
          });
        } else {
          setPaymentConversion(undefined);
        }
      }
    } catch (err: any) {


      console.warn("Payment setup notice:", err.message);
      setGeneralError(err.message || "Unable to initialize payment gateway.");
    } finally {
      setIsCreatingPaymentIntent(false);
    }
  };

  // Step 4: Finalize Booking without Payment (Zero Deposit)
  const handleFinalizeZeroDeposit = async () => {
    if (!holdId || !guestToken) return;

    setIsPollingStatus(true);
    setGeneralError(null);

    try {
      const idempotencyKey = `final_${holdId}`;
      const res = await fetch(`/api/v1/appointments/public/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-slug": slug,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          bookingHoldId: holdId,
          guestToken,
          idempotencyKey,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(parseApiError(json, "Failed to finalize booking."));
      }

      pollBookingConfirmation(holdId, guestToken);
    } catch (err: any) {
      setGeneralError(err.message || "Error finalizing booking.");
      setIsPollingStatus(false);
    }
  };

  // Step 4: Start polling status after successful Stripe payment confirmation
  const handlePaymentSuccess = () => {
    if (!holdId || !guestToken) return;
    setIsPollingStatus(true);
    pollBookingConfirmation(holdId, guestToken);
  };

  const pollBookingConfirmation = (activeHoldId: string, activeGuestToken: string) => {
    let attempts = 0;
    const maxAttempts = 20;

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(
          `/api/v1/appointments/public/status?holdId=${encodeURIComponent(activeHoldId)}&guestToken=${encodeURIComponent(activeGuestToken)}`,
          { headers: { "x-tenant-slug": slug } }
        );

        if (res.ok) {
          const json = await res.json();
          const statusData = json.data || json;

          if (statusData.status === "CONFIRMED") {
            clearInterval(interval);
            const isFromAi =
              typeof window !== "undefined" &&
              new URLSearchParams(window.location.search).get("fromAi") === "true";
            if (isFromAi) {
              router.push(
                `/${slug}/ai?payment=success&holdId=${encodeURIComponent(activeHoldId)}${
                  activeGuestToken ? `&guestToken=${encodeURIComponent(activeGuestToken)}` : ""
                }`
              );
              return;
            }
            router.push(
              `/book/${slug}/complete?holdId=${encodeURIComponent(activeHoldId)}&guestToken=${encodeURIComponent(activeGuestToken)}`
            );
            return;
          }
        }
      } catch (err) {
        console.warn("Polling error:", err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setIsPollingStatus(false);
        setGeneralError("Confirmation took longer than expected. Please check your email or contact support.");
      }
    }, 1500);
  };

  // Cancel & Release Active Hold
  const handleCancelHold = async () => {
    if (!holdId || !guestToken) {
      setCurrentStep(1);
      return;
    }

    try {
      await fetch(`/api/v1/holds/public/${holdId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-slug": slug,
        },
        body: JSON.stringify({ guestToken }),
      });
    } catch {
      // best-effort
    }

    setHoldId(null);
    setGuestToken(null);
    setHoldExpiresAt(null);
    setHoldTimeLeftSec(null);
    setIsHoldExpired(false);
    setSelectedSlot(null);
    const attemptKey = `${selectedServiceId}:${selectedLocationId}:${selectedStaffId || "any"}:${selectedSlot || ""}`;
    delete holdAttemptKeys.current[attemptKey];
    setCurrentStep(2);
  };

  return (
    <CustomerPortalShell
      tenantInfo={{
        id: businessInfo.id || slug,
        name: businessInfo.name,
        brandName: businessInfo.brandName,
        slug,
        logoUrl: businessInfo.logoUrl,
        primaryColor: (businessInfo as any).primaryColor || "#0284c7",
      }}
      pageTitle={`Book Appointment — ${businessInfo.brandName || businessInfo.name}`}
    >
      <div className={styles.pageContainer} style={{ position: "relative" }}>
        <FloatingParticles count={10} />
        {isOffline && (
          <div
            role="status"
            style={{
              padding: "0.55rem 1rem",
              background: "#7f1d1d",
              color: "#fee2e2",
              textAlign: "center",
              fontSize: "0.82rem",
            }}
          >
            You are offline. Your reservation is still held while the timer is active; payment will resume when you reconnect.
          </div>
        )}

        {/* Floating Active Hold Timer Banner */}
        {holdTimeLeftSec !== null && holdTimeLeftSec > 0 && !isHoldExpired && (
          <div
            style={{
              position: "sticky",
              top: "70px",
              zIndex: 35,
              backgroundColor:
                holdTimeLeftSec < 60
                  ? "rgba(239, 68, 68, 0.92)"
                  : holdTimeLeftSec < 120
                  ? "rgba(245, 158, 11, 0.92)"
                  : "rgba(10, 20, 38, 0.92)",
              backdropFilter: "blur(16px)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
              padding: "8px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#f8fafc", fontSize: "13px", fontWeight: 700 }}>
              <ClockSpinner size={20} />
              <span>Time Slot Held for You:</span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "14px",
                  fontWeight: 900,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  color: holdTimeLeftSec < 60 ? "#fff" : "#7dd3fc",
                }}
              >
                {formattedCountdown}
              </span>
            </div>

            <button
              onClick={handleCancelHold}
              style={{
                backgroundColor: "transparent",
                border: "none",
                color: "#e2e8f0",
                fontSize: "12px",
                textDecoration: "underline",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Release & Change Time
            </button>
          </div>
        )}

        {/* Stepper Navigation Bar */}
        <div className={styles.stepperContainer}>
          <div className={styles.stepperInner}>
            <div
              className={`${styles.stepItem} ${
                currentStep === 1 ? styles.stepItemActive : currentStep > 1 ? styles.stepItemCompleted : ""
              }`}
              onClick={() => {
                if (currentStep > 1 && !holdId) setCurrentStep(1);
              }}
            >
              <div className={styles.stepCircle}>1</div>
              <span>Service & Staff</span>
            </div>

          <div className={styles.stepDivider} />

          <div
            className={`${styles.stepItem} ${
              currentStep === 2 ? styles.stepItemActive : currentStep > 2 ? styles.stepItemCompleted : ""
            }`}
            onClick={() => {
              if (currentStep > 2 && !holdId) setCurrentStep(2);
            }}
          >
            <div className={styles.stepCircle}>2</div>
            <span>Time & Slot</span>
          </div>

          <div className={styles.stepDivider} />

          <div
            className={`${styles.stepItem} ${
              currentStep === 3 ? styles.stepItemActive : currentStep > 3 ? styles.stepItemCompleted : ""
            }`}
          >
            <div className={styles.stepCircle}>3</div>
            <span>Your Details</span>
          </div>

          <div className={styles.stepDivider} />

          <div className={`${styles.stepItem} ${currentStep === 4 ? styles.stepItemActive : ""}`}>
            <div className={styles.stepCircle}>4</div>
            <span>Review & Pay</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <main className={styles.mainLayout}>
        {/* Left Column: Interactive Workbench Step */}
        <section className={styles.workflowPanel}>
          {generalError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid #ef4444",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                color: "#f87171",
                fontSize: "0.88rem",
                marginBottom: "1.5rem",
              }}
            >
              <AlertTriangle size={18} />
              <span>{generalError}</span>
            </div>
          )}

          {/* STEP 1: Select Service, Location, and Staff */}
          {currentStep === 1 && (
            <div>
              <div className={styles.sectionHeader}>
                <h1 className={styles.sectionTitle}>Select Your Service</h1>
                <p className={styles.sectionDescription}>
                  Choose a service and provider to check real-time schedule availability.
                </p>
              </div>

              {/* Studio Location Display / Selector */}
              {locations.length > 1 ? (
                <div style={{ marginBottom: "1.5rem" }}>
                  <label className={styles.formLabel}>Studio Location</label>
                  <select
                    className={styles.formSelect}
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.address ? `— ${loc.address}` : ""} {loc.city ? `(${loc.city})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : selectedLocation ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    marginBottom: "1.5rem",
                    fontSize: "13px",
                    color: "#cbd5e1",
                  }}
                >
                  <MapPin size={16} color="#38bdf8" />
                  <span>
                    Location: <strong style={{ color: "#f8fafc" }}>{selectedLocation.name}</strong>
                    {selectedLocation.address ? ` — ${selectedLocation.address}, ${selectedLocation.city || ""}` : ""}
                  </span>
                </div>
              ) : null}

              {/* Service Cards Grid */}
              <div className={styles.cardGrid}>
                {services.map((service) => (
                  <div
                    key={service.id}
                    className={`${styles.serviceCard} ${
                      selectedServiceId === service.id ? styles.serviceCardSelected : ""
                    }`}
                    onClick={() => setSelectedServiceId(service.id)}
                  >
                    {service.imageUrl && (
                      <div style={{ width: "100%", height: "120px", borderRadius: "8px", overflow: "hidden", marginBottom: "10px" }}>
                        <img
                          src={service.imageUrl}
                          alt={service.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    )}
                    <div className={styles.serviceTopRow}>
                      <div>
                        {service.category && (
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                            {service.category}
                          </div>
                        )}
                        <h3 className={styles.serviceName}>{service.name}</h3>
                        <div className={styles.serviceMeta}>
                          <Clock size={14} />
                          <span>{service.durationMin} minutes</span>
                          {(service.preBufferMin || 0) + (service.postBufferMin || 0) > 0 && (
                            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                              (+{(service.preBufferMin || 0) + (service.postBufferMin || 0)}m buffer)
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className={styles.servicePrice}>
                          {formatCurrency(service.priceCents, service.currency)}
                        </div>
                        {service.taxBehavior === "INCLUSIVE" ? (
                          <span style={{ fontSize: "0.7rem", color: "#34d399", fontWeight: 600, display: "block" }}>
                            Tax incl.
                          </span>
                        ) : service.taxBehavior === "EXCLUSIVE" ? (
                          <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600, display: "block" }}>
                            + Tax
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {service.description && (
                      <p className={styles.serviceDescription}>{service.description}</p>
                    )}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px", fontSize: "0.75rem" }}>
                      {service.capacity && service.capacity > 1 ? (
                        <span style={{ background: "rgba(168, 85, 247, 0.15)", border: "1px solid rgba(168, 85, 247, 0.3)", color: "#c084fc", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                          Group Capacity: {service.capacity}
                        </span>
                      ) : (
                        <span style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)", color: "#38bdf8", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                          1-on-1 Session
                        </span>
                      )}
                      {service.depositType === "PERCENTAGE" && service.depositValue && (
                        <span style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#f59e0b", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                          {service.depositValue}% Deposit Required
                        </span>
                      )}
                      {service.depositType === "FIXED" && service.depositValue && (
                        <span style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#f59e0b", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                          {formatCurrency(service.depositValue, service.currency)} Deposit Required
                        </span>
                      )}
                    </div>

                    {service.preparationInstructions && (
                      <div style={{ marginTop: "8px", padding: "6px 8px", borderRadius: "6px", background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.2)", fontSize: "0.75rem", color: "#94a3b8" }}>
                        <strong style={{ color: "#38bdf8" }}>Prep:</strong> {service.preparationInstructions}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Staff Member Selection */}
              <div style={{ marginTop: "2rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.5rem" }}>
                  Select Stylist or Specialist
                </h2>
                <div className={styles.staffGrid}>
                  <div
                    className={`${styles.staffCard} ${
                      selectedStaffId === null ? styles.staffCardSelected : ""
                    }`}
                    onClick={() => setSelectedStaffId(null)}
                  >
                    <div className={styles.staffAvatar}>✨</div>
                    <span className={styles.staffName}>Any Available</span>
                    <span className={styles.staffRole}>Fastest booking</span>
                  </div>

                  {eligibleStaffList.map((st) => {
                    const color = st.calendarColor || "#0284c7";
                    const customSrv = st.staffServices?.find((ss) => ss.serviceId === selectedServiceId);
                    const customPrice = customSrv?.customPriceCents ? formatCurrency(customSrv.customPriceCents) : null;
                    const customDuration = customSrv?.customDurationMin ? `${customSrv.customDurationMin}m` : null;

                    return (
                      <div
                        key={st.id}
                        className={`${styles.staffCard} ${
                          selectedStaffId === st.id ? styles.staffCardSelected : ""
                        }`}
                        onClick={() => setSelectedStaffId(st.id)}
                        style={{
                          borderColor: selectedStaffId === st.id ? color : undefined,
                          position: "relative",
                        }}
                      >
                        <div
                          className={styles.staffAvatar}
                          style={{
                            backgroundColor: `${color}25`,
                            color: color,
                            border: `2px solid ${color}`,
                          }}
                        >
                          {st.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className={styles.staffName}>{st.displayName}</span>
                        <span className={styles.staffRole}>{st.title || st.roleCode || "Specialist"}</span>
                        {(customPrice || customDuration) && (
                          <span style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: 700, marginTop: "2px" }}>
                            {customPrice && `${customPrice}`} {customDuration && `(${customDuration})`}
                          </span>
                        )}
                        {st.skills && st.skills.length > 0 && (
                          <span style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "2px" }}>
                            #{st.skills[0]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: "2rem" }}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!selectedServiceId || !selectedLocationId}
                  onClick={() => setCurrentStep(2)}
                >
                  <span>Continue to Available Times</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Select Date & Time Slot */}
          {currentStep === 2 && (
            <div>
              <div className={styles.sectionHeader}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  style={{ marginBottom: "1rem" }}
                  onClick={() => setCurrentStep(1)}
                >
                  <ChevronLeft size={16} style={{ display: "inline", verticalAlign: "middle" }} /> Back
                </button>
                <h1 className={styles.sectionTitle}>Choose Date & Time</h1>
                <p className={styles.sectionDescription}>
                  Select an appointment slot. Clicking a slot reserves it exclusively for 10 minutes.
                </p>
              </div>

              {/* Quick Day Selector Tabs & Date Input */}
              <div style={{ marginBottom: "1.75rem" }}>
                <label className={styles.formLabel}>
                  Choose Appointment Date (Up to {businessInfo.policy?.maxNoticeDays || 60} Days in Advance)
                </label>
                <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  {dayOptions.map((opt) => {
                    const isDaySelected = selectedDate === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`${styles.secondaryButton} ${isDaySelected ? styles.slotButtonSelected : ""}`}
                        style={{
                          flex: "1 1 120px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.85rem 1rem",
                          borderRadius: "10px",
                          cursor: "pointer",
                          borderColor: isDaySelected ? "#38bdf8" : "#22304b",
                          background: isDaySelected ? "rgba(2, 132, 199, 0.25)" : "#071021",
                        }}
                        onClick={() => setSelectedDate(opt.key)}
                      >
                        <span style={{ fontWeight: 800, fontSize: "1rem", color: isDaySelected ? "#ffffff" : "#f8fafc" }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: "0.78rem", color: isDaySelected ? "#7dd3fc" : "#94a3b8" }}>
                          {opt.sub}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <input
                  type="date"
                  className={styles.formInput}
                  min={todayStr}
                  max={maxDateStr}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              {/* Party Size Selector for Group Services */}
              {(() => {
                const curSvc = services.find((s) => s.id === selectedServiceId);
                if (!curSvc || (curSvc.capacity || 1) <= 1) return null;
                const maxCap = Math.min(curSvc.capacity || 1, 12);
                return (
                  <div style={{ marginBottom: "1.5rem", padding: "14px", borderRadius: "10px", background: "rgba(168, 85, 247, 0.08)", border: "1px solid rgba(168, 85, 247, 0.25)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 700, color: "#e9d5ff", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Users size={16} color="#c084fc" />
                        Party Size / Attendees (Max {curSvc.capacity})
                      </label>
                      <span style={{ fontSize: "12px", color: "#c084fc", fontWeight: 600 }}>
                        Group Session
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {Array.from({ length: maxCap }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPartySize(num)}
                          style={{
                            minWidth: "40px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: partySize === num ? "1px solid #c084fc" : "1px solid rgba(255, 255, 255, 0.1)",
                            background: partySize === num ? "rgba(168, 85, 247, 0.3)" : "rgba(15, 23, 42, 0.6)",
                            color: partySize === num ? "#fff" : "#cbd5e1",
                            fontWeight: 700,
                            fontSize: "13px",
                            cursor: "pointer",
                          }}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Slots Grid */}
              <div className={styles.slotsHeader}>
                <span>Available Times for {selectedDate}</span>
                {isReservingSlot && (
                  <span style={{ fontSize: "0.82rem", color: "#38bdf8" }}>Reserving exclusive slot...</span>
                )}
              </div>

              {slotFetchStatus === "FETCHING" ? (
                <div style={{ padding: "1rem 0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.75rem" }}>
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: "48px",
                        borderRadius: "10px",
                        background: "linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    />
                  ))}
                </div>
              ) : slotFetchStatus === "ERROR" ? (
                <div style={{ padding: "1.5rem", borderRadius: "12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", textAlign: "center", marginBottom: "1.5rem" }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>{slotFetchError || "Unable to load appointment slots for this date."}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSlotFetchStatus("FETCHING");
                      setSelectedDate((d) => d);
                    }}
                    style={{ marginTop: "0.75rem", padding: "0.5rem 1rem", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "6px", color: "#fff", cursor: "pointer" }}
                  >
                    Retry
                  </button>
                </div>
              ) : slotFetchStatus === "WAITLIST" || availableSlots.length === 0 ? (
                /* Fully Booked State: Render Embedded Priority Waitlist Card */
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)",
                    borderRadius: "16px",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    padding: "2rem 1.5rem",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  {waitlistSubmittedResult ? (
                    <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "50%",
                          backgroundColor: "rgba(16, 185, 129, 0.2)",
                          border: "2px solid #10b981",
                          color: "#10b981",
                          display: "grid",
                          placeItems: "center",
                          margin: "0 auto 1rem auto",
                          fontSize: "24px",
                        }}
                      >
                        ✓
                      </div>
                      <h3 style={{ color: "#ffffff", fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
                        You're on the Priority Waitlist!
                      </h3>
                      <div
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: "9999px",
                          backgroundColor: "#f59e0b",
                          color: "#0f172a",
                          fontWeight: 850,
                          fontSize: "0.85rem",
                          marginBottom: "1rem",
                        }}
                      >
                        Queue Priority: Position #{waitlistSubmittedResult.position || 1}
                      </div>
                      <p style={{ color: "#cbd5e1", fontSize: "0.9rem", maxWidth: "440px", margin: "0 auto 1.5rem", lineHeight: "1.5" }}>
                        Our Schedule Optimizer will monitor this date 24/7. As soon as a cancellation or opening appears, you will receive an exclusive Fast-Pass offer via SMS & Email.
                      </p>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => router.push(`/${slug}/waitlist`)}
                      >
                        View in Priority Waitlist Hub →
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleJoinPriorityWaitlist}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.75rem" }}>
                        <span style={{ fontSize: "20px" }}>⚡</span>
                        <div>
                          <h3 style={{ color: "#ffffff", fontSize: "1.15rem", fontWeight: 800, margin: 0 }}>
                            {selectedDate} is Fully Booked
                          </h3>
                          <span style={{ color: "#fbbf24", fontSize: "0.82rem", fontWeight: 700 }}>
                            Join the Priority Waitlist to automatically claim cancellations
                          </span>
                        </div>
                      </div>

                      <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: "1.4" }}>
                        Do not worry! Cancellations happen frequently. Enter your preferences below and our Schedule Optimizer will instantly dispatch an offer to you.
                      </p>

                      {waitlistError && (
                        <div
                          style={{
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid #ef4444",
                            borderRadius: "8px",
                            padding: "0.5rem 0.75rem",
                            color: "#f87171",
                            fontSize: "0.82rem",
                            marginBottom: "1rem",
                          }}
                        >
                          {waitlistError}
                        </div>
                      )}

                      {/* Window Preference */}
                      <div style={{ marginBottom: "1rem" }}>
                        <label className={styles.formLabel}>Date Window Flexibility</label>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          {[
                            { key: "SPECIFIC", label: "Specific Date Only" },
                            { key: "WEEK", label: "Any Day This Week" },
                            { key: "FORTNIGHT", label: "Next 14 Days" },
                          ].map((opt) => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setWaitlistDateOption(opt.key as any)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: waitlistDateOption === opt.key ? "1px solid #f59e0b" : "1px solid #334155",
                                backgroundColor: waitlistDateOption === opt.key ? "rgba(245, 158, 11, 0.2)" : "#1e293b",
                                color: waitlistDateOption === opt.key ? "#fbbf24" : "#cbd5e1",
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Time of Day Preference */}
                      <div style={{ marginBottom: "1rem" }}>
                        <label className={styles.formLabel}>Time of Day Preference</label>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          {[
                            { key: "ANY", label: "Any Time" },
                            { key: "MORNING", label: "Morning (8am-12pm)" },
                            { key: "AFTERNOON", label: "Afternoon (12pm-5pm)" },
                            { key: "EVENING", label: "Evening (5pm-9pm)" },
                          ].map((tw) => (
                            <button
                              key={tw.key}
                              type="button"
                              onClick={() => setWaitlistTimeWindow(tw.key as any)}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: waitlistTimeWindow === tw.key ? "1px solid #38bdf8" : "1px solid #334155",
                                backgroundColor: waitlistTimeWindow === tw.key ? "rgba(56, 189, 248, 0.2)" : "#1e293b",
                                color: waitlistTimeWindow === tw.key ? "#38bdf8" : "#cbd5e1",
                                fontSize: "0.8rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {tw.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Specialist Choice */}
                      <div style={{ marginBottom: "1rem" }}>
                        <label className={styles.formLabel}>Specialist Preference</label>
                        <select
                          className={styles.formSelect}
                          value={waitlistStaffChoice}
                          onChange={(e) => setWaitlistStaffChoice(e.target.value)}
                        >
                          <option value="ANY">First Available Specialist (Recommended — Highest match rate)</option>
                          {eligibleStaffList.map((st) => (
                            <option key={st.id} value={st.id}>
                              Only {st.displayName} ({st.title || "Specialist"})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Contact Fields */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                        <div>
                          <label className={styles.formLabel}>Your Name *</label>
                          <input
                            type="text"
                            required
                            className={styles.formInput}
                            placeholder="Alex Morgan"
                            value={waitlistCustomerName}
                            onChange={(e) => setWaitlistCustomerName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={styles.formLabel}>Email Address *</label>
                          <input
                            type="email"
                            required
                            className={styles.formInput}
                            placeholder="alex@example.com"
                            value={waitlistCustomerEmail}
                            onChange={(e) => setWaitlistCustomerEmail(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={styles.formLabel}>Mobile Phone (for SMS)</label>
                          <input
                            type="tel"
                            className={styles.formInput}
                            placeholder="+1 (555) 000-0000"
                            value={waitlistCustomerPhone}
                            onChange={(e) => setWaitlistCustomerPhone(e.target.value)}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isJoiningWaitlist}
                        style={{
                          width: "100%",
                          padding: "0.85rem",
                          borderRadius: "10px",
                          backgroundColor: "#f59e0b",
                          color: "#0f172a",
                          border: "none",
                          fontWeight: 850,
                          fontSize: "0.95rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          boxShadow: "0 4px 14px rgba(245, 158, 11, 0.4)",
                        }}
                      >
                        {isJoiningWaitlist ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Joining Priority Queue…</span>
                          </>
                        ) : (
                          <>
                            <span>⚡ Join Priority Waitlist</span>
                            <ChevronRight size={18} />
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div>
                  <div className={styles.slotsGrid}>
                    {availableSlots.map((slot) => {
                      const timeLabel = new Date(slot.startAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                      const isSelected = selectedSlot === slot.startAt;

                      return (
                        <button
                          key={slot.startAt}
                          type="button"
                          disabled={isReservingSlot}
                          className={`${styles.slotButton} ${isSelected ? styles.slotButtonSelected : ""}`}
                          onClick={() => handleReserveSlot(slot.startAt, (slot as any).staffId)}
                        >
                          <span>{timeLabel}</span>
                          {(slot as any).remainingCapacity !== undefined && (slot as any).remainingCapacity > 1 && (
                            <span style={{ fontSize: "10px", opacity: 0.85, display: "block", marginTop: "2px", color: "#c084fc", fontWeight: 700 }}>
                              {(slot as any).remainingCapacity} spots left
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Subtle link to join waitlist even when slots are available */}
                  <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => setShowWaitlistForm((v) => !v)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      {showWaitlistForm ? "Hide Waitlist Options" : "Can't find a time that works? Join Priority Waitlist"}
                    </button>
                  </div>

                  {showWaitlistForm && (
                    <div
                      style={{
                        marginTop: "1.25rem",
                        background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)",
                        borderRadius: "16px",
                        border: "1px solid rgba(245, 158, 11, 0.4)",
                        padding: "1.5rem",
                      }}
                    >
                      {waitlistSubmittedResult ? (
                        <div style={{ textAlign: "center", padding: "1rem 0" }}>
                          <span style={{ fontSize: "24px" }}>✓</span>
                          <h4 style={{ color: "#ffffff", margin: "8px 0" }}>You're on the Priority Waitlist!</h4>
                          <span style={{ color: "#fbbf24", fontSize: "0.85rem", fontWeight: 700 }}>
                            Position #{waitlistSubmittedResult.position || 1} in line
                          </span>
                        </div>
                      ) : (
                        <form onSubmit={handleJoinPriorityWaitlist}>
                          <div style={{ color: "#fbbf24", fontWeight: 800, fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                            ⚡ Join Priority Waitlist for Alternative Times
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
                            <input
                              type="text"
                              required
                              className={styles.formInput}
                              placeholder="Your Name"
                              value={waitlistCustomerName}
                              onChange={(e) => setWaitlistCustomerName(e.target.value)}
                            />
                            <input
                              type="email"
                              required
                              className={styles.formInput}
                              placeholder="Your Email"
                              value={waitlistCustomerEmail}
                              onChange={(e) => setWaitlistCustomerEmail(e.target.value)}
                            />
                            <input
                              type="tel"
                              className={styles.formInput}
                              placeholder="Mobile (SMS)"
                              value={waitlistCustomerPhone}
                              onChange={(e) => setWaitlistCustomerPhone(e.target.value)}
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isJoiningWaitlist}
                            style={{
                              padding: "0.6rem 1.2rem",
                              borderRadius: "8px",
                              backgroundColor: "#f59e0b",
                              color: "#0f172a",
                              border: "none",
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              cursor: "pointer",
                            }}
                          >
                            {isJoiningWaitlist ? "Joining Queue…" : "Join Priority Waitlist"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Guest Details & Dynamic Intake Forms */}
          {currentStep === 3 && (
            <div>
              <div className={styles.sectionHeader}>
                <h1 className={styles.sectionTitle}>Your Information</h1>
                <p className={styles.sectionDescription}>
                  Please provide your contact details and complete the required questions for your appointment.
                </p>
              </div>

              <form onSubmit={handlePersistDetails}>
                <div className={styles.formGroup}>
                  <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Full Name</label>
                  <input
                    type="text"
                    className={`${styles.formInput} ${formErrors.fullName ? styles.formInputError : ""}`}
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                  {formErrors.fullName && <div className={styles.errorText}>{formErrors.fullName}</div>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className={styles.formGroup}>
                    <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>Email Address</label>
                    <input
                      type="email"
                      className={`${styles.formInput} ${formErrors.email ? styles.formInputError : ""}`}
                      placeholder="jane@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    {formErrors.email && <div className={styles.errorText}>{formErrors.email}</div>}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Phone Number</label>
                    <input
                      type="tel"
                      className={styles.formInput}
                      placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Special Requests or Preferences (Optional)</label>
                  <textarea
                    rows={2}
                    className={styles.formTextarea}
                    placeholder="Let us know about allergies, focus areas, or accessibility needs..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Dynamic Intake Forms */}
                {intakeForms.map((form) => (
                  <div
                    key={form.id}
                    style={{
                      background: "#071021",
                      border: "1px solid #17243a",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      marginTop: "1.5rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <FileText size={18} color="#38bdf8" />
                      <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#ffffff", margin: 0 }}>
                        {form.name}
                      </h3>
                    </div>
                    {form.description && (
                      <p style={{ fontSize: "0.82rem", color: "#a8b5ca", marginBottom: "1rem" }}>
                        {form.description}
                      </p>
                    )}

                    {form.fields.map((field) => {
                      const errorKey = `intake_${form.id}_${field.id}`;
                      const hasError = formErrors[errorKey];
                      const currentValue = intakeResponses[form.id]?.[field.id] ?? "";

                      return (
                        <div key={field.id} className={styles.formGroup}>
                          <label
                            className={`${styles.formLabel} ${field.required ? styles.formLabelRequired : ""}`}
                          >
                            {field.label}
                          </label>

                          {field.type === "textarea" ? (
                            <textarea
                              rows={2}
                              className={`${styles.formTextarea} ${hasError ? styles.formInputError : ""}`}
                              placeholder={field.placeholder}
                              value={currentValue}
                              onChange={(e) => {
                                setIntakeResponses((prev) => ({
                                  ...prev,
                                  [form.id]: {
                                    ...(prev[form.id] || {}),
                                    [field.id]: e.target.value,
                                  },
                                }));
                              }}
                            />
                          ) : field.type === "select" ? (
                            <select
                              className={`${styles.formSelect} ${hasError ? styles.formInputError : ""}`}
                              value={currentValue}
                              onChange={(e) => {
                                setIntakeResponses((prev) => ({
                                  ...prev,
                                  [form.id]: {
                                    ...(prev[form.id] || {}),
                                    [field.id]: e.target.value,
                                  },
                                }));
                              }}
                            >
                              <option value="">Select an option...</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              className={`${styles.formInput} ${hasError ? styles.formInputError : ""}`}
                              placeholder={field.placeholder}
                              value={currentValue}
                              onChange={(e) => {
                                setIntakeResponses((prev) => ({
                                  ...prev,
                                  [form.id]: {
                                    ...(prev[form.id] || {}),
                                    [field.id]: e.target.value,
                                  },
                                }));
                              }}
                            />
                          )}

                          {hasError && <div className={styles.errorText}>{hasError}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Consent Checkbox */}
                <label className={styles.checkboxContainer}>
                  <input
                    type="checkbox"
                    className={styles.checkboxInput}
                    checked={consentMarketing}
                    onChange={(e) => setConsentMarketing(e.target.checked)}
                  />
                  <span className={styles.checkboxLabel}>
                    I agree to receive appointment updates, reminders, and exclusive studio offers via email & SMS.
                  </span>
                </label>

                <div style={{ marginTop: "2rem" }}>
                  <button type="submit" disabled={isSubmittingDetails} className={styles.primaryButton}>
                    {isSubmittingDetails ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        <span>Validating Details...</span>
                      </>
                    ) : (
                      <>
                        <span>Review Reservation & Continue</span>
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 4: Review Snapshot & Payment */}
          {currentStep === 4 && canonicalReview && (
            <div>
              <div className={styles.sectionHeader}>
                <h1 className={styles.sectionTitle}>Review & Confirm</h1>
                <p className={styles.sectionDescription}>
                  Review your appointment summary and finalize your reservation.
                </p>
              </div>

              {/* Verified Details Card */}
              <div
                style={{
                  background: "#071021",
                  border: "1px solid #17243a",
                  borderRadius: "12px",
                  padding: "1.25rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff", margin: "0 0 0.75rem 0" }}>
                  Guest Information
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.85rem" }}>
                  <div>
                    <span style={{ color: "#66758f", display: "block" }}>Name</span>
                    <strong style={{ color: "#ffffff" }}>{canonicalReview.guest?.fullName}</strong>
                  </div>
                  <div>
                    <span style={{ color: "#66758f", display: "block" }}>Email</span>
                    <strong style={{ color: "#ffffff" }}>{canonicalReview.guest?.email}</strong>
                  </div>
                </div>
              </div>

              {/* Payment Section */}
              {canonicalReview.quote.payableNowCents > 0 ? (
                <div>
                  <div className={styles.payableNowBadge} style={{ marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <Lock size={20} color="#38bdf8" />
                      <div>
                        <span style={{ fontWeight: 700, color: "#ffffff", display: "block" }}>
                          Deposit Required to Confirm Slot
                        </span>
                        <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                          {formatCurrency(canonicalReview.quote.remainingBalanceCents, canonicalReview.quote.currency)} remaining balance due at appointment
                        </span>
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, color: "#38bdf8" }}>
                      {formatCurrency(canonicalReview.quote.payableNowCents, canonicalReview.quote.currency)} Due Now
                    </span>
                  </div>

                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.4rem" }}>
                    Secure Online Payment
                  </h3>
                  <p style={{ fontSize: "0.85rem", color: "#a8b5ca", margin: "0 0 1rem 0" }}>
                    Please enter your card details below to pay the {formatCurrency(canonicalReview.quote.payableNowCents, canonicalReview.quote.currency)} deposit and lock in your appointment time.
                  </p>

                  {isCreatingPaymentIntent ? (
                    <div style={{ textAlign: "center", padding: "2.5rem 1.5rem", background: "#071021", borderRadius: "10px", border: "1px solid #17243a" }}>
                      <Loader2 className="animate-spin" size={28} color="#38bdf8" style={{ margin: "0 auto 0.75rem auto" }} />
                      <p style={{ color: "#ffffff", fontSize: "0.92rem", fontWeight: 600 }}>Initializing Secure Payment Gateway...</p>
                      <p style={{ color: "#66758f", fontSize: "0.8rem", marginTop: "0.25rem" }}>Connecting to encrypted checkout</p>
                    </div>
                  ) : paymentClientSecret ? (
                    <StripePaymentSection
                      clientSecret={paymentClientSecret}
                      publishableKey={
                         stripePublishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
                      }
                      connectedAccountId={connectedAccountId}
                      holdId={holdId || undefined}
                      guestToken={guestToken || undefined}
                      payableNowCents={paymentConversion?.usdCents ?? canonicalReview.quote.payableNowCents}
                      currency={paymentConversion ? "USD" : canonicalReview.quote.currency}
                      conversion={paymentConversion}
                      onSuccess={handlePaymentSuccess}
                      onError={(msg) => setGeneralError(msg)}
                    />


                  ) : (
                    <div style={{ textAlign: "center", padding: "1.5rem", background: "#071021", borderRadius: "10px", border: "1px solid #17243a" }}>
                      <p style={{ color: "#f87171", fontSize: "0.88rem", marginBottom: "1rem" }}>
                        Unable to connect to payment gateway. Please retry.
                      </p>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => initiatePaymentIntent(holdId!, guestToken!)}
                      >
                        <RefreshCw size={16} />
                        <span>Retry Payment Setup</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className={styles.payableNowBadge}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <CheckCircle2 size={20} color="#34d399" />
                      <div>
                        <span style={{ fontWeight: 700, color: "#ffffff", display: "block" }}>
                          No Upfront Deposit Required
                        </span>
                        <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                          {formatCurrency(canonicalReview.quote.totalCents, canonicalReview.quote.currency)} total due at studio
                        </span>
                      </div>
                    </div>
                    <span style={{ fontWeight: 800, color: "#34d399" }}>{formatCurrency(0, canonicalReview.quote.currency)} Due Now</span>
                  </div>

                  <button
                    type="button"
                    disabled={isPollingStatus}
                    className={styles.primaryButton}
                    style={{ marginTop: "1.25rem" }}
                    onClick={handleFinalizeZeroDeposit}
                  >
                    {isPollingStatus ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        <span>Confirming Reservation...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Confirm Reservation</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Release Hold Button */}
              <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#66758f",
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  onClick={handleCancelHold}
                >
                  Cancel & choose a different time
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Sticky Workbench Summary Card */}
        <aside className={styles.summaryPanel}>
          <div className={styles.summaryTitle}>
            <span>Reservation Summary</span>
            {holdTimeLeftSec !== null && holdTimeLeftSec > 0 && !isHoldExpired && (
              <span
                style={{
                  fontSize: "0.78rem",
                  fontFamily: "monospace",
                  color: holdTimeLeftSec < 60 ? "#f87171" : "#7dd3fc",
                }}
              >
                {formattedCountdown} left
              </span>
            )}
          </div>

          <div className={styles.summarySection}>
            <div className={styles.summaryRow}>
              <span>Service</span>
              <span className={styles.summaryRowValue}>{selectedService?.name || "None Selected"}</span>
            </div>

            <div className={styles.summaryRow}>
              <span>Duration</span>
              <span className={styles.summaryRowValue}>
                {selectedService ? `${selectedService.durationMin} mins` : "--"}
              </span>
            </div>

            <div className={styles.summaryRow}>
              <span>Location</span>
              <span className={styles.summaryRowValue}>
                {selectedLocation?.name || "Main Branch"}
                {selectedLocation?.city ? ` (${selectedLocation.city})` : ""}
              </span>
            </div>

            <div className={styles.summaryRow}>
              <span>Specialist</span>
              <span className={styles.summaryRowValue}>
                {selectedStaff ? selectedStaff.displayName : "Any Available Staff"}
              </span>
            </div>

            {selectedSlot && (
              <div className={styles.summaryRow}>
                <span>Scheduled Time</span>
                <span className={styles.summaryRowValue}>
                  {new Date(selectedSlot).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Promo Code Redemption Box */}
          <div style={{ margin: "14px 0", padding: "12px", borderRadius: "8px", background: "rgba(15, 23, 42, 0.6)", border: "1px dashed rgba(56, 189, 248, 0.3)" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>
              Studio Promo Code
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                type="text"
                placeholder="e.g. WELCOME20"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  background: "rgba(10, 15, 30, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  color: "#f8fafc",
                  fontSize: "12.5px",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={applyingCoupon || !couponInput.trim()}
                style={{
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid rgba(56, 189, 248, 0.4)",
                  color: "#38bdf8",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: applyingCoupon ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {applyingCoupon ? "…" : "Apply"}
              </button>
            </div>
            {couponMessage && (
              <div
                style={{
                  fontSize: "11px",
                  marginTop: "6px",
                  color: couponMessage.error ? "#f87171" : "#34d399",
                }}
              >
                {couponMessage.text}
              </div>
            )}
          </div>

          {/* Pricing Breakdown */}
          {canonicalReview ? (
            <div>
              <div className={styles.priceBreakdownRow}>
                <span>Base Service Price</span>
                <span>{formatCurrency(canonicalReview.quote.basePriceCents, canonicalReview.quote.currency)}</span>
              </div>

              {canonicalReview.quote.taxBehavior === "INCLUSIVE" && canonicalReview.quote.taxCents > 0 && (
                <div className={styles.priceBreakdownRow} style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                  <span>Included Tax {canonicalReview.quote.taxRatePct != null ? `(${canonicalReview.quote.taxRatePct}%)` : ""}</span>
                  <span>{formatCurrency(canonicalReview.quote.taxCents, canonicalReview.quote.currency)}</span>
                </div>
              )}

              {canonicalReview.quote.taxBehavior === "EXCLUSIVE" && canonicalReview.quote.taxCents > 0 && (
                <div className={styles.priceBreakdownRow}>
                  <span>Sales Tax {canonicalReview.quote.taxRatePct != null ? `(${canonicalReview.quote.taxRatePct}%)` : ""}</span>
                  <span>{formatCurrency(canonicalReview.quote.taxCents, canonicalReview.quote.currency)}</span>
                </div>
              )}

              {(!canonicalReview.quote.taxBehavior || canonicalReview.quote.taxBehavior === "NONE" || canonicalReview.quote.taxCents === 0) && (
                <div className={styles.priceBreakdownRow} style={{ color: "#64748b", fontSize: "0.82rem" }}>
                  <span>Taxes & Fees</span>
                  <span>{formatCurrency(0, canonicalReview.quote.currency)}</span>
                </div>
              )}

              {appliedDiscountCents > 0 && (
                <div className={styles.priceBreakdownRow} style={{ color: "#34d399" }}>
                  <span>Promo Savings ({appliedCouponCode})</span>
                  <span>-{formatCurrency(appliedDiscountCents, canonicalReview.quote.currency)}</span>
                </div>
              )}

              <div className={styles.priceBreakdownRowBold}>
                <span>Total Amount</span>
                <span>
                  {formatCurrency(
                    Math.max(0, canonicalReview.quote.totalCents - ((canonicalReview.quote as any)?.appliedCouponCode ? 0 : appliedDiscountCents)),
                    canonicalReview.quote.currency
                  )}
                </span>
              </div>

              <div className={styles.payableNowBadge}>
                <span>Deposit Payable Now</span>
                <span style={{ fontWeight: 800, color: "#38bdf8" }}>
                  {formatCurrency(canonicalReview.quote.payableNowCents, canonicalReview.quote.currency)}
                </span>
              </div>

              {canonicalReview.quote.remainingBalanceCents > 0 && (
                <div style={{ fontSize: "0.82rem", color: "#a8b5ca", textAlign: "right" }}>
                  Remaining balance due at service:{" "}
                  {formatCurrency(
                    Math.max(
                      0,
                      canonicalReview.quote.remainingBalanceCents - ((canonicalReview.quote as any)?.appliedCouponCode ? 0 : appliedDiscountCents)
                    ),
                    canonicalReview.quote.currency
                  )}
                </div>
              )}

              <div className={styles.policyNotice}>
                <div style={{ fontWeight: 700, color: "#eaf2ff", marginBottom: "0.25rem" }}>
                  Cancellation & Refund Policy
                </div>
                <span>
                  Notice required: {canonicalReview.policy.cancelCutoffHours}h before start time.{" "}
                  {canonicalReview.policy.description}
                </span>
              </div>
            </div>
          ) : selectedService ? (
            <div>
              <div className={styles.priceBreakdownRowBold}>
                <span>Service Price</span>
                <span>{formatCurrency(selectedService.priceCents, selectedService.currency)}</span>
              </div>
              {selectedService.taxBehavior === "INCLUSIVE" ? (
                <div style={{ fontSize: "0.78rem", color: "#34d399", marginTop: "0.35rem" }}>
                  ✓ Tax included in price
                </div>
              ) : selectedService.taxBehavior === "EXCLUSIVE" ? (
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.35rem" }}>
                  + Location sales tax calculated at slot selection
                </div>
              ) : (
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.35rem" }}>
                  No tax applicable
                </div>
              )}
              {selectedService.depositType && selectedService.depositType !== "NONE" && (
                <div style={{ fontSize: "0.78rem", color: "#f59e0b", marginTop: "0.35rem" }}>
                  Requires upfront deposit to hold reservation
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </main>

      {/* Hold Expiration Modal Overlay */}
      {isHoldExpired && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <XCircle size={48} color="#ef4444" style={{ margin: "0 auto 1rem auto" }} />
            <h2 className={styles.modalTitle}>Reservation Time Expired</h2>
            <p className={styles.modalText}>
              Your 10-minute hold on this appointment time has expired and the slot has been released back to availability.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                setHoldId(null);
                setGuestToken(null);
                setHoldExpiresAt(null);
                setHoldTimeLeftSec(null);
                setIsHoldExpired(false);
                setSelectedSlot(null);
                setCurrentStep(2);
              }}
            >
              <RefreshCw size={18} />
              <span>Select a New Time Slot</span>
            </button>
          </div>
        </div>
      )}
      </div>
    </CustomerPortalShell>
  );
}
