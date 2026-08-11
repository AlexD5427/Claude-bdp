/**
 * docAuxiliar.ts — los catálogos de AGENCIA y GERENCIA.
 *
 * Los dos desplegables obligatorios del formulario no salen de una constante
 * del código: salen de la pestaña `Auxiliar` del libro, bajo las cabeceras
 * exactas `agencia_bdp` y `gerencia_bdp`. Esa fue una decisión del área y es la
 * correcta: abrir una agencia nueva no puede exigir un despliegue.
 *
 * Este módulo es la cara del frontend de esa pestaña. Resuelve tres problemas
 * que, si se dejan al componente, se resuelven mal:
 *
 *  1. **Latencia.** El catálogo cambia unas pocas veces al año y el formulario
 *     se abre decenas de veces al día. Se cachea en memoria y en `sessionStorage`
 *     para que el segundo formulario del día no espere a la red.
 *
 *  2. **Valores históricos.** Un expediente de 2023 puede apuntar a una agencia
 *     que ya se cerró y que ya no está en el catálogo. Un `<select>` ingenuo
 *     mostraría el campo vacío y el primer guardado borraría el dato. Aquí el
 *     valor histórico se conserva, se añade a la lista y se marca como tal.
 *
 *  3. **Fallos con dignidad.** Si el backend no responde, el formulario no puede
 *     quedarse en blanco: se devuelve el último catálogo conocido y un estado de
 *     error que la interfaz muestra sin bloquear al usuario.
 */

import { llamarDoc } from "./docApi";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Nombre exacto de la cabecera en la hoja. No se traduce. */
export type CabeceraAuxiliar = "agencia_bdp" | "gerencia_bdp";

export const AUX_CABECERA: Record<"agencia" | "gerencia", CabeceraAuxiliar> = {
  agencia: "agencia_bdp",
  gerencia: "gerencia_bdp",
};

export interface DetalleCabecera {
  columna: number;
  total: number;
  duplicadosDescartados: number;
  celdasVacias: number;
  variantes: Array<{ columna: number; texto: string }>;
  duplicadas: number[];
}

export interface OpcionesAuxiliar {
  hoja: string;
  existe: boolean;
  generado: string;
  desdeCache: boolean;
  agencias: string[];
  gerencias: string[];
  detalle: Partial<Record<CabeceraAuxiliar, DetalleCabecera>>;
  avisos: string[];
}

export interface HallazgoAuxiliar {
  severidad: "critico" | "aviso" | "info";
  codigo: string;
  titulo: string;
  detalle: string;
  accion: string;
  datos?: Record<string, unknown>;
}

export interface ValidacionAuxiliar {
  hoja: string;
  ok: boolean;
  criticos: number;
  hallazgos: HallazgoAuxiliar[];
  resumen: Record<string, { columna: number; opciones: number; repetidos: number }>;
  opciones: OpcionesAuxiliar;
}

export interface ReparacionAuxiliar {
  hoja: string;
  acciones: Array<{ hoja: string; accion: string; detalle: string }>;
  pendientes: Array<{ cabecera: string; motivo: string }>;
  despues: { ok: boolean; criticos: number; hallazgos: HallazgoAuxiliar[] };
  opciones: OpcionesAuxiliar;
}

/** Estado de carga que consume la interfaz. */
export type EstadoAuxiliar = "inicial" | "cargando" | "listo" | "error" | "vacio";

/* ------------------------------------------------------------------ */
/* Caché                                                               */
/* ------------------------------------------------------------------ */

const CLAVE_SESION = "bdp-documentacion-auxiliar";
/** Diez minutos: suficiente para una jornada de altas, corto para un cambio. */
const VIGENCIA_MS = 10 * 60 * 1000;

interface EntradaCache {
  guardado: number;
  datos: OpcionesAuxiliar;
}

let enMemoria: EntradaCache | null = null;
/** Vuelo en curso, para que diez componentes montados a la vez pidan una vez. */
let enVuelo: Promise<OpcionesAuxiliar> | null = null;

export const OPCIONES_VACIAS: OpcionesAuxiliar = {
  hoja: "Auxiliar",
  existe: false,
  generado: "",
  desdeCache: false,
  agencias: [],
  gerencias: [],
  detalle: {},
  avisos: [],
};

function leerSesion(): EntradaCache | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const crudo = sessionStorage.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as EntradaCache;
    if (!dato || typeof dato.guardado !== "number" || !dato.datos) return null;
    return dato;
  } catch {
    return null;
  }
}

function escribirSesion(entrada: EntradaCache): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(entrada));
  } catch {
    /* cuota llena o modo privado: la caché en memoria sigue sirviendo */
  }
}

function vigente(entrada: EntradaCache | null): boolean {
  return !!entrada && Date.now() - entrada.guardado < VIGENCIA_MS;
}

/** Descarta la caché. Se llama tras reparar la hoja o al pulsar "actualizar". */
export function invalidarAuxiliar(): void {
  enMemoria = null;
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* sin sessionStorage no hay nada que limpiar */
  }
}

/** El último catálogo conocido, aunque esté caducado. Para pintar algo ya. */
export function opcionesConocidas(): OpcionesAuxiliar | null {
  if (enMemoria) return enMemoria.datos;
  const guardado = leerSesion();
  return guardado ? guardado.datos : null;
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\u00a0/g, " ").trim();
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const salida: string[] = [];
  const vistos = new Set<string>();
  for (const bruto of valor) {
    const limpio = texto(bruto);
    if (!limpio) continue;
    const clave = claveComparacion(limpio);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(limpio);
  }
  return salida;
}

/**
 * Clave de comparación insensible a tildes, mayúsculas y espacios de más.
 *
 * Se usa Únicamente para comparar; el texto que se guarda y se muestra es
 * siempre el original, con sus tildes y su capitalización.
 */
export function claveComparacion(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Convierte la respuesta cruda del backend en algo con forma garantizada. */
export function normalizarOpciones(crudo: unknown): OpcionesAuxiliar {
  const fuente = (crudo ?? {}) as Record<string, unknown>;
  const avisos = Array.isArray(fuente.avisos)
    ? fuente.avisos.map((a) => texto(a)).filter(Boolean)
    : [];

  return {
    hoja: texto(fuente.hoja) || "Auxiliar",
    existe: fuente.existe === true,
    generado: texto(fuente.generado),
    desdeCache: fuente.desdeCache === true,
    agencias: listaDeTextos(fuente.agencias),
    gerencias: listaDeTextos(fuente.gerencias),
    detalle: (fuente.detalle ?? {}) as OpcionesAuxiliar["detalle"],
    avisos,
  };
}

/* ------------------------------------------------------------------ */
/* Carga                                                               */
/* ------------------------------------------------------------------ */

/**
 * Trae los catálogos. Reutiliza caché salvo que se pida refrescar.
 *
 * Nunca lanza por un fallo de red: devuelve el último catálogo conocido con un
 * aviso añadido. Un desplegable vacío con un mensaje rojo bloquea el alta; un
 * desplegable con datos de hace diez minutos, no.
 */
export async function cargarOpcionesAuxiliar(refrescar = false): Promise<OpcionesAuxiliar> {
  if (!refrescar) {
    if (vigente(enMemoria)) return (enMemoria as EntradaCache).datos;
    const sesion = leerSesion();
    if (vigente(sesion)) {
      enMemoria = sesion;
      return (sesion as EntradaCache).datos;
    }
    if (enVuelo) return enVuelo;
  }

  const promesa = (async (): Promise<OpcionesAuxiliar> => {
    try {
      const datos = await llamarDoc<unknown>("auxiliar.opciones", { refrescar });
      const normalizado = normalizarOpciones(datos);
      const entrada: EntradaCache = { guardado: Date.now(), datos: normalizado };
      enMemoria = entrada;
      escribirSesion(entrada);
      return normalizado;
    } catch (error) {
      const previo = opcionesConocidas();
      const motivo = error instanceof Error ? error.message : "No se pudo consultar el libro.";
      if (previo) {
        return {
          ...previo,
          desdeCache: true,
          avisos: previo.avisos.concat([
            "Mostrando el último catálogo conocido: " + motivo,
          ]),
        };
      }
      return { ...OPCIONES_VACIAS, avisos: [motivo] };
    } finally {
      enVuelo = null;
    }
  })();

  enVuelo = promesa;
  return promesa;
}

/** Diagnóstico de la pestaña, sin modificar nada. */
export async function validarAuxiliar(): Promise<ValidacionAuxiliar> {
  const datos = await llamarDoc<ValidacionAuxiliar>("auxiliar.validar", {});
  const normalizado: ValidacionAuxiliar = {
    ...datos,
    opciones: normalizarOpciones(datos ? datos.opciones : null),
  };
  enMemoria = { guardado: Date.now(), datos: normalizado.opciones };
  escribirSesion(enMemoria);
  return normalizado;
}

/** Reparación segura: crea la hoja o las cabeceras que falten. Nunca borra. */
export async function repararAuxiliar(): Promise<ReparacionAuxiliar> {
  const datos = await llamarDoc<ReparacionAuxiliar>("auxiliar.reparar", {});
  invalidarAuxiliar();
  const normalizado: ReparacionAuxiliar = {
    ...datos,
    opciones: normalizarOpciones(datos ? datos.opciones : null),
  };
  enMemoria = { guardado: Date.now(), datos: normalizado.opciones };
  escribirSesion(enMemoria);
  return normalizado;
}

/* ------------------------------------------------------------------ */
/* Valores históricos                                                  */
/* ------------------------------------------------------------------ */

export interface OpcionDesplegable {
  valor: string;
  etiqueta: string;
  /** El valor guardado ya no está en el catálogo: se conserva y se advierte. */
  historico: boolean;
}

/**
 * Construye la lista de un desplegable conservando el valor guardado.
 *
 * Regla dura del área: **un valor histórico jamás se borra**. Si el expediente
 * dice "AGENCIA CARANAVI" y esa agencia ya no está en el catálogo, la opción
 * aparece igualmente, marcada, y la interfaz muestra la advertencia.
 */
export function opcionesConHistorico(
  catalogo: string[],
  valorActual: string | null | undefined,
): OpcionDesplegable[] {
  const lista: OpcionDesplegable[] = catalogo.map((valor) => ({
    valor,
    etiqueta: valor,
    historico: false,
  }));

  const actual = texto(valorActual);
  if (!actual) return lista;

  const clave = claveComparacion(actual);
  const yaEsta = lista.some((opcion) => claveComparacion(opcion.valor) === clave);
  if (yaEsta) return lista;

  return [
    { valor: actual, etiqueta: actual + " (fuera de catálogo)", historico: true },
    ...lista,
  ];
}

/** ¿El valor guardado sigue estando en el catálogo activo? */
export function esValorHistorico(
  catalogo: string[],
  valor: string | null | undefined,
): boolean {
  const actual = texto(valor);
  if (!actual) return false;
  const clave = claveComparacion(actual);
  return !catalogo.some((opcion) => claveComparacion(opcion) === clave);
}

/**
 * Filtro para el buscador del desplegable.
 *
 * Con más de cincuenta agencias, desplazarse es peor que teclear. Se compara
 * sin tildes para que "nunez" encuentre "Núñez".
 */
export function filtrarOpciones(
  opciones: OpcionDesplegable[],
  consulta: string,
): OpcionDesplegable[] {
  const termino = claveComparacion(texto(consulta));
  if (!termino) return opciones;
  return opciones.filter((opcion) => claveComparacion(opcion.valor).includes(termino));
}

/** Estado de carga a partir de lo que hay. Evita repetir esta lógica en la UI. */
export function estadoDe(
  opciones: OpcionesAuxiliar | null,
  cargando: boolean,
  cabecera: "agencias" | "gerencias",
): EstadoAuxiliar {
  if (cargando) return "cargando";
  if (!opciones) return "inicial";
  if (!opciones.existe) return "error";
  return opciones[cabecera].length === 0 ? "vacio" : "listo";
}
