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
    expect(res.data.esquema).toBe(6);
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
  it("el catálogo trae los 20 documentos generales vigentes en su orden", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const generales = catalogo.documentos.filter((d: any) => d.seccion === "generales");
    const vigentes = generales.filter((d: any) => d.activo);
    // 20 vigentes + los 2 retirados, que siguen en el catálogo para que los
    // expedientes antiguos puedan mostrar su nombre.
    expect(vigentes.length).toBe(20);
    expect(generales.length).toBe(22);
    // El orden es el de la lista del área: la fotografía primero y el hueco de
    // «Otros» al final de los vigentes.
    expect(vigentes[0].codigo).toBe("foto-4x4");
    expect(vigentes[vigentes.length - 1].codigo).toBe("otros-documento");
    expect(catalogo.documentos.length).toBe(43);

    const retirados = generales.filter((d: any) => d.retirado);
    expect(retirados.map((d: any) => d.codigo).sort()).toEqual(["cert-trabajo", "rc-iva"]);
    expect(retirados.every((d: any) => d.activo === false)).toBe(true);
  });

  it("solo el título académico y el examen UIF admiten prórroga", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const conProrroga = catalogo.documentos
      .filter((d: any) => d.permiteProrroga && d.activo)
      .map((d: any) => d.codigo)
      .sort();
    expect(conProrroga).toEqual(["examen-uif", "titulo-legalizado"]);
  });

  it("el catálogo declara cómo se presenta cada requisito y cuáles cuentan hojas", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const porCodigo = new Map<string, any>(catalogo.documentos.map((d: any) => [d.codigo, d]));

    // La fotografía es solo digital y no cuenta hojas.
    expect(porCodigo.get("foto-4x4").presentacionFisica).toBe("NO");
    expect(porCodigo.get("foto-4x4").presentacionDigital).toBe("SI");
    expect(porCodigo.get("foto-4x4").requiereConteoHojas).toBe(false);

    // El asterisco de la lista del área es un dato, no un texto suelto.
    expect(porCodigo.get("antecedentes-felcc").presentacionFisica).toBe("CONDICIONAL");
    expect(porCodigo.get("rejap").presentacionFisica).toBe("CONDICIONAL");

    // Físicos con contador.
    for (const codigo of [
      "titulo-legalizado",
      "seguro-vida",
      "examen-uif",
      "manual-funciones",
      "memorandum-designacion",
      "comunicacion-interna",
    ]) {
      expect(porCodigo.get(codigo).presentacionFisica).not.toBe("NO");
      expect(porCodigo.get(codigo).requiereConteoHojas).toBe(true);
    }

    /* El seguro de accidentes pasó a solo digital: no llega papel al legajo, así
       que su contador desaparece. Es el cambio que hace falta comprobar al
       revés, porque un contador que reaparece produce ceros que se leen como
       «cero hojas». */
    expect(porCodigo.get("seguro-accidentes").presentacionFisica).toBe("NO");
    expect(porCodigo.get("seguro-accidentes").presentacionDigital).toBe("SI");
    expect(porCodigo.get("seguro-accidentes").requiereConteoHojas).toBe(false);

    /* El folio real del bien inmueble es el ÚNICO documento de garantía que se
       archiva en papel, y el cambio es global: la misma fila del catálogo aplica
       a Tipo 1 y a Tipo 3. */
    const folio = porCodigo.get("garante-folio");
    expect(folio.presentacionFisica).toBe("SI");
    expect(folio.presentacionDigital).toBe("SI");
    expect(folio.requiereConteoHojas).toBe(true);
    expect(folio.nombre).toContain("Folio real del bien inmueble");
    expect(folio.tipoGarantia.sort()).toEqual(["COMERCIAL_1", "COMERCIAL_3"]);

    // Y es el único: los demás de garantía son fotocopias.
    const garantiaConConteo = catalogo.documentos
      .filter((d: any) => d.seccion === "garantia" && d.requiereConteoHojas)
      .map((d: any) => d.codigo);
    expect(garantiaConConteo).toEqual(["garante-folio"]);
  });

  it("«Otros» es el único requisito con nombre libre y presentación editable", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");

    const libres = catalogo.documentos.filter((d: any) => d.permiteNombreLibre).map((d: any) => d.codigo);
    expect(libres).toEqual(["otros-documento"]);

    const editables = catalogo.documentos.filter((d: any) => d.presentacionEditable).map((d: any) => d.codigo);
    expect(editables).toEqual(["otros-documento"]);

    const otros = catalogo.documentos.find((d: any) => d.codigo === "otros-documento");
    // Por defecto AMBOS, que es lo que pidió el área.
    expect(otros.presentacionFisica).toBe("SI");
    expect(otros.presentacionDigital).toBe("SI");
    expect(otros.requiereConteoHojas).toBe(true);
    // Nace fuera del cálculo de avance.
    expect(otros.estadoInicial).toBe("NO_APLICA");
    expect(otros.permiteNoAplica).toBe(true);
    expect(otros.obligatorio).toBe(false);
  });

  it("las subsecciones de garantía llegan resueltas por rama", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const inmueble = catalogo.documentos.find((d: any) => d.codigo === "garante-inmueble");
    // El mapa viaja completo: el mismo documento tiene un título distinto en
    // Tipo 1 (pertenece al garante) y en Tipo 3 (pertenece al postulante).
    expect(inmueble.subsecciones.COMERCIAL_1).toBe("1 Garante con Bien Inmueble");
    expect(inmueble.subsecciones.COMERCIAL_3).toBe("Postulante con inmueble propio");

    const tipo1 = catalogo.aplicabilidad.find(
      (m: any) => m.tipoFuncionario === "COMERCIAL" && m.tipoGarantia === "COMERCIAL_1",
    );
    expect(tipo1.subsecciones).toEqual([
      "1 Garante con Bien Inmueble",
      "1 Garante Familiar (hasta 4to grado de consanguinidad)",
    ]);

    const tipo3 = catalogo.aplicabilidad.find(
      (m: any) => m.tipoFuncionario === "COMERCIAL" && m.tipoGarantia === "COMERCIAL_3",
    );
    expect(tipo3.subsecciones).toEqual([
      "Postulante con inmueble propio",
      "1 Garante Familiar (hasta 4to grado de consanguinidad)",
    ]);
  });

  it("cada rama comercial exige sus propios documentos de garantía", () => {
    const h = loadInstalledBackend();
    const mapa = h.ok("documentacion.catalogo").aplicabilidad;
    const porClave = (funcionario: string, garantia: string) =>
      mapa.find((m: any) => m.tipoFuncionario === funcionario && m.tipoGarantia === garantia);

    const general = porClave("GENERAL", "NINGUNA");
    expect(general.total).toBe(20);
    // `propios` es lo que la rama añade a los generales: cero para General y
    // cero para el área administrativa, que es lo que permite al asistente
    // saltarse el paso de requisitos específicos sin recorrer el catálogo.
    expect(general.propios).toBe(0);

    const administrativo = porClave("ADMINISTRATIVO", "NINGUNA");
    expect(administrativo.habilitada).toBe(true);
    expect(administrativo.total).toBe(20);
    expect(administrativo.propios).toBe(0);
    expect(administrativo.codigos.sort()).toEqual(general.codigos.slice().sort());

    // Los recuentos acordados con el área, rama por rama.
    expect(porClave("COMERCIAL", "COMERCIAL_1").total).toBe(25);
    expect(porClave("COMERCIAL", "COMERCIAL_2").total).toBe(29);
    expect(porClave("COMERCIAL", "COMERCIAL_3").total).toBe(25);
    expect(porClave("AUDITORIA", "NINGUNA").total).toBe(21);
    expect(porClave("CUMPLIMIENTO", "NINGUNA").total).toBe(23);
    expect(porClave("AUDITORIA", "NINGUNA").propios).toBe(1);
    expect(porClave("CUMPLIMIENTO", "NINGUNA").propios).toBe(3);

    const tipo1 = porClave("COMERCIAL", "COMERCIAL_1");
    expect(tipo1.codigos).toContain("garante-inmueble");
    expect(tipo1.codigos).toContain("garante-folio");
    expect(tipo1.codigos).toContain("garante-t1-fam-ci");
    expect(tipo1.codigos).not.toContain("garante-fam1-ci");

    const tipo2 = porClave("COMERCIAL", "COMERCIAL_2");
    expect(tipo2.codigos).toContain("garante-boletas");
    expect(tipo2.codigos).toContain("garante-fam2-croquis");
    expect(tipo2.codigos).not.toContain("garante-inmueble");

    const tipo3 = porClave("COMERCIAL", "COMERCIAL_3");
    expect(tipo3.codigos).toContain("garante-inmueble");
    expect(tipo3.codigos).toContain("garante-t3-fam-ci");
    expect(tipo3.codigos).not.toContain("garante-fam1-ci");

    const auditoria = porClave("AUDITORIA", "NINGUNA");
    expect(auditoria.codigos).toContain("impedimento-auditor");
    expect(auditoria.codigos).not.toContain("lgi-ft");

    const cumplimiento = porClave("CUMPLIMIENTO", "NINGUNA");
    expect(cumplimiento.codigos).toContain("examen-uif");
    expect(cumplimiento.codigos).toContain("lgi-ft");
    expect(cumplimiento.codigos).toContain("djj-prohibiciones-cumplimiento");
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
    /* Antes esta prueba desactivaba `rc-iva`. Ese requisito ya nace retirado en
       el catálogo v3, así que desactivarlo no probaría nada: se desactiva el
       carnet de heredero, que sí está vigente y es opcional. */
    const guardado = h.pedir("documentacion.catalogo.guardar", {
      catalogo: [{ codigo: "carnet-heredero", nombre_visible: "Carnet de heredero (en revisión)", activo: false }],
    });
    expect(guardado.ok).toBe(true);

    const catalogo = h.ok("documentacion.catalogo");
    const heredero = catalogo.documentos.find((d: any) => d.codigo === "carnet-heredero");
    expect(heredero.nombre).toBe("Carnet de heredero (en revisión)");
    expect(heredero.activo).toBe(false);

    // Desactivado deja de ser aplicable: 19 generales en lugar de 20.
    const general = catalogo.aplicabilidad.find(
      (m: any) => m.tipoFuncionario === "GENERAL" && m.tipoGarantia === "NINGUNA",
    );
    expect(general.total).toBe(19);

    // Y el espejo heredado `_CATALOGO` sigue existiendo para las acciones viejas.
    const espejo = h.rowsOf("_CATALOGO");
    expect(espejo.find((f) => f.id === "carnet-heredero")!.etiqueta).toBe("Carnet de heredero (en revisión)");
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
