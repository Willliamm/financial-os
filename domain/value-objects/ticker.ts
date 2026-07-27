/**
 * Ticker normalization.
 *
 * Tickers are compared case-insensitively because they arrive from three
 * different places that each have their own casing habits: hand typing in a
 * form, a pasted spreadsheet row, and Google's own GOOGLEFINANCE responses.
 * Every read or write that keys a map by ticker must normalize first, or a
 * holding entered as "voo" silently never matches a quote stored as "VOO".
 */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}
