import { useEffect, useRef, useState } from "react";

/**
 * Live, local draft persistence with crash recovery.
 *
 * While the user types, the serialisable `state` is debounced into
 * localStorage — but only when `hasContent(state)` is true, so an untouched
 * form never leaves a draft behind. On mount the hook reads any previously
 * stored draft *once* and surfaces it as `recoveredDraft`, letting the caller
 * offer the "registro encontrado" prompt (resume vs. discard).
 */
export function useFormDraft<T>(
  key: string,
  state: T,
  hasContent: (state: T) => boolean,
): {
  recoveredDraft: T | null;
  savedAt: number | null;
  clearDraft: () => void;
} {
  const [recoveredDraft] = useState<T | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { state: T } | T;
      const candidate = (parsed as { state: T })?.state ?? (parsed as T);
      return hasContent(candidate) ? candidate : null;
    } catch {
      return null;
    }
  });

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Only ever *write* meaningful drafts. We deliberately never auto-remove
      // here: clearing is explicit (clearDraft on submit / discard) so a
      // freshly-mounted empty form can't wipe a draft before the user chooses
      // to recover it.
      if (!hasContent(state)) return;
      try {
        const ts = Date.now();
        window.localStorage.setItem(key, JSON.stringify({ state, savedAt: ts }));
        setSavedAt(ts);
      } catch {
        /* storage unavailable — best effort only. */
      }
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
    setSavedAt(null);
  }

  return { recoveredDraft, savedAt, clearDraft };
}
