/**
 * Timezone detection, conversion, and discrepancy comparison utilities
 * for BookPro customer and owner portal flows.
 */

/**
 * Automatically detects the client device / operating system timezone
 */
export function detectSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Calculates the UTC offset in minutes for a specific timezone at a given instant
 */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  try {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const targetDate = new Date(date.toLocaleString("en-US", { timeZone }));
    return Math.round((targetDate.getTime() - utcDate.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export interface TimezoneComparison {
  systemTimezone: string;
  orgTimezone: string;
  systemOffsetMinutes: number;
  orgOffsetMinutes: number;
  differenceMinutes: number;
  differenceHours: number;
  isDifferent: boolean;
  systemTimeFormatted: string;
  orgTimeFormatted: string;
  differenceDescription: string;
}

/**
 * Compares client system timezone and organization timezone, returning
 * converted times, minute/hour differences, and human-readable descriptions.
 */
export function compareSystemAndOrgTimezones(
  orgTimezoneInput?: string,
  referenceDate: Date = new Date()
): TimezoneComparison {
  const systemTimezone = detectSystemTimezone();
  const orgTimezone = orgTimezoneInput || "UTC";

  const systemOffset = getTimezoneOffsetMinutes(systemTimezone, referenceDate);
  const orgOffset = getTimezoneOffsetMinutes(orgTimezone, referenceDate);
  const diffMinutes = systemOffset - orgOffset;
  const diffHours = Math.round((diffMinutes / 60) * 10) / 10;

  // Format current reference time in both timezones
  const systemTimeFormatted = formatInTimezone(referenceDate, systemTimezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const orgTimeFormatted = formatInTimezone(referenceDate, orgTimezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const isDifferent = systemTimezone !== orgTimezone || diffMinutes !== 0;

  let differenceDescription = "Your device time matches the organization operating time.";
  if (isDifferent) {
    const absHours = Math.abs(diffHours);
    const hourLabel = absHours === 1 ? "1 hour" : `${absHours} hours`;
    if (diffMinutes > 0) {
      differenceDescription = `Your device is ${hourLabel} ahead of organization operating time (+${absHours}h).`;
    } else if (diffMinutes < 0) {
      differenceDescription = `Your device is ${hourLabel} behind organization operating time (-${absHours}h).`;
    } else {
      differenceDescription = `Your device is in a different timezone (${systemTimezone}), but current clock time matches organization operating time.`;
    }
  }

  return {
    systemTimezone,
    orgTimezone,
    systemOffsetMinutes: systemOffset,
    orgOffsetMinutes: orgOffset,
    differenceMinutes: diffMinutes,
    differenceHours: diffHours,
    isDifferent,
    systemTimeFormatted,
    orgTimeFormatted,
    differenceDescription,
  };
}

/**
 * Formats a Date or ISO string in a given timezone with custom or default options
 */
export function formatInTimezone(
  dateOrIso: Date | string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const date = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: timeZone || "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    };
    return new Intl.DateTimeFormat("en-US", { ...defaultOptions, ...options }).format(date);
  } catch {
    const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
    return d.toLocaleString();
  }
}
