/**
 * Contraste de los tokens del módulo, en los dos temas.
 *
 * ── Por qué esta prueba existe ──────────────────────────────────────────────
 * Porque el contraste se rompe por acumulación y en silencio. Nadie escribe
 * «pongamos este texto a 2,99:1»: alguien reutiliza una escala global pensada
 * para fondo oscuro, otra persona añade un tema claro, y el resultado es texto
 * gris sobre blanco que en la pantalla del que lo programó se leía bien porque
 * tenía el brillo al cien por cien y la mirada joven. Quien lo sufre es el
 * reclutador que revisa treinta expedientes al día en un monitor de oficina.
 *
 * ── Qué hace, exactamente ───────────────────────────────────────────────────
 * Lee el CSS REAL del módulo —no una copia de los valores en un objeto de
 * prueba, que se desincronizaría el primer día—, extrae los tokens de tinta de
 * cada tema, los compone sobre el fondo de referencia que el propio CSS declara
 * (`--doc-medicion-fondo`) y calcula la relación de contraste de WCAG 2.1.
 *
 * Falla por debajo de **4,5:1** en texto normal. No se relaja: si un token no
 * llega, se cambia el token.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src/features/documentacion/ui/documentacion.css"), "utf8");

/** Umbral de WCAG AA para texto normal. El de texto grande es 3:1. */
const AA_NORMAL = 4.5;
const AA_GRANDE = 3;

/* ------------------------------------------------------------------ */
/* Color                                                              */
/* ------------------------------------------------------------------ */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function leerColor(valor: string): Rgba | null {
  const texto = valor.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(texto);
  if (hex) {
    const d = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return { r: parseInt(d.slice(0, 2), 16), g: parseInt(d.slice(2, 4), 16), b: parseInt(d.slice(4, 6), 16), a: 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(texto);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  return null;
}

/** Compone un color con alfa sobre un fondo opaco. */
function componer(frente: Rgba, fondo: Rgba): Rgba {
  return {
    r: frente.r * frente.a + fondo.r * (1 - frente.a),
    g: frente.g * frente.a + fondo.g * (1 - frente.a),
    b: frente.b * frente.a + fondo.b * (1 - frente.a),
    a: 1,
  };
}

/** Luminancia relativa según WCAG 2.1. */
function luminancia({ r, g, b }: Rgba): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Relación de contraste entre dos colores ya opacos. */
export function contraste(frente: Rgba, fondo: Rgba): number {
  const a = luminancia(frente);
  const b = luminancia(fondo);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/* ------------------------------------------------------------------ */
/* Lectura del CSS                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extrae las declaraciones de un selector.
 *
 * Se corta por la primera llave de cierre a propósito: los bloques de tokens del
 * módulo son planos (no hay reglas anidadas dentro), así que un recorte simple es
 * suficiente y no hace falta traer un analizador de CSS.
 */
function bloqueDe(selector: string): string {
  const indice = CSS.indexOf(`${selector} {`);
  if (indice < 0) throw new Error(`No se encontró el selector ${selector} en documentacion.css`);
  const desde = CSS.indexOf("{", indice) + 1;
  const hasta = CSS.indexOf("}", desde);
  return CSS.slice(desde, hasta);
}

function tokenDe(bloque: string, nombre: string): string | null {
  const patron = new RegExp(`${nombre}\\s*:\\s*([^;]+);`);
  const encontrado = patron.exec(bloque);
  return encontrado ? encontrado[1].trim() : null;
}

const BLOQUE_OSCURO = bloqueDe(".doc-console");
const BLOQUE_CLARO = bloqueDe(".light .doc-console");

/**
 * Tokens que se comprueban, con su umbral.
 *
 * `--doc-text-faint` es el que estaba roto: son las ayudas, los marcadores de
 * posición y los recuentos. Está en la lista de texto NORMAL, no de texto grande,
 * porque se pinta a 10 u 11 píxeles.
 */
const TOKENS: { token: string; umbral: number; para: string }[] = [
  { token: "--doc-text", umbral: AA_NORMAL, para: "texto principal" },
  { token: "--doc-text-muted", umbral: AA_NORMAL, para: "texto secundario y descripciones" },
  { token: "--doc-text-faint", umbral: AA_NORMAL, para: "ayudas, marcadores de posición y recuentos" },
  { token: "--doc-success-fg", umbral: AA_NORMAL, para: "chip de entregado" },
  { token: "--doc-info-fg", umbral: AA_NORMAL, para: "chip de información" },
  { token: "--doc-warning-fg", umbral: AA_NORMAL, para: "chip de observado" },
  { token: "--doc-extension-fg", umbral: AA_NORMAL, para: "chip de prórroga" },
  { token: "--doc-danger-fg", umbral: AA_NORMAL, para: "chip de faltante" },
  { token: "--doc-accent-fg", umbral: AA_NORMAL, para: "chip de acento" },
  { token: "--doc-offline-fg", umbral: AA_NORMAL, para: "chip de sin conexión" },
  { token: "--doc-focus", umbral: AA_GRANDE, para: "anillo de foco (elemento gráfico)" },
];

/**
 * `--doc-text` es `var(--ink)`, que vive en `src/index.css`.
 *
 * Se resuelve aquí en lugar de seguir la indirección: son dos valores, están
 * declarados en un solo sitio cada uno y traer un resolvedor de `var()` completo
 * para esto sería construir media herramienta.
 */
const INK: Record<"oscuro" | "claro", string> = { oscuro: "#f8fafc", claro: "#0a2747" };

/**
 * Resuelve un token respetando la cascada real.
 *
 * `.light .doc-console` solo REDECLARA lo que cambia; el resto lo hereda de
 * `.doc-console`. Por eso el tema claro no declara `--doc-text`: hereda
 * `var(--ink)`, que sí es global y sí cambia por tema. Recorrer la cascada aquí
 * es lo que hace que la prueba mida lo que se pinta y no lo que está escrito.
 */
function resolver(bloque: string, token: string, tema: "oscuro" | "claro"): string {
  const valor = tokenDe(bloque, token) ?? tokenDe(BLOQUE_OSCURO, token);
  if (!valor) throw new Error(`Ningún tema declara ${token}`);
  if (valor === "var(--ink)") return INK[tema];
  return valor;
}

describe("documentación · contraste de los tokens en los dos temas", () => {
  for (const tema of ["oscuro", "claro"] as const) {
    const bloque = tema === "oscuro" ? BLOQUE_OSCURO : BLOQUE_CLARO;

    describe(`tema ${tema}`, () => {
      const crudoFondo = resolver(bloque, "--doc-medicion-fondo", tema);
      const fondo = leerColor(crudoFondo);

      it("declara el fondo de referencia con el que se mide", () => {
        expect(fondo, `--doc-medicion-fondo no es un color legible: ${crudoFondo}`).not.toBeNull();
        expect(fondo!.a).toBe(1);
      });

      for (const { token, umbral, para } of TOKENS) {
        it(`${token} cumple ${umbral}:1 (${para})`, () => {
          const crudo = resolver(bloque, token, tema);
          const color = leerColor(crudo);
          expect(color, `${token} no es un color legible: ${crudo}`).not.toBeNull();

          const opaco = componer(color!, fondo!);
          const ratio = contraste(opaco, fondo!);
          // El mensaje lleva el número medido: cuando esto falla, lo primero que
          // se quiere saber es cuánto falta, no que ha fallado.
          expect(
            ratio,
            `${token} en tema ${tema} da ${ratio.toFixed(2)}:1 sobre ${crudoFondo}; hace falta ${umbral}:1. ` +
              `Sube la opacidad o usa un tono más contrastado en documentacion.css.`,
          ).toBeGreaterThanOrEqual(umbral);
        });
      }
    });
  }

  it("ningún token de tinta usa la escala global, que no es por tema", () => {
    /*
     * La regresión que esto impide: volver a poner `var(--ink-faint)`.
     *
     * Es tentador —parece coherencia con el resto de la aplicación— y es
     * exactamente lo que dejaba el texto de ayuda a 2,99:1 en tema claro, porque
     * la escala global está pensada para fondo oscuro y en claro solo cambia de
     * signo, no de contraste.
     */
    for (const [tema, bloque] of [["oscuro", BLOQUE_OSCURO], ["claro", BLOQUE_CLARO]] as const) {
      for (const token of ["--doc-text-muted", "--doc-text-faint"]) {
        const valor = tokenDe(bloque, token);
        if (valor === null) continue;
        expect(valor, `${token} del tema ${tema} vuelve a heredar la escala global (${valor})`).not.toMatch(
          /var\(--ink/,
        );
      }
    }
  });
});
