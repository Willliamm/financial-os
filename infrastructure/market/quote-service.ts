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
import { normalizeTicker } from "@/domain/value-objects/ticker";
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
 *
 * `updateRange` only touches the cells it is given — it does not clear rows
 * beyond what is written. So if the portfolio shrinks from 5 tickers to 3,
 * writing only 3 rows would leave rows 5 and 6 holding their old
 * GOOGLEFINANCE formulas, quietly burning quota forever. To actually remove a
 * dropped ticker's formulas, this first reads how many data rows currently
 * exist, then pads the written block with blank rows so it fully overwrites
 * whatever was there before. `readQuoteRows` already skips rows with a blank
 * ticker cell, so the padding rows are invisible on read.
 */
export async function writeQuoteTickers(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  now: string,
): Promise<void> {
  if (tickers.length === 0) return;

  const existing = await clients.sheets.getValues(spreadsheetId, `${QUOTE_SHEET}!A:E`);
  const existingDataRows = Math.max(0, existing.length - 1);

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
  while (rows.length < existingDataRows) {
    rows.push(["", "", "", "", ""]);
  }

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
      ticker: normalizeTicker(row[0] ?? ""),
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

export interface RefreshQuotesOptions {
  /** How long to wait between reads while GOOGLEFINANCE settles. */
  settleMs?: number;
  /** Total number of reads attempted (the first read plus retries). */
  maxReads?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full round trip: write the ticker block, read it back, and persist one
 * price_quote per ticker for `today`. A ticker that already has a quote for
 * today is skipped, so refreshing five times in an afternoon does not create
 * five rows.
 *
 * GOOGLEFINANCE is an external-data function: immediately after the formula
 * is written, Sheets has not fetched a value yet and the cell reads
 * "Loading...". A single write-then-read would convert that transient state
 * straight into a reported failure, so this reads up to `maxReads` times,
 * waiting `settleMs` between reads, and stops as soon as every requested
 * ticker has a non-null price.
 */
export async function refreshQuotes(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  today: string,
  options: RefreshQuotesOptions = {},
): Promise<RefreshResult> {
  const { settleMs = 1500, maxReads = 3 } = options;
  const wanted = [...new Set(tickers.map((t) => normalizeTicker(t)).filter(Boolean))];
  if (wanted.length === 0) {
    return { requested: 0, written: 0, skippedSameDay: 0, failed: [] };
  }

  await writeQuoteTickers(clients, spreadsheetId, wanted, today);

  let rows = await readQuoteRows(clients, spreadsheetId);
  for (let read = 1; read < Math.max(1, maxReads); read++) {
    const byTicker = new Map(rows.map((r) => [r.ticker, r]));
    const stillLoading = wanted.some((ticker) => byTicker.get(ticker)?.priceCents == null);
    if (!stillLoading) break;
    if (settleMs > 0) await sleep(settleMs);
    rows = await readQuoteRows(clients, spreadsheetId);
  }
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
    // This project's rule is that money stays USD. GOOGLEFINANCE can return a
    // ticker priced in another currency (e.g. GBX for a London listing, BRL
    // for a B3 listing); storing that number as USD cents would silently
    // corrupt market value, net worth, allocation and XIRR, so treat it the
    // same as any other unusable row.
    if (row.currency !== "" && row.currency.toUpperCase() !== "USD") {
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
