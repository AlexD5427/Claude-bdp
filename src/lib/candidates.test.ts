import { describe, expect, it } from "vitest";
import { normaliseCandidate, normaliseCandidates } from "./candidates";
import type { RawCandidate } from "../types";

/**
 * Identidad de los postulantes.
 *
 * El `id` de un postulante es su identificador («CI - Proceso - Año»), pero la
 * hoja no impone que sea único: cargar dos veces la misma ficha deja dos filas
 * iguales. Con el `id` repetido la aplicación las trataba como una sola persona
 * y la segunda ficha era **inalcanzable** desde el comparador, el visor de
 * perfil y la edición. Aquí se fija el contrato.
 */
const row = (partial: RawCandidate): RawCandidate => partial;

describe("normaliseCandidates · unicidad del id", () => {
  it("deja intacto el identificador de la primera aparición", () => {
    const list = normaliseCandidates([
      row({ identificador: "5033853-163-2026", nombres: "Jorge" }),
      row({ identificador: "7841299-163-2026", nombres: "Andrea" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["5033853-163-2026", "7841299-163-2026"]);
  });

  it("desambigua las filas repetidas con un sufijo", () => {
    const list = normaliseCandidates([
      row({ identificador: "5033853-163-2026", nombres: "Jorge", nota_cap: 88 }),
      row({ identificador: "5033853-163-2026", nombres: "Jorge", nota_cap: 91 }),
      row({ identificador: "5033853-163-2026", nombres: "Jorge", nota_cap: 95 }),
    ]);
    expect(list.map((c) => c.id)).toEqual([
      "5033853-163-2026",
      "5033853-163-2026#2",
      "5033853-163-2026#3",
    ]);
    // Y cada ficha conserva sus propios datos.
    expect(list.map((c) => c.nota_cap)).toEqual([88, 91, 95]);
  });

  it("marca todas las fichas implicadas, incluida la primera", () => {
    // Quien ve la ficha es quien puede ir a la hoja a unificarlas, así que el
    // aviso tiene que aparecer en las dos.
    const list = normaliseCandidates([
      row({ identificador: "5033853-163-2026" }),
      row({ identificador: "7841299-163-2026" }),
      row({ identificador: "5033853-163-2026" }),
    ]);
    expect(list.map((c) => Boolean(c.duplicado))).toEqual([true, false, true]);
  });

  it("no altera el identificador que viaja al backend", () => {
    const list = normaliseCandidates([
      row({ identificador: "5033853-163-2026" }),
      row({ identificador: "5033853-163-2026" }),
    ]);
    expect(list[1].identificador).toBe("5033853-163-2026");
  });

  it("da un id de reserva a las filas sin identificador", () => {
    const list = normaliseCandidates([
      row({ identificador: "", nombres: "" }),
      row({ identificador: "", nombres: "" }),
    ]);
    expect(new Set(list.map((c) => c.id)).size).toBe(2);
    expect(list[0].fullName).toBe("Postulante Sin Nombre");
  });

  it("normaliza igual que la versión de una sola fila", () => {
    const raw = row({ identificador: " 9982004-170-2026 ", nombres: "Pedro", edad: 41 });
    expect(normaliseCandidates([raw])[0]).toEqual(normaliseCandidate(raw, 0));
  });
});

describe("normaliseCandidates · datos sucios de la hoja", () => {
  it("sobrevive a un JSON corrupto en las listas", () => {
    const [c] = normaliseCandidates([
      row({
        identificador: "1-1-2026",
        competencias: '[{"name":"Liderazgo","esperado":80,',
        conocimientos_tecnicos: "{malformado",
        herramientas: "[]",
      }),
    ]);
    expect(c.competenciasList).toEqual([]);
    expect(c.herramientasList).toEqual([]);
    // Un texto que no es JSON se lee como lista separada por comas.
    expect(c.conocimientosList).toEqual([{ nombre: "{malformado" }]);
  });

  it("convierte a texto los campos que llegan como número", () => {
    const [c] = normaliseCandidates([
      row({ identificador: 12345 as unknown as string, nombres: 42 as unknown as string }),
    ]);
    expect(c.identificador).toBe("12345");
    expect(c.id).toBe("12345");
    expect(typeof c.nombres).toBe("string");
  });
});
