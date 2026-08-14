import { describe, it, expect } from "vitest";
import {
  crearExpediente,
  loadBackend,
  loadInstalledBackend,
  seedLegacyBook,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Concurrencia, idempotencia y reintentos.
 *
 * Apps Script no da transacciones. Lo que hay es un bloqueo de script, una clave
 * de solicitud y una versión por registro; estas pruebas comprueban que las tres
 * cosas hacen su trabajo. Son los escenarios que en producción producen
 * expedientes duplicados y cambios perdidos, y los que nunca se reproducen
 * probando a mano.
 */

describe("documentación · idempotencia del enrutador", () => {
  it("la misma solicitud repetida no vuelve a ejecutarse", () => {
    const h = loadInstalledBackend();
    const solicitudId = "req_fijo_para_la_prueba";
    const datos = {
      expediente: { identificador: "CI-IDEM-2026", nombre: "Una sola vez", fechaIngreso: "2026-01-10" },
    };

    const primera = h.pedir("documentacion.expediente.crear", datos, { solicitudId });
    expect(primera.ok).toBe(true);
    expect(primera.data.creado).toBe(true);

    // Reintento por red lenta: mismo solicitudId.
    const segunda = h.pedir("documentacion.expediente.crear", datos, { solicitudId });
    expect(segunda.ok).toBe(true);
    expect(segunda.avisos.join(" ")).toMatch(/ya procesada/i);
    expect(h.rowsOf("Expedientes").length).toBe(1);
  });

  it("dos guardados simultáneos del mismo requisito no se pisan", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const requisito = requisitos[0];

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisito.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO", observaciones: "Primera edición" },
    });
    // La segunda pestaña envía la versión que tenía al abrir (1).
    const conflicto = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisito.expedienteDocumentoId,
      cambios: { observaciones: "Segunda edición ciega" },
      version: 1,
    });
    expect(conflicto.ok).toBe(false);
    expect(conflicto.error.code).toBe("CONFLICTO_VERSION");
    expect(conflicto.error.detalle.versionActual).toBe(2);
    expect(conflicto.error.hint).toMatch(/vuelve a abrirlo/i);

    // El dato de la primera edición sigue intacto.
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    const actual = detalle.requisitos.find((r: any) => r.expedienteDocumentoId === requisito.expedienteDocumentoId);
    expect(actual.observaciones).toBe("Primera edición");
  });

  it("sin versión declarada las operaciones internas siguen funcionando", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    // Los recálculos y las automatizaciones no conocen la versión: exigírsela
    // convertiría cada automatización en un reintento perdido.
    const res = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    expect(res.ok).toBe(true);
  });

  it("el bloqueo se toma y se suelta en cada escritura", () => {
    const h = loadInstalledBackend();
    const antes = h.state.lockAcquisitions;
    crearExpediente(h);
    expect(h.state.lockAcquisitions).toBeGreaterThan(antes);
    expect(h.state.lockHeld).toBe(false);
    expect(h.state.lockReleases).toBe(h.state.lockAcquisitions);
  });

  it("cuando el libro está ocupado se responde LIBRO_OCUPADO con instrucción de reintento", () => {
    const h = loadInstalledBackend();
    // El libro se queda ocupado DESPUÉS de instalar: es el escenario real, dos
    // escrituras a la vez sobre un libro ya en uso.
    h.state.lockAvailable = false;
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "CI-BUSY-2026", nombre: "Ocupado" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("LIBRO_OCUPADO");
    expect(res.error.hint).toMatch(/mismo solicitudId/i);
    // Y no quedó nada a medias.
    expect(h.rowsOf("Expedientes").length).toBe(0);
  });

  it("las lecturas no necesitan bloqueo", () => {
    const h = loadInstalledBackend();
    h.state.lockAvailable = false;
    const res = h.pedir("documentacion.expedientes.listar", {});
    expect(res.ok).toBe(true);
  });

  it("un error deja el libro sin escrituras a medias", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const antes = JSON.stringify(h.rowsOf("ExpedienteDocumentos"));

    // Un lote donde el segundo cambio es inválido: el primero ya se aplicó y el
    // resultado tiene que ser coherente (aplicados + fallidos), no un libro roto.
    const res = h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [
        { expedienteDocumentoId: requisitos[0].expedienteDocumentoId, estado: "ENTREGADO" },
        { expedienteDocumentoId: requisitos[1].expedienteDocumentoId, estado: "ESTADO_INVENTADO" },
      ],
    });
    expect(res.aplicados).toBe(1);
    expect(res.fallidos[0].motivo).toMatch(/no existe/i);
    expect(JSON.stringify(h.rowsOf("ExpedienteDocumentos"))).not.toBe(antes);
    const diagnostico = h.ok("documentacion.diagnostico");
    expect(diagnostico.conteos.CRITICO).toBe(0);
  });

  it("dos exportaciones a la vez son dos trabajos independientes", () => {
    const h = loadInstalledBackend();
    crearExpediente(h);
    const uno = h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    const dos = h.ok("documentacion.exportacion.iniciar", { tipo: "completo" });
    expect(uno.exportacionId).not.toBe(dos.exportacionId);
    expect(h.rowsOf("ExportacionesDocumentacion").length).toBe(2);
  });

  it("dos solicitudes masivas seguidas no duplican solicitudes", () => {
    const h = loadInstalledBackend();
    for (let i = 0; i < 3; i++) crearExpediente(h, { identificador: `CI-CC${i}-2026`, agencia: "POTOSI" });
    h.ok("documentacion.solicitudes.masiva", { seleccion: { agencia: "POTOSI" }, confirmado: true });
    h.ok("documentacion.solicitudes.masiva", { seleccion: { agencia: "POTOSI" }, confirmado: true });
    expect(h.rowsOf("SolicitudesDocumentales").length).toBe(3);
  });

  it("el proceso diario ejecutado dos veces no duplica efectos", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const cert = requisitos.find((r: any) => r.codigo === "cert-trabajo")!;
    h.ok("documentacion.prorroga.crear", {
      prorroga: { expedienteDocumentoId: cert.expedienteDocumentoId, fechaProrroga: h.read("doc2FechaMasDias_(1)"), motivo: "Plazo." },
    });
    h.ok("documentacion.solicitud.crear", { solicitud: { expedienteId, fechaLimite: h.read("doc2FechaMasDias_(1)") } });
    h.advanceClock(3 * 86400000);

    h.ok("documentacion.proceso.diario", {});
    const notificaciones = h.rowsOf("NotificacionesDocumentales").length;
    const tareas = h.rowsOf("TareasDocumentales").length;

    h.ok("documentacion.proceso.diario", {});
    expect(h.rowsOf("NotificacionesDocumentales").length).toBe(notificaciones);
    expect(h.rowsOf("TareasDocumentales").length).toBe(tareas);
  });

  it("la migración interrumpida se reanuda sin duplicar", () => {
    const h = loadBackend();
    seedLegacyBook(h, 2026);
    h.pedir("documentacion.migrar", { version: "4.0.0-estructura" });
    h.pedir("documentacion.migrar", { version: "4.0.1-catalogos" });

    // Primer intento con lote pequeño.
    h.pedir("documentacion.migrar", { version: "4.0.2-expedientes", lote: 10 });
    const primeros = h.rowsOf("Expedientes").length;
    // Segundo intento completo: no debe duplicar lo ya migrado.
    h.pedir("documentacion.migrar", { version: "4.0.2-expedientes" });
    expect(h.rowsOf("Expedientes").length).toBe(primeros);
  });

  it("sin caché disponible el módulo sigue funcionando", () => {
    const h = loadInstalledBackend({ cacheAvailable: false });
    const creado = crearExpediente(h);
    expect(creado.expedienteId).toBeTruthy();
    const panel = h.pedir("documentacion.panel");
    expect(panel.ok).toBe(true);
    expect(panel.data.desdeCache).toBe(false);
  });

  it("cada respuesta trae su requestId para poder rastrearla", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "CI-TRZ-2026", nombre: "Trazable" },
    }, { solicitudId: "req_trazable" });
    expect(res.meta.requestId).toBe("req_trazable");

    const auditoria = h.rowsOf("AuditoriaDocumentacion");
    expect(auditoria.some((a) => a.request_id === "req_trazable")).toBe(true);
  });
});
