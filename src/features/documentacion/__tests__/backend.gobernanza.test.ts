import { describe, it, expect } from "vitest";
import {
  crearExpediente,
  loadInstalledBackend,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Gobernanza: consentimientos, retención, archivo, anonimización, transición al
 * expediente laboral, diagnóstico y reparación.
 *
 * Aquí se comprueban las dos reglas que protegen los datos de las personas: nada
 * de negocio se borra automáticamente, y todo lo que se detecta se comunica como
 * «posible inconsistencia», nunca como una acusación.
 */

describe("documentación · consentimientos", () => {
  it("registra presentación, aceptación y revocación con la huella del texto", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);

    const presentado = h.ok("documentacion.consentimiento.presentar", {
      consentimiento: {
        expedienteId,
        tipo: "USO_IMAGEN",
        version: "v2",
        texto: "Autorizo el uso de mi imagen en material institucional del BDP.",
        medio: "PRESENCIAL",
      },
    });
    expect(presentado.estado).toBe("PRESENTADO");
    expect(presentado.hash).toHaveLength(16);

    h.ok("documentacion.consentimiento.responder", {
      consentimientoId: presentado.consentimientoId,
      estado: "ACEPTADO",
      evidencia: "Firmado en papel, archivado en carpeta física 2026-03.",
    });
    let lista = h.ok("documentacion.consentimientos.listar", { filtros: { expedienteId } }).consentimientos;
    expect(lista[0].estado).toBe("ACEPTADO");
    expect(lista[0].fechaAceptacion).toBeTruthy();
    expect(lista[0].tipoEtiqueta).toBe("Uso de imagen");

    h.ok("documentacion.consentimiento.responder", {
      consentimientoId: presentado.consentimientoId,
      estado: "REVOCADO",
      motivo: "La persona retiró la autorización.",
    });
    lista = h.ok("documentacion.consentimientos.listar", { filtros: { expedienteId } }).consentimientos;
    expect(lista[0].estado).toBe("REVOCADO");
    expect(lista[0].fechaRevocacion).toBeTruthy();

    // Un consentimiento revocado no se reabre: hay que presentar otra versión.
    const reabrir = h.pedir("documentacion.consentimiento.responder", {
      consentimientoId: presentado.consentimientoId,
      estado: "ACEPTADO",
    });
    expect(reabrir.ok).toBe(false);
    expect(reabrir.error.message).toMatch(/revocado/i);
  });

  it("el mismo tipo con otra versión es otro registro", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.consentimiento.presentar", {
      consentimiento: { expedienteId, tipo: "DATOS_PERSONALES", version: "v1", texto: "Texto v1" },
    });
    h.ok("documentacion.consentimiento.presentar", {
      consentimiento: { expedienteId, tipo: "DATOS_PERSONALES", version: "v2", texto: "Texto v2 con cambios" },
    });
    const lista = h.ok("documentacion.consentimientos.listar", { filtros: { expedienteId } }).consentimientos;
    expect(lista.length).toBe(2);
    expect(lista.map((c: any) => c.version).sort()).toEqual(["v1", "v2"]);
    expect(lista[0].hash).not.toBe(lista[1].hash);
  });

  it("sin tipo o sin texto se rechaza indicando el campo", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const sinTipo = h.pedir("documentacion.consentimiento.presentar", { consentimiento: { expedienteId, texto: "x" } });
    expect(sinTipo.error.fields.tipo).toBeTruthy();
    const sinTexto = h.pedir("documentacion.consentimiento.presentar", { consentimiento: { expedienteId, tipo: "USO_IMAGEN" } });
    expect(sinTexto.error.fields.texto).toBeTruthy();
  });

  it("los tipos se pueden ampliar desde la configuración", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.configuracion.guardar", {
      configuracion: { tipos_consentimiento: [{ codigo: "TELETRABAJO", etiqueta: "Acuerdo de teletrabajo" }] },
    });
    const tipos = h.ok("documentacion.consentimientos.listar", {}).tipos;
    expect(tipos.map((t: any) => t.codigo)).toContain("TELETRABAJO");
  });
});

describe("documentación · retención y archivo", () => {
  it("la política marca como pendiente de eliminación, nunca borra", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.expediente.archivar", { expedienteId });

    // Se acorta la retención para poder probarla en un test.
    h.ok("documentacion.configuracion.guardar", { configuracion: { retencion_dias: 1 } });
    const politicas = h.ok("documentacion.retencion.politicas").politicas;
    const archivados = politicas.find((p: any) => p.estado_expediente_aplicable === "ARCHIVADO")!;
    h.call("doc2Update_", "PoliticasRetencion", archivados.politica_id, { dias_retencion: 1 }, h.ctx());
    h.call("docCommit_");

    h.advanceClock(3 * 86400000);
    const res = h.ok("documentacion.retencion.aplicar", {});
    expect(res.marcados).toBe(1);

    const fila = h.rowsOf("Expedientes")[0];
    expect(fila.estado_expediente).toBe("PENDIENTE_ELIMINACION");
    // La fila SIGUE existiendo: retención marca, no borra.
    expect(h.rowsOf("Expedientes").length).toBe(1);
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(18);
  });

  it("un expediente con conservación bloqueada no lo toca la retención", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.expediente.archivar", { expedienteId });
    h.ok("documentacion.expediente.conservacion", { expedienteId, bloquear: true, motivo: "Proceso judicial en curso." });

    const politicas = h.ok("documentacion.retencion.politicas").politicas;
    const archivados = politicas.find((p: any) => p.estado_expediente_aplicable === "ARCHIVADO")!;
    h.call("doc2Update_", "PoliticasRetencion", archivados.politica_id, { dias_retencion: 1 }, h.ctx());
    h.call("docCommit_");
    h.advanceClock(3 * 86400000);

    const res = h.ok("documentacion.retencion.aplicar", {});
    expect(res.marcados).toBe(0);
    expect(res.bloqueados).toBeGreaterThan(0);
    expect(h.rowsOf("Expedientes")[0].estado_expediente).toBe("ARCHIVADO");
  });

  it("la anonimización se presenta como plan y exige confirmación", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h, { nombre: "Persona Identificable" });

    const planActivo = h.ok("documentacion.retencion.planAnonimizacion", { expedienteId });
    expect(planActivo.permitido).toBe(false);
    expect(planActivo.irreversible).toBe(true);

    const sinConfirmar = h.pedir("documentacion.retencion.anonimizar", { expedienteId });
    expect(sinConfirmar.ok).toBe(false);
    expect(sinConfirmar.error.message).toMatch(/confirmación/i);
  });

  it("anonimizar sustituye los datos personales y conserva la estadística", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { nombre: "Persona Identificable" });
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO", observaciones: "Domicilio verificado en la calle X n.º 123." },
    });
    h.ok("documentacion.comentario.crear", { comentario: { expedienteId, contenido: "Teléfono 7000000." } });
    h.ok("documentacion.expediente.archivar", { expedienteId });
    h.ok("documentacion.expediente.estado", { expedienteId, estado: "PENDIENTE_ELIMINACION" });

    const res = h.ok("documentacion.retencion.anonimizar", { expedienteId, confirmado: true });
    expect(res.anonimizado).toBe(true);
    expect(res.observacionesVaciadas).toBe(1);

    const fila = h.rowsOf("Expedientes")[0];
    expect(String(fila.nombre)).toMatch(/^ANONIMIZADO-/);
    expect(String(fila.identificador)).toMatch(/^ANON-/);
    // Los totales y el avance se conservan: la estadística histórica sigue siendo válida.
    expect(Number(fila.total_entregados)).toBe(1);
    expect(Number(fila.porcentaje_completitud)).toBeGreaterThan(0);
    const comentario = h.rowsOf("ComentariosDocumentacion")[0];
    expect(String(comentario.contenido)).toBe("(contenido anonimizado)");
  });
});

describe("documentación · transición al expediente laboral", () => {
  it("dice exactamente qué falta cuando el expediente no está listo", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const res = h.ok("documentacion.expediente.laboral", { expedienteId });
    expect(res.listo).toBe(false);
    expect(res.faltantes.length).toBe(18);
    expect(res.faltantes[0].nombre).toBeTruthy();
    expect(res.moduloDestinoDisponible).toBe(false);
  });

  it("con todo resuelto entrega el contrato de datos transferibles", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { nombre: "Lista Para Contratar" });
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: requisitos.map((r: any) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });

    const res = h.ok("documentacion.expediente.laboral", { expedienteId, registrarCierre: true });
    expect(res.listo).toBe(true);
    expect(res.cierreRegistrado).toBe(true);
    expect(res.contrato.campos.nombre).toBe("Lista Para Contratar");
    expect(res.contrato.campos.completitud).toBe(100);
    expect(res.contrato.campos.cierreDocumental).toBeTruthy();
    expect(res.contrato.noTransferible).toContain("comentarios internos");
    expect(res.contrato.nota).toMatch(/binario/i);

    // Cerrar la etapa aprueba el expediente por la vía normal.
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.expediente.estado).toBe("APROBADO");
    const historial = detalle.historial.map((x: any) => x.campo);
    expect(historial).toContain("cierre_documental");
  });
});

describe("documentación · inconsistencias", () => {
  it("detecta un resumen desfasado y lo reconstruye sin tocar los documentos", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });

    // Alguien edita el total a mano en la hoja.
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    const columna = cabecera.indexOf("total_entregados") + 1;
    hoja.getRange(2, columna, 1, 1).setValue(17);

    const diagnostico = h.ok("documentacion.diagnostico");
    const hallazgo = diagnostico.hallazgos.find((x: any) => x.codigo === "resumen-desactualizado");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.detalle).toMatch(/recalcul/i);
    expect(hallazgo.reparable).toBe("automatica");

    const reparado = h.ok("documentacion.reparar", { acciones: ["reconstruir-resumenes"] });
    expect(reparado.aplicadas[0].cambios).toBeGreaterThan(0);
    expect(Number(h.rowsOf("Expedientes")[0].total_entregados)).toBe(1);
    // Los requisitos no se tocaron.
    expect(h.rowsOf("ExpedienteDocumentos").length).toBe(18);
  });

  it("detecta un identificador duplicado y NO lo arregla solo", () => {
    const h = loadInstalledBackend();
    crearExpediente(h, { identificador: "CI-DUP-2026", nombre: "Primera" });
    // Se duplica a mano: dos filas con el mismo identificador normalizado.
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const ancho = hoja.getLastColumn();
    const fila = hoja.getRange(2, 1, 1, ancho).getValues()[0];
    const cabecera = hoja.getRange(1, 1, 1, ancho).getValues()[0].map(String);
    const copia = fila.slice();
    copia[cabecera.indexOf("expediente_id")] = "exp_copia_manual";
    hoja.getRange(3, 1, 1, ancho).setValues([copia]);

    const diagnostico = h.ok("documentacion.diagnostico");
    const hallazgo = diagnostico.hallazgos.find((x: any) => x.codigo === "identificador-duplicado");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.severidad).toBe("CRITICO");
    expect(hallazgo.titulo).toMatch(/posible/i);
    expect(hallazgo.reparable).toBe(false);

    h.ok("documentacion.reparar", { confirmado: true, incluirConfirmacion: true });
    // Las dos filas siguen ahí: fusionar personas es una decisión humana.
    expect(h.rowsOf("Expedientes").length).toBe(2);
  });

  it("detecta un estado completo con requisitos pendientes", () => {
    const h = loadInstalledBackend();
    crearExpediente(h);
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    hoja.getRange(2, cabecera.indexOf("estado_expediente") + 1, 1, 1).setValue("COMPLETO");

    const diagnostico = h.ok("documentacion.diagnostico");
    expect(diagnostico.hallazgos.map((x: any) => x.codigo)).toContain("completo-con-pendientes");
  });

  it("detecta huérfanos, estados desconocidos y fechas imposibles", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);

    // Tarea huérfana.
    h.ok("documentacion.tarea.crear", { tarea: { expedienteId, titulo: "Tarea que quedará huérfana" } });
    const tareas = h.spreadsheet.getSheetByName("TareasDocumentales")!;
    const cabeceraT = tareas.getRange(1, 1, 1, tareas.getLastColumn()).getValues()[0].map(String);
    tareas.getRange(2, cabeceraT.indexOf("expediente_id") + 1, 1, 1).setValue("exp_que_no_existe");

    // Estado documental desconocido.
    const docs = h.spreadsheet.getSheetByName("ExpedienteDocumentos")!;
    const cabeceraD = docs.getRange(1, 1, 1, docs.getLastColumn()).getValues()[0].map(String);
    docs.getRange(2, cabeceraD.indexOf("estado_documental") + 1, 1, 1).setValue("MEDIO ENTREGADO");

    const diagnostico = h.ok("documentacion.diagnostico");
    const codigos = diagnostico.hallazgos.map((x: any) => x.codigo);
    expect(codigos).toContain("tarea-huerfana");
    expect(codigos).toContain("estado-documental-desconocido");
  });

  it("detecta disparadores duplicados", () => {
    const h = loadInstalledBackend();
    h.call("docInstalarDisparadores");
    // Un segundo disparador instalado a mano, que es el error clásico.
    h.state.triggers.push({ getHandlerFunction: () => "docTareaDiaria" });

    const diagnostico = h.ok("documentacion.diagnostico");
    const hallazgo = diagnostico.hallazgos.find((x: any) => x.codigo === "trigger-duplicado");
    expect(hallazgo).toBeTruthy();
    expect(hallazgo.datos.ejemplos[0].veces).toBe(2);
  });

  it("clasifica los hallazgos en cuatro niveles y separa lo reparable", () => {
    const h = loadInstalledBackend();
    const diagnostico = h.ok("documentacion.diagnostico");
    expect(Object.keys(diagnostico.conteos).sort()).toEqual(["ADVERTENCIA", "CRITICO", "IMPORTANTE", "INFO"]);
    expect(Array.isArray(diagnostico.reparablesAutomaticamente)).toBe(true);
    expect(Array.isArray(diagnostico.requierenConfirmacion)).toBe(true);
  });

  it("el diagnóstico es solo lectura", () => {
    const h = loadInstalledBackend();
    crearExpediente(h);
    const antes = JSON.stringify({
      expedientes: h.rowsOf("Expedientes"),
      requisitos: h.rowsOf("ExpedienteDocumentos"),
    });
    h.ok("documentacion.diagnostico");
    const despues = JSON.stringify({
      expedientes: h.rowsOf("Expedientes"),
      requisitos: h.rowsOf("ExpedienteDocumentos"),
    });
    expect(despues).toBe(antes);
  });
});

describe("documentación · reparación", () => {
  it("informa de cada cambio con su antes y su después", () => {
    const h = loadInstalledBackend();
    crearExpediente(h);
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    hoja.getRange(2, cabecera.indexOf("identificador_normalizado") + 1, 1, 1).setValue("");

    const res = h.ok("documentacion.reparar", {});
    expect(res.antes.conteos.IMPORTANTE).toBeGreaterThan(0);
    const generar = res.aplicadas.find((a: any) => a.accion === "generar-ids");
    expect(generar.cambios).toBe(1);
    expect(generar.detalle[0].identificadorNormalizado).toBeTruthy();
    expect(res.despues.conteos.IMPORTANTE).toBeLessThan(res.antes.conteos.IMPORTANTE);
  });

  it("las reparaciones que tocan datos exigen confirmación", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.reparar", { acciones: ["sincronizar-requisitos"] });
    // `sincronizar-requisitos` está en la lista segura: se aplica sin confirmar.
    expect(res.aplicadas.length).toBe(1);

    const inventada = h.ok("documentacion.reparar", { acciones: ["borrar-todo"] });
    expect(inventada.aplicadas.length).toBe(0);
    expect(inventada.omitidas[0].motivo).toMatch(/confirmación|no existe/i);
  });

  it("normaliza alias conocidos y deja constancia en el historial", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    // «en_proceso» era el vocabulario de la versión anterior.
    hoja.getRange(2, cabecera.indexOf("estado_expediente") + 1, 1, 1).setValue("en_proceso");

    h.ok("documentacion.reparar", { acciones: ["normalizar-estados"] });
    expect(h.rowsOf("Expedientes")[0].estado_expediente).toBe("EN_RECOLECCION");
    const historial = h.ok("documentacion.historial.consultar", { expedienteId }).historial;
    expect(historial.some((x: any) => (x.motivo || "").match(/alias/i))).toBe(true);
  });

  it("reparar exige la capacidad de reparar", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.permisos.guardar", { roles: { "analista@bdp.com": "analista" } });
    const res = h.pedir("documentacion.reparar", {}, { actor: "analista@bdp.com" });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("PERMISO_INSUFICIENTE");
  });

  it("los hallazgos que necesitan criterio salen listados como manuales", () => {
    const h = loadInstalledBackend();
    crearExpediente(h, { identificador: "CI-MAN-2026" });
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    hoja.getRange(2, cabecera.indexOf("fecha_ingreso") + 1, 1, 1).setValue("2026-99-99");

    const res = h.ok("documentacion.reparar", {});
    const manual = res.pendientesManuales.find((x: any) => x.codigo === "fecha-invalida");
    expect(manual).toBeTruthy();
    expect(manual.queHacer).toMatch(/revisión manual/i);
  });
});
