import { v4 as uuidv4 } from "uuid";

/** Generate a new UUID v4 string. */
export function newId(): string {
  return uuidv4();
}

/** Generate a session id used to scope optimistic locks to a browser tab. */
export function newSessionId(): string {
  return `session_${uuidv4()}`;
}

/** Build a lock resource key for an entity, e.g. property:uuid. */
export function resourceKey(resourceType: string, resourceId: string): string {
  return `${resourceType}:${resourceId}`;
}
