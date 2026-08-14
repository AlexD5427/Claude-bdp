import { describe, it, expect } from "vitest";
import { loadInstalledBackend } from "../../../../scripts/documentacion-backend.mjs";
import {
  ESTADOS_APROBACION,
  ESTADOS_DOCUMENTO,
  ESTADOS_EXPEDIENTE,
  ESTADOS_PRORROGA,
  ESTADOS_REVISION,
  ESTADOS_SOLICITUD,
  ESTADOS_TAREA,
  ETIQUETA_EXPEDIENTE,
  INTENCION_EXPEDIENTE,
  MOTIVOS_REVISION,
  SECCIONES,
  TIPOS_FUNCIONARIO,
  TIPOS_GARANTIA,
  TRANSICIONES_DOCUMENTO,
  TRANSICIONES_REVISION,
  TRANSICIONES_SOLICITUD,
  TRANSICIONES_TAREA,
  puedeTransitar,
  seccionesPermitidas,
} from "../domain/vocabulario";
import {
  agruparRequisitos,
  diasHasta,
  fechaEnDias,
  filtrosActivos,
  filtrosParaBackend,
  hoy,
  porcentajeDe,
  requisitosPendientes,
  resumenDeLista,
  textoPlazo,
  totalesDesdeRequisitos,
  FILTROS_VACIOS,
  type ExpedienteCabecera,
  type RequisitoVista,
} from "../domain/progreso";

/**
 * Coherencia entre el vocabulario del cliente y el del servidor.
 *
 * El módulo mantiene una copia de los estados y las transiciones en el cliente para
 * poder pintar sin preguntar. El precio de esa copia es que se puede separar del
 * servidor, y esta suite es lo que impide que se separe en silencio: carga el
 * backend real y compara.
 */

function requisito(parcial: Partial<RequisitoVista>): RequisitoVista {
  return {
    expedienteDocumentoId: parcial.expedienteDocumentoId ?? "expdoc_1",
    codigo: parcial.codigo ?? "cv",
    nombre: parcial.nombre ?? "Currículum",
    descripcion: "",
    seccion: parcial.seccion ?? "generales",
    grupo: "personal",
    orden: parcial.orden ?? 10,
    estado: parcial.estado ?? "PENDIENTE",
    observaciones: parcial.observaciones ?? "",
    obligatorio: parcial.obligatorio ?? true,
    permiteNoAplica: parcial.permiteNoAplica ?? false,
    permiteProrroga: parcial.permiteProrroga ?? false,
    estadoRevision: parcial.estadoRevision ?? "SIN_REVISION",
    revisionActualId: "",
    aprobacionActualId: "",
    requiereRevision: false,
    requiereAprobacion: false,
    version: 1,
    archivado: parcial.archivado ?? false,
    prorrogas: parcial.prorrogas ?? [],
    actualizadoEn: "",
    actualizadoPor: "",
  };
}

describe("documentación · vocabulario del cliente frente al del backend", () => {
  const h = loadInstalledBackend();
  const vocabulario = h.ok("documentacion.vocabulario");

  it("los estados son exactamente los mismos", () => {
    const del = (mapa: Record<string, string>) => Object.values(mapa).sort();
    expect([...ESTADOS_EXPEDIENTE].sort()).toEqual(del(vocabulario.estados.expediente));
    expect([...ESTADOS_DOCUMENTO].sort()).toEqual(del(vocabulario.estados.documento));
    expect([...ESTADOS_REVISION].sort()).toEqual(del(vocabulario.estados.revision));
    expect([...ESTADOS_SOLICITUD].sort()).toEqual(del(vocabulario.estados.solicitud));
    expect([...ESTADOS_APROBACION].sort()).toEqual(del(vocabulario.estados.aprobacion));
    expect([...ESTADOS_TAREA].sort()).toEqual(del(vocabulario.estados.tarea));
    expect([...ESTADOS_PRORROGA].sort()).toEqual(del(vocabulario.estados.prorroga));
  });

  it("cada estado de expediente tiene etiqueta e intención", () => {
    for (const estado of ESTADOS_EXPEDIENTE) {
      expect(ETIQUETA_EXPEDIENTE[estado], `falta etiqueta de ${estado}`).toBeTruthy();
      expect(INTENCION_EXPEDIENTE[estado], `falta intención de ${estado}`).toBeTruthy();
    }
  });

  it("las transiciones copiadas coinciden con las del backend", () => {
    expect(TRANSICIONES_DOCUMENTO).toEqual(vocabulario.transiciones.documento);
    expect(TRANSICIONES_REVISION).toEqual(vocabulario.transiciones.revision);
    expect(TRANSICIONES_SOLICITUD).toEqual(vocabulario.transiciones.solicitud);
    expect(TRANSICIONES_TAREA).toEqual(vocabulario.transiciones.tarea);
  });

  it("los tipos de funcionario y de garantía coinciden, incluida su actividad", () => {
    expect(TIPOS_FUNCIONARIO.map((t) => ({ codigo: t.codigo, activo: t.activo }))).toEqual(
      vocabulario.tiposFuncionario.map((t: { codigo: string; activo: boolean }) => ({ codigo: t.codigo, activo: t.activo })),
    );
    expect(TIPOS_GARANTIA.map((t) => t.codigo)).toEqual(vocabulario.tiposGarantia.map((t: { codigo: string }) => t.codigo));
  });

  it("los motivos de revisión son los mismos y son diez", () => {
    expect(MOTIVOS_REVISION.map((m) => m.codigo)).toEqual(vocabulario.motivosRevision.map((m: { codigo: string }) => m.codigo));
    expect(MOTIVOS_REVISION.length).toBe(10);
  });

  it("las capacidades del menú existen en la matriz de permisos del backend", () => {
    const capacidades = new Set<string>(Object.values(vocabulario.capacidades as Record<string, string>));
    for (const seccion of SECCIONES) {
      expect(capacidades.has(seccion.capacidad), `la capacidad ${seccion.capacidad} no existe en el backend`).toBe(true);
    }
  });
});

describe("documentación · transiciones en el cliente", () => {
  it("no ofrece un cambio que el backend va a rechazar", () => {
    expect(puedeTransitar(TRANSICIONES_REVISION, "APROBADO", "RECHAZADO")).toBe(false);
    expect(puedeTransitar(TRANSICIONES_REVISION, "SIN_REVISION", "APROBADO")).toBe(true);
    expect(puedeTransitar(TRANSICIONES_TAREA, "COMPLETADA", "EN_PROGRESO")).toBe(false);
  });

  it("quedarse en el mismo estado siempre se admite", () => {
    expect(puedeTransitar(TRANSICIONES_DOCUMENTO, "ENTREGADO", "ENTREGADO")).toBe(true);
  });
});

describe("documentación · secciones según el rol", () => {
  it("un rol de solo lectura no ve exportaciones ni auditoría", () => {
    const secciones = seccionesPermitidas({ ver: true }).map((s) => s.id);
    expect(secciones).toContain("panel");
    expect(secciones).toContain("expedientes");
    expect(secciones).not.toContain("exportaciones");
    expect(secciones).not.toContain("auditoria");
  });

  it("con todas las capacidades se ven las trece secciones", () => {
    const todas = Object.fromEntries(SECCIONES.map((s) => [s.capacidad, true]));
    expect(seccionesPermitidas(todas).length).toBe(SECCIONES.length);
  });
});

describe("documentación · progreso", () => {
  it("los no aplica salen del denominador", () => {
    const totales = totalesDesdeRequisitos([
      requisito({ expedienteDocumentoId: "a", estado: "ENTREGADO" }),
      requisito({ expedienteDocumentoId: "b", estado: "ENTREGADO" }),
      requisito({ expedienteDocumentoId: "c", estado: "NO_APLICA" }),
    ]);
    expect(totales.requisitos).toBe(3);
    expect(totales.noAplica).toBe(1);
    expect(porcentajeDe(totales)).toBe(100);
  });

  it("un expediente sin nada entregado va al 0 %", () => {
    const totales = totalesDesdeRequisitos([requisito({ expedienteDocumentoId: "a" }), requisito({ expedienteDocumentoId: "b" })]);
    expect(porcentajeDe(totales)).toBe(0);
    expect(totales.pendientes).toBe(2);
  });

  it("los requisitos archivados no cuentan", () => {
    const totales = totalesDesdeRequisitos([
      requisito({ expedienteDocumentoId: "a", estado: "ENTREGADO" }),
      requisito({ expedienteDocumentoId: "b", estado: "PENDIENTE", archivado: true }),
    ]);
    expect(totales.requisitos).toBe(1);
    expect(porcentajeDe(totales)).toBe(100);
  });

  it("las observaciones se cuentan desde el estado de revisión", () => {
    const totales = totalesDesdeRequisitos([
      requisito({ expedienteDocumentoId: "a", estado: "ENTREGADO", estadoRevision: "OBSERVADO" }),
      requisito({ expedienteDocumentoId: "b", estado: "ENTREGADO", estadoRevision: "APROBADO" }),
    ]);
    expect(totales.observados).toBe(1);
  });

  it("agrupa por sección en el orden funcional y calcula el avance de cada grupo", () => {
    const grupos = agruparRequisitos([
      requisito({ expedienteDocumentoId: "g1", seccion: "garantia", orden: 20, estado: "PENDIENTE" }),
      requisito({ expedienteDocumentoId: "a1", seccion: "generales", orden: 10, estado: "ENTREGADO" }),
      requisito({ expedienteDocumentoId: "a2", seccion: "generales", orden: 20, estado: "ENTREGADO" }),
    ]);
    expect(grupos.map((g) => g.seccion)).toEqual(["generales", "garantia"]);
    expect(grupos[0].porcentaje).toBe(100);
    expect(grupos[1].porcentaje).toBe(0);
  });

  it("lo observado va antes de lo pendiente en la lista de trabajo", () => {
    const pendientes = requisitosPendientes([
      requisito({ expedienteDocumentoId: "pendiente", estado: "PENDIENTE" }),
      requisito({ expedienteDocumentoId: "observado", estado: "ENTREGADO", estadoRevision: "OBSERVADO" }),
    ]);
    expect(pendientes[0].expedienteDocumentoId).toBe("observado");
    expect(pendientes[1].expedienteDocumentoId).toBe("pendiente");
  });
});

describe("documentación · fechas y plazos", () => {
  it("los días se cuentan desde hoy y el pasado sale negativo", () => {
    expect(diasHasta(hoy())).toBe(0);
    expect(diasHasta(fechaEnDias(5))).toBe(5);
    expect(diasHasta(fechaEnDias(-3))).toBe(-3);
    expect(diasHasta("")).toBeNull();
  });

  it("el plazo se dice en lenguaje llano", () => {
    expect(textoPlazo(hoy())).toBe("Vence hoy");
    expect(textoPlazo(fechaEnDias(1))).toBe("Vence mañana");
    expect(textoPlazo(fechaEnDias(4))).toBe("Vence en 4 días");
    expect(textoPlazo(fechaEnDias(-1))).toBe("Venció ayer");
    expect(textoPlazo(fechaEnDias(-9))).toBe("Venció hace 9 días");
    expect(textoPlazo(null)).toBe("Sin plazo");
  });
});

describe("documentación · filtros", () => {
  it("los filtros vacíos no viajan al backend", () => {
    const salida = filtrosParaBackend({ ...FILTROS_VACIOS, agencia: "LA PAZ", conObservados: true });
    expect(salida).toEqual({ agencia: "LA PAZ", conObservados: true, orden: "reciente", direccion: "desc", pagina: 1, porPagina: 25 });
    expect("estado" in salida).toBe(false);
  });

  it("el contador ignora el orden y la paginación", () => {
    expect(filtrosActivos({ ...FILTROS_VACIOS })).toBe(0);
    expect(filtrosActivos({ ...FILTROS_VACIOS, texto: "ana", conObservados: true })).toBe(2);
  });
});

describe("documentación · resumen de la lista", () => {
  function cabecera(porcentaje: number, observados = 0, prorrogasVencidas = 0): ExpedienteCabecera {
    return {
      expedienteId: `exp_${porcentaje}_${observados}_${prorrogasVencidas}`,
      identificador: "CI-1-2026",
      nombre: "Persona",
      cargo: "",
      agencia: "",
      gerencia: "",
      fechaIngreso: "",
      diasDesdeIngreso: null,
      tipoFuncionario: "GENERAL",
      tipoFuncionarioEtiqueta: "General",
      tipoGarantia: "NINGUNA",
      tipoGarantiaEtiqueta: "Sin garantía",
      responsableId: "",
      estado: "EN_RECOLECCION",
      porcentaje,
      totales: {
        requisitos: 18,
        resueltos: 0,
        entregados: 0,
        pendientes: 0,
        noEntregados: 0,
        noAplica: 0,
        observados,
        prorrogas: 0,
        prorrogasVencidas,
      },
      proximaFechaCritica: "",
      diasParaFechaCritica: null,
      version: 1,
      estadoOperacion: "ACTIVO",
      creadoEn: "",
      creadoPor: "",
      actualizadoEn: "",
      actualizadoPor: "",
      anio: 2026,
    };
  }

  it("dice cuántos hay, el avance y qué está en riesgo", () => {
    const texto = resumenDeLista([cabecera(100), cabecera(50, 2), cabecera(0, 0, 1)]);
    expect(texto).toContain("3 expedientes");
    expect(texto).toContain("avance promedio 50%");
    expect(texto).toContain("1 completo");
    expect(texto).toContain("1 con observaciones");
    expect(texto).toContain("1 con prórrogas vencidas");
  });

  it("con la lista vacía lo dice sin inventar cifras", () => {
    expect(resumenDeLista([])).toMatch(/Sin expedientes/);
  });
});
