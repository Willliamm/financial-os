import { env } from "@/lib/env";
import type { GoogleClients } from "./google-api-types";
import { createMockGoogleClients } from "./mocks/mock-clients";
import { createRealGoogleClients } from "./real-clients";

let clients: GoogleClients | null = null;

/**
 * Singleton Google clients. Uses fully in-memory mocks unless a real
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured, so the app works offline and
 * without OAuth out of the box.
 */
export function getGoogleClients(): GoogleClients {
  if (!clients) {
    clients = env.useMockGoogle
      ? createMockGoogleClients()
      : createRealGoogleClients();
  }
  return clients;
}

export function isUsingMockGoogle(): boolean {
  return env.useMockGoogle;
}

export * from "./google-api-types";
