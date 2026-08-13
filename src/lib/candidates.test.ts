import { describe, expect, it } from "vitest";
import { normaliseCandidate, normaliseCandidates } from "./candidates";
import type { RawCandidate } from "../types";

/**
 * Regresión: identificadores repetidos en la hoja.
 *
 * El identificador es la clave de negocio y a la vez el `id` con el que React
 * indexa las listas y el resto de la aplicación pide un expediente. La hoja no
 * impide repetirlo, así que la normalización tiene que dejar cada fila
 * direccionable **y** marcada, en lugar de producir dos objetos indistinguibles.
 */
describe("normaliseCandidates · identificadores repetidos", () => {
  const fila = (identificador: string, nombres: string): RawCandidate => ({
    identificador,
    nombres,
  });

  it("deja los identificadores únicos intactos", () => {
    const list = normaliseCandidates([fila("1-1-2026", "Ana"), fila("2-1-2026", "Beto")]);
    expect(list.map((c) => c.id)).toEqual(["1-1-2026", "2-1-2026"]);
    expect(list.every((c) => !c.identificadorDuplicado)).toBe(true);
  });

  it("da un id propio a cada repetición y las marca todas", () => {
    const list = normaliseCandidates([
      fila("8456872-105-2026", "Jorge Andrés"),
      fila("7123456-105-2026", "Andrea"),
      fila("8456872-105-2026", "Jorge A."),
      fila("8456872-105-2026", "J. Villarroel"),
    ]);

    expect(list.map((c) => c.id)).toEqual([
      "8456872-105-2026",
      "7123456-105-2026",
      "8456872-105-2026#2",
      "8456872-105-2026#3",
    ]);
    // Todas las implicadas quedan señaladas, también la que conserva la clave.
    expect(list.map((c) => Boolean(c.identificadorDuplicado))).toEqual([
      true,
      false,
      true,
      true,
    ]);
    // El identificador de negocio NO se toca: es lo que la hoja tiene escrito.
    expect(list[2].identificador).toBe("8456872-105-2026");
  });

  it("los ids son únicos, que es lo que React necesita como clave", () => {
    const list = normaliseCandidates([
      fila("A", "Uno"),
      fila("A", "Dos"),
      fila("A", "Tres"),
      {},
      {},
    ]);
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });

  it("las filas sin identificador siguen cayendo al índice", () => {
    const list = normaliseCandidates([{ nombres: "Sin id" }, { nombres: "Otra" }]);
    expect(list.map((c) => c.id)).toEqual(["cand-0", "cand-1"]);
  });

  it("normaliseCandidate sigue sirviendo para una fila suelta", () => {
    const c = normaliseCandidate({ identificador: " 9-9-2026 ", nombres: "Ana" }, 3);
    expect(c.id).toBe("9-9-2026");
    expect(c.fullName).toBe("Ana");
  });
});
