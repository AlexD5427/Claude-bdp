/**
 * Acceso al almacenamiento del navegador que nunca tumba la aplicación.
 *
 * ## Por qué existe
 *
 * `window.localStorage` no es un objeto inocuo: **acceder a la propiedad** lanza
 * `SecurityError` cuando el navegador tiene bloqueados los datos del sitio
 * (Chrome con «Bloquear todas las cookies», Edge en modo estricto, una política
 * corporativa `DefaultCookiesSetting: 2`, o la página incrustada en un iframe con
 * el almacenamiento particionado). No hace falta llegar a `getItem`: basta con
 * nombrar `localStorage` para que el motor lance.
 *
 * En la aplicación había dos lecturas sin protección — el tema en
 * `ThemeContext` y el tema dentro de `captureBundle` — y la primera se ejecuta
 * como estado inicial del proveedor más externo del árbol. En un equipo con esa
 * configuración el resultado no era «el comparador no funciona»: era **la página
 * completamente en blanco**, sin un solo mensaje. Reproducido en
 * `qa/sondas.mjs almacenamiento-bloqueado`.
 *
 * Este módulo centraliza el acceso: si el almacenamiento no está disponible se
 * degrada a una copia en memoria que vive lo que dure la pestaña, y deja
 * constancia en {@link storageStatus} para que la interfaz pueda avisar de que
 * las preferencias no se guardarán.
 */

export type StorageKind = "local" | "session";
export type StorageAvailability = "ok" | "bloqueado" | "sin-espacio";

interface Probe {
  availability: StorageAvailability;
  /** Motivo técnico, útil en el panel de diagnóstico. */
  reason: string;
}

const memory: Record<StorageKind, Map<string, string>> = {
  local: new Map(),
  session: new Map(),
};

const probes: Partial<Record<StorageKind, Probe>> = {};

/** Devuelve el almacén nativo, o `null` si el navegador lo bloquea. */
function native(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const store = kind === "local" ? window.localStorage : window.sessionStorage;
    // Un tanteo real: hay navegadores que exponen el objeto y fallan al escribir.
    const probeKey = "__bdp_probe__";
    store.setItem(probeKey, "1");
    store.removeItem(probeKey);
    probes[kind] = { availability: "ok", reason: "" };
    return store;
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    probes[kind] = {
      availability: name === "QuotaExceededError" ? "sin-espacio" : "bloqueado",
      reason: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
    return null;
  }
}

export function readItem(kind: StorageKind, key: string): string | null {
  const store = native(kind);
  if (!store) return memory[kind].get(key) ?? null;
  try {
    return store.getItem(key);
  } catch {
    return memory[kind].get(key) ?? null;
  }
}

export function writeItem(kind: StorageKind, key: string, value: string): void {
  memory[kind].set(key, value);
  const store = native(kind);
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    probes[kind] = {
      availability: name === "QuotaExceededError" ? "sin-espacio" : "bloqueado",
      reason: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

export function removeItem(kind: StorageKind, key: string): void {
  memory[kind].delete(key);
  const store = native(kind);
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nada que hacer: la copia en memoria ya está limpia */
  }
}

/** Atajos legibles para el caso habitual. */
export const localRead = (key: string) => readItem("local", key);
export const localWrite = (key: string, value: string) => writeItem("local", key, value);
export const localRemove = (key: string) => removeItem("local", key);
export const sessionRead = (key: string) => readItem("session", key);
export const sessionWrite = (key: string, value: string) => writeItem("session", key, value);

/** Lee y parsea JSON, devolviendo `fallback` ante cualquier problema. */
export function readJsonItem<T>(kind: StorageKind, key: string, fallback: T): T {
  const raw = readItem(kind, key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Serializa y guarda; los ciclos o valores no serializables no propagan. */
export function writeJsonItem(kind: StorageKind, key: string, value: unknown): void {
  try {
    writeItem(kind, key, JSON.stringify(value));
  } catch {
    /* valor no serializable: se ignora, no es un dato crítico */
  }
}

/**
 * Estado del almacenamiento tal y como lo ve este navegador. El panel de
 * diagnóstico lo muestra para distinguir «el sistema está roto» de «este equipo
 * tiene bloqueados los datos del sitio».
 */
export function storageStatus(): Record<StorageKind, Probe> {
  return {
    local: probes.local ?? (native("local"), probes.local ?? { availability: "ok", reason: "" }),
    session:
      probes.session ?? (native("session"), probes.session ?? { availability: "ok", reason: "" }),
  };
}

/** Cookies: en un iframe restringido tocar `document.cookie` también lanza. */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function writeCookie(name: string, value: string, maxAgeDays: number): void {
  if (typeof document === "undefined") return;
  try {
    const maxAge = maxAgeDays * 24 * 60 * 60;
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    /* sin cookies la sesión no persiste entre recargas, pero la app funciona */
  }
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ídem */
  }
}
