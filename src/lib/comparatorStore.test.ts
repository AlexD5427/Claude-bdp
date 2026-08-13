import { beforeEach, describe, expect, it } from "vitest";
import {
  addComparator,
  clearComparator,
  reconcileComparator,
  removeComparator,
  setSelectedIds,
} from "./comparatorStore";

/**
 * Sesión del Comparador.
 *
 * El fallo que motivó estas pruebas: la comparación se guarda por identificador
 * en `sessionStorage`, pero la hoja cambia por debajo (se corrige un
 * identificador, se borra una fila duplicada). Los identificadores huérfanos
 * seguían ocupando columna, así que el buscador aparecía apagado con «Límite
 * alcanzado (10/10)» sobre una comparativa vacía: indistinguible de «el
 * comparador no funciona», y sólo reproducible en la pestaña de esa persona.
 */
// El estado del store es privado; `sessionStorage` es su espejo exacto, así que
// las pruebas lo leen de ahí y evitan montar React sólo para observarlo.
function selected(): string[] {
  const raw = window.sessionStorage.getItem("bdp-comparador-session");
  return raw ? (JSON.parse(raw).selectedIds as string[]) : [];
}

beforeEach(() => {
  clearComparator();
});

describe("addComparator", () => {
  it("agrega en orden y no repite", () => {
    addComparator("a", 10);
    addComparator("b", 10);
    addComparator("a", 10);
    expect(selected()).toEqual(["a", "b"]);
  });

  it("respeta el tope de columnas", () => {
    addComparator("a", 2);
    addComparator("b", 2);
    addComparator("c", 2);
    expect(selected()).toEqual(["a", "b"]);
  });

  it("aplica el tope por omisión cuando el máximo no sirve", () => {
    // Un `maxComparador` corrupto (0, NaN) bloqueaba el módulo entero.
    addComparator("a", 0 as unknown as number);
    addComparator("b", Number.NaN);
    expect(selected()).toEqual(["a", "b"]);
  });

  it("ignora identificadores vacíos", () => {
    addComparator("", 10);
    expect(selected()).toEqual([]);
  });
});

describe("reconcileComparator", () => {
  it("descarta los identificadores que ya no existen", () => {
    setSelectedIds(["a", "borrado", "b"]);
    reconcileComparator(["a", "b", "c"]);
    expect(selected()).toEqual(["a", "b"]);
  });

  it("conserva el orden de las columnas que siguen vivas", () => {
    setSelectedIds(["c", "a", "b"]);
    reconcileComparator(["a", "b", "c"]);
    expect(selected()).toEqual(["c", "a", "b"]);
  });

  it("no toca la sesión cuando la base todavía no cargó", () => {
    setSelectedIds(["a", "b"]);
    reconcileComparator([]);
    expect(selected()).toEqual(["a", "b"]);
  });

  it("libera las columnas ocupadas por huérfanos para poder seguir comparando", () => {
    setSelectedIds(["x1", "x2"]);
    reconcileComparator(["a"]);
    addComparator("a", 2);
    expect(selected()).toEqual(["a"]);
  });
});

describe("removeComparator", () => {
  it("quita sólo al postulante indicado", () => {
    setSelectedIds(["a", "b", "c"]);
    removeComparator("b");
    expect(selected()).toEqual(["a", "c"]);
  });
});
