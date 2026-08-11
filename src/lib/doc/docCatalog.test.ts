import { describe, expect, it } from "vitest";
import {
  CATALOGO_DOCUMENTAL,
  DOC_ESTADO_ORDEN,
  TIPOS_FUNCIONARIO,
  TIPOS_GARANTIA,
  aEstadoCanonico,
  aEstadoLegado,
  diasRestantes,
  estadoGeneralDe,
  estadoProrroga,
  puedeRegistrarse,
  requisitosAplicables,
  requisitosEspeciales,
  requisitosGenerales,
  requisitosProrrogables,
  resumenAvance,
  type DocEstado,
  type EntradaAvance,
} from "./docCatalog";

/** 10 de marzo de 2026, hora local. Fija el calculo de dias restantes. */
const HOY = new Date(2026, 2, 10);

const GENERALES_ENTREGADOS: EntradaAvance[] = requisitosGenerales().map((r) => ({
  codigo: r.codigo,
  estado: "ENTREGADO",
}));

describe("documentos generales", () => {
  it("son dieciocho y conservan el orden del area", () => {
    const codigos = requisitosGenerales().map((r) => r.codigo);
    expect(codigos).toHaveLength(18);
    expect(codigos[0]).toBe("GENERAL_FOTOGRAFIA_4X4");
    expect(codigos[8]).toBe("GENERAL_CERTIFICADOS_TRABAJO");
    expect(codigos[17]).toBe("GENERAL_CARNET_HEREDERO_CONTRATO");
  });

  it("cada uno lleva su propio texto de observacion", () => {
    for (const r of requisitosGenerales()) {
      expect(r.observacionEtiqueta.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("estados", () => {
  it("ofrece los chips en el orden pedido", () => {
    expect([...DOC_ESTADO_ORDEN]).toEqual(["ENTREGADO", "PENDIENTE", "NO_ENTREGADO"]);
  });

  it("admite N/A solo donde el area lo definio", () => {
    const conNA = CATALOGO_DOCUMENTAL.filter((r) => r.permiteNA)
      .map((r) => r.codigo)
      .sort();
    expect(conNA).toEqual([
      "COMERCIAL_T2_FORMULARIOS_200_400",
      "GENERAL_CERTIFICADO_RC_IVA",
      "GENERAL_TITULO_ACADEMICO_LEGALIZADO",
    ]);
  });

  it("coloca N/A siempre en cuarto lugar", () => {
    for (const r of CATALOGO_DOCUMENTAL) {
      expect(r.estados).toHaveLength(r.permiteNA ? 4 : 3);
      if (r.permiteNA) expect(r.estados[3]).toBe("NO_APLICA");
    }
  });

  it("traduce los valores que ya existen en el libro", () => {
    expect(aEstadoCanonico("presentado")).toBe("ENTREGADO");
    expect(aEstadoCanonico("observado")).toBe("NO_ENTREGADO");
    expect(aEstadoCanonico("NO ENTREGADO")).toBe("NO_ENTREGADO");
    expect(aEstadoCanonico("NO APLICA")).toBe("NO_APLICA");
    expect(aEstadoCanonico("N/A")).toBe("NO_APLICA");
    expect(aEstadoCanonico("TIENE")).toBe("ENTREGADO");
  });

  it("ante un valor desconocido no inventa nada", () => {
    expect(aEstadoCanonico("cualquier cosa")).toBe("PENDIENTE");
    expect(aEstadoCanonico(undefined)).toBe("PENDIENTE");
    expect(aEstadoCanonico(null)).toBe("PENDIENTE");
  });

  it("va y vuelve del vocabulario anterior sin perder informacion", () => {
    const todos: DocEstado[] = ["ENTREGADO", "PENDIENTE", "NO_ENTREGADO", "NO_APLICA"];
    for (const e of todos) expect(aEstadoCanonico(aEstadoLegado(e))).toBe(e);
  });
});

describe("prorrogas", () => {
  it("solo las admiten los dos requisitos definidos", () => {
    expect(requisitosProrrogables().map((r) => r.codigo).sort()).toEqual([
      "GENERAL_CERTIFICADOS_TRABAJO",
      "GENERAL_TITULO_ACADEMICO_LEGALIZADO",
    ]);
  });

  it("ambos traen la etiqueta que se muestra al conceder el plazo", () => {
    for (const r of requisitosProrrogables()) {
      expect(r.prorrogaEtiqueta ?? "").not.toBe("");
    }
  });

  it("cuenta los dias sin desplazarse por la zona horaria", () => {
    expect(diasRestantes("2026-03-20", HOY)).toBe(10);
    expect(diasRestantes("2026-03-10", HOY)).toBe(0);
    expect(diasRestantes("2026-03-01", HOY)).toBe(-9);
  });

  it("rechaza una fecha que no sea yyyy-MM-dd", () => {
    expect(diasRestantes("10/03/2026", HOY)).toBeNull();
    expect(estadoProrroga("10/03/2026", HOY)).toBe("invalida");
  });

  it("distingue vigente, por vencer y vencida", () => {
    expect(estadoProrroga("2026-05-01", HOY)).toBe("vigente");
    expect(estadoProrroga("2026-03-15", HOY)).toBe("por_vencer");
    expect(estadoProrroga("2026-03-01", HOY)).toBe("vencida");
    expect(estadoProrroga(undefined, HOY)).toBe("sin_prorroga");
  });
});

describe("ramas", () => {
  it("declara los cuatro tipos y las tres garantias", () => {
    expect(TIPOS_FUNCIONARIO).toHaveLength(4);
    expect(TIPOS_GARANTIA).toHaveLength(3);
  });

  it("deja Ejecutivo o Directorio visible pero no registrable", () => {
    expect(puedeRegistrarse("EJECUTIVO")).toBe(false);
    expect(puedeRegistrarse("COMERCIAL")).toBe(true);
    expect(requisitosEspeciales("EJECUTIVO")).toHaveLength(0);
  });

  it("solo el area comercial pide tipo de garantia", () => {
    const conGarantia = TIPOS_FUNCIONARIO.filter((t) => t.requiereGarantia);
    expect(conGarantia.map((t) => t.codigo)).toEqual(["COMERCIAL"]);
  });

  it("entrega los requisitos de cada modalidad", () => {
    expect(requisitosEspeciales("COMERCIAL", "TIPO_1")).toHaveLength(5);
    expect(requisitosEspeciales("COMERCIAL", "TIPO_2")).toHaveLength(9);
    expect(requisitosEspeciales("COMERCIAL", "TIPO_3")).toHaveLength(5);
    expect(requisitosEspeciales("AUDITORIA")).toHaveLength(1);
    expect(requisitosEspeciales("CUMPLIMIENTO")).toHaveLength(2);
  });

  it("no arrastra requisitos si aun no se eligio la garantia", () => {
    expect(requisitosEspeciales("COMERCIAL")).toHaveLength(0);
    expect(requisitosEspeciales(null)).toHaveLength(0);
  });

  it("nunca mezcla modalidades", () => {
    for (const r of requisitosEspeciales("COMERCIAL", "TIPO_1")) {
      expect(r.tipoGarantia).toBe("TIPO_1");
    }
  });

  it("suma generales mas especiales", () => {
    expect(requisitosAplicables("AUDITORIA")).toHaveLength(19);
    expect(requisitosAplicables("CUMPLIMIENTO")).toHaveLength(20);
    expect(requisitosAplicables("COMERCIAL", "TIPO_2")).toHaveLength(27);
  });
});

describe("integridad del catalogo", () => {
  it("no repite codigos", () => {
    const codigos = CATALOGO_DOCUMENTAL.map((r) => r.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("nunca usa la etiqueta visible como identificador", () => {
    for (const r of CATALOGO_DOCUMENTAL) expect(r.codigo).not.toBe(r.etiqueta);
  });

  it("no repite el orden dentro de un mismo bloque", () => {
    const bloques = new Map<string, number[]>();
    for (const r of CATALOGO_DOCUMENTAL) {
      const clave = `${r.seccion}|${r.tipoFuncionario ?? "-"}|${r.tipoGarantia ?? "-"}`;
      bloques.set(clave, [...(bloques.get(clave) ?? []), r.orden]);
    }
    for (const ordenes of bloques.values()) {
      expect(new Set(ordenes).size).toBe(ordenes.length);
    }
  });
});

describe("avance", () => {
  it("mide contra la rama del expediente y no contra el catalogo entero", () => {
    const r = resumenAvance(
      [...GENERALES_ENTREGADOS, { codigo: "COMERCIAL_T1_CI_GARANTE", estado: "PENDIENTE" }],
      "AUDITORIA",
    );
    expect(r.totalAplicable).toBe(19);
    expect(r.porcentajeResuelto).toBe(95);
  });

  it("llega a cien cuando la rama tambien esta cubierta", () => {
    const r = resumenAvance(
      [
        ...GENERALES_ENTREGADOS,
        { codigo: "AUDITORIA_DECLARACION_IMPEDIMENTO", estado: "ENTREGADO" },
      ],
      "AUDITORIA",
    );
    expect(r.porcentajeResuelto).toBe(100);
  });

  it("trata un requisito sin registro como pendiente", () => {
    expect(resumenAvance([], "AUDITORIA").pendientes).toBe(19);
  });

  it("no penaliza un N/A legitimo", () => {
    const r = resumenAvance(
      [
        ...GENERALES_ENTREGADOS.filter((e) => e.codigo !== "GENERAL_CERTIFICADO_RC_IVA"),
        { codigo: "GENERAL_CERTIFICADO_RC_IVA", estado: "NO_APLICA" },
        { codigo: "AUDITORIA_DECLARACION_IMPEDIMENTO", estado: "ENTREGADO" },
      ],
      "AUDITORIA",
    );
    expect(r.noAplica).toBe(1);
    expect(r.porcentajeResuelto).toBe(100);
  });

  it("degrada un N/A puesto donde no corresponde en vez de regalar avance", () => {
    const r = resumenAvance([{ codigo: "GENERAL_REJAP", estado: "NO_APLICA" }], "AUDITORIA");
    expect(r.noAplica).toBe(0);
    expect(r.pendientes).toBe(19);
  });

  it("contabiliza prorrogas y detecta las vencidas", () => {
    const r = resumenAvance(
      [{ codigo: "GENERAL_CERTIFICADOS_TRABAJO", estado: "PENDIENTE", prorroga: "2026-03-01" }],
      "AUDITORIA",
      null,
      HOY,
    );
    expect(r.conProrroga).toBe(1);
    expect(r.prorrogasVencidas).toBe(1);
  });

  it("ignora una prorroga en un requisito que no la admite", () => {
    const r = resumenAvance(
      [{ codigo: "GENERAL_REJAP", estado: "PENDIENTE", prorroga: "2026-05-01" }],
      "AUDITORIA",
      null,
      HOY,
    );
    expect(r.conProrroga).toBe(0);
  });
});

describe("estado general", () => {
  const completo = resumenAvance(
    [...GENERALES_ENTREGADOS, { codigo: "AUDITORIA_DECLARACION_IMPEDIMENTO", estado: "ENTREGADO" }],
    "AUDITORIA",
  );

  it("reconoce el expediente completo", () => {
    expect(estadoGeneralDe(completo)).toBe("COMPLETO");
  });

  it("respeta la precedencia de borrador y archivado", () => {
    expect(estadoGeneralDe(completo, { borrador: true })).toBe("BORRADOR");
    expect(estadoGeneralDe(completo, { borrador: true, archivado: true })).toBe("ARCHIVADO");
  });

  it("da mas peso a la prorroga vigente que al atraso", () => {
    const r = resumenAvance(
      [
        { codigo: "GENERAL_CERTIFICADOS_TRABAJO", estado: "PENDIENTE", prorroga: "2026-05-01" },
        { codigo: "GENERAL_REJAP", estado: "NO_ENTREGADO" },
      ],
      "AUDITORIA",
      null,
      HOY,
    );
    expect(estadoGeneralDe(r)).toBe("CON_PRORROGA");
  });

  it("marca observado cuando hay faltantes sin plazo", () => {
    const r = resumenAvance([{ codigo: "GENERAL_REJAP", estado: "NO_ENTREGADO" }], "AUDITORIA", null, HOY);
    expect(estadoGeneralDe(r)).toBe("OBSERVADO");
  });
});
