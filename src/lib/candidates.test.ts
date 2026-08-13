import { describe, expect, it } from "vitest";
import {
  asText,
  buildFullName,
  extractProceso,
  normaliseCandidate,
  normaliseCandidates,
} from "./candidates";
import type { RawCandidate } from "../types";

/**
 * Identidad de la ficha.
 *
 * Estas pruebas fijan el contrato que hacía fallar al Comparador: **dos filas de
 * la hoja nunca pueden acabar compartiendo `Candidate.id`**. Cuando lo hacían, la
 * segunda persona desaparecía del buscador (el buscador excluye lo ya
 * comparado, y para él ya estaba), «Editar» abría siempre a la primera y React
 * recibía dos hijos con la misma clave.
 */

const fila = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  identificador: "8456872-105-2026",
  nombres: "María",
  apellido_paterno: "Quispe",
  ...over,
});

describe("normaliseCandidates · claves únicas", () => {
  it("conserva el identificador como clave cuando no está repetido", () => {
    const { candidatos, duplicados } = normaliseCandidates([
      fila(),
      fila({ identificador: "9123456-105-2026", nombres: "Jorge" }),
    ]);
    expect(candidatos.map((c) => c.id)).toEqual([
      "8456872-105-2026",
      "9123456-105-2026",
    ]);
    expect(duplicados).toEqual([]);
    expect(candidatos.every((c) => c.identificadorDuplicado === undefined)).toBe(true);
  });

  it("desambigua las filas que comparten identificador", () => {
    const { candidatos, duplicados } = normaliseCandidates([
      fila(),
      fila({ nombres: "Rodrigo", apellido_paterno: "Ledezma" }),
      fila({ nombres: "Tercero" }),
    ]);
    expect(candidatos.map((c) => c.id)).toEqual([
      "8456872-105-2026",
      "8456872-105-2026#2",
      "8456872-105-2026#3",
    ]);
    // Cada persona sigue siendo ella misma.
    expect(candidatos[1].fullName).toBe("Rodrigo Ledezma");
    // Y las tres quedan marcadas para que la interfaz pida corregir la hoja.
    expect(candidatos.every((c) => c.identificadorDuplicado)).toBe(true);
    expect(duplicados).toEqual(["8456872-105-2026"]);
  });

  it("trata el identificador sin distinguir mayúsculas ni espacios sobrantes", () => {
    const { candidatos, duplicados } = normaliseCandidates([
      fila({ identificador: "AB-105-2026" }),
      fila({ identificador: "ab-105-2026", nombres: "Otro" }),
    ]);
    expect(new Set(candidatos.map((c) => c.id)).size).toBe(2);
    expect(duplicados).toEqual(["AB-105-2026"]);
  });

  it("da clave propia a cada fila sin identificador", () => {
    const { candidatos, duplicados } = normaliseCandidates([
      fila({ identificador: "" }),
      fila({ identificador: "   ", nombres: "Sin", apellido_paterno: "Clave" }),
    ]);
    expect(candidatos.map((c) => c.id)).toEqual(["sin-id-1", "sin-id-2"]);
    // Faltar no es duplicarse: no se pide corregir nada por esto.
    expect(duplicados).toEqual([]);
  });

  it("nunca produce dos claves iguales, ni con datos absurdos", () => {
    const filas: RawCandidate[] = [
      fila({ identificador: "X" }),
      fila({ identificador: "X" }),
      fila({ identificador: "X#2" }), // ya viene con la forma del sufijo
      fila({ identificador: "" }),
      fila({ identificador: "sin-id-5" }),
      fila({ identificador: "" }),
    ];
    const { candidatos } = normaliseCandidates(filas);
    expect(new Set(candidatos.map((c) => c.id)).size).toBe(filas.length);
  });

  it("sobrevive a una hoja vacía", () => {
    expect(normaliseCandidates([])).toEqual({ candidatos: [], duplicados: [] });
  });
});

describe("normalización defensiva de campos", () => {
  it("convierte a texto lo que la hoja manda como número", () => {
    const c = normaliseCandidate({ identificador: 12345, edad: 30 } as unknown as RawCandidate, 0);
    expect(c.identificador).toBe("12345");
    expect(c.id).toBe("12345");
  });

  it("no lanza con JSON roto en las columnas de listas", () => {
    const c = normaliseCandidate(
      {
        identificador: "1-1-2026",
        conocimientos_tecnicos: "{roto:",
        herramientas: "Excel, Word",
        competencias: "no-es-json",
      } as RawCandidate,
      0,
    );
    expect(c.conocimientosList).toEqual([{ nombre: "{roto:" }]);
    expect(c.herramientasList.map((h) => h.nombre)).toEqual(["Excel", "Word"]);
    expect(c.competenciasList).toEqual([]);
  });

  it("usa el nombre de respaldo cuando la fila no trae ninguno", () => {
    expect(buildFullName({} as RawCandidate)).toBe("Postulante Sin Nombre");
  });

  it("deriva el número de proceso del identificador", () => {
    expect(extractProceso("8456872-105-2026")).toBe("105");
    expect(extractProceso("singuiones")).toBe("Sin proceso");
    // El convenio es "CI - Nro Proceso - Año": el segundo tramo es el proceso.
    expect(extractProceso("8456872-105")).toBe("105");
    expect(extractProceso(undefined)).toBe("Sin proceso");
  });

  it("asText no lanza con valores nulos", () => {
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
    expect(asText(0)).toBe("0");
  });
});
