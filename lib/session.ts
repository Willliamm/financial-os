import { newSessionId } from "./ids";

/**
 * A unique id for this browser tab/load. Used as the lock owner session so two
 * tabs of the same user are treated as different editing sessions.
 */
let sessionId: string | null = null;

export function getSessionId(): string {
  if (!sessionId) sessionId = newSessionId();
  return sessionId;
}
