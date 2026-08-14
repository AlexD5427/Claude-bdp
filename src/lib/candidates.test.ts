import { describe, expect, it } from "vitest";
import {
  duplicatedIdentificadores,
  normaliseCandidate,
  normaliseCandidates,
} from "./candidates";
import type { RawCandidate } from "../types";

const row = (over: Partial<RawCandidate> = {}): RawCandidate => ({
  identificador: "1111111-100-2026",
  nombres: "Ana",
  apellido_paterno: "Pérez",
  apellido_materno: "López",
  ...over,
});

describe("identidad de un postulante", () => {
  it("usa el identificador como id cuando es único", () => {
    const [a] = normaliseCandidates([row()]);
    expect(a.id).toBe("1111111-100-2026");
    expect(a.duplicadoDe).toBeUndefined();
  });

  it("da un id propio a cada fila que repite el identificador", () => {
    // Dos analistas registran a la misma persona en el mismo proceso. Con el id
    // compartido, React avisaba de claves duplicadas, el buscador del comparador
    // escondía la segunda fila (imposible compararla) y editar al duplicado
    // editaba al original.
    const list = normaliseCandidates([
      row({ nombres: "Ana" }),
      row({ nombres: "Ana (bis)" }),
      row({ nombres: "Ana (tris)" }),
    ]);
    expect(list.map((c) => c.id)).toEqual([
      "1111111-100-2026",
      "1111111-100-2026#2",
      "1111111-100-2026#3",
    ]);
    expect(new Set(list.map((c) => c.id)).size).toBe(3);
  });

  it("marca las filas repetidas para poder avisar al analista", () => {
    const list = normaliseCandidates([row(), row({ nombres: "Otra" })]);
    expect(list[0].duplicadoDe).toBeUndefined();
    expect(list[1].duplicadoDe).toBe("1111111-100-2026");
    expect(duplicatedIdentificadores(list)).toEqual(["1111111-100-2026"]);
  });

  it("no denuncia duplicados cuando no los hay", () => {
    const list = normaliseCandidates([row(), row({ identificador: "2222222-100-2026" })]);
    expect(duplicatedIdentificadores(list)).toEqual([]);
  });

  it("da un id estable a las filas sin identificador, aunque se reordenen", () => {
    // El id de emergencia era `cand-<índice>`. Al registrar a alguien nuevo la
    // fila entra al principio, todos los índices se corren y cada `cand-N`
    // empieza a apuntar a otra persona: una comparación guardada pasaba a
    // mostrar expedientes ajenos.
    const sinId = row({ identificador: "", nombres: "Sin", apellido_paterno: "Identificador" });
    const otro = row({ identificador: "3333333-100-2026" });

    const antes = normaliseCandidates([sinId, otro]);
    const despues = normaliseCandidates([row({ identificador: "9999999-100-2026" }), sinId, otro]);

    const idAntes = antes.find((c) => c.fullName.startsWith("Sin"))!.id;
    const idDespues = despues.find((c) => c.fullName.startsWith("Sin"))!.id;
    expect(idAntes).toBe(idDespues);
    expect(idAntes).not.toMatch(/^cand-/);
  });

  it("cae en el índice sólo cuando la fila está completamente vacía", () => {
    const vacia = normaliseCandidate({ identificador: "" }, 7);
    expect(vacia.id).toBe("cand-7");
  });
});
