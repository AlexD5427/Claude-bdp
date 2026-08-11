import { useSyncExternalStore } from "react";
import { DOC_TEMPLATE, type DocGroup } from "./docTemplate";
import {
  DOC_STATUS_LABELS,
  DOC_TABLE_DEFAULT,
  dossierYear,
  normalizeDossier,
  type DocAgrupacion,
  type DocAnimaciones,
  type DocConexion,
  type DocDensidad,
  type DocItem,
  type DocOrden,
  type DocStatus,
  type DocSyncEstado,
  type DocVista,
  type Dossier,
  type EmailEvent,
} from "./doc/docSchema";
import {
  DocApiFallo,
  docApi,
  drenarCola,
  getDocScriptUrl,
  hayBackendConfigurado,
  leerCola,
  setDocScriptUrl,
} from "./doc/docApi";

/**
 * Almacén de expedientes de documentación.
 *
 * -- Cómo funciona -----------------------------------------------------------
 * Local primero. Toda escritura entra en `localStorage` y la interfaz se
 * actualiza en el mismo fotograma; la sincronización con el libro de Google
 * ocurre después, en segundo plano. Quien registra documentos no debería
 * esperar a una hoja de cálculo para ver el tic verde.
 *
 * -- Qué cambió respecto a la versión anterior -------------------------------
 * Antes se lanzaba un POST a ciegas cuyo resultado nadie miraba: si fallaba, el
 * dato se perdía sin que nadie se enterara. Ahora cada envío tiene resultado
 * observable, lo que falla se encola y el estado de la conexión se expone para
 * poder mostrarlo. Un fallo silencioso en el módulo que controla la
 * documentación legal de las personas contratadas no es aceptable.
 *
 * -- Por qué se agrupan los envíos ------------------------------------------
 * Marcar seis documentos seguidos son seis reescrituras locales, pero una sola
 * llamada al backend 900 ms después del último cambio. Apps Script tiene cuotas
 * y cada llamada cuesta cerca de un segundo.
 */

export type { DocItem, DocStatus, Dossier, EmailEvent };
export { DOC_STATUS_LABELS };

export interface DocSettings {
  provider: "gmail" | "outlook";
  /** Cuenta remitente (el enlace de redacción la abre). */
  fromAccount: string;
  /** Dirección en copia en cada recordatorio. */
  ccEmail: string;
  /** Cadencia de recordatorios, en días. */
  intervalDays: number;
  autoSendEnabled: boolean;
  requireConfirmation: boolean;
  subjectTemplate: string;
  bodyTemplate: string;

  /* Presentación. */
  vista: DocVista;
  densidad: DocDensidad;
  animaciones: DocAnimaciones;
  agruparPor: DocAgrupacion;
  ordenarPor: DocOrden;
  mostrarHeredados: boolean;
  columnasVisibles: string[];
  scrollSuave: boolean;
  efectosFondo: boolean;

  /* Conexión con el libro. */
  syncEnabled: boolean;
  scriptUrl: string;
  syncIntervalMin: number;
}

export interface DocState {
  dossiers: Record<string, Dossier>;
  settings: DocSettings;
}

export interface DocSyncState {
  conexion: DocConexion;
  estado: DocSyncEstado;
  /** Operaciones esperando a poder enviarse. */
  pendientes: number;
  /** Expedientes con cambios locales todavía no confirmados. */
  sucios: string[];
  ultimaSync: string;
  ultimoError: string;
  ultimaPista: string;
  backend: string;
  libro: string;
  libroUrl: string;
  instalado: boolean;
  anios: number[];
  ocupado: boolean;
  /** Descripción de la tarea larga en curso, para la barra de progreso. */
  tarea: string;
  progreso: number;
}

const KEY = "bdp-documentacion";

export const DEFAULT_SETTINGS: DocSettings = {
  provider: "gmail",
  fromAccount: "",
  ccEmail: "",
  intervalDays: 3,
  autoSendEnabled: true,
  requireConfirmation: true,
  subjectTemplate: "BDP · Documentación pendiente para su incorporación",
  bodyTemplate: [
    "Estimado/a {nombre}:",
    "",
    "Como parte de su proceso de incorporación al Banco de Desarrollo Productivo para el cargo de {cargo}, le recordamos que aún tenemos pendiente la recepción de la siguiente documentación:",
    "",
    "{faltantes}",
    "",
    "Han transcurrido {dias} día(s) desde su fecha de ingreso ({fecha_ingreso}). Le agradeceremos presentar la documentación faltante a la brevedad posible.",
    "",
    "Ante cualquier consulta, quedamos a su disposición.",
    "",
    "Saludos cordiales,",
    "Equipo de Reclutamiento y Selección · BDP",
  ].join("\n"),

  vista: "tarjetas",
  densidad: "comoda",
  animaciones: "completas",
  agruparPor: "ninguna",
  ordenarPor: "reciente",
  mostrarHeredados: true,
  columnasVisibles: [...DOC_TABLE_DEFAULT],
  scrollSuave: true,
  efectosFondo: true,

  syncEnabled: true,
  scriptUrl: "",
  syncIntervalMin: 5,
};

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Lee el estado guardado.
 *
 * Cada expediente pasa por `normalizeDossier` porque el almacenamiento local
 * puede venir de una versión anterior del módulo, cuando algunos campos no
 * existían. Un expediente que no se puede normalizar se descarta en lugar de
 * romper el arranque: es preferible perder una ficha corrupta a que el módulo
 * entero deje de abrir.
 */
function load(): DocState {
  if (typeof window === "undefined") return { dossiers: {}, settings: { ...DEFAULT_SETTINGS } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { dossiers: {}, settings: { ...DEFAULT_SETTINGS } };
    const parsed = JSON.parse(raw) as Partial<DocState>;

    const dossiers: Record<string, Dossier> = {};
    for (const [id, value] of Object.entries(parsed.dossiers ?? {})) {
      const limpio = normalizeDossier(value);
      if (limpio) dossiers[id] = limpio;
    }

    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    if (!Array.isArray(settings.columnasVisibles) || !settings.columnasVisibles.length) {
      settings.columnasVisibles = [...DOC_TABLE_DEFAULT];
    }

    return { dossiers, settings };
  } catch {
    return { dossiers: {}, settings: { ...DEFAULT_SETTINGS } };
  }
}

let state: DocState = load();
const listeners = new Set<() => void>();

let sync: DocSyncState = {
  conexion: "desconectado",
  estado: "inactivo",
  pendientes: 0,
  sucios: [],
  ultimaSync: "",
  ultimoError: "",
  ultimaPista: "",
  backend: "",
  libro: "",
  libroUrl: "",
  instalado: false,
  anios: [],
  ocupado: false,
  tarea: "",
  progreso: 0,
};
const syncListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  setDocScriptUrl(state.settings.scriptUrl);
  sync.pendientes = leerCola().length;
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* cuota agotada o modo privado */
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

function emitSync(patch: Partial<DocSyncState>) {
  sync = { ...sync, ...patch };
  for (const l of syncListeners) l();
}

function marcarSucio(id: string) {
  if (sync.sucios.includes(id)) return;
  emitSync({ sucios: [...sync.sucios, id] });
}

function marcarLimpio(id: string) {
  if (!sync.sucios.includes(id)) return;
  emitSync({ sucios: sync.sucios.filter((x) => x !== id) });
}

/* ------------------------------------------------------------------ */
/* Sincronización                                                      */
/* ------------------------------------------------------------------ */

const temporizadores = new Map<string, ReturnType<typeof setTimeout>>();
const RETARDO_MS = 900;

function sincronizacionActiva(): boolean {
  return state.settings.syncEnabled && hayBackendConfigurado();
}

/**
 * Programa el envío de un expediente.
 *
 * El temporizador se reinicia con cada cambio, así que una ráfaga de ediciones
 * produce un solo envío con el estado final.
 */
function programarSync(id: string) {
  marcarSucio(id);
  if (!sincronizacionActiva()) return;

  const previo = temporizadores.get(id);
  if (previo) clearTimeout(previo);

  temporizadores.set(
    id,
    setTimeout(() => {
      temporizadores.delete(id);
      void enviarDossier(id);
    }, RETARDO_MS),
  );
}

async function enviarDossier(id: string) {
  const dossier = state.dossiers[id];
  if (!dossier) return;

  emitSync({ estado: "guardando" });
  try {
    await docApi.guardar(dossier);
    marcarLimpio(id);
    emitSync({
      estado: sync.sucios.length > 1 ? "guardando" : "guardado",
      conexion: "conectado",
      ultimaSync: new Date().toISOString(),
      ultimoError: "",
      ultimaPista: "",
      pendientes: leerCola().length,
    });
  } catch (e) {
    const fallo = e as DocApiFallo;
    emitSync({
      estado: fallo?.encolado ? "pendiente" : "error",
      conexion: fallo?.red ? "sin_conexion" : "error",
      ultimoError: fallo?.message || "No se pudo guardar en el libro.",
      ultimaPista: fallo?.pista || "",
      pendientes: leerCola().length,
    });
  }
}

/** Fuerza el envío inmediato de todo lo que esté esperando su temporizador. */
export async function guardarPendientesAhora(): Promise<void> {
  const ids = Array.from(temporizadores.keys());
  for (const id of ids) {
    const t = temporizadores.get(id);
    if (t) clearTimeout(t);
    temporizadores.delete(id);
    await enviarDossier(id);
  }
}

/** Comprueba si el backend responde y en qué estado está el libro. */
export async function comprobarConexion(): Promise<DocConexion> {
  if (!sincronizacionActiva()) {
    emitSync({ conexion: "desconectado", ultimoError: "", ultimaPista: "" });
    return "desconectado";
  }

  emitSync({ conexion: "comprobando" });
  try {
    const estado = await docApi.estado();
    const conexion: DocConexion = estado.instalado ? "conectado" : "sin_instalar";
    emitSync({
      conexion,
      backend: estado.backend || "",
      libro: estado.libro || "",
      libroUrl: estado.libroUrl || "",
      instalado: !!estado.instalado,
      anios: Array.isArray(estado.anios) ? estado.anios : [],
      ultimoError: estado.problema || "",
      ultimaPista: estado.instalado
        ? ""
        : "Ejecuta «Instalar o reparar» desde Configuración › Mantenimiento.",
      pendientes: leerCola().length,
    });
    return conexion;
  } catch (e) {
    const fallo = e as DocApiFallo;
    const conexion: DocConexion = fallo?.red ? "sin_conexion" : "error";
    emitSync({
      conexion,
      ultimoError: fallo?.message || "No se pudo contactar con el backend.",
      ultimaPista: fallo?.pista || "",
      pendientes: leerCola().length,
    });
    return conexion;
  }
}

/** Reenvía lo que quedó en la cola por falta de conexión. */
export async function enviarCola(): Promise<{ enviados: number; fallidos: number }> {
  if (!sincronizacionActiva()) return { enviados: 0, fallidos: 0 };

  emitSync({ ocupado: true, tarea: "Enviando cambios pendientes", progreso: 0 });
  try {
    const total = leerCola().length;
    const r = await drenarCola((hechos) => {
      emitSync({ progreso: total ? Math.round((hechos / total) * 100) : 100 });
    });
    emitSync({
      pendientes: r.restantes,
      estado: r.restantes ? "pendiente" : "guardado",
      ultimaSync: new Date().toISOString(),
    });
    return { enviados: r.enviados, fallidos: r.fallidos };
  } finally {
    emitSync({ ocupado: false, tarea: "", progreso: 0 });
  }
}

/**
 * Trae los expedientes del libro y los mezcla con los locales.
 *
 * Ante conflicto gana el que se editó más tarde, salvo que el local aún esté
 * pendiente de envío: en ese caso se respeta el local, porque descartarlo
 * borraría trabajo que la persona ya dio por guardado.
 */
export async function traerDelBackend(): Promise<{ recibidos: number; fusionados: number }> {
  if (!sincronizacionActiva()) return { recibidos: 0, fusionados: 0 };

  emitSync({ ocupado: true, tarea: "Descargando expedientes del libro", progreso: 10 });
  try {
    const respuesta = await docApi.listar({ todos: true, detalle: true });
    const lista = Array.isArray(respuesta?.expedientes) ? respuesta.expedientes : [];

    emitSync({ progreso: 60 });

    const dossiers = { ...state.dossiers };
    let fusionados = 0;

    for (const crudo of lista) {
      const remoto = normalizeDossier(crudo);
      if (!remoto) continue;

      const local = dossiers[remoto.identificador];
      if (!local) {
        dossiers[remoto.identificador] = remoto;
        fusionados++;
        continue;
      }

      if (sync.sucios.includes(remoto.identificador)) continue;

      const tLocal = local.updatedAt || local.createdAt || "";
      const tRemoto = remoto.updatedAt || remoto.createdAt || "";
      if (tRemoto >= tLocal) {
        dossiers[remoto.identificador] = remoto;
        fusionados++;
      }
    }

    state = { ...state, dossiers };
    emit();
    emitSync({
      progreso: 100,
      conexion: "conectado",
      ultimaSync: new Date().toISOString(),
      ultimoError: "",
      ultimaPista: "",
    });

    return { recibidos: lista.length, fusionados };
  } catch (e) {
    const fallo = e as DocApiFallo;
    emitSync({
      conexion: fallo?.red ? "sin_conexion" : "error",
      ultimoError: fallo?.message || "No se pudieron descargar los expedientes.",
      ultimaPista: fallo?.pista || "",
    });
    return { recibidos: 0, fusionados: 0 };
  } finally {
    emitSync({ ocupado: false, tarea: "", progreso: 0 });
  }
}

/** Ciclo completo: enviar lo pendiente y luego traer lo del libro. */
export async function sincronizarTodo(): Promise<void> {
  await guardarPendientesAhora();
  await enviarCola();
  await traerDelBackend();
}

/* ------------------------------------------------------------------ */
/* Semillas                                                            */
/* ------------------------------------------------------------------ */

export interface SeedOptions {
  includeGarantia: boolean;
  includeCumplimiento: boolean;
}

/** Construye la lista inicial de documentos de un expediente nuevo. */
export function buildSeedItems(opts: SeedOptions): DocItem[] {
  return DOC_TEMPLATE.filter((def) => {
    if (def.group === "garantia") return opts.includeGarantia;
    if (def.group === "cumplimiento") return opts.includeCumplimiento;
    return true;
  }).map((def) => ({
    id: def.id,
    label: def.label,
    group: def.group,
    status: "pendiente" as DocStatus,
    pages: 0,
    observation: "",
    allowProrroga: def.prorroga ?? false,
    prorroga: undefined,
  }));
}

/* ------------------------------------------------------------------ */
/* Mutaciones                                                          */
/* ------------------------------------------------------------------ */

export function createDossier(input: {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  correo: string;
  fechaIngreso: string;
  seed: SeedOptions;
}): void {
  const now = new Date().toISOString();
  const dossier: Dossier = {
    identificador: input.identificador,
    nombre: input.nombre,
    cargo: input.cargo,
    agencia: input.agencia,
    gerencia: input.gerencia,
    correo: input.correo,
    fechaIngreso: input.fechaIngreso,
    createdAt: now,
    updatedAt: now,
    items: buildSeedItems(input.seed),
    emailLog: [],
  };
  state = { ...state, dossiers: { ...state.dossiers, [input.identificador]: dossier } };
  emit();
  programarSync(input.identificador);
}

function withDossier(id: string, fn: (d: Dossier) => Dossier): void {
  const current = state.dossiers[id];
  if (!current) return;
  const next = { ...fn(current), updatedAt: new Date().toISOString() };
  state = { ...state, dossiers: { ...state.dossiers, [id]: next } };
  emit();
  programarSync(id);
}

export function updateDossierMeta(id: string, patch: Partial<Dossier>): void {
  withDossier(id, (d) => ({ ...d, ...patch }));
}

export function updateItem(id: string, itemId: string, patch: Partial<DocItem>): void {
  withDossier(id, (d) => ({
    ...d,
    items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
  }));
}

export function addItem(id: string, group: DocGroup, label = "Nuevo documento"): void {
  withDossier(id, (d) => ({
    ...d,
    items: [
      ...d.items,
      {
        id: uid(),
        label,
        group,
        status: "pendiente",
        pages: 0,
        observation: "",
        allowProrroga: true,
      },
    ],
  }));
}

export function removeItem(id: string, itemId: string): void {
  withDossier(id, (d) => ({ ...d, items: d.items.filter((it) => it.id !== itemId) }));
}

export function removeDossier(id: string): void {
  const next = { ...state.dossiers };
  delete next[id];
  state = { ...state, dossiers: next };
  emit();
  marcarLimpio(id);

  const t = temporizadores.get(id);
  if (t) {
    clearTimeout(t);
    temporizadores.delete(id);
  }

  if (!sincronizacionActiva()) return;
  void docApi
    .borrar(id)
    .then(() => emitSync({ ultimaSync: new Date().toISOString(), pendientes: leerCola().length }))
    .catch((e: DocApiFallo) => {
      emitSync({
        estado: e?.encolado ? "pendiente" : "error",
        ultimoError: e?.message || "No se pudo borrar en el libro.",
        ultimaPista: e?.pista || "",
        pendientes: leerCola().length,
      });
    });
}

export function logEmail(id: string, event: Omit<EmailEvent, "id" | "at">): void {
  const full: EmailEvent = { ...event, id: uid(), at: new Date().toISOString() };
  withDossier(id, (d) => ({ ...d, emailLog: [full, ...d.emailLog] }));

  if (!sincronizacionActiva()) return;
  void docApi.registrarAviso(id, full).catch(() => {
    /* el aviso ya viaja dentro del expediente; esto solo lo anota antes */
  });
}

export function setSettings(patch: Partial<DocSettings>): void {
  const antes = state.settings;
  state = { ...state, settings: { ...antes, ...patch } };
  emit();

  if (patch.scriptUrl !== undefined && patch.scriptUrl !== antes.scriptUrl) {
    setDocScriptUrl(patch.scriptUrl);
    void comprobarConexion();
  }
  if (patch.syncEnabled === true && !antes.syncEnabled) {
    void comprobarConexion();
  }
  if (patch.syncEnabled === false) {
    emitSync({ conexion: "desconectado" });
  }
}

/* ------------------------------------------------------------------ */
/* Importación masiva                                                  */
/* ------------------------------------------------------------------ */

export type ModoImportacion = "fusionar" | "reemplazar" | "solo_nuevos";

/**
 * Incorpora expedientes venidos de un archivo.
 *
 * Se escriben primero en local y se suben después, de modo que una importación
 * sin conexión también funciona: los datos quedan visibles y la cola se encarga
 * de enviarlos cuando se pueda.
 */
export async function importarDossiers(
  entrada: unknown[],
  modo: ModoImportacion = "fusionar",
  subirAlBackend = true,
): Promise<{ leidos: number; aplicados: number; omitidos: number; subidos: number; error?: string }> {
  const limpios: Dossier[] = [];
  for (const crudo of entrada) {
    const d = normalizeDossier(crudo);
    if (d) limpios.push(d);
  }

  const base = modo === "reemplazar" ? {} : { ...state.dossiers };
  let aplicados = 0;
  let omitidos = 0;

  for (const d of limpios) {
    const existe = !!base[d.identificador];
    if (existe && modo === "solo_nuevos") {
      omitidos++;
      continue;
    }
    base[d.identificador] = d;
    aplicados++;
  }

  state = { ...state, dossiers: base };
  emit();

  let subidos = 0;
  let error: string | undefined;

  if (subirAlBackend && sincronizacionActiva() && aplicados > 0) {
    emitSync({ ocupado: true, tarea: "Subiendo expedientes al libro", progreso: 5 });
    try {
      // Por lotes: Apps Script corta a los seis minutos y una importación
      // grande en una sola llamada no llega a terminar.
      const TAM = 40;
      const aSubir = limpios.slice(0, aplicados + omitidos);
      for (let i = 0; i < aSubir.length; i += TAM) {
        const lote = aSubir.slice(i, i + TAM);
        const r = await docApi.importar(lote);
        subidos += (r?.creados ?? 0) + (r?.actualizados ?? 0);
        emitSync({ progreso: Math.round(((i + lote.length) / aSubir.length) * 100) });
      }
      for (const d of limpios) marcarLimpio(d.identificador);
      emitSync({ conexion: "conectado", ultimaSync: new Date().toISOString() });
    } catch (e) {
      const fallo = e as DocApiFallo;
      error = fallo?.message || "No se pudieron subir los expedientes.";
      emitSync({
        conexion: fallo?.red ? "sin_conexion" : "error",
        ultimoError: error,
        ultimaPista: fallo?.pista || "",
        pendientes: leerCola().length,
      });
    } finally {
      emitSync({ ocupado: false, tarea: "", progreso: 0 });
    }
  }

  return { leidos: entrada.length, aplicados, omitidos, subidos, error };
}

/** Estado completo, para exportarlo tal cual. */
export function snapshotEstado(): DocState {
  return state;
}

export function listaDossiers(): Dossier[] {
  return Object.values(state.dossiers);
}

export function aniosConDatos(): number[] {
  const set = new Set<number>();
  for (const d of Object.values(state.dossiers)) set.add(dossierYear(d));
  return Array.from(set).sort((a, b) => b - a);
}

export function urlBackendActual(): string {
  return getDocScriptUrl();
}

/* ------------------------------------------------------------------ */
/* Enlaces con React                                                   */
/* ------------------------------------------------------------------ */

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): DocState {
  return state;
}

export function useDocStore(): DocState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribeSync(cb: () => void) {
  syncListeners.add(cb);
  return () => syncListeners.delete(cb);
}
function getSyncSnapshot(): DocSyncState {
  return sync;
}

export function useDocSync(): DocSyncState {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}
