/**
 * Contraste de color, medido de verdad.
 *
 * ── Por qué esto vive en el módulo ──────────────────────────────────────────
 * El módulo de Documentación se lee ocho horas al día: una lista de expedientes,
 * unas observaciones y treinta chips de estado. Cuando el texto secundario queda
 * en 3:1 nadie dice «esto incumple la WCAG»; dice «no se ve» y deja de usarlo. El
 * problema real era que los tokens de tinta se declaraban con transparencia
 * (`rgba(13, 47, 84, 0.5)`) y su contraste depende de la superficie que hay
 * debajo, así que no se podía comprobar leyendo el CSS: hay que COMPONER las
 * capas y medir.
 *
 * Estas funciones son las que usa `__tests__/contraste.test.ts` para fallar
 * cuando un token baja del umbral, y `qa/sonda-contraste.mjs` para comprobar el
 * contraste efectivo en un navegador real.
 *
 * ── Umbrales ────────────────────────────────────────────────────────────────
 * WCAG 2.1 AA: 4.5:1 en texto normal y 3:1 en texto grande (>= 18.66 px en
 * negrita o >= 24 px). El módulo no se concede excepciones en ayudas,
 * marcas de agua, placeholders ni etiquetas de gráfico: si un texto se lee, se
 * mide.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** Alfa entre 0 y 1. Un color opaco vale 1. */
  a: number;
}

export const UMBRAL_AA_NORMAL = 4.5;
export const UMBRAL_AA_GRANDE = 3;

/**
 * Interpreta `#rgb`, `#rrggbb`, `rgb(...)` y `rgba(...)`.
 *
 * Devuelve `null` para cualquier otra cosa —un `var(...)` sin resolver, por
 * ejemplo— en lugar de inventar un color: una medición sobre un valor adivinado
 * daría una prueba en verde que no significa nada.
 */
export function leerColor(valor: string): Rgb | null {
  const texto = valor.trim().toLowerCase();
  if (!texto) return null;

  if (texto === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  if (texto.startsWith("#")) {
    const hex = texto.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split("").map((c) => parseInt(c + c, 16));
      return { r, g, b, a: hex.length === 4 ? a / 255 : 1 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].some(Number.isNaN)) return null;
      return { r, g, b, a };
    }
    return null;
  }

  const funcional = texto.match(/^rgba?\(([^)]+)\)$/);
  if (!funcional) return null;
  const partes = funcional[1].split(/[,/\s]+/).filter(Boolean).map(Number);
  if (partes.length < 3 || partes.slice(0, 3).some(Number.isNaN)) return null;
  return { r: partes[0], g: partes[1], b: partes[2], a: partes.length > 3 ? partes[3] : 1 };
}

/**
 * Compone una capa translúcida sobre otra («alpha over»).
 *
 * Es exactamente lo que hace el navegador al pintar `rgba(255,255,255,0.07)`
 * encima del fondo de la aplicación, y sin reproducirlo no se puede saber qué
 * color acaba viendo la persona.
 */
export function componer(encima: Rgb, debajo: Rgb): Rgb {
  const a = encima.a + debajo.a * (1 - encima.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mezcla = (arriba: number, abajo: number) =>
    (arriba * encima.a + abajo * debajo.a * (1 - encima.a)) / a;
  return { r: mezcla(encima.r, debajo.r), g: mezcla(encima.g, debajo.g), b: mezcla(encima.b, debajo.b), a };
}

/** Apila varias capas sobre un fondo opaco, de la más baja a la más alta. */
export function apilar(fondo: Rgb, ...capas: Rgb[]): Rgb {
  return capas.reduce((acumulado, capa) => componer(capa, acumulado), fondo);
}

/** Luminancia relativa según la definición de la WCAG. */
export function luminancia(color: Rgb): number {
  const canal = (v: number) => {
    const s = Math.min(1, Math.max(0, v / 255));
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(color.r) + 0.7152 * canal(color.g) + 0.0722 * canal(color.b);
}

/**
 * Relación de contraste entre un texto y su fondo.
 *
 * Si el texto es translúcido se compone primero sobre el fondo: un gris al 50 %
 * sobre blanco no contrasta como un gris opaco, y esa diferencia es justo la que
 * hacía que los tokens de tinta pasaran una revisión a ojo y fallaran en la
 * pantalla.
 */
export function contraste(texto: Rgb, fondo: Rgb): number {
  const efectivo = texto.a >= 1 ? texto : componer(texto, fondo);
  const l1 = luminancia(efectivo);
  const l2 = luminancia(fondo);
  const claro = Math.max(l1, l2);
  const oscuro = Math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Contraste a partir de cadenas CSS. Lanza si alguna no se puede leer. */
export function contrasteDe(texto: string, fondo: string, capas: string[] = []): number {
  const colorTexto = leerColor(texto);
  const colorFondo = leerColor(fondo);
  if (!colorTexto) throw new Error(`No se puede leer el color de texto «${texto}».`);
  if (!colorFondo) throw new Error(`No se puede leer el color de fondo «${fondo}».`);
  const capasLeidas = capas.map((c) => {
    const leido = leerColor(c);
    if (!leido) throw new Error(`No se puede leer la capa «${c}».`);
    return leido;
  });
  return contraste(colorTexto, apilar(colorFondo, ...capasLeidas));
}

/** Redondeo a dos decimales, para que los mensajes de error sean legibles. */
export function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
