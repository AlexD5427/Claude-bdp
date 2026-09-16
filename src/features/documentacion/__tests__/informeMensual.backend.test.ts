import { beforeAll, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { construirInforme, informeALibro, informeAHtml, etiquetaMes } from "../export/informeMensual";
import { construirXlsx } from "../export/xlsx";
import { docApi, type ExpedienteOperativo } from "../api/acciones";
import { configurarCliente, __reiniciarClienteParaPruebas } from "../api/client";
import { crearExpediente, loadInstalledBackend, type DocHarness } from "../../../../scripts/documentacion-backend.mjs";

/**
 * El informe mensual, contra el backend de verdad.
 *
 * La otra prueba (`informeMensual.test.ts`) comprueba la agregación con
 * expedientes inventados. Esta recorre el camino completo que hace la pantalla:
 * consulta al backend con el MISMO filtro por rango de fecha de ingreso, lee el
 * detalle de cada expediente y arma el informe. Es lo que permite afirmar que el
 * filtro del mes existe en el backend y que hace lo que la pantalla espera —el tipo
 * de detalle que una prueba con dobles no puede ver.
 */

const URL_PRUEBAS = "https://script.google.com/macros/s/pruebas/exec";
const MES = "2026-05";

function enchufar(harness: DocHarness) {
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    const salida = harness.call<{ getContent(): string }>("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    return { ok: true, status: 200, text: async () => salida.getContent() } as unknown as Response;
  });
}

/** Repite el camino de la pantalla: listar el mes, leer cada expediente, agregar. */
async function informeDelMes(mes: string) {
  const [anio, m] = mes.split("-").map((n) => parseInt(n, 10));
  const ultimo = new Date(anio, m, 0).getDate();
  const lista = await docApi.listarExpedientes({
    ingresoDesde: `${mes}-01`,
    ingresoHasta: `${mes}-${String(ultimo).padStart(2, "0")}`,
    incluirArchivados: true,
    porPagina: 200,
    orden: "reciente",
  });
  const detalles: ExpedienteOperativo[] = [];
  for (const cabecera of lista.expedientes) {
    detalles.push(await docApi.obtenerExpediente(cabecera.expedienteId));
  }
  return { informe: construirInforme(detalles, mes), encontrados: lista.expedientes.length };
}

describe("informe mensual · camino completo contra el backend", () => {
  let harness: DocHarness;

  beforeAll(() => {
    __reiniciarClienteParaPruebas();
    harness = loadInstalledBackend();
    enchufar(harness);
    configurarCliente({ url: URL_PRUEBAS });

    // Tres ingresos DENTRO del mes, de dos categorías distintas…
    const comercial = crearExpediente(harness, {
      identificador: `1111111 - 1 - ${MES.slice(0, 4)}`,
      nombre: "Zoe Comercial",
      cargo: "Oficial de Negocios",
      agencia: "LA PAZ",
      gerencia: "GERENCIA COMERCIAL",
      fechaIngreso: `${MES}-04`,
      tipoFuncionario: "COMERCIAL",
      tipoGarantia: "COMERCIAL_1",
    });
    crearExpediente(harness, {
      identificador: `2222222 - 2 - ${MES.slice(0, 4)}`,
      nombre: "Ana Comercial",
      cargo: "Cajera",
      agencia: "EL ALTO",
      gerencia: "GERENCIA COMERCIAL",
      fechaIngreso: `${MES}-28`,
      tipoFuncionario: "COMERCIAL",
      tipoGarantia: "COMERCIAL_2",
    });
    crearExpediente(harness, {
      identificador: `3333333 - 3 - ${MES.slice(0, 4)}`,
      nombre: "Beto Auditor",
      cargo: "Auditor Interno",
      agencia: "SANTA CRUZ",
      gerencia: "GERENCIA DE AUDITORÍA",
      fechaIngreso: `${MES}-15`,
      tipoFuncionario: "AUDITORIA",
      tipoGarantia: "NINGUNA",
    });
    // …y dos FUERA, uno el último día del mes anterior y otro el primero del siguiente.
    crearExpediente(harness, {
      identificador: `4444444 - 4 - ${MES.slice(0, 4)}`,
      nombre: "Fuera Antes",
      cargo: "Analista",
      agencia: "LA PAZ",
      gerencia: "GERENCIA DE RIESGOS",
      fechaIngreso: "2026-04-30",
      tipoFuncionario: "GENERAL",
      tipoGarantia: "NINGUNA",
    });
    crearExpediente(harness, {
      identificador: `5555555 - 5 - ${MES.slice(0, 4)}`,
      nombre: "Fuera Después",
      cargo: "Analista",
      agencia: "LA PAZ",
      gerencia: "GERENCIA DE RIESGOS",
      fechaIngreso: "2026-06-01",
      tipoFuncionario: "GENERAL",
      tipoGarantia: "NINGUNA",
    });

    // Marcas reales: una entrega y una observación, para que el informe tenga materia.
    const foto = comercial.requisitos.find((r: { codigo: string }) => r.codigo === "foto-4x4")!;
    /* Y un documento físico con sus hojas contadas, más otro entregado SIN
       contarlas: el informe tiene que poder distinguir «no lleva conteo» de
       «lleva conteo y falta hacerlo», que es lo que decide si alguien tiene que
       ir al archivador. */
    const conConteo = comercial.requisitos.filter((r: { requiereConteoHojas?: boolean }) => r.requiereConteoHojas);
    harness.ok("documentacion.requisitos.guardar", {
      expedienteId: comercial.expedienteId,
      cambios: [
        { expedienteDocumentoId: foto.expedienteDocumentoId, estado: "ENTREGADO", observaciones: "Recibida en físico y digital." },
        { expedienteDocumentoId: conConteo[0].expedienteDocumentoId, estado: "ENTREGADO", hojasFisicas: 9 },
        { expedienteDocumentoId: conConteo[1].expedienteDocumentoId, estado: "ENTREGADO" },
      ],
    });
  });

  it("el filtro por rango de ingreso deja fuera los meses vecinos", async () => {
    const { informe, encontrados } = await informeDelMes(MES);
    expect(encontrados).toBe(3);
    expect(informe.totalPersonas).toBe(3);
    const nombres = informe.categorias.flatMap((c) => c.personas.map((p) => p.nombre));
    expect(nombres).not.toContain("Fuera Antes");
    expect(nombres).not.toContain("Fuera Después");
  });

  it("agrupa por categoría y ordena las personas por nombre", async () => {
    const { informe } = await informeDelMes(MES);
    expect(informe.categorias.map((c) => c.codigo)).toEqual(["COMERCIAL", "AUDITORIA"]);
    expect(informe.categorias[0].personas.map((p) => p.nombre)).toEqual(["Ana Comercial", "Zoe Comercial"]);
    expect(informe.categorias[1].personas[0].nombre).toBe("Beto Auditor");
  });

  it("cada persona llega con los documentos de SU rama, no de las otras", async () => {
    const { informe } = await informeDelMes(MES);
    const comercial = informe.categorias[0];
    const zoe = comercial.personas.find((p) => p.nombre === "Zoe Comercial")!;
    const ana = comercial.personas.find((p) => p.nombre === "Ana Comercial")!;
    const auditor = informe.categorias[1].personas[0];

    /* Recuentos del catálogo v4: 20 generales + los de cada rama.
       Tipo 1: 25 · Tipo 2: 29 · Auditoría: 21. */
    expect(zoe.documentos.length).toBe(25);
    expect(ana.documentos.length).toBe(29);
    expect(auditor.documentos.length).toBe(21);

    const codigosZoe = zoe.documentos.map((d) => d.codigo);
    expect(codigosZoe).toContain("garante-t1-fam-ci");
    expect(codigosZoe).not.toContain("garante-fam2-ci"); // ese es del tipo 2
    const codigosAuditor = auditor.documentos.map((d) => d.codigo);
    expect(codigosAuditor).toContain("impedimento-auditor");
    expect(codigosAuditor).not.toContain("lgi-ft"); // eso es de cumplimiento
  });

  it("la entrega y la observación registradas viajan hasta el Excel", async () => {
    const { informe } = await informeDelMes(MES);
    const zoe = informe.categorias[0].personas.find((p) => p.nombre === "Zoe Comercial")!;
    const foto = zoe.documentos.find((d) => d.codigo === "foto-4x4")!;
    expect(foto.estadoEtiqueta).toBe("Entregado");
    expect(foto.observaciones).toBe("Recibida en físico y digital.");

    const libro = informeALibro(informe);
    expect(Object.keys(libro)).toEqual(["Resumen", "Detalle", "Observaciones"]);
    // Detalle: encabezado + 25 + 29 + 21 documentos.
    expect(libro.Detalle.length).toBe(1 + 25 + 29 + 21);
    const zip = unzipSync(construirXlsx(libro));
    expect(strFromU8(zip["xl/worksheets/sheet3.xml"])).toContain("Recibida en f");
  });

  it("las hojas físicas y la subsección llegan al Excel y al HTML", async () => {
    const { informe } = await informeDelMes(MES);
    const zoe = informe.categorias[0].personas.find((p) => p.nombre === "Zoe Comercial")!;
    expect(zoe.hojasFisicas).toBe(9);
    // El segundo documento con conteo se entregó sin contarlo: eso se avisa.
    expect(zoe.hojasSinContar).toBe(1);

    // Un documento solo digital llega con `null`, no con cero.
    const foto = zoe.documentos.find((d) => d.codigo === "foto-4x4")!;
    expect(foto.hojasFisicas).toBeNull();

    // La rama de garantía trae subsecciones y llegan hasta el detalle.
    expect(zoe.documentos.some((d) => d.subseccion.length > 0)).toBe(true);

    const libro = informeALibro(informe);
    const cabecera = libro.Detalle[0].map(String);
    expect(cabecera).toContain("Subsección");
    expect(cabecera).toContain("Hojas físicas");
    const iHojas = cabecera.indexOf("Hojas físicas");
    const iCodigo = cabecera.indexOf("Documento");
    expect(iCodigo).toBeGreaterThanOrEqual(0);
    // La celda del documento contado trae el número; la del digital, vacío.
    const celdas = libro.Detalle.slice(1).map((f) => f[iHojas]);
    expect(celdas).toContain(9);
    expect(celdas).toContain("");

    const html = informeAHtml(informe);
    expect(html).toContain("sin contar");
    expect(html).toContain("hoja(s) física(s)");
  });

  it("el HTML del informe nombra el mes, las categorías y las personas", async () => {
    const { informe } = await informeDelMes(MES);
    const html = informeAHtml(informe);
    expect(html).toContain(etiquetaMes(MES));
    expect(html).toContain("Zoe Comercial");
    expect(html).toContain("Beto Auditor");
    expect(html).toContain("Funcionario área comercial");
    expect(html).toContain("Funcionario área auditoría");
  });

  it("un mes sin ingresos produce un informe vacío pero descargable", async () => {
    const { informe } = await informeDelMes("2026-02");
    expect(informe.totalPersonas).toBe(0);
    expect(informe.categorias).toEqual([]);
    const libro = informeALibro(informe);
    // Solo los encabezados: el archivo existe y se abre.
    expect(libro.Detalle.length).toBe(1);
    expect(() => construirXlsx(libro)).not.toThrow();
  });
});
