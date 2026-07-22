import { describe, expect, it } from "vitest";
import {
  splitPipes,
  joinPipes,
  toRawPerfilCargo,
  normalisePerfilCargo,
  isValidEvaluarUrl,
  isLikelyUrl,
  validateForm,
  emptyForm,
  toForm,
  PERFIL_CARGO_HEADERS,
  MAX_IMAGENES,
  type PerfilCargoForm,
} from "./perfilCargo";
import type { RawPerfilCargo } from "../types";

describe("pipe rule", () => {
  it("splits a real cell into bullet segments", () => {
    const cell =
      "Conocimientos sólidos en Normas contables. | Conocimientos sólidos en NAGA. | Conocimientos sólidos en NIA.";
    expect(splitPipes(cell)).toEqual([
      "Conocimientos sólidos en Normas contables.",
      "Conocimientos sólidos en NAGA.",
      "Conocimientos sólidos en NIA.",
    ]);
  });

  it("is tolerant of odd spacing and empty segments", () => {
    expect(splitPipes("uno |dos|  tres |")).toEqual(["uno", "dos", "tres"]);
    expect(splitPipes("")).toEqual([]);
    expect(splitPipes(undefined)).toEqual([]);
  });

  it("joins entries back with the exact ' | ' separator", () => {
    expect(joinPipes(["uno", "dos", "tres"])).toBe("uno | dos | tres");
    // Drops blank entries so no stray separators are written.
    expect(joinPipes(["uno", "  ", "dos"])).toBe("uno | dos");
  });
});

describe("serialisation", () => {
  const form: PerfilCargoForm = {
    areaCargo: "Gerencia de Auditoría Interna",
    puestoBdp: "Auditor Operativo",
    gestionBdp: "2026",
    formacionPrincipal: ["Licenciatura en Auditoría."],
    formacionComplementaria: ["Diplomado NIA", "Curso de fideicomisos"],
    experienciaGeneral: ["3 años en el sistema financiero."],
    experienciaEspecifica: [],
    conocimientosTecnicos: ["NAGA", "NIA"],
    conocimientosGenericos: ["Ofimática"],
    conductasRequeridas: ["Integridad"],
    competenciasRequeridas: ["Orientación a resultados"],
    linkEvaluar: "https://bdp.evaluar.com/trabajo/auditor-operativo-la-paz/",
    imagenes: ["https://x/1.jpg", "https://x/2.jpg"],
  };

  it("writes list fields with the pipe separator and accented headers", () => {
    const raw = toRawPerfilCargo(form);
    expect(raw["formación_complementaria"]).toBe("Diplomado NIA | Curso de fideicomisos");
    expect(raw["conocimientos_genéricos"]).toBe("Ofimática");
    expect(raw.conocimientos_tecnicos).toBe("NAGA | NIA");
  });

  it("fills exactly ten image slots, compacted from slot 1", () => {
    const raw = toRawPerfilCargo(form);
    expect(raw.link_img_1).toBe("https://x/1.jpg");
    expect(raw.link_img_2).toBe("https://x/2.jpg");
    expect(raw.link_img_3).toBe("");
    for (let i = 1; i <= MAX_IMAGENES; i++) expect(raw).toHaveProperty(`link_img_${i}`);
  });

  it("round-trips through normalise → form", () => {
    const raw: RawPerfilCargo = { ...toRawPerfilCargo(form), _fila: 5 };
    const p = normalisePerfilCargo(raw, 0);
    expect(p.fila).toBe(5);
    expect(p.puestoBdp).toBe("Auditor Operativo");
    expect(p.conocimientosTecnicos).toEqual(["NAGA", "NIA"]);
    expect(p.imagenes).toEqual(["https://x/1.jpg", "https://x/2.jpg"]);
    // toForm keeps at least one editable row per list.
    const back = toForm(p);
    expect(back.experienciaEspecifica).toEqual([""]);
    expect(back.formacionComplementaria).toEqual(["Diplomado NIA", "Curso de fideicomisos"]);
  });

  it("keeps the header contract stable (22 columns)", () => {
    expect(PERFIL_CARGO_HEADERS).toHaveLength(22);
    expect(PERFIL_CARGO_HEADERS[0]).toBe("area_cargo");
    expect(PERFIL_CARGO_HEADERS).toContain("formación_complementaria");
    expect(PERFIL_CARGO_HEADERS).toContain("conocimientos_genéricos");
    expect(PERFIL_CARGO_HEADERS[PERFIL_CARGO_HEADERS.length - 1]).toBe("link_img_10");
  });
});

describe("validation", () => {
  it("accepts the documented Evaluar link shapes", () => {
    expect(isValidEvaluarUrl("https://bdp.evaluar.com/trabajo/auditor-operativo-plazo-fijo-la-paz/")).toBe(true);
    expect(isValidEvaluarUrl("https://bdp.evaluar.com/trabajo/jefe-supervisor-comercial-2026/")).toBe(true);
    expect(isValidEvaluarUrl("https://bdp.evaluar.com/trabajo/oficial-de-creditos-2026")).toBe(true);
  });

  it("rejects malformed or foreign links", () => {
    expect(isValidEvaluarUrl("http://bdp.evaluar.com/trabajo/x/")).toBe(false); // not https
    expect(isValidEvaluarUrl("https://evaluar.com/x")).toBe(false); // no subdomain/trabajo
    expect(isValidEvaluarUrl("https://example.com/trabajo/x/")).toBe(false);
    expect(isValidEvaluarUrl("")).toBe(false);
  });

  it("checks http(s) image urls", () => {
    expect(isLikelyUrl("https://x/a.png")).toBe(true);
    expect(isLikelyUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isLikelyUrl("not a url")).toBe(false);
  });

  it("flags missing required fields", () => {
    const errs = validateForm(emptyForm());
    expect(errs.some((e) => /Área/.test(e))).toBe(true);
    expect(errs.some((e) => /Puesto/.test(e))).toBe(true);
    expect(errs.some((e) => /Formación Principal/.test(e))).toBe(true);
    expect(errs.some((e) => /Experiencia General/.test(e))).toBe(true);
  });

  it("passes a complete form", () => {
    const good: PerfilCargoForm = {
      ...emptyForm(),
      areaCargo: "Gerencia X",
      puestoBdp: "Cargo Y",
      gestionBdp: "2026",
      formacionPrincipal: ["Título"],
      experienciaGeneral: ["Experiencia"],
    };
    expect(validateForm(good)).toEqual([]);
  });
});
