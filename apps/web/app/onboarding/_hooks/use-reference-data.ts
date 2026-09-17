"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../../lib/api-client";
import {
    ReferenceTimezoneDto,
    ReferenceCurrencyDto,
    ReferenceCountryDto,
    ReferenceIndustryDto,
} from "@bookpro/contracts";

export function useReferenceData() {
    const [timezones, setTimezones] = useState<ReferenceTimezoneDto[]>([]);
    const [currencies, setCurrencies] = useState<ReferenceCurrencyDto[]>([]);
    const [countries, setCountries] = useState<ReferenceCountryDto[]>([]);
    const [industries, setIndustries] = useState<ReferenceIndustryDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function loadAllReferenceData() {
            try {
                setLoading(true);
                const [tzRes, currRes, countryRes, indRes] = await Promise.all([
                    apiFetch<ReferenceTimezoneDto[]>("/reference/timezones"),
                    apiFetch<ReferenceCurrencyDto[]>("/reference/currencies"),
                    apiFetch<ReferenceCountryDto[]>("/reference/countries"),
                    apiFetch<ReferenceIndustryDto[]>("/reference/industries"),
                ]);

                if (isMounted) {
                    if (tzRes.success && tzRes.data) setTimezones(tzRes.data);
                    if (currRes.success && currRes.data) setCurrencies(currRes.data);
                    if (countryRes.success && countryRes.data) setCountries(countryRes.data);
                    if (indRes.success && indRes.data) setIndustries(indRes.data);
                }
            } catch (err: any) {
                if (isMounted) setError(err.message || "Failed to load reference datasets");
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadAllReferenceData();

        return () => {
            isMounted = false;
        };
    }, []);

    return {
        timezones,
        currencies,
        countries,
        industries,
        loading,
        error,
    };
}
