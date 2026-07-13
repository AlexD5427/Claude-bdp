import { useSyncExternalStore } from "react";

/**
 * A tiny, dependency-free reactive store with optional `localStorage`
 * persistence. It generalises the pattern already used across the app
 * (`configStore`, `hiringStore`, …): a single mutable value, a set of
 * listeners, and a `useSyncExternalStore` binding. New feature stores build on
 * this instead of re-implementing the plumbing.
 *
 * Persistence is best-effort and fault-tolerant: quota errors, private mode and
 * malformed payloads never throw — they degrade to in-memory state.
 */

export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
  /** React binding. Optional selector for narrow subscriptions. */
  use: <S = T>(selector?: (state: T) => S) => S;
}

export interface PersistentStoreOptions<T> {
  /** `localStorage` key. Omit for an in-memory-only store. */
  key?: string;
  /** Migrate/repair a persisted value into the current shape. */
  hydrate?: (raw: unknown, initial: T) => T;
}

function readPersisted<T>(key: string, initial: T, hydrate?: (raw: unknown, initial: T) => T): T {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return initial;
    const parsed: unknown = JSON.parse(raw);
    return hydrate ? hydrate(parsed, initial) : (parsed as T);
  } catch {
    return initial;
  }
}

export function createStore<T>(initial: T, options: PersistentStoreOptions<T> = {}): Store<T> {
  const { key, hydrate } = options;
  let state: T = key ? readPersisted(key, initial, hydrate) : initial;
  const listeners = new Set<() => void>();

  const persist = () => {
    if (!key || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  };

  const get = () => state;

  const set: Store<T>["set"] = (next) => {
    const value = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
    if (Object.is(value, state)) return;
    state = value;
    persist();
    for (const l of listeners) l();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const use = <S = T>(selector?: (state: T) => S): S => {
    const select = selector ?? ((s: T) => s as unknown as S);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useSyncExternalStore(
      subscribe,
      () => select(state),
      () => select(state),
    );
  };

  return { get, set, subscribe, use };
}
