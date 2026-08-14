import { describe, it, expect } from "vitest";
import {
  GS_FILES,
  listUndeclaredGsFiles,
  loadBackend,
  loadInstalledBackend,
} from "../../../../scripts/documentacion-backend.mjs";

/**
 * Instalación, estructura y catálogo único.
 *
 * Estas pruebas fijan las propiedades que hacen que el módulo se pueda instalar en
 * el libro de trabajo de alguien sin miedo: instalar es idempotente, no borra
 * nada, y el catálogo que alimenta el formulario es el MISMO que alimenta los
 * reportes.
 */

describe("documentación · instalación y estructura", () => {
  it("todos los archivos .gs están declarados en el arnés", () => {
    // Si alguien añade un archivo al backend y no lo declara, Apps Script lo
    // cargaría en orden alfabético y estas pruebas no lo verían. Falla aquí.
    expect(listUndeclaredGsFiles()).toEqual([]);
    expect(GS_FILES).toContain("21_Api.gs");
  });

  it("el estado responde antes de instalar y dice que no está instalado", () => {
    const h = loadBackend();
    const res = h.pedir("documentacion.estado");
    expect(res.ok).toBe(true);
    expect(res.data.instalado).toBe(false);
    expect(res.data.esquema).toBe(4);
    // El contrato nuevo y el histórico viajan juntos.
    expect(res.meta.requestId).toBeTruthy();
    expect(res.meta.timestamp).toBeTruthy();
    expect(res.meta.traza).toBeTruthy();
    expect(res.datos).toEqual(res.data);
  });

  it("instalar crea las 19 hojas normalizadas más Auxiliar", () => {
    const h = loadBackend();
    const res = h.pedir("documentacion.instalar", { conRespaldo: false });
    expect(res.ok).toBe(true);

    const esperadas = h.read<string[]>("DOC2_SHEET_ORDER");
    expect(esperadas.length).toBe(19);
    for (const nombre of esperadas) {
      expect(h.spreadsheet.getSheetByName(nombre), `falta la hoja ${nombre}`).not.toBeNull();
    }
    expect(h.spreadsheet.getSheetByName("Auxiliar")).not.toBeNull();
  });

  it("instalar dos veces no duplica hojas, catálogo ni configuración", () => {
    const h = loadBackend();
    h.pedir("documentacion.instalar", { conRespaldo: false });
    const catalogo1 = h.rowsOf("CatalogoDocumentos").length;
    const config1 = h.rowsOf("ConfiguracionDocumentacion").length;
    const hojas1 = h.spreadsheet.getSheets().length;

    const segunda = h.pedir("documentacion.instalar", { conRespaldo: false });
    expect(segunda.ok).toBe(true);
    expect(h.rowsOf("CatalogoDocumentos").length).toBe(catalogo1);
    expect(h.rowsOf("ConfiguracionDocumentacion").length).toBe(config1);
    expect(h.spreadsheet.getSheets().length).toBe(hojas1);
  });

  it("reparar añade una columna que falte sin tocar los datos existentes", () => {
    const h = loadInstalledBackend();
    // Se simula un libro antiguo: se borra la última columna de Expedientes
    // escribiendo su cabecera en blanco, como haría alguien al limpiar la hoja.
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const ancho = hoja.getLastColumn();
    const cabecera = hoja.getRange(1, 1, 1, ancho).getValues()[0];
    const perdida = String(cabecera[ancho - 1]);
    hoja.getRange(1, ancho, 1, 1).setValue("");

    const diagnostico = h.pedir("documentacion.diagnostico");
    expect(diagnostico.ok).toBe(true);
    const codigos = diagnostico.data.hallazgos.map((x: any) => x.codigo);
    expect(codigos).toContain("columnas-faltantes");

    const reparacion = h.pedir("documentacion.reparar", {});
    expect(reparacion.ok).toBe(true);
    const nuevaCabecera = h.spreadsheet
      .getSheetByName("Expedientes")!
      .getRange(1, 1, 1, ancho + 1)
      .getValues()[0]
      .map(String);
    expect(nuevaCabecera).toContain(perdida);
  });

  it("una columna añadida a mano se conserva al reparar", () => {
    const h = loadInstalledBackend();
    const hoja = h.spreadsheet.getSheetByName("Expedientes")!;
    const ancho = hoja.getLastColumn();
    hoja.getRange(1, ancho + 1, 1, 1).setValue("NOTA DEL AREA");

    h.pedir("documentacion.reparar", {});
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues().flat().map(String);
    expect(cabecera).toContain("NOTA DEL AREA");
  });
});

describe("documentación · catálogo único y aplicabilidad", () => {
  it("el catálogo trae los 18 documentos generales en su orden funcional", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const generales = catalogo.documentos.filter((d: any) => d.seccion === "generales");
    expect(generales.length).toBe(18);
    // El orden es el de la implementación anterior: la fotografía primero y el
    // carnet de heredero al final.
    expect(generales[0].codigo).toBe("foto-4x4");
    expect(generales[generales.length - 1].codigo).toBe("carnet-heredero");
    expect(catalogo.documentos.length).toBe(31);
  });

  it("solo certificados de trabajo, título y examen UIF admiten prórroga", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const conProrroga = catalogo.documentos
      .filter((d: any) => d.permiteProrroga)
      .map((d: any) => d.codigo)
      .sort();
    expect(conProrroga).toEqual(["cert-trabajo", "examen-uif", "titulo-legalizado"]);
  });

  it("cada rama comercial exige sus propios documentos de garantía", () => {
    const h = loadInstalledBackend();
    const mapa = h.ok("documentacion.catalogo").aplicabilidad;
    const porClave = (funcionario: string, garantia: string) =>
      mapa.find((m: any) => m.tipoFuncionario === funcionario && m.tipoGarantia === garantia);

    const general = porClave("GENERAL", "NINGUNA");
    expect(general.total).toBe(18);

    const tipo1 = porClave("COMERCIAL", "COMERCIAL_1");
    expect(tipo1.codigos).toContain("garante-inmueble");
    expect(tipo1.codigos).toContain("garante-folio");
    expect(tipo1.codigos).not.toContain("garante-fam1-ci");

    const tipo2 = porClave("COMERCIAL", "COMERCIAL_2");
    expect(tipo2.codigos).toContain("garante-boletas");
    expect(tipo2.codigos).not.toContain("garante-inmueble");

    const tipo3 = porClave("COMERCIAL", "COMERCIAL_3");
    expect(tipo3.codigos).toContain("garante-fam1-ci");
    expect(tipo3.codigos).toContain("garante-fam2-croquis");
    expect(tipo3.codigos).not.toContain("garante-inmueble");

    const auditoria = porClave("AUDITORIA", "NINGUNA");
    expect(auditoria.codigos).toContain("impedimento-auditor");
    expect(auditoria.codigos).toContain("lgi-ft");

    const cumplimiento = porClave("CUMPLIMIENTO", "NINGUNA");
    expect(cumplimiento.codigos).toContain("examen-uif");
    expect(cumplimiento.codigos).not.toContain("impedimento-auditor");
  });

  it("las ramas Ejecutivo y Directorio están visibles pero deshabilitadas", () => {
    const h = loadInstalledBackend();
    const vocabulario = h.ok("documentacion.vocabulario");
    const ejecutivo = vocabulario.tiposFuncionario.find((t: any) => t.codigo === "EJECUTIVO");
    const directorio = vocabulario.tiposFuncionario.find((t: any) => t.codigo === "DIRECTORIO");
    expect(ejecutivo.activo).toBe(false);
    expect(directorio.activo).toBe(false);
    expect(ejecutivo.descripcion).toMatch(/construcción/i);

    const mapa = h.ok("documentacion.catalogo").aplicabilidad;
    expect(mapa.find((m: any) => m.tipoFuncionario === "EJECUTIVO").habilitada).toBe(false);
  });

  it("editar el catálogo cambia lo que pide el formulario y refleja el espejo heredado", () => {
    const h = loadInstalledBackend();
    const guardado = h.pedir("documentacion.catalogo.guardar", {
      catalogo: [{ codigo: "rc-iva", nombre_visible: "RC-IVA (110/610) actualizado", activo: false }],
    });
    expect(guardado.ok).toBe(true);

    const catalogo = h.ok("documentacion.catalogo");
    const rcIva = catalogo.documentos.find((d: any) => d.codigo === "rc-iva");
    expect(rcIva.nombre).toBe("RC-IVA (110/610) actualizado");
    expect(rcIva.activo).toBe(false);

    // Desactivado deja de ser aplicable: 17 generales en lugar de 18.
    const general = catalogo.aplicabilidad.find(
      (m: any) => m.tipoFuncionario === "GENERAL" && m.tipoGarantia === "NINGUNA",
    );
    expect(general.total).toBe(17);

    // Y el espejo heredado `_CATALOGO` sigue existiendo para las acciones viejas.
    const espejo = h.rowsOf("_CATALOGO");
    expect(espejo.find((f) => f.id === "rc-iva")!.etiqueta).toBe("RC-IVA (110/610) actualizado");
  });
});

describe("documentación · catálogos auxiliares", () => {
  it("la hoja Auxiliar guarda agencia_bdp y gerencia_bdp por columna", () => {
    const h = loadInstalledBackend();
    const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    expect(cabecera).toContain("agencia_bdp");
    expect(cabecera).toContain("gerencia_bdp");

    const auxiliares = h.ok("documentacion.auxiliares").auxiliares;
    expect(auxiliares.gerencia_bdp.length).toBeGreaterThan(0);
  });

  it("agregar valores nunca borra los existentes y deduplica por clave", () => {
    const h = loadInstalledBackend();
    const antes = h.ok("documentacion.auxiliares").auxiliares.agencia_bdp;

    h.pedir("documentacion.auxiliares.agregar", {
      columna: "agencia_bdp",
      valores: ["Cochabamba", "  cochabamba  ", "COCHABAMBA"],
    });
    const despues = h.ok("documentacion.auxiliares").auxiliares.agencia_bdp;

    for (const valor of antes) expect(despues).toContain(valor);
    const cochabambas = despues.filter((v: string) => v.toUpperCase().trim() === "COCHABAMBA");
    expect(cochabambas.length).toBe(1);
  });

  it("registrar un expediente aprende su agencia y su gerencia", () => {
    const h = loadInstalledBackend();
    h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "CI-9001-2026",
        nombre: "Sonia Aruquipa",
        agencia: "TARIJA CENTRO",
        gerencia: "GERENCIA DE NEGOCIOS",
        fechaIngreso: "2026-03-01",
      },
    });
    const auxiliares = h.ok("documentacion.auxiliares").auxiliares;
    expect(auxiliares.agencia_bdp).toContain("TARIJA CENTRO");
  });

  it("el diagnóstico avisa de valores con espacios invisibles sin corregirlos", () => {
    const h = loadInstalledBackend();
    const hoja = h.spreadsheet.getSheetByName("Auxiliar")!;
    const cabecera = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
    const columna = cabecera.indexOf("agencia_bdp") + 1;
    const fila = hoja.getLastRow() + 1;
    hoja.getRange(fila, columna, 1, 1).setValue("LA  PAZ ");

    const revision = h.ok("documentacion.auxiliares").revision;
    expect(revision.sospechosos.length).toBeGreaterThan(0);
    // Y el valor sigue tal cual: el diagnóstico informa, no reescribe.
    expect(String(hoja.getRange(fila, columna, 1, 1).getValue())).toBe("LA  PAZ ");
  });
});
