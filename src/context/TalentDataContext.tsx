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
import { readJson, safeLocal, writeJson } from "../shared/safeStorage";
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

/** Tiempo máximo que se espera a una escritura antes de darla por perdida. */
const WRITE_TIMEOUT_MS = 25_000;

/**
 * Escribe en la hoja y **comprueba de verdad si se guardó**.
 *
 * Antes cada escritura era un `await fetch(...)` a secas: no se miraba el código
 * HTTP ni el sobre `{status}` que devuelve el Apps Script. Con eso, un rechazo
 * del backend (identificador repetido, hoja bloqueada, despliegue caducado)
 * llegaba al analista como «Postulante registrado correctamente», el
 * cuestionario se cerraba y el trabajo se perdía sin dejar rastro. Reproducido
 * en el arnés de QA (`postulantes-alta-rechazada`).
 *
 * Aquí se cierran las cuatro puertas: tiempo límite —Apps Script puede quedarse
 * colgado y el botón se quedaba en «Guardando…» para siempre—, código HTTP,
 * respuesta que no es JSON (una página de error de Google lo es a menudo) y
 * sobre con `status: "error"`, cuyo mensaje se muestra tal cual porque lo escribe
 * el backend pensando en quien opera.
 */
async function writeToScript(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
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
        message: `El servidor respondió con un error (HTTP ${res.status}). No se guardó nada.`,
      };
    }
    const text = await res.text();
    // Un despliegue mal publicado responde HTML: no es un éxito, aunque el
    // código HTTP sea 200.
    let envelope: { status?: string; message?: string } | null = null;
    try {
      envelope = text ? (JSON.parse(text) as { status?: string; message?: string }) : null;
    } catch {
      envelope = null;
    }
    if (envelope === null && text.trim() !== "") {
      return {
        ok: false,
        message:
          "El servidor no devolvió una respuesta válida. Verifique el despliegue del backend.",
      };
    }
    if (envelope?.status && envelope.status !== "success") {
      return {
        ok: false,
        message: envelope.message || "El servidor rechazó la operación.",
      };
    }
    return { ok: true, message: envelope?.message || "Operación registrada." };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      message: aborted
        ? "El servidor tardó demasiado en responder. No se guardó nada; vuelva a intentarlo."
        : "No se pudo conectar con el servidor. Revise su conexión e inténtelo de nuevo.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Escrituras confirmadas que la hoja todavía no devuelve              */
/* ------------------------------------------------------------------ */

const PENDING_KEY = "bdp-talent-pendientes";
/** Una escritura confirmada se sostiene como máximo un día. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

interface PendingWrite {
  row: RawCandidate;
  at: number;
}

/**
 * El backend confirma la escritura, pero la lectura siguiente puede no traerla
 * todavía: Apps Script cachea la respuesta del `doGet` y la hoja tarda en
 * propagar. El módulo de Postulantes refresca justo después de guardar, así que
 * el postulante recién registrado **desaparecía de la lista** y volvía sólo al
 * refresco siguiente. Desde la silla del analista eso es exactamente «registro a
 * alguien y no se guarda» (reproducido en `postulantes-base-rezagada`).
 *
 * Las filas confirmadas se sostienen aquí —sobreviven incluso a una recarga— y
 * se sueltan en cuanto la hoja las devuelve, o al cabo de un día si algo salió
 * mal en el servidor y nunca aparecen.
 */
function readPending(): PendingWrite[] {
  const list = readJson<PendingWrite[]>(safeLocal, PENDING_KEY, []);
  if (!Array.isArray(list)) return [];
  const fresh = list.filter(
    (p) => p && typeof p === "object" && p.row && Date.now() - Number(p.at) < PENDING_TTL_MS,
  );
  return fresh;
}

function writePending(list: PendingWrite[]): void {
  if (list.length === 0) safeLocal.removeItem(PENDING_KEY);
  else writeJson(safeLocal, PENDING_KEY, list);
}

const identOf = (c: RawCandidate) => String(c.identificador ?? "").trim();

/** Añade a la carga las filas confirmadas que la hoja aún no devuelve. */
function mergePending(rows: RawCandidate[], pending: PendingWrite[]): RawCandidate[] {
  if (pending.length === 0) return rows;
  const present = new Set(rows.map(identOf));
  const missing = pending.filter((p) => !present.has(identOf(p.row)));
  return missing.length ? [...missing.map((p) => p.row), ...rows] : rows;
}

function readCache(): CachedPayload | null {
  const parsed = readJson<CachedPayload | null>(safeLocal, CACHE_KEY, null);
  if (!parsed || !Array.isArray(parsed.candidatos)) return null;
  return parsed;
}

function writeCache(payload: TalentPayload): void {
  writeJson(safeLocal, CACHE_KEY, {
    ...payload,
    cachedAt: new Date().toISOString(),
  } satisfies CachedPayload);
}

export function TalentDataProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from cache so the first paint already has data
  // (stale-while-revalidate): the network refresh then runs in the background.
  const initial = readCache();
  // Las escrituras confirmadas que la hoja aún no devuelve se sostienen aparte,
  // así que un registro recién guardado sigue a la vista incluso tras recargar.
  const pendingRef = useRef<PendingWrite[]>(readPending());

  const [raw, setRaw] = useState<RawCandidate[]>(
    mergePending(initial?.candidatos ?? [], pendingRef.current),
  );
  // Espejo de `raw` para leerlo desde los callbacks sin volverlos a crear en
  // cada carga de la base (y sin capturar una copia vieja).
  const rawRef = useRef(raw);
  rawRef.current = raw;
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
        // Una fila pendiente se suelta en cuanto la hoja la devuelve.
        const present = new Set(payload.candidatos.map(identOf));
        const stillPending = pendingRef.current.filter(
          (p) => !present.has(identOf(p.row)) && Date.now() - p.at < PENDING_TTL_MS,
        );
        if (stillPending.length !== pendingRef.current.length) {
          pendingRef.current = stillPending;
          writePending(stillPending);
        }
        setRaw(mergePending(payload.candidatos, stillPending));
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
      const result = await writeToScript(candidate);
      if (!result.ok) {
        // Antes, ante un fallo, la ficha se insertaba igual en la lista local:
        // el analista la veía «guardada» y desaparecía al siguiente refresco,
        // sin quedar en ninguna parte. Ahora no se inventa nada — el
        // cuestionario se queda abierto con el aviso y el borrador intacto.
        return {
          ok: false,
          message: `${result.message} Su avance sigue en el formulario.`,
        };
      }
      // Escritura confirmada: se sostiene hasta que la hoja la devuelva.
      const entry: PendingWrite = { row: candidate, at: Date.now() };
      pendingRef.current = [
        ...pendingRef.current.filter((p) => identOf(p.row) !== identOf(candidate)),
        entry,
      ];
      writePending(pendingRef.current);
      setRaw((prev) => mergePending(prev, [entry]));
      return { ok: true, message: "Postulante registrado correctamente." };
    },
    [],
  );

  const updateCandidate = useCallback(
    async (candidate: RawCandidate) => {
      const id = identOf(candidate);
      // La hoja no impone que el identificador sea único, y el backend edita la
      // **primera** fila que coincide. Con dos filas homónimas, guardar desde la
      // segunda ficha sobrescribiría la primera sin que nadie se enterase: mejor
      // detenerse y pedir que se corrija el duplicado en la hoja.
      const homonimas = rawRef.current.filter((c) => identOf(c) === id).length;
      if (homonimas > 1) {
        return {
          ok: false,
          message: `Hay ${homonimas} filas con el identificador ${id} en la hoja. Corrija el duplicado antes de editar: el guardado modificaría la primera de ellas.`,
        };
      }
      // `action: "update"` routes to the sheet upsert that edits the exact row
      // (matched by identificador) column by column.
      const result = await writeToScript({ action: "update", ...candidate });
      if (!result.ok) {
        // No se toca la copia local: mostrar el cambio como aplicado cuando la
        // hoja no lo tiene sería mentir sobre el estado del expediente.
        return {
          ok: false,
          message: `${result.message} Los cambios siguen en el formulario.`,
        };
      }
      setRaw((prev) => prev.map((c) => (identOf(c) === id ? { ...c, ...candidate } : c)));
      // La escritura invalida la caché del backend, así que un refetch ahora
      // devuelve datos frescos y repinta todos los módulos desde una sola
      // fuente de verdad.
      load();
      return { ok: true, message: "Postulante actualizado correctamente." };
    },
    [load],
  );

  // ---- Perfiles de Cargo (perfil_cargo_bdp) ------------------------------
  // Mismo camino que las altas de postulante: se comprueba el sobre del backend
  // y sólo entonces se re-sincroniza todo, de modo que la hoja siga siendo la
  // única fuente de verdad. El backend direcciona las filas por su índice
  // 1-based (`fila`) porque la hoja no tiene columna de id; el refetch tras cada
  // escritura mantiene esos índices frescos (al borrar, las filas suben).
  const postPerfilCargo = useCallback(
    async (body: Record<string, unknown>, okMsg: string) => {
      const result = await writeToScript({ type: "perfil_cargo", ...body });
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
