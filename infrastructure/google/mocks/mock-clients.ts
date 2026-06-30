import { DEFAULT_WORKBOOK_NAME } from "@/lib/constants";
import { newId } from "@/lib/ids";
import type {
  AppendResult,
  AuthClient,
  DriveClient,
  GoogleClients,
  GoogleUser,
  SheetDefinition,
  SheetValues,
  SheetsClient,
  WorkbookRef,
} from "../google-api-types";
import { getMockBackend } from "./mock-backend";

const MOCK_USER: GoogleUser = {
  sub: "mock-user-001",
  email: "you@financial-os.local",
  name: "Demo User",
};

export class MockAuthClient implements AuthClient {
  private token: string | null = null;
  private user: GoogleUser | null = null;

  async signIn(): Promise<GoogleUser> {
    // Simulate a short network round-trip.
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

  async getValues(_spreadsheetId: string, range: string): Promise<SheetValues> {
    await delay(40);
    const sheetName = range.split("!")[0].replace(/^'|'$/g, "");
    return getMockBackend().getSheet(sheetName);
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
  ): Promise<void> {
    await delay(70);
    // range like "sheet!A5" — write each provided row starting at that row.
    const [sheetPart, cellPart] = range.split("!");
    const sheetName = sheetPart.replace(/^'|'$/g, "");
    const startRow = parseRowFromA1(cellPart);
    const backend = getMockBackend();
    values.forEach((row, i) => {
      backend.setRow(sheetName, startRow + i, row);
    });
  }
}

function parseRowFromA1(cell: string): number {
  const match = cell?.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 1;
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
