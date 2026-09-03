/**
 * Precarga en segundo plano y apertura instantánea de expedientes.
 *
 * ── El problema medido ──────────────────────────────────────────────────────
 * Abrir un expediente eran entre 1,2 y 4 segundos de pantalla vacía: una llamada
 * a Apps Script, con su arranque de contenedor. En una jornada, el área abre
 * cuarenta o cincuenta expedientes; son varios minutos al día mirando un
 * esqueleto.
 *
 * ── Cómo se resuelve ────────────────────────────────────────────────────────
 * Mientras la persona mira la lista, el módulo trae en TIEMPO OCIOSO el detalle
 * de las filas visibles y de las páginas adyacentes, en lotes y con concurrencia
 * limitada. Cuando elige una, el expediente aparece desde la caché en el mismo
 * fotograma y se revalida en silencio contra el backend.
 *
 * ── Cuatro reglas que hacen que esto no estorbe ─────────────────────────────
 *   1. **la interacción manda**: la precarga solo corre en tiempo ocioso
 *      (`requestIdleCallback`, con `setTimeout` de recaída) y se pausa mientras
 *      hay una petición de la persona en marcha;
 *   2. **concurrencia limitada** a dos lotes: más llamadas simultáneas a Apps
 *      Script no van más rápido, se pelean por el bloqueo del libro;
 *   3. **cancelable**: al cambiar de sección o de filtros, lo que quedaba por
 *      traer se descarta. Traer una página que ya nadie mira gasta cuota;
 *   4. **nunca precarga lo que ya está**: se pregunta a la caché antes de pedir.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { docApi, type ExpedienteOperativo } from "../api/acciones";
import {
  antiguedadSegundos,
  estaEnCache,
  guardarEnCache,
  leerDeCache,
  type ExpedienteEnCache,
} from "./cacheExpedientes";
import { pendientesDe } from "./colaSalida";

/** Tamaño del lote. Coincide con el tope del backend (`DOC2_MAX_DETALLE_LOTE`). */
const LOTE = 12;

/** Lotes simultáneos. Dos aprovechan la latencia sin pelearse por el libro. */
const CONCURRENCIA = 2;

/** Ejecuta algo cuando el navegador no tenga nada mejor que hacer. */
function enTiempoOcioso(tarea: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const conIdle = window as Window & {
    requestIdleCallback?: (cb: () => void, opciones?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof conIdle.requestIdleCallback === "function") {
    const id = conIdle.requestIdleCallback(tarea, { timeout: 2000 });
    return () => conIdle.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(tarea, 400);
  return () => window.clearTimeout(id);
}

/** Parte una lista en trozos del tamaño del lote. */
function enLotes<T>(lista: T[], tamano: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

/* ------------------------------------------------------------------ */
/* Precarga                                                            */
/* ------------------------------------------------------------------ */

export interface ResultadoPrecarga {
  pedidos: number;
  guardados: number;
  lotes: number;
}

/**
 * Trae el detalle de varios expedientes y los deja en la caché.
 *
 * Devuelve lo que hizo, para que la sonda de QA pueda comprobar que la precarga
 * ocurrió de verdad y con cuántas llamadas: es la única forma de demostrar que
 * veinticinco filas se traen en tres llamadas y no en veinticinco.
 */
export async function precargarExpedientes(
  ids: string[],
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoPrecarga> {
  const faltan = [...new Set(ids)].filter((id) => id && !estaEnCache(id));
  if (!faltan.length) return { pedidos: 0, guardados: 0, lotes: 0 };

  const lotes = enLotes(faltan, LOTE);
  let guardados = 0;
  let ejecutados = 0;

  for (let i = 0; i < lotes.length; i += CONCURRENCIA) {
    if (opciones.senal?.aborted) break;
    const tanda = lotes.slice(i, i + CONCURRENCIA);
    const respuestas = await Promise.allSettled(
      tanda.map((lote) => docApi.detalleExpedientes(lote, { signal: opciones.senal, reintentos: 1 })),
    );
    ejecutados += tanda.length;
    for (const respuesta of respuestas) {
      if (respuesta.status !== "fulfilled") continue;
      for (const detalle of respuesta.value.expedientes) {
        guardarEnCache({
          expedienteId: detalle.expediente.expedienteId,
          expediente: detalle.expediente,
          requisitos: detalle.requisitos,
          prorrogas: detalle.prorrogas,
          parcial: true,
          version: detalle.expediente.version,
        });
        guardados += 1;
      }
    }
  }

  return { pedidos: faltan.length, guardados, lotes: ejecutados };
}

/**
 * Programa la precarga de una lista de identificadores.
 *
 * El efecto depende de la CADENA de identificadores, no del arreglo: un arreglo
 * nuevo con los mismos elementos —lo que devuelve cualquier `map` en cada
 * renderizado— relanzaría la precarga sin parar. Es el mismo error de
 * dependencias inestables que congelaba el panel del expediente, aquí con
 * consecuencias de cuota en lugar de foco.
 */
export function usePrecarga(ids: string[], activo: boolean): void {
  const huella = ids.join(",");
  useEffect(() => {
    if (!activo || !huella) return;
    const controlador = new AbortController();
    const cancelarOcio = enTiempoOcioso(() => {
      void precargarExpedientes(huella.split(","), { senal: controlador.signal });
    });
    return () => {
      cancelarOcio();
      // Al cambiar de página o de filtros, lo que quedaba por traer ya no
      // interesa: se aborta en lugar de gastar cuota en datos que nadie verá.
      controlador.abort();
    };
  }, [huella, activo]);
}

/* ------------------------------------------------------------------ */
/* Apertura instantánea con revalidación                               */
/* ------------------------------------------------------------------ */

export type OrigenDatos = "cache" | "servidor" | "ninguno";

export interface ExpedienteAbierto {
  datos: ExpedienteOperativo | null;
  /** Vista rápida desde la caché mientras llega la completa. */
  vistaPrevia: ExpedienteEnCache | null;
  origen: OrigenDatos;
  cargando: boolean;
  /** Segundos de antigüedad de la copia que se está mostrando. */
  antiguedad: number;
  /** Alguien cambió el expediente mientras estaba abierto. */
  conflicto: boolean;
  error: unknown;
  recargar: () => void;
}

/**
 * Abre un expediente: al instante si está en caché, y siempre revalidado.
 *
 * ── Por qué no se reemplaza lo que se está editando ─────────────────────────
 * Si hay cambios en la cola de salida de este expediente, la respuesta de la
 * revalidación se guarda en la caché pero NO se pinta: pisar la pantalla de
 * alguien que está marcando requisitos con una versión del servidor que no los
 * incluye es la forma más rápida de que el trabajo se pierda dos veces.
 */
export function useExpedienteAbierto(expedienteId: string | null): ExpedienteAbierto {
  const [datos, setDatos] = useState<ExpedienteOperativo | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<ExpedienteEnCache | null>(null);
  const [origen, setOrigen] = useState<OrigenDatos>("ninguno");
  const [cargando, setCargando] = useState(false);
  const [conflicto, setConflicto] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ciclo, setCiclo] = useState(0);
  /** Secuencia propia: descarta la respuesta de un expediente que ya se cerró. */
  const secuencia = useRef(0);

  const recargar = useCallback(() => setCiclo((n) => n + 1), []);

  useEffect(() => {
    if (!expedienteId) {
      setDatos(null);
      setVistaPrevia(null);
      setOrigen("ninguno");
      setConflicto(false);
      setError(null);
      return;
    }

    const mio = ++secuencia.current;
    const controlador = new AbortController();

    // 1. Lo que ya se sabe, en el mismo fotograma.
    const enCache = leerDeCache(expedienteId);
    setDatos(null);
    setVistaPrevia(enCache);
    setOrigen(enCache ? "cache" : "ninguno");
    setConflicto(false);
    setError(null);
    setCargando(true);

    // 2. La verdad, en silencio.
    void docApi
      .obtenerExpediente(expedienteId, { historial: 80 }, { signal: controlador.signal })
      .then((completo) => {
        if (secuencia.current !== mio) return;
        guardarEnCache({
          expedienteId: completo.expediente.expedienteId,
          expediente: completo.expediente,
          requisitos: completo.requisitos,
          prorrogas: completo.prorrogas,
          parcial: false,
          version: completo.expediente.version,
        });
        // Si la persona tiene cambios en vuelo, se conserva su pantalla.
        if (pendientesDe(expedienteId) > 0 && datos) return;
        if (enCache && enCache.version !== completo.expediente.version) setConflicto(true);
        setDatos(completo);
        setOrigen("servidor");
      })
      .catch((fallo) => {
        if (secuencia.current !== mio) return;
        // Con copia local, un backend caído no deja la pantalla vacía: se sigue
        // consultando lo último que se sabe, marcado como tal.
        setError(fallo);
      })
      .finally(() => {
        if (secuencia.current === mio) setCargando(false);
      });

    return () => controlador.abort();
    // `datos` se lee dentro pero no debe disparar el efecto: si lo hiciera, cada
    // respuesta relanzaría la petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId, ciclo]);

  return {
    datos,
    vistaPrevia,
    origen,
    cargando,
    antiguedad: vistaPrevia ? antiguedadSegundos(vistaPrevia) : 0,
    conflicto,
    error,
    recargar,
  };
}
