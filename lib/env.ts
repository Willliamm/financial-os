/**
 * Public environment variables. These are safe to expose in the browser.
 * Never put secrets here.
 */

export const env = {
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Financial OS",
  defaultSchemaVersion: process.env.NEXT_PUBLIC_DEFAULT_SCHEMA_VERSION ?? "3",
  /**
   * When true (the default until a real Google client id is configured), the
   * app runs against in-memory mock Google clients so it is fully usable
   * offline and without OAuth.
   */
  useMockGoogle:
    !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_USE_MOCK_GOOGLE === "true",
} as const;
