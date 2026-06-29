import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SCRIPT_URL } from "../constants";
import { normaliseCandidate } from "../lib/candidates";
import type { Candidate, RawCandidate, TalentPayload } from "../types";

export type DataStatus = "idle" | "loading" | "success" | "error";

export interface TalentDataValue {
  candidatos: Candidate[];
  competencias: string[];
  status: DataStatus;
  loading: boolean;
  error: string | null;
  /** Re-run the GET request. */
  refetch: () => void;
  /** POST a new candidate, then optimistically add it locally. */
  submitCandidate: (
    candidate: RawCandidate,
  ) => Promise<{ ok: boolean; message: string }>;
}

const TalentDataContext = createContext<TalentDataValue | null>(null);

/** Fetch JSON with a timeout + small exponential-backoff retry. */
async function fetchPayload(
  signal: AbortSignal,
  attempt = 0,
): Promise<TalentPayload> {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "GET",
      // CRITICAL: follow Google's 302 so production (Vercel) doesn't 404.
      redirect: "follow",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Partial<TalentPayload>;
    return {
      candidatos: Array.isArray(data.candidatos) ? data.candidatos : [],
      competencias: Array.isArray(data.competencias) ? data.competencias : [],
    };
  } catch (err) {
    if (signal.aborted) throw err;
    if (attempt < 2) {
      // 600ms, then 1200ms.
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      return fetchPayload(signal, attempt + 1);
    }
    throw err;
  }
}

export function TalentDataProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<RawCandidate[]>([]);
  const [competencias, setCompetencias] = useState<string[]>([]);
  const [status, setStatus] = useState<DataStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setError(null);

    fetchPayload(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setRaw(payload.candidatos);
        setCompetencias(payload.competencias);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo conectar con el servidor.",
        );
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  const submitCandidate = useCallback(
    async (candidate: RawCandidate) => {
      try {
        // Apps Script web apps accept a JSON body on POST; text/plain avoids a
        // CORS preflight that the default Apps Script deployment can't answer.
        await fetch(SCRIPT_URL, {
          method: "POST",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(candidate),
        });
        // Optimistically reflect the new candidate without waiting for a reload.
        setRaw((prev) => [candidate, ...prev]);
        return { ok: true, message: "Postulante registrado correctamente." };
      } catch {
        // Still surface it locally so the operator's work isn't lost.
        setRaw((prev) => [candidate, ...prev]);
        return {
          ok: false,
          message:
            "Se guardó localmente, pero la sincronización con el servidor falló.",
        };
      }
    },
    [],
  );

  const candidatos = useMemo(
    () => raw.map((c, i) => normaliseCandidate(c, i)),
    [raw],
  );

  const value = useMemo<TalentDataValue>(
    () => ({
      candidatos,
      competencias,
      status,
      loading: status === "loading" || status === "idle",
      error,
      refetch: load,
      submitCandidate,
    }),
    [candidatos, competencias, status, error, load, submitCandidate],
  );

  return (
    <TalentDataContext.Provider value={value}>
      {children}
    </TalentDataContext.Provider>
  );
}

/** Access the global talent data store. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTalentData(): TalentDataValue {
  const ctx = useContext(TalentDataContext);
  if (!ctx) {
    throw new Error("useTalentData debe usarse dentro de <TalentDataProvider>.");
  }
  return ctx;
}
