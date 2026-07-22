"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { I18nextProvider } from "react-i18next";
import i18n, { detectInitialLocale } from "@/lib/i18n/config";
import { setMoneyLocale } from "@/infrastructure/money/money";
import { setDateLocale } from "@/infrastructure/dates/date-utils";
import { useSyncStore } from "@/lib/stores/sync-store";
import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * App-wide, login-included providers. Kept deliberately light: only the theme
 * provider (needs to wrap everything to avoid a flash), the online/offline
 * listener, and service-worker registration. Heavier providers that only the
 * authenticated app needs (React Query, tooltips, toasts) live in
 * `components/app-providers.tsx` under the `(app)` route group, so the login
 * page never downloads them.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const setOnline = useSyncStore((s) => s.setOnline);

  // Restore a Google session on load (silent token refresh). Runs once; reads
  // the action off the store so this effect never re-fires on status changes.
  useEffect(() => {
    void useAuthStore.getState().restore();
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [setOnline]);

  // Apply the user's saved/detected language AFTER mount. i18n initializes with
  // the default locale so the prerendered HTML matches the first client render;
  // switching here (post-hydration) avoids a hydration mismatch and re-renders
  // the tree into the real language.
  useEffect(() => {
    const detected = detectInitialLocale();
    if (detected !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(detected);
    }
  }, []);

  // Keep money/date formatting and <html lang> in sync with the active language.
  useEffect(() => {
    const apply = (lng: string) => {
      setMoneyLocale(lng);
      setDateLocale(lng);
      if (typeof document !== "undefined") {
        document.documentElement.lang = lng;
      }
    };
    apply(i18n.resolvedLanguage || "en-US");
    i18n.on("languageChanged", apply);
    return () => {
      i18n.off("languageChanged", apply);
    };
  }, []);

  // Register the service worker (production only) so repeat loads are served
  // from the cache and the app works fully offline.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
      .catch(() => {
        /* registration is best-effort; the app works without it */
      });
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </I18nextProvider>
  );
}
