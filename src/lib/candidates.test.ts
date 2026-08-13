import { describe, expect, it } from "vitest";
import {
  duplicatedIdentificadores,
  extractProceso,
  normaliseCandidate,
  normaliseCandidates,
} from "./candidates";
import type { RawCandidate } from "../types";

/**
 * Regresión de la normalización de la base.
 *
 * El fallo que motivó estas pruebas: el `id` de un postulante se tomaba tal cual
 * del identificador único de la hoja, que lo teclea una persona y por tanto se
 * repite. Dos registros distintos con la misma clave rompían React (claves
 * duplicadas), hacían desaparecer al segundo del buscador del comparador y
 * llevaban a abrir o editar a la persona equivocada.
 */

const row = (over: RawCandidate = {}): RawCandidate => ({
  identificador: "9001122-107-2026",
  nombres: "Carlos",
  apellido_paterno: "Terán",
  ...over,
});

describe("normaliseCandidates · unicidad del id", () => {
  it("da un id distinto a cada registro aunque compartan identificador", () => {
    const list = normaliseCandidates([
      row({ nombres: "Carlos" }),
      row({ nombres: "Rodrigo", apellido_paterno: "Salazar" }),
      row({ nombres: "Elena", apellido_paterno: "Vaca" }),
    ]);

    expect(new Set(list.map((c) => c.id)).size).toBe(3);
    // La primera aparición conserva la clave: las comparaciones ya guardadas en
    // la sesión siguen resolviéndose.
    expect(list[0].id).toBe("9001122-107-2026");
    expect(list[1].id).toBe("9001122-107-2026#2");
    expect(list[2].id).toBe("9001122-107-2026#3");
  });

  it("marca como duplicados sólo las apariciones posteriores", () => {
    const list = normaliseCandidates([row(), row({ nombres: "Rodrigo" })]);
    expect(list[0].duplicado).toBeUndefined();
    expect(list[1].duplicado).toBe(true);
  });

  it("conserva intacto el identificador original de la hoja", () => {
    const list = normaliseCandidates([row(), row({ nombres: "Rodrigo" })]);
    // Es la clave con la que el backend localiza la fila: no se puede tocar.
    expect(list[1].identificador).toBe("9001122-107-2026");
  });

  it("resuelve a un id distinto cada fila sin identificador", () => {
    const list = normaliseCandidates([
      row({ identificador: "" }),
      row({ identificador: "" }),
      row({ identificador: undefined }),
    ]);
    expect(new Set(list.map((c) => c.id)).size).toBe(3);
  });

  it("no altera una base sin repeticiones", () => {
    const list = normaliseCandidates([
      row({ identificador: "1-1-2026" }),
      row({ identificador: "2-1-2026" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["1-1-2026", "2-1-2026"]);
    expect(list.some((c) => c.duplicado)).toBe(false);
  });

  it("se comporta igual que normaliseCandidate para un solo registro", () => {
    const one = normaliseCandidates([row()])[0];
    const direct = normaliseCandidate(row(), 0);
    expect(one).toEqual(direct);
  });
});

describe("duplicatedIdentificadores", () => {
  it("lista las claves repetidas con su recuento", () => {
    const list = normaliseCandidates([
      row(),
      row({ nombres: "Rodrigo" }),
      row({ identificador: "5544332-108-2026", nombres: "Iván" }),
      row({ identificador: "5544332-108-2026", nombres: "Ana" }),
      row({ identificador: "5544332-108-2026", nombres: "Luz" }),
      row({ identificador: "7788990-110-2026", nombres: "Gabriela" }),
    ]);
    expect(duplicatedIdentificadores(list)).toEqual([
      { identificador: "5544332-108-2026", count: 3 },
      { identificador: "9001122-107-2026", count: 2 },
    ]);
  });

  it("ignora los identificadores vacíos y devuelve vacío si todo está limpio", () => {
    const list = normaliseCandidates([
      row({ identificador: "" }),
      row({ identificador: "" }),
      row({ identificador: "1-1-2026" }),
    ]);
    expect(duplicatedIdentificadores(list)).toEqual([]);
  });
});

describe("extractProceso", () => {
  it("saca el número de proceso del identificador", () => {
    expect(extractProceso("8456872-105-2026")).toBe("105");
  });
  it("agrupa lo que no sigue la convención", () => {
    expect(extractProceso("")).toBe("Sin proceso");
    expect(extractProceso("singuiones")).toBe("Sin proceso");
  });
});
