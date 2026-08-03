import { describe, it, expect } from "vitest";
import { loadInstalledBackend } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Texto enriquecido: saneamiento, portabilidad y persistencia.
 *
 * El módulo anterior guardaba texto plano y perdía todo formato. El modelo nuevo
 * está documentado en `docs/evaluaciones/TEXTO_ENRIQUECIDO.md` y estas pruebas
 * fijan sus tres garantías: nada peligroso sobrevive, el espejo en texto plano
 * siempre existe, y el formato aguanta la ida y vuelta por la hoja de cálculo.
 */

describe("backend · texto enriquecido", () => {
  it("un documento válido conserva bloques, fragmentos y marcas", () => {
    const h = loadInstalledBackend();
    const doc = h.call("evRichSanitize_", {
      v: 1,
      b: [
        { t: "h2", s: [{ x: "Instrucciones" }] },
        {
          t: "p",
          s: [
            { x: "Lee con " },
            { x: "mucha", m: ["b", "i"] },
            { x: " atención." },
          ],
        },
        { t: "ul", s: [{ x: "No uses calculadora" }] },
        { t: "ol", s: [{ x: "Primero lee el caso" }] },
        { t: "code", s: [{ x: "SELECT * FROM cartera" }] },
      ],
    });
    expect(doc.v).toBe(1);
    expect(doc.b).toHaveLength(5);
    expect(doc.b[0].t).toBe("h2");
    expect(doc.b[1].s[1].m).toEqual(["b", "i"]);
    expect(doc.b[4].t).toBe("code");
  });

  it("los tipos de bloque y las marcas desconocidas se degradan sin perder el texto", () => {
    const h = loadInstalledBackend();
    const doc = h.call("evRichSanitize_", {
      v: 1,
      b: [
        { t: "marquee", s: [{ x: "Texto", m: ["blink", "b"] }] },
      ],
    });
    expect(doc.b[0].t).toBe("p");
    expect(doc.b[0].s[0].m).toEqual(["b"]);
    expect(doc.b[0].s[0].x).toBe("Texto");
  });

  it("solo sobreviven los enlaces http, https y mailto", () => {
    const h = loadInstalledBackend();
    const doc = h.call("evRichSanitize_", {
      v: 1,
      b: [
        {
          t: "p",
          s: [
            { x: "seguro", l: "https://banco.example/norma" },
            { x: "correo", l: "mailto:rrhh@banco.example" },
            { x: "script", l: "javascript:alert(1)" },
            { x: "datos", l: "data:text/html;base64,PHNjcmlwdD4=" },
            { x: "relativo", l: "/admin" },
          ],
        },
      ],
    });
    const spans = doc.b[0].s;
    expect(spans[0].l).toBe("https://banco.example/norma");
    expect(spans[1].l).toBe("mailto:rrhh@banco.example");
    expect(spans[2].l).toBeUndefined();
    expect(spans[3].l).toBeUndefined();
    expect(spans[4].l).toBeUndefined();
    // El texto no se pierde: solo desaparece el enlace.
    expect(spans[2].x).toBe("script");
  });

  it("una cadena suelta se interpreta como texto plano con un bloque por línea", () => {
    const h = loadInstalledBackend();
    const doc = h.call("evRichSanitize_", "Primera línea\nSegunda línea");
    expect(doc.b).toHaveLength(2);
    expect(doc.b[0].s[0].x).toBe("Primera línea");
    expect(doc.b[1].s[0].x).toBe("Segunda línea");
  });

  it("la proyección a texto plano marca las listas para que el libro sea legible", () => {
    const h = loadInstalledBackend();
    const plano = h.call("evRichToPlain_", {
      v: 1,
      b: [
        { t: "p", s: [{ x: "Requisitos:" }] },
        { t: "ul", s: [{ x: "Cédula vigente" }] },
        { t: "ol", s: [{ x: "Lee" }] },
        { t: "ol", s: [{ x: "Responde" }] },
      ],
    });
    expect(plano).toBe("Requisitos:\n• Cédula vigente\n1. Lee\n2. Responde");
  });

  it("los caracteres de control se eliminan y el tamaño total se acota", () => {
    const h = loadInstalledBackend();
    const doc = h.call("evRichSanitize_", {
      v: 1,
      b: [{ t: "p", s: [{ x: `Con\u0000control\u0007aquí` }] }],
    });
    expect(doc.b[0].s[0].x).toBe("Concontrolaquí");

    const enorme = h.call("evRichSanitize_", {
      v: 1,
      b: Array.from({ length: 200 }, () => ({ t: "p", s: [{ x: "x".repeat(3000) }] })),
    });
    const total = h.call("evRichToPlain_", enorme).length;
    expect(enorme.b.length).toBeLessThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(21000);
  });

  it("el formato sobrevive la ida y vuelta por la hoja de cálculo", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Con formato" });
    const enunciado = {
      v: 1,
      b: [
        { t: "h3", s: [{ x: "Caso práctico" }] },
        {
          t: "p",
          s: [
            { x: "El cliente presenta " },
            { x: "mora de 45 días", m: ["b"] },
            { x: " y una " },
            { x: "garantía hipotecaria", m: ["i", "u"] },
            { x: ". Consulta la ", m: [] },
            { x: "norma vigente", m: ["b"], l: "https://banco.example/norma" },
            { x: "." },
          ],
        },
        { t: "quote", s: [{ x: "«El riesgo se mide, no se intuye.»", m: ["i"] }] },
      ],
    };
    const guardada = h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Con formato", instrucciones: enunciado },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_formato",
              tipo: "opcion_unica",
              enunciado,
              modoPuntaje: "exacto",
              puntos: 1,
              opciones: [
                { id: "op_si", texto: { v: 1, b: [{ t: "p", s: [{ x: "Aprobar", m: ["b"] }] }] }, valor: "si", correcta: true },
                { id: "op_no", texto: { v: 1, b: [{ t: "p", s: [{ x: "Rechazar" }] }] }, valor: "no" },
              ],
            },
          ],
        },
      ],
    });
    expect(guardada.ok, JSON.stringify(guardada.error)).toBe(true);

    const pregunta = guardada.datos.secciones[0].preguntas[0];
    expect(pregunta.enunciado.b).toHaveLength(3);
    expect(pregunta.enunciado.b[1].s[1].m).toEqual(["b"]);
    expect(pregunta.enunciado.b[1].s[3].m).toEqual(["i", "u"]);
    expect(pregunta.enunciado.b[1].s[5].l).toBe("https://banco.example/norma");
    expect(pregunta.opciones[0].texto.b[0].s[0].m).toEqual(["b"]);
    expect(guardada.datos.evaluacion.instrucciones.b[0].t).toBe("h3");

    // El espejo en texto plano existe en la hoja, para búsqueda y auditoría.
    const filaPregunta = h.rowsOf("Preguntas")[0];
    expect(String(filaPregunta.enunciado_texto)).toContain("mora de 45 días");
    expect(String(filaPregunta.enunciado_json)).toContain('"m":["b"]');
  });

  it("el formato llega íntegro al candidato y sin enlaces peligrosos", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Formato público" });
    h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Formato público", aplicacion: { duracionMinutos: 10, puntajeAprobacion: 50 } },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_publica",
              tipo: "opcion_unica",
              enunciado: {
                v: 1,
                b: [
                  {
                    t: "p",
                    s: [
                      { x: "Importante: ", m: ["b"] },
                      { x: "lee la norma", l: "javascript:void(0)" },
                    ],
                  },
                ],
              },
              modoPuntaje: "exacto",
              puntos: 1,
              opciones: [
                { id: "op_a", texto: { v: 1, b: [{ t: "p", s: [{ x: "Sí" }] }] }, valor: "a", correcta: true },
                { id: "op_b", texto: { v: 1, b: [{ t: "p", s: [{ x: "No" }] }] }, valor: "b" },
              ],
            },
          ],
        },
      ],
    });
    h.admin("publishEvaluation", { id: creada.datos.evaluacion.id });
    const inicio = h.publico("startAttempt", {
      codigo: creada.datos.evaluacion.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    const enunciado = inicio.datos.prueba.secciones[0].preguntas[0].enunciado;
    expect(enunciado.b[0].s[0].m).toEqual(["b"]);
    expect(enunciado.b[0].s[1].l).toBeUndefined();
    expect(JSON.stringify(inicio.datos.prueba)).not.toContain("javascript:");
  });

  it("un documento vacío se reconoce como vacío en todas sus formas", () => {
    const h = loadInstalledBackend();
    for (const entrada of [null, undefined, "", { v: 1, b: [] }, { v: 1, b: [{ t: "p", s: [] }] }]) {
      expect(h.call("evRichIsEmpty_", entrada), JSON.stringify(entrada)).toBe(true);
    }
    expect(h.call("evRichIsEmpty_", { v: 1, b: [{ t: "p", s: [{ x: "algo" }] }] })).toBe(false);
  });

  it("publicar exige enunciado real: un documento vacío se detecta", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Enunciado vacío" });
    h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Enunciado vacío", aplicacion: { duracionMinutos: 10 } },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_vacia",
              tipo: "opcion_unica",
              enunciado: { v: 1, b: [] },
              modoPuntaje: "exacto",
              puntos: 1,
              opciones: [
                { id: "op_a", texto: { v: 1, b: [{ t: "p", s: [{ x: "Sí" }] }] }, valor: "a", correcta: true },
                { id: "op_b", texto: { v: 1, b: [{ t: "p", s: [{ x: "No" }] }] }, valor: "b" },
              ],
            },
          ],
        },
      ],
    });
    const res = h.admin("publishEvaluation", { id: creada.datos.evaluacion.id });
    expect(res.ok).toBe(false);
    const codigos = res.error.detalle.issues.map((i: { code: string }) => i.code);
    expect(codigos).toContain("ENUNCIADO_VACIO");
  });

  it("una opción repetida o sin contenido se detecta al publicar", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Opciones dudosas" });
    h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Opciones dudosas", aplicacion: { duracionMinutos: 10 } },
      secciones: [
        {
          id: creada.datos.secciones[0].id,
          titulo: "Sección",
          preguntas: [
            {
              id: "pr_dudosa",
              tipo: "opcion_unica",
              enunciado: { v: 1, b: [{ t: "p", s: [{ x: "¿Cuál?" }] }] },
              modoPuntaje: "exacto",
              puntos: 1,
              opciones: [
                { id: "op_a", texto: { v: 1, b: [{ t: "p", s: [{ x: "Repetida" }] }] }, valor: "a", correcta: true },
                { id: "op_b", texto: { v: 1, b: [{ t: "p", s: [{ x: "Repetida" }] }] }, valor: "b" },
                { id: "op_c", texto: { v: 1, b: [] }, valor: "c" },
              ],
            },
          ],
        },
      ],
    });
    const res = h.admin("publishEvaluation", { id: creada.datos.evaluacion.id });
    expect(res.ok).toBe(false);
    const codigos = res.error.detalle.issues.map((i: { code: string }) => i.code);
    expect(codigos).toContain("OPCION_DUPLICADA");
    expect(codigos).toContain("OPCION_VACIA");
  });
});
