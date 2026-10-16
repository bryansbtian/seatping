import { lazy, type ComponentType } from "react";

const RELOAD_STORAGE_KEY = "seatping:chunk-reload-at";
const RELOAD_INTERVAL_MS = 60_000;

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .+ failed|Unable to preload CSS/i.test(
    error.message,
  );
}

export function recoverChunkLoad(
  error: unknown,
  storage: ReloadStorage,
  reload: () => void,
  now = Date.now(),
): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }
  try {
    const previousValue = storage.getItem(RELOAD_STORAGE_KEY);
    const previous = Number(previousValue);
    if (
      previousValue !== null &&
      Number.isFinite(previous) &&
      now - previous < RELOAD_INTERVAL_MS
    ) {
      return false;
    }
    storage.setItem(RELOAD_STORAGE_KEY, String(now));
    reload();
    return true;
  } catch {
    return false;
  }
}

export function lazyRoute<T extends ComponentType<never>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      try {
        recoverChunkLoad(error, window.sessionStorage, () => window.location.reload());
      } catch {
        throw error;
      }
      throw error;
    }
  });
}
