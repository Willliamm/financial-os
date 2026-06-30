/**
 * Money utilities.
 *
 * All money in the system is stored as an integer number of US cents.
 * Never use floating-point dollars for persisted values. Convert at the edges
 * (UI input/display) only.
 */

export type MoneyCents = number;

export interface Money {
  cents: MoneyCents;
  currency: "USD";
}

/** Create a Money value object from an integer cent amount. */
export function money(cents: MoneyCents): Money {
  return { cents: Math.round(cents), currency: "USD" };
}

export const ZERO: Money = { cents: 0, currency: "USD" };

/** Convert a dollar amount (possibly fractional) into integer cents. */
export function dollarsToCents(dollars: number): MoneyCents {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

/** Convert integer cents into a fractional dollar number. */
export function centsToDollars(cents: MoneyCents): number {
  return cents / 100;
}

/** Add a list of cent amounts safely. */
export function addCents(...values: MoneyCents[]): MoneyCents {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

/** Subtract b from a. */
export function subCents(a: MoneyCents, b: MoneyCents): MoneyCents {
  return a - b;
}

/** Multiply a cent amount by a scalar factor and round to the nearest cent. */
export function mulCents(cents: MoneyCents, factor: number): MoneyCents {
  return Math.round(cents * factor);
}

/** Divide a cent amount by a divisor and round to the nearest cent. */
export function divCents(cents: MoneyCents, divisor: number): MoneyCents {
  if (divisor === 0) return 0;
  return Math.round(cents / divisor);
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function getFormatter(opts: {
  maximumFractionDigits: number;
  minimumFractionDigits: number;
}): Intl.NumberFormat {
  const key = `${currentLocale}-${opts.minimumFractionDigits}-${opts.maximumFractionDigits}`;
  let fmt = CURRENCY_FORMATTERS.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(currentLocale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: opts.minimumFractionDigits,
      maximumFractionDigits: opts.maximumFractionDigits,
    });
    CURRENCY_FORMATTERS.set(key, fmt);
  }
  return fmt;
}

/**
 * Active display locale for money formatting. Amounts are always USD — only the
 * number/symbol formatting changes by locale (e.g. en-US "$2,500.00" vs pt-BR
 * "US$ 2.500,00"). The currency is NEVER swapped to BRL, which would imply an
 * exchange-rate conversion that did not happen. Defaults to en-US so engines and
 * tests stay deterministic; the UI sets it from the active i18n language.
 */
let currentLocale = "en-US";

export function setMoneyLocale(locale: string): void {
  currentLocale = locale;
}

/**
 * Format cents as a USD currency string, e.g. 250000 -> "$2,500.00".
 */
export function formatCents(
  cents: MoneyCents,
  options: { compact?: boolean; decimals?: number } = {},
): string {
  const dollars = centsToDollars(cents);
  if (options.compact) {
    return formatCompactCurrency(dollars);
  }
  const decimals = options.decimals ?? 2;
  return getFormatter({
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(dollars);
}

/**
 * Compact currency, e.g. $3.2M, $90k. Useful for charts and KPI tiles.
 */
export function formatCompactCurrency(dollars: number): string {
  // Non-default locales use Intl compact so separators/symbol localize
  // (pt-BR: "US$ 3,2 mi"). en-US keeps the established hand-rolled style.
  if (currentLocale !== "en-US") {
    return new Intl.NumberFormat(currentLocale, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(dollars);
  }
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

/** Parse a user-entered dollar string ("$2,500.50") into integer cents. */
export function parseDollarsToCents(input: string): MoneyCents {
  if (typeof input !== "string") return 0;
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return dollarsToCents(value);
}
