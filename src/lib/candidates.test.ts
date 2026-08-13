import { describe, expect, it } from "vitest";
import {
  buildFullName,
  extractProceso,
  normaliseCandidate,
  normaliseCandidates,
} from "./candidates";
import type { RawCandidate } from "../types";

/**
 * Regresión de la identidad de un postulante.
 *
 * Todo el sistema direcciona a una persona por `Candidate.id`: el comparador
 * guarda esos ids en la sesión, «Ver perfil» y «Editar» los resuelven contra la
 * base y React los usa como clave de lista. Cuando ese id no era único —porque
 * la hoja la llenan personas y a veces repiten un identificador o lo dejan
 * vacío— el sistema fallaba en silencio y de tres maneras distintas:
 *
 *   1. La segunda persona con la clave repetida **desaparecía del buscador** del
 *      comparador (el filtro de «ya seleccionados» la daba por elegida).
 *   2. «Editar» abría siempre la primera coincidencia, así que se sobrescribía
 *      a la persona equivocada.
 *   3. React recibía dos hijos con la misma clave.
 *
 * Y con los identificadores vacíos, el id era posicional (`cand-3`), de modo que
 * insertar una fila más arriba en la hoja movía la comparación a otra persona.
 */
describe("normaliseCandidates · identidad", () => {
  const filas: RawCandidate[] = [
    { identificador: "5555555-106-2026", nombres: "Duplicado", apellido_paterno: "Uno" },
    { identificador: "5555555-106-2026", nombres: "Duplicado", apellido_paterno: "Dos" },
    { identificador: "8456872-105-2026", nombres: "Jorge", apellido_paterno: "Mamani" },
  ];

  it("da un id distinto a cada fila aunque el identificador se repita", () => {
    const [uno, dos, jorge] = normaliseCandidates(filas);
    expect(uno.id).not.toBe(dos.id);
    expect(uno.id).toBe("5555555-106-2026");
    expect(dos.id).toBe("5555555-106-2026#2");
    expect(jorge.id).toBe("8456872-105-2026");
    expect(new Set(normaliseCandidates(filas).map((c) => c.id)).size).toBe(3);
  });

  it("conserva intacto el identificador de negocio (es lo que viaja al backend)", () => {
    const [uno, dos] = normaliseCandidates(filas);
    expect(uno.identificador).toBe("5555555-106-2026");
    expect(dos.identificador).toBe("5555555-106-2026");
  });

  it("marca las filas cuya clave está repetida y no las demás", () => {
    const [uno, dos, jorge] = normaliseCandidates(filas);
    expect(uno.identificadorDuplicado).toBe(true);
    expect(dos.identificadorDuplicado).toBe(true);
    expect(jorge.identificadorDuplicado).toBe(false);
  });

  it("resuelve cada id a la fila correcta (el fallo de «Editar»)", () => {
    const lista = normaliseCandidates(filas);
    const segundo = lista.find((c) => c.id === "5555555-106-2026#2");
    expect(segundo?.fullName).toBe("Duplicado Dos");
  });

  it("mantiene el id de una fila sin identificador aunque cambie de posición", () => {
    const sinId: RawCandidate = { identificador: "", nombres: "Ana", apellido_paterno: "Pérez" };
    const antes = normaliseCandidates([sinId, ...filas]);
    const despues = normaliseCandidates([...filas, sinId]);
    const idAntes = antes.find((c) => c.fullName === "Ana Pérez")!.id;
    const idDespues = despues.find((c) => c.fullName === "Ana Pérez")!.id;
    expect(idAntes).toBe(idDespues);
    expect(idAntes.startsWith("sin-id-")).toBe(true);
  });

  it("nunca devuelve un id vacío", () => {
    const lista = normaliseCandidates([{}, { identificador: "   " }]);
    expect(lista.every((c) => c.id.trim() !== "")).toBe(true);
    expect(new Set(lista.map((c) => c.id)).size).toBe(2);
  });

  it("tolera una entrada que no es una lista", () => {
    expect(normaliseCandidates(undefined as unknown as RawCandidate[])).toEqual([]);
  });
});

describe("normaliseCandidate · normalización defensiva", () => {
  it("convierte a texto los campos que la interfaz lee con métodos de cadena", () => {
    const c = normaliseCandidate({ identificador: 8456872, observaciones: 12 } as unknown as RawCandidate);
    expect(c.identificador).toBe("8456872");
    expect(c.observaciones).toBe("12");
  });

  it("no rompe con listas mal formadas", () => {
    const c = normaliseCandidate({
      identificador: "1-1-2026",
      conocimientos_tecnicos: "no es json",
      competencias: "{no-json}",
      herramientas: undefined,
    });
    expect(c.conocimientosList).toEqual([{ nombre: "no es json" }]);
    expect(c.competenciasList).toEqual([]);
    expect(c.herramientasList).toEqual([]);
  });

  it("usa el nombre de respaldo cuando no hay ninguno", () => {
    expect(buildFullName({})).toBe("Postulante Sin Nombre");
  });

  it("deriva el número de proceso del identificador", () => {
    expect(extractProceso("8456872-105-2026")).toBe("105");
    expect(extractProceso("sin-formato")).toBe("formato");
    expect(extractProceso("")).toBe("Sin proceso");
  });
});
