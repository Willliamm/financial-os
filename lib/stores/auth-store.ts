"use client";

import { create } from "zustand";
import type {
  GoogleUser,
  SignInOptions,
} from "@/infrastructure/google/google-api-types";
import { createLogger } from "@/lib/logger";

// Google clients are imported lazily inside the actions so that the login page
// (which only imports this store) does not bundle the Dexie/sync/Google layer.

const log = createLogger("auth-store");

/** localStorage key holding the last signed-in Google profile (no token). */
const PERSIST_KEY = "fos_auth_user";

function loadPersistedUser(): GoogleUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as GoogleUser) : null;
  } catch {
    return null;
  }
}

function persistUser(user: GoogleUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(PERSIST_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* storage may be unavailable (private mode) — non-fatal */
  }
}

/**
 * True when a Google sign-in error just means the user dismissed the flow
 * (closed the popup, denied consent, cancelled). These are not real failures,
 * so we return to the login screen quietly instead of showing an error.
 */
function isUserCancellation(message: string): boolean {
  return /popup_closed|access_denied|user_cancel|abort/i.test(message);
}

export type AuthStatus =
  | "restoring"
  | "signed_out"
  | "signing_in"
  | "signed_in"
  | "error";

interface AuthState {
  user: GoogleUser | null;
  status: AuthStatus;
  error: string | null;
  /** Try to restore a session silently on app load. Call once on mount. */
  restore: () => Promise<void>;
  signIn: (options?: SignInOptions) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Start in "restoring": the app-shell must not bounce to login before the
  // silent restore attempt below has had a chance to run.
  user: null,
  status: "restoring",
  error: null,

  async restore() {
    const remembered = loadPersistedUser();
    if (!remembered) {
      set({ status: "signed_out" });
      return;
    }
    // Show who we remember while we try to resume the session.
    set({ user: remembered, status: "restoring", error: null });
    try {
      const { getGoogleClients } = await import("@/infrastructure/google");
      const auth = getGoogleClients().auth;

      // Real client: resume ONLY from a still-valid persisted access token
      // (tokens last ~1h). No Google round-trip on load — a network sign-in
      // here can pop a window without a user gesture. If the token is gone or
      // expired, fall back to the login card ("Continue as {name}", one click).
      if (auth.hasValidToken) {
        set({
          user: remembered,
          status: auth.hasValidToken() ? "signed_in" : "signed_out",
        });
        return;
      }

      // Mock client (demo mode): no token persistence, but its silent sign-in
      // is instant and reliable, so keep the demo session across refreshes.
      const user = await auth.signIn({ silent: true });
      persistUser(user);
      set({ user, status: "signed_in" });
    } catch (error) {
      // Keep the remembered profile so the login page can offer
      // "Continue as {name}" — a single click, no account re-selection.
      log.info("session restore needs interaction", String(error));
      set({ status: "signed_out" });
    }
  },

  async signIn(options) {
    set({ status: "signing_in", error: null });
    try {
      const { getGoogleClients } = await import("@/infrastructure/google");
      const user = await getGoogleClients().auth.signIn(options);
      persistUser(user);
      set({ user, status: "signed_in" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Closing the popup / denying consent is a cancellation, not an error:
      // return to the login screen quietly (no red message).
      if (isUserCancellation(message)) {
        set({ status: "signed_out", error: null });
        return;
      }
      log.error("sign in failed", message);
      set({ status: "error", error: message });
    }
  },

  async signOut() {
    // End the session (drop the access token) but remember WHO signed in, so
    // the login screen can greet them by name and offer a one-click return —
    // like Gmail keeps your account listed after you log out. Use "Use a
    // different account" to switch, which overwrites the remembered profile.
    const { getGoogleClients } = await import("@/infrastructure/google");
    await getGoogleClients().auth.signOut();
    set({ status: "signed_out", error: null });
  },
}));
