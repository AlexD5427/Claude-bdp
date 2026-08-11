/**
 * Pruebas del analizador de bancos de preguntas.
 *
 * El material de prueba es el FORMATO REAL con el que llegan las pruebas al
 * equipo —el mismo documento «PRUEBA AUDITOR PARA REV 1»—, porque cada uno de
 * estos casos corresponde a un fallo que la heurística anterior cometía sobre él:
 * enunciados partidos en dos renglones, opciones partidas, viñetas convertidas en
 * opciones, una línea con «?» abriendo una pregunta que no existe, y la clave de
 * respuestas ignorada.
 */

import { describe, expect, it } from "vitest";
import {
  analizarPreguntas,
  comoLineasDocumento,
  leerTablaRespuestas,
  limpiarTipografia,
} from "../imports/questionParser";
import { richToPlain } from "../domain/richText";
import type { LineaDocumento } from "../imports/docxTexto";

/** Las cuatro primeras preguntas del documento, tal como salen del PDF. */
const PRUEBA_AUDITOR = [
  "1. Según las NOGAI, el propósito principal de la auditoría interna es:",
  "A) Elaborar estados financieros.",
  "B) Detectar únicamente hechos de fraude.",
  "C) Evaluar y mejorar los procesos de control, gestión de riesgos y gobierno.",
  "D) Sustituir los controles operativos.",
  "2. De acuerdo con el Reglamento de Control Interno y Auditores Internos de la ASFI, la Unidad",
  "de Auditoría Interna debe depender:",
  "A) Del Gerente General.",
  "B) Del Gerente Financiero.",
  "C) Del Directorio a través del Comité de Auditoría",
  "D) Del Oficial de Cumplimiento.",
  "3. El Auditor Interno debe actuar bajo el principio de:",
  "A) Rentabilidad.",
  "B) Independencia y objetividad.",
  "C) Confidencialidad únicamente.",
  "D) Productividad.",
];

/** La pregunta 16, con su caso en viñetas y su remate en interrogación. */
const CASO_CON_VINETAS = [
  "16. Durante la auditoría de fideicomisos se observa lo siguiente:",
  "• Existen procedimientos documentados.",
  "• Los funcionarios conocen dichos procedimientos.",
  "• Los controles establecidos no dejan evidencia documental de su ejecución.",
  "• No existen revisiones posteriores para verificar que el control realmente fue aplicado.",
  "¿Cuál es la conclusión técnicamente más adecuada?",
  "A. El control interno es efectivo porque existen procedimientos.",
  "B. Existe un diseño adecuado del control; sin embargo, no es posible concluir sobre su",
  "efectividad operativa debido a la ausencia de evidencia de ejecución.",
  "C. No existe ningún control interno.",
  "D. El problema corresponde únicamente al Auditor Externo.",
];

function conFormato(
  lineas: { texto: string; subrayado?: boolean; resaltado?: boolean; lista?: "ul" | "ol" }[],
): LineaDocumento[] {
  return lineas.map((linea) => ({
    texto: linea.texto,
    tramos: [{ texto: linea.texto, subrayado: linea.subrayado, resaltado: linea.resaltado }],
    lista: linea.lista ?? null,
  }));
}

describe("analizarPreguntas · formato de las pruebas del equipo", () => {
  it("reconoce cada pregunta numerada con sus cuatro opciones", () => {
    const { secciones, informe } = analizarPreguntas(comoLineasDocumento(PRUEBA_AUDITOR));
    expect(secciones).toHaveLength(1);
    expect(secciones[0].preguntas).toHaveLength(3);
    expect(informe.map((i) => i.opciones.length)).toEqual([4, 4, 4]);
    expect(informe.every((i) => i.tipo === "opcion_unica")).toBe(true);
  });

  it("une el enunciado que el PDF partió en dos renglones", () => {
    const { secciones } = analizarPreguntas(comoLineasDocumento(PRUEBA_AUDITOR));
    const segunda = secciones[0].preguntas[1];
    expect(richToPlain(segunda.enunciado)).toBe(
      "De acuerdo con el Reglamento de Control Interno y Auditores Internos de la ASFI, la Unidad de Auditoría Interna debe depender:",
    );
  });

  it("no convierte la segunda mitad del enunciado en una pregunta ni en un párrafo suelto", () => {
    const { secciones } = analizarPreguntas(comoLineasDocumento(PRUEBA_AUDITOR));
    const enunciados = secciones[0].preguntas.map((p) => richToPlain(p.enunciado));
    expect(enunciados.some((texto) => texto.startsWith("de Auditoría Interna"))).toBe(false);
  });

  it("deja las viñetas del caso dentro del enunciado, no como opciones", () => {
    const { secciones, informe } = analizarPreguntas(comoLineasDocumento(CASO_CON_VINETAS));
    expect(secciones[0].preguntas).toHaveLength(1);
    expect(informe[0].opciones).toHaveLength(4);
    const enunciado = richToPlain(secciones[0].preguntas[0].enunciado);
    expect(enunciado).toContain("Existen procedimientos documentados");
    expect(enunciado).toContain("¿Cuál es la conclusión técnicamente más adecuada?");
  });

  it("una línea que acaba en «?» dentro de una pregunta sin opciones no abre otra pregunta", () => {
    const { informe } = analizarPreguntas(comoLineasDocumento(CASO_CON_VINETAS));
    expect(informe).toHaveLength(1);
  });

  it("recompone la opción que el PDF partió en dos renglones", () => {
    const { secciones } = analizarPreguntas(comoLineasDocumento(CASO_CON_VINETAS));
    const opciones = secciones[0].preguntas[0].opciones.map((o) => richToPlain(o.texto));
    expect(opciones[1]).toBe(
      "Existe un diseño adecuado del control; sin embargo, no es posible concluir sobre su efectividad operativa debido a la ausencia de evidencia de ejecución.",
    );
  });

  it("acepta las opciones con punto («A.») igual que con paréntesis", () => {
    const { informe } = analizarPreguntas(comoLineasDocumento(CASO_CON_VINETAS));
    expect(informe[0].opciones[0]).toBe("El control interno es efectivo porque existen procedimientos.");
  });

  it("no abre una pregunta con una enumeración interna que no avanza la numeración", () => {
    const { informe } = analizarPreguntas(
      comoLineasDocumento([
        "17. El auditor detecta que durante tres meses no se remitieron los reportes. Se verificó que:",
        "1. No fueron remitidos en febrero de 2026.",
        "2. Tampoco en marzo de 2026.",
        "A) Incumplimiento sin causa identificada.",
        "B) Ausencia de un control de seguimiento.",
      ]),
    );
    expect(informe).toHaveLength(1);
    expect(informe[0].enunciado).toContain("No fueron remitidos en febrero de 2026");
  });

  it("reinicia la numeración en cada sección", () => {
    const { secciones } = analizarPreguntas(
      comoLineasDocumento([
        "Sección: Auditoría interna",
        "1. ¿Primera de la sección uno?",
        "A) Sí",
        "B) No",
        "Sección: Fideicomisos",
        "1. ¿Primera de la sección dos?",
        "A) Sí",
        "B) No",
      ]),
    );
    expect(secciones.map((s) => s.titulo)).toEqual(["Auditoría interna", "Fideicomisos"]);
    expect(secciones.every((s) => s.preguntas.length === 1)).toBe(true);
  });

  it("parte en dos una tanda de opciones que vuelve a empezar en «A)»", () => {
    const { informe } = analizarPreguntas(
      comoLineasDocumento([
        "1. ¿Primera?",
        "A) Uno",
        "B) Dos",
        "A) Tres",
        "B) Cuatro",
      ]),
    );
    expect(informe).toHaveLength(2);
    expect(informe[1].avisos.join(" ")).toContain("falta el enunciado");
  });
});

describe("analizarPreguntas · de dónde sale la respuesta correcta", () => {
  it("del subrayado del documento de Word", () => {
    const { informe } = analizarPreguntas(
      conFormato([
        { texto: "1. ¿Cuál es el principio del auditor interno?" },
        { texto: "A) Rentabilidad." },
        { texto: "B) Independencia y objetividad.", subrayado: true },
        { texto: "C) Productividad." },
      ]),
    );
    expect(informe[0].correcta).toBe(1);
    expect(informe[0].origenClave).toBe("formato");
  });

  it("del resaltado amarillo", () => {
    const { informe } = analizarPreguntas(
      conFormato([
        { texto: "1. ¿Quién administra los bienes del fideicomiso?" },
        { texto: "A) El fideicomisario." },
        { texto: "B) El fiduciario.", resaltado: true },
      ]),
    );
    expect(informe[0].correcta).toBe(1);
    expect(informe[0].origenClave).toBe("formato");
  });

  it("de un marcador escrito a mano, y el marcador no llega al candidato", () => {
    const { secciones, informe } = analizarPreguntas(
      comoLineasDocumento([
        "1. ¿Cuál es el principio?",
        "A) Rentabilidad.",
        "B) Independencia y objetividad. *",
        "C) Productividad.",
      ]),
    );
    expect(informe[0].correcta).toBe(1);
    expect(informe[0].origenClave).toBe("marcador");
    expect(richToPlain(secciones[0].preguntas[0].opciones[1].texto)).toBe("Independencia y objetividad.");
  });

  it("de la tabla de respuestas del final", () => {
    const { informe } = analizarPreguntas(
      comoLineasDocumento([
        "1. ¿Primera?",
        "A) Uno",
        "B) Dos",
        "C) Tres",
        "2. ¿Segunda?",
        "A) Uno",
        "B) Dos",
        "Respuestas",
        "1-C, 2-B",
      ]),
    );
    expect(informe.map((i) => i.correcta)).toEqual([2, 1]);
    expect(informe.every((i) => i.origenClave === "tabla")).toBe(true);
  });

  it("cuando el documento no la marca, lo dice en lugar de inventarla", () => {
    const { informe, sinClave, avisos } = analizarPreguntas(comoLineasDocumento(PRUEBA_AUDITOR));
    expect(sinClave).toBe(3);
    expect(informe.every((i) => i.correcta === -1 && i.origenClave === "ninguna")).toBe(true);
    expect(avisos.join(" ")).toContain("sin respuesta correcta");
  });

  it("avisa cuando hay más de una opción subrayada", () => {
    const { informe } = analizarPreguntas(
      conFormato([
        { texto: "1. ¿Cuáles corresponden a la auditoría interna?" },
        { texto: "A) Evaluar controles.", subrayado: true },
        { texto: "B) Aprobar créditos." },
        { texto: "C) Emitir informes.", subrayado: true },
      ]),
    );
    expect(informe[0].avisos.join(" ")).toContain("subrayadas o resaltadas");
  });

  it("no arrastra el subrayado de la correcta al texto que ve el candidato", () => {
    const { secciones } = analizarPreguntas(
      conFormato([
        { texto: "1. ¿Cuál es el principio?" },
        { texto: "A) Rentabilidad." },
        { texto: "B) Independencia.", subrayado: true },
      ]),
    );
    const marcas = secciones[0].preguntas[0].opciones[1].texto.b[0].s[0].m ?? [];
    expect(marcas).not.toContain("u");
  });
});

describe("analizarPreguntas · tipos y puntaje", () => {
  it("una pregunta sin opciones queda abierta y con revisión manual", () => {
    const { secciones, informe } = analizarPreguntas(
      comoLineasDocumento(["1. Explique con sus palabras el rol del fiduciario."]),
    );
    expect(informe[0].tipo).toBe("texto_largo");
    expect(secciones[0].preguntas[0].modoPuntaje).toBe("manual");
  });

  it("reconoce verdadero/falso por el contenido de las opciones", () => {
    const { informe } = analizarPreguntas(
      comoLineasDocumento(["1. El fiduciario administra el fideicomiso.", "A) Verdadero", "B) Falso"]),
    );
    expect(informe[0].tipo).toBe("verdadero_falso");
  });

  it("toma el puntaje anotado y lo saca del enunciado", () => {
    const { secciones } = analizarPreguntas(
      comoLineasDocumento(["1. Explique el rol del fiduciario. (5 puntos)"]),
    );
    expect(secciones[0].preguntas[0].puntos).toBe(5);
    expect(richToPlain(secciones[0].preguntas[0].enunciado)).toBe("Explique el rol del fiduciario.");
  });

  it("convierte las viñetas en opciones cuando la pregunta no declara letras", () => {
    const { informe } = analizarPreguntas(
      comoLineasDocumento([
        "1. ¿Cuál de los siguientes NO es un componente del control interno?",
        "- Ambiente de control",
        "- Evaluación de riesgos",
        "- Maximización de utilidades",
      ]),
    );
    expect(informe[0].opciones).toHaveLength(3);
    expect(informe[0].avisos.join(" ")).toContain("viñetas");
  });
});

describe("utilidades", () => {
  it("leerTablaRespuestas admite las formas que la gente escribe", () => {
    const mapa = leerTablaRespuestas(["1-C  2. B  3) a", "4: D"]);
    expect([...mapa.entries()]).toEqual([
      [1, "C"],
      [2, "B"],
      [3, "A"],
      [4, "D"],
    ]);
  });

  it("limpiarTipografia deshace las ligaduras que dejan los PDF", () => {
    expect(limpiarTipografia("estados \ufb01nancieros y o\ufb01cial")).toBe("estados financieros y oficial");
  });
});
