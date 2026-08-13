import { describe, expect, it, beforeEach } from "vitest";
import { bodyScrollLockDepth, lockBodyScroll } from "./scrollLock";

/**
 * Regresión del bloqueo de desplazamiento.
 *
 * El fallo que motivó estas pruebas: cada superficie guardaba el valor de
 * `body.style.overflow` que encontraba y lo restauraba al cerrarse. Con dos
 * superficies solapadas, la de arriba guardaba `"hidden"` y al cerrarse lo
 * reponía: la página se quedaba sin desplazamiento hasta recargar.
 */

beforeEach(() => {
  document.body.style.overflow = "";
  // Deja el contador en cero por si una prueba anterior no liberó.
  while (bodyScrollLockDepth() > 0) lockBodyScroll()();
});

describe("lockBodyScroll", () => {
  it("congela y libera un único bloqueo", () => {
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("");
  });

  it("con dos superficies solapadas sólo libera la última", () => {
    const primera = lockBodyScroll();
    const segunda = lockBodyScroll();
    expect(bodyScrollLockDepth()).toBe(2);

    // La de arriba se cierra: la de abajo sigue abierta, así que no se libera.
    segunda();
    expect(document.body.style.overflow).toBe("hidden");

    primera();
    expect(document.body.style.overflow).toBe("");
  });

  it("no se descompensa si se libera dos veces (efectos que se repiten)", () => {
    const release = lockBodyScroll();
    release();
    release();
    release();
    expect(bodyScrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("cerrar en cualquier orden devuelve el valor original", () => {
    document.body.style.overflow = "auto";
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    b();
    expect(document.body.style.overflow).toBe("auto");
  });
});
