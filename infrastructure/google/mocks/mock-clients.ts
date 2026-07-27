import { DEFAULT_WORKBOOK_NAME } from "@/lib/constants";
import { newId } from "@/lib/ids";
import type {
  AppendResult,
  AuthClient,
  DriveClient,
  GetValuesOptions,
  GoogleClients,
  GoogleUser,
  SheetDefinition,
  SheetValues,
  SheetsClient,
  SignInOptions,
  UpdateRangeOptions,
  WorkbookRef,
} from "../google-api-types";
import {
  evaluateMockFormula,
  getMockBackend,
  MOCK_FORMULA_PREFIX,
} from "./mock-backend";

const MOCK_USER: GoogleUser = {
  sub: "mock-user-001",
  email: "you@financial-os.local",
  name: "Demo User",
};

export class MockAuthClient implements AuthClient {
  private token: string | null = null;
  private user: GoogleUser | null = null;

  async signIn(_options?: SignInOptions): Promise<GoogleUser> {
    // Simulate a short network round-trip. The mock has no real Google session,
    // so silent restore always "succeeds" — options are accepted but ignored.
    await delay(150);
    this.token = `mock-access-token-${newId()}`;
    this.user = MOCK_USER;
    return this.user;
  }

  async signOut(): Promise<void> {
    this.token = null;
    this.user = null;
  }

  getAccessToken(): string | null {
    return this.token;
  }

  currentUser(): GoogleUser | null {
    return this.user;
  }

  isSignedIn(): boolean {
    return this.user !== null;
  }
}

export class MockDriveClient implements DriveClient {
  async findWorkbook(): Promise<WorkbookRef | null> {
    await delay(120);
    return getMockBackend().getWorkbook();
  }

  async createWorkbook(name: string): Promise<WorkbookRef> {
    await delay(180);
    const ref: WorkbookRef = {
      id: `mock-spreadsheet-${newId()}`,
      name: name || DEFAULT_WORKBOOK_NAME,
    };
    getMockBackend().setWorkbook(ref);
    return ref;
  }
}

export class MockSheetsClient implements SheetsClient {
  async ensureSheets(
    _spreadsheetId: string,
    sheets: SheetDefinition[],
  ): Promise<void> {
    await delay(100);
    const backend = getMockBackend();
    for (const sheet of sheets) {
      backend.ensureSheet(sheet.name, sheet.headers);
    }
  }

  async listSheetTitles(_spreadsheetId: string): Promise<string[]> {
    await delay(40);
    return getMockBackend().listTitles();
  }

  async getValues(
    _spreadsheetId: string,
    range: string,
    options: GetValuesOptions = {},
  ): Promise<SheetValues> {
    await delay(40);
    const backend = getMockBackend();
    const { sheetName, startRow, endRow, startCol, endCol } = parseRange(range);
    const sheet = backend.getSheet(sheetName);
    const today = backend.today();
    const evaluateRow = (row: string[]): string[] =>
      row.map((cell) => resolveCell(cell, row, options, today));

    if (startRow === null) {
      // Column-only range (e.g. "A:ZZ", used by sync-engine/migrations):
      // every existing caller wants the whole sheet, header included.
      return sheet.map(evaluateRow);
    }

    const rows = sheet.slice(startRow - 1, endRow ?? startRow);
    return rows.map((row) => evaluateRow(row).slice(startCol, endCol + 1));
  }

  async batchGetValues(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<Record<string, SheetValues>> {
    await delay(80);
    const out: Record<string, SheetValues> = {};
    for (const range of ranges) {
      out[range] = await this.getValues(spreadsheetId, range);
    }
    return out;
  }

  async appendRows(
    _spreadsheetId: string,
    sheetName: string,
    rows: SheetValues,
  ): Promise<AppendResult> {
    await delay(90);
    const startRow = getMockBackend().appendRows(sheetName, rows);
    return {
      updatedRange: `${sheetName}!A${startRow}`,
      rowsAdded: rows.length,
      startRow,
    };
  }

  async updateRange(
    _spreadsheetId: string,
    range: string,
    values: SheetValues,
    options: UpdateRangeOptions = {},
  ): Promise<void> {
    await delay(70);
    // range like "sheet!A5" — write each provided row starting at that row.
    const [sheetPart, cellPart] = range.split("!");
    const sheetName = sheetPart.replace(/^'|'$/g, "");
    const startRow = parseRowFromA1(cellPart);
    const backend = getMockBackend();
    // A formula only evaluates on read when the caller asked for
    // valueInputOption=USER_ENTERED (options.formulas). Cells written without
    // it keep their literal "=..." text, exactly like the real API —
    // verified: a RAW write of a GOOGLEFINANCE formula came back unevaluated.
    const marked = options.formulas
      ? values.map((row) =>
          row.map((cell) =>
            typeof cell === "string" && cell.startsWith("=")
              ? MOCK_FORMULA_PREFIX + cell
              : cell,
          ),
        )
      : values;
    marked.forEach((row, i) => {
      backend.setRow(sheetName, startRow + i, row);
    });
  }
}

function parseRowFromA1(cell: string): number {
  const match = cell?.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 1;
}

/** Convert an A1 column reference (e.g. "A", "B", "AA") to a 0-based index. */
function columnIndex(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

/** Parse a single A1 cell ref like "B2" into its column index and row number. */
function parseCellRef(ref: string): { col: number; row: number | null } {
  const match = /^([A-Za-z]+)(\d+)?$/.exec(ref.trim());
  if (!match) return { col: 0, row: null };
  return {
    col: columnIndex(match[1].toUpperCase()),
    row: match[2] ? Number.parseInt(match[2], 10) : null,
  };
}

interface ParsedRange {
  sheetName: string;
  /** 1-based, inclusive. Null for a column-only range like "A:ZZ". */
  startRow: number | null;
  endRow: number | null;
  /** 0-based, inclusive. */
  startCol: number;
  endCol: number;
}

/**
 * Parse an A1-style range like "Sheet!A2:B2" into a sheet name plus row/col
 * bounds. Column-only refs with no row digits (e.g. "Sheet!A:ZZ", used by
 * sync-engine and migrations before this task) yield `startRow: null`, which
 * callers treat as "return the whole sheet" — preserving the mock's original
 * behavior for every pre-existing call site.
 */
function parseRange(range: string): ParsedRange {
  const [sheetPart, cellPart] = range.split("!");
  const sheetName = sheetPart.replace(/^'|'$/g, "");
  if (!cellPart) {
    return { sheetName, startRow: null, endRow: null, startCol: 0, endCol: 0 };
  }
  const [startRef, endRef] = cellPart.split(":");
  const start = parseCellRef(startRef);
  const end = endRef ? parseCellRef(endRef) : start;
  return {
    sheetName,
    startRow: start.row,
    endRow: end.row ?? start.row,
    startCol: start.col,
    endCol: end.col,
  };
}

/** Resolve one cell for a `getValues` read: decode a marked formula cell. */
function resolveCell(
  cell: string,
  row: string[],
  options: GetValuesOptions,
  today: string,
): string {
  if (!cell.startsWith(MOCK_FORMULA_PREFIX)) return cell;
  const formula = cell.slice(MOCK_FORMULA_PREFIX.length);
  if (!options.unformatted) return formula;
  return evaluateMockFormula(
    formula,
    // Only A-column refs on the same row are supported; that is all the
    // quote service writes.
    () => String(row[0] ?? "").replace(MOCK_FORMULA_PREFIX, ""),
    today,
  );
}

/**
 * Simulate a tiny async round-trip. The per-call latency is capped low because
 * this is a local-first demo backend — large fake delays only made the
 * bootstrap (which issues ~12 reads + writes) feel sluggish for no benefit.
 * Real Google API latency applies only in the real client.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 4)));
}

export function createMockGoogleClients(): GoogleClients {
  return {
    auth: new MockAuthClient(),
    drive: new MockDriveClient(),
    sheets: new MockSheetsClient(),
  };
}
