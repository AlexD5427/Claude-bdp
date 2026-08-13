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
import { normaliseCandidates } from "../lib/candidates";
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
  /**
   * POST a new candidate. Resolves `ok: true` **only** when the sheet confirms
   * the write; nothing is added locally otherwise (see `postToSheet`).
   */
  submitCandidate: (candidate: RawCandidate) => Promise<WriteResult>;
  /**
   * POST an edit for an existing candidate (matched by identificador). On a
   * confirmed write it patches the row locally at once and re-syncs the whole
   * database in the background.
   */
  updateCandidate: (candidate: RawCandidate) => Promise<WriteResult>;
  /** Append a new job profile row to `perfil_cargo_bdp`, then re-sync. */
  submitPerfilCargo: (row: RawPerfilCargo) => Promise<WriteResult>;
  /** Overwrite the job-profile row at 1-based data index `fila`, then re-sync. */
  updatePerfilCargo: (fila: number, row: RawPerfilCargo) => Promise<WriteResult>;
  /** Delete the job-profile row at 1-based data index `fila` (rows shift up). */
  deletePerfilCargo: (fila: number) => Promise<WriteResult>;
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

/** Cuánto se espera a que la hoja conteste una escritura antes de rendirse. */
const WRITE_TIMEOUT_MS = 25_000;

/**
 * Resultado de una escritura, tal y como lo entiende la interfaz.
 *
 * `pendiente` distingue el caso más delicado: la petición salió pero nunca
 * volvió (proxy corporativo, red que se cae a medias). No sabemos si la hoja
 * guardó o no, y decirle al analista «listo» sería mentirle.
 */
export interface WriteResult {
  ok: boolean;
  message: string;
  /** Verdadero cuando el resultado real en la hoja es indeterminado. */
  pendiente?: boolean;
}

/**
 * POST a la hoja **comprobando la respuesta**.
 *
 * ## Lo que hacía antes
 *
 * `submitCandidate` lanzaba el `fetch`, ignoraba la respuesta y devolvía
 * `ok: true` en cuanto la promesa se resolvía. Con eso, dos escenarios
 * cotidianos acababan con el postulante perdido y el analista convencido de
 * haberlo registrado:
 *
 *   1. **La hoja rechaza la fila** (identificador repetido, permisos, hoja
 *      renombrada). Apps Script responde `{status:"error"}` con un `200`, así
 *      que la aplicación cerraba el cuestionario, borraba el borrador y decía
 *      «Postulante registrado correctamente». La ficha no existía en ninguna
 *      parte.
 *   2. **El POST no sale** (extensión, proxy, sin red). El `catch` insertaba la
 *      fila **sólo en memoria** y anunciaba que se había guardado «localmente».
 *      A los sesenta segundos el refresco en segundo plano traía la hoja de
 *      verdad y la tarjeta desaparecía sin dejar rastro.
 *
 * Ahora se lee el sobre de respuesta, se respeta un tiempo máximo y nada se
 * inserta en memoria si la hoja no confirmó: el borrador local sigue intacto y
 * el cuestionario permanece abierto para reintentar.
 */
async function postToSheet(body: unknown): Promise<WriteResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      // Apps Script web apps accept a JSON body on POST; text/plain avoids a
      // CORS preflight that the default Apps Script deployment can't answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `El servidor respondió ${res.status}. No se guardó nada; vuelva a intentarlo.`,
      };
    }
    const text = await res.text();
    // Un despliegue viejo puede contestar vacío o con texto plano: si el HTTP
    // fue correcto y no hay un "error" explícito, se toma como aceptado.
    const data = parseEnvelope(text);
    if (data && data.status && data.status !== "success") {
      return {
        ok: false,
        message: data.message || "El servidor rechazó la operación.",
      };
    }
    return { ok: true, message: "" };
  } catch (err) {
    // Se mira el `name` y no `instanceof DOMException`: no todos los entornos
    // que ejecutan este código (navegador, jsdom, undici) usan la misma clase.
    const aborted = (err as { name?: string } | null)?.name === "AbortError";
    return {
      ok: false,
      pendiente: true,
      message: aborted
        ? "El servidor no respondió en 25 segundos. No se pudo confirmar el guardado: revise la hoja antes de reintentar."
        : "No se pudo contactar con el servidor. Revise su conexión (o el antivirus/proxy de su equipo) y reintente; su avance sigue guardado en este equipo.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseEnvelope(text: string): { status?: string; message?: string } | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as { status?: string; message?: string })
      : null;
  } catch {
    return null;
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
      const result = await postToSheet(candidate);
      if (!result.ok) return result;
      // Sólo cuando la hoja confirmó: se refleja al instante (rápido) y se
      // vuelve a leer la base entera (completo y sin inventar filas).
      setRaw((prev) => [candidate, ...prev]);
      load();
      return { ok: true, message: "Postulante registrado correctamente." };
    },
    [load],
  );

  const updateCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const id = String(candidate.identificador ?? "").trim();
      // `action: "update"` routes to the sheet upsert that edits the exact row
      // (matched by identificador) column by column.
      const result = await postToSheet({ action: "update", ...candidate });
      if (!result.ok) return result;
      const matches = (c: RawCandidate) =>
        String(c.identificador ?? "").trim() === id;
      // Patch the matching row so the UI reflects the edit at once (fast), then
      // re-sync the whole database (efficient + complete). The POST invalidates
      // the backend cache, so the refetch returns fresh data and repaints every
      // module from a single source of truth.
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
      const result = await postToSheet({ type: "perfil_cargo", ...body });
      if (!result.ok) return result;
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

  const candidatos = useMemo(() => normaliseCandidates(raw), [raw]);

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
