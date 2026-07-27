/**
 * Share prices without a backend.
 *
 * The user already authenticates with Google and already owns a workbook, so
 * the workbook itself is the price feed: a technical `__quotes` tab holds one
 * GOOGLEFINANCE formula per ticker, and the app reads the computed values back
 * through the Sheets API. No API key, no server, no extra OAuth scope.
 *
 * Two facts, both verified against the live API (spec §7.1):
 *  - the write MUST use valueInputOption=USER_ENTERED or the formula is stored
 *    as literal text,
 *  - the read with UNFORMATTED_VALUE yields a real number.
 *
 * Google blocks reading GOOGLEFINANCE *history* as an array outside Sheets, so
 * this never asks for one. Instead every successful read is persisted as a
 * price_quote, and the app accumulates its own price history over time.
 */

import type { PriceQuote } from "@/domain/entities";
import { createEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import type { GoogleClients, SheetValues } from "@/infrastructure/google/google-api-types";
import { createLogger } from "@/lib/logger";
import type { MoneyCents } from "@/infrastructure/money/money";

const log = createLogger("quotes");

export const QUOTE_SHEET = "__quotes";

export interface QuoteRow {
  ticker: string;
  /** null when the cell errored, was blank, or was still loading. */
  priceCents: MoneyCents | null;
  name: string;
  currency: string;
}

/**
 * Parse one price cell into integer cents, or null when it is not a usable
 * price. Google returns `#N/A …` for an unknown symbol and `Loading...` while
 * a formula is still calculating — both mean "no price", not "zero".
 */
export function parseQuoteCell(raw: string | undefined): MoneyCents | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  if (text.startsWith("#")) return null;
  if (/loading/i.test(text)) return null;

  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Rewrite the whole ticker block, so a ticker removed from the portfolio stops
 * consuming a GOOGLEFINANCE call. Row 1 is the header; data starts at row 2.
 */
export async function writeQuoteTickers(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  now: string,
): Promise<void> {
  if (tickers.length === 0) return;
  const rows: SheetValues = tickers.map((ticker, i) => {
    const row = i + 2;
    return [
      ticker,
      `=GOOGLEFINANCE(A${row},"price")`,
      `=GOOGLEFINANCE(A${row},"name")`,
      `=GOOGLEFINANCE(A${row},"currency")`,
      now,
    ];
  });
  await clients.sheets.updateRange(spreadsheetId, `${QUOTE_SHEET}!A2`, rows, {
    formulas: true,
  });
}

/** Read the computed block back. A bad cell yields a null price, never a throw. */
export async function readQuoteRows(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<QuoteRow[]> {
  const values = await clients.sheets.getValues(
    spreadsheetId,
    `${QUOTE_SHEET}!A:E`,
    { unformatted: true },
  );
  if (values.length < 2) return [];
  return values
    .slice(1)
    .filter((row) => (row[0] ?? "").trim() !== "")
    .map((row) => ({
      ticker: (row[0] ?? "").trim().toUpperCase(),
      priceCents: parseQuoteCell(row[1]),
      name: (row[2] ?? "").trim(),
      currency: (row[3] ?? "").trim(),
    }));
}

export interface RefreshResult {
  requested: number;
  written: number;
  skippedSameDay: number;
  /** Tickers with no usable price. */
  failed: string[];
}

/**
 * Full round trip: write the ticker block, read it back, and persist one
 * price_quote per ticker for `today`. A ticker that already has a quote for
 * today is skipped, so refreshing five times in an afternoon does not create
 * five rows.
 */
export async function refreshQuotes(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  today: string,
): Promise<RefreshResult> {
  const wanted = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length === 0) {
    return { requested: 0, written: 0, skippedSameDay: 0, failed: [] };
  }

  await writeQuoteTickers(clients, spreadsheetId, wanted, today);
  const rows = await readQuoteRows(clients, spreadsheetId);
  const byTicker = new Map(rows.map((r) => [r.ticker, r]));

  const existing = await repositories.price_quote.list();
  const alreadyToday = new Set(
    existing.filter((q) => q.quoteDate === today).map((q) => q.ticker),
  );

  let written = 0;
  let skippedSameDay = 0;
  const failed: string[] = [];

  for (const ticker of wanted) {
    if (alreadyToday.has(ticker)) {
      skippedSameDay += 1;
      continue;
    }
    const row = byTicker.get(ticker);
    if (!row || row.priceCents === null) {
      failed.push(ticker);
      continue;
    }
    await createEntity<PriceQuote>("price_quote", {
      ticker,
      quoteDate: today,
      priceCents: row.priceCents,
      source: "googlefinance",
    });
    written += 1;
  }

  log.info("Refreshed quotes", { requested: wanted.length, written, skippedSameDay, failed });
  return { requested: wanted.length, written, skippedSameDay, failed };
}
