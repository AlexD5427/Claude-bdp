/**
 * es-MX formatters.
 *
 * Every visible date, time, and number in the Talent Acquisition modules flows
 * through these helpers so formatting stays consistent and locale-driven. We do
 * NOT assume a city, country, currency, or time zone — dates render in the
 * viewer's local time zone and currency is only formatted when a caller opts in
 * with an explicit ISO 4217 code.
 */

export const LOCALE = "es-MX" as const;

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

const numberFmt = new Intl.NumberFormat(LOCALE);

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Short date, e.g. "13 jul 2026". Returns the fallback for invalid input. */
export function formatDate(
  value: string | number | Date | null | undefined,
  fallback = "—",
): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : fallback;
}

/** Date + time, e.g. "13 jul 2026, 12:56". */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback = "—",
): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : fallback;
}

/** Time only, e.g. "12:56". */
export function formatTime(
  value: string | number | Date | null | undefined,
  fallback = "—",
): string {
  const d = toDate(value);
  return d ? timeFmt.format(d) : fallback;
}

/** Localized integer/decimal, e.g. "1,240". */
export function formatNumber(value: number | null | undefined, fallback = "—"): string {
  return typeof value === "number" && Number.isFinite(value)
    ? numberFmt.format(value)
    : fallback;
}

/** Currency, formatted only when an explicit ISO 4217 code is provided. */
export function formatCurrency(
  value: number | null | undefined,
  currency: string,
  fallback = "—",
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(value);
}

/** A compact "hace 3 min" / "en 2 h" relative label. */
export function formatRelative(
  value: string | number | Date | null | undefined,
  fallback = "—",
): string {
  const d = toDate(value);
  if (!d) return fallback;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "short" });
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const min = 60_000,
    hour = 3_600_000,
    day = 86_400_000;
  if (abs < hour) return rtf.format(Math.round(diffMs / min), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  return rtf.format(Math.round(diffMs / day), "day");
}

/** Minutes → "1 h 30 min" / "45 min". */
export function formatDuration(minutes: number | null | undefined, fallback = "—"): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return fallback;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}
