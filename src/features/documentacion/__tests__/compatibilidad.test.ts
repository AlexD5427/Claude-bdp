import { describe, expect, it } from "vitest";
import {
  ACCIONES_REQUERIDAS,
  CATALOGO_ESPERADO,
  ESQUEMA_ESPERADO,
  diagnosticarCompatibilidad,
  intencionDeSeveridad,
} from "../domain/compatibilidad";
import type { EstadoModulo } from "../api/acciones";
import { loadInstalledBackend } from "../../../../scripts/documentacion-backend.mjs";

/**
 * El diagnóstico de compatibilidad, que es la respuesta a «se conecta mal».
 *
 * ── Qué se prueba aquí y por qué importa tanto ──────────────────────────────
 * El módulo se despliega en dos mitades y por manos distintas: el frontend lo
 * publica Vercel al fusionar y el backend lo pega una persona en Apps Script.
 * Entre las dos cosas hay un paso que se olvida —publicar una VERSIÓN NUEVA de
 * la implementación— y su síntoma es cruel: casi todo funciona, y falla justo lo
 * nuevo, en una pantalla que no habla de despliegues.
 *
 * Estas pruebas fijan que ese caso se detecte y que el mensaje diga QUÉ HACER.
 * Un diagnóstico que dice «incompatible» no vale nada.
 */

function estadoBase(patch: Partial<EstadoModulo> = {}): EstadoModulo {
  return {
    arquitectura: "documentacion-normalizada",
    version: "2.0.0",
    esquema: ESQUEMA_ESPERADO,
    catalogoVersion: CATALOGO_ESPERADO,
    acciones: [...ACCIONES_REQUERIDAS],
    backendHeredado: "1.0.0",
    instalado: true,
    libro: "CONTROL INGRESOS",
    libroUrl: "",
    horaServidor: "",
    rol: "admin",
    actor: "a",
    capacidades: { ver: true },
    hojas: {},
    migraciones: { aplicadas: [], pendientes: [], enProceso: [], total: 6 },
    aniosLibro: [],
    ...patch,
  };
}

describe("compatibilidad · el backend al día no dice nada", () => {
  it("un backend de la misma versión no produce ni un hallazgo", () => {
    const res = diagnosticarCompatibilidad(estadoBase());
    expect(res.hallazgos).toEqual([]);
    expect(res.compatible).toBe(true);
    expect(res.severidad).toBe("ok");
  });

  it("el backend REAL del repositorio es compatible con este frontend", () => {
    /* La comprobación que cierra el círculo: los números de esta capa se
       comparan con los que declara el backend de verdad. Si alguien sube
       `DOC2_SCHEMA_VERSION` y se olvida de `ESQUEMA_ESPERADO`, falla aquí y no
       en producción con un aviso falso de «despliegue a medias». */
    const h = loadInstalledBackend();
    const estado = h.ok("documentacion.estado");
    expect(estado.esquema).toBe(ESQUEMA_ESPERADO);
    expect(estado.catalogoVersion).toBe(CATALOGO_ESPERADO);
    for (const accion of ACCIONES_REQUERIDAS) {
      expect(estado.acciones, `el backend debe atender ${accion}`).toContain(accion);
    }
    const res = diagnosticarCompatibilidad(estado);
    expect(res.hallazgos, JSON.stringify(res.hallazgos)).toEqual([]);
  });
});

describe("compatibilidad · el caso del despliegue a medias", () => {
  it("un esquema anterior se nombra como crítico y explica el paso que falta", () => {
    const res = diagnosticarCompatibilidad(estadoBase({ esquema: ESQUEMA_ESPERADO - 1 }));
    const hallazgo = res.hallazgos.find((h) => h.codigo === "esquema-anterior")!;
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.severidad).toBe("critico");
    expect(res.compatible).toBe(false);
    // El mensaje tiene que contener la instrucción exacta, no una genérica.
    expect(hallazgo.queHacer).toMatch(/Versión nueva/i);
    expect(hallazgo.queHacer).toMatch(/Gestionar implementaciones/i);
    // Y tiene que explicar el síntoma, que es lo que la persona está viendo.
    expect(hallazgo.detalle).toMatch(/se conecta mal/i);
  });

  it("una URL de otro proyecto de Apps Script se distingue de un backend viejo", () => {
    const res = diagnosticarCompatibilidad(estadoBase({ arquitectura: "talento" }));
    const hallazgo = res.hallazgos.find((h) => h.codigo === "backend-ajeno")!;
    expect(hallazgo.severidad).toBe("critico");
    /* Son dos problemas con el mismo síntoma y arreglos opuestos: uno se
       resuelve republicando y el otro cambiando la URL. Confundirlos hace perder
       una tarde. */
    expect(hallazgo.queHacer).toMatch(/copie su URL/i);
    expect(res.hallazgos.some((h) => h.codigo === "esquema-anterior")).toBe(false);
  });

  it("nombra las acciones que faltan, una por una", () => {
    const res = diagnosticarCompatibilidad(estadoBase({ acciones: ["documentacion.estado"] }));
    const hallazgo = res.hallazgos.find((h) => h.codigo === "acciones-faltantes")!;
    expect(hallazgo.severidad).toBe("importante");
    for (const accion of ACCIONES_REQUERIDAS) {
      expect(hallazgo.detalle).toContain(accion);
    }
    // Y dice que el módulo sigue funcionando: hay recaída para todas.
    expect(hallazgo.detalle).toMatch(/sigue funcionando/i);
  });

  it("un backend que no declara sus acciones no se acusa de nada", () => {
    /* Un backend anterior a este cambio no manda la lista. Tratar la ausencia
       como «no tiene ninguna acción» produciría un hallazgo falso en el caso
       más frecuente del día del despliegue. */
    const res = diagnosticarCompatibilidad(estadoBase({ acciones: undefined }));
    expect(res.hallazgos.some((h) => h.codigo === "acciones-faltantes")).toBe(false);
  });

  it("un catálogo anterior avisa de que los recuentos no van a cuadrar", () => {
    const res = diagnosticarCompatibilidad(estadoBase({ catalogoVersion: CATALOGO_ESPERADO - 1 }));
    const hallazgo = res.hallazgos.find((h) => h.codigo === "catalogo-anterior")!;
    expect(hallazgo.severidad).toBe("importante");
    expect(hallazgo.queHacer).toMatch(/Respaldar/i);
    expect(hallazgo.queHacer).toMatch(/Migrar/i);
  });

  it("un backend MÁS nuevo que la pantalla es solo un aviso", () => {
    const res = diagnosticarCompatibilidad(estadoBase({ esquema: ESQUEMA_ESPERADO + 1 }));
    const hallazgo = res.hallazgos.find((h) => h.codigo === "esquema-posterior")!;
    /* El backend mantiene el contrato antiguo a propósito, así que esto no es un
       problema: es un frontend sin recargar. */
    expect(hallazgo.severidad).toBe("aviso");
    expect(res.compatible).toBe(true);
    expect(hallazgo.queHacer).toMatch(/Ctrl\+Shift\+R/);
  });
});

describe("compatibilidad · migraciones y hojas", () => {
  it("las migraciones pendientes se listan y no bloquean", () => {
    const res = diagnosticarCompatibilidad(
      estadoBase({ migraciones: { aplicadas: [], pendientes: ["4.2.0-legajo-administrativo"], enProceso: [], total: 6 } }),
    );
    const hallazgo = res.hallazgos.find((h) => h.codigo === "migraciones-pendientes")!;
    expect(hallazgo.severidad).toBe("aviso");
    expect(hallazgo.detalle).toContain("4.2.0-legajo-administrativo");
    expect(res.compatible).toBe(true);
  });

  it("las hojas que faltan se nombran y se ofrece instalar", () => {
    const res = diagnosticarCompatibilidad(
      estadoBase({ instalado: false, hojasFaltantes: ["Expedientes", "CatalogoDocumentos"] }),
    );
    const hallazgo = res.hallazgos.find((h) => h.codigo === "hojas-faltantes")!;
    expect(hallazgo.severidad).toBe("critico");
    expect(hallazgo.detalle).toContain("Expedientes");
    expect(hallazgo.queHacer).toMatch(/No borra nada/i);
  });

  it("sin estado no se inventa un diagnóstico", () => {
    const res = diagnosticarCompatibilidad(null);
    expect(res.hallazgos).toEqual([]);
    expect(res.compatible).toBe(false);
    expect(res.severidad).toBe("critico");
  });

  it("la severidad del conjunto es la peor de las individuales", () => {
    const res = diagnosticarCompatibilidad(
      estadoBase({
        esquema: ESQUEMA_ESPERADO - 1,
        migraciones: { aplicadas: [], pendientes: ["x"], enProceso: [], total: 6 },
      }),
    );
    expect(res.hallazgos.length).toBe(2);
    expect(res.severidad).toBe("critico");
    expect(intencionDeSeveridad(res.severidad)).toBe("peligro");
  });
});
