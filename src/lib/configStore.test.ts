import { describe, expect, it } from "vitest";
import { sanitizeConfig } from "./configStore";

/**
 * Regresión: configuración imposible que dejaba un módulo inservible.
 *
 * `maxComparador: 0` llegaba desde el paquete personal del perfil (hoja
 * `Perfiles_y_Configuracion`, columna `config_personal_perfil`) y deshabilitaba
 * el buscador del Comparador con «Límite alcanzado (0/0)». Como el paquete vive
 * en la hoja, el fallo seguía a esa persona a cualquier equipo mientras el resto
 * del equipo veía el módulo funcionando.
 */
describe("sanitizeConfig", () => {
  it("acota el máximo de columnas del comparador al rango usable", () => {
    expect(sanitizeConfig({ maxComparador: 0 }).maxComparador).toBe(2);
    expect(sanitizeConfig({ maxComparador: 1 }).maxComparador).toBe(2);
    expect(sanitizeConfig({ maxComparador: 99 }).maxComparador).toBe(10);
    expect(sanitizeConfig({ maxComparador: 6 }).maxComparador).toBe(6);
  });

  it("acepta números escritos como texto (la hoja los devuelve así)", () => {
    expect(sanitizeConfig({ maxComparador: "8" as unknown as number }).maxComparador).toBe(8);
    expect(sanitizeConfig({ autoRefreshSeconds: "45" as unknown as number }).autoRefreshSeconds).toBe(45);
  });

  it("descarta lo que no es número en lugar de propagar NaN", () => {
    expect("maxComparador" in sanitizeConfig({ maxComparador: "diez" as unknown as number })).toBe(false);
    expect("capApprovalThreshold" in sanitizeConfig({ capApprovalThreshold: null as unknown as number })).toBe(false);
  });

  it("nunca deja un refresco que martillee la hoja", () => {
    expect(sanitizeConfig({ autoRefreshSeconds: 1 }).autoRefreshSeconds).toBe(15);
    expect(sanitizeConfig({ autoRefreshSeconds: 999_999 }).autoRefreshSeconds).toBe(3600);
  });

  it("descarta valores fuera del catálogo de las opciones cerradas", () => {
    expect("rankPlacement" in sanitizeConfig({ rankPlacement: "banner" as never })).toBe(false);
    expect(sanitizeConfig({ rankPlacement: "fila" }).rankPlacement).toBe("fila");
    expect("dockPosition" in sanitizeConfig({ dockPosition: "arriba" as never })).toBe(false);
    expect(sanitizeConfig({ dockPosition: "left" }).dockPosition).toBe("left");
    expect("defaultPaper" in sanitizeConfig({ defaultPaper: "A4" as never })).toBe(false);
  });

  it("descarta interruptores que no son booleanos", () => {
    expect("sortByCapDesc" in sanitizeConfig({ sortByCapDesc: "sí" as never })).toBe(false);
    expect(sanitizeConfig({ sortByCapDesc: false }).sortByCapDesc).toBe(false);
    expect(sanitizeConfig({ rankingEnabled: true }).rankingEnabled).toBe(true);
  });

  it("descarta una biblioteca de correos que no sea una lista", () => {
    expect("emailTemplates" in sanitizeConfig({ emailTemplates: {} as never })).toBe(false);
    expect(sanitizeConfig({ emailTemplates: [] }).emailTemplates).toEqual([]);
  });

  it("no inventa claves que no venían en el retazo", () => {
    expect(Object.keys(sanitizeConfig({}))).toEqual([]);
    expect(Object.keys(sanitizeConfig({ reclutador: "Ana" }))).toEqual(["reclutador"]);
  });
});
