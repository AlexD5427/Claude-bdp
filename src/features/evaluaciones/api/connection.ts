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
  const urlValida = esUrlAbsoluta(url) ? url : "";
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

export function conexion(): Conexion {
  return conexionStore.get();
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

/** Enlace público de una evaluación, tal como se comparte con el candidato. */
export function enlacePublico(codigo: string): string {
  if (typeof window === "undefined") return `#/evaluacion/${codigo}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/evaluacion/${codigo}`;
}
