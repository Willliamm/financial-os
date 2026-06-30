/** A 2D grid of cell values as returned by the Sheets API. */
export type SheetValues = string[][];

export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export interface WorkbookRef {
  id: string;
  name: string;
}

export interface SheetDefinition {
  name: string;
  headers: string[];
}

export interface AppendResult {
  updatedRange: string;
  rowsAdded: number;
  /** 1-based row number of the first appended row, when known. */
  startRow?: number;
}

/** Abstraction over Google Identity Services sign-in. */
export interface AuthClient {
  signIn(): Promise<GoogleUser>;
  signOut(): Promise<void>;
  getAccessToken(): string | null;
  currentUser(): GoogleUser | null;
  isSignedIn(): boolean;
}

/** Abstraction over Google Drive (workbook discovery + creation). */
export interface DriveClient {
  findWorkbook(): Promise<WorkbookRef | null>;
  createWorkbook(name: string): Promise<WorkbookRef>;
}

/** Abstraction over the Google Sheets API used by the Sync Engine. */
export interface SheetsClient {
  /** Ensure every sheet exists with its header row. */
  ensureSheets(spreadsheetId: string, sheets: SheetDefinition[]): Promise<void>;
  listSheetTitles(spreadsheetId: string): Promise<string[]>;
  getValues(spreadsheetId: string, range: string): Promise<SheetValues>;
  batchGetValues(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<Record<string, SheetValues>>;
  appendRows(
    spreadsheetId: string,
    sheetName: string,
    rows: SheetValues,
  ): Promise<AppendResult>;
  updateRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
  ): Promise<void>;
}

export interface GoogleClients {
  auth: AuthClient;
  drive: DriveClient;
  sheets: SheetsClient;
}
