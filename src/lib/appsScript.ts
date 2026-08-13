import { SCRIPT_URL } from "../constants";

/**
 * Puerta única contra el backend de Google Apps Script.
 *
 * ## El fallo que arregla este archivo
 *
 * Hasta ahora cada escritura hacía su propio `fetch` y **nadie miraba la
 * respuesta**:
 *
 * ```ts
 * await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify(candidate) });
 * return { ok: true, message: "Postulante registrado correctamente." };
 * ```
 *
 * Con eso, el aviso verde de «registrado correctamente» aparecía *siempre*: daba
 * igual que la hoja hubiera rechazado la fila por identificador repetido, que la
 * cuota de Apps Script estuviera agotada o que Google hubiera devuelto su página
 * de «Se ha producido un error». El cuestionario se cerraba, el borrador local se
 * borraba y la ficha no existía en ninguna parte. Visto desde la silla de la
 * analista, eso es exactamente «no puedo añadir postulantes», mientras quien
 * revisa desde otro equipo ve la aplicación funcionando.
 *
 * ## Qué hace ahora
 *
 * `escribirEnHoja` clasifica el resultado en cuatro casos y devuelve un mensaje
 * accionable en cada uno:
 *
 * | Caso                 | Qué ocurrió                                              |
 * | -------------------- | -------------------------------------------------------- |
 * | `ok`                 | La hoja aceptó la operación.                              |
 * | `rechazada`          | El backend contestó `status: "error"` (regla de negocio).  |
 * | `sin_red`            | La petición no llegó a salir (red, proxy, dominio bloqueado). |
 * | `respuesta_invalida` | Contestó HTML: sesión/permiso del despliegue o error de Google. |
 *
 * Un detalle que parece menor y no lo es: **una respuesta HTML nunca es un
 * guardado correcto**. Apps Script sólo devuelve HTML cuando el despliegue exige
 * iniciar sesión, cuando la autorización caducó o cuando el propio Google
 * muestra su página de error. Ese es el caso que más se parece a «a mí no me
 * funciona y a ti sí», porque los datos de lectura siguen llegando de la caché
 * local y la aplicación aparenta estar viva.
 */

export type ResultadoEscrituraTipo = "ok" | "rechazada" | "sin_red" | "respuesta_invalida";

export interface ResultadoEscritura {
  ok: boolean;
  tipo: ResultadoEscrituraTipo;
  /** Mensaje listo para mostrarle a la persona que operó. */
  message: string;
  /**
   * `true` sólo cuando el backend contestó un JSON con `status: "success"`.
   * Los despliegues antiguos contestan vacío: se aceptan (no podemos romper lo
   * que hoy funciona) pero el panel de Diagnóstico lo distingue.
   */
  confirmado: boolean;
  /** Estado HTTP, cuando hubo respuesta. */
  http?: number;
}

/** Tiempo máximo que esperamos a Apps Script antes de darlo por perdido. */
const TIMEOUT_MS = 25_000;

/** Respuesta JSON estándar del backend. */
interface SobreBackend {
  status?: string;
  message?: string;
  mensaje?: string;
  error?: string;
}

function abortadorConTiempo(ms: number): { signal: AbortSignal; cancelar: () => void } {
  const controlador = new AbortController();
  const id = setTimeout(() => controlador.abort(), ms);
  return { signal: controlador.signal, cancelar: () => clearTimeout(id) };
}

/** ¿El cuerpo es una página web en lugar de una respuesta de datos? */
export function pareceHtml(texto: string): boolean {
  const t = texto.trimStart().slice(0, 400).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<head") || t.startsWith("<meta");
}

/** Traduce una página HTML de Google a algo que la persona pueda accionar. */
export function diagnosticoHtml(texto: string): string {
  const t = texto.toLowerCase();
  if (t.includes("accounts.google.com") || t.includes("iniciar sesión") || t.includes("sign in")) {
    return "El servidor pidió iniciar sesión en Google en lugar de guardar. Vuelva a publicar el Apps Script con acceso «Cualquier persona» (Implementar → Administrar implementaciones).";
  }
  if (t.includes("autoriza") || t.includes("authorization") || t.includes("permiso")) {
    return "El Apps Script perdió la autorización para escribir en la hoja. Ábralo y ejecute cualquier función una vez para volver a autorizarlo.";
  }
  return "El servidor devolvió una página de error de Google en lugar de confirmar el guardado. El registro NO se guardó: reintente y, si persiste, revise el despliegue del Apps Script.";
}

/**
 * Envía una operación de escritura y clasifica la respuesta.
 *
 * El cuerpo viaja como `text/plain` a propósito: así el navegador no dispara la
 * petición `OPTIONS` de CORS, que un despliegue estándar de Apps Script no sabe
 * responder. `redirect: "follow"` es obligatorio porque Google contesta con un
 * `302` hacia `script.googleusercontent.com`; sin seguirlo, producción (Vercel)
 * devuelve 404.
 */
export async function escribirEnHoja(cuerpo: unknown): Promise<ResultadoEscritura> {
  const { signal, cancelar } = abortadorConTiempo(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(cuerpo),
      signal,
    });
  } catch (err) {
    cancelar();
    const abortada = err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      tipo: "sin_red",
      confirmado: false,
      message: abortada
        ? "El servidor no respondió a tiempo. El registro no se guardó: revise su conexión e inténtelo de nuevo."
        : "No se pudo contactar con el servidor. El registro no se guardó: revise su conexión (o si la red del banco bloquea script.google.com) e inténtelo de nuevo.",
    };
  }
  cancelar();

  let texto = "";
  try {
    texto = await res.text();
  } catch {
    texto = "";
  }

  if (!res.ok) {
    return {
      ok: false,
      tipo: "respuesta_invalida",
      confirmado: false,
      http: res.status,
      message: `El servidor respondió con un error HTTP ${res.status}. El registro no se guardó; inténtelo de nuevo.`,
    };
  }

  if (pareceHtml(texto)) {
    return {
      ok: false,
      tipo: "respuesta_invalida",
      confirmado: false,
      http: res.status,
      message: diagnosticoHtml(texto),
    };
  }

  let sobre: SobreBackend | null = null;
  try {
    const parseado = texto ? JSON.parse(texto) : null;
    if (parseado && typeof parseado === "object") sobre = parseado as SobreBackend;
  } catch {
    sobre = null;
  }

  const estado = (sobre?.status ?? "").toLowerCase();
  if (estado && estado !== "success" && estado !== "ok") {
    return {
      ok: false,
      tipo: "rechazada",
      confirmado: false,
      http: res.status,
      message:
        sobre?.message ||
        sobre?.mensaje ||
        sobre?.error ||
        "El servidor rechazó la operación. El registro no se guardó.",
    };
  }

  return {
    ok: true,
    tipo: "ok",
    confirmado: estado === "success" || estado === "ok",
    http: res.status,
    message: "Operación registrada en la hoja.",
  };
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export interface ResultadoLectura<T> {
  ok: boolean;
  datos: T | null;
  /** Mensaje explicativo cuando `ok` es falso. */
  message: string;
  tipo: "ok" | "sin_red" | "respuesta_invalida";
}

/**
 * Lee el JSON del endpoint. A diferencia de un `res.json()` pelado, distingue
 * «no hay red» de «Google contestó una página de inicio de sesión», que es la
 * diferencia entre un problema de conexión y un problema de despliegue.
 *
 * El `signal` del llamador y el tiempo máximo propio se combinan en un único
 * abortador: así una lectura colgada termina sola (antes el `TIMEOUT_MS` no se
 * aplicaba cuando venía un `signal` de fuera) y una cancelación del llamador
 * sigue distinguiéndose de un fallo real, que es lo que decide si se reintenta.
 */
export async function leerDeHoja<T>(signal?: AbortSignal): Promise<ResultadoLectura<T>> {
  const controlador = new AbortController();
  const abortarPorLlamador = () => controlador.abort();
  if (signal) {
    if (signal.aborted) throw new DOMException("cancelado", "AbortError");
    signal.addEventListener("abort", abortarPorLlamador, { once: true });
  }
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  const limpiar = () => {
    clearTimeout(temporizador);
    signal?.removeEventListener("abort", abortarPorLlamador);
  };

  let res: Response;
  try {
    res = await fetch(SCRIPT_URL, {
      method: "GET",
      // CRÍTICO: seguir el 302 de Google o producción (Vercel) devuelve 404.
      redirect: "follow",
      headers: { Accept: "application/json" },
      signal: controlador.signal,
    });
  } catch (err) {
    limpiar();
    // Cancelación del llamador (cambio de módulo, recarga): no es un fallo.
    if (signal?.aborted) throw err;
    return {
      ok: false,
      datos: null,
      tipo: "sin_red",
      message: controlador.signal.aborted
        ? "El servidor de datos no respondió a tiempo."
        : "No se pudo contactar con el servidor de datos.",
    };
  }
  limpiar();

  const texto = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      datos: null,
      tipo: "respuesta_invalida",
      message: `El servidor de datos respondió HTTP ${res.status}.`,
    };
  }
  if (pareceHtml(texto)) {
    return { ok: false, datos: null, tipo: "respuesta_invalida", message: diagnosticoHtml(texto) };
  }
  try {
    return { ok: true, datos: JSON.parse(texto) as T, message: "", tipo: "ok" };
  } catch {
    return {
      ok: false,
      datos: null,
      tipo: "respuesta_invalida",
      message: "El servidor de datos devolvió una respuesta que no es JSON.",
    };
  }
}
