import { beforeEach, describe, expect, it } from "vitest";
import {
  COMPARATOR_SECTION_IDS,
  addComparator,
  clearComparator,
  getComparatorState,
  pruneMissing,
  setSelectedIds,
  showAllSections,
  toggleSectionVisible,
} from "./comparatorStore";

/**
 * El comparador guarda su sesión como una lista de identificadores. Estas
 * pruebas fijan el comportamiento que evita el bloqueo reproducido en
 * `qa/sondas.mjs limite-fantasma`: diez identificadores muertos dejaban el
 * buscador deshabilitado en «Límite alcanzado (10/10)» con la comparativa vacía.
 */

beforeEach(() => {
  clearComparator();
  showAllSections();
});

describe("pruneMissing", () => {
  it("no toca una comparación cuyos postulantes siguen existiendo", () => {
    setSelectedIds(["a", "b"]);
    expect(pruneMissing(["a", "b", "c"])).toBe(0);
    expect(getComparatorState().selectedIds).toEqual(["a", "b"]);
  });

  it("descarta los identificadores que ya no están en la base", () => {
    setSelectedIds(["a", "muerto", "b", "tambien-muerto"]);
    expect(pruneMissing(["a", "b"])).toBe(2);
    expect(getComparatorState().selectedIds).toEqual(["a", "b"]);
  });

  it("libera el límite cuando ninguno sobrevive", () => {
    setSelectedIds(Array.from({ length: 10 }, (_, i) => `borrado-${i}`));
    expect(pruneMissing(["vivo"])).toBe(10);
    expect(getComparatorState().selectedIds).toEqual([]);
    // El propósito de todo esto: volver a poder agregar.
    addComparator("vivo", 10);
    expect(getComparatorState().selectedIds).toEqual(["vivo"]);
  });

  it("es inerte con la comparación vacía (puede vivir dentro de un efecto)", () => {
    expect(pruneMissing(["a"])).toBe(0);
  });

  it("acepta un Set sin volver a construirlo", () => {
    setSelectedIds(["a", "z"]);
    expect(pruneMissing(new Set(["a"]))).toBe(1);
  });

  it("conserva el orden en que se agregaron los que sobreviven", () => {
    setSelectedIds(["c", "x", "a", "y", "b"]);
    pruneMissing(["a", "b", "c"]);
    expect(getComparatorState().selectedIds).toEqual(["c", "a", "b"]);
  });
});

describe("showAllSections", () => {
  it("vuelve a encender y despliega todas las secciones", () => {
    toggleSectionVisible("resultados", false);
    toggleSectionVisible("competencias", false);
    showAllSections();
    const { sectionVisible, sectionCollapsed } = getComparatorState();
    for (const id of COMPARATOR_SECTION_IDS) {
      expect(sectionVisible[id]).toBe(true);
      expect(sectionCollapsed[id]).toBe(false);
    }
  });
});

describe("addComparator", () => {
  it("no admite duplicados ni pasa del máximo", () => {
    addComparator("a", 2);
    addComparator("a", 2);
    addComparator("b", 2);
    addComparator("c", 2);
    expect(getComparatorState().selectedIds).toEqual(["a", "b"]);
  });
});
