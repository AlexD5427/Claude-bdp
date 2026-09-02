/**
 * Conteo de hojas y subsecciones, de la interfaz a la hoja de cálculo.
 *
 * ── Qué se prueba ───────────────────────────────────────────────────────────
 * Las dos cosas que el catálogo v3 añade al modelo, en los sitios donde pueden
 * romperse:
 *
 *   · **conteo de hojas**: que aparezca SOLO en los documentos de papel (y que
 *     eso lo decida el catálogo, no una lista escrita en la interfaz), que
 *     distinga «sin contar» de «cero hojas», que el backend lo valide, que
 *     sobreviva al guardado y que llegue al libro anual;
 *   · **subsecciones**: que agrupen, que respeten el orden de la lista de papel y
 *     que el documento compartido entre Tipo 1 y Tipo 3 —`garante-inmueble`—
 *     aparezca en el bloque correcto de CADA rama, que es la trampa del asunto.
 */

import { describe, expect, it } from "vitest";
import { loadInstalledBackend } from "../../../../scripts/documentacion-backend.mjs";
import { agruparPorSubseccion, resumenHojasFisicas, type RequisitoVista } from "../domain/progreso";
import { subseccionPara, type CatalogoDocumento } from "../api/acciones";

/** Requisito mínimo para las pruebas del dominio. */
function req(parcial: Partial<RequisitoVista>): RequisitoVista {
  return {
    expedienteDocumentoId: parcial.expedienteDocumentoId ?? "expdoc",
    codigo: parcial.codigo ?? "x",
    nombre: parcial.nombre ?? "X",
    descripcion: "",
    seccion: parcial.seccion ?? "garantia",
    subseccion: parcial.subseccion ?? "",
    subgrupo: parcial.subgrupo ?? "",
    grupo: "garantia",
    orden: parcial.orden ?? 10,
    estado: parcial.estado ?? "PENDIENTE",
    observaciones: "",
    hojasFisicas: parcial.hojasFisicas ?? null,
    presentacionFisica: parcial.presentacionFisica ?? "NO",
    presentacionDigital: "SI",
    requiereConteoHojas: parcial.requiereConteoHojas ?? false,
    obligatorio: true,
    permiteNoAplica: false,
    permiteProrroga: false,
    estadoRevision: "SIN_REVISION",
    revisionActualId: "",
    aprobacionActualId: "",
    requiereRevision: false,
    requiereAprobacion: false,
    version: 1,
    archivado: parcial.archivado ?? false,
    prorrogas: [],
    actualizadoEn: "",
    actualizadoPor: "",
  };
}

describe("conteo de hojas · solo los documentos de papel, y el backend lo verifica", () => {
  it("el catálogo declara exactamente nueve documentos con contador, ninguno de garantía", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const conConteo = catalogo.documentos
      .filter((d: CatalogoDocumento) => d.requiereConteoHojas)
      .map((d: CatalogoDocumento) => d.codigo)
      .sort();

    expect(conConteo).toEqual(
      [
        "antecedentes-felcc",
        "djj-prohibiciones-cumplimiento",
        "examen-uif",
        "impedimento-auditor",
        "lgi-ft",
        "rejap",
        "seguro-accidentes",
        "seguro-vida",
        "titulo-legalizado",
      ].sort(),
    );
    // Los de garantía son todos fotocopias escaneadas: ninguno lleva papel.
    expect(conConteo.filter((c: string) => c.startsWith("garante-"))).toEqual([]);
  });

  it("el contador se deduce de la presentación física, no se declara a mano", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    /*
     * La invariante que evita el caso absurdo.
     *
     * Si `requiereConteoHojas` se declarara por separado, nada impediría un
     * documento digital con contador («¿cuántas hojas tiene una fotografía
     * enviada por WhatsApp?») ni un documento de papel sin él. Al derivarse de
     * `presentacionFisica`, las dos incoherencias son imposibles por construcción.
     */
    for (const doc of catalogo.documentos as CatalogoDocumento[]) {
      const esFisico = doc.presentacionFisica === "SI" || doc.presentacionFisica === "CONDICIONAL";
      expect(doc.requiereConteoHojas, `${doc.codigo} (física: ${doc.presentacionFisica})`).toBe(esFisico);
    }
  });

  it("el asterisco de la tabla del área es un dato, no un texto suelto", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const porCodigo = new Map<string, CatalogoDocumento>(
      (catalogo.documentos as CatalogoDocumento[]).map((d) => [d.codigo, d]),
    );

    // Las filas 2 y 3 de la lista del área llevan «SÍ*»: papel condicional.
    expect(porCodigo.get("antecedentes-felcc")!.presentacionFisica).toBe("CONDICIONAL");
    expect(porCodigo.get("rejap")!.presentacionFisica).toBe("CONDICIONAL");
    // Las filas 9, 14 y 15 llevan «SÍ» sin asterisco.
    expect(porCodigo.get("titulo-legalizado")!.presentacionFisica).toBe("SI");
    expect(porCodigo.get("seguro-accidentes")!.presentacionFisica).toBe("SI");
    expect(porCodigo.get("seguro-vida")!.presentacionFisica).toBe("SI");
    // Y la fotografía es solo digital.
    expect(porCodigo.get("foto-4x4")!.presentacionFisica).toBe("NO");
    expect(porCodigo.get("foto-4x4")!.presentacionDigital).toBe("SI");
  });

  it("se guarda, se relee y distingue «sin contar» de «cero hojas»", () => {
    const h = loadInstalledBackend();
    const creado = h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "1111111", nombre: "Hojas Uno", tipoFuncionario: "GENERAL" },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const rejap = detalle.requisitos.find((r: RequisitoVista) => r.codigo === "rejap")!;

    // Nadie lo ha contado: `null`, no cero.
    expect(rejap.hojasFisicas).toBeNull();

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { estado: "ENTREGADO", hojasFisicas: 4 },
    });
    let vuelta = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    expect(vuelta.requisitos.find((r: RequisitoVista) => r.codigo === "rejap")!.hojasFisicas).toBe(4);

    // Cero es un DATO: alguien miró y no había hojas.
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { hojasFisicas: 0 },
    });
    vuelta = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    expect(vuelta.requisitos.find((r: RequisitoVista) => r.codigo === "rejap")!.hojasFisicas).toBe(0);

    // Y se puede volver a «sin contar» mandando vacío.
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: rejap.expedienteDocumentoId,
      cambios: { hojasFisicas: "" },
    });
    vuelta = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    expect(vuelta.requisitos.find((r: RequisitoVista) => r.codigo === "rejap")!.hojasFisicas).toBeNull();
  });

  it("el backend rechaza un conteo en un documento digital, señalando el campo", () => {
    const h = loadInstalledBackend();
    const creado = h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "2222222", nombre: "Hojas Dos", tipoFuncionario: "GENERAL" },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const foto = detalle.requisitos.find((r: RequisitoVista) => r.codigo === "foto-4x4")!;

    const res = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: foto.expedienteDocumentoId,
      cambios: { hojasFisicas: 3 },
    });
    expect(res.ok).toBe(false);
    expect(res.error.mensaje).toMatch(/no se entrega en papel/i);
    // `fields` es lo que el formulario usa para marcar el control exacto.
    expect(res.error.fields.hojas_fisicas).toBeTruthy();
  });

  it("valida el rango y el tipo", () => {
    const h = loadInstalledBackend();
    const creado = h.ok("documentacion.expediente.crear", {
      expediente: { identificador: "3333333", nombre: "Hojas Tres", tipoFuncionario: "GENERAL" },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const titulo = detalle.requisitos.find((r: RequisitoVista) => r.codigo === "titulo-legalizado")!;

    for (const valor of [-1, 1000, 5.5, "muchas"]) {
      const res = h.pedir("documentacion.requisito.actualizar", {
        expedienteDocumentoId: titulo.expedienteDocumentoId,
        cambios: { hojasFisicas: valor },
      });
      expect(res.ok, `hojasFisicas=${valor} debería rechazarse`).toBe(false);
      expect(res.error.fields.hojas_fisicas).toBeTruthy();
    }

    // El tope justo sí entra.
    const ok = h.pedir("documentacion.requisito.actualizar", {
      expedienteDocumentoId: titulo.expedienteDocumentoId,
      cambios: { hojasFisicas: 999 },
    });
    expect(ok.ok).toBe(true);
  });

  it("los totales del expediente suman las hojas y llegan al libro anual", () => {
    const h = loadInstalledBackend();
    const creado = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "4444444",
        nombre: "Hojas Cuatro",
        tipoFuncionario: "GENERAL",
        fechaIngreso: h.read<string>("doc2Hoy_()"),
        requisitos: [
          { codigo: "rejap", estado: "ENTREGADO", hojasFisicas: 3 },
          { codigo: "titulo-legalizado", estado: "ENTREGADO", hojasFisicas: 7 },
          { codigo: "seguro-vida", estado: "ENTREGADO", hojasFisicas: 2 },
        ],
      },
    });

    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    expect(detalle.expediente.totales.hojasFisicas).toBe(12);
    // Cinco generales llevan contador; solo tres están anotados.
    expect(detalle.expediente.totales.documentosFisicos).toBe(5);

    /*
     * Y llega al libro anual por la columna PAGINAS del bloque de gestión.
     *
     * Esa columna existía y estaba siempre a cero. Las columnas A-W del Excel del
     * área no se tocan ni se renumeran: el conteo va al bloque de la X en
     * adelante, donde el módulo puede escribir sin alterar lo que el área abre.
     */
    const anual = h.rowsOf(`CONTROL INGRESOS ${new Date().getFullYear()}`);
    const fila = anual.find((f) => String(f["Nombre"]).indexOf("Hojas Cuatro") >= 0);
    expect(fila, "el expediente debería estar reflejado en el libro anual").toBeTruthy();
    expect(Number(fila!["PAGINAS"])).toBe(12);
    // Y el detalle por documento sigue coherente en el JSON de compatibilidad.
    const json = JSON.parse(String(fila!["DETALLE JSON"]));
    expect(json.items.find((i: { id: string }) => i.id === "titulo-legalizado").pages).toBe(7);
  });

  it("marcar «no aplica» conserva el conteo por si se revierte", () => {
    const h = loadInstalledBackend();
    const creado = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "5555555",
        nombre: "Hojas Cinco",
        tipoFuncionario: "GENERAL",
        requisitos: [{ codigo: "titulo-legalizado", estado: "ENTREGADO", hojasFisicas: 5 }],
      },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const titulo = detalle.requisitos.find((r: RequisitoVista) => r.codigo === "titulo-legalizado")!;

    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: titulo.expedienteDocumentoId,
      cambios: { estado: "NO_APLICA" },
    });
    const vuelta = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
    const despues = vuelta.requisitos.find((r: RequisitoVista) => r.codigo === "titulo-legalizado")!;

    // El estado cambió; el conteo NO se borró. Marcar «no aplica» por error y
    // revertirlo es habitual, y volver a contar las hojas de un documento que ya
    // está en la carpeta es trabajo perdido.
    expect(despues.estado).toBe("NO_APLICA");
    expect(despues.hojasFisicas).toBe(5);
  });

  it("el resumen del dominio cuenta lo anotado y avisa de lo que llegó sin contar", () => {
    const resumen = resumenHojasFisicas([
      req({ codigo: "rejap", requiereConteoHojas: true, hojasFisicas: 3, estado: "ENTREGADO" }),
      req({ codigo: "seguro-vida", requiereConteoHojas: true, hojasFisicas: null, estado: "ENTREGADO" }),
      req({ codigo: "titulo-legalizado", requiereConteoHojas: true, hojasFisicas: null, estado: "PENDIENTE" }),
      req({ codigo: "cv", requiereConteoHojas: false, hojasFisicas: null }),
    ]);

    expect(resumen.documentos).toBe(3);
    expect(resumen.anotados).toBe(1);
    expect(resumen.hojas).toBe(3);
    // Solo se echa de menos el conteo de lo que YA llegó: pedir las hojas de algo
    // que nadie ha entregado sería ruido.
    expect(resumen.sinAnotar.map((r) => r.codigo)).toEqual(["seguro-vida"]);
  });
});

describe("subsecciones · el documento compartido entre Tipo 1 y Tipo 3", () => {
  it("la misma fila del catálogo cae en bloques distintos según la rama", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const inmueble = catalogo.documentos.find((d: CatalogoDocumento) => d.codigo === "garante-inmueble")!;
    const folio = catalogo.documentos.find((d: CatalogoDocumento) => d.codigo === "garante-folio")!;

    /*
     * La trampa.
     *
     * `garante-inmueble` y `garante-folio` aplican a Tipo 1 Y a Tipo 3, pero en
     * Tipo 1 son del GARANTE y en Tipo 3 son del PROPIO POSTULANTE. Con un texto
     * único, uno de los dos títulos sería falso, y sería falso en la pantalla
     * donde alguien está decidiendo qué documentos pedir.
     */
    expect(subseccionPara(inmueble, "COMERCIAL_1")).toBe("1 Garante con Bien Inmueble");
    expect(subseccionPara(inmueble, "COMERCIAL_3")).toBe("Postulante con inmueble propio");
    expect(subseccionPara(folio, "COMERCIAL_1")).toBe("1 Garante con Bien Inmueble");
    expect(subseccionPara(folio, "COMERCIAL_3")).toBe("Postulante con inmueble propio");
  });

  it("cada rama declara sus subsecciones en el orden de la lista de papel", () => {
    const h = loadInstalledBackend();
    const catalogo = h.ok("documentacion.catalogo");
    const de = (funcionario: string, garantia: string) =>
      catalogo.aplicabilidad.find(
        (a: { tipoFuncionario: string; tipoGarantia: string }) =>
          a.tipoFuncionario === funcionario && a.tipoGarantia === garantia,
      )!.subsecciones;

    expect(de("COMERCIAL", "COMERCIAL_1")).toEqual([
      "1 Garante con Bien Inmueble",
      "1 Garante Familiar (hasta 4to grado de consanguinidad)",
    ]);
    expect(de("COMERCIAL", "COMERCIAL_2")).toEqual([
      "1 Garante que demuestre ingresos",
      "2 Garantes Familiares (hasta 4to grado de consanguinidad)",
    ]);
    // En Tipo 3 el bloque del postulante va PRIMERO, y es el que contiene los
    // dos documentos compartidos.
    expect(de("COMERCIAL", "COMERCIAL_3")).toEqual([
      "Postulante con inmueble propio",
      "1 Garante Familiar (hasta 4to grado de consanguinidad)",
    ]);
    // Los generales no tienen subsección: son la lista llana de dieciséis.
    expect(de("GENERAL", "NINGUNA")).toEqual([]);
  });

  it("la subsección se materializa en el requisito del expediente, ya resuelta", () => {
    const h = loadInstalledBackend();
    const t3 = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "6666666",
        nombre: "Comercial Tipo Tres",
        tipoFuncionario: "COMERCIAL",
        tipoGarantia: "COMERCIAL_3",
      },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: t3.expedienteId });
    const inmueble = detalle.requisitos.find((r: RequisitoVista) => r.codigo === "garante-inmueble")!;

    // Resuelta al crear, no al leer: así reportes y exportaciones no pueden
    // resolverla distinto que la pantalla.
    expect(inmueble.subseccion).toBe("Postulante con inmueble propio");
  });

  it("el Tipo 2 separa a sus dos garantes familiares en bloques", () => {
    const h = loadInstalledBackend();
    const t2 = h.ok("documentacion.expediente.crear", {
      expediente: {
        identificador: "7777777",
        nombre: "Comercial Tipo Dos",
        tipoFuncionario: "COMERCIAL",
        tipoGarantia: "COMERCIAL_2",
      },
    });
    const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: t2.expedienteId });
    const garantia = detalle.requisitos.filter((r: RequisitoVista) => r.seccion === "garantia");
    const grupos = agruparPorSubseccion(garantia);

    expect(grupos.map((g) => g.titulo)).toEqual([
      "1 Garante que demuestre ingresos",
      "2 Garantes Familiares (hasta 4to grado de consanguinidad)",
    ]);

    /*
     * Cuatro fotocopias que son DOS personas.
     *
     * En una lista llana, «Fotocopia de CI» y «Croquis domicilio» aparecen dos
     * veces cada uno y alguien acaba subiendo dos veces la cédula del primer
     * garante. Los sub-bloques lo hacen imposible de confundir.
     */
    const familiares = grupos[1];
    expect(familiares.bloques.map((b) => b.subgrupo)).toEqual(["Garante familiar 1", "Garante familiar 2"]);
    expect(familiares.bloques[0].requisitos.map((r) => r.codigo)).toEqual([
      "garante-fam1-ci",
      "garante-fam1-croquis",
    ]);
    expect(familiares.bloques[1].requisitos.map((r) => r.codigo)).toEqual([
      "garante-fam2-ci",
      "garante-fam2-croquis",
    ]);
  });

  it("los requisitos sin subsección caen en un bloque de título vacío, y va primero", () => {
    const grupos = agruparPorSubseccion([
      req({ codigo: "b", orden: 20, subseccion: "Bloque" }),
      req({ codigo: "a", orden: 10, subseccion: "" }),
      req({ codigo: "c", orden: 30, subseccion: "Bloque" }),
    ]);

    // El orden es el del catálogo (por `orden`), no el de llegada del arreglo.
    expect(grupos.map((g) => g.titulo)).toEqual(["", "Bloque"]);
    expect(grupos[1].bloques[0].requisitos.map((r) => r.codigo)).toEqual(["b", "c"]);
  });

  it("el avance se calcula por subsección y descuenta los «no aplica»", () => {
    const grupos = agruparPorSubseccion([
      req({ codigo: "a", orden: 10, subseccion: "S", estado: "ENTREGADO" }),
      req({ codigo: "b", orden: 20, subseccion: "S", estado: "NO_APLICA" }),
      req({ codigo: "c", orden: 30, subseccion: "S", estado: "PENDIENTE" }),
    ]);

    const s = grupos[0];
    expect(s.total).toBe(3);
    expect(s.entregados).toBe(1);
    expect(s.pendientes).toBe(1);
    // Denominador 2 (los aplicables): 1 de 2 = 50 %, la misma regla del backend.
    expect(s.porcentaje).toBe(50);
  });

  it("los requisitos archivados no cuentan en ninguna subsección", () => {
    const grupos = agruparPorSubseccion([
      req({ codigo: "a", orden: 10, subseccion: "S" }),
      req({ codigo: "z", orden: 20, subseccion: "S", archivado: true }),
    ]);
    expect(grupos[0].total).toBe(1);
  });
});
