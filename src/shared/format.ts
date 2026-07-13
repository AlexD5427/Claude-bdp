/**
 * Locale-aware formatting for the ATS — locale `es-BO`, time zone
 * `America/La_Paz`, currency `BOB` (symbol `Bs`).
 *
 * Every user-facing date, number and currency string in the new modules routes
 * through these helpers so the presentation is consistent and centralised (and
 * trivially auditable) rather than scattered across components.
 */

export const LOCALE = "es-BO";
export const TIME_ZONE = "America/La_Paz";
export const CURRENCY = "BOB";
export const CURRENCY_SYMBOL = "Bs";

/** A safe `Date` from an ISO string / epoch / Date, or `null`. */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "13 jul 2026" style short date. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(d);
}

/** "13 jul 2026, 14:05" style date + time. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(d);
}

/** Relative time in Spanish, e.g. "hace 5 min", "en 3 días". */
export function formatRelative(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return "—";
}

/** Integer / decimal number with es-BO grouping. */
export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** "Bs 1.234,50" currency string. */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    currencyDisplay: "symbol",
    maximumFractionDigits: 2,
  }).format(value);
}

/** "45 %" percentage. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(value)} %`;
}

/** Human duration from seconds, e.g. 3900 → "1 h 5 min". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || Number.isNaN(totalSeconds) || totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (!h && s) parts.push(`${s} s`);
  return parts.join(" ") || "—";
}
