import { describe, it, expect, beforeEach } from "vitest";
import { bloquearScroll, reiniciarBloqueoScroll } from "../scrollLock";

/**
 * El bloqueo de scroll con recuento de referencias es la red que evita que la
 * página se quede «congelada» al solapar dos superficies (modal + confirmación,
 * o visor + formulario). Estas pruebas fijan justo ese contrato: el orden de
 * apertura y cierre no puede dejar el `body` bloqueado.
 */
describe("scrollLock · recuento de referencias", () => {
  beforeEach(() => {
    reiniciarBloqueoScroll();
    document.body.style.overflow = "";
  });

  it("un solo bloqueo oculta el overflow y al liberar lo restaura", () => {
    const liberar = bloquearScroll();
    expect(document.body.style.overflow).toBe("hidden");
    liberar();
    expect(document.body.style.overflow).toBe("");
  });

  it("dos bloqueos solapados no se pisan: solo el último en salir restaura", () => {
    const a = bloquearScroll();
    const b = bloquearScroll();
    expect(document.body.style.overflow).toBe("hidden");
    a();
    // Todavía queda uno: sigue bloqueado.
    expect(document.body.style.overflow).toBe("hidden");
    b();
    expect(document.body.style.overflow).toBe("");
  });

  it("cerrar en orden inverso tampoco deja el body bloqueado", () => {
    const a = bloquearScroll();
    const b = bloquearScroll();
    b();
    expect(document.body.style.overflow).toBe("hidden");
    a();
    expect(document.body.style.overflow).toBe("");
  });

  it("liberar dos veces la misma referencia no descuenta de más", () => {
    const a = bloquearScroll();
    const b = bloquearScroll();
    a();
    a(); // idempotente: no debe abrir el candado que todavía sostiene `b`
    expect(document.body.style.overflow).toBe("hidden");
    b();
    expect(document.body.style.overflow).toBe("");
  });

  it("preserva un valor previo de overflow y lo restaura al final", () => {
    document.body.style.overflow = "auto";
    const a = bloquearScroll();
    expect(document.body.style.overflow).toBe("hidden");
    a();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("la red de seguridad fuerza el desbloqueo pase lo que pase", () => {
    bloquearScroll();
    bloquearScroll();
    reiniciarBloqueoScroll();
    expect(document.body.style.overflow).toBe("");
    // Y tras reiniciar, un bloqueo nuevo vuelve a funcionar limpio.
    const liberar = bloquearScroll();
    expect(document.body.style.overflow).toBe("hidden");
    liberar();
    expect(document.body.style.overflow).toBe("");
  });
});
