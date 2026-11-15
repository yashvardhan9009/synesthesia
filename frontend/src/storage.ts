import type { KeyValueStore } from "./audio/labConfig.ts";

const NO_STORE: KeyValueStore = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

/**
 * localStorage, or a store that keeps nothing where storage is blocked
 * (private mode, sandboxed frames). Writes never throw.
 */
export function browserStore(): KeyValueStore {
  try {
    const storage = window.localStorage;
    const probe = "synesthesia.probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        try {
          storage.setItem(key, value);
        } catch {
          /* full: this visit only */
        }
      },
      removeItem: (key) => storage.removeItem(key),
    };
  } catch {
    return NO_STORE;
  }
}
