import type { SheetValues, WorkbookRef } from "../google-api-types";

/**
 * In-memory model of a Google Sheets workbook used by the mock clients.
 * It persists to localStorage so the simulated "remote" survives page
 * reloads, which makes the sync flow demonstrable without real Google APIs.
 */
interface MockStoreShape {
  workbook: WorkbookRef | null;
  sheets: Record<string, SheetValues>;
}

const STORAGE_KEY = "financial_os_mock_workbook_v1";

/**
 * Fixed "today" for the mock backend. Prices derive from this instead of
 * `new Date()` so demo data — and every test — is fully deterministic.
 */
const DEFAULT_MOCK_TODAY = "2026-07-26";

function loadFromStorage(): MockStoreShape {
  if (typeof window === "undefined") {
    return { workbook: null, sheets: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { workbook: null, sheets: {} };
    const parsed = JSON.parse(raw) as MockStoreShape;
    return {
      workbook: parsed.workbook ?? null,
      sheets: parsed.sheets ?? {},
    };
  } catch {
    return { workbook: null, sheets: {} };
  }
}

class MockBackend {
  private store: MockStoreShape;
  private todayValue: string = DEFAULT_MOCK_TODAY;

  constructor() {
    this.store = loadFromStorage();
  }

  /** The mock's fixed "current date", in "YYYY-MM-DD" form. */
  today(): string {
    return this.todayValue;
  }

  /** Override "today" — for tests that need to move the mock clock. */
  setToday(isoDate: string): void {
    this.todayValue = isoDate;
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
    } catch {
      // ignore quota errors in the mock
    }
  }

  reload(): void {
    this.store = loadFromStorage();
  }

  getWorkbook(): WorkbookRef | null {
    return this.store.workbook;
  }

  setWorkbook(ref: WorkbookRef): void {
    this.store.workbook = ref;
    this.persist();
  }

  ensureSheet(name: string, headers: string[]): void {
    if (!this.store.sheets[name]) {
      this.store.sheets[name] = [headers.slice()];
      this.persist();
    } else if (this.store.sheets[name].length === 0) {
      this.store.sheets[name] = [headers.slice()];
      this.persist();
    }
  }

  listTitles(): string[] {
    return Object.keys(this.store.sheets);
  }

  getSheet(name: string): SheetValues {
    return this.store.sheets[name] ?? [];
  }

  setSheet(name: string, values: SheetValues): void {
    this.store.sheets[name] = values;
    this.persist();
  }

  appendRows(name: string, rows: SheetValues): number {
    if (!this.store.sheets[name]) this.store.sheets[name] = [];
    const startRow = this.store.sheets[name].length + 1;
    this.store.sheets[name].push(...rows.map((r) => r.slice()));
    this.persist();
    return startRow;
  }

  /** Overwrite a single row (1-based index) with new values. */
  setRow(name: string, rowNumber: number, values: string[]): void {
    if (!this.store.sheets[name]) this.store.sheets[name] = [];
    const idx = rowNumber - 1;
    while (this.store.sheets[name].length <= idx) {
      this.store.sheets[name].push([]);
    }
    this.store.sheets[name][idx] = values.slice();
    this.persist();
  }

  resetAll(): void {
    this.store = { workbook: null, sheets: {} };
    this.todayValue = DEFAULT_MOCK_TODAY;
    this.persist();
  }
}

let backend: MockBackend | null = null;

export function getMockBackend(): MockBackend {
  if (!backend) backend = new MockBackend();
  return backend;
}

export type { MockBackend };

/** FNV-1a. Deterministic, so demo prices never depend on Math.random. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Known-ish base prices so the demo looks plausible; anything else is derived. */
const MOCK_BASE_PRICES: Record<string, number> = {
  VOO: 679.14,
  BND: 72.31,
  VTI: 312.4,
  AAPL: 333.02,
};

/**
 * Deterministic pseudo-price for demo mode: a stable base per ticker plus a
 * daily wiggle of up to ±5%, so charts move without any randomness.
 */
export function mockPriceFor(ticker: string, isoDate: string): number {
  const symbol = ticker.trim().toUpperCase();
  const base = MOCK_BASE_PRICES[symbol] ?? 20 + (hashString(symbol) % 480);
  const wiggle = ((hashString(symbol + isoDate) % 1001) - 500) / 10_000;
  return Math.round(base * (1 + wiggle) * 100) / 100;
}

/** Tickers the mock refuses to price, so the error path is demonstrable. */
export function mockTickerIsKnown(ticker: string): boolean {
  return !/^Z{2,}/i.test(ticker.trim());
}

/** Marker prefix for a cell the app wrote with valueInputOption=USER_ENTERED. */
export const MOCK_FORMULA_PREFIX = " formula:";

/**
 * Evaluate a mock GOOGLEFINANCE call. `resolveRef` turns an A-column
 * reference like `A2` into the ticker sitting in that cell.
 */
export function evaluateMockFormula(
  formula: string,
  resolveRef: (ref: string) => string,
  today: string,
): string {
  const match = /^=GOOGLEFINANCE\(\s*([^,)]+)\s*(?:,\s*"([^"]*)"\s*)?\)/i.exec(
    formula.trim(),
  );
  if (!match) return "#ERROR!";

  const rawSymbol = match[1].trim();
  const attribute = (match[2] ?? "price").toLowerCase();
  const ticker = rawSymbol.startsWith('"')
    ? rawSymbol.replace(/"/g, "").trim()
    : resolveRef(rawSymbol);

  const symbol = ticker.replace(/^[A-Z]+:/i, "").toUpperCase();
  if (!symbol) return "#N/A";
  if (!mockTickerIsKnown(symbol)) {
    return `#N/A (When evaluating GOOGLEFINANCE, the query for the symbol: '${symbol}' returned no data.)`;
  }
  if (attribute === "name") return `${symbol} Fund`;
  if (attribute === "currency") return "USD";
  return String(mockPriceFor(symbol, today));
}
