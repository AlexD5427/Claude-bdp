/**
 * Estado de la consola de Documentación.
 *
 * ── Qué guarda y qué no ─────────────────────────────────────────────────────
 * Guarda lo mínimo para que la interfaz no vuelva a pedir lo que ya sabe: la
 * conexión, las capacidades del actor, el catálogo, la sección abierta y las
 * preferencias de filtro. NO guarda los expedientes: la lista y el detalle se
 * piden al backend cuando se necesitan, porque son datos que otras personas están
 * editando al mismo tiempo y una copia en memoria envejece en segundos.
 *
 * Lo persistente va a `localStorage` con una clave propia: la sección abierta y los
 * filtros sobreviven a un recargado, que es lo que uno espera al volver de otra
 * pestaña. Nada de eso son datos de negocio.
 *
 * ── Sobre `useSyncExternalStore` ────────────────────────────────────────────
 * Se usa `createStore`, el mismo factory que el resto de la aplicación
 * (`configStore`, `hiringStore`). Sin librería de estado: un módulo no debería
 * añadir una dependencia para guardar catorce campos.
 */

import { createStore } from "../../../shared/store";
import { configurarCliente, hayBackendConfigurado, mensajeDeError, urlCliente } from "../api/client";
import { docApi, type CatalogoCliente, type EstadoModulo } from "../api/acciones";
import { FILTROS_VACIOS, type FiltrosExpedientes } from "../domain/progreso";
import type { Capacidades, SeccionId } from "../domain/vocabulario";
import { obtenerPreferencias } from "./preferencias";

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

export type EstadoConexion = "sin_configurar" | "comprobando" | "conectado" | "sin_instalar" | "sin_conexion" | "error";

/** Densidad de las tablas. Preferencia visual, nada más. */
export type Densidad = "compacta" | "comoda" | "amplia";

/** Cómo se presenta la lista de expedientes: tabla de trabajo o tarjetas. */
export type VistaLista = "tabla" | "tarjetas";

/**
 * Dos lecturas de la misma lista.
 *
 * `operativo` prioriza lo que hay que hacer —estado, avance, faltantes, plazo—;
 * `auditoria` prioriza lo que hay que poder demostrar: identificador, versión,
 * quién tocó qué y cuándo. Son las mismas filas con otras columnas: nadie tiene
 * que exportar a Excel para ver la versión de un expediente.
 */
export type ModoLista = "operativo" | "auditoria";

export interface ConsolaState {
  /* Navegación y preferencias (persistidas). */
  seccion: SeccionId;
  filtros: FiltrosExpedientes;
  densidad: Densidad;
  vistaLista: VistaLista;
  modoLista: ModoLista;
  /* Conexión y permisos (en memoria). */
  conexion: EstadoConexion;
  estado: EstadoModulo | null;
  capacidades: Capacidades;
  rol: string;
  actor: string;
  catalogo: CatalogoCliente | null;
  notificacionesNoLeidas: number;
  /* Diagnóstico de la última operación. */
  cargando: number;
  ultimoError: { mensaje: string; pista: string; codigo: string } | null;
  ultimaSincronizacion: string;
}

const CLAVE = "bdp-documentacion-consola";

/* ------------------------------------------------------------------ */
/* Catálogo en caché: la primera red de seguridad                      */
/* ------------------------------------------------------------------ */

/**
 * El catálogo se guarda aparte, con su sello de tiempo.
 *
 * ── Por qué ─────────────────────────────────────────────────────────────────
 * El catálogo es lo que decide qué documentos existen y cuáles aplican a cada
 * rama. El asistente de alta, la vista del expediente y los reportes lo necesitan
 * para pintar algo. Si la primera llamada falla —red mala, Apps Script tardando,
 * implementación recién publicada—, sin caché el formulario aparece VACÍO: la
 * persona ve un paso sin documentos y concluye que el módulo está roto.
 *
 * Con la copia local, el módulo abre con el último catálogo conocido y lo
 * reemplaza en silencio cuando el backend contesta. Se guarda por separado del
 * resto del estado porque tiene otro ciclo de vida: las preferencias cambian a
 * cada rato y el catálogo casi nunca.
 *
 * No es un dato personal: son nombres de documentos exigibles y las listas de
 * agencias y gerencias. Nada de expedientes ni de personas se guarda aquí.
 */
const CLAVE_CATALOGO = "bdp-documentacion-catalogo";

interface CatalogoEnCache {
  catalogo: CatalogoCliente;
  guardadoEn: string;
}

function leerCatalogoCache(): CatalogoEnCache | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_CATALOGO);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo) as CatalogoEnCache;
    // Se valida la forma: un `localStorage` de una versión anterior no debe
    // tumbar el arranque del módulo.
    if (!guardado?.catalogo || !Array.isArray(guardado.catalogo.documentos)) return null;
    if (!Array.isArray(guardado.catalogo.aplicabilidad)) return null;
    return guardado;
  } catch {
    return null;
  }
}

function guardarCatalogoCache(catalogo: CatalogoCliente): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CLAVE_CATALOGO, JSON.stringify({ catalogo, guardadoEn: new Date().toISOString() }));
  } catch {
    /* almacenamiento lleno o bloqueado: la caché es una ayuda, no un requisito */
  }
}

/** Cuándo se guardó el catálogo que hay en memoria. Vacío si viene del servidor. */
export function catalogoEnCacheDesde(): string {
  return leerCatalogoCache()?.guardadoEn ?? "";
}

const DENSIDADES: Densidad[] = ["compacta", "comoda", "amplia"];

const INICIAL: ConsolaState = {
  seccion: "panel",
  filtros: { ...FILTROS_VACIOS },
  densidad: "comoda",
  vistaLista: "tabla",
  modoLista: "operativo",
  conexion: "sin_configurar",
  estado: null,
  capacidades: { ver: true },
  rol: "",
  actor: "",
  catalogo: null,
  notificacionesNoLeidas: 0,
  cargando: 0,
  ultimoError: null,
  ultimaSincronizacion: "",
};

/**
 * Solo se persiste lo que es preferencia.
 *
 * Guardar las capacidades sería peligroso: al cambiar de perfil, la interfaz
 * mostraría botones del rol anterior hasta la primera respuesta del servidor.
 */
const consola = createStore<ConsolaState>(INICIAL, {
  persistKey: CLAVE,
  serialize: (estado) =>
    JSON.stringify({
      seccion: estado.seccion,
      filtros: estado.filtros,
      densidad: estado.densidad,
      vistaLista: estado.vistaLista,
      modoLista: estado.modoLista,
    }),
  deserialize: (raw) => {
    const parseado = JSON.parse(raw) as Partial<ConsolaState>;
    return {
      ...INICIAL,
      seccion: parseado.seccion ?? INICIAL.seccion,
      filtros: { ...FILTROS_VACIOS, ...(parseado.filtros ?? {}) },
      // Las preferencias visuales se validan al leerlas: un `localStorage`
      // editado a mano no debe poder dejar la tabla en un estado imposible.
      densidad: DENSIDADES.includes(parseado.densidad as Densidad) ? (parseado.densidad as Densidad) : "comoda",
      vistaLista: parseado.vistaLista === "tarjetas" ? "tarjetas" : "tabla",
      modoLista: parseado.modoLista === "auditoria" ? "auditoria" : "operativo",
    };
  },
});

/* Hidratación del catálogo: se hace aquí, después de crear el almacén, y no en
   `INICIAL`, porque leerlo requiere una constante que todavía no existe cuando se
   evalúa el estado inicial. Ocurre una vez, al cargar el módulo. */
const catalogoGuardado = leerCatalogoCache();
if (catalogoGuardado) consola.set((prev) => ({ ...prev, catalogo: catalogoGuardado.catalogo }));

export const useConsola = consola.use;
export const obtenerConsola = consola.get;

/* ------------------------------------------------------------------ */
/* Navegación y preferencias                                           */
/* ------------------------------------------------------------------ */

export function irASeccion(seccion: SeccionId): void {
  consola.set((prev) => (prev.seccion === seccion ? prev : { ...prev, seccion }));
}

export function ponerFiltros(patch: Partial<FiltrosExpedientes>): void {
  consola.set((prev) => ({
    ...prev,
    // Cualquier cambio de filtro vuelve a la primera página: quedarse en la 4 de
    // un resultado que ahora tiene 2 muestra una tabla vacía sin explicación.
    filtros: { ...prev.filtros, ...patch, pagina: patch.pagina ?? 1 },
  }));
}

/**
 * Vacía los filtros, menos el orden por defecto.
 *
 * «Limpiar filtros» quiere decir «quítame los recortes», no «devuélveme la
 * lista al revés de como la tengo configurada». El orden es una preferencia de
 * lectura, no un filtro, y sobrevive a la limpieza.
 */
export function limpiarFiltros(): void {
  consola.set((prev) => ({ ...prev, filtros: { ...FILTROS_VACIOS, orden: obtenerPreferencias().orden } }));
}

export function ponerDensidad(densidad: Densidad): void {
  consola.set((prev) => (prev.densidad === densidad ? prev : { ...prev, densidad }));
}

export function ponerVistaLista(vistaLista: VistaLista): void {
  consola.set((prev) => (prev.vistaLista === vistaLista ? prev : { ...prev, vistaLista }));
}

export function ponerModoLista(modoLista: ModoLista): void {
  consola.set((prev) => (prev.modoLista === modoLista ? prev : { ...prev, modoLista }));
}

/* ------------------------------------------------------------------ */
/* Carga y errores                                                     */
/* ------------------------------------------------------------------ */

/**
 * Contador de operaciones en curso.
 *
 * Es un contador y no un booleano porque hay pantallas que lanzan tres consultas
 * a la vez: con un booleano, la primera que termina apaga el indicador y la
 * interfaz parece lista mientras sigue cargando.
 */
export function marcarCarga(activa: boolean): void {
  consola.set((prev) => ({ ...prev, cargando: Math.max(0, prev.cargando + (activa ? 1 : -1)) }));
}

export function registrarError(error: unknown): { mensaje: string; pista: string; codigo: string } {
  const normalizado = mensajeDeError(error);
  consola.set((prev) => ({ ...prev, ultimoError: normalizado }));
  return normalizado;
}

export function limpiarError(): void {
  consola.set((prev) => (prev.ultimoError ? { ...prev, ultimoError: null } : prev));
}

/* ------------------------------------------------------------------ */
/* Conexión                                                            */
/* ------------------------------------------------------------------ */

/**
 * Comprueba la conexión y trae permisos y catálogo.
 *
 * Es lo primero que ocurre al abrir el módulo, y hasta ahora costaba DOS viajes
 * de red encadenados: primero `estado` —para saber si el libro está instalado y
 * qué puede hacer quien entra— y después `catalogo`, que no podía empezar antes
 * porque depende de la respuesta del primero. En Apps Script cada viaje paga el
 * arranque del intérprete y la apertura del libro: entre uno y tres segundos.
 * Dos viajes encadenados eran la mitad del tiempo de arranque del módulo.
 *
 * Ahora se pide `documentacion.arranque`, que resuelve las dos cosas en la misma
 * ejecución del backend. Si el backend desplegado no la conoce —porque es
 * anterior a este cambio— se cae a las dos llamadas de siempre. Es la misma
 * disciplina de recaída que ya usaba el alta completa: el frontend se puede
 * desplegar sin haber publicado todavía la versión nueva del Apps Script.
 */
export async function comprobarConexion(opciones: { actor?: string; rol?: string; url?: string } = {}): Promise<EstadoConexion> {
  configurarCliente({ actor: opciones.actor, rol: opciones.rol, url: opciones.url });

  if (!hayBackendConfigurado()) {
    consola.set((prev) => ({ ...prev, conexion: "sin_configurar", estado: null }));
    return "sin_configurar";
  }

  consola.set((prev) => ({ ...prev, conexion: "comprobando" }));
  marcarCarga(true);
  try {
    const { estado, catalogo, catalogoError } = await arrancar();
    const conexion: EstadoConexion = estado.instalado ? "conectado" : "sin_instalar";

    consola.set((prev) => ({
      ...prev,
      conexion,
      estado,
      capacidades: estado.capacidades ?? { ver: true },
      rol: estado.rol ?? "",
      actor: estado.actor ?? "",
      notificacionesNoLeidas: estado.notificacionesNoLeidas ?? 0,
      ultimaSincronizacion: new Date().toISOString(),
      ultimoError: estado.problema ? { mensaje: estado.problema, pista: "", codigo: "LIBRO" } : null,
      // El catálogo solo se reemplaza si llegó: pisar el de la caché con `null`
      // dejaría el formulario de alta vacío, que es peor que uno viejo.
      ...(catalogo ? { catalogo } : {}),
    }));

    if (catalogo) guardarCatalogoCache(catalogo);
    else if (catalogoError) {
      // Sin catálogo el módulo sigue siendo utilizable para consultar; solo el
      // formulario de alta queda limitado. Se avisa y no se tumba la pantalla.
      consola.set((prev) => ({ ...prev, ultimoError: { mensaje: catalogoError, pista: "", codigo: "CATALOGO" } }));
    }
    return conexion;
  } catch (error) {
    const normalizado = registrarError(error);
    const conexion: EstadoConexion = normalizado.codigo === "SIN_RED" || normalizado.codigo === "TIMEOUT" ? "sin_conexion" : "error";
    consola.set((prev) => ({ ...prev, conexion }));
    return conexion;
  } finally {
    marcarCarga(false);
  }
}

/**
 * ¿Sabe el backend desplegado atender `documentacion.arranque`?
 *
 * Se recuerda entre llamadas para no volver a pagar el rechazo en cada
 * reconexión. Empieza en `null` («no se sabe») y solo pasa a `false` cuando el
 * backend lo dice explícitamente: un fallo de red no es una respuesta sobre las
 * capacidades del backend, y tratarlo como tal dejaría el arranque rápido
 * apagado hasta recargar la pestaña.
 */
let backendConoceArranque: boolean | null = null;

async function arrancar(): Promise<{
  estado: EstadoModulo;
  catalogo: CatalogoCliente | null;
  catalogoError: string;
}> {
  if (backendConoceArranque !== false) {
    try {
      const respuesta = await docApi.arranque();
      backendConoceArranque = true;
      return {
        estado: respuesta.estado,
        catalogo: respuesta.catalogo ?? null,
        catalogoError: respuesta.catalogoError ?? "",
      };
    } catch (error) {
      const codigo = (error as { codigo?: string }).codigo ?? "";
      if (codigo !== "ACCION_NO_SOPORTADA" && codigo !== "UNSUPPORTED_ACTION") throw error;
      backendConoceArranque = false;
    }
  }

  // Ruta de siempre: dos viajes encadenados.
  const estado = await docApi.estado();
  if (!estado.instalado) return { estado, catalogo: null, catalogoError: "" };
  try {
    const catalogo = await docApi.catalogo();
    return { estado, catalogo, catalogoError: "" };
  } catch (error) {
    return { estado, catalogo: null, catalogoError: mensajeDeError(error).mensaje };
  }
}

/** Refresca solo el contador de notificaciones. Barato: se llama al navegar. */
export async function refrescarNotificaciones(): Promise<void> {
  if (obtenerConsola().conexion !== "conectado") return;
  try {
    const res = await docApi.notificaciones({ soloNoLeidas: true, porPagina: 1 });
    consola.set((prev) => ({ ...prev, notificacionesNoLeidas: res.noLeidas ?? 0 }));
  } catch {
    /* el contador es informativo: si falla, no se molesta a nadie */
  }
}

/** Vuelve a pedir el catálogo. Se llama tras editarlo. */
export async function refrescarCatalogo(): Promise<void> {
  if (obtenerConsola().conexion !== "conectado") return;
  try {
    const catalogo = await docApi.catalogo();
    guardarCatalogoCache(catalogo);
    consola.set((prev) => ({ ...prev, catalogo }));
  } catch (error) {
    registrarError(error);
  }
}

export function urlBackend(): string {
  return urlCliente();
}

/** ¿Puede el actor hacer esto? La comprobación real la hace el backend. */
export function puede(capacidad: keyof Capacidades): boolean {
  return obtenerConsola().capacidades[capacidad] === true;
}
