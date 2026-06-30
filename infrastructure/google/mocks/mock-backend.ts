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

  constructor() {
    this.store = loadFromStorage();
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
    this.persist();
  }
}

let backend: MockBackend | null = null;

export function getMockBackend(): MockBackend {
  if (!backend) backend = new MockBackend();
  return backend;
}

export type { MockBackend };
