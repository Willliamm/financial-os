"use client";

import { create } from "zustand";
import type { GoogleUser } from "@/infrastructure/google/google-api-types";
import { createLogger } from "@/lib/logger";

// Google clients are imported lazily inside the actions so that the login page
// (which only imports this store) does not bundle the Dexie/sync/Google layer.

const log = createLogger("auth-store");

export type AuthStatus = "signed_out" | "signing_in" | "signed_in" | "error";

interface AuthState {
  user: GoogleUser | null;
  status: AuthStatus;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "signed_out",
  error: null,

  async signIn() {
    set({ status: "signing_in", error: null });
    try {
      const { getGoogleClients } = await import("@/infrastructure/google");
      const user = await getGoogleClients().auth.signIn();
      set({ user, status: "signed_in" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("sign in failed", message);
      set({ status: "error", error: message });
    }
  },

  async signOut() {
    const { getGoogleClients } = await import("@/infrastructure/google");
    await getGoogleClients().auth.signOut();
    set({ user: null, status: "signed_out", error: null });
  },
}));
