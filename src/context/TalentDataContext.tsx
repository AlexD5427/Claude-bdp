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
import { postToBackend, type WriteResult } from "../lib/backendWrite";
import { readJsonItem, writeJsonItem } from "../lib/safeStorage";
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

/**
 * Salud real de la conexión con el backend.
 *
 * Existe porque `status` no la contaba. Con datos en caché, un refresco fallido
 * se descartaba en silencio (`if (hasData.current) return`) y `status` seguía
 * valiendo `"success"`: el punto del dock se quedaba en verde «Sincronizado»
 * mientras la aplicación llevaba horas sin poder hablar con la hoja. El analista
 * seguía trabajando sobre datos viejos y sus altas no llegaban a ninguna parte.
 * Reproducido en `qa/sondas.mjs punto-sincronizacion`.
 */
export type ConnectionHealth = "desconocida" | "en-linea" | "sin-conexion";

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
  /** Estado honesto de la conexión, independiente de si hay datos en pantalla. */
  connection: ConnectionHealth;
  /** Detalle del último fallo de red (para el panel de diagnóstico). */
  connectionDetail: string | null;
  /** Re-run the GET request. */
  refetch: () => void;
  /** POST a new candidate; only reflects it locally si el servidor lo aceptó. */
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

/** Cuánto se espera el payload completo antes de reintentar. */
const READ_TIMEOUT_MS = 30_000;

/** Fetch JSON with a timeout + small exponential-backoff retry. */
async function fetchPayload(
  signal: AbortSignal,
  attempt = 0,
): Promise<TalentPayload> {
  // Un `AbortController` propio por intento: así el tiempo de espera corta la
  // petición colgada sin cancelar el reintento que viene detrás. Antes no había
  // ningún límite y una petición que nunca contestaba (un portal cautivo que
  // acepta la conexión y no responde) dejaba la aplicación cargando para siempre.
  const local = new AbortController();
  const onOuterAbort = () => local.abort();
  signal.addEventListener("abort", onOuterAbort, { once: true });
  const timer = setTimeout(() => local.abort(), READ_TIMEOUT_MS);
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "GET",
      // CRITICAL: follow Google's 302 so production (Vercel) doesn't 404.
      redirect: "follow",
      headers: { Accept: "application/json" },
      signal: local.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const head = text.trimStart().slice(0, 120).toLowerCase();
    if (head.startsWith("<!doctype") || head.startsWith("<html")) {
      // Apps Script contesta 200 + HTML cuando el despliegue perdió permisos.
      throw new Error(
        "El despliegue de Apps Script pide autorización (respondió una página web en lugar de datos).",
      );
    }
    return coercePayload(JSON.parse(text) as Partial<TalentPayload>);
  } catch (err) {
    if (signal.aborted) throw err;
    if (attempt < 2) {
      // 600ms, then 1200ms.
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      return fetchPayload(signal, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onOuterAbort);
  }
}

function readCache(): CachedPayload | null {
  const parsed = readJsonItem<CachedPayload | null>("local", CACHE_KEY, null);
  if (!parsed || !Array.isArray(parsed.candidatos)) return null;
  return parsed;
}

function writeCache(payload: TalentPayload): void {
  const cached: CachedPayload = { ...payload, cachedAt: new Date().toISOString() };
  writeJsonItem("local", CACHE_KEY, cached);
}

/* ------------------------------------------------------------------ */
/* Escrituras pendientes de confirmación                               */
/* ------------------------------------------------------------------ */

/**
 * Una escritura que el servidor **aceptó** pero que el payload todavía no
 * refleja.
 *
 * Apps Script sirve el `doGet` desde su propia caché, así que el `GET` que sigue
 * a un alta suele devolver el listado *sin* la fila nueva. El código anterior
 * hacía exactamente eso: al guardar, el cuestionario llamaba a `refetch()`, el
 * payload viejo reemplazaba el arreglo completo y el postulante recién dado de
 * alta **desaparecía de la pantalla antes de que el analista lo viera**. Volvía a
 * registrarlo, y así nacían los duplicados. Reproducido en
 * `qa/sondas.mjs carrera-optimista`.
 *
 * La solución es no tratar el payload como la verdad absoluta durante la ventana
 * en la que sabemos que va por detrás: cada escritura confirmada se queda
 * «pendiente» y se superpone al payload hasta que éste la incorpora (o hasta que
 * caduca, para que un borrado hecho desde la hoja no quede enmascarado para
 * siempre).
 */
interface PendingWrite {
  kind: "create" | "update";
  row: RawCandidate;
  at: number;
}

/** Ventana máxima en la que se sigue superponiendo una escritura confirmada. */
const PENDING_TTL_MS = 5 * 60 * 1000;

const identOf = (row: RawCandidate): string =>
  String(row.identificador ?? "").trim();

/**
 * Superpone las escrituras confirmadas sobre el payload del servidor.
 * Devuelve las filas resultantes y las escrituras que siguen pendientes.
 */
export function mergePendingWrites(
  rows: RawCandidate[],
  pending: Map<string, PendingWrite>,
  now = Date.now(),
): { rows: RawCandidate[]; pending: Map<string, PendingWrite> } {
  if (pending.size === 0) return { rows, pending };

  const survivors = new Map<string, PendingWrite>();
  const byIdent = new Map<string, number>();
  rows.forEach((row, index) => {
    const ident = identOf(row);
    if (ident && !byIdent.has(ident)) byIdent.set(ident, index);
  });

  const merged = [...rows];
  const prepend: RawCandidate[] = [];

  for (const [ident, write] of pending) {
    const expired = now - write.at > PENDING_TTL_MS;
    const index = byIdent.get(ident);

    if (index === undefined) {
      // El servidor todavía no devuelve la fila. Mientras la ventana siga
      // abierta se mantiene visible; al caducar se deja marchar (pudo borrarse
      // desde la hoja y no queremos inventar una fila que ya no existe).
      if (!expired) {
        prepend.push(write.row);
        survivors.set(ident, write);
      }
      continue;
    }

    if (write.kind === "update") {
      const server = merged[index];
      const stillStale = Object.keys(write.row).some(
        (key) => String(server[key] ?? "") !== String(write.row[key] ?? ""),
      );
      if (stillStale && !expired) {
        merged[index] = { ...server, ...write.row };
        survivors.set(ident, write);
      }
    }
    // Un alta cuya fila ya llegó del servidor está confirmada: se descarta.
  }

  return { rows: prepend.length ? [...prepend, ...merged] : merged, pending: survivors };
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
  const [connection, setConnection] = useState<ConnectionHealth>("desconocida");
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const hasData = useRef<boolean>(Boolean(initial));
  const pendingRef = useRef<Map<string, PendingWrite>>(new Map());

  /** Aplica el payload del servidor respetando las escrituras confirmadas. */
  const applyServerRows = useCallback((rows: RawCandidate[]) => {
    const { rows: merged, pending } = mergePendingWrites(rows, pendingRef.current);
    pendingRef.current = pending;
    setRaw(merged);
  }, []);

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
        applyServerRows(payload.candidatos);
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
        setConnection("en-linea");
        setConnectionDetail(null);
        hasData.current = true;
        writeCache(payload);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const detail =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        setSyncing(false);
        // La conexión se marca caída SIEMPRE, tenga o no datos en pantalla: es
        // justo el caso en el que el analista necesita saber que lo que ve es
        // una copia local y que sus escrituras no van a llegar.
        setConnection("sin-conexion");
        setConnectionDetail(detail);
        // Keep cached data visible on a background refresh failure.
        if (hasData.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo conectar con el servidor.",
        );
        setStatus("error");
      });
  }, [applyServerRows]);

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
    const onOffline = () => setConnection("sin-conexion");
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  /** Traduce el resultado de una escritura al par que consume la interfaz. */
  const report = useCallback((result: WriteResult, okMessage: string) => {
    if (result.ok) {
      setConnection("en-linea");
      return { ok: true, message: result.message || okMessage };
    }
    if (result.cause === "red" || result.cause === "tiempo") {
      setConnection("sin-conexion");
      setConnectionDetail(result.detail);
    }
    // El detalle técnico va a la consola, no a la cara del analista.
    console.error("[BDP] escritura rechazada:", result.cause, result.detail);
    return { ok: false, message: result.message };
  }, []);

  const submitCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const result = await postToBackend(candidate);
      if (!result.ok) {
        // Nada se refleja localmente: mostrar la ficha como si existiera era
        // precisamente lo que hacía creer que el alta había funcionado.
        return report(result, "");
      }
      const ident = identOf(candidate);
      if (ident) {
        pendingRef.current.set(ident, { kind: "create", row: candidate, at: Date.now() });
      }
      setRaw((prev) => [candidate, ...prev]);
      // Un refresco en segundo plano confirma el alta en cuanto el backend la
      // publique; la superposición de `pendingRef` evita el parpadeo mientras.
      load();
      return report(result, "Postulante registrado correctamente.");
    },
    [load, report],
  );

  const updateCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const ident = identOf(candidate);
      const result = await postToBackend({ action: "update", ...candidate });
      if (!result.ok) return report(result, "");

      if (ident) {
        pendingRef.current.set(ident, { kind: "update", row: candidate, at: Date.now() });
      }
      setRaw((prev) =>
        prev.map((c) => (identOf(c) === ident ? { ...c, ...candidate } : c)),
      );
      // The POST invalidates the backend cache, so a full refetch now returns
      // fresh data and repaints every module from a single source of truth.
      load();
      return report(result, "Postulante actualizado correctamente.");
    },
    [load, report],
  );

  // ---- Perfiles de Cargo (perfil_cargo_bdp) ------------------------------
  // These mirror submitCandidate/updateCandidate: POST with a text/plain body
  // (no CORS preflight), then re-sync the whole payload so the sheet stays the
  // single source of truth. The backend addresses rows by their 1-based data
  // index (`fila`) since the sheet has no id column; a refetch after each write
  // keeps those indices fresh (deletes shift rows up — no blank gaps).
  const postPerfilCargo = useCallback(
    async (body: Record<string, unknown>, okMsg: string) => {
      const result = await postToBackend({ type: "perfil_cargo", ...body });
      if (!result.ok) return report(result, "");
      load();
      return report(result, okMsg);
    },
    [load, report],
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
      connection,
      connectionDetail,
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
      connection,
      connectionDetail,
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
