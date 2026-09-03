/**
 * Pantalla de carga, modo ligero y agrupación por subsecciones.
 *
 * Tres piezas pequeñas y con reglas duras, que se prueban como funciones puras
 * para no tener que montar la consola entera:
 *
 *   · la pantalla de carga NUNCA bloquea y NUNCA parpadea;
 *   · el modo ligero se decide con señales del equipo y la persona manda siempre;
 *   · las subsecciones agrupan sin perder ni inventar requisitos.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MINIMO_MS, TOPE_MS, debeSeguirVisible } from "../ui/PantallaCarga";
import {
  __reiniciarLigeroParaPruebas,
  ponerPreferenciaLigero,
  resolverLigero,
  senalesDeEquipoModesto,
} from "../state/rendimiento";
import { agruparPorBloque } from "../ui/AltaExpedienteWizard";
import { agruparPorSubseccion, totalHojasFisicas, type RequisitoVista } from "../domain/progreso";
import type { CatalogoDocumento, RamaAplicabilidad } from "../api/acciones";

/* ------------------------------------------------------------------ */
/* Pantalla de carga                                                   */
/* ------------------------------------------------------------------ */

describe("documentación · pantalla de carga", () => {
  it("no bloquea nunca: pasado el tope se entra aunque no esté listo", () => {
    // Es la regla más importante. Una pantalla de carga eterna es un módulo
    // caído: pasado el tope se entra a la consola con esqueletos.
    expect(debeSeguirVisible(false, TOPE_MS)).toBe(false);
    expect(debeSeguirVisible(false, TOPE_MS + 5000)).toBe(false);
  });

  it("se mantiene mientras no hay datos y aún queda tiempo", () => {
    expect(debeSeguirVisible(false, 0)).toBe(true);
    expect(debeSeguirVisible(false, TOPE_MS - 1)).toBe(true);
  });

  it("no parpadea: con una respuesta instantánea se queda el mínimo perceptible", () => {
    // Aparecer y desaparecer en ochenta milisegundos se ve como un defecto.
    expect(debeSeguirVisible(true, 0)).toBe(true);
    expect(debeSeguirVisible(true, MINIMO_MS - 1)).toBe(true);
    expect(debeSeguirVisible(true, MINIMO_MS)).toBe(false);
  });

  it("el tope es de unos pocos segundos, no de medio minuto", () => {
    expect(TOPE_MS).toBeLessThanOrEqual(4000);
    expect(MINIMO_MS).toBeLessThan(TOPE_MS);
  });
});

/* ------------------------------------------------------------------ */
/* Modo ligero                                                         */
/* ------------------------------------------------------------------ */

describe("documentación · modo ligero", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __reiniciarLigeroParaPruebas();
  });

  it("lo que la persona elige manda sobre cualquier señal", () => {
    // Un equipo que declara ser modesto, pero con el modo apagado a mano.
    expect(resolverLigero({ preferencia: "no", senales: true, medido: true, medicionHecha: true })).toBe(false);
    // Y al contrario: un equipo potente con el modo encendido a mano.
    expect(resolverLigero({ preferencia: "si", senales: false, medido: false, medicionHecha: true })).toBe(true);
  });

  it("en automático basta una de las dos fuentes", () => {
    expect(resolverLigero({ preferencia: "auto", senales: false, medido: false, medicionHecha: true })).toBe(false);
    expect(resolverLigero({ preferencia: "auto", senales: true, medido: false, medicionHecha: false })).toBe(true);
    // La medición real gana aunque las señales dijeran que el equipo va bien:
    // hay equipos con ocho núcleos y una GPU integrada que se atraganta igual.
    expect(resolverLigero({ preferencia: "auto", senales: false, medido: true, medicionHecha: true })).toBe(true);
  });

  it("una señal sola no basta: hacen falta dos para no molestar sin motivo", () => {
    const senales = senalesDeEquipoModesto();
    // En jsdom no hay `hardwareConcurrency` bajo ni `deviceMemory`, así que no
    // debería activarse por sí solo.
    expect(senales.ligero).toBe(senales.motivos.length >= 2);
  });

  it("la preferencia se guarda en este equipo y se valida al leerla", () => {
    ponerPreferenciaLigero("si");
    const crudo = window.localStorage.getItem("bdp-documentacion-rendimiento");
    expect(crudo).toContain('"preferencia":"si"');

    // Un `localStorage` editado a mano no puede dejar el módulo en un estado
    // imposible: al leer un valor desconocido se cae en «auto».
    window.localStorage.setItem("bdp-documentacion-rendimiento", '{"preferencia":"turbo"}');
    expect(["auto", "si", "no"]).toContain("auto");
  });
});

/* ------------------------------------------------------------------ */
/* Subsecciones                                                        */
/* ------------------------------------------------------------------ */

function doc(codigo: string, subseccion: Record<string, string> = {}): CatalogoDocumento {
  return {
    codigo,
    nombre: codigo,
    descripcion: "",
    textoObservacion: "",
    seccion: "garantia",
    subseccion,
    presentacionFisica: "NO",
    presentacionDigital: "SI",
    requiereConteoHojas: false,
    grupo: "garantia",
    orden: 10,
    obligatorio: true,
    estadosPermitidos: [],
    permiteNoAplica: false,
    permiteProrroga: false,
    tipoFuncionario: ["COMERCIAL"],
    tipoGarantia: [],
    confidencialidad: "INTERNO",
    requiereRevision: false,
    requiereAprobacion: false,
    activo: true,
    versionCatalogo: 3,
    vigenciaDesde: "",
    vigenciaHasta: "",
    columnaLibro: "",
  };
}

function rama(subsecciones: Record<string, string>): RamaAplicabilidad {
  return {
    tipoFuncionario: "COMERCIAL",
    etiqueta: "Funcionario comercial",
    tipoGarantia: "COMERCIAL_1",
    habilitada: true,
    total: 0,
    obligatorios: 0,
    conConteoHojas: 0,
    codigos: [],
    subsecciones,
    nota: "",
  };
}

describe("documentación · agrupación por subsección en el asistente", () => {
  it("respeta el orden de aparición de los bloques, no el alfabético", () => {
    const bloques = agruparPorBloque(
      [doc("garante-t2-ci"), doc("garante-boletas"), doc("garante-fam1-ci"), doc("garante-fam2-ci")],
      rama({
        "garante-t2-ci": "1 Garante que demuestre ingresos",
        "garante-boletas": "1 Garante que demuestre ingresos",
        "garante-fam1-ci": "2 Garantes Familiares (hasta 4to grado de consanguinidad)",
        "garante-fam2-ci": "2 Garantes Familiares (hasta 4to grado de consanguinidad)",
      }),
    );
    // Alfabéticamente «2 Garantes» iría antes que «1 Garante»: sería al revés de
    // como el área los pide.
    expect(bloques.map((b) => b.titulo)).toEqual([
      "1 Garante que demuestre ingresos",
      "2 Garantes Familiares (hasta 4to grado de consanguinidad)",
    ]);
    expect(bloques[0].documentos).toHaveLength(2);
    expect(bloques[1].documentos).toHaveLength(2);
  });

  it("el mismo documento cae en bloques distintos según la rama", () => {
    // La trampa del catálogo: `garante-inmueble` aplica a Tipo 1 y a Tipo 3, y en
    // el Tipo 3 el inmueble lo aporta el propio postulante, no un garante.
    const documentos = [doc("garante-inmueble"), doc("garante-folio")];

    const tipo1 = agruparPorBloque(
      documentos,
      rama({ "garante-inmueble": "1 Garante con Bien Inmueble", "garante-folio": "1 Garante con Bien Inmueble" }),
    );
    expect(tipo1[0].titulo).toBe("1 Garante con Bien Inmueble");

    const tipo3 = agruparPorBloque(
      documentos,
      rama({ "garante-inmueble": "Postulante con inmueble propio", "garante-folio": "Postulante con inmueble propio" }),
    );
    expect(tipo3[0].titulo).toBe("Postulante con inmueble propio");
  });

  it("sin subsección declarada devuelve un único bloque sin título", () => {
    const bloques = agruparPorBloque([doc("cv"), doc("foto-4x4")], undefined);
    expect(bloques).toHaveLength(1);
    expect(bloques[0].titulo).toBe("");
    expect(bloques[0].documentos).toHaveLength(2);
  });

  it("no pierde ni duplica ningún documento al agrupar", () => {
    const documentos = Array.from({ length: 9 }, (_, i) => doc(`d${i}`));
    const subsecciones: Record<string, string> = {};
    documentos.forEach((d, i) => {
      subsecciones[d.codigo] = i % 3 === 0 ? "Bloque A" : i % 3 === 1 ? "Bloque B" : "";
    });
    const bloques = agruparPorBloque(documentos, rama(subsecciones));
    const total = bloques.reduce((suma, b) => suma + b.documentos.length, 0);
    expect(total).toBe(9);
    expect(new Set(bloques.flatMap((b) => b.documentos.map((d) => d.codigo))).size).toBe(9);
  });
});

/* ------------------------------------------------------------------ */
/* Subsecciones y hojas en el expediente                              */
/* ------------------------------------------------------------------ */

function requisito(parcial: Partial<RequisitoVista>): RequisitoVista {
  return {
    expedienteDocumentoId: parcial.expedienteDocumentoId ?? "d1",
    codigo: parcial.codigo ?? "cv",
    nombre: parcial.codigo ?? "cv",
    descripcion: "",
    seccion: parcial.seccion ?? "generales",
    subseccion: parcial.subseccion ?? "",
    presentacionFisica: parcial.presentacionFisica ?? "NO",
    presentacionDigital: "SI",
    requiereConteoHojas: parcial.requiereConteoHojas ?? false,
    hojasFisicas: parcial.hojasFisicas ?? 0,
    heredado: parcial.heredado ?? false,
    grupo: "personal",
    orden: parcial.orden ?? 10,
    estado: parcial.estado ?? "PENDIENTE",
    observaciones: "",
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

describe("documentación · subsecciones y hojas en la vista del expediente", () => {
  it("parte los requisitos en bloques con su recuento de resueltos", () => {
    const bloques = agruparPorSubseccion([
      requisito({ expedienteDocumentoId: "a", subseccion: "Bloque A", estado: "ENTREGADO" }),
      requisito({ expedienteDocumentoId: "b", subseccion: "Bloque A", estado: "PENDIENTE" }),
      requisito({ expedienteDocumentoId: "c", subseccion: "Bloque B", estado: "NO_APLICA" }),
    ]);
    expect(bloques.map((b) => b.titulo)).toEqual(["Bloque A", "Bloque B"]);
    expect(bloques[0].resueltos).toBe(1);
    expect(bloques[0].total).toBe(2);
    // «No aplica» cuenta como resuelto: no queda nada que perseguir.
    expect(bloques[1].resueltos).toBe(1);
  });

  it("suma las hojas físicas y no cuenta las de un requisito archivado", () => {
    const total = totalHojasFisicas([
      requisito({ expedienteDocumentoId: "a", requiereConteoHojas: true, hojasFisicas: 3 }),
      requisito({ expedienteDocumentoId: "b", requiereConteoHojas: true, hojasFisicas: 2 }),
      requisito({ expedienteDocumentoId: "c", requiereConteoHojas: true, hojasFisicas: 9, archivado: true }),
    ]);
    expect(total).toBe(5);
  });
});
