/**
 * Configuración de la conexión — el reemplazo de las cinco variables de entorno.
 *
 * ── El problema que resuelve ──────────────────────────────────────────────────
 * La versión anterior repartía la configuración del módulo entre cinco variables
 * de entorno (`VITE_ASSESSMENTS_PROVIDER`, `VITE_EVALUATIONS_API_URL`,
 * `VITE_EVALUATIONS_ADMIN_API_URL`, más dos secretos de servidor) y un archivo
 * `.env.production` versionado. Con una mal escrita el módulo dejaba de
 * funcionar, y encima había que teclear una frase de acceso en cada visita.
 *
 * Aquí la configuración vive en UN sitio y se edita desde la propia interfaz
 * («Evaluaciones → Conexión»). Se guarda en el navegador, así que se configura una
 * vez y no vuelve a pedirse. Sigue admitiendo valores por omisión de compilación
 * para que un despliegue nuevo funcione sin tocar nada, pero ya no son
 * obligatorios ni son la única vía.
 *
 * ── Sobre la llave ───────────────────────────────────────────────────────────
 * La llave de administración es un secreto de despliegue, no un secreto por
 * persona: quien puede abrir el ATS puede administrar evaluaciones. Guardarla en
 * `localStorage` de un equipo de trabajo es exactamente el nivel de protección que
 * este sistema necesita, y es una decisión consciente que está documentada en
 * `docs/evaluaciones/SEGURIDAD.md`. Lo que NO se hace es incrustarla en el bundle
 * ni enviarla a ningún tercero.
 */

import { createStore } from "../../../shared/store";
import { newId } from "../../../shared/ids";
import { DESPLIEGUE_EVALUACIONES, DOMINIO_EVALUACIONES } from "../../../config/google";
import { existeEnDemostracion } from "./demoBackend";

export type ModoBackend = "apps-script" | "demostracion";

export interface Conexion {
  modo: ModoBackend;
  /** URL `…/exec` del Web App de Apps Script. */
  url: string;
  /** Llave de administración (propiedad `EV_ADMIN_KEY` del script). */
  llave: string;
  /** Identificador estable de este navegador, para la detección de conflictos. */
  cliente: string;
  /** Fecha de la última comprobación correcta. */
  verificadoEn: string;
}

const CLAVE = "bdp-evaluaciones-conexion";

function env(clave: string): string {
  return String((import.meta.env as Record<string, string | undefined>)[clave] ?? "").trim();
}

/** ¿Es una URL absoluta `http(s)`? */
export function esUrlAbsoluta(valor: string): boolean {
  try {
    const parsed = new URL(valor);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Valores por omisión de compilación, si existen.
 *
 * Son OPCIONALES. Si la URL no es absoluta se ignora en lugar de usarse: pegar
 * una ruta interna (`/api/…`) en esta variable fue uno de los errores que dejó el
 * módulo anterior inservible, y aceptarla solo retrasa el diagnóstico.
 */
function porOmision(): Conexion {
  const url = env("VITE_EVALUACIONES_URL");
  const llave = env("VITE_EVALUACIONES_LLAVE");
  // Orden: variable de compilación, y si no hay, el despliegue escrito en el
  // repositorio (`src/config/google.ts`). El segundo existe para que los enlaces
  // compartidos ANTES de que los enlaces llevaran su referencia dentro sigan
  // abriendo, sin depender de variables de entorno.
  const desdeRepositorio = DESPLIEGUE_EVALUACIONES
    ? urlDeDespliegue({ id: DESPLIEGUE_EVALUACIONES, dominio: DOMINIO_EVALUACIONES })
    : "";
  const urlValida = esUrlAbsoluta(url) ? url : desdeRepositorio;
  return {
    modo: urlValida ? "apps-script" : "demostracion",
    url: urlValida,
    llave,
    cliente: "",
    verificadoEn: "",
  };
}

/** Motivo por el que se ignoró un valor de compilación, o cadena vacía. */
export const AVISO_CONFIGURACION: string = (() => {
  const url = env("VITE_EVALUACIONES_URL");
  if (url && !esUrlAbsoluta(url)) {
    return `La variable de compilación VITE_EVALUACIONES_URL tiene el valor «${url}», que no es una dirección completa. Se ignoró: configura la conexión desde el panel.`;
  }
  return "";
})();

const inicial: Conexion = (() => {
  const base = porOmision();
  return { ...base, cliente: newId("cli") };
})();

export const conexionStore = createStore<Conexion>(inicial, {
  persistKey: CLAVE,
  deserialize: (raw) => {
    // Se mezcla con los valores por omisión para que una configuración guardada de
    // una versión anterior no deje campos sin definir.
    try {
      const guardada = JSON.parse(raw) as Partial<Conexion>;
      const base = porOmision();
      return {
        modo: guardada.modo === "apps-script" || guardada.modo === "demostracion" ? guardada.modo : base.modo,
        url: typeof guardada.url === "string" ? guardada.url : base.url,
        llave: typeof guardada.llave === "string" ? guardada.llave : base.llave,
        cliente: typeof guardada.cliente === "string" && guardada.cliente ? guardada.cliente : newId("cli"),
        verificadoEn: typeof guardada.verificadoEn === "string" ? guardada.verificadoEn : "",
      };
    } catch {
      return inicial;
    }
  },
});

/**
 * Conexión activa.
 *
 * Si un enlace público impuso la suya, manda esa: quien está mirando la pantalla
 * es un postulante y su navegador no tiene —ni debe tener— configuración propia.
 */
export function conexion(): Conexion {
  return deEnlace ?? conexionStore.get();
}

export function guardarConexion(cambios: Partial<Conexion>): void {
  conexionStore.set((previa) => ({ ...previa, ...cambios }));
}

/** Identificador estable de este navegador. */
export function clienteId(): string {
  return conexionStore.get().cliente;
}

/**
 * Problema de configuración, o cadena vacía.
 *
 * Se comprueba ANTES de intentar la llamada: reintentar tres veces una URL
 * inválida solo retrasa el mensaje que el operador necesita leer.
 */
export function problemaDeConexion(c: Conexion = conexion()): string {
  if (c.modo === "demostracion") return "";
  if (!c.url) {
    return "Falta la dirección del backend. Pégala en Evaluaciones → Conexión: es la URL que termina en /exec del despliegue del Web App.";
  }
  if (!esUrlAbsoluta(c.url)) {
    return `La dirección «${c.url}» no es una URL completa. Debe empezar por https:// y terminar en /exec.`;
  }
  if (!/\/exec\/?$/.test(c.url)) {
    return "La dirección no termina en /exec. Copia la URL del DESPLIEGUE del Web App, no la del editor de Apps Script ni la que acaba en /dev.";
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* El enlace público                                                   */
/* ------------------------------------------------------------------ */

/**
 * ── El fallo que resuelve todo lo que sigue ─────────────────────────────────
 * El enlace era `…#/evaluacion/EV-XXXX-1234`: el código y nada más. Quien lo
 * abría resolvía el backend leyendo ESTE navegador, y la configuración vive en
 * `localStorage`. El reclutador la tiene; una persona de fuera, no. Así que su
 * navegador caía en el modo demostración —cuyo almacén está vacío— y contestaba
 * «No existe ninguna evaluación con ese código». El enlace funcionaba para quien
 * lo generaba y para nadie más.
 *
 * La corrección es que el enlace diga a QUÉ despliegue pertenece. No se pone la
 * URL entera: se pone la referencia del despliegue de Apps Script, y la URL se
 * reconstruye aquí. Así el enlace es corto y, sobre todo, **no puede apuntar a
 * ningún sitio que no sea `script.google.com`**: aunque alguien manipule el
 * parámetro, lo único que puede conseguir es señalar otro despliegue de Apps
 * Script, nunca un servidor propio al que enviar los datos del postulante.
 */

/** Referencia de un despliegue de Apps Script. */
export interface Despliegue {
  /** Identificador del despliegue (`AKfycb…`). */
  id: string;
  /** Dominio de Workspace, para los despliegues `/a/macros/<dominio>/…`. */
  dominio: string;
}

const RE_ID = /^[A-Za-z0-9_-]{20,200}$/;
const RE_DOMINIO = /^[A-Za-z0-9.-]{3,120}$/;

/**
 * Referencia de despliegue a partir de una URL `…/exec`.
 *
 * Apps Script publica en dos formas y solo en dos: la personal
 * (`/macros/s/<id>/exec`) y la de Workspace (`/a/macros/<dominio>/s/<id>/exec`).
 * Cualquier otra cosa devuelve `null`, y entonces el enlace no se puede hacer
 * portátil: es mejor decirlo que fabricar un enlace que falle en silencio.
 */
export function despliegueDeUrl(url: string): Despliegue | null {
  if (!esUrlAbsoluta(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "script.google.com") return null;
  const conDominio = /^\/a\/macros\/([A-Za-z0-9.-]+)\/s\/([A-Za-z0-9_-]+)\/exec\/?$/.exec(parsed.pathname);
  if (conDominio) return { id: conDominio[2], dominio: conDominio[1] };
  const simple = /^\/macros\/s\/([A-Za-z0-9_-]+)\/exec\/?$/.exec(parsed.pathname);
  if (simple) return { id: simple[1], dominio: "" };
  return null;
}

/** URL `…/exec` a partir de la referencia. Siempre en `script.google.com`. */
export function urlDeDespliegue(d: Despliegue): string {
  if (!RE_ID.test(d.id)) return "";
  if (d.dominio) {
    if (!RE_DOMINIO.test(d.dominio)) return "";
    return `https://script.google.com/a/macros/${d.dominio}/s/${d.id}/exec`;
  }
  return `https://script.google.com/macros/s/${d.id}/exec`;
}

/**
 * Referencia de despliegue escrita en el enlace.
 *
 * Va DENTRO del hash (`#/evaluacion/CODIGO?b=…`) a propósito: lo que sigue a la
 * almohadilla no se envía al servidor que sirve la página, así que la referencia
 * no aparece en los registros del alojamiento ni en el `Referer` de terceros.
 */
export function despliegueEnEnlace(hash: string): Despliegue | null {
  const interrogante = hash.indexOf("?");
  if (interrogante < 0) return null;
  const params = new URLSearchParams(hash.slice(interrogante + 1));
  const id = (params.get("b") ?? "").trim();
  const dominio = (params.get("bd") ?? "").trim();
  if (!RE_ID.test(id)) return null;
  if (dominio && !RE_DOMINIO.test(dominio)) return null;
  return { id, dominio };
}

/** ¿Hay una configuración guardada por una persona en este navegador? */
export function hayConfiguracionGuardada(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(CLAVE) !== null;
  } catch {
    return false;
  }
}

/**
 * Conexión impuesta por un enlace público.
 *
 * Vive en memoria y NO se persiste, por dos razones. La primera es que no hace
 * falta: el enlace lleva la referencia, así que recargar la vuelve a resolver.
 * La segunda es de seguridad: si se guardara, un enlace manipulado dejaría al
 * reclutador —en ese mismo navegador— hablando con un despliegue ajeno al abrir
 * el ATS. Además va SIN llave: un enlace público nunca puede provocar que la
 * llave de administración salga hacia un despliegue que no es el propio.
 */
let deEnlace: Conexion | null = null;

export function fijarConexionDeEnlace(d: Despliegue): boolean {
  const url = urlDeDespliegue(d);
  if (!url) return false;
  deEnlace = { modo: "apps-script", url, llave: "", cliente: clienteId(), verificadoEn: "" };
  return true;
}

/** ¿Se está usando la conexión que venía en el enlace? */
export function conexionEsDeEnlace(): boolean {
  return deEnlace !== null;
}

export function olvidarConexionDeEnlace(): void {
  deEnlace = null;
}

export type OrigenConexion = "enlace" | "compilacion" | "navegador" | "demostracion" | "ninguno";

/**
 * De dónde sale el backend cuando alguien abre un enlace público.
 *
 * El orden importa y es este:
 *
 *   1. **el enlace**, porque nombra el despliegue donde vive esa evaluación;
 *   2. **el valor de compilación**, que es lo que hace funcionar los enlaces
 *      antiguos —los que se compartieron antes de este arreglo— sin volver a
 *      enviarlos;
 *   3. **la configuración de este navegador**, que es el caso del reclutador que
 *      abre su propio enlace (y el único en el que el modo demostración tiene
 *      sentido);
 *   4. **nada**, y entonces se dice exactamente eso. Caer en la demostración en
 *      silencio es lo que producía el mensaje equivocado.
 */
export function resolverConexionPublica(
  hash: string,
  codigo = "",
): { conexion: Conexion | null; origen: OrigenConexion } {
  const enElEnlace = despliegueEnEnlace(hash);
  if (enElEnlace && fijarConexionDeEnlace(enElEnlace)) {
    return { conexion: deEnlace, origen: "enlace" };
  }
  const base = porOmision();
  if (base.modo === "apps-script" && base.url) {
    deEnlace = { ...base, llave: "", cliente: clienteId(), verificadoEn: "" };
    return { conexion: deEnlace, origen: "compilacion" };
  }
  if (hayConfiguracionGuardada()) {
    return { conexion: conexionStore.get(), origen: "navegador" };
  }
  // Último recurso: la prueba puede estar en la demostración de este mismo
  // navegador, sin que nadie haya tocado el panel de conexión. Abrirla es lo
  // correcto —está aquí— y el runner avisa de que es una vista local.
  if (codigo && existeEnDemostracion(codigo)) {
    return { conexion: conexionStore.get(), origen: "demostracion" };
  }
  return { conexion: null, origen: "ninguno" };
}

/**
 * Enlace público de una evaluación, tal como se comparte con el candidato.
 *
 * Lleva la referencia del despliegue cuando la hay. Cuando no la hay —modo
 * demostración, o una URL con una forma que no es la de Apps Script— el enlace
 * sale igual, porque sigue sirviendo para probar en este equipo, pero
 * `diagnosticoEnlace` lo marca como NO portátil y la interfaz lo advierte antes
 * de que alguien lo mande por correo.
 */
export function enlacePublico(codigo: string, c: Conexion = conexion()): string {
  const base =
    typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  const referencia = c.modo === "apps-script" ? despliegueDeUrl(c.url) : null;
  if (!referencia) return `${base}#/evaluacion/${codigo}`;
  const dominio = referencia.dominio ? `&bd=${encodeURIComponent(referencia.dominio)}` : "";
  return `${base}#/evaluacion/${codigo}?b=${encodeURIComponent(referencia.id)}${dominio}`;
}

export interface DiagnosticoEnlace {
  enlace: string;
  /** ¿Funcionará en el teléfono de otra persona? */
  portatil: boolean;
  motivo: string;
  remedio: string;
}

/** Estado del enlace público: si servirá fuera de este navegador y por qué. */
export function diagnosticoEnlace(codigo: string, c: Conexion = conexion()): DiagnosticoEnlace {
  const enlace = enlacePublico(codigo, c);
  if (c.modo === "demostracion") {
    return {
      enlace,
      portatil: false,
      motivo:
        "El módulo está en modo demostración: la evaluación existe solo en este navegador, así que este enlace no abrirá en ningún otro equipo.",
      remedio:
        "Ve a Evaluaciones → Conexión, elige «Backend de Apps Script», pega la URL del despliegue que termina en /exec y vuelve a publicar.",
    };
  }
  if (!despliegueDeUrl(c.url)) {
    return {
      enlace,
      portatil: false,
      motivo: `La dirección configurada («${c.url || "sin dirección"}») no tiene la forma de un despliegue de Apps Script, así que el enlace no puede llevarla dentro.`,
      remedio:
        "Copia otra vez la URL del despliegue desde Implementar → Gestionar implementaciones. Debe empezar por https://script.google.com/macros/s/ y terminar en /exec.",
    };
  }
  return { enlace, portatil: true, motivo: "", remedio: "" };
}
