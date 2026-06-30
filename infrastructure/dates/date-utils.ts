import {
  differenceInCalendarMonths,
  differenceInCalendarYears,
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
