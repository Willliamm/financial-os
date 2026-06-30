import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LockManager,
  InMemoryLockStore,
  type LockOwner,
} from "@/infrastructure/sync/lock-manager";
import { setNowProvider } from "@/infrastructure/dates/date-utils";

const owner1: LockOwner = {
  userId: "u1",
  email: "alice@x.com",
  name: "Alice",
  sessionId: "s1",
};
const owner2: LockOwner = {
  userId: "u2",
  email: "bob@x.com",
  name: "Bob",
  sessionId: "s2",
};

const RESOURCE_TYPE = "property";
const RESOURCE_ID = "p1";
const RESOURCE_KEY = `${RESOURCE_TYPE}:${RESOURCE_ID}`;
const TTL_SECONDS = 120;

let manager: LockManager;
let currentMs: number;

beforeEach(() => {
  currentMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  setNowProvider(() => new Date(currentMs));
  manager = new LockManager(new InMemoryLockStore(), TTL_SECONDS);
});

afterEach(() => {
  setNowProvider(() => new Date());
});

describe("LockManager", () => {
  it("acquires a free resource as owner", async () => {
    const result = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    expect(result.acquired).toBe(true);
    expect(result.mode).toBe("owner");
  });

  it("renews for the same session (still owner)", async () => {
    await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    const again = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    expect(again.acquired).toBe(true);
    expect(again.mode).toBe("owner");
  });

  it("gives a different session read-only while the lock is active", async () => {
    await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    const other = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner2);
    expect(other.acquired).toBe(false);
    expect(other.mode).toBe("readonly");
    expect(other.heldBy).toEqual({ name: "Alice", email: "alice@x.com" });
  });

  it("lets a different session acquire after the TTL expires", async () => {
    await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    // Move past the 120s TTL.
    currentMs += (TTL_SECONDS + 1) * 1000;
    const other = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner2);
    expect(other.acquired).toBe(true);
    expect(other.mode).toBe("owner");
  });

  it("heartbeats with the right token and rejects a wrong token", async () => {
    const result = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    const token = result.lock.lockToken;
    const before = result.lock.expiresAt;

    // Advance time, then heartbeat to extend the expiry.
    currentMs += 30 * 1000;
    expect(await manager.heartbeat(RESOURCE_KEY, token)).toBe(true);

    const after = await manager.get(RESOURCE_KEY);
    expect(after).toBeDefined();
    expect(new Date(after!.expiresAt).getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    );

    expect(await manager.heartbeat(RESOURCE_KEY, "wrong-token")).toBe(false);
  });

  it("lets another session acquire after release", async () => {
    const result = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner1);
    await manager.release(RESOURCE_KEY, result.lock.lockToken);

    const other = await manager.acquire(RESOURCE_TYPE, RESOURCE_ID, owner2);
    expect(other.acquired).toBe(true);
    expect(other.mode).toBe("owner");
  });
});
