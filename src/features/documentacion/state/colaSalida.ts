/**
 * Cola de salida: las escrituras que todavía no han llegado al libro.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 * Guardar un bloque de requisitos contra Apps Script tarda entre uno y cinco
 * segundos. Si en ese rato la red se cae, la pestaña se recarga o alguien cierra
 * el portátil, el trabajo se perdía sin dejar rastro: la persona veía «no se pudo
 * guardar» y tenía que volver a marcar veinte documentos de memoria.
 *
 * La cola guarda la INTENCIÓN antes de enviarla, sobrevive a un recargado y
 * reintenta sola cuando vuelve la conexión. Y mientras algo está en la cola, la
 * interfaz lo dice: «pendiente de sincronizar», nunca «guardado».
 *
 * ── Cuatro propiedades que una cola de escritura necesita ───────────────────
 *   1. **idempotencia**: cada elemento lleva su `solicitudId`. El backend
 *      reconoce la repetición y devuelve el resultado original en lugar de
 *      aplicar dos veces el mismo cambio;
 *   2. **orden**: se envía de uno en uno y en orden de llegada. Dos cambios sobre
 *      el mismo requisito aplicados al revés dejarían el estado equivocado;
 *   3. **coalescencia**: dos cambios sobre el MISMO requisito del mismo
 *      expediente que todavía no se han enviado se funden en uno. Marcar y
 *      desmarcar seis veces es una escritura, no seis;
 *   4. **espera creciente**: el reintento no martillea. 1 s, 2 s, 4 s, 8 s, hasta
 *      un máximo, y se rinde tras varios intentos dejando el elemento visible
 *      para que una persona decida.
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 * No inventa que algo se guardó. No reintenta un error de validación —volver a
 * enviar lo mismo daría lo mismo—. No reordena. Y no guarda datos personales más
 * allá de lo imprescindible: un elemento es un identificador de requisito, un
 * estado, una observación y un número de hojas.
 */

import { createStore } from "../../../shared/store";
import { DocError, nuevoRequestId } from "../api/client";
import { docApi } from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Forma de un elemento                                               */
/* ------------------------------------------------------------------ */

export interface CambioRequisito {
  expedienteDocumentoId: string;
  version?: number;
  estado?: string;
  observaciones?: string;
  hojasFisicas?: number;
}

export type EstadoElemento = "pendiente" | "enviando" | "fallido";

export interface ElementoCola {
  id: string;
  /** Identificador de solicitud: hace que reintentar sea seguro. */
  solicitudId: string;
  expedienteId: string;
  cambios: CambioRequisito[];
  estado: EstadoElemento;
  intentos: number;
  creadoEn: string;
  /** Último motivo de fallo, en las palabras del backend. */
  error?: string;
  pista?: string;
}

interface EstadoCola {
  elementos: ElementoCola[];
  /** ¿Hay un envío en marcha? Evita dos vaciados simultáneos. */
  enviando: boolean;
  /** Última vez que el backend confirmó algo. */
  ultimaConfirmacion: string;
}

const CLAVE = "bdp-documentacion-cola";
const MAX_INTENTOS = 5;
const ESPERA_BASE_MS = 1000;
const ESPERA_MAXIMA_MS = 16000;

const INICIAL: EstadoCola = { elementos: [], enviando: false, ultimaConfirmacion: "" };

/**
 * La cola se persiste completa: es su razón de ser. Se valida al leer, porque un
 * `localStorage` corrupto no puede impedir que el módulo arranque.
 */
const almacen = createStore<EstadoCola>(INICIAL, {
  persistKey: CLAVE,
  serialize: (estado) =>
    JSON.stringify({
      // `enviando` no se persiste: al recargar no hay ningún envío en marcha, y
      // guardarlo dejaría la cola trancada esperando algo que ya no existe.
      elementos: estado.elementos.map((e) => ({ ...e, estado: e.estado === "enviando" ? "pendiente" : e.estado })),
      ultimaConfirmacion: estado.ultimaConfirmacion,
    }),
  deserialize: (raw) => {
    const guardado = JSON.parse(raw) as Partial<EstadoCola>;
    const elementos = Array.isArray(guardado.elementos) ? guardado.elementos : [];
    return {
      ...INICIAL,
      ultimaConfirmacion: typeof guardado.ultimaConfirmacion === "string" ? guardado.ultimaConfirmacion : "",
      elementos: elementos.filter(
        (e): e is ElementoCola =>
          !!e &&
          typeof e.id === "string" &&
          typeof e.expedienteId === "string" &&
          typeof e.solicitudId === "string" &&
          Array.isArray(e.cambios),
      ),
    };
  },
});

export const useCola = almacen.use;
export const obtenerCola = almacen.get;

/** Cuántos cambios esperan turno. Es lo que pinta el indicador. */
export function cambiosPendientes(): number {
  return almacen.get().elementos.reduce((suma, e) => suma + e.cambios.length, 0);
}

/** ¿Hay algo pendiente de este expediente concreto? */
export function pendientesDe(expedienteId: string): number {
  return almacen
    .get()
    .elementos.filter((e) => e.expedienteId === expedienteId)
    .reduce((suma, e) => suma + e.cambios.length, 0);
}

/* ------------------------------------------------------------------ */
/* Encolar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Funde dos listas de cambios sobre el mismo expediente.
 *
 * El último cambio sobre un requisito gana, campo a campo: si primero se marcó
 * ENTREGADO y luego se escribió una observación, el elemento resultante lleva las
 * dos cosas. La versión que viaja es la ORIGINAL —la que se leyó al abrir—,
 * porque es la que el backend tiene que comparar para detectar que alguien se
 * adelantó.
 */
export function fundirCambios(previos: CambioRequisito[], nuevos: CambioRequisito[]): CambioRequisito[] {
  const porRequisito = new Map<string, CambioRequisito>();
  for (const cambio of [...previos, ...nuevos]) {
    const anterior = porRequisito.get(cambio.expedienteDocumentoId);
    porRequisito.set(cambio.expedienteDocumentoId, {
      ...anterior,
      ...cambio,
      version: anterior?.version ?? cambio.version,
    });
  }
  return [...porRequisito.values()];
}

/**
 * Añade un bloque de cambios a la cola.
 *
 * Si ya hay un elemento PENDIENTE del mismo expediente, los cambios se funden en
 * él en lugar de crear otro: así seis clics seguidos son una escritura. Un
 * elemento que ya se está enviando no se toca —su `solicitudId` viaja— y los
 * cambios nuevos entran en uno nuevo.
 */
export function encolarCambios(expedienteId: string, cambios: CambioRequisito[]): string {
  if (!cambios.length) return "";
  let id = "";
  almacen.set((prev) => {
    const indice = prev.elementos.findIndex((e) => e.expedienteId === expedienteId && e.estado === "pendiente");
    if (indice >= 0) {
      const elementos = [...prev.elementos];
      const previo = elementos[indice];
      elementos[indice] = { ...previo, cambios: fundirCambios(previo.cambios, cambios) };
      id = previo.id;
      return { ...prev, elementos };
    }
    const elemento: ElementoCola = {
      id: `cola_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      solicitudId: nuevoRequestId(),
      expedienteId,
      cambios,
      estado: "pendiente",
      intentos: 0,
      creadoEn: new Date().toISOString(),
    };
    id = elemento.id;
    return { ...prev, elementos: [...prev.elementos, elemento] };
  });
  return id;
}

/** Quita un elemento de la cola. Se usa al confirmar y al descartar. */
export function quitarDeCola(id: string): void {
  almacen.set((prev) => ({ ...prev, elementos: prev.elementos.filter((e) => e.id !== id) }));
}

/** Descarta todo lo pendiente. Solo desde el autodiagnóstico, con confirmación. */
export function descartarCola(): void {
  almacen.set((prev) => ({ ...prev, elementos: [] }));
}

/* ------------------------------------------------------------------ */
/* Vaciado                                                            */
/* ------------------------------------------------------------------ */

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Espera creciente, con techo: 1 s, 2 s, 4 s, 8 s, 16 s. */
export function esperaDeIntento(intentos: number): number {
  return Math.min(ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1), ESPERA_MAXIMA_MS);
}

/**
 * ¿Merece la pena reintentar este error?
 *
 * Solo lo recuperable: red, tiempo agotado y libro ocupado. Un error de
 * validación o de permisos no cambia porque se repita, y reintentarlo cinco veces
 * solo retrasa el momento en que la persona se entera.
 */
export function esReintentable(error: unknown): boolean {
  if (!(error instanceof DocError)) return true;
  if (error.red) return true;
  return error.codigo === "LIBRO_OCUPADO" || error.codigo === "TIMEOUT" || error.codigo === "BUSY";
}

export interface ResultadoVaciado {
  enviados: number;
  confirmados: number;
  fallidos: number;
  restantes: number;
}

/**
 * Envía lo que haya en la cola, de uno en uno y en orden.
 *
 * ── Por qué de uno en uno ───────────────────────────────────────────────────
 * Porque el libro se bloquea por escritura: dos envíos en paralelo se pelean por
 * el mismo `LockService` y uno de los dos vuelve con «libro ocupado». Uno detrás
 * de otro es más rápido en la práctica y además conserva el orden.
 *
 * ── Cuándo dice «guardado» ──────────────────────────────────────────────────
 * Solo cuando el backend responde y el elemento sale de la cola. Si la respuesta
 * trae cambios rechazados, se informan: se aplicó parte, y decir «guardado» sin
 * más sería mentir a medias.
 */
export async function vaciarCola(): Promise<ResultadoVaciado> {
  if (almacen.get().enviando) return { enviados: 0, confirmados: 0, fallidos: 0, restantes: cambiosPendientes() };
  almacen.set((prev) => ({ ...prev, enviando: true }));

  let enviados = 0;
  let confirmados = 0;
  let fallidos = 0;

  try {
    for (;;) {
      const siguiente = almacen.get().elementos.find((e) => e.estado !== "fallido");
      if (!siguiente) break;

      almacen.set((prev) => ({
        ...prev,
        elementos: prev.elementos.map((e) =>
          e.id === siguiente.id ? { ...e, estado: "enviando", intentos: e.intentos + 1 } : e,
        ),
      }));
      enviados += 1;

      try {
        await docApi.guardarRequisitos(
          siguiente.expedienteId,
          siguiente.cambios as unknown as Record<string, unknown>[],
          { requestId: siguiente.solicitudId, reintentos: 1 },
        );
        quitarDeCola(siguiente.id);
        confirmados += 1;
        almacen.set((prev) => ({ ...prev, ultimaConfirmacion: new Date().toISOString() }));
      } catch (error) {
        const fallo = error as DocError;
        const intentos = siguiente.intentos + 1;
        const reintentable = esReintentable(error) && intentos < MAX_INTENTOS;
        almacen.set((prev) => ({
          ...prev,
          elementos: prev.elementos.map((e) =>
            e.id === siguiente.id
              ? {
                  ...e,
                  estado: reintentable ? "pendiente" : "fallido",
                  intentos,
                  error: fallo.message,
                  pista: fallo instanceof DocError ? fallo.pista : "",
                }
              : e,
          ),
        }));
        if (!reintentable) {
          fallidos += 1;
          continue;
        }
        await esperar(esperaDeIntento(intentos));
      }
    }
  } finally {
    almacen.set((prev) => ({ ...prev, enviando: false }));
  }

  return { enviados, confirmados, fallidos, restantes: cambiosPendientes() };
}

/** Vuelve a poner en cola lo que se rindió, a petición de una persona. */
export function reintentarFallidos(): void {
  almacen.set((prev) => ({
    ...prev,
    elementos: prev.elementos.map((e) =>
      e.estado === "fallido" ? { ...e, estado: "pendiente", intentos: 0, error: undefined } : e,
    ),
  }));
}

/**
 * Engancha la cola a la conexión del navegador.
 *
 * Devuelve la función de desmontaje. El escuchador no depende de nada inestable:
 * se monta una vez con el módulo y se desmonta al salir.
 */
export function escucharConexion(): () => void {
  if (typeof window === "undefined") return () => {};
  const alVolver = () => {
    void vaciarCola();
  };
  window.addEventListener("online", alVolver);
  return () => window.removeEventListener("online", alVolver);
}

/** Reinicia la cola. Solo lo usan las pruebas. */
export function __reiniciarColaParaPruebas(): void {
  almacen.set(() => ({ ...INICIAL }));
}
