/**
 * Authoritative Server Time Synchronization & Monotonic Clock Guard
 * 
 * Protects BookPro client applications against client device clock tampering,
 * drift, or deliberate manipulation (e.g. rolling back device date to evade
 * cancellation policy cutoff windows or freeze booking hold countdowns).
 */

let clockSkewMs: number = 0;
let hasSynced = false;

// Attempt to restore skew from session storage if available
if (typeof window !== "undefined") {
  try {
    const saved = window.sessionStorage.getItem("bookpro:clockSkewMs");
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) {
        clockSkewMs = parsed;
        hasSynced = true;
      }
    }
  } catch {
    // Ignore storage restrictions
  }
}

/**
 * Synchronizes the client's clock baseline against an authoritative server timestamp.
 * @param serverIsoOrMs Server ISO 8601 string (e.g. quote.serverTime) or epoch ms
 */
export function syncServerTime(serverIsoOrMs: string | number): number {
  const serverMs =
    typeof serverIsoOrMs === "number"
      ? serverIsoOrMs
      : new Date(serverIsoOrMs).getTime();

  if (isNaN(serverMs)) return clockSkewMs;

  const clientNow = Date.now();
  clockSkewMs = serverMs - clientNow;
  hasSynced = true;

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem("bookpro:clockSkewMs", String(clockSkewMs));
    } catch {
      // Ignore storage restrictions
    }
  }

  return clockSkewMs;
}

/**
 * Returns the current authoritative real-world date, immune to device clock tampering.
 */
export function getServerNow(): Date {
  return new Date(Date.now() + clockSkewMs);
}

/**
 * Returns the current authoritative server epoch timestamp in milliseconds.
 */
export function getServerTimestampMs(): number {
  return Date.now() + clockSkewMs;
}

/**
 * Returns true if server time has been synchronized at least once.
 */
export function isServerTimeSynced(): boolean {
  return hasSynced;
}

/**
 * Returns the detected clock skew in milliseconds (serverTime - deviceTime).
 * Positive = device clock is behind server (e.g. user set clock in the past).
 * Negative = device clock is ahead of server (e.g. user set clock in the future).
 */
export function getClockSkewMs(): number {
  return clockSkewMs;
}

/**
 * Returns the absolute clock skew in whole minutes.
 */
export function getClockSkewMinutes(): number {
  return Math.round(Math.abs(clockSkewMs) / (60 * 1000));
}

/**
 * Checks whether the client device clock is significantly desynchronized
 * from the authoritative server time (default threshold: 2 minutes / 120,000 ms).
 */
export function isDeviceClockManipulated(thresholdMs: number = 120000): boolean {
  return hasSynced && Math.abs(clockSkewMs) > thresholdMs;
}

/**
 * Formats a user-friendly explanation of the detected clock discrepancy.
 */
export function getClockSkewDescription(): string {
  if (!isDeviceClockManipulated()) return "Device clock matches authoritative server time.";

  const minutes = getClockSkewMinutes();
  const isBehind = clockSkewMs > 0;

  if (minutes < 60) {
    return isBehind
      ? `Device clock is ${minutes} min behind official network time.`
      : `Device clock is ${minutes} min ahead of official network time.`;
  }

  const hours = (Math.abs(clockSkewMs) / (3600 * 1000)).toFixed(1);
  return isBehind
    ? `Device clock is ${hours} hours behind official network time.`
    : `Device clock is ${hours} hours ahead of official network time.`;
}

/**
 * Helper to fetch authoritative server time directly from the server.
 */
export async function fetchServerTime(): Promise<Date> {
  try {
    const res = await fetch("/api/v1/organization/time");
    if (res.ok) {
      const body = await res.json();
      const serverTime = body?.data?.serverTime || body?.serverTime;
      if (serverTime) {
        syncServerTime(serverTime);
        return getServerNow();
      }
    }
  } catch {
    // Network fallback
  }
  return getServerNow();
}
