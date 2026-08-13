/**
 * Acceso al almacenamiento del navegador que nunca lanza.
 *
 * ## Por qué existe
 *
 * `window.localStorage` parece una propiedad inofensiva, pero **leerla puede
 * lanzar**. Si el navegador tiene bloqueado el almacenamiento del sitio —la
 * política «Bloquear todas las cookies» de Chrome/Edge, un perfil corporativo
 * administrado, Safari en navegación privada con cuota agotada— el simple
 * `window.localStorage.getItem(...)` levanta un `SecurityError`. Y como en esta
 * aplicación esa lectura ocurría al construir el proveedor de tema (por encima de
 * cualquier `ErrorBoundary`), el resultado era una **pantalla en blanco** en ese
 * equipo y sólo en ese equipo, mientras en el resto todo funcionaba.
 *
 * Aquí concentramos el acceso: cada operación se envuelve una sola vez y devuelve
 * `null` (o `false`) en lugar de romper. Además exponemos
 * {@link storageDisponible}, que es lo que consulta el panel de Diagnóstico para
 * poder decirle a la persona *por qué* su equipo se comporta distinto.
 */

type Almacen = "local" | "session";

function crudo(tipo: Almacen): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return tipo === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // El navegador bloquea el almacenamiento del sitio.
    return null;
  }
}

function leer(tipo: Almacen, clave: string): string | null {
  try {
    return crudo(tipo)?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function escribir(tipo: Almacen, clave: string, valor: string): boolean {
  try {
    const almacen = crudo(tipo);
    if (!almacen) return false;
    almacen.setItem(clave, valor);
    return true;
  } catch {
    // Cuota agotada o modo privado: escribir es una ayuda, no un requisito.
    return false;
  }
}

function borrar(tipo: Almacen, clave: string): void {
  try {
    crudo(tipo)?.removeItem(clave);
  } catch {
    /* nada que hacer */
  }
}

export const almacenLocal = {
  get: (clave: string) => leer("local", clave),
  set: (clave: string, valor: string) => escribir("local", clave, valor),
  remove: (clave: string) => borrar("local", clave),
};

export const almacenSesion = {
  get: (clave: string) => leer("session", clave),
  set: (clave: string, valor: string) => escribir("session", clave, valor),
  remove: (clave: string) => borrar("session", clave),
};

/**
 * Comprueba de verdad si el almacén se puede usar: no basta con que exista, hay
 * que poder escribir en él (el modo privado de Safari lo expone y luego rechaza
 * cada escritura). Se prueba con una clave propia que se borra al terminar.
 */
export function storageDisponible(tipo: Almacen = "local"): boolean {
  const clave = "__bdp_probe__";
  if (!escribir(tipo, clave, "1")) return false;
  const ok = leer(tipo, clave) === "1";
  borrar(tipo, clave);
  return ok;
}

/** ¿Se pueden usar cookies? (la sesión del perfil vive en una). */
export function cookiesDisponibles(): boolean {
  if (typeof document === "undefined") return false;
  try {
    if (navigator.cookieEnabled === false) return false;
    document.cookie = "__bdp_probe__=1; path=/; SameSite=Lax";
    const ok = /(?:^|; )__bdp_probe__=1/.test(document.cookie);
    document.cookie = "__bdp_probe__=; path=/; max-age=0; SameSite=Lax";
    return ok;
  } catch {
    return false;
  }
}

/** Lee y parsea JSON sin lanzar nunca. */
export function leerJson<T>(clave: string, respaldo: T, tipo: Almacen = "local"): T {
  const texto = leer(tipo, clave);
  if (!texto) return respaldo;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return respaldo;
  }
}

/** Serializa y guarda JSON sin lanzar nunca. Devuelve si pudo escribir. */
export function escribirJson(clave: string, valor: unknown, tipo: Almacen = "local"): boolean {
  try {
    return escribir(tipo, clave, JSON.stringify(valor));
  } catch {
    // Referencias circulares o valores no serializables.
    return false;
  }
}
