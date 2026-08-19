import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  construirInforme,
  informeALibro,
  informeAHtml,
  enElMes,
  etiquetaMes,
} from "../export/informeMensual";
import { construirXlsx } from "../export/xlsx";
import type { ExpedienteOperativo } from "../api/acciones";

/**
 * El informe mensual es agregación pura: recibe expedientes con su detalle y
 * devuelve la estructura categoría → persona → documento y los archivos. Se
 * prueba sin navegador construyendo expedientes de mentira y comprobando la
 * forma del resultado y del Excel generado.
 */

function expediente(over: {
  id: string;
  nombre: string;
  tipo: string;
  ingreso: string;
  porcentaje: number;
  docs: { codigo: string; nombre: string; seccion: string; estado: string; obs?: string }[];
}): ExpedienteOperativo {
  return {
    expediente: {
      expedienteId: over.id,
      identificador: over.id,
      nombre: over.nombre,
      cargo: "Analista",
      agencia: "LA PAZ",
      gerencia: "GERENCIA DE NEGOCIOS",
      fechaIngreso: over.ingreso,
      tipoFuncionario: over.tipo,
      tipoGarantia: "NINGUNA",
      estado: "EN_RECOLECCION",
      porcentaje: over.porcentaje,
      totales: {
        requisitos: over.docs.length,
        resueltos: 0,
        entregados: over.docs.filter((d) => d.estado === "ENTREGADO").length,
        pendientes: over.docs.filter((d) => d.estado === "PENDIENTE").length,
        noEntregados: over.docs.filter((d) => d.estado === "NO_ENTREGADO").length,
        noAplica: 0,
        observados: 0,
        prorrogas: 0,
        prorrogasVencidas: 0,
      },
    },
    requisitos: over.docs.map((d, i) => ({
      expedienteDocumentoId: `${over.id}-r${i}`,
      codigo: d.codigo,
      nombre: d.nombre,
      descripcion: "",
      seccion: d.seccion,
      grupo: "",
      orden: i,
      estado: d.estado,
      observaciones: d.obs ?? "",
      obligatorio: true,
      permiteNoAplica: false,
      permiteProrroga: false,
      estadoRevision: "SIN_REVISION",
      revisionActualId: "",
      aprobacionActualId: "",
      requiereRevision: false,
      requiereAprobacion: false,
      version: 1,
      archivado: false,
      prorrogas: [],
      actualizadoEn: "",
      actualizadoPor: "",
    })),
  } as unknown as ExpedienteOperativo;
}

describe("informe mensual · agregación", () => {
  const mes = "2026-08";
  const expedientes = [
    expediente({
      id: "CI-1",
      nombre: "Zoe Comercial",
      tipo: "COMERCIAL",
      ingreso: "2026-08-05",
      porcentaje: 50,
      docs: [{ codigo: "foto-4x4", nombre: "Fotografía", seccion: "generales", estado: "ENTREGADO" }],
    }),
    expediente({
      id: "CI-2",
      nombre: "Ana Comercial",
      tipo: "COMERCIAL",
      ingreso: "2026-08-20",
      porcentaje: 100,
      docs: [{ codigo: "cv", nombre: "CV", seccion: "generales", estado: "PENDIENTE", obs: "Falta firma" }],
    }),
    expediente({
      id: "CI-3",
      nombre: "Beto Auditor",
      tipo: "AUDITORIA",
      ingreso: "2026-08-10",
      porcentaje: 0,
      docs: [{ codigo: "impedimento-auditor", nombre: "Impedimento", seccion: "cumplimiento", estado: "NO_ENTREGADO" }],
    }),
  ];

  it("agrupa por categoría y ordena las personas por nombre", () => {
    const informe = construirInforme(expedientes, mes);
    expect(informe.totalPersonas).toBe(3);
    // Comercial primero (orden institucional), luego auditoría.
    expect(informe.categorias.map((c) => c.codigo)).toEqual(["COMERCIAL", "AUDITORIA"]);
    const comercial = informe.categorias[0];
    expect(comercial.personas.map((p) => p.nombre)).toEqual(["Ana Comercial", "Zoe Comercial"]);
    // Avance promedio de comercial: (100 + 50) / 2 = 75.
    expect(comercial.avancePromedio).toBe(75);
    // Avance global: (50 + 100 + 0) / 3 = 50.
    expect(informe.avancePromedio).toBe(50);
  });

  it("lleva el detalle de cada documento con su estado y observación", () => {
    const informe = construirInforme(expedientes, mes);
    const ana = informe.categorias[0].personas.find((p) => p.nombre === "Ana Comercial")!;
    expect(ana.documentos[0].estadoEtiqueta).toBe("Pendiente");
    expect(ana.documentos[0].observaciones).toBe("Falta firma");
  });

  it("el Excel tiene Resumen, Detalle y Observaciones, y la observación viaja", () => {
    const informe = construirInforme(expedientes, mes);
    const libro = informeALibro(informe);
    expect(Object.keys(libro)).toEqual(["Resumen", "Detalle", "Observaciones"]);
    // Detalle: encabezado + una fila por documento (3 documentos).
    expect(libro.Detalle.length).toBe(1 + 3);
    // Observaciones: encabezado + solo el documento con observación.
    expect(libro.Observaciones.length).toBe(1 + 1);

    // El archivo se genera y se puede volver a abrir.
    const bytes = construirXlsx(libro);
    const zip = unzipSync(bytes);
    expect(Object.keys(zip)).toContain("xl/workbook.xml");
    const sheet2 = strFromU8(zip["xl/worksheets/sheet2.xml"]);
    expect(sheet2).toContain("Falta firma");
  });

  it("el HTML del informe incluye el mes, las personas y los documentos", () => {
    const informe = construirInforme(expedientes, mes);
    const html = informeAHtml(informe);
    expect(html).toContain("Agosto de 2026");
    expect(html).toContain("Zoe Comercial");
    expect(html).toContain("Beto Auditor");
    expect(html).toContain("Impedimento");
  });

  it("un mes sin ingresos produce un informe vacío pero válido", () => {
    const informe = construirInforme([], mes);
    expect(informe.totalPersonas).toBe(0);
    expect(informe.categorias).toEqual([]);
    expect(informeAHtml(informe)).toContain("No hay ingresos");
  });

  it("etiquetaMes y enElMes se comportan como se espera", () => {
    expect(etiquetaMes("2026-01")).toBe("Enero de 2026");
    expect(enElMes("2026-08-15", "2026-08")).toBe(true);
    expect(enElMes("2026-07-31", "2026-08")).toBe(false);
    expect(enElMes(undefined, "2026-08")).toBe(false);
  });
});
