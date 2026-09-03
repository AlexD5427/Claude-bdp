import { describe, expect, it } from "vitest";
import { INTENT, type Intent } from "../tokens";
import { cumpleAA, parsearColor, relacionContraste, UMBRAL_AA } from "../contraste";

/**
 * Contraste de los tokens de color, en los DOS temas.
 *
 * ── El fallo que esta prueba impide que vuelva ──────────────────────────────
 * El módulo de Documentación tenía texto gris sobre blanco en tema claro
 * (`--ink-faint: rgba(13, 47, 84, 0.5)` sobre blanco = **2.99:1**, por debajo
 * incluso del umbral de texto grande) y chips pensados solo para fondo oscuro
 * (`text-cyan-200`, `text-emerald-200`… sobre su tinte al 14 % en blanco:
 * alrededor de **2:1**). Nada de eso lo detecta un compilador, y a ojo no se
 * distingue un 3.1:1 de un 4.6:1: son dos grises parecidos, uno legal y otro no.
 *
 * Así que se calcula. Los valores viven en variables CSS —cada tema con el
 * suyo— y aquí se recorren los pares (texto sobre su fondo, y ese fondo sobre la
 * superficie de la página) comprobando WCAG AA. Si alguien vuelve a poner un
 * tono 200 en el tema claro, la suite falla con el número exacto.
 *
 * Los valores se declaran aquí como copia literal de `src/index.css` porque una
 * hoja de estilos no se puede consultar sin navegador. La prueba
 * `qa/sonda-contraste.mjs` cierra el círculo: mide el contraste EFECTIVO de
 * texto ya pintado en Chromium, con el CSS de verdad aplicado.
 */

/** Superficie de la página en cada tema. */
const BASE = {
  oscuro: "#04122a",
  claro: "#ffffff",
} as const;

/**
 * Escala de tinta del módulo, tal como la declara `documentacion.css`.
 *
 * Se comprueba sobre las tres superficies reales del módulo, porque una
 * superficie translúcida cambia el contraste efectivo del texto que cae encima.
 */
const TINTA = {
  oscuro: {
    texto: "#f8fafc",
    secundario: "#c3d0e0",
    tenue: "#9fb0c6",
    superficies: ["rgba(255, 255, 255, 0.07)", "rgba(255, 255, 255, 0.04)", "rgba(2, 12, 28, 0.28)"],
  },
  claro: {
    texto: "#0a2747",
    secundario: "#33506f",
    tenue: "#4f6a86",
    superficies: ["rgba(255, 255, 255, 0.86)", "rgba(255, 255, 255, 0.62)", "rgba(8, 47, 95, 0.06)"],
  },
} as const;

/** Escala de tinta global de la aplicación (`src/index.css`). */
const INK = {
  oscuro: { ink: "#f8fafc", soft: "rgba(226, 232, 240, 0.72)", faint: "rgba(226, 232, 240, 0.62)" },
  claro: { ink: "#0a2747", soft: "#33506f", faint: "#4f6a86" },
} as const;

/** Intenciones semánticas, con el valor de cada tema. */
const INTENCIONES = {
  oscuro: {
    neutral: { bg: "rgba(255, 255, 255, 0.1)", fg: "#dbe4f0", dot: "#94a3b8" },
    info: { bg: "rgba(34, 211, 238, 0.16)", fg: "#a5f3fc", dot: "#22d3ee" },
    success: { bg: "rgba(16, 185, 129, 0.16)", fg: "#a7f3d0", dot: "#34d399" },
    warning: { bg: "rgba(245, 158, 11, 0.16)", fg: "#fde68a", dot: "#fbbf24" },
    danger: { bg: "rgba(244, 63, 94, 0.18)", fg: "#fecdd3", dot: "#fb7185" },
    accent: { bg: "rgba(99, 102, 241, 0.2)", fg: "#c7d2fe", dot: "#818cf8" },
  },
  claro: {
    neutral: { bg: "rgba(8, 47, 95, 0.08)", fg: "#274563", dot: "#475569" },
    info: { bg: "rgba(6, 182, 212, 0.14)", fg: "#155e75", dot: "#0e7490" },
    success: { bg: "rgba(16, 185, 129, 0.14)", fg: "#065f46", dot: "#047857" },
    warning: { bg: "rgba(245, 158, 11, 0.18)", fg: "#7c2d12", dot: "#b45309" },
    danger: { bg: "rgba(244, 63, 94, 0.13)", fg: "#9f1239", dot: "#be123c" },
    accent: { bg: "rgba(99, 102, 241, 0.13)", fg: "#3730a3", dot: "#4338ca" },
  },
} as const;

const TEMAS = ["oscuro", "claro"] as const;

describe("contraste · utilidades de cálculo", () => {
  it("interpreta las formas de color que usa el sistema", () => {
    expect(parsearColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parsearColor("#0a2747")).toEqual({ r: 10, g: 39, b: 71, a: 1 });
    expect(parsearColor("rgba(13, 47, 84, 0.5)")).toEqual({ r: 13, g: 47, b: 84, a: 0.5 });
    // Una variable CSS sin resolver NO se interpreta como negro: devolvería un
    // contraste altísimo y la comprobación pasaría sin haber mirado nada.
    expect(parsearColor("var(--doc-text)")).toBeNull();
  });

  it("reproduce los extremos conocidos", () => {
    expect(relacionContraste("#000000", "#ffffff")!).toBeCloseTo(21, 1);
    expect(relacionContraste("#ffffff", "#ffffff")!).toBeCloseTo(1, 2);
  });

  it("compone el color translúcido sobre su fondo antes de medir", () => {
    /* Es el paso que se olvida siempre: `rgba(13,47,84,0.5)` no es un color, es
       una instrucción. Medido como opaco daría 12.7:1; compuesto sobre blanco,
       los 2.99:1 reales que hacían ilegible el tema claro. */
    const real = relacionContraste("rgba(13, 47, 84, 0.5)", "#ffffff", "#ffffff")!;
    expect(real).toBeLessThan(3.1);
    expect(relacionContraste("#0d2f54", "#ffffff")!).toBeGreaterThan(10);
  });
});

describe("contraste · escala de tinta del módulo", () => {
  for (const tema of TEMAS) {
    const tinta = TINTA[tema];
    for (const superficie of tinta.superficies) {
      it(`tema ${tema}: los tres niveles de tinta cumplen AA sobre ${superficie}`, () => {
        for (const [nombre, color] of [
          ["texto", tinta.texto],
          ["secundario", tinta.secundario],
          ["tenue", tinta.tenue],
        ] as const) {
          const ratio = relacionContraste(color, superficie, BASE[tema]);
          expect(ratio, `${tema}/${nombre} sobre ${superficie}`).not.toBeNull();
          expect(
            ratio!,
            `${tema}/${nombre} sobre ${superficie} da ${ratio!.toFixed(2)}:1 y AA exige ${UMBRAL_AA.normal}:1`,
          ).toBeGreaterThanOrEqual(UMBRAL_AA.normal);
        }
      });
    }
  }

  for (const tema of TEMAS) {
    it(`tema ${tema}: la escala de tinta global también cumple AA`, () => {
      const ink = INK[tema];
      for (const [nombre, color] of Object.entries(ink)) {
        const ratio = relacionContraste(color, BASE[tema], BASE[tema]);
        expect(ratio, `${tema}/--ink-${nombre}`).not.toBeNull();
        expect(ratio!, `${tema}/--ink-${nombre} da ${ratio!.toFixed(2)}:1`).toBeGreaterThanOrEqual(UMBRAL_AA.normal);
      }
    });
  }
});

describe("contraste · intenciones semánticas", () => {
  const claves: Intent[] = ["neutral", "info", "success", "warning", "danger", "accent"];

  for (const tema of TEMAS) {
    it(`tema ${tema}: el texto de cada chip cumple AA sobre su propio tinte`, () => {
      for (const clave of claves) {
        const { bg, fg } = INTENCIONES[tema][clave];
        const ratio = relacionContraste(fg, bg, BASE[tema]);
        expect(ratio, `${tema}/${clave}`).not.toBeNull();
        expect(
          ratio!,
          `${tema}/${clave}: el texto ${fg} sobre ${bg} da ${ratio!.toFixed(2)}:1 y AA exige ${UMBRAL_AA.normal}:1`,
        ).toBeGreaterThanOrEqual(UMBRAL_AA.normal);
      }
    });

    it(`tema ${tema}: el punto de color se distingue del fondo de la página`, () => {
      for (const clave of claves) {
        const { dot } = INTENCIONES[tema][clave];
        // Un punto es un componente de interfaz: le basta el umbral de 3:1.
        expect(cumpleAA(dot, BASE[tema], BASE[tema], true), `${tema}/${clave} punto ${dot}`).toBe(true);
      }
    });
  }

  it("los tokens de `INTENT` referencian variables CSS, no colores fijos", () => {
    /* Es la parte estructural: si alguien vuelve a escribir `text-cyan-200`, el
       tema claro deja de tener su propio valor y el cálculo de arriba dejaría de
       representar lo que se pinta. */
    for (const clave of Object.keys(INTENT) as Intent[]) {
      const estilo = INTENT[clave];
      expect(estilo.chip, `INTENT.${clave}.chip`).toContain("var(--intent-");
      expect(estilo.text, `INTENT.${clave}.text`).toContain("var(--intent-");
      expect(estilo.dot, `INTENT.${clave}.dot`).toContain("var(--intent-");
      // Y ni un tono de Tailwind cableado.
      expect(estilo.chip).not.toMatch(/-(?:100|200|300)\b/);
    }
  });
});
