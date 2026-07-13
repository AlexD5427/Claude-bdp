/**
 * Small async helpers for feature UIs.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Result } from "./result";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Run a `Result`-returning async loader, exposing {data, loading, error} and a
 * `reload`. Cancels stale results when the loader identity changes or unmounts.
 */
export function useAsyncResult<T>(
  loader: () => Promise<Result<T>>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const reqId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoLoader = useCallback(loader, deps);

  const run = useCallback(() => {
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    memoLoader().then((res) => {
      if (id !== reqId.current) return;
      if (res.ok) setState({ data: res.value, loading: false, error: null });
      else setState({ data: null, loading: false, error: res.error.message });
    });
  }, [memoLoader]);

  useEffect(() => {
    run();
    return () => {
      reqId.current++;
    };
  }, [run]);

  return { ...state, reload: run };
}
