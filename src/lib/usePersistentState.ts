"use client";

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * useState backed by localStorage so values survive a page reload.
 *
 * Implemented with useSyncExternalStore (rather than a load-in-useEffect) so
 * that server and hydration snapshots stay consistent and React doesn't warn
 * about it. Changes are written through to localStorage and also picked up
 * across tabs via the native `storage` event.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  // Capture the initial value once so its identity is stable across renders;
  // useSyncExternalStore would loop if an empty store kept returning fresh ones.
  const [initial] = useState(initialValue);
  // Cache the parsed value keyed by its raw string, so getSnapshot returns a
  // stable reference until the stored string actually changes. Only touched
  // inside callbacks (never during render).
  const cacheRef = useRef<{ raw: string | null; value: T } | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    [key]
  );

  const getSnapshot = useCallback((): T => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      // Storage disabled (e.g. private mode): fall back to the initial value.
    }
    let cache = cacheRef.current;
    if (!cache || cache.raw !== raw) {
      cache = {
        raw,
        value: raw !== null ? safeParse(raw, initial) : initial,
      };
      cacheRef.current = cache;
    }
    return cache.value;
  }, [key, initial]);

  const getServerSnapshot = useCallback((): T => initial, [initial]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const next =
        typeof action === "function"
          ? (action as (prev: T) => T)(getSnapshot())
          : action;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Quota exceeded or storage disabled: keep working without persistence.
      }
      // The native `storage` event only fires in *other* tabs, so notify this
      // one explicitly to re-read the snapshot.
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    [key, getSnapshot]
  );

  return [value, setValue];
}
