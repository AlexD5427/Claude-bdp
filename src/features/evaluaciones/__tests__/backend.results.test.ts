import { describe, it, expect } from "vitest";
import { loadInstalledBackend, sampleDocument } from "../../../../scripts/evaluaciones-backend.mjs";
import type { EvHarness } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Integridad del intento y panel de resultados.
 *
 * El módulo anterior no permitía ver una sola respuesta de un candidato. Aquí se
 * fija todo lo contrario: la cola de intentos, el detalle con la pregunta tal como
 * se presentó, la calificación manual, la anulación, el rastro de eventos y el
 * paquete de exportación del informe.
 */

function preparar(h: EvHarness, ajustes: (doc: Record<string, any>) => void = () => {}) {
  const creada = h.admin("createEvaluation", { titulo: "Analista de riesgo crediticio" });
  const id = creada.datos.evaluacion.id as string;
  const seccionId = creada.datos.secciones[0].id as string;
  const doc = sampleDocument(id, seccionId);
  doc.evaluacion.aplicacion.intentosMaximos = 9;
  ajustes(doc);
  expect(h.admin("saveEvaluation", doc).ok).toBe(true);
  expect(h.admin("publishEvaluation", { id }).ok).toBe(true);
  return { id, seccionId, codigo: creada.datos.evaluacion.codigo as string };
}

function intentoCompleto(
  h: EvHarness,
  codigo: string,
  documento: string,
  respuestas: Record<string, any>[],
  eventos: Record<string, any>[] = [],
) {
  const inicio = h.publico("startAttempt", { codigo, participante: { nombre: `Persona ${documento}`, documento } });
  expect(inicio.ok, JSON.stringify(inicio.error)).toBe(true);
  const envio = h.publico("submitAttempt", {
    intentoId: inicio.datos.intentoId,
    token: inicio.datos.token,
    respuestas,
    eventos,
  });
  expect(envio.ok, JSON.stringify(envio.error)).toBe(true);
  return inicio.datos.intentoId as string;
}

const RESPUESTAS_BUENAS = [
  { preguntaId: "pr_unica", opciones: ["op_u1"] },
  { preguntaId: "pr_multiple", opciones: ["op_m1", "op_m2"] },
  { preguntaId: "pr_numero", valor: 1250.5 },
  { preguntaId: "pr_abierta", valor: "Recomiendo aprobar con garantía real." },
];

describe("backend · integridad y resultados", () => {
  it("los eventos se guardan con severidad y alimentan el riesgo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "INT-1", RESPUESTAS_BUENAS, [
      { tipo: "pestana_oculta", secuencia: 1, duracionMs: 45000 },
      { tipo: "pestana_visible", secuencia: 2 },
      { tipo: "pegar", secuencia: 3, detalle: { caracteres: 1200 } },
      { tipo: "copiar", secuencia: 4 },
      { tipo: "pregunta_vista", secuencia: 5, preguntaId: "pr_unica" },
    ]);

    const detalle = h.admin("getAttempt", { intentoId });
    expect(detalle.ok).toBe(true);
    const resumen = detalle.datos.intento.resumenIntegridad;
    expect(resumen.porSeveridad.alerta).toBeGreaterThanOrEqual(2);
    expect(resumen.caracteresPegados).toBe(1200);
    expect(resumen.segundosFueraDeFoco).toBeGreaterThanOrEqual(45);
    expect(resumen.nivel).toBe("alto");
    expect(detalle.datos.intento.riesgoIntegridad).toBeGreaterThan(20);
  });

  it("un intento limpio tiene riesgo bajo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "INT-LIMPIO", RESPUESTAS_BUENAS, [
      { tipo: "pregunta_vista", secuencia: 1, preguntaId: "pr_unica" },
      { tipo: "pregunta_respondida", secuencia: 2, preguntaId: "pr_unica" },
      { tipo: "guardado", secuencia: 3 },
    ]);
    const detalle = h.admin("getAttempt", { intentoId });
    expect(detalle.datos.intento.riesgoIntegridad).toBe(0);
    expect(detalle.datos.intento.resumenIntegridad.nivel).toBe("bajo");
  });

  it("reenviar el mismo lote de eventos no los duplica", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const inicio = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "INT-2" },
    });
    const lote = [
      { tipo: "pestana_oculta", secuencia: 1, duracionMs: 1000 },
      { tipo: "pegar", secuencia: 2, detalle: { caracteres: 20 } },
    ];
    for (let i = 0; i < 3; i++) {
      h.publico("saveProgress", {
        intentoId: inicio.datos.intentoId,
        token: inicio.datos.token,
        respuestas: [],
        eventos: lote,
      });
    }
    expect(h.rowsOf("Integridad")).toHaveLength(2);
  });

  it("un tipo de evento desconocido se descarta sin romper el guardado", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const inicio = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "INT-3" },
    });
    const res = h.publico("saveProgress", {
      intentoId: inicio.datos.intentoId,
      token: inicio.datos.token,
      respuestas: [],
      eventos: [
        { tipo: "hackear_servidor", secuencia: 1 },
        { tipo: "copiar", secuencia: 2 },
      ],
    });
    expect(res.ok).toBe(true);
    const filas = h.rowsOf("Integridad");
    expect(filas).toHaveLength(1);
    expect(filas[0].tipo).toBe("copiar");
  });

  it("del portapapeles se guarda la longitud, nunca el contenido", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const inicio = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "INT-4" },
    });
    h.publico("saveProgress", {
      intentoId: inicio.datos.intentoId,
      token: inicio.datos.token,
      respuestas: [],
      eventos: [
        {
          tipo: "pegar",
          secuencia: 1,
          detalle: { caracteres: 42, texto: "LA RESPUESTA SECRETA DEL EXAMEN", url: "https://chat.example" },
        },
      ],
    });
    const fila = h.rowsOf("Integridad")[0];
    const json = String(fila.detalle_json);
    expect(json).toContain("42");
    expect(json).not.toContain("SECRETA");
    expect(json).not.toContain("chat.example");
  });

  it("la cronología traduce los eventos a frases legibles y ordenadas", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "INT-5", RESPUESTAS_BUENAS, [
      { tipo: "pestana_oculta", secuencia: 1, duracionMs: 38000, segundosDesdeInicio: 252 },
      { tipo: "pegar", secuencia: 2, detalle: { caracteres: 87 }, segundosDesdeInicio: 300 },
    ]);
    const detalle = h.admin("getAttempt", { intentoId });
    const cronologia = detalle.datos.cronologia;
    expect(cronologia[0].tipo).toBe("inicio");
    const textos = cronologia.map((c: { texto: string }) => c.texto);
    expect(textos.some((t: string) => t.includes("Salió de la pestaña durante 38 s"))).toBe(true);
    expect(textos.some((t: string) => t.includes("Pegó texto (87 caracteres)"))).toBe(true);
    expect(textos[textos.length - 1]).toMatch(/Envió la evaluación/);
    for (let i = 1; i < cronologia.length; i++) {
      expect(cronologia[i].segundos).toBeGreaterThanOrEqual(cronologia[i - 1].segundos);
    }
  });

  /* -------------------------------- Resultados ---------------------------- */

  it("la cola muestra participantes, notas y agregados coherentes", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    intentoCompleto(h, ev.codigo, "A-1", RESPUESTAS_BUENAS);
    intentoCompleto(h, ev.codigo, "A-2", [{ preguntaId: "pr_unica", opciones: ["op_u2"] }]);
    h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "En curso", documento: "A-3" } });

    const cola = h.admin("listAttempts", { evaluacionId: ev.id });
    expect(cola.ok, JSON.stringify(cola.error)).toBe(true);
    expect(cola.datos.intentos).toHaveLength(3);
    expect(cola.datos.resumen.total).toBe(3);
    expect(cola.datos.resumen.enviados).toBe(2);
    expect(cola.datos.resumen.enCurso).toBe(1);
    // Los dos enviados tienen una pregunta abierta: quedan pendientes.
    expect(cola.datos.resumen.pendientesRevision).toBe(2);
    expect(cola.datos.resumen.notaPromedio).toBeNull();
    // Y la evaluación viaja con su contexto para pintar la cabecera.
    expect(cola.datos.evaluacion.puntajeAprobacion).toBe(70);
    expect(cola.datos.evaluacion.puntosTotales).toBe(10);

    const enCurso = cola.datos.intentos.find((i: { estado: string }) => i.estado === "en_curso");
    expect(enCurso.segundosRestantes).toBeGreaterThan(0);
  });

  it("la cola filtra por estado, por texto y por riesgo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    intentoCompleto(h, ev.codigo, "B-1", RESPUESTAS_BUENAS);
    intentoCompleto(h, ev.codigo, "B-2", RESPUESTAS_BUENAS, [
      { tipo: "pegar", secuencia: 1, detalle: { caracteres: 3000 } },
      { tipo: "pestana_oculta", secuencia: 2, duracionMs: 120000 },
    ]);

    expect(h.admin("listAttempts", { evaluacionId: ev.id, estados: ["enviado"] }).datos.intentos).toHaveLength(2);
    expect(h.admin("listAttempts", { evaluacionId: ev.id, buscar: "B-2" }).datos.intentos).toHaveLength(1);
    const riesgosos = h.admin("listAttempts", { evaluacionId: ev.id, soloRiesgo: true });
    expect(riesgosos.datos.intentos).toHaveLength(1);
    expect(riesgosos.datos.intentos[0].participante.documento).toBe("B-2");
  });

  it("el detalle incluye la pregunta como se presentó, la clave y lo elegido", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "C-1", RESPUESTAS_BUENAS);
    const detalle = h.admin("getAttempt", { intentoId });

    const unica = detalle.datos.respuestas.find((r: { preguntaId: string }) => r.preguntaId === "pr_unica");
    expect(unica.enunciadoTexto).toContain("mora");
    expect(unica.claveTexto).toBe("Atrasos");
    expect(unica.opciones.find((o: { id: string }) => o.id === "op_u1").elegida).toBe(true);
    expect(unica.opciones.find((o: { id: string }) => o.id === "op_u2").elegida).toBe(false);
    expect(unica.puntosObtenidos).toBe(2);
    expect(unica.puntosPosibles).toBe(2);
  });

  it("las preguntas sin responder también aparecen en el detalle", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "D-1", [{ preguntaId: "pr_unica", opciones: ["op_u1"] }]);
    const detalle = h.admin("getAttempt", { intentoId });
    expect(detalle.datos.respuestas).toHaveLength(4);
    const sinResponder = detalle.datos.respuestas.filter((r: { respondida: boolean }) => !r.respondida);
    expect(sinResponder).toHaveLength(3);
    // Y traen su enunciado, para que el revisor vea qué se dejó en blanco.
    expect(sinResponder[0].enunciadoTexto).toBeTruthy();
  });

  it("calificar a mano recompone la nota, el veredicto y el estado", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "E-1", RESPUESTAS_BUENAS);

    const antes = h.admin("getAttempt", { intentoId }).datos.intento;
    expect(antes.estadoCalificacion).toBe("pendiente_revision");
    expect(antes.nota).toBeNull();

    const calificada = h.admin("gradeAnswer", {
      intentoId,
      preguntaId: "pr_abierta",
      puntos: 3,
      comentario: "Argumenta bien el riesgo y propone mitigantes.",
    });
    expect(calificada.ok, JSON.stringify(calificada.error)).toBe(true);
    expect(calificada.datos.pendientesRevision).toBe(0);
    expect(calificada.datos.estadoCalificacion).toBe("revisada");
    expect(calificada.datos.nota).toBe(100);
    expect(calificada.datos.aprobado).toBe(true);

    const detalle = h.admin("getAttempt", { intentoId });
    const abierta = detalle.datos.respuestas.find((r: { preguntaId: string }) => r.preguntaId === "pr_abierta");
    expect(abierta.comentarioRevisor).toContain("mitigantes");
    expect(detalle.datos.intento.calificadoPor).toBeTruthy();
  });

  it("calificar a mano fuera de rango se rechaza indicando el máximo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "F-1", RESPUESTAS_BUENAS);
    const res = h.admin("gradeAnswer", { intentoId, preguntaId: "pr_abierta", puntos: 99 });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("VALIDATION_ERROR");
    expect(res.error.detalle.maximo).toBe(3);
  });

  it("no se puede recalificar a mano una pregunta cerrada sin forzarlo", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "G-1", RESPUESTAS_BUENAS);
    const res = h.admin("gradeAnswer", { intentoId, preguntaId: "pr_unica", puntos: 0 });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("CONFLICT");
    expect(res.error.detalle.puedeForzar).toBe(true);

    const forzada = h.admin("gradeAnswer", { intentoId, preguntaId: "pr_unica", puntos: 0, forzar: true });
    expect(forzada.ok).toBe(true);
  });

  it("anular un intento lo saca de los agregados sin borrarlo, y se puede restablecer", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const bueno = intentoCompleto(h, ev.codigo, "H-1", RESPUESTAS_BUENAS);
    h.admin("gradeAnswer", { intentoId: bueno, preguntaId: "pr_abierta", puntos: 3 });
    const malo = intentoCompleto(h, ev.codigo, "H-2", [{ preguntaId: "pr_unica", opciones: ["op_u2"] }]);
    h.admin("gradeAnswer", { intentoId: malo, preguntaId: "pr_abierta", puntos: 0, forzar: true });

    const anulado = h.admin("annulAttempt", { intentoId: malo, motivo: "Se detectó suplantación." });
    expect(anulado.ok, JSON.stringify(anulado.error)).toBe(true);
    expect(anulado.datos.estado).toBe("anulado");

    const cola = h.admin("listAttempts", { evaluacionId: ev.id });
    expect(cola.datos.resumen.anulados).toBe(1);
    expect(cola.datos.resumen.conNota).toBe(1);
    expect(cola.datos.resumen.tasaAprobacion).toBe(100);
    // Sigue en la lista: nada desaparece sin dejar rastro.
    expect(cola.datos.intentos).toHaveLength(2);

    const restablecido = h.admin("annulAttempt", { intentoId: malo, restablecer: true });
    expect(restablecido.datos.estado).toBe("enviado");
  });

  it("los agregados calculan promedio, mediana, extremos y tasa de aprobación", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h, (doc) => {
      // Sin preguntas manuales, para que todas las notas sean firmes.
      doc.secciones[0].preguntas = doc.secciones[0].preguntas.slice(0, 2);
    });
    // 5 de 5 puntos → 100; 2 de 5 → 40; 0 → 0.
    intentoCompleto(h, ev.codigo, "I-1", [
      { preguntaId: "pr_unica", opciones: ["op_u1"] },
      { preguntaId: "pr_multiple", opciones: ["op_m1", "op_m2"] },
    ]);
    intentoCompleto(h, ev.codigo, "I-2", [{ preguntaId: "pr_unica", opciones: ["op_u1"] }]);
    intentoCompleto(h, ev.codigo, "I-3", [{ preguntaId: "pr_unica", opciones: ["op_u2"] }]);

    const resumen = h.admin("listAttempts", { evaluacionId: ev.id }).datos.resumen;
    expect(resumen.conNota).toBe(3);
    expect(resumen.notaMaxima).toBe(100);
    expect(resumen.notaMinima).toBe(0);
    expect(resumen.notaMediana).toBe(40);
    expect(resumen.notaPromedio).toBe(46.67);
    expect(resumen.conVeredicto).toBe(3);
    expect(resumen.aprobados).toBe(1);
    expect(resumen.tasaAprobacion).toBe(33.33);
  });

  it("el paquete de exportación trae identidad, resultado, integridad y cronología", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "7654321", RESPUESTAS_BUENAS, [
      { tipo: "pegar", secuencia: 1, detalle: { caracteres: 60 } },
    ]);
    h.admin("gradeAnswer", { intentoId, preguntaId: "pr_abierta", puntos: 3 });

    const paquete = h.admin("exportAttempt", { intentoId });
    expect(paquete.ok, JSON.stringify(paquete.error)).toBe(true);
    const d = paquete.datos;
    expect(d.identidad.documento).toBe("7654321");
    expect(d.identidad.identificador).toBe(intentoId);
    expect(d.evaluacion.titulo).toBeTruthy();
    expect(d.resultado.nota).toBe(100);
    expect(d.resultado.aprobado).toBe(true);
    expect(d.respuestas.length).toBe(4);
    expect(d.cronologia.length).toBeGreaterThan(1);
    expect(d.integridad.riesgo).toBeGreaterThan(0);
    expect(d.generadoEn).toBeTruthy();
  });

  it("si el snapshot de la versión desaparece, el detalle avisa y no se rompe", () => {
    const h = loadInstalledBackend();
    const ev = preparar(h);
    const intentoId = intentoCompleto(h, ev.codigo, "J-1", RESPUESTAS_BUENAS);

    // Se simula la pérdida de los bloques del snapshot.
    const hoja = h.spreadsheet.getSheetByName("VersionesBloques");
    for (let fila = hoja.getLastRow(); fila >= 2; fila--) hoja.deleteRow(fila);

    const detalle = h.admin("getAttempt", { intentoId });
    expect(detalle.ok).toBe(true);
    expect(detalle.datos.advertencias).toContain("SNAPSHOT_ILEGIBLE");
    // Las respuestas siguen ahí, sin su enunciado.
    expect(detalle.datos.respuestas.length).toBeGreaterThan(0);
    expect(detalle.datos.respuestas[0].enunciadoTexto).toBe("");
  });

  it("un intento inexistente responde NOT_FOUND", () => {
    const h = loadInstalledBackend();
    const res = h.admin("getAttempt", { intentoId: "it_inventado" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("NOT_FOUND");
  });

  it("listar intentos sin identificador de evaluación explica qué falta", () => {
    const h = loadInstalledBackend();
    const res = h.admin("listAttempts", {});
    expect(res.ok).toBe(false);
    expect(res.error.pista).toMatch(/evaluacionId/);
  });
});
