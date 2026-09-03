/**
 * Contraste de los tokens del módulo, medido en los dos temas.
 *
 * ── Qué vigila esta prueba ──────────────────────────────────────────────────
 * Que TODO el texto del módulo cumpla WCAG AA (4.5:1 en texto normal, 3:1 en
 * texto grande) sobre las superficies reales en las que se pinta, en tema claro y
 * en tema oscuro. No mira capturas ni juzga a ojo: lee los valores declarados en
 * `src/index.css` y `documentacion.css`, compone las capas translúcidas y calcula
 * la relación.
 *
 * ── Por qué lee el CSS en lugar de una tabla en TypeScript ──────────────────
 * Porque los colores viven en el CSS y una tabla paralela se desincroniza el día
 * que alguien ajusta un tono «solo un poco». Si el CSS cambia, esta prueba mide
 * el valor nuevo. Si alguien mueve un token de sitio, la prueba falla al no
 * encontrarlo, que es exactamente lo que se quiere: obliga a mirar.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UMBRAL_AA_GRANDE,
  UMBRAL_AA_NORMAL,
  apilar,
  contraste,
  contrasteDe,
  componer,
  leerColor,
  luminancia,
  redondear,
} from "../domain/contraste";

const RAIZ = join(process.cwd(), "src");
const INDEX_CSS = readFileSync(join(RAIZ, "index.css"), "utf8");
const DOC_CSS = readFileSync(join(RAIZ, "features", "documentacion", "ui", "documentacion.css"), "utf8");

/**
 * Extrae las variables declaradas dentro de un selector.
 *
 * El recorte se hace por llaves equilibradas: `documentacion.css` tiene reglas
 * anidadas dentro de `@media`, y cortar por la primera `}` daría un bloque
 * incompleto y una prueba que mide la mitad de los tokens.
 */
function variablesDe(css: string, selector: string): Record<string, string> {
  const inicio = css.indexOf(selector);
  if (inicio < 0) throw new Error(`No se encontró el selector «${selector}».`);
  const abre = css.indexOf("{", inicio);
  if (abre < 0) throw new Error(`El selector «${selector}» no abre bloque.`);
  let profundidad = 0;
  let cierre = abre;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === "{") profundidad += 1;
    else if (css[i] === "}") {
      profundidad -= 1;
      if (profundidad === 0) {
        cierre = i;
        break;
      }
    }
  }
  const bloque = css.slice(abre + 1, cierre);
  const salida: Record<string, string> = {};
  for (const linea of bloque.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    salida[linea[1]] = linea[2].trim();
  }
  return salida;
}

const RAIZ_OSCURA = variablesDe(INDEX_CSS, ":root");
const RAIZ_CLARA = variablesDe(INDEX_CSS, ".light {");
const DOC_OSCURO = variablesDe(DOC_CSS, ".doc-console {");
const DOC_CLARO = variablesDe(DOC_CSS, ".light .doc-console");

/** Tokens de un tema: los del módulo, con la raíz de la aplicación por debajo. */
function tema(claro: boolean): Record<string, string> {
  return claro ? { ...RAIZ_OSCURA, ...RAIZ_CLARA, ...DOC_OSCURO, ...DOC_CLARO } : { ...RAIZ_OSCURA, ...DOC_OSCURO };
}

/** Resuelve un token, siguiendo un nivel de `var(--otro)`. */
function valor(tokens: Record<string, string>, nombre: string): string {
  const crudo = tokens[nombre];
  if (!crudo) throw new Error(`Falta el token ${nombre}.`);
  const referencia = crudo.match(/^var\((--[a-z0-9-]+)\)$/);
  if (referencia) return valor(tokens, referencia[1]);
  return crudo;
}

/**
 * Superficies del módulo, de la más baja a la más alta.
 *
 * `--app-base` es el fondo opaco de la página; el resto son capas translúcidas
 * que se apilan encima. Se mide contra las tres porque el texto secundario
 * aparece en las tres: el panel de sección es `--doc-surface-raised`, la tabla es
 * `--doc-surface` y el fondo hundido de una ficha es `--doc-surface-sunken`.
 */
function superficies(tokens: Record<string, string>): { nombre: string; fondo: ReturnType<typeof leerColor> }[] {
  const base = leerColor(valor(tokens, "--app-base"))!;
  const capa = (nombre: string) => apilar(base, leerColor(valor(tokens, nombre))!);
  return [
    { nombre: "fondo de la aplicación", fondo: base },
    { nombre: "--doc-surface", fondo: capa("--doc-surface") },
    { nombre: "--doc-surface-raised", fondo: capa("--doc-surface-raised") },
    { nombre: "--doc-surface-sunken", fondo: capa("--doc-surface-sunken") },
  ];
}

const TEMAS: { etiqueta: string; claro: boolean }[] = [
  { etiqueta: "tema oscuro", claro: false },
  { etiqueta: "tema claro", claro: true },
];

describe("documentación · contraste de la escala de tinta", () => {
  for (const { etiqueta, claro } of TEMAS) {
    it(`${etiqueta}: el texto principal, el secundario y el tenue cumplen AA en toda superficie`, () => {
      const tokens = tema(claro);
      const problemas: string[] = [];
      for (const token of ["--doc-text", "--doc-text-muted", "--doc-text-faint"]) {
        const color = leerColor(valor(tokens, token))!;
        for (const superficie of superficies(tokens)) {
          const ratio = contraste(color, superficie.fondo!);
          if (ratio < UMBRAL_AA_NORMAL) {
            problemas.push(`${token} sobre ${superficie.nombre}: ${redondear(ratio)}:1`);
          }
        }
      }
      expect(problemas, problemas.join(" · ")).toEqual([]);
    });

    it(`${etiqueta}: la escala de tinta va de más a menos contraste, sin saltos invertidos`, () => {
      const tokens = tema(claro);
      const base = superficies(tokens)[2].fondo!;
      const principal = contraste(leerColor(valor(tokens, "--doc-text"))!, base);
      const secundario = contraste(leerColor(valor(tokens, "--doc-text-muted"))!, base);
      const tenue = contraste(leerColor(valor(tokens, "--doc-text-faint"))!, base);
      // Una escala en la que el «tenue» contrasta más que el «secundario» no es
      // una escala: es un accidente, y se nota en pantalla como jerarquía rota.
      expect(principal).toBeGreaterThan(secundario);
      expect(secundario).toBeGreaterThanOrEqual(tenue);
    });

    it(`${etiqueta}: los textos de estado cumplen AA sobre su propio tinte`, () => {
      const tokens = tema(claro);
      const base = leerColor(valor(tokens, "--app-base"))!;
      const estados = ["success", "info", "warning", "extension", "danger", "accent", "offline"];
      const problemas: string[] = [];
      for (const estado of estados) {
        const texto = leerColor(valor(tokens, `--doc-${estado}-fg`))!;
        // El chip se pinta sobre la superficie elevada, no sobre el fondo pelado.
        const fondo = apilar(
          base,
          leerColor(valor(tokens, "--doc-surface-raised"))!,
          leerColor(valor(tokens, `--doc-${estado}-bg`))!,
        );
        const ratio = contraste(texto, fondo);
        if (ratio < UMBRAL_AA_NORMAL) problemas.push(`--doc-${estado}-fg sobre su tinte: ${redondear(ratio)}:1`);
      }
      expect(problemas, problemas.join(" · ")).toEqual([]);
    });

    it(`${etiqueta}: el color sólido de estado sirve de relleno grande, no de texto fino`, () => {
      const tokens = tema(claro);
      const base = leerColor(valor(tokens, "--app-base"))!;
      const superficie = apilar(base, leerColor(valor(tokens, "--doc-surface-raised"))!);
      const problemas: string[] = [];
      // `--doc-<estado>` se usa para barras, puntos y cintas: elementos gráficos,
      // que la WCAG mide con el umbral de 3:1.
      for (const estado of ["success", "info", "warning", "extension", "danger", "accent", "offline"]) {
        const ratio = contraste(leerColor(valor(tokens, `--doc-${estado}`))!, superficie);
        if (ratio < UMBRAL_AA_GRANDE) problemas.push(`--doc-${estado}: ${redondear(ratio)}:1`);
      }
      expect(problemas, problemas.join(" · ")).toEqual([]);
    });

    it(`${etiqueta}: el anillo de foco se distingue de la superficie que rodea`, () => {
      const tokens = tema(claro);
      const superficie = apilar(
        leerColor(valor(tokens, "--app-base"))!,
        leerColor(valor(tokens, "--doc-surface-raised"))!,
      );
      const ratio = contraste(leerColor(valor(tokens, "--doc-focus"))!, superficie);
      expect(redondear(ratio), `--doc-focus: ${redondear(ratio)}:1`).toBeGreaterThanOrEqual(UMBRAL_AA_GRANDE);
    });
  }

  it("los tonos compartidos de la aplicación también cumplen AA en los dos temas", () => {
    const problemas: string[] = [];
    for (const { etiqueta, claro } of TEMAS) {
      const tokens = tema(claro);
      const base = leerColor(valor(tokens, "--app-base"))!;
      for (const tono of ["neutral", "info", "exito", "aviso", "peligro", "acento"]) {
        const fondo = apilar(base, leerColor(valor(tokens, `--tone-${tono}-bg`))!);
        const ratio = contraste(leerColor(valor(tokens, `--tone-${tono}-fg`))!, fondo);
        if (ratio < UMBRAL_AA_NORMAL) problemas.push(`${etiqueta} · --tone-${tono}-fg: ${redondear(ratio)}:1`);
      }
    }
    expect(problemas, problemas.join(" · ")).toEqual([]);
  });
});

describe("documentación · el medidor de contraste", () => {
  it("compone la transparencia antes de medir", () => {
    // Un gris al 50 % sobre blanco es un gris claro: si se midiera el color
    // declarado en lugar del compuesto, saldría el contraste del gris opaco y la
    // comprobación pasaría con un texto que no se lee.
    const opaco = contrasteDe("#808080", "#ffffff");
    const translucido = contrasteDe("rgba(128, 128, 128, 0.5)", "#ffffff");
    expect(redondear(opaco)).toBeGreaterThan(redondear(translucido));
    expect(redondear(translucido)).toBeLessThan(UMBRAL_AA_NORMAL);
  });

  it("el blanco sobre negro da el máximo y un color sobre sí mismo da 1", () => {
    expect(redondear(contrasteDe("#ffffff", "#000000"))).toBe(21);
    expect(redondear(contrasteDe("#005baa", "#005baa"))).toBe(1);
  });

  it("lee las cuatro notaciones de color que usa el proyecto", () => {
    expect(leerColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(leerColor("#0a2747")).toEqual({ r: 10, g: 39, b: 71, a: 1 });
    expect(leerColor("rgb(4, 18, 42)")).toEqual({ r: 4, g: 18, b: 42, a: 1 });
    expect(leerColor("rgba(255, 255, 255, 0.07)")).toEqual({ r: 255, g: 255, b: 255, a: 0.07 });
    expect(leerColor("var(--ink)")).toBeNull();
  });

  it("apilar tres capas translúcidas da el mismo color que apilarlas de dos en dos", () => {
    const base = leerColor("#04122a")!;
    const capa1 = leerColor("rgba(255, 255, 255, 0.07)")!;
    const capa2 = leerColor("rgba(34, 211, 238, 0.14)")!;
    const deUnaVez = apilar(base, capa1, capa2);
    const porPasos = componer(capa2, componer(capa1, base));
    expect(redondear(luminancia(deUnaVez))).toBe(redondear(luminancia(porPasos)));
  });
});
