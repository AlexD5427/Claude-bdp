/**
 * Transporte HTTP hacia el Web App de Apps Script.
 *
 * Hay UN destino y ninguna bifurcación de autorización: el mismo endpoint atiende
 * al reclutador y al candidato, y la diferencia la pone la llave que se envía (o
 * que no se envía). La versión anterior tenía dos destinos —Apps Script y un proxy
 * serverless que firmaba con HMAC—, y la mitad de las incidencias venían de que
 * una acción viajaba por el camino equivocado.
 *
 * ── Tres reglas que Apps Script impone y aquí se cumplen en un solo sitio ─────
 *  1. `redirect: "follow"`. Google responde 302 al Web App; sin seguirlo la
 *     llamada falla con un 404 desconcertante.
 *  2. `Content-Type: text/plain;charset=utf-8`. Un Web App no puede contestar el
 *     *preflight* de CORS que dispara `application/json`; con `text/plain` la
 *     petición es «simple» y el navegador no lo pide.
 *  3. Un `solicitudId` único por intención del usuario en cada escritura, y el
 *     MISMO si se reintenta a mano: es lo que hace la operación idempotente.
 *
 * ── Política de reintentos ───────────────────────────────────────────────────
 * Las lecturas se reintentan con retroceso. Las escrituras NO se reintentan de
 * forma automática, nunca: aunque el servidor sea idempotente, un reintento
 * automático oculta el problema de red que conviene ver. El `solicitudId` permite
 * reintentar a mano sin duplicar nada.
 */

import { err, ok, appError, type Result } from "../../../shared/result";
import { newId } from "../../../shared/ids";
import {
  parseEnvelope,
  toAppError,
  type Envelope,
  type AppErrorEvaluaciones,
} from "./envelope";
import { clienteId, conexion, problemaDeConexion } from "./connection";
import { ejecutarEnDemostracion } from "./demoBackend";

const TIMEOUT_LECTURA_MS = 20000;
const TIMEOUT_ESCRITURA_MS = 45000;
const REINTENTOS_LECTURA = 2;

export interface OpcionesPeticion {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Envía la llave de administración. Las acciones del candidato no la mandan. */
  conLlave?: boolean;
}

interface CuerpoPeticion {
  accion: string;
  solicitudId: string;
  payload: Record<string, unknown>;
  cliente: string;
  actor?: string;
  llaveAdmin?: string;
}

/** Identificador de solicitud, para las escrituras. */
export function nuevaSolicitudId(): string {
  return newId("req");
}

function conTimeout(externa: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (externa) {
    if (externa.aborted) controller.abort();
    else externa.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, limpiar: () => clearTimeout(timer) };
}

/**
 * Traduce un fallo de red a un error con pista.
 *
 * Los tres modos de fallo que se ven en la práctica son distintos y exigen
 * acciones distintas; agruparlos en «no se pudo conectar» es lo que hacía perder
 * horas buscando el problema donde no estaba.
 */
function errorDeTransporte(error: unknown, abortada: boolean): AppErrorEvaluaciones {
  if (abortada) {
    return {
      ...appError("timeout", "La solicitud se canceló o tardó demasiado."),
      pista: "Si ocurre al guardar una evaluación muy grande, divídela en secciones o inténtalo de nuevo.",
    };
  }
  const mensaje = error instanceof Error ? error.message : "";
  if (/HTTP 401|HTTP 403/.test(mensaje)) {
    return {
      ...appError("forbidden", "Google rechazó la solicitud antes de llegar al script."),
      pista:
        'El despliegue del Web App debe tener acceso «Cualquier usuario» («Anyone»). Revísalo en Implementar → Gestionar implementaciones.',
    };
  }
  if (/HTTP 404/.test(mensaje)) {
    return {
      ...appError("provider", "La dirección del backend no existe."),
      pista:
        "Comprueba que la URL termina en /exec y corresponde al despliegue actual. Cada nueva versión del script genera una URL propia si creas un despliegue nuevo.",
    };
  }
  if (/HTTP 5\d\d/.test(mensaje)) {
    return {
      ...appError("provider", "El script devolvió un error del servidor."),
      pista: "Abre el libro y ejecuta Evaluaciones → Diagnóstico: dirá si falta la estructura o la autorización.",
    };
  }
  if (/abort/i.test(mensaje)) {
    return { ...appError("timeout", "La solicitud tardó demasiado."), pista: "Reintenta en unos segundos." };
  }
  return {
    ...appError("network", "No se pudo contactar con el backend de Evaluaciones."),
    pista:
      "Revisa la conexión y que la URL del panel sea la del despliegue /exec. Si el navegador bloquea la petición, comprueba que el despliegue permita acceso anónimo.",
  };
}

async function enviar<T>(
  cuerpo: CuerpoPeticion,
  opciones: OpcionesPeticion,
  timeoutMs: number,
): Promise<Result<Envelope<T>, AppErrorEvaluaciones>> {
  const activa = conexion();

  // Modo demostración: no hay red. Se resuelve contra el simulador local, que
  // habla exactamente el mismo contrato.
  if (activa.modo === "demostracion") {
    const envelope = await ejecutarEnDemostracion<T>(cuerpo.accion, cuerpo.payload, {
      solicitudId: cuerpo.solicitudId,
      cliente: cuerpo.cliente,
      actor: cuerpo.actor ?? "",
    });
    return ok(envelope);
  }

  const problema = problemaDeConexion(activa);
  if (problema) {
    return err({ ...appError("provider", problema), pista: "Ábrelo en Evaluaciones → Conexión." });
  }

  const { signal, limpiar } = conTimeout(opciones.signal, timeoutMs);
  try {
    const respuesta = await fetch(activa.url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(cuerpo),
      signal,
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    // Se lee como texto y se analiza a mano para distinguir «el backend contestó
    // un error de negocio» (JSON) de «Google devolvió una página de error» (HTML).
    const texto = await respuesta.text();
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      return err({
        ...appError("provider", "El servidor respondió con algo que no es JSON."),
        pista:
          "Casi siempre significa que la URL apunta a una pantalla de inicio de sesión de Google: el despliegue debe permitir acceso anónimo.",
        detalle: { primerosCaracteres: texto.slice(0, 160) },
      });
    }
    return ok(parseEnvelope<T>(bruto));
  } catch (error) {
    return err(errorDeTransporte(error, opciones.signal?.aborted === true));
  } finally {
    limpiar();
  }
}

function cuerpoBase(
  accion: string,
  payload: Record<string, unknown>,
  opciones: OpcionesPeticion,
  solicitudId: string,
): CuerpoPeticion {
  const activa = conexion();
  const cuerpo: CuerpoPeticion = {
    accion,
    solicitudId,
    payload,
    cliente: clienteId(),
  };
  if (opciones.conLlave !== false && activa.llave) cuerpo.llaveAdmin = activa.llave;
  return cuerpo;
}

/** Lectura idempotente, con reintentos ante fallos transitorios de red. */
export async function leer<T>(
  accion: string,
  payload: Record<string, unknown> = {},
  opciones: OpcionesPeticion = {},
): Promise<Result<T, AppErrorEvaluaciones>> {
  let ultimo: AppErrorEvaluaciones = appError("network", "No se pudo contactar con el backend.");
  for (let intento = 0; intento <= REINTENTOS_LECTURA; intento += 1) {
    const resultado = await enviar<T>(
      cuerpoBase(accion, payload, opciones, ""),
      opciones,
      opciones.timeoutMs ?? TIMEOUT_LECTURA_MS,
    );
    if (resultado.ok) {
      const envelope = resultado.value;
      // Un error de negocio es una respuesta válida: no se reintenta.
      if (!envelope.ok) return err(toAppError(envelope));
      return ok((envelope.datos ?? null) as T);
    }
    ultimo = resultado.error;
    if (ultimo.code === "timeout" || opciones.signal?.aborted) break;
    if (intento < REINTENTOS_LECTURA) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (intento + 1)));
    }
  }
  return err(ultimo);
}

/**
 * Escritura. No se reintenta automáticamente.
 *
 * `solicitudId` se puede pasar para reintentar a mano la MISMA intención sin
 * duplicar el efecto (el servidor devuelve el resultado original con el aviso
 * `SOLICITUD_REPETIDA`).
 */
export async function escribir<T>(
  accion: string,
  payload: Record<string, unknown> = {},
  opciones: OpcionesPeticion & { solicitudId?: string; actor?: string } = {},
): Promise<Result<T, AppErrorEvaluaciones>> {
  const cuerpo = cuerpoBase(accion, payload, opciones, opciones.solicitudId ?? nuevaSolicitudId());
  if (opciones.actor) cuerpo.actor = opciones.actor;
  const resultado = await enviar<T>(cuerpo, opciones, opciones.timeoutMs ?? TIMEOUT_ESCRITURA_MS);
  if (!resultado.ok) return err(resultado.error);
  const envelope = resultado.value;
  if (!envelope.ok) return err(toAppError(envelope));
  return ok((envelope.datos ?? null) as T);
}

/**
 * Lectura que además devuelve el envoltorio completo.
 *
 * Lo usa el panel de conexión, que necesita `meta` y `avisos` (versión del
 * backend, modo de autorización, aviso de administración sin llave) y no solo los
 * datos.
 */
export async function leerConMeta<T>(
  accion: string,
  payload: Record<string, unknown> = {},
  opciones: OpcionesPeticion = {},
): Promise<Result<Envelope<T>, AppErrorEvaluaciones>> {
  const resultado = await enviar<T>(
    cuerpoBase(accion, payload, opciones, ""),
    opciones,
    opciones.timeoutMs ?? TIMEOUT_LECTURA_MS,
  );
  if (!resultado.ok) return err(resultado.error);
  return ok(resultado.value);
}
