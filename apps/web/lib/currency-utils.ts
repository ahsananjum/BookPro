/**
 * Universal Currency & Monetary Value Utilities for BookPro
 * Provides standard, reliable formatting based on organization-chosen currency.
 */

const SYMBOL_FALLBACKS: Record<string, string> = {
  USD: "$",
  PKR: "Rs",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  AED: "AED",
  SAR: "SAR",
  INR: "₹",
  JPY: "¥",
  CHF: "CHF",
  CNY: "¥",
  NZD: "NZ$",
  SGD: "SG$",
};

/**
 * Formats an amount in cents into an authoritative localized currency string
 * (e.g. 150000 cents with PKR -> "PKR 1,500.00" or "Rs 1,500.00", 2500 cents with USD -> "$25.00")
 */
export function formatCurrency(
  amountCents: number = 0,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  const code = (currency || "USD").toUpperCase().trim();
  const amount = (amountCents || 0) / 100;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = SYMBOL_FALLBACKS[code] || code;
    return `${symbol} ${amount.toFixed(2)}`;
  }
}

/**
 * Returns the short symbol or prefix for a given currency code.
 */
export function getCurrencySymbol(
  currency: string = "USD",
  locale: string = "en-US"
): string {
  const code = (currency || "USD").toUpperCase().trim();

  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency");
    if (sym && sym.value) return sym.value;
  } catch {
    // Fall back to dictionary
  }

  return SYMBOL_FALLBACKS[code] || code;
}
