/**
 * Envoltorio de la API y traducción de errores.
 *
 * El backend responde SIEMPRE con la misma forma, también cuando falla:
 *
 *   { ok, accion, solicitudId, datos, error, avisos, meta }
 *
 * Y `meta` viaja incluso en los errores, con la traza, la versión del backend y
 * el modo de autorización. Eso es lo que permite que el panel de conexión diga
 * «responde, 2.0.0, modo llave, instalado» sin una llamada aparte, y que un error
 * en pantalla se pueda buscar en la hoja `Registro` por su identificador.
 */

import { appError, type AppError, type AppErrorCode } from "../../../shared/result";

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  pista: string;
  detalle: Record<string, unknown>;
  traza: string;
}

export interface MetaApi {
  traza: string;
  horaServidor: string;
  milisegundos: number;
  backend: string;
  esquema: number;
  textoEnriquecido: number;
  modoAuth: string;
  instalado?: boolean;
  contadores?: Record<string, number>;
}

export interface Envelope<T = unknown> {
  ok: boolean;
  accion: string;
  solicitudId: string;
  datos: T | null;
  error: ErrorApi | null;
  avisos: string[];
  meta: MetaApi;
}

/** Hallazgo de validación tal como lo devuelve el servidor. */
export interface IssueApi {
  code: string;
  message: string;
  path: string;
  details: Record<string, unknown>;
}

const META_VACIA: MetaApi = {
  traza: "",
  horaServidor: "",
  milisegundos: 0,
  backend: "",
  esquema: 0,
  textoEnriquecido: 0,
  modoAuth: "",
};

/**
 * Normaliza cualquier cosa que llegue por la red a un envoltorio.
 *
 * Una respuesta con otra forma se convierte en un error explícito en lugar de
 * propagarse como `undefined` por el resto de la aplicación. Esa clase de fallo
 * («no se puede leer la propiedad de undefined») era el síntoma más frecuente y
 * el menos informativo del módulo anterior.
 */
export function parseEnvelope<T>(raw: unknown): Envelope<T> {
  if (!raw || typeof raw !== "object") {
    return errorEnvelope("INTERNAL_ERROR", "El servidor respondió con un formato inesperado.", {
      pista: "Comprueba que la URL apunta al despliegue /exec del Web App de Evaluaciones y no a otra página.",
    });
  }
  const candidato = raw as Partial<Envelope<T>>;
  if (typeof candidato.ok !== "boolean") {
    return errorEnvelope("INTERNAL_ERROR", "La respuesta no tiene la forma del backend de Evaluaciones.", {
      pista:
        "Suele significar que la URL apunta a otro Web App, o que el despliegue no se actualizó tras copiar los archivos .gs.",
    });
  }
  return {
    ok: candidato.ok,
    accion: typeof candidato.accion === "string" ? candidato.accion : "",
    solicitudId: typeof candidato.solicitudId === "string" ? candidato.solicitudId : "",
    datos: (candidato.datos ?? null) as T | null,
    error: candidato.error ?? null,
    avisos: Array.isArray(candidato.avisos) ? candidato.avisos : [],
    meta: { ...META_VACIA, ...(candidato.meta ?? {}) },
  };
}

export function errorEnvelope(
  codigo: string,
  mensaje: string,
  extra: { pista?: string; detalle?: Record<string, unknown> } = {},
): Envelope<never> {
  return {
    ok: false,
    accion: "",
    solicitudId: "",
    datos: null,
    error: {
      codigo,
      mensaje,
      pista: extra.pista ?? "",
      detalle: extra.detalle ?? {},
      traza: "",
    },
    avisos: [],
    meta: META_VACIA,
  };
}

/** Códigos del backend → códigos del `Result` de la aplicación. */
const MAPA_CODIGOS: Record<string, AppErrorCode> = {
  BAD_REQUEST: "validation",
  UNSUPPORTED_ACTION: "provider",
  VALIDATION_ERROR: "validation",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
  RATE_LIMITED: "provider",
  NOT_INSTALLED: "provider",
  SCHEMA_ERROR: "provider",
  BUSY: "provider",
  EXPIRED: "conflict",
  INTERNAL_ERROR: "provider",
};

/**
 * Error de la aplicación, enriquecido.
 *
 * Se conservan la PISTA, el DETALLE y la TRAZA del backend, porque son
 * exactamente lo que la interfaz necesita para decir algo útil. Perder la pista
 * al cruzar esta frontera es lo que convierte un backend explícito en una
 * aplicación que dice «ocurrió un error».
 */
export interface AppErrorEvaluaciones extends AppError {
  codigoBackend?: string;
  pista?: string;
  detalle?: Record<string, unknown>;
  traza?: string;
  issues?: IssueApi[];
}

export function toAppError(envelope: Envelope<unknown>): AppErrorEvaluaciones {
  const error = envelope.error;
  if (!error) return appError("provider", "El servidor rechazó la solicitud sin explicar el motivo.");
  const codigo = MAPA_CODIGOS[error.codigo] ?? "provider";
  const detalle = error.detalle ?? {};
  const issues = Array.isArray((detalle as { issues?: IssueApi[] }).issues)
    ? ((detalle as { issues: IssueApi[] }).issues as IssueApi[])
    : undefined;
  return {
    code: codigo,
    message: error.mensaje,
    codigoBackend: error.codigo,
    pista: error.pista,
    detalle,
    traza: error.traza,
    ...(issues ? { issues } : {}),
  };
}

/** Hallazgos de validación de un error, si los trae. */
export function issuesDe(error: AppError | AppErrorEvaluaciones): IssueApi[] {
  const propio = error as AppErrorEvaluaciones;
  return propio.issues ?? [];
}

/** ¿El error indica que el libro todavía no está instalado? */
export function requiereInstalacion(error: AppError | AppErrorEvaluaciones): boolean {
  return (error as AppErrorEvaluaciones).codigoBackend === "NOT_INSTALLED";
}

/** ¿El error indica que la llave de administración falta o no coincide? */
export function requiereLlave(error: AppError | AppErrorEvaluaciones): boolean {
  const propio = error as AppErrorEvaluaciones;
  if (propio.codigoBackend !== "FORBIDDEN") return false;
  const motivo = String((propio.detalle ?? {}).motivo ?? "");
  return motivo === "llave_ausente" || motivo === "llave_incorrecta";
}

/** ¿Es un conflicto que se puede forzar? */
export function puedeForzar(error: AppError | AppErrorEvaluaciones): boolean {
  return (error as AppErrorEvaluaciones).detalle?.puedeForzar === true;
}
