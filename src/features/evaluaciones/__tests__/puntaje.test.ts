/**
 * Pruebas del reparto de puntaje.
 *
 * Lo que se comprueba, sobre todo, es que la SUMA sea exacta. Un reparto que da
 * 99,99 rompe el criterio de aprobación en puntos y hace que un candidato con
 * todo correcto aparezca como no aprobado: es el tipo de fallo que nadie busca
 * porque parece imposible.
 */

import { describe, expect, it } from "vitest";
import {
  conObjetivoPuntaje,
  describirReparto,
  objetivoPuntaje,
  preguntasConPuntaje,
  puntosDeclarados,
  repartirPuntaje,
  repartirSiCorresponde,
  PUNTAJE_TOTAL_POR_OMISION,
} from "../domain/puntaje";
import { nuevaPregunta, nuevaSeccion } from "../domain/factory";
import type { Seccion } from "../domain/model";

function conPreguntas(cuantas: number, tipo = "opcion_unica", peso = 1): Seccion {
  const seccion = { ...nuevaSeccion(0), peso };
  seccion.preguntas = Array.from({ length: cuantas }, (_, i) => nuevaPregunta(tipo, seccion.id, i));
  return seccion;
}

describe("objetivoPuntaje", () => {
  it("una evaluación sin preferencia declarada reparte 100 puntos", () => {
    expect(objetivoPuntaje({ extras: {} })).toBe(PUNTAJE_TOTAL_POR_OMISION);
  });

  it("un null explícito significa reparto manual", () => {
    expect(objetivoPuntaje({ extras: conObjetivoPuntaje({}, null) })).toBeNull();
  });

  it("conserva el total que el autor eligió", () => {
    expect(objetivoPuntaje({ extras: conObjetivoPuntaje({}, 60) })).toBe(60);
  });

  it("descarta un valor imposible en lugar de repartir basura", () => {
    expect(objetivoPuntaje({ extras: { puntajeTotalObjetivo: -5 } })).toBeNull();
    expect(objetivoPuntaje({ extras: { puntajeTotalObjetivo: "muchos" } })).toBeNull();
  });
});

describe("repartirPuntaje", () => {
  it("reparte 100 entre 20 preguntas dando 5 a cada una", () => {
    const secciones = repartirPuntaje([conPreguntas(20)], 100);
    expect(secciones[0].preguntas.every((p) => p.puntos === 5)).toBe(true);
    expect(puntosDeclarados(secciones)).toBe(100);
  });

  it("con 3 preguntas la suma sigue siendo exactamente 100", () => {
    const secciones = repartirPuntaje([conPreguntas(3)], 100);
    const puntos = secciones[0].preguntas.map((p) => p.puntos);
    expect(puntos).toEqual([33.34, 33.33, 33.33]);
    expect(puntosDeclarados(secciones)).toBe(100);
  });

  it("con 7 preguntas también, aunque 100/7 sea periódico", () => {
    const secciones = repartirPuntaje([conPreguntas(7)], 100);
    expect(puntosDeclarados(secciones)).toBe(100);
  });

  it("con 3, 6, 7, 9, 11 y 13 preguntas la suma nunca se desvía", () => {
    for (const cuantas of [3, 6, 7, 9, 11, 13, 17, 23, 40]) {
      expect(puntosDeclarados(repartirPuntaje([conPreguntas(cuantas)], 100))).toBe(100);
    }
  });

  it("el peso de una sección multiplica la parte de sus preguntas", () => {
    const normal = conPreguntas(2, "opcion_unica", 1);
    const doble = { ...conPreguntas(2, "opcion_unica", 2), id: "sc_doble" };
    const secciones = repartirPuntaje([normal, doble], 90);
    expect(secciones[0].preguntas.map((p) => p.puntos)).toEqual([15, 15]);
    expect(secciones[1].preguntas.map((p) => p.puntos)).toEqual([30, 30]);
    expect(puntosDeclarados(secciones)).toBe(90);
  });

  it("los bloques de contenido no entran en el reparto", () => {
    const seccion = conPreguntas(2);
    seccion.preguntas.push(nuevaPregunta("contenido_titulo", seccion.id, 2));
    const repartidas = repartirPuntaje([seccion], 100);
    expect(preguntasConPuntaje(repartidas)).toBe(2);
    expect(repartidas[0].preguntas.map((p) => p.puntos)).toEqual([50, 50, 0]);
  });

  it("una pregunta sin puntaje queda fuera y no roba parte", () => {
    const seccion = conPreguntas(3);
    seccion.preguntas[2] = { ...seccion.preguntas[2], modoPuntaje: "ninguno" };
    const repartidas = repartirPuntaje([seccion], 100);
    expect(repartidas[0].preguntas.map((p) => p.puntos)).toEqual([50, 50, 1]);
    expect(puntosDeclarados(repartidas)).toBe(100);
  });

  it("sin preguntas que puntúen devuelve las secciones sin tocar", () => {
    const seccion = nuevaSeccion(0);
    expect(repartirPuntaje([seccion], 100)).toEqual([seccion]);
  });
});

describe("repartirSiCorresponde", () => {
  it("no toca nada cuando el reparto es manual", () => {
    const secciones = [conPreguntas(3)];
    const resultado = repartirSiCorresponde({ extras: conObjetivoPuntaje({}, null) }, secciones);
    expect(resultado).toBe(secciones);
  });

  it("reparte cuando hay objetivo declarado", () => {
    const resultado = repartirSiCorresponde({ extras: {} }, [conPreguntas(4)]);
    expect(resultado[0].preguntas.map((p) => p.puntos)).toEqual([25, 25, 25, 25]);
  });
});

describe("describirReparto", () => {
  it("explica el reparto en una frase", () => {
    expect(describirReparto([conPreguntas(20)], 100)).toContain("5 cada una");
  });

  it("y dice qué pasa cuando aún no hay preguntas", () => {
    expect(describirReparto([nuevaSeccion(0)], 100)).toContain("al agregar la primera pregunta");
  });
});
