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
import { getConfig, subscribeConfig } from "../lib/configStore";
import { normaliseCandidates } from "../lib/candidates";
import { escribirEnHoja, leerDeHoja } from "../lib/appsScript";
import { leerJson, escribirJson } from "../shared/storage";
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
  /**
   * Identificadores repetidos en la hoja. La lista de Postulantes los muestra
   * como aviso: son el origen de que una persona «no se pueda comparar».
   */
  duplicados: string[];
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
  /**
   * Motivo del último refresco fallido **aunque siga habiendo datos en
   * pantalla**. Antes se descartaba en silencio: el equipo veía la caché local
   * de hace horas convencido de estar mirando la hoja en vivo.
   */
  syncError: string | null;
  /** Los datos visibles vienen de la caché y el último refresco falló. */
  stale: boolean;
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
  // `leerDeHoja` distingue «no hay red» de «Google contestó una página de inicio
  // de sesión», que es la diferencia entre un problema de conexión y uno de
  // despliegue. Ese matiz es lo que después se le muestra al equipo.
  const res = await leerDeHoja<Partial<TalentPayload>>(signal);
  if (res.ok && res.datos) return coercePayload(res.datos);
  if (signal.aborted) throw new Error("cancelado");
  if (attempt < 2) {
    // 600ms, then 1200ms.
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    return fetchPayload(signal, attempt + 1);
  }
  throw new Error(res.message || "No se pudo conectar con el servidor.");
}

function readCache(): CachedPayload | null {
  const parsed = leerJson<CachedPayload | null>(CACHE_KEY, null);
  if (!parsed || !Array.isArray(parsed.candidatos)) return null;
  return parsed;
}

function writeCache(payload: TalentPayload): void {
  const cached: CachedPayload = { ...payload, cachedAt: new Date().toISOString() };
  escribirJson(CACHE_KEY, cached);
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
  const [syncError, setSyncError] = useState<string | null>(null);
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
        setSyncError(null);
        setLastSyncedAt(new Date().toISOString());
        hasData.current = true;
        writeCache(payload);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSyncing(false);
        const mensaje =
          err instanceof Error ? err.message : "No se pudo conectar con el servidor.";
        // Con datos en pantalla no se borra nada, pero **sí se avisa**: seguir
        // mostrando la caché como si fuera la hoja en vivo es lo que hacía creer
        // que el sistema estaba al día cuando llevaba horas desconectado.
        setSyncError(mensaje);
        if (hasData.current) return;
        setError(mensaje);
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
      // Apps Script web apps accept a JSON body on POST; text/plain avoids a
      // CORS preflight that the default Apps Script deployment can't answer.
      // `escribirEnHoja` es quien decide si de verdad se guardó: antes se daba
      // por bueno cualquier resultado, incluida la página de error de Google.
      const res = await escribirEnHoja(candidate);
      if (!res.ok) return { ok: false, message: res.message };
      // Sólo cuando la hoja aceptó la fila la reflejamos en pantalla. Añadirla
      // «por si acaso» hacía aparecer fichas fantasma que el siguiente refresco
      // borraba, y eso se lee como «se perdió lo que registré».
      setRaw((prev) => [candidate, ...prev]);
      return { ok: true, message: "Postulante registrado correctamente." };
    },
    [],
  );

  const updateCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const id = String(candidate.identificador ?? "").trim();
      const matches = (c: RawCandidate) =>
        String(c.identificador ?? "").trim() === id;
      // `action: "update"` routes to the sheet upsert that edits the exact row
      // (matched by identificador) column by column.
      const res = await escribirEnHoja({ action: "update", ...candidate });
      if (!res.ok) return { ok: false, message: res.message };
      // Reflejo optimista de la fila editada (rápido) y, acto seguido, un
      // refresco completo: la hoja sigue siendo la única fuente de verdad.
      setRaw((prev) => prev.map((c) => (matches(c) ? { ...c, ...candidate } : c)));
      load();
      return { ok: true, message: "Postulante actualizado correctamente." };
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
      const res = await escribirEnHoja({ type: "perfil_cargo", ...body });
      if (!res.ok) return { ok: false, message: res.message };
      load();
      return { ok: true, message: okMsg };
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

  const { candidatos, duplicados } = useMemo(
    () => normaliseCandidates(raw),
    [raw],
  );

  const arquetipos = useMemo<DiscArchetype[]>(() => {
    const parsed = parseDiscArchetypes(arquetiposRaw);
    return parsed.length ? parsed : FALLBACK_DISC;
  }, [arquetiposRaw]);

  const value = useMemo<TalentDataValue>(
    () => ({
      candidatos,
      duplicados,
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
      syncError,
      stale: syncError !== null && status === "success",
      refetch: load,
      submitCandidate,
      updateCandidate,
      submitPerfilCargo,
      updatePerfilCargo,
      deletePerfilCargo,
    }),
    [
      candidatos,
      duplicados,
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
      syncError,
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
