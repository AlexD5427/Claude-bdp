import { describe, expect, it } from "vitest";
import { normaliseCandidate } from "./candidates";
import {
  compareByMerit,
  orderForDisplay,
  rankByMerit,
  tiebreakIndex,
  tiebreakExplanation,
} from "./comparatorRanking";
import type { Candidate, RawCandidate } from "../types";

function candidate(partial: RawCandidate): Candidate {
  return normaliseCandidate(partial);
}

/** Los tres empatados en CAP 88 del caso real que motivó el cambio. */
const jorge = candidate({
  identificador: "7712004-163-2026",
  nombres: "Jorge",
  apellido_paterno: "Mamani",
  nota_cap: 88,
  nota_curriculum: 78,
  nota_conocimiento: 90,
  nota_competencias: 85,
});
const andrea = candidate({
  identificador: "6640912-163-2026",
  nombres: "Andrea",
  apellido_paterno: "Rojas",
  nota_cap: 88,
  nota_curriculum: 78,
  nota_conocimiento: 90,
  nota_competencias: 79,
});
const maria = candidate({
  identificador: "5033853-163-2026",
  nombres: "María",
  apellido_paterno: "Quispe",
  nota_cap: 88,
  nota_curriculum: 92,
  nota_conocimiento: 74,
  nota_competencias: 81,
});
const carlos = candidate({
  identificador: "9120487-163-2026",
  nombres: "Carlos",
  apellido_paterno: "Vaca",
  nota_cap: 94,
  nota_curriculum: 88,
  nota_conocimiento: 86,
  nota_competencias: 90,
});
const sinCap = candidate({
  identificador: "4488210-163-2026",
  nombres: "Lucía",
  apellido_paterno: "Terceros",
  nota_cap: "",
  nota_curriculum: 66,
  nota_competencias: 60,
});

const names = (list: Candidate[]) =>
  rankByMerit(list).map((r) => r.candidate.fullName);

describe("tiebreakIndex", () => {
  it("pondera 40/35/25 sobre las notas de respaldo", () => {
    // 0.40·90 + 0.35·85 + 0.25·78 = 85.25
    expect(tiebreakIndex(jorge)).toBe(85.25);
    expect(tiebreakIndex(andrea)).toBe(83.15);
    expect(tiebreakIndex(maria)).toBe(80.95);
  });

  it("renormaliza los pesos cuando falta una nota, sin inventar ceros", () => {
    // Sólo conocimientos (0.40) y competencias (0.35): (0.40·90 + 0.35·80)/0.75
    const parcial = candidate({
      nombres: "Parcial",
      nota_conocimiento: 90,
      nota_competencias: 80,
    });
    expect(tiebreakIndex(parcial)).toBe(85.33);
  });

  it("devuelve null cuando no hay ninguna nota de respaldo", () => {
    expect(tiebreakIndex(candidate({ nombres: "Vacío", nota_cap: 70 }))).toBeNull();
  });

  it("acepta decimales escritos con coma, como los escribe la hoja", () => {
    const conComa = candidate({
      nombres: "Coma",
      nota_conocimiento: "90,5",
      nota_competencias: "80,5",
      nota_curriculum: "70,5",
    });
    expect(tiebreakIndex(conComa)).toBe(82);
  });
});

describe("rankByMerit", () => {
  it("ordena por Nota CAP cuando no hay empate", () => {
    expect(names([maria, carlos])).toEqual([
      "Carlos Vaca",
      "María Quispe",
    ]);
  });

  it("resuelve el empate por índice ponderado y no por orden de llegada", () => {
    // Agregados en el peor orden posible: María primero.
    expect(names([maria, andrea, jorge])).toEqual([
      "Jorge Mamani",
      "Andrea Rojas",
      "María Quispe",
    ]);
  });

  it("es estable ante cualquier orden de inserción", () => {
    const esperado = ["Carlos Vaca", "Jorge Mamani", "Andrea Rojas", "María Quispe", "Lucía Terceros"];
    expect(names([maria, jorge, carlos, sinCap, andrea])).toEqual(esperado);
    expect(names([sinCap, andrea, carlos, maria, jorge])).toEqual(esperado);
    expect(names([jorge, maria, andrea, carlos, sinCap])).toEqual(esperado);
  });

  it("deja al final a quien no tiene Nota CAP", () => {
    const ranked = rankByMerit([sinCap, maria]);
    expect(ranked[1].candidate.fullName).toBe("Lucía Terceros");
    expect(ranked[1].cap).toBeNull();
  });

  it("marca el empate sólo en quienes lo tienen", () => {
    const ranked = rankByMerit([carlos, maria, jorge]);
    const tied = ranked.filter((r) => r.tied).map((r) => r.candidate.fullName);
    expect(tied).toEqual(["Jorge Mamani", "María Quispe"]);
  });

  it("cae al orden alfabético sólo cuando todo lo demás empata", () => {
    const a = candidate({ nombres: "Zulema", apellido_paterno: "Zapata", nota_cap: 80, nota_conocimiento: 80 });
    const b = candidate({ nombres: "Ana", apellido_paterno: "Alba", nota_cap: 80, nota_conocimiento: 80 });
    expect(names([a, b])).toEqual(["Ana Alba", "Zulema Zapata"]);
  });

  it("prefiere el expediente más completo antes que el alfabeto", () => {
    // Mismo CAP y mismo IDD (una sola nota, idéntica), pero uno tiene dos notas.
    const completo = candidate({
      nombres: "Zoe",
      apellido_paterno: "Zamora",
      nota_cap: 80,
      nota_conocimiento: 84,
      nota_competencias: 84,
    });
    const parcial = candidate({
      nombres: "Ana",
      apellido_paterno: "Alba",
      nota_cap: 80,
      nota_conocimiento: 84,
    });
    expect(names([parcial, completo])).toEqual(["Zoe Zamora", "Ana Alba"]);
  });

  it("no muta el arreglo recibido", () => {
    const list = [maria, carlos];
    rankByMerit(list);
    expect(list[0]).toBe(maria);
  });
});

describe("compareByMerit", () => {
  it("es antisimétrico", () => {
    expect(Math.sign(compareByMerit(jorge, maria))).toBe(
      -Math.sign(compareByMerit(maria, jorge)),
    );
  });
});

describe("orderForDisplay", () => {
  it("invierte las columnas sin alterar los puestos", () => {
    const ranked = rankByMerit([maria, carlos, jorge]);
    const asc = orderForDisplay(ranked, "asc");
    expect(asc.map((r) => r.rank)).toEqual([3, 2, 1]);
    expect(asc[asc.length - 1].candidate.fullName).toBe("Carlos Vaca");
  });

  it("deja el orden intacto en «desc»", () => {
    const ranked = rankByMerit([maria, carlos]);
    expect(orderForDisplay(ranked, "desc")).toBe(ranked);
  });
});

describe("tiebreakExplanation", () => {
  it("explica el desempate con los pesos aplicados", () => {
    const entry = rankByMerit([jorge, maria])[0];
    const texto = tiebreakExplanation(entry);
    expect(texto).toContain("Índice de Desempate 85.25");
    expect(texto).toContain("Nota Conocimientos 90% (40%)");
  });

  it("no dice nada cuando no hubo empate", () => {
    expect(tiebreakExplanation(rankByMerit([carlos, maria])[0])).toBe("");
  });
});
