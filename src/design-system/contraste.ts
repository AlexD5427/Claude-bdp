/**
 * Contraste de color: cálculo puro, sin navegador.
 *
 * ── Por qué esto existe en el código y no en una revisión a ojo ──────────────
 * El módulo tenía texto gris sobre blanco en tema claro y chips pensados solo
 * para fondo oscuro. Nada de eso lo detecta un compilador y a ojo no se
 * distingue un 3.1:1 de un 4.6:1: son dos grises parecidos, uno legal y otro no.
 * Con estas funciones, la prueba `contraste.test.ts` recorre los pares de tokens
 * de los DOS temas y falla por debajo del umbral, y la sonda de navegador real
 * (`qa/sonda-contraste.mjs`) comprueba el contraste EFECTIVO de una muestra de
 * texto ya pintado.
 *
 * Se implementa la fórmula de WCAG 2.1 (luminancia relativa y relación de
 * contraste) tal cual: sin dependencias y con el mismo resultado que cualquier
 * comprobador.
 */

/** Color en componentes de 0 a 255, con alfa de 0 a 1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NOMBRES: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  transparent: "rgba(0,0,0,0)",
};

/**
 * Interpreta `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` y `rgba(...)`.
 *
 * Devuelve `null` para cualquier otra cosa —una variable CSS sin resolver, por
 * ejemplo—, y quien llama decide qué hacer. Devolver negro por defecto sería
 * peor: daría un contraste altísimo y la comprobación pasaría sin mirar nada.
 */
export function parsearColor(valor: string): Rgba | null {
  const texto = (NOMBRES[valor?.trim?.().toLowerCase()] ?? valor ?? "").trim();
  if (!texto) return null;

  if (texto.startsWith("#")) {
    const hex = texto.slice(1);
    const expandir = (c: string) => parseInt(c.length === 1 ? c + c : c, 16);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expandir(hex[0]),
        g: expandir(hex[1]),
        b: expandir(hex[2]),
        a: hex.length === 4 ? expandir(hex[3]) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const funcion = /^rgba?\(\s*([^)]+)\)$/i.exec(texto);
  if (!funcion) return null;
  const partes = funcion[1]
    .split(/[,/\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length < 3) return null;
  const numero = (p: string) => (p.endsWith("%") ? (parseFloat(p) * 255) / 100 : parseFloat(p));
  const alfa = partes[3] === undefined ? 1 : partes[3].endsWith("%") ? parseFloat(partes[3]) / 100 : parseFloat(partes[3]);
  const rgba = { r: numero(partes[0]), g: numero(partes[1]), b: numero(partes[2]), a: alfa };
  if ([rgba.r, rgba.g, rgba.b, rgba.a].some((n) => Number.isNaN(n))) return null;
  return rgba;
}

/**
 * Compone un color translúcido sobre su fondo.
 *
 * Es el paso que se olvida siempre: `rgba(13, 47, 84, 0.5)` no es un color, es
 * una instrucción. Su contraste real depende de lo que haya debajo, y medirlo
 * como si fuera opaco da un resultado que no existe en pantalla.
 */
export function componer(frente: Rgba, fondo: Rgba): Rgba {
  const a = frente.a;
  return {
    r: frente.r * a + fondo.r * (1 - a),
    g: frente.g * a + fondo.g * (1 - a),
    b: frente.b * a + fondo.b * (1 - a),
    a: 1,
  };
}

/** Luminancia relativa de WCAG 2.1. */
export function luminancia(color: Rgba): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(color.r) + 0.7152 * canal(color.g) + 0.0722 * canal(color.b);
}

/**
 * Relación de contraste entre un texto y su fondo, en el orden natural.
 *
 * Los dos colores se componen sobre `base` —la superficie de la página— antes de
 * medir, porque tanto el texto como el fondo del chip pueden ser translúcidos.
 */
export function relacionContraste(texto: string, fondo: string, base = "#ffffff"): number | null {
  const cBase = parsearColor(base);
  const cFondo = parsearColor(fondo);
  const cTexto = parsearColor(texto);
  if (!cBase || !cFondo || !cTexto) return null;

  const fondoPlano = componer(cFondo, cBase);
  const textoPlano = componer(cTexto, fondoPlano);
  const l1 = luminancia(textoPlano);
  const l2 = luminancia(fondoPlano);
  const claro = Math.max(l1, l2);
  const oscuro = Math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Umbrales de WCAG 2.1 nivel AA. */
export const UMBRAL_AA = {
  /** Texto normal (menos de 18.66 px en negrita o 24 px). */
  normal: 4.5,
  /** Texto grande y componentes de interfaz. */
  grande: 3,
} as const;

/** ¿Cumple AA este par? `grande` baja el umbral a 3:1. */
export function cumpleAA(texto: string, fondo: string, base = "#ffffff", grande = false): boolean {
  const ratio = relacionContraste(texto, fondo, base);
  if (ratio === null) return false;
  return ratio >= (grande ? UMBRAL_AA.grande : UMBRAL_AA.normal);
}
