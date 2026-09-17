import { Injectable, Logger, Optional } from "@nestjs/common";
import { RedisService } from "@bookpro/server-core";

export interface ConversionResult {
    usdCents: number;
    rate: number; // 1 unit of fromCurrency in USD
    originalAmountCents: number;
    originalCurrency: string;
    targetCurrency: string;
}

export interface ForexRateSnapshot {
    base: string;
    rates: Record<string, number>;
    updatedAt: number;
}

@Injectable()
export class ExchangeRateService {
    private readonly logger = new Logger(ExchangeRateService.name);
    private readonly cacheKey = "forex:rates:USD";
    private readonly cacheTtlSeconds = 3600; // 1 hour TTL
    private inMemoryRates: ForexRateSnapshot | null = null;

    constructor(@Optional() private readonly redisService?: RedisService) { }

    /**
     * Retrieves the latest authoritative exchange rates against USD.
     */
    async getRates(): Promise<Record<string, number>> {
        // 1. Try Redis cache
        if (this.redisService && this.redisService.getIsConnected()) {
            try {
                const cached = await this.redisService.get<ForexRateSnapshot>(this.cacheKey);
                if (cached && cached.rates && Date.now() - cached.updatedAt < this.cacheTtlSeconds * 1000) {
                    this.inMemoryRates = cached;
                    return cached.rates;
                }
            } catch (err: any) {
                this.logger.warn(`Redis Forex read failed: ${err.message}`);
            }
        }

        // 2. Try In-Memory cache if fresh (< 1 hour)
        if (this.inMemoryRates && Date.now() - this.inMemoryRates.updatedAt < this.cacheTtlSeconds * 1000) {
            return this.inMemoryRates.rates;
        }

        // 3. Fetch live authoritative rates from real-time Forex endpoint
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch("https://open.er-api.com/v6/latest/USD", {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                if (data && data.rates && typeof data.rates === "object") {
                    const snapshot: ForexRateSnapshot = {
                        base: data.base_code || "USD",
                        rates: data.rates,
                        updatedAt: Date.now(),
                    };
                    this.inMemoryRates = snapshot;

                    if (this.redisService && this.redisService.getIsConnected()) {
                        await this.redisService.set(this.cacheKey, snapshot, this.cacheTtlSeconds).catch(() => undefined);
                    }
                    this.logger.log(`Refreshed live exchange rates (PKR: ${data.rates.PKR}, EUR: ${data.rates.EUR}, GBP: ${data.rates.GBP})`);
                    return snapshot.rates;
                }
            }
        } catch (fetchErr: any) {
            this.logger.warn(`Failed to fetch live exchange rates: ${fetchErr.message}`);
        }

        // 4. If fetch fails, return in-memory rates if available
        if (this.inMemoryRates && this.inMemoryRates.rates) {
            return this.inMemoryRates.rates;
        }

        // 5. Fallback emergency rates for major currencies if network is completely unreachable
        return {
            USD: 1.0,
            PKR: 278.0,
            EUR: 0.92,
            GBP: 0.78,
            AED: 3.6725,
            SAR: 3.75,
            INR: 83.5,
            CAD: 1.36,
            AUD: 1.52,
        };
    }

    /**
     * Computes the exchange rate from any currency to USD.
     * Rate represents how many USD is 1 unit of `fromCurrency`.
     */
    async getRateToUsd(fromCurrency: string): Promise<number> {
        const norm = (fromCurrency || "USD").toUpperCase();
        if (norm === "USD") return 1.0;

        const rates = await this.getRates();
        const rateAgainstUsd = rates[norm]; // 1 USD = rateAgainstUsd units of fromCurrency
        if (!rateAgainstUsd || rateAgainstUsd <= 0) {
            this.logger.warn(`Unknown currency '${norm}', defaulting exchange rate to 1.0`);
            return 1.0;
        }
        return 1 / rateAgainstUsd;
    }

    /**
     * Converts an amount in native currency cents to USD cents at live current rates.
     */
    async convertToUsdCents(amountCents: number, fromCurrency: string): Promise<ConversionResult> {
        const norm = (fromCurrency || "USD").toUpperCase();
        if (norm === "USD") {
            return {
                usdCents: amountCents,
                rate: 1.0,
                originalAmountCents: amountCents,
                originalCurrency: "USD",
                targetCurrency: "USD",
            };
        }

        const rate = await this.getRateToUsd(norm);
        const originalUnits = amountCents / 100;
        const usdUnits = originalUnits * rate;
        // Stripe requires a minimum charge amount (e.g. 50 USD cents)
        const usdCents = Math.max(50, Math.round(usdUnits * 100));

        return {
            usdCents,
            rate,
            originalAmountCents: amountCents,
            originalCurrency: norm,
            targetCurrency: "USD",
        };
    }

    /**
     * Converts an amount in USD cents back to target currency cents using live rates.
     */
    async convertFromUsdCents(usdCents: number, toCurrency: string): Promise<number> {
        const norm = (toCurrency || "USD").toUpperCase();
        if (norm === "USD") return usdCents;

        const rates = await this.getRates();
        const rateAgainstUsd = rates[norm];
        if (!rateAgainstUsd || rateAgainstUsd <= 0) return usdCents;

        const usdUnits = usdCents / 100;
        const targetUnits = usdUnits * rateAgainstUsd;
        return Math.round(targetUnits * 100);
    }

    /**
     * Converts an amount in minor units (cents) between any two currencies using authoritative rates.
     */
    async convertCurrency(
        amountCents: number,
        fromCurrency: string,
        toCurrency: string
    ): Promise<{ convertedAmountCents: number; rate: number }> {
        const from = (fromCurrency || "USD").toUpperCase();
        const to = (toCurrency || "USD").toUpperCase();

        if (from === to) {
            return { convertedAmountCents: amountCents, rate: 1.0 };
        }

        const rates = await this.getRates();
        const fromRateAgainstUsd = from === "USD" ? 1.0 : rates[from];
        const toRateAgainstUsd = to === "USD" ? 1.0 : rates[to];

        if (!fromRateAgainstUsd || !toRateAgainstUsd) {
            return { convertedAmountCents: amountCents, rate: 1.0 };
        }

        const crossRate = toRateAgainstUsd / fromRateAgainstUsd;
        const fromUnits = amountCents / 100;
        const toUnits = fromUnits * crossRate;
        const convertedAmountCents = Math.round(toUnits * 100);

        return { convertedAmountCents, rate: crossRate };
    }
}
