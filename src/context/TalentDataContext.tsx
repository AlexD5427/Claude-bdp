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
   * POST a new candidate. Sólo se refleja en la copia local cuando la hoja
   * confirma la escritura: una ficha que no llegó al libro no debe aparecer en
   * la interfaz como si estuviera guardada.
   */
  submitCandidate: (
    candidate: RawCandidate,
  ) => Promise<{ ok: boolean; message: string }>;
  /**
   * POST an edit for an existing candidate (matched by identificador). Igual que
   * el alta: sólo se aplica en local si la hoja confirmó, y entonces se
   * re-sincroniza toda la base en segundo plano.
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

/**
 * Resultado de una escritura en la hoja, ya interpretado.
 *
 * ## Por qué hace falta interpretar la respuesta
 *
 * `fetch` sólo rechaza cuando la petición no llega a destino: un `500`, una
 * pantalla de acceso de Google o un `{"status":"error"}` del propio script
 * resuelven la promesa con toda normalidad. El código anterior hacía
 * `await fetch(...)` y, si no lanzaba, daba la operación por buena: el analista
 * leía «Postulante registrado correctamente», el formulario se cerraba y en la
 * hoja no había nada. Peor aún, la ficha se añadía a la copia local, así que
 * durante un minuto —hasta el siguiente refresco— parecía estar guardada.
 *
 * Ahora se distinguen tres desenlaces, porque cada uno pide otra reacción:
 *   · `ok`            — el script confirmó la escritura.
 *   · `rejected`      — llegó y el script la rechazó (dice por qué).
 *   · `unreachable`   — no se pudo confirmar (red caída, sesión de Google,
 *                       despliegue sin permiso «Cualquiera con el enlace»).
 */
type WriteOutcome =
  | { kind: "ok"; message: string }
  | { kind: "rejected"; message: string }
  | { kind: "unreachable"; message: string };

/**
 * POST a la hoja con verificación de la respuesta.
 *
 * El cuerpo va como `text/plain` a propósito: evita la petición de comprobación
 * previa (preflight) de CORS, que un despliegue estándar de Apps Script no sabe
 * responder. Y `redirect: "follow"` es obligatorio: Google contesta con un 302
 * y sin seguirlo la llamada falla con 404 en producción (Vercel).
 */
async function postToSheet(
  body: unknown,
  okMessage: string,
): Promise<WriteOutcome> {
  let res: Response;
  try {
    res = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      kind: "unreachable",
      message:
        "No se pudo contactar con la base de datos. Revise su conexión (o si un antivirus/proxy bloquea script.google.com) y vuelva a intentarlo: su avance no se ha perdido.",
    };
  }

  if (!res.ok) {
    return {
      kind: "unreachable",
      message: `La base de datos respondió con un error HTTP ${res.status}. Nada se guardó; su avance sigue aquí.`,
    };
  }

  // Un despliegue sin permiso «Cualquiera con el enlace» devuelve la página de
  // acceso de Google en lugar de JSON: eso no es un éxito, es una advertencia.
  let data: { status?: string; message?: string } | null = null;
  try {
    data = (await res.json()) as { status?: string; message?: string };
  } catch {
    return {
      kind: "unreachable",
      message:
        "La base de datos respondió algo inesperado (posiblemente el despliegue de Apps Script pide iniciar sesión). No pudimos confirmar el guardado.",
    };
  }

  if (data && data.status && data.status !== "success") {
    return {
      kind: "rejected",
      message: data.message
        ? `La base de datos rechazó la operación: ${data.message}`
        : "La base de datos rechazó la operación.",
    };
  }
  return { kind: "ok", message: okMessage };
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
      const outcome = await postToSheet(
        candidate,
        "Postulante registrado correctamente.",
      );
      if (outcome.kind === "ok") {
        // Reflejo optimista SÓLO cuando la hoja confirmó la escritura: así la
        // ficha aparece al instante y el refresco posterior la encuentra de
        // verdad, en lugar de hacerla desaparecer al minuto siguiente.
        setRaw((prev) => [candidate, ...prev]);
      }
      return { ok: outcome.kind === "ok", message: outcome.message };
    },
    [],
  );

  const updateCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const id = String(candidate.identificador ?? "").trim();
      const matches = (c: RawCandidate) =>
        String(c.identificador ?? "").trim() === id;
      // `action: "update"` routes to the sheet upsert that edits the exact
      // row (matched by identificador) column by column.
      const outcome = await postToSheet(
        { action: "update", ...candidate },
        "Postulante actualizado correctamente.",
      );
      if (outcome.kind === "ok") {
        // Parche optimista para que la interfaz refleje la edición al instante…
        setRaw((prev) => prev.map((c) => (matches(c) ? { ...c, ...candidate } : c)));
        // …y refresco completo, porque el POST invalida la caché del backend y
        // así todos los módulos repintan desde una sola fuente de verdad.
        load();
      }
      return { ok: outcome.kind === "ok", message: outcome.message };
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
      const outcome = await postToSheet({ type: "perfil_cargo", ...body }, okMsg);
      if (outcome.kind === "ok") load();
      return { ok: outcome.kind === "ok", message: outcome.message };
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
