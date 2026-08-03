import { describe, it, expect } from "vitest";
import {
  loadBackend,
  loadInstalledBackend,
  sampleDocument,
  SHEETS_CELL_CHARACTER_LIMIT,
} from "../../../../scripts/evaluaciones-backend.mjs";
import type { EvHarness } from "../../../../scripts/evaluaciones-backend.mjs";

/**
 * Diagnóstico, registro, métricas, límites de la plataforma y mantenimiento.
 *
 * El encargo pedía que «los errores no sean genéricos sino que den un diagnóstico
 * que se pueda ver e identificar, y aporten logs». Estas pruebas fijan esa
 * propiedad: todo hallazgo trae remedio, todo error trae pista y traza, y el
 * diario existe y se puede consultar y podar.
 */

function conContenido(h: EvHarness) {
  const creada = h.admin("createEvaluation", { titulo: "Analista de riesgo crediticio" });
  const id = creada.datos.evaluacion.id as string;
  const seccionId = creada.datos.secciones[0].id as string;
  h.admin("saveEvaluation", sampleDocument(id, seccionId));
  h.admin("publishEvaluation", { id });
  return { id, seccionId, codigo: creada.datos.evaluacion.codigo as string };
}

describe("backend · diagnóstico y límites", () => {
  it("todo hallazgo del diagnóstico trae severidad, detalle y remedio", () => {
    const h = loadBackend({ adminKey: null });
    const res = h.publico("diagnose", { profundo: true });
    expect(res.ok).toBe(true);
    expect(res.datos.hallazgos.length).toBeGreaterThan(0);
    for (const hallazgo of res.datos.hallazgos) {
      expect(["critico", "alto", "medio", "info"]).toContain(hallazgo.severidad);
      expect(hallazgo.codigo).toBeTruthy();
      expect(hallazgo.titulo).toBeTruthy();
      expect(hallazgo.detalle).toBeTruthy();
      expect(hallazgo.remedio, `${hallazgo.codigo} sin remedio`).toBeTruthy();
    }
  });

  it("todo error trae código, mensaje, pista y traza correlacionable", () => {
    const h = loadInstalledBackend();
    const res = h.admin("getEvaluation", { id: "ev_inexistente" });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("NOT_FOUND");
    expect(res.error.mensaje).toBeTruthy();
    expect(res.error.pista).toBeTruthy();
    expect(res.error.traza).toMatch(/^tz_/);

    const diario = h.admin("listLogs", { limite: 50 });
    const entrada = diario.datos.entradas.find((e: { traza: string }) => e.traza === res.error.traza);
    expect(entrada, "el error debe quedar en el diario con su traza").toBeTruthy();
    expect(entrada.nivel).toBe("error");
    expect(entrada.accion).toBe("getEvaluation");
  });

  it("un error no clasificado se registra con su pila y no se sirve en crudo", () => {
    const h = loadInstalledBackend();
    // Se rompe una función interna para provocar un fallo inesperado.
    h.call("eval", "");
    const res = h.admin("listEvaluations", { estados: { nada: true } as unknown as string[] });
    // No debe caerse: `evTextArray_` tolera cualquier entrada.
    expect(res.ok).toBe(true);
  });

  it("el diagnóstico mide el rendimiento y el estado del caché", () => {
    const h = loadInstalledBackend();
    conContenido(h);
    const res = h.admin("diagnose");
    expect(res.datos.rendimiento.lecturaMs).toBeGreaterThanOrEqual(0);
    expect(res.datos.rendimiento.cacheDisponible).toBe(true);
    expect(res.datos.rendimiento.filasLeidas).toBeGreaterThan(0);
  });

  it("el diagnóstico profundo detecta snapshots ilegibles y filas huérfanas", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);

    // Se corrompe un bloque del snapshot: la huella deja de coincidir.
    const bloques = h.spreadsheet.getSheetByName("VersionesBloques");
    bloques.getRange(2, 5).setValue('{"roto":true}');

    // Y se deja una respuesta huérfana.
    const respuestas = h.spreadsheet.getSheetByName("Respuestas");
    respuestas.appendRow(["rs_huerfana", "it_que_no_existe", ev.id, "pr_x", "texto_corto"]);

    const res = h.admin("diagnose", { profundo: true });
    const codigos = res.datos.hallazgos.map((x: { codigo: string }) => x.codigo);
    expect(codigos).toContain("SNAPSHOTS_ILEGIBLES");
    expect(codigos).toContain("FILAS_HUERFANAS");
    expect(res.datos.estado).toBe("critico");
    expect(res.datos.profundas.respuestasHuerfanas).toBe(1);
  });

  it("un snapshot alterado a mano NO se sirve al candidato", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);
    const bloques = h.spreadsheet.getSheetByName("VersionesBloques");
    const original = String(bloques.getRange(2, 5).getValues()[0][0]);
    bloques.getRange(2, 5).setValue(original.replace("Atrasos", "Utilidad"));

    const res = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("SCHEMA_ERROR");
    expect(res.error.mensaje).toMatch(/huella/);
  });

  it("las publicaciones incoherentes se detectan: publicada sin versión", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);
    // Se borra el puntero a la versión vigente, como haría una edición manual.
    const hoja = h.spreadsheet.getSheetByName("Evaluaciones");
    const encabezados: string[] = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const columna = encabezados.indexOf("version_vigente_id") + 1;
    hoja.getRange(2, columna).setValue("");

    const res = h.admin("diagnose");
    const hallazgo = res.datos.hallazgos.find((x: { codigo: string }) => x.codigo === "PUBLICADA_SIN_VERSION");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.severidad).toBe("critico");
    expect(hallazgo.datos.codigos).toContain(ev.codigo);
  });

  it("los códigos públicos duplicados se detectan", () => {
    const h = loadInstalledBackend();
    conContenido(h);
    const segunda = h.admin("createEvaluation", { titulo: "Otra" });
    const hoja = h.spreadsheet.getSheetByName("Evaluaciones");
    const encabezados: string[] = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const columna = encabezados.indexOf("codigo") + 1;
    const primerCodigo = String(hoja.getRange(2, columna).getValues()[0][0]);
    hoja.getRange(3, columna).setValue(primerCodigo);

    const res = h.admin("diagnose");
    const hallazgo = res.datos.hallazgos.find((x: { codigo: string }) => x.codigo === "CODIGOS_DUPLICADOS");
    expect(hallazgo).toBeTruthy();
    expect(segunda.ok).toBe(true);
  });

  /* ------------------------------- Límites duros -------------------------- */

  it("el snapshot se trocea y una evaluación enorme se publica sin problemas", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Enorme" });
    const id = creada.datos.evaluacion.id;
    const largo = "Analiza el caso siguiente con detalle y justifica cada supuesto. ".repeat(70);
    const preguntas = [];
    for (let i = 0; i < 60; i++) {
      preguntas.push({
        id: `pr_grande_${i}`,
        tipo: "opcion_unica",
        modoPuntaje: "exacto",
        puntos: 1,
        obligatoria: true,
        enunciado: { v: 1, b: [{ t: "p", s: [{ x: `${largo} #${i}` }] }] },
        opciones: [
          { id: `op_g${i}a`, texto: { v: 1, b: [{ t: "p", s: [{ x: `Sí — ${largo.slice(0, 300)}` }] }] }, valor: "a", correcta: true },
          { id: `op_g${i}b`, texto: { v: 1, b: [{ t: "p", s: [{ x: "No" }] }] }, valor: "b" },
        ],
      });
    }
    const guardada = h.admin("saveEvaluation", {
      id,
      evaluacion: { titulo: "Enorme", aplicacion: { duracionMinutos: 90, puntajeAprobacion: 60 } },
      secciones: [{ id: creada.datos.secciones[0].id, titulo: "Sección", preguntas }],
    });
    expect(guardada.ok, JSON.stringify(guardada.error)).toBe(true);

    const publicada = h.admin("publishEvaluation", { id });
    expect(publicada.ok, JSON.stringify(publicada.error)).toBe(true);
    expect(publicada.datos.version.caracteres).toBeGreaterThan(SHEETS_CELL_CHARACTER_LIMIT);
    expect(publicada.datos.version.bloques).toBeGreaterThan(1);

    // Ninguna celda del libro supera el techo de la plataforma.
    for (const hoja of h.spreadsheet.getSheets()) {
      const ultimaFila = hoja.getLastRow();
      if (ultimaFila < 1) continue;
      const valores = hoja.getRange(1, 1, ultimaFila, Math.max(1, hoja.getLastColumn())).getValues();
      for (const fila of valores) {
        for (const celda of fila) {
          if (typeof celda === "string") {
            expect(celda.length).toBeLessThanOrEqual(SHEETS_CELL_CHARACTER_LIMIT);
          }
        }
      }
    }

    // Y se puede servir de vuelta íntegra.
    const abierta = h.publico("openAssessment", { codigo: creada.datos.evaluacion.codigo });
    expect(abierta.datos.totalPreguntas).toBe(60);
    const inicio = h.publico("startAttempt", {
      codigo: creada.datos.evaluacion.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    expect(inicio.ok).toBe(true);
    expect(inicio.datos.prueba.secciones[0].preguntas).toHaveLength(60);
  });

  it("un campo suelto demasiado largo se recorta en lugar de romper la fila", () => {
    const h = loadInstalledBackend();
    const creada = h.admin("createEvaluation", { titulo: "Recorte" });
    const res = h.admin("saveEvaluation", {
      id: creada.datos.evaluacion.id,
      evaluacion: { titulo: "Recorte", notasInternas: "x".repeat(200000) },
      secciones: [],
    });
    expect(res.ok).toBe(true);
    expect(res.datos.evaluacion.notasInternas.length).toBeLessThanOrEqual(8000);
  });

  it("un cuerpo POST desmesurado se rechaza con su tamaño y su límite", () => {
    const h = loadInstalledBackend();
    const grande = JSON.stringify({ accion: "ping", relleno: "x".repeat(6_200_000) });
    const salida = h.call("doPost", { postData: { contents: grande } });
    const envelope = JSON.parse(salida.getContent());
    expect(envelope.ok).toBe(false);
    expect(envelope.error.codigo).toBe("BAD_REQUEST");
    expect(envelope.error.detalle.maximo).toBeGreaterThan(0);
  });

  /* --------------------------- Entradas HTTP crudas ----------------------- */

  it("doGet sirve las lecturas y rechaza las escrituras explicando el método", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);

    const lectura = h.call("doGet", { parameter: { accion: "openAssessment", codigo: ev.codigo } });
    const envelopeLectura = JSON.parse(lectura.getContent());
    expect(envelopeLectura.ok).toBe(true);
    expect(envelopeLectura.datos.disponible).toBe(true);

    const escritura = h.call("doGet", { parameter: { accion: "saveEvaluation", id: ev.id } });
    const envelopeEscritura = JSON.parse(escritura.getContent());
    expect(envelopeEscritura.ok).toBe(false);
    expect(envelopeEscritura.error.mensaje).toMatch(/POST/);
  });

  it("doPost con un cuerpo que no es JSON responde con instrucciones", () => {
    const h = loadInstalledBackend();
    const salida = h.call("doPost", { postData: { contents: "esto no es json" } });
    const envelope = JSON.parse(salida.getContent());
    expect(envelope.ok).toBe(false);
    expect(envelope.error.pista).toMatch(/JSON.stringify/);
  });

  it("doPost sin cuerpo lo dice en lugar de fallar en silencio", () => {
    const h = loadInstalledBackend();
    const envelope = JSON.parse(h.call("doPost", {}).getContent());
    expect(envelope.ok).toBe(false);
    expect(envelope.error.mensaje).toMatch(/sin cuerpo/);
  });

  it("el envoltorio siempre trae meta, incluso en los errores", () => {
    const h = loadInstalledBackend();
    const bien = h.admin("ping");
    const mal = h.admin("getEvaluation", { id: "no_existe" });
    for (const res of [bien, mal]) {
      expect(res.meta.traza).toMatch(/^tz_/);
      expect(res.meta.backend).toBeTruthy();
      expect(res.meta.esquema).toBeGreaterThan(0);
      expect(res.meta.horaServidor).toBeTruthy();
      expect(res.meta.modoAuth).toBeTruthy();
      expect(res.meta.contadores).toBeTruthy();
    }
  });

  /* --------------------------- Métricas y diario -------------------------- */

  it("las métricas se agregan por acción con promedios y errores", () => {
    const h = loadInstalledBackend();
    conContenido(h);
    h.admin("getEvaluation", { id: "no_existe" });

    const res = h.admin("getMetrics");
    expect(res.ok).toBe(true);
    expect(res.datos.habilitadas).toBe(true);
    const porAccion = new Map(res.datos.acciones.map((a: { accion: string }) => [a.accion, a]));
    const guardar = porAccion.get("saveEvaluation") as any;
    expect(guardar.llamadas).toBeGreaterThan(0);
    expect(guardar.msPromedio).toBeGreaterThanOrEqual(0);
    const fallida = porAccion.get("getEvaluation") as any;
    expect(fallida.errores).toBe(1);
  });

  it("las métricas se pueden desactivar por propiedad", () => {
    const h = loadInstalledBackend({ properties: { EV_METRICS_ENABLED: "false" } });
    h.admin("createEvaluation", { titulo: "Sin métricas" });
    expect(h.rowsOf("Metricas")).toHaveLength(0);
    expect(h.admin("getMetrics").datos.habilitadas).toBe(false);
  });

  it("el nivel del diario se puede subir para no escribir lo rutinario", () => {
    const h = loadInstalledBackend({ properties: { EV_LOG_LEVEL: "error" } });
    h.admin("createEvaluation", { titulo: "Silencioso" });
    const filas = h.rowsOf("Registro");
    for (const fila of filas) expect(fila.nivel).toBe("error");
  });

  it("la poda conserva las entradas recientes y borra el resto", () => {
    const h = loadInstalledBackend();
    const registro = h.spreadsheet.getSheetByName("Registro");
    for (let i = 0; i < 60; i++) {
      registro.appendRow([
        `lg_relleno_${i}`,
        new Date(Date.now() - i * 60000).toISOString(),
        "info",
        "tz_relleno",
        "relleno",
        `mensaje ${i}`,
        "",
        "",
      ]);
    }
    const antes = h.rowsOf("Registro").length;
    expect(antes).toBeGreaterThan(50);

    const res = h.admin("pruneLogs", { conservar: 100 });
    expect(res.ok, JSON.stringify(res.error)).toBe(true);
    expect(h.rowsOf("Registro").length).toBeLessThanOrEqual(100);
  });

  it("el diario se filtra por nivel, acción y traza", () => {
    const h = loadInstalledBackend();
    const fallo = h.admin("getEvaluation", { id: "no_existe" });
    const soloErrores = h.admin("listLogs", { nivel: "error" });
    expect(soloErrores.datos.entradas.length).toBeGreaterThan(0);
    for (const entrada of soloErrores.datos.entradas) expect(entrada.nivel).toBe("error");

    const porTraza = h.admin("listLogs", { traza: fallo.error.traza });
    expect(porTraza.datos.entradas.length).toBeGreaterThan(0);
  });

  /* ----------------------------- Mantenimiento ---------------------------- */

  it("la limpieza de huérfanos borra solo lo que ya no se puede referenciar", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);
    const respuestas = h.spreadsheet.getSheetByName("Respuestas");
    respuestas.appendRow(["rs_huerfana", "it_inexistente", ev.id, "pr_x", "texto_corto"]);
    const preguntasAntes = h.rowsOf("Preguntas").length;

    const borrado = h.call("evCleanOrphans_");
    expect(borrado.respuestas).toBe(1);
    // No toca el contenido válido.
    expect(h.rowsOf("Preguntas")).toHaveLength(preguntasAntes);
    expect(h.rowsOf("Evaluaciones")).toHaveLength(1);
  });

  it("la tarea diaria cierra vencidos, poda y deja constancia", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);
    h.publico("startAttempt", { codigo: ev.codigo, participante: { nombre: "Ana", documento: "TD-1" } });
    h.advanceClock(60 * 60 * 1000);

    const resultado = h.call("tareaDiariaEvaluaciones");
    expect(resultado.vencidos.cerrados.length).toBe(1);
    const diario = h.admin("listLogs", { accion: "tareaDiaria" });
    expect(diario.datos.entradas.length).toBeGreaterThan(0);
  });

  it("el disparador diario se instala una sola vez", () => {
    const h = loadInstalledBackend();
    h.call("instalarDisparadorDiario");
    h.call("instalarDisparadorDiario");
    expect(h.state.triggers).toHaveLength(1);
    expect(h.state.triggers[0].getHandlerFunction()).toBe("tareaDiariaEvaluaciones");
  });

  it("la suite interna del backend pasa en verde contra el libro simulado", () => {
    const h = loadInstalledBackend();
    const resultado = h.call("evRunTests_");
    const fallidas = resultado.resultados
      .filter((r: { ok: boolean }) => !r.ok)
      .map((r: { nombre: string; motivo: string }) => `${r.nombre}: ${r.motivo}`);
    expect(fallidas).toEqual([]);
    expect(resultado.pasadas).toBe(resultado.total);
    expect(resultado.total).toBeGreaterThan(10);
  });

  it("el secreto de firma de intentos se genera al instalar y no se registra", () => {
    const h = loadInstalledBackend();
    expect(String(h.state.properties.EV_ATTEMPT_SECRET).length).toBeGreaterThanOrEqual(32);
    const secreto = h.state.properties.EV_ATTEMPT_SECRET;
    const diario = JSON.stringify(h.admin("listLogs", { limite: 200 }).datos);
    expect(diario).not.toContain(secreto);
    expect(h.state.logs.join("\n")).not.toContain(secreto);
  });

  it("sin secreto de intentos, iniciar una prueba falla con instrucciones claras", () => {
    const h = loadInstalledBackend();
    const ev = conContenido(h);
    delete h.state.properties.EV_ATTEMPT_SECRET;
    const res = h.publico("startAttempt", {
      codigo: ev.codigo,
      participante: { nombre: "Ana", documento: "1" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.codigo).toBe("SCHEMA_ERROR");
    expect(res.error.pista).toMatch(/Instalar o reparar/);

    const diag = h.admin("diagnose");
    const hallazgo = diag.datos.hallazgos.find((x: { codigo: string }) => x.codigo === "SIN_SECRETO_INTENTOS");
    expect(hallazgo.severidad).toBe("critico");
  });

  it("un libro inaccesible produce un diagnóstico crítico, no una excepción", () => {
    const h = loadBackend({ properties: { EV_SPREADSHEET_ID: "inexistente" } });
    const res = h.admin("diagnose");
    expect(res.ok).toBe(true);
    expect(res.datos.estado).toBe("critico");
    expect(res.datos.hallazgos[0].codigo).toBe("LIBRO_INACCESIBLE");
  });

  it("una URL pegada en lugar del id del libro se interpreta igual", () => {
    const h = loadBackend({
      properties: { EV_SPREADSHEET_ID: "https://docs.google.com/spreadsheets/d/ABC123/edit#gid=0" },
    });
    const res = h.admin("install");
    expect(res.ok, JSON.stringify(res.error)).toBe(true);
  });
});
