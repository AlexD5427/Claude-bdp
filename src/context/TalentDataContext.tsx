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
import { getConfig, subscribeConfig } from "../lib/configStore";
import { normaliseCandidate } from "../lib/candidates";
import {
  FALLBACK_DISC,
  parseDiscArchetypes,
  type DiscArchetype,
} from "../lib/disc";
import {
  emptyAuxiliares,
  type Auxiliares,
  type Candidate,
  type EspejoRow,
  type RawCandidate,
  type RawPerfil,
  type RawPerfilCargo,
  type TalentPayload,
} from "../types";

export type DataStatus = "idle" | "loading" | "success" | "error";

export interface TalentDataValue {
  candidatos: Candidate[];
  competencias: string[];
  /** DISC archetype catalogue (from the "Auxiliar" sheet, or the fallback). */
  arquetipos: DiscArchetype[];
  /** Auxiliary catalogues (cargos, gerencias, agencias, …). */
  auxiliares: Auxiliares;
  /** Raw rows of the "Perfiles_y_Configuracion" sheet. */
  perfiles: RawPerfil[];
  /** Raw rows of the "perfil_cargo_bdp" sheet (job profiles). */
  perfilesCargo: RawPerfilCargo[];
  /** Full process history ("Espejo_Base"). */
  espejoBase: EspejoRow[];
  /** Latest state per process ("Espejo_Ultimo_Registro"). */
  espejoUltimo: EspejoRow[];
  status: DataStatus;
  loading: boolean;
  /** True whenever a network refresh is in flight (even with cached data). */
  syncing: boolean;
  /** ISO timestamp of the last successful sync, or null. */
  lastSyncedAt: string | null;
  error: string | null;
  /** Re-run the GET request. */
  refetch: () => void;
  /** POST a new candidate, then optimistically add it locally. */
  submitCandidate: (
    candidate: RawCandidate,
  ) => Promise<{ ok: boolean; message: string }>;
  /**
   * POST an edit for an existing candidate (matched by identificador), reflect
   * it locally at once and then re-sync the whole database in the background.
   */
  updateCandidate: (
    candidate: RawCandidate,
  ) => Promise<{ ok: boolean; message: string }>;
  /** Append a new job profile row to `perfil_cargo_bdp`, then re-sync. */
  submitPerfilCargo: (
    row: RawPerfilCargo,
  ) => Promise<{ ok: boolean; message: string }>;
  /** Overwrite the job-profile row at 1-based data index `fila`, then re-sync. */
  updatePerfilCargo: (
    fila: number,
    row: RawPerfilCargo,
  ) => Promise<{ ok: boolean; message: string }>;
  /** Delete the job-profile row at 1-based data index `fila` (rows shift up). */
  deletePerfilCargo: (
    fila: number,
  ) => Promise<{ ok: boolean; message: string }>;
}

const TalentDataContext = createContext<TalentDataValue | null>(null);

const CACHE_KEY = "bdp-talent-cache";

interface CachedPayload extends TalentPayload {
  cachedAt: string;
}

/** Normalise the loose auxiliares object into a fully-populated shape. */
function normaliseAuxiliares(raw?: Partial<Auxiliares>): Auxiliares {
  const base = emptyAuxiliares();
  if (!raw) return base;
  const pick = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    cargos_bdp: pick(raw.cargos_bdp),
    gerencias_bdp: pick(raw.gerencias_bdp),
    agencias_bdp: pick(raw.agencias_bdp),
    modalidad_reclutamiento: pick(raw.modalidad_reclutamiento),
    estado_proceso: pick(raw.estado_proceso),
  };
}

function coercePayload(data: Partial<TalentPayload>): TalentPayload {
  return {
    candidatos: Array.isArray(data.candidatos) ? data.candidatos : [],
    competencias: Array.isArray(data.competencias) ? data.competencias : [],
    arquetipos_disc: Array.isArray(data.arquetipos_disc) ? data.arquetipos_disc : [],
    auxiliares: normaliseAuxiliares(data.auxiliares),
    perfiles: Array.isArray(data.perfiles) ? data.perfiles : [],
    perfiles_cargo: Array.isArray(data.perfiles_cargo) ? data.perfiles_cargo : [],
    espejo_base: Array.isArray(data.espejo_base) ? data.espejo_base : [],
    espejo_ultimo: Array.isArray(data.espejo_ultimo) ? data.espejo_ultimo : [],
  };
}

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
    return coercePayload(data);
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

function readCache(): CachedPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed || !Array.isArray(parsed.candidatos)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload: TalentPayload): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedPayload = { ...payload, cachedAt: new Date().toISOString() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    /* ignore quota / private mode */
  }
}

export function TalentDataProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from cache so the first paint already has data
  // (stale-while-revalidate): the network refresh then runs in the background.
  const initial = readCache();

  const [raw, setRaw] = useState<RawCandidate[]>(initial?.candidatos ?? []);
  const [competencias, setCompetencias] = useState<string[]>(
    initial?.competencias ?? [],
  );
  const [arquetiposRaw, setArquetiposRaw] = useState<string[]>(
    initial?.arquetipos_disc ?? [],
  );
  const [auxiliares, setAuxiliares] = useState<Auxiliares>(
    normaliseAuxiliares(initial?.auxiliares),
  );
  const [perfiles, setPerfiles] = useState<RawPerfil[]>(initial?.perfiles ?? []);
  const [perfilesCargo, setPerfilesCargo] = useState<RawPerfilCargo[]>(
    initial?.perfiles_cargo ?? [],
  );
  const [espejoBase, setEspejoBase] = useState<EspejoRow[]>(
    initial?.espejo_base ?? [],
  );
  const [espejoUltimo, setEspejoUltimo] = useState<EspejoRow[]>(
    initial?.espejo_ultimo ?? [],
  );
  const [status, setStatus] = useState<DataStatus>(
    initial ? "success" : "idle",
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initial?.cachedAt ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const hasData = useRef<boolean>(Boolean(initial));

  const load = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    // Only flip to the full-page "loading" state when we have nothing to show.
    if (!hasData.current) setStatus("loading");
    setSyncing(true);
    setError(null);

    fetchPayload(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setRaw(payload.candidatos);
        setCompetencias(payload.competencias);
        setArquetiposRaw(payload.arquetipos_disc ?? []);
        setAuxiliares(normaliseAuxiliares(payload.auxiliares));
        setPerfiles(payload.perfiles ?? []);
        setPerfilesCargo(payload.perfiles_cargo ?? []);
        setEspejoBase(payload.espejo_base ?? []);
        setEspejoUltimo(payload.espejo_ultimo ?? []);
        setStatus("success");
        setSyncing(false);
        setLastSyncedAt(new Date().toISOString());
        hasData.current = true;
        writeCache(payload);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSyncing(false);
        // Keep cached data visible on a background refresh failure.
        if (hasData.current) return;
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

  // ---- passive freshness -------------------------------------------------
  // The database is the single source of truth and may change from other
  // devices, so we keep the app fresh without any user action:
  //   · a background poll on the interval configured in Configuración,
  //   · an immediate refresh whenever the tab/window regains focus or the
  //     network comes back online.
  // All of these funnel through `load()`, which is a no-op-friendly
  // stale-while-revalidate fetch (it never blanks the screen while data exists).
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    // Re-read the (external) config store and re-arm the timer when it changes.
    let intervalId: number | undefined;
    const arm = () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      const cfg = getConfig();
      if (!cfg.autoRefresh) {
        intervalId = undefined;
        return;
      }
      const ms = Math.max(15, cfg.autoRefreshSeconds || 60) * 1000;
      intervalId = window.setInterval(() => {
        // Don't hammer the API for a hidden tab; the visibility handler will
        // refresh the moment the operator returns.
        if (!document.hidden) loadRef.current();
      }, ms);
    };
    arm();
    const unsubscribe = subscribeConfig(arm);

    const onFocus = () => loadRef.current();
    const onVisibility = () => {
      if (!document.hidden) loadRef.current();
    };
    const onOnline = () => loadRef.current();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);

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

  const updateCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const id = String(candidate.identificador ?? "").trim();
      const matches = (c: RawCandidate) =>
        String(c.identificador ?? "").trim() === id;
      // Optimistically patch the matching row so the UI reflects the edit at
      // once (fast), then re-sync the whole database (efficient + complete).
      const applyLocal = () =>
        setRaw((prev) => prev.map((c) => (matches(c) ? { ...c, ...candidate } : c)));
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          // `action: "update"` routes to the sheet upsert that edits the exact
          // row (matched by identificador) column by column.
          body: JSON.stringify({ action: "update", ...candidate }),
        });
        applyLocal();
        // The POST invalidates the backend cache, so a full refetch now returns
        // fresh data and repaints every module from a single source of truth.
        load();
        return { ok: true, message: "Postulante actualizado correctamente." };
      } catch {
        applyLocal();
        return {
          ok: false,
          message:
            "Se actualizó localmente, pero la sincronización con el servidor falló.",
        };
      }
    },
    [load],
  );

  // ---- Perfiles de Cargo (perfil_cargo_bdp) ------------------------------
  // These mirror submitCandidate/updateCandidate: POST with a text/plain body
  // (no CORS preflight), then re-sync the whole payload so the sheet stays the
  // single source of truth. The backend addresses rows by their 1-based data
  // index (`fila`) since the sheet has no id column; a refetch after each write
  // keeps those indices fresh (deletes shift rows up — no blank gaps).
  const postPerfilCargo = useCallback(
    async (body: Record<string, unknown>, okMsg: string) => {
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ type: "perfil_cargo", ...body }),
        });
        const data = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
        if (data.status && data.status !== "success") {
          return { ok: false, message: data.message || "El servidor rechazó la operación." };
        }
        load();
        return { ok: true, message: okMsg };
      } catch {
        return {
          ok: false,
          message: "No se pudo sincronizar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
        };
      }
    },
    [load],
  );

  const submitPerfilCargo = useCallback(
    (row: RawPerfilCargo) => postPerfilCargo({ action: "create", row }, "Perfil de cargo creado correctamente."),
    [postPerfilCargo],
  );

  const updatePerfilCargo = useCallback(
    (fila: number, row: RawPerfilCargo) =>
      postPerfilCargo({ action: "update", fila, row }, "Perfil de cargo actualizado correctamente."),
    [postPerfilCargo],
  );

  const deletePerfilCargo = useCallback(
    (fila: number) => postPerfilCargo({ action: "delete", fila }, "Perfil de cargo eliminado."),
    [postPerfilCargo],
  );

  const candidatos = useMemo(
    () => raw.map((c, i) => normaliseCandidate(c, i)),
    [raw],
  );

  const arquetipos = useMemo<DiscArchetype[]>(() => {
    const parsed = parseDiscArchetypes(arquetiposRaw);
    return parsed.length ? parsed : FALLBACK_DISC;
  }, [arquetiposRaw]);

  const value = useMemo<TalentDataValue>(
    () => ({
      candidatos,
      competencias,
      arquetipos,
      auxiliares,
      perfiles,
      perfilesCargo,
      espejoBase,
      espejoUltimo,
      status,
      loading: status === "loading" || status === "idle",
      syncing,
      lastSyncedAt,
      error,
      refetch: load,
      submitCandidate,
      updateCandidate,
      submitPerfilCargo,
      updatePerfilCargo,
      deletePerfilCargo,
    }),
    [
      candidatos,
      competencias,
      arquetipos,
      auxiliares,
      perfiles,
      perfilesCargo,
      espejoBase,
      espejoUltimo,
      status,
      syncing,
      lastSyncedAt,
      error,
      load,
      submitCandidate,
      updateCandidate,
      submitPerfilCargo,
      updatePerfilCargo,
      deletePerfilCargo,
    ],
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
