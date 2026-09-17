/** Returns midnight UTC representing the calendar date in the supplied IANA timezone. */
export function organizationBookingDate(value: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`);
}
