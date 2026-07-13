/**
 * A minimal external store factory built on `useSyncExternalStore`, matching
 * the pattern already used across the app (configStore, hiringStore). It gives
 * feature stores a consistent, dependency-free, reactive, localStorage-backed
 * home without pulling in a state-management library.
 */

import { useSyncExternalStore } from "react";

export interface ExternalStore<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  /** React hook returning the current state (optionally a selected slice). */
  use: <S = T>(selector?: (state: T) => S) => S;
}

interface CreateStoreOptions<T> {
  /** localStorage key; omit for in-memory only. */
  persistKey?: string;
  /** Custom (de)serialization; defaults to JSON. */
  serialize?: (state: T) => string;
  deserialize?: (raw: string) => T;
}

export function createStore<T>(
  initial: T,
  options: CreateStoreOptions<T> = {},
): ExternalStore<T> {
  const { persistKey, serialize = JSON.stringify, deserialize = JSON.parse } = options;

  let state: T = load();
  const listeners = new Set<() => void>();

  function load(): T {
    if (!persistKey || typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(persistKey);
      return raw ? (deserialize(raw) as T) : initial;
    } catch {
      return initial;
    }
  }

  function persist(): void {
    if (!persistKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(persistKey, serialize(state));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function set(next: T | ((prev: T) => T)): void {
    state = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
    persist();
    for (const l of listeners) l();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function use<S = T>(selector?: (state: T) => S): S {
    const select = selector ?? ((s: T) => s as unknown as S);
    return useSyncExternalStore(
      subscribe,
      () => select(state),
      () => select(state),
    );
  }

  return { get: () => state, set, subscribe, use };
}
