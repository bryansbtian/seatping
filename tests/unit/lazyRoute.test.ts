import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, recoverChunkLoad } from "../../src/lib/lazyRoute.js";

function reloadStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("route chunk recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.test/assets/page.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Loading chunk 42 failed.",
    "Unable to preload CSS for /assets/page.css",
  ])("recognizes supported chunk failures: %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it("does not recover ordinary application errors or non-error values", () => {
    const storage = reloadStorage();
    const reload = vi.fn();
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
    expect(recoverChunkLoad(new Error("Invalid booking"), storage, reload, 100_000)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a stale deployment chunk at most once per minute across page loads", () => {
    const storage = reloadStorage();
    const reload = vi.fn();
    const error = new Error("Failed to fetch dynamically imported module");
    expect(recoverChunkLoad(error, storage, reload, 100_000)).toBe(true);
    expect(recoverChunkLoad(error, storage, reload, 100_001)).toBe(false);
    expect(recoverChunkLoad(error, storage, reload, 159_999)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect([...storage.values.values()]).toEqual(["100000"]);
    expect(recoverChunkLoad(error, storage, reload, 160_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("keeps manual recovery available when storage access is denied", () => {
    const storage = reloadStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error("Storage denied");
    });
    const reload = vi.fn();
    expect(recoverChunkLoad(new Error("Importing a module script failed."), storage, reload)).toBe(
      false,
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it("replaces invalid stored timestamps without persisting route or session data", () => {
    const storage = reloadStorage();
    storage.values.set("seatping:chunk-reload-at", "invalid");
    const reload = vi.fn();
    expect(
      recoverChunkLoad(new Error("Importing a module script failed."), storage, reload, 100_000),
    ).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith("seatping:chunk-reload-at", "100000");
  });

  it("does not loop if a browser reload fails", () => {
    const storage = reloadStorage();
    const reload = vi.fn(() => {
      throw new Error("Reload denied");
    });
    const error = new Error("Unable to preload CSS");
    expect(recoverChunkLoad(error, storage, reload, 100_000)).toBe(false);
    expect(recoverChunkLoad(error, storage, reload, 100_001)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
