/** Application-wide constants. */

export const APP_NAME = "Financial OS";

/** Schema version this build of the app understands. */
export const APP_SCHEMA_VERSION = 3;

/** Default workbook name created in the user's Google Drive. */
export const DEFAULT_WORKBOOK_NAME = "Financial OS - Personal Workbook";

export const DEFAULT_CURRENCY = "USD" as const;

/** Soft-lock time to live, in seconds. */
export const LOCK_TTL_SECONDS = 120;

/** Heartbeat interval to renew a held lock, in milliseconds. */
export const LOCK_HEARTBEAT_MS = 30_000;

/** Minimum Google OAuth scopes required by the app. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

/** App properties stamped on the workbook file in Drive. */
export const WORKBOOK_APP_PROPERTIES = {
  app: "financial-os",
  workbookType: "personal-finance",
  schemaVersion: String(APP_SCHEMA_VERSION),
} as const;

/** Periodic auto-sync interval, in milliseconds. */
export const AUTO_SYNC_INTERVAL_MS = 60_000;

/** Maximum number of sync retry attempts before marking an item failed. */
export const MAX_SYNC_ATTEMPTS = 5;
