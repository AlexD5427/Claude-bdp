import { describe, expect, it, beforeEach } from "vitest";
import {
  defaultConfig,
  sanitizeConfig,
  MAX_COMPARADOR_LIMIT,
  type AppConfig,
} from "./configStore";

/**
 * Regresión del saneamiento de la configuración.
 *
 * La configuración no vive sólo en `localStorage`: viaja **por usuario** en la
 * columna `config_personal_perfil` de la hoja «Perfiles_y_Configuracion» y al
 * iniciar sesión se aplicaba tal cual. Un valor inservible en esa celda no
 * afectaba a «un navegador», sino a esa persona **en cualquier equipo** y a nadie
 * más, que es exactamente el cuadro que se veía en soporte: «a mí me funciona en
 * todos los dispositivos, a ese usuario nunca».
 *
 * El caso más dañino era `maxComparador`: con `null` o `0`, el buscador del
 * comparador se deshabilitaba con el rótulo «Límite alcanzado» y era imposible
 * agregar a nadie. Estas pruebas fijan la regla: nada entra al estado sin pasar
 * por `sanitizeConfig`.
 */
describe("sanitizeConfig · el comparador nunca queda sin columnas", () => {
  let base: AppConfig;
  beforeEach(() => {
    base = defaultConfig();
  });

  it.each([
    ["null", null],
    ["cero", 0],
    ["negativo", -4],
    ["NaN", Number.NaN],
    ["texto vacío", ""],
    ["indefinido", undefined],
    ["objeto", {}],
  ])("rechaza maxComparador = %s y deja un valor usable", (_caso, valor) => {
    const cfg = sanitizeConfig(base, { maxComparador: valor as never });
    expect(cfg.maxComparador).toBeGreaterThanOrEqual(2);
    expect(cfg.maxComparador).toBeLessThanOrEqual(MAX_COMPARADOR_LIMIT);
  });

  it("acepta un número válido y recorta los que se salen del rango", () => {
    expect(sanitizeConfig(base, { maxComparador: 6 }).maxComparador).toBe(6);
    expect(sanitizeConfig(base, { maxComparador: 99 }).maxComparador).toBe(MAX_COMPARADOR_LIMIT);
  });

  it("admite un número escrito como texto (viene de una hoja de cálculo)", () => {
    expect(sanitizeConfig(base, { maxComparador: "8" as never }).maxComparador).toBe(8);
  });
});

describe("sanitizeConfig · el resto de la configuración", () => {
  const base = defaultConfig();

  it("descarta valores fuera de catálogo y conserva los válidos", () => {
    const cfg = sanitizeConfig(base, {
      dockPosition: "arriba" as never,
      dockSize: "gigante" as never,
      comparatorOrder: "asc",
      rankPlacement: "fila",
      defaultPaper: "Legal",
    });
    expect(cfg.dockPosition).toBe("top");
    expect(cfg.dockSize).toBe("md");
    expect(cfg.comparatorOrder).toBe("asc");
    expect(cfg.rankPlacement).toBe("fila");
    expect(cfg.defaultPaper).toBe("Legal");
  });

  it("mantiene los interruptores como booleanos", () => {
    const cfg = sanitizeConfig(base, {
      rankingEnabled: "sí" as never,
      autoRefresh: 0 as never,
      sortByCapDesc: false,
    });
    expect(cfg.rankingEnabled).toBe(true);
    expect(cfg.autoRefresh).toBe(true);
    expect(cfg.sortByCapDesc).toBe(false);
  });

  it("acota el intervalo de refresco para no ahogar a Apps Script", () => {
    expect(sanitizeConfig(base, { autoRefreshSeconds: 1 }).autoRefreshSeconds).toBe(15);
    expect(sanitizeConfig(base, { autoRefreshSeconds: 999999 }).autoRefreshSeconds).toBe(3600);
  });

  it("sobrevive a un parche que no es un objeto", () => {
    expect(sanitizeConfig(base, "basura" as never)).toEqual(base);
    expect(sanitizeConfig(base, null)).toEqual(base);
  });

  it("descarta plantillas de correo corruptas y no se queda sin ninguna", () => {
    const cfg = sanitizeConfig(base, {
      emailTemplates: [
        { id: "", name: "sin id" },
        "texto",
        null,
      ] as never,
    });
    expect(cfg.emailTemplates.length).toBe(base.emailTemplates.length);
  });

  it("conserva una plantilla válida y le pone valores por omisión a lo que falta", () => {
    const cfg = sanitizeConfig(base, {
      emailTemplates: [{ id: "t1", category: "inventada", subject: 5 }] as never,
    });
    expect(cfg.emailTemplates).toHaveLength(1);
    expect(cfg.emailTemplates[0].category).toBe("convocatoria");
    expect(cfg.emailTemplates[0].subject).toBe("");
    expect(cfg.emailTemplates[0].active).toBe(true);
  });
});
