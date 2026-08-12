/**
 * Pruebas del nucleo del modulo de Documentacion.
 *
 * Cubren la logica pura: catalogo, identificador institucional, estado del
 * asistente y exportacion. Todo lo que depende del reloj recibe una fecha fija
 * para que la suite no cambie de resultado segun el dia en que se ejecute.
 */

import { describe, expect, it } from "vitest";
import {
  aEstadoCanonico,
  CATALOGO_DOCUMENTAL,
  diasRestantes,
  estadoProrroga,
  puedeRegistrarse,
  requisitoPorCodigo,
  requisitosAplicables,
  requisitosEspeciales,
  requisitosGenerales,
  requisitosProrrogables,
  TIPOS_FUNCIONARIO,
} from "./docCatalog";
import {
  analizarIdentificador,
  anioDeIdentificador,
  claveIdentificador,
  formatearIdentificador,
  mismoIdentificador,
  normalizarIdentificador,
} from "./docIdentificador";
import {
  borradorVacio,
  codigosDeOtrasGarantias,
  conCampo,
  conGarantia,
  conTipoFuncionario,
  conValor,
  esFechaValida,
  fechaLegible,
  primeraSeccionIncompleta,
  puedeGuardar,
  resumenDe,
  seccionesActivas,
  validarGenerales,
  valorDe,
  type BorradorExpediente,
} from "./docBorrador";
import {
  aCsv,
  construirLibro,
  exportarExpediente,
  exportarLote,
  LIMITE_LOTE,
  neutralizarFormula,
  nombreArchivoSeguro,
  nombreHojaSeguro,
  type ExpedienteExportable,
} from "./docExport";

/** Dia de referencia fijo para toda la suite. */
const HOY = new Date("2026-08-12T12:00:00Z");

function generalesCompletos(): BorradorExpediente {
  let b = borradorVacio();
  b = conCampo(b, "identificador", "8456872 - 105 - 2026");
  b = conCampo(b, "nombre", "Ana Pe\u00f1a");
  b = conCampo(b, "cargo", "Analista de Riesgos");
  b = conCampo(b, "agencia", "Agencia Central");
  b = conCampo(b, "gerencia", "Gerencia Nacional");
  b = conCampo(b, "fechaIngreso", "2026-03-02");
  return b;
}

/* ================================================================== */

describe("catalogo documental", () => {
  it("tiene los 18 documentos generales", () => {
    expect(requisitosGenerales().length).toBe(18);
  });

  it("no repite codigos", () => {
    const codigos = CATALOGO_DOCUMENTAL.map((r) => r.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("ofrece N/A solo donde se definio", () => {
    const conNA = CATALOGO_DOCUMENTAL.filter((r) => r.permiteNA).map((r) => r.codigo);
    expect(conNA.length).toBe(3);
    expect(conNA).toContain("GENERAL_TITULO_ACADEMICO_LEGALIZADO");
    expect(conNA).toContain("GENERAL_CERTIFICADO_RC_IVA");
    expect(conNA).toContain("COMERCIAL_T2_FORMULARIOS_200_400");
  });

  it("admite prorroga solo en los dos requisitos acordados", () => {
    const codigos = requisitosProrrogables().map((r) => r.codigo);
    expect(codigos.length).toBe(2);
    expect(codigos).toContain("GENERAL_CERTIFICADOS_TRABAJO");
    expect(codigos).toContain("GENERAL_TITULO_ACADEMICO_LEGALIZADO");
  });

  it("coloca N/A siempre al final de los estados", () => {
    for (const req of CATALOGO_DOCUMENTAL) {
      if (!req.permiteNA) continue;
      expect(req.estados[req.estados.length - 1]).toBe("NO_APLICA");
    }
  });

  it("reparte los requisitos especiales por rama", () => {
    expect(requisitosEspeciales("COMERCIAL", "TIPO_1").length).toBe(5);
    expect(requisitosEspeciales("COMERCIAL", "TIPO_2").length).toBe(9);
    expect(requisitosEspeciales("COMERCIAL", "TIPO_3").length).toBe(5);
    expect(requisitosEspeciales("AUDITORIA").length).toBe(1);
    expect(requisitosEspeciales("CUMPLIMIENTO").length).toBe(2);
  });

  it("suma generales mas especiales en los aplicables", () => {
    expect(requisitosAplicables("AUDITORIA").length).toBe(19);
    expect(requisitosAplicables("CUMPLIMIENTO").length).toBe(20);
    expect(requisitosAplicables("COMERCIAL", "TIPO_2").length).toBe(27);
  });

  it("no mezcla requisitos de una garantia con los de otra", () => {
    for (const req of requisitosEspeciales("COMERCIAL", "TIPO_1")) {
      expect(req.tipoGarantia).toBe("TIPO_1");
    }
  });

  it("deja el tipo en construccion definido pero no registrable", () => {
    const bloqueados = TIPOS_FUNCIONARIO.filter((t) => !t.disponible);
    expect(bloqueados.length).toBe(1);
    const codigo = bloqueados[0]!.codigo;
    expect(puedeRegistrarse(codigo)).toBe(false);
    // Sigue existiendo en el catalogo: la arquitectura queda preparada.
    expect(requisitosEspeciales(codigo).length).toBe(0);
  });

  it("resuelve un requisito por su codigo", () => {
    const req = requisitoPorCodigo("GENERAL_CERTIFICADOS_TRABAJO");
    expect(req?.permiteProrroga).toBe(true);
  });

  it("normaliza los estados heredados", () => {
    expect(aEstadoCanonico("presentado")).toBe("ENTREGADO");
    expect(aEstadoCanonico("observado")).toBe("NO_ENTREGADO");
    expect(aEstadoCanonico("n/a")).toBe("NO_APLICA");
    expect(aEstadoCanonico("valor que no existe")).toBe("PENDIENTE");
  });
});

/* ================================================================== */

describe("prorrogas", () => {
  it("distingue vigente, por vencer y vencida", () => {
    expect(estadoProrroga("2026-09-30", HOY)).toBe("vigente");
    expect(estadoProrroga("2026-08-15", HOY)).toBe("por_vencer");
    expect(estadoProrroga("2026-08-01", HOY)).toBe("vencida");
  });

  it("marca una fecha ilegible como invalida y la ausencia como sin prorroga", () => {
    expect(estadoProrroga("no es una fecha", HOY)).toBe("invalida");
    expect(estadoProrroga(undefined, HOY)).toBe("sin_prorroga");
  });

  it("cuenta los dias restantes con signo", () => {
    expect(diasRestantes("2026-08-15", HOY)).toBe(3);
    expect(diasRestantes("2026-08-12", HOY)).toBe(0);
    expect(diasRestantes("2026-08-10", HOY)).toBe(-2);
  });
});

/* ================================================================== */

describe("identificador institucional", () => {
  it("acepta el formato acordado", () => {
    const a = analizarIdentificador("8456872 - 105 - 2026", HOY);
    expect(a.ok).toBe(true);
    expect(a.partes?.ci).toBe("8456872");
    expect(a.partes?.proceso).toBe("105");
    expect(a.partes?.anio).toBe(2026);
  });

  it("homogeneiza separadores y espacios", () => {
    expect(normalizarIdentificador("8456872-105-2026")).toBe("8456872 - 105 - 2026");
    expect(normalizarIdentificador("  8456872   -105-  2026 ")).toBe("8456872 - 105 - 2026");
  });

  it("admite el guion tipografico que llega al pegar desde Word", () => {
    const a = analizarIdentificador("8456872 \u2013 105 \u2013 2026", HOY);
    expect(a.ok).toBe(true);
    expect(a.normalizado).toBe("8456872 - 105 - 2026");
  });

  it("conserva los guiones internos del carnet", () => {
    const a = analizarIdentificador("1234567-1A - 105 - 2026", HOY);
    expect(a.ok).toBe(true);
    // El guion del complemento es parte del dato, no un separador.
    expect(a.partes?.ci).toBe("1234567-1A");
  });

  it("interpreta siempre desde el final", () => {
    const a = analizarIdentificador("12-34-56 - 7 - 2025", HOY);
    expect(a.partes?.proceso).toBe("7");
    expect(a.partes?.anio).toBe(2025);
  });

  it("rechaza lo que no cumple el formato", () => {
    expect(analizarIdentificador("", HOY).ok).toBe(false);
    expect(analizarIdentificador("8456872 - 105", HOY).ok).toBe(false);
    expect(analizarIdentificador("8456872 - 105 - 26", HOY).ok).toBe(false);
    expect(analizarIdentificador("8456872 - abc - 2026", HOY).ok).toBe(false);
    expect(analizarIdentificador("12 - 105 - 2026", HOY).ok).toBe(false);
  });

  it("acota el anio a un rango razonable", () => {
    expect(analizarIdentificador("8456872 - 105 - 1980", HOY).ok).toBe(false);
    expect(analizarIdentificador("8456872 - 105 - 2027", HOY).ok).toBe(true);
    expect(analizarIdentificador("8456872 - 105 - 2099", HOY).ok).toBe(false);
  });

  it("compara sin depender de los espacios", () => {
    expect(claveIdentificador(" 8456872-105-2026 ")).toBe("8456872-105-2026");
    expect(mismoIdentificador("8456872 - 105 - 2026", "8456872-105-2026")).toBe(true);
    expect(mismoIdentificador("8456872 - 105 - 2026", "8456872 - 106 - 2026")).toBe(false);
    expect(mismoIdentificador("", "")).toBe(false);
  });

  it("da la forma legible y el anio", () => {
    expect(formatearIdentificador({ ci: "8456872", proceso: "105", anio: 2026 })).toBe(
      "8456872 - 105 - 2026",
    );
    expect(anioDeIdentificador("8456872 - 105 - 2026")).toBe(2026);
    expect(anioDeIdentificador("no es un identificador")).toBeNull();
  });
});

/* ================================================================== */

describe("fechas", () => {
  it("rechaza fechas que no existen", () => {
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
    expect(esFechaValida("02/03/2026")).toBe(false);
    expect(esFechaValida("2026-03-02")).toBe(true);
  });

  it("acepta el 29 de febrero solo en anio bisiesto", () => {
    expect(esFechaValida("2024-02-29")).toBe(true);
    expect(esFechaValida("2026-02-29")).toBe(false);
  });

  it("escribe la fecha en palabras sin depender del huso", () => {
    expect(fechaLegible("2026-08-12")).toBe("12 de agosto de 2026");
    expect(fechaLegible("fecha invalida")).toBe("");
  });
});

/* ================================================================== */

describe("estado del asistente", () => {
  it("exige los seis campos generales", () => {
    expect(Object.keys(validarGenerales(borradorVacio())).length).toBe(6);
    expect(Object.keys(validarGenerales(generalesCompletos())).length).toBe(0);
  });

  it("muestra el paso de garantia solo en la rama comercial", () => {
    const base = generalesCompletos();
    expect(seccionesActivas(base).length).toBe(5);
    expect(seccionesActivas(conTipoFuncionario(base, "COMERCIAL")).length).toBe(6);
    expect(seccionesActivas(conTipoFuncionario(base, "AUDITORIA")).length).toBe(5);
  });

  it("impide guardar sin tipo de funcionario", () => {
    expect(puedeGuardar(generalesCompletos())).toBe(false);
    expect(puedeGuardar(conTipoFuncionario(generalesCompletos(), "AUDITORIA"))).toBe(true);
  });

  it("exige el tipo de garantia en la rama comercial", () => {
    const comercial = conTipoFuncionario(generalesCompletos(), "COMERCIAL");
    expect(puedeGuardar(comercial)).toBe(false);
    expect(puedeGuardar(conGarantia(comercial, "TIPO_2"))).toBe(true);
  });

  it("senala la primera seccion incompleta", () => {
    expect(primeraSeccionIncompleta(borradorVacio())).toBe("generales");
    expect(primeraSeccionIncompleta(generalesCompletos())).toBe("tipo");
  });

  it("no deja en N/A un requisito que no lo admite", () => {
    const b = conValor(borradorVacio(), "GENERAL_CV_ACTUALIZADO", { estado: "NO_APLICA" });
    expect(valorDe(b, "GENERAL_CV_ACTUALIZADO").estado).toBe("PENDIENTE");
  });

  it("acepta N/A donde el catalogo lo permite", () => {
    const b = conValor(borradorVacio(), "GENERAL_CERTIFICADO_RC_IVA", { estado: "NO_APLICA" });
    expect(valorDe(b, "GENERAL_CERTIFICADO_RC_IVA").estado).toBe("NO_APLICA");
  });

  it("descarta una prorroga en un requisito que no la admite", () => {
    const b = conValor(borradorVacio(), "GENERAL_CV_ACTUALIZADO", { prorroga: "2026-09-01" });
    expect(valorDe(b, "GENERAL_CV_ACTUALIZADO").prorroga).toBeNull();
  });

  it("conserva la prorroga donde corresponde", () => {
    const b = conValor(borradorVacio(), "GENERAL_CERTIFICADOS_TRABAJO", {
      prorroga: "2026-09-01",
      prorrogaMotivo: "El empleador anterior la emite el proximo mes.",
    });
    expect(valorDe(b, "GENERAL_CERTIFICADOS_TRABAJO").prorroga).toBe("2026-09-01");
  });

  it("no muta el borrador anterior", () => {
    const antes = borradorVacio();
    const despues = conValor(antes, "GENERAL_REJAP", { estado: "ENTREGADO" });
    expect(valorDe(antes, "GENERAL_REJAP").estado).toBe("PENDIENTE");
    expect(valorDe(despues, "GENERAL_REJAP").estado).toBe("ENTREGADO");
  });

  it("archiva lo capturado en otra garantia al cambiar de modalidad", () => {
    let b = conTipoFuncionario(generalesCompletos(), "COMERCIAL");
    b = conGarantia(b, "TIPO_1");
    b = conValor(b, "COMERCIAL_T1_CI_GARANTE", { estado: "ENTREGADO" });

    expect(codigosDeOtrasGarantias(b, "TIPO_2")).toEqual(["COMERCIAL_T1_CI_GARANTE"]);

    const cambiado = conGarantia(b, "TIPO_2");
    expect(Object.keys(cambiado.valores)).toEqual([]);
    expect(cambiado.tipoGarantia).toBe("TIPO_2");
  });

  it("conserva los generales al cambiar de rama", () => {
    let b = conTipoFuncionario(generalesCompletos(), "CUMPLIMIENTO");
    b = conValor(b, "GENERAL_REJAP", { estado: "ENTREGADO" });
    b = conValor(b, "CUMPLIMIENTO_EXAMEN_UIF", { estado: "ENTREGADO" });

    const auditoria = conTipoFuncionario(b, "AUDITORIA");
    expect(valorDe(auditoria, "GENERAL_REJAP").estado).toBe("ENTREGADO");
    expect(Object.keys(auditoria.valores)).toEqual(["GENERAL_REJAP"]);
    expect(auditoria.tipoGarantia).toBeNull();
  });
});

/* ================================================================== */

describe("avance del expediente", () => {
  it("cuenta solo los requisitos aplicables a la rama", () => {
    const b = conTipoFuncionario(generalesCompletos(), "AUDITORIA");
    const resumen = resumenDe(b, HOY);
    expect(resumen.totalAplicable).toBe(19);
    expect(resumen.pendientes).toBe(19);
    expect(resumen.porcentajeResuelto).toBe(0);
  });

  it("trata N/A como resuelto sin penalizar", () => {
    let b = conTipoFuncionario(generalesCompletos(), "AUDITORIA");
    b = conValor(b, "GENERAL_CERTIFICADO_RC_IVA", { estado: "NO_APLICA" });
    const resumen = resumenDe(b, HOY);
    expect(resumen.noAplica).toBe(1);
    expect(resumen.porcentajeResuelto).toBe(5);
  });

  it("llega al cien por cien cuando todo esta resuelto", () => {
    let b = conTipoFuncionario(generalesCompletos(), "AUDITORIA");
    for (const req of requisitosAplicables("AUDITORIA")) {
      b = conValor(b, req.codigo, { estado: "ENTREGADO" });
    }
    const resumen = resumenDe(b, HOY);
    expect(resumen.entregados).toBe(19);
    expect(resumen.pendientes).toBe(0);
    expect(resumen.porcentajeResuelto).toBe(100);
  });

  it("detecta las prorrogas vencidas", () => {
    let b = conTipoFuncionario(generalesCompletos(), "AUDITORIA");
    b = conValor(b, "GENERAL_CERTIFICADOS_TRABAJO", { prorroga: "2026-08-01" });
    const resumen = resumenDe(b, HOY);
    expect(resumen.conProrroga).toBe(1);
    expect(resumen.prorrogasVencidas).toBe(1);
  });
});

/* ================================================================== */

describe("exportacion", () => {
  function expedienteDePrueba(): ExpedienteExportable {
    let b = conTipoFuncionario(generalesCompletos(), "AUDITORIA");
    b = conValor(b, "GENERAL_REJAP", {
      estado: "ENTREGADO",
      observacion: "Presentado en ventanilla.",
    });
    b = conValor(b, "GENERAL_CERTIFICADOS_TRABAJO", { prorroga: "2026-09-15" });
    return { ...b, expedienteId: "exp-0001" };
  }

  it("limpia los caracteres que Excel no admite en el nombre de una hoja", () => {
    const nombre = nombreHojaSeguro("Datos: 2026/07 [x]");
    expect(nombre.includes(":")).toBe(false);
    expect(nombre.includes("/")).toBe(false);
    expect(nombre.includes("[")).toBe(false);
  });

  it("corta el nombre de hoja en 31 caracteres", () => {
    expect(nombreHojaSeguro("A".repeat(60)).length).toBe(31);
  });

  it("desambigua nombres de hoja repetidos", () => {
    expect(nombreHojaSeguro("Requisitos", ["Requisitos"])).toBe("Requisitos (2)");
  });

  it("genera un nombre de archivo sin acentos ni espacios", () => {
    const nombre = nombreArchivoSeguro("Expediente Ana Pe\u00f1a", HOY);
    expect(nombre).toBe("Expediente-Ana-Pena-2026-08-12.xlsx");
  });

  it("neutraliza las formulas al exportar a CSV", () => {
    expect(neutralizarFormula("=SUMA(A1:A9)")).toBe("'=SUMA(A1:A9)");
    expect(neutralizarFormula("+1")).toBe("'+1");
    expect(neutralizarFormula("@aqui")).toBe("'@aqui");
    expect(neutralizarFormula("Texto normal")).toBe("Texto normal");
  });

  it("escapa las comillas en el CSV", () => {
    expect(aCsv([["dijo \"si\"", 3]])).toBe('"dijo ""si""",3');
  });

  it("produce un ZIP con la firma correcta", () => {
    const datos = construirLibro([{ nombre: "Hoja", filas: [["a", 1]] }], HOY);
    expect(datos[0]).toBe(0x50);
    expect(datos[1]).toBe(0x4b);
    expect(datos[2]).toBe(0x03);
    expect(datos[3]).toBe(0x04);
  });

  it("rechaza un libro sin hojas", () => {
    expect(() => construirLibro([], HOY)).toThrow();
  });

  it("exporta un expediente individual", () => {
    const archivo = exportarExpediente(expedienteDePrueba(), HOY);
    expect(archivo.nombre).toBe("expediente-8456872-105-2026-2026-08-12.xlsx");
    expect(archivo.datos.length).toBeGreaterThan(0);
  });

  it("exporta un lote y admite el historial", () => {
    const archivo = exportarLote([expedienteDePrueba()], { incluirHistorial: true }, HOY);
    expect(archivo.datos.length).toBeGreaterThan(0);
    expect(archivo.nombre.endsWith(".xlsx")).toBe(true);
  });

  it("se niega a exportar una seleccion vacia", () => {
    expect(() => exportarLote([], {}, HOY)).toThrow();
  });

  it("protege del lote desmedido salvo que se fuerce", () => {
    const muchos: ExpedienteExportable[] = [];
    for (let i = 0; i <= LIMITE_LOTE; i += 1) muchos.push(expedienteDePrueba());
    expect(() => exportarLote(muchos, {}, HOY)).toThrow();
  });
});
