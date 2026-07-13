import { useCallback, useRef, useState } from "react";

/**
 * A small history-tracking state hook powering the builder's undo/redo. It keeps
 * bounded past/future stacks and only records snapshots on "committed" changes,
 * so rapid keystrokes don't flood the history. Structural clones are avoided by
 * relying on immutable updates from callers.
 */
export interface History<T> {
  state: T;
  set: (next: T | ((prev: T) => T), record?: boolean) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const LIMIT = 60;

export function useHistoryState<T>(initial: T): History<T> {
  const [state, setStateRaw] = useState<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const set = useCallback(
    (next: T | ((prev: T) => T), record = true) => {
      setStateRaw((prev) => {
        const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (Object.is(value, prev)) return prev;
        if (record) {
          past.current = [...past.current.slice(-LIMIT), prev];
          future.current = [];
        }
        return value;
      });
    },
    [],
  );

  const undo = useCallback(() => {
    setStateRaw((prev) => {
      const previous = past.current[past.current.length - 1];
      if (previous === undefined) return prev;
      past.current = past.current.slice(0, -1);
      future.current = [prev, ...future.current].slice(0, LIMIT);
      rerender();
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setStateRaw((prev) => {
      const nextState = future.current[0];
      if (nextState === undefined) return prev;
      future.current = future.current.slice(1);
      past.current = [...past.current, prev].slice(-LIMIT);
      rerender();
      return nextState;
    });
  }, []);

  const reset = useCallback((next: T) => {
    past.current = [];
    future.current = [];
    setStateRaw(next);
  }, []);

  return {
    state,
    set,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
