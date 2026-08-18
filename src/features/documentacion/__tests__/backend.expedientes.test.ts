import { describe, it, expect } from "vitest";
import {
  crearExpediente,
  loadInstalledBackend,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Expedientes: alta, validación, edición, máquina de estados y resúmenes.
 *
 * El objetivo de estas pruebas es que ningún estado inválido pueda existir. Un
 * expediente aprobado con documentos pendientes, un comercial sin garantía o un
 * requisito obligatorio marcado como «no aplica» son exactamente los datos que
 * después nadie sabe explicar en una auditoría.
 */

describe("documentación · alta de expedientes", () => {
  it("crea el expediente con los requisitos de su rama y en estado inicial", () => {
    const h = loadInstalledBackend();
    const { expediente, requisitos } = crearExpediente(h);

    expect(requisitos.length).toBe(18);
    expect(expediente.estado).toBe("EN_RECOLECCION");
    expect(expediente.porcentaje).toBe(0);
    expect(expediente.totales.requisitos).toBe(18);
    expect(expediente.totales.pendientes).toBe(18);
    for (const requisito of requisitos) {
      expect(requisito.estado).toBe("PENDIENTE");
      expect(requisito.estadoRevision).toBe("SIN_REVISION");
    }
  });

  it("exige identificador y nombre, y devuelve el campo que falta", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expediente.crear", { expediente: { nombre: "Sin identificador" } });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("VALIDACION");
    expect(res.error.fields.identificador).toBeTruthy();
  });

  it("rechaza un identificador repetido y señala el expediente existente", () => {
    const h = loadInstalledBackend();
    const primero = crearExpediente(h, { identificador: "CI-100-2026" });
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "ci - 100 - 2026", nombre: "Otra persona" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("CONFLICTO");
    expect(res.error.detalle.expedienteId).toBe(primero.expedienteId);
  });

  it("un comercial sin tipo de garantía no se puede crear", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI-200-2026",
        nombre: "Comercial sin garantía",
        tipoFuncionario: "COMERCIAL",
        tipoGarantia: "NINGUNA",
      },
    });
    expect(res.ok).toBe(false);
    expect(res.error.fields.tipo_garantia).toBeTruthy();
  });

  it("las ramas en construcción se rechazan con un mensaje que lo explica", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "CI-300-2026", nombre: "Ejecutivo", tipoFuncionario: "EJECUTIVO" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("RAMA_DESHABILITADA");
    expect(res.error.message).toMatch(/construcción/i);
  });

  it("la clave de idempotencia evita dos expedientes desde dos pestañas", () => {
    const h = loadInstalledBackend();
    const datos = {
      identificador: "CI-400-2026",
      nombre: "Doble envío",
      fechaIngreso: "2026-02-02",
      idempotencyKey: "clave-fija-de-prueba",
    };
    const primera = h.ok("documentacion.expediente.crear", { expediente: datos });
    // Otra pestaña, otro solicitudId, la misma clave de creación.
    const segunda = h.ok("documentacion.expediente.crear", { expediente: datos }, { solicitudId: "otro" });
    expect(segunda.creado).toBe(false);
    expect(segunda.repetido).toBe(true);
    expect(segunda.expedienteId).toBe(primera.expedienteId);
    expect(h.rowsOf("Expedientes").length).toBe(1);
  });

  it("una fecha de ingreso ilegible se rechaza con su campo", () => {
    const h = loadInstalledBackend();
    const res = h.pedir("documentacion.expediente.crear", {
      expediente: { identificador: "CI-500-2026", nombre: "Fecha mala", fechaIngreso: "32/13/2026" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.fields.fecha_ingreso).toBeTruthy();
  });

  it("un nombre con fórmula se guarda como texto, no como fórmula", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "CI-600-2026", nombre: '=IMPORTRANGE("otro","A1")', fechaIngreso: "2026-01-01" },
    });
    const fila = h.rowsOf("Expedientes")[0];
    expect(String(fila.nombre).charAt(0)).toBe("'");
  });
});

describe("documentación · edición y progreso", () => {
  it("marcar requisitos actualiza los totales y el porcentaje", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);

    const primero = requisitos[0];
    const res = h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: primero.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO", observaciones: "Recibido en original." },
    });
    expect(res.resumen.total_entregados).toBe(1);
    expect(res.resumen.porcentaje_completitud).toBe(Math.round((1 / 18) * 100));
    expect(res.resumen.estado_expediente).toBe("EN_RECOLECCION");
  });

  it("los no aplica salen del denominador del avance", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const opcional = requisitos.find((r: any) => r.codigo === "rc-iva")!;
    const otro = requisitos.find((r: any) => r.codigo === "carnet-heredero")!;

    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [
        { expedienteDocumentoId: opcional.expedienteDocumentoId, estado: "NO_APLICA" },
        { expedienteDocumentoId: otro.expedienteDocumentoId, estado: "NO_APLICA" },
      ],
    });

    const obligatorios = requisitos.filter((r: any) => r.obligatorio);
    const res = h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: obligatorios.map((r: any) => ({ expedienteDocumentoId: r.expedienteDocumentoId, estado: "ENTREGADO" })),
    });
    expect(res.resumen.total_no_aplica).toBe(2);
    expect(res.resumen.porcentaje_completitud).toBe(100);
    expect(res.resumen.estado_expediente).toBe("COMPLETO");
  });

  it("un requisito obligatorio no admite «no aplica»", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    const obligatorio = requisitos.find((r: any) => r.codigo === "rejap")!;
    const res = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: obligatorio.expedienteDocumentoId,
      cambios: { estado: "NO_APLICA" },
    });
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("REQUISITO_NO_APLICABLE");
    expect(res.error.fields.estado_documental).toBeTruthy();
  });

  it("el guardado por bloque aplica lo válido e informa de lo que falla", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const res = h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: [
        { expedienteDocumentoId: requisitos[0].expedienteDocumentoId, estado: "ENTREGADO" },
        { expedienteDocumentoId: "inexistente", estado: "ENTREGADO" },
        { codigo: "cv", estado: "ENTREGADO" },
      ],
    });
    expect(res.aplicados).toBe(2);
    expect(res.fallidos.length).toBe(1);
    expect(res.fallidos[0].motivo).toMatch(/no existe/i);
  });

  it("un requisito de otro expediente no se puede tocar desde este", () => {
    const h = loadInstalledBackend();
    const a = crearExpediente(h, { identificador: "CI-700-2026" });
    const b = crearExpediente(h, { identificador: "CI-701-2026" });
    const res = h.ok("documentacion.requisitos.guardar", {
      expedienteId: a.expedienteId,
      cambios: [{ expedienteDocumentoId: b.requisitos[0].expedienteDocumentoId, estado: "ENTREGADO" }],
    });
    expect(res.aplicados).toBe(0);
    expect(res.fallidos[0].codigoError).toBe("RELACION_INVALIDA");
  });

  it("cambiar el tipo de garantía recalcula los requisitos sin perder los que tienen datos", () => {
    const h = loadInstalledBackend();
    const creado = crearExpediente(h, {
      identificador: "CI-800-2026",
      tipoFuncionario: "COMERCIAL",
      tipoGarantia: "COMERCIAL_1",
    });
    // `garante-ci` es exclusivo de la rama 1; se le registra una entrega.
    const garanteCi = creado.requisitos.find((r: any) => r.codigo === "garante-ci")!;
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: garanteCi.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });

    // …y se cambia a la rama 3, donde ese requisito ya no aplica.
    const res = h.ok("documentacion.expediente.actualizar", {
      expedienteId: creado.expedienteId,
      cambios: { tipoGarantia: "COMERCIAL_3" },
    });
    expect(res.sincronizacion.creados).toBeGreaterThan(0);
    expect(res.sincronizacion.conservados.length).toBe(1);

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const codigos = detalle.requisitos.map((r: any) => r.codigo);
    expect(codigos).toContain("garante-t3-ci"); // requisito propio de la rama 3
    // El requisito con datos sigue ahí; los que estaban vacíos se archivaron.
    expect(codigos).toContain("garante-ci");
    expect(codigos).not.toContain("garante-t1-fam-ci");
  });

  it("el historial deja una línea legible por cada cambio", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    const historial = h.ok("documentacion.historial.consultar", { expedienteId }).historial;
    const linea = historial.find((x: any) => x.campo === "estado_documental");
    expect(linea).toBeTruthy();
    expect(linea.anterior).toBe("PENDIENTE");
    expect(linea.nuevo).toBe("ENTREGADO");
    expect(linea.texto).toMatch(/de PENDIENTE a ENTREGADO/);
  });

  it("el resumen textual se construye con datos reales y es determinista", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h, { nombre: "Julia Vera", identificador: "CI-900-2026" });
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    const primera = h.ok("documentacion.expediente.obtener", { expedienteId }).resumenTextual;
    const segunda = h.ok("documentacion.expediente.obtener", { expedienteId }).resumenTextual;
    expect(primera).toBe(segunda);
    expect(primera).toContain("Julia Vera");
    expect(primera).toContain("CI-900-2026");
    expect(primera).toMatch(/Avance 6%/);
  });

  it("«siguiente pendiente» prioriza lo observado sobre lo que falta", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    const cv = requisitos.find((r: any) => r.codigo === "cv")!;
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: cv.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: cv.expedienteDocumentoId,
        estado: "OBSERVADO",
        motivo: "FALTAN_DATOS",
        comentario: "Falta la firma en la última página.",
      },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.siguientePendiente.codigo).toBe("cv");
    expect(detalle.siguientePendiente.motivo).toBe("observado");
  });
});

describe("documentación · máquina de estados del expediente", () => {
  it("no se puede aprobar un expediente con requisitos pendientes", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const res = h.pedir("documentacion.expediente.estado", { expedienteId, estado: "APROBADO" });
    expect(res.ok).toBe(false);
    // La transición COMPLETO→APROBADO existe, pero el contenido no la permite.
    expect(["CONFLICTO", "TRANSICION_INVALIDA"]).toContain(res.error.code);
  });

  it("un expediente completo sí se puede aprobar y luego archivar", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: requisitos.map((r: any) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });

    const aprobado = h.ok("documentacion.expediente.estado", { expedienteId, estado: "APROBADO" });
    expect(aprobado.estado).toBe("APROBADO");

    const archivado = h.ok("documentacion.expediente.archivar", { expedienteId });
    expect(archivado.estado).toBe("ARCHIVADO");

    // Y archivado no admite ediciones operativas.
    const intento = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { observaciones: "nota" },
    });
    expect(intento.ok).toBe(false);
    expect(intento.error.message).toMatch(/archivado/i);
  });

  it("restaurar un archivado devuelve el estado que le toca por contenido", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "ENTREGADO" },
    });
    h.ok("documentacion.expediente.archivar", { expedienteId });
    const res = h.ok("documentacion.expediente.restaurar", { expedienteId });
    expect(res.restaurado).toBe(true);
    expect(res.estado).toBe("EN_RECOLECCION");
  });

  it("un estado inexistente se rechaza señalando el campo", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    const res = h.pedir("documentacion.expediente.estado", { expedienteId, estado: "PERFECTO" });
    expect(res.ok).toBe(false);
    expect(res.error.fields.estado_expediente).toBeTruthy();
  });

  it("el estado derivado nunca contradice al contenido", () => {
    const h = loadInstalledBackend();
    const { expedienteId, requisitos } = crearExpediente(h);

    // Todo entregado → COMPLETO.
    h.ok("documentacion.requisitos.guardar", {
      expedienteId,
      cambios: requisitos.map((r: any) => ({
        expedienteDocumentoId: r.expedienteDocumentoId,
        estado: r.obligatorio ? "ENTREGADO" : "NO_APLICA",
      })),
    });
    let detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.expediente.estado).toBe("COMPLETO");

    // Se retira uno → deja de estar completo.
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: requisitos[0].expedienteDocumentoId,
      cambios: { estado: "NO_ENTREGADO" },
    });
    detalle = h.ok("documentacion.expediente.obtener", { expedienteId });
    expect(detalle.expediente.estado).toBe("INCOMPLETO");
    expect(detalle.expediente.porcentaje).toBeLessThan(100);
  });
});

describe("documentación · búsqueda, filtros y paginación", () => {
  it("filtra por texto sin tildes y por estado, agencia y progreso", () => {
    const h = loadInstalledBackend();
    crearExpediente(h, { identificador: "CI-1-2026", nombre: "Iván Muñoz", agencia: "LA PAZ" });
    crearExpediente(h, { identificador: "CI-2-2026", nombre: "Ana Pérez", agencia: "EL ALTO", gerencia: "GERENCIA DE NEGOCIOS" });

    const porTexto = h.ok("documentacion.expedientes.listar", { filtros: { texto: "munoz" } });
    expect(porTexto.total).toBe(1);
    expect(porTexto.expedientes[0].nombre).toBe("Iván Muñoz");

    const porAgencia = h.ok("documentacion.expedientes.listar", { filtros: { agencia: "el alto" } });
    expect(porAgencia.total).toBe(1);

    const conPendientes = h.ok("documentacion.expedientes.listar", { filtros: { conPendientes: true } });
    expect(conPendientes.total).toBe(2);

    const completos = h.ok("documentacion.expedientes.listar", { filtros: { estado: "COMPLETO" } });
    expect(completos.total).toBe(0);
  });

  it("pagina y devuelve el resumen de la página", () => {
    const h = loadInstalledBackend();
    for (let i = 0; i < 7; i++) {
      crearExpediente(h, { identificador: `CI-90${i}-2026`, nombre: `Persona ${i}` });
    }
    const pagina1 = h.ok("documentacion.expedientes.listar", { filtros: { porPagina: 3, pagina: 1 } });
    expect(pagina1.expedientes.length).toBe(3);
    expect(pagina1.total).toBe(7);
    expect(pagina1.paginas).toBe(3);
    expect(pagina1.resumen.expedientes).toBe(3);

    const pagina3 = h.ok("documentacion.expedientes.listar", { filtros: { porPagina: 3, pagina: 3 } });
    expect(pagina3.expedientes.length).toBe(1);
  });

  it("guarda, lista y borra filtros; los compartidos los ven todos", () => {
    const h = loadInstalledBackend();
    const guardado = h.ok("documentacion.filtro.guardar", {
      filtro: { nombre: "Observados de La Paz", definicion: { agencia: "LA PAZ", conObservados: true }, compartido: true },
    });
    const lista = h.ok("documentacion.filtros.listar");
    expect(lista.filtros.length).toBe(1);
    expect(lista.filtros[0].definicion.agencia).toBe("LA PAZ");

    // Guardar con el mismo nombre actualiza en lugar de duplicar.
    h.ok("documentacion.filtro.guardar", { filtro: { nombre: "Observados de La Paz", definicion: { agencia: "EL ALTO" } } });
    expect(h.ok("documentacion.filtros.listar").filtros.length).toBe(1);

    h.ok("documentacion.filtro.eliminar", { filtroId: guardado.filtroId });
    expect(h.ok("documentacion.filtros.listar").filtros.length).toBe(0);
  });
});

describe("documentación · permisos", () => {
  it("un pasante puede ver y comentar, pero no editar", () => {
    const h = loadInstalledBackend();
    const { requisitos } = crearExpediente(h);
    h.ok("documentacion.permisos.guardar", { roles: { "pasante@bdp.com": "pasante" } });

    const comoPasante = { actor: "pasante@bdp.com" };
    const permisos = h.ok("documentacion.permisos.obtener", {}, comoPasante);
    expect(permisos.rol).toBe("pasante");
    expect(permisos.capacidades.ver).toBe(true);
    expect(permisos.capacidades.editar).toBe(false);

    const lectura = h.pedir("documentacion.expedientes.listar", {}, comoPasante);
    expect(lectura.ok).toBe(true);

    const escritura = h.pedir(
      "documentacion.requisito.actualizar",
      { expedienteDocumentoId: requisitos[0].expedienteDocumentoId, cambios: { estado: "ENTREGADO" } },
      comoPasante,
    );
    expect(escritura.ok).toBe(false);
    expect(escritura.error.code).toBe("PERMISO_INSUFICIENTE");
    expect(escritura.error.detalle.rolesPermitidos).toContain("auxiliar");
  });

  it("un analista no puede aprobar ni consultar la auditoría técnica", () => {
    const h = loadInstalledBackend();
    const { expedienteId } = crearExpediente(h);
    h.ok("documentacion.permisos.guardar", { roles: { "analista@bdp.com": "analista" } });
    const comoAnalista = { actor: "analista@bdp.com" };

    const aprobar = h.pedir("documentacion.expediente.estado", { expedienteId, estado: "APROBADO" }, comoAnalista);
    expect(aprobar.error.code).toBe("PERMISO_INSUFICIENTE");

    const auditoria = h.pedir("documentacion.auditoria.consultar", {}, comoAnalista);
    expect(auditoria.error.code).toBe("PERMISO_INSUFICIENTE");
  });

  it("un rol desconocido en el mapa se rechaza al guardar", () => {
    const h = loadInstalledBackend();
    const res = h.ok("documentacion.permisos.guardar", { roles: { "x@bdp.com": "jefazo" } });
    expect(res.rechazados.length).toBe(1);
    expect(res.rechazados[0].motivo).toMatch(/desconocido/i);
  });

  it("nadie puede escalar su rol declarándose otro", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.permisos.guardar", { roles: { "pasante@bdp.com": "pasante" } });
    // El cliente declara rol admin: el backend solo acepta un descenso, nunca un ascenso.
    const res = h.pedir("documentacion.permisos.obtener", {}, { actor: "pasante@bdp.com", rol: "admin" });
    expect(res.data.rol).toBe("pasante");
  });
});
