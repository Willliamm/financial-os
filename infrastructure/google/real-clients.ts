import {
  DRIVE_FOLDER_NAME,
  FOLDER_APP_PROPERTIES,
  GOOGLE_SCOPES,
  WORKBOOK_APP_PROPERTIES,
} from "@/lib/constants";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type {
  AppendResult,
  AuthClient,
  DriveClient,
  GoogleClients,
  GoogleUser,
  SheetDefinition,
  SheetValues,
  SheetsClient,
  SignInOptions,
  WorkbookRef,
} from "./google-api-types";

const log = createLogger("google");

/** Minimal shape of the Google Identity Services token client we rely on. */
interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}
/** Non-OAuth failures (e.g. the silent request needed interaction). */
interface TokenError {
  type?: string;
  message?: string;
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: TokenError) => void;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

/** localStorage key holding the current access token and its expiry. */
const TOKEN_KEY = "fos_gapi_token";
/** Refresh a little early so a request never fires with a just-expired token. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

interface StoredToken {
  token: string;
  expiresAt: number;
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gis load")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity"));
    document.head.appendChild(script);
  });
}

export class GoogleAuthClient implements AuthClient {
  private token: string | null = null;
  private user: GoogleUser | null = null;
  private tokenClient: TokenClient | null = null;
  /** The in-flight token request, so callbacks resolve the right promise. */
  private pending: {
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  } | null = null;

  /**
   * Lazily build (once) the GIS token client. The callback/error_callback are
   * wired to whatever request is currently pending so a single client instance
   * serves every requestAccessToken call.
   */
  private async getTokenClient(): Promise<TokenClient> {
    await loadGisScript();
    const google = window.google;
    if (!google) throw new Error("Google Identity Services unavailable");
    if (!this.tokenClient) {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: env.googleClientId,
        scope: GOOGLE_SCOPES.join(" "),
        callback: (resp) => {
          const p = this.pending;
          this.pending = null;
          if (!p) return;
          if (resp.error) p.reject(new Error(resp.error));
          else {
            this.storeToken(resp.access_token, resp.expires_in);
            p.resolve(resp.access_token);
          }
        },
        error_callback: (err) => {
          const p = this.pending;
          this.pending = null;
          p?.reject(new Error(err.type || err.message || "oauth_error"));
        },
      });
    }
    return this.tokenClient;
  }

  /** Request an access token with the given prompt behavior. */
  private async requestToken(prompt: string): Promise<string> {
    const client = await this.getTokenClient();
    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
      client.requestAccessToken({ prompt });
    });
  }

  async signIn(options?: SignInOptions): Promise<GoogleUser> {
    // "none" = silent, never shows UI (fails if interaction is needed).
    // "select_account" = force the account chooser.
    // "" = default: consent only on the first grant, silent afterwards.
    const prompt = options?.silent
      ? "none"
      : options?.selectAccount
        ? "select_account"
        : "";
    const token = await this.requestToken(prompt);
    this.token = token;
    this.user = await this.fetchUserInfo(token);
    return this.user;
  }

  private async fetchUserInfo(token: string): Promise<GoogleUser> {
    const resp = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) {
      return { sub: "google-user", email: "", name: "Google User" };
    }
    const data = (await resp.json()) as {
      sub: string;
      email: string;
      name: string;
      picture?: string;
    };
    return data;
  }

  async signOut(): Promise<void> {
    this.token = null;
    this.user = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    }
  }
  getAccessToken(): string | null {
    this.loadStoredToken();
    return this.token;
  }
  currentUser(): GoogleUser | null {
    return this.user;
  }
  isSignedIn(): boolean {
    return this.user !== null;
  }
  /** True if a non-expired access token is available (memory or storage). */
  hasValidToken(): boolean {
    this.loadStoredToken();
    return this.token !== null;
  }

  /** Persist the access token with an absolute expiry timestamp. */
  private storeToken(token: string, expiresIn: number): void {
    this.token = token;
    if (typeof window === "undefined") return;
    try {
      const record: StoredToken = {
        token,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      window.localStorage.setItem(TOKEN_KEY, JSON.stringify(record));
    } catch {
      /* storage unavailable — token stays in memory only */
    }
  }

  /** Rehydrate a still-valid token from storage into memory (drop if expired). */
  private loadStoredToken(): void {
    if (this.token || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(TOKEN_KEY);
      if (!raw) return;
      const record = JSON.parse(raw) as StoredToken;
      if (record.expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS) {
        this.token = record.token;
      } else {
        window.localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      /* ignore malformed storage */
    }
  }
}

function authHeader(auth: AuthClient): Record<string, string> {
  const token = auth.getAccessToken();
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleDriveClient implements DriveClient {
  constructor(private readonly auth: AuthClient) {}

  async findWorkbook(): Promise<WorkbookRef | null> {
    const q = [
      "mimeType='application/vnd.google-apps.spreadsheet'",
      `appProperties has { key='app' and value='${WORKBOOK_APP_PROPERTIES.app}' }`,
      "trashed=false",
    ].join(" and ");
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
    const resp = await fetch(url, { headers: authHeader(this.auth) });
    if (!resp.ok) throw new Error(`Drive list failed: ${resp.status}`);
    const data = (await resp.json()) as { files: { id: string; name: string }[] };
    const file = data.files?.[0];
    return file ? { id: file.id, name: file.name } : null;
  }

  async createWorkbook(name: string): Promise<WorkbookRef> {
    const folderId = await this.findOrCreateFolder();

    const createResp = await fetch(SHEETS_API, {
      method: "POST",
      headers: authHeader(this.auth),
      body: JSON.stringify({ properties: { title: name } }),
    });
    if (!createResp.ok) throw new Error(`Sheets create failed: ${createResp.status}`);
    const sheet = (await createResp.json()) as {
      spreadsheetId: string;
    };

    // Move the new spreadsheet into the dedicated folder and stamp app
    // properties so we can find it later. A spreadsheet created via the Sheets
    // API lands in the Drive root, so we swap its parent from root to the
    // folder in the same PATCH.
    await fetch(
      `${DRIVE_API}/files/${sheet.spreadsheetId}?addParents=${folderId}&removeParents=root`,
      {
        method: "PATCH",
        headers: authHeader(this.auth),
        body: JSON.stringify({ appProperties: WORKBOOK_APP_PROPERTIES }),
      },
    );

    return { id: sheet.spreadsheetId, name };
  }

  /**
   * Find the app's dedicated Drive folder, creating it if absent. Returns the
   * folder id. The folder is matched by its stamped app properties (robust to
   * a manual rename) rather than by name. The `drive.file` scope only sees
   * files the app itself created, so this reuses the same folder across
   * sessions without ever touching the rest of the user's Drive.
   */
  private async findOrCreateFolder(): Promise<string> {
    const q = [
      "mimeType='application/vnd.google-apps.folder'",
      `appProperties has { key='app' and value='${FOLDER_APP_PROPERTIES.app}' }`,
      `appProperties has { key='driveItem' and value='${FOLDER_APP_PROPERTIES.driveItem}' }`,
      "trashed=false",
    ].join(" and ");
    const listUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`;
    const listResp = await fetch(listUrl, { headers: authHeader(this.auth) });
    if (!listResp.ok) throw new Error(`Drive folder list failed: ${listResp.status}`);
    const listData = (await listResp.json()) as { files: { id: string }[] };
    const existing = listData.files?.[0];
    if (existing) return existing.id;

    const createResp = await fetch(`${DRIVE_API}/files`, {
      method: "POST",
      headers: authHeader(this.auth),
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        appProperties: FOLDER_APP_PROPERTIES,
      }),
    });
    if (!createResp.ok) throw new Error(`Drive folder create failed: ${createResp.status}`);
    const folder = (await createResp.json()) as { id: string };
    return folder.id;
  }
}

export class GoogleSheetsClient implements SheetsClient {
  constructor(private readonly auth: AuthClient) {}

  async listSheetTitles(spreadsheetId: string): Promise<string[]> {
    const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`;
    const resp = await fetch(url, { headers: authHeader(this.auth) });
    if (!resp.ok) throw new Error(`Get spreadsheet failed: ${resp.status}`);
    const data = (await resp.json()) as {
      sheets: { properties: { title: string } }[];
    };
    return data.sheets.map((s) => s.properties.title);
  }

  async ensureSheets(
    spreadsheetId: string,
    sheets: SheetDefinition[],
  ): Promise<void> {
    const existing = await this.listSheetTitles(spreadsheetId);
    const missing = sheets.filter((s) => !existing.includes(s.name));
    if (missing.length > 0) {
      await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: authHeader(this.auth),
        body: JSON.stringify({
          requests: missing.map((s) => ({
            addSheet: { properties: { title: s.name } },
          })),
        }),
      });
    }
    // Write header rows for every sheet (idempotent).
    for (const sheet of sheets) {
      await this.updateRange(spreadsheetId, `${sheet.name}!A1`, [sheet.headers]);
    }
  }

  async getValues(spreadsheetId: string, range: string): Promise<SheetValues> {
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const resp = await fetch(url, { headers: authHeader(this.auth) });
    if (!resp.ok) {
      if (resp.status === 400) return [];
      throw new Error(`Get values failed: ${resp.status}`);
    }
    const data = (await resp.json()) as { values?: SheetValues };
    return data.values ?? [];
  }

  async batchGetValues(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<Record<string, SheetValues>> {
    const params = ranges
      .map((r) => `ranges=${encodeURIComponent(r)}`)
      .join("&");
    const url = `${SHEETS_API}/${spreadsheetId}/values:batchGet?${params}`;
    const resp = await fetch(url, { headers: authHeader(this.auth) });
    if (!resp.ok) throw new Error(`Batch get failed: ${resp.status}`);
    const data = (await resp.json()) as {
      valueRanges?: { range: string; values?: SheetValues }[];
    };
    const out: Record<string, SheetValues> = {};
    (data.valueRanges ?? []).forEach((vr, i) => {
      out[ranges[i]] = vr.values ?? [];
    });
    return out;
  }

  async appendRows(
    spreadsheetId: string,
    sheetName: string,
    rows: SheetValues,
  ): Promise<AppendResult> {
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(
      `${sheetName}!A1`,
    )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const resp = await fetch(url, {
      method: "POST",
      headers: authHeader(this.auth),
      body: JSON.stringify({ values: rows }),
    });
    if (!resp.ok) throw new Error(`Append failed: ${resp.status}`);
    const data = (await resp.json()) as {
      updates?: { updatedRange?: string };
    };
    const updatedRange = data.updates?.updatedRange ?? `${sheetName}!A`;
    const match = updatedRange.match(/!\D+(\d+)/);
    const startRow = match ? Number(match[1]) : undefined;
    return { updatedRange, rowsAdded: rows.length, startRow };
  }

  async updateRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
  ): Promise<void> {
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=RAW`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: authHeader(this.auth),
      body: JSON.stringify({ values }),
    });
    if (!resp.ok) throw new Error(`Update failed: ${resp.status}`);
  }
}

export function createRealGoogleClients(): GoogleClients {
  log.info("Using real Google clients");
  const auth = new GoogleAuthClient();
  return {
    auth,
    drive: new GoogleDriveClient(auth),
    sheets: new GoogleSheetsClient(auth),
  };
}
