import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Provide a fake IndexedDB implementation for tests that touch Dexie.
import "fake-indexeddb/auto";

afterEach(() => {
  cleanup();
});
