import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  endOfMonth,
  format,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";

/**
 * Active display locale for date formatting. Defaults to en-US so engines/tests
 * stay deterministic; the UI sets it from the active i18n language.
 */
let currentLocale = "en-US";

export function setDateLocale(locale: string): void {
  currentLocale = locale;
}

function dateFnsLocale() {
  return currentLocale === "pt-BR" ? ptBR : undefined;
}

/**
 * The app uses a fixed "now" that can be overridden in tests to keep
 * projections deterministic. In production it reads the real clock.
 */
let nowProvider: () => Date = () => new Date();

export function setNowProvider(fn: () => Date): void {
  nowProvider = fn;
}

export function now(): Date {
  return nowProvider();
}

/** Current instant as an ISO 8601 string. */
export function nowIso(): string {
  return nowProvider().toISOString();
}

/** Current calendar year, e.g. 2026. */
export function currentYear(): number {
  return nowProvider().getFullYear();
}

/** Safe ISO parse that tolerates empty strings. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  try {
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Format an ISO date for display, localized, e.g. "Jun 29, 2026" / "29 de jun. de 2026". */
export function formatDate(value?: string | null, pattern?: string): string {
  const d = parseDate(value);
  if (!d) return "—";
  const p =
    pattern ?? (currentLocale === "pt-BR" ? "d 'de' MMM 'de' yyyy" : "MMM d, yyyy");
  return format(d, p, { locale: dateFnsLocale() });
}

/** Human-friendly localized relative time, e.g. "2 minutes ago" / "há 2 minutos". */
export function formatRelative(value?: string | null): string {
  const d = parseDate(value);
  if (!d) return currentLocale === "pt-BR" ? "nunca" : "never";
  const rtf = new Intl.RelativeTimeFormat(currentLocale, { numeric: "auto" });
  const seconds = Math.round((nowProvider().getTime() - d.getTime()) / 1000);
  if (seconds < 45) return rtf.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

export function monthsBetween(from: Date, to: Date): number {
  return differenceInCalendarMonths(to, from);
}

export function yearsBetween(from: Date, to: Date): number {
  return differenceInCalendarYears(to, from);
}

/** Whether an ISO timestamp is older than `seconds` seconds from now. */
export function isOlderThanSeconds(value: string | null | undefined, seconds: number): boolean {
  const d = parseDate(value ?? null);
  if (!d) return true;
  return nowProvider().getTime() - d.getTime() > seconds * 1000;
}

/** Calendar-date format used for marks, trades and quotes. */
const DATE_ONLY = "yyyy-MM-dd";

/** Today as a calendar date string, "YYYY-MM-DD". Honors setNowProvider. */
export function todayIsoDate(): string {
  return format(nowProvider(), DATE_ONLY);
}

/** Add (or subtract) days to a "YYYY-MM-DD" string, same format out. */
export function addDaysIso(isoDate: string, days: number): string {
  return format(addDays(parseISO(isoDate), days), DATE_ONLY);
}

/** Whole calendar days from `from` to `to`. Negative when `to` precedes `from`. */
export function diffCalendarDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/**
 * Add (or subtract, with a negative count) whole calendar months to a
 * "YYYY-MM-DD" string. Clamps an overflowing day to the target month's last
 * day, e.g. `addMonthsIso("2026-03-31", -1)` -> "2026-02-28".
 */
export function addMonthsIso(isoDate: string, months: number): string {
  return format(addMonths(parseISO(isoDate), months), DATE_ONLY);
}

/**
 * Ascending sample dates for a monthly series: every month end within
 * [from, to], plus `to` itself when it is not already a month end.
 * Returns [] when `from` is after `to`, or when either bound is not a real
 * calendar date (defensive: `from` can come from untrusted, hand-edited
 * spreadsheet data via an observation's `observedAt`).
 */
export function monthEndsBetween(from: string, to: string): string[] {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return [];
  if (from > to) return [];
  const out: string[] = [];
  let cursor = endOfMonth(fromDate);
  while (format(cursor, DATE_ONLY) <= to) {
    const day = format(cursor, DATE_ONLY);
    if (day >= from) out.push(day);
    cursor = endOfMonth(addDays(cursor, 1));
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}

/**
 * Add (or subtract) calendar years to a "YYYY-MM-DD" string. 29 February
 * clamps to 28 February in a non-leap target year, matching date-fns.
 */
export function addYearsIso(isoDate: string, years: number): string {
  const parsed = parseDate(isoDate);
  if (!parsed) return isoDate;
  return format(addYears(parsed, years), DATE_ONLY);
}
