/**
 * Almacenamiento del navegador a prueba de balas.
 *
 * En algunos equipos el almacenamiento del sitio está bloqueado: política de
 * empresa, «bloquear todas las cookies», modo privado de Safari, o la página
 * abierta dentro de un iframe de otro dominio. En esos navegadores no basta con
 * envolver `setItem` en un `try`: **acceder a la propiedad** `window.localStorage`
 * ya lanza un `SecurityError`.
 *
 * Eso convertía un detalle de preferencias en una pantalla en blanco: el tema se
 * leía sin protección durante el primer dibujado de `ThemeProvider`, que está
 * por encima de cualquier frontera de error, así que la aplicación entera moría
 * antes de pintar un solo píxel. Desde la silla de quien lo sufre —una sola
 * persona del equipo, con su navegador endurecido— eso se describe exactamente
 * como «a mí no me funciona, y en las demás computadoras sí».
 *
 * Este módulo centraliza los cuatro accesos y **nunca lanza**. Sin almacenamiento
 * la aplicación funciona igual; sólo deja de recordar preferencias entre visitas.
 */

export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** `false` cuando el navegador no permite almacenar nada. */
  readonly available: boolean;
}

function wrap(pick: () => Storage | null | undefined): SafeStorage {
  const raw = (): Storage | null => {
    try {
      return pick() ?? null;
    } catch {
      return null;
    }
  };
  return {
    getItem(key) {
      try {
        return raw()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        raw()?.setItem(key, value);
      } catch {
        /* cuota agotada o almacenamiento bloqueado: no es un requisito */
      }
    },
    removeItem(key) {
      try {
        raw()?.removeItem(key);
      } catch {
        /* ídem */
      }
    },
    get available() {
      return raw() !== null;
    },
  };
}

/** `localStorage` que no lanza (persistente entre visitas). */
export const safeLocal = wrap(() =>
  typeof window === "undefined" ? null : window.localStorage,
);

/** `sessionStorage` que no lanza (vive lo que dure la pestaña). */
export const safeSession = wrap(() =>
  typeof window === "undefined" ? null : window.sessionStorage,
);

/** Lee y deserializa JSON, devolviendo `fallback` ante cualquier problema. */
export function readJson<T>(storage: SafeStorage, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/** Serializa y guarda JSON; ignora cualquier fallo del navegador. */
export function writeJson(storage: SafeStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* valores cíclicos o almacenamiento bloqueado */
  }
}
