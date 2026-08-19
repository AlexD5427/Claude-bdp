/**
 * Identidad visual de las categorías de funcionario.
 *
 * ── Por qué vive aquí y no en cada componente ────────────────────────────────
 * El tipo de funcionario es el «punto de inflexión» del expediente: decide qué
 * documentos se exigen, y por eso conviene que se reconozca de un vistazo —en el
 * asistente de alta, en la cabecera del expediente y en la lista— con SIEMPRE el
 * mismo color y el mismo icono. Tener esa correspondencia en un solo sitio evita
 * que el asistente pinte «Comercial» en verde y el expediente en azul.
 *
 * Cada categoría es única y excluyente: un expediente pertenece a exactamente una.
 * Añadir una nueva es agregar una entrada a `CATEGORIAS`; el resto del módulo la
 * recoge sin más cambios (escalable, como pidió el área).
 *
 * ── SVG propios ──────────────────────────────────────────────────────────────
 * Los iconos son SVG dibujados a mano (no de una librería) para que el trazo
 * combine con el resto de la consola y herede el color con `currentColor`.
 */

import type { CSSProperties, SVGProps } from "react";

export type IconoCategoria = (props: SVGProps<SVGSVGElement>) => JSX.Element;

export interface Categoria {
  /** Código de `tipo_funcionario` del backend. */
  codigo: string;
  etiqueta: string;
  etiquetaCorta: string;
  descripcion: string;
  /** Color de acento en hexadecimal; se usa para el borde, el icono y el tinte. */
  color: string;
  /** ¿Tiene rama de requisitos definida? `false` ⇒ «En construcción». */
  activa: boolean;
  /** ¿Exige elegir tipo de garantía comercial antes de continuar? */
  pideGarantia?: boolean;
  Icono: IconoCategoria;
}

/* ------------------------------------------------------------------ */
/* Iconos                                                              */
/* ------------------------------------------------------------------ */

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});

/** General: credencial de la persona. */
const IconGeneral: IconoCategoria = (props) => (
  <svg {...base(props)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="10" r="2.2" />
    <path d="M5.4 16.2c.5-1.7 1.8-2.6 3.1-2.6s2.6.9 3.1 2.6" />
    <path d="M14.5 9h4M14.5 12h4M14.5 15h2.5" />
  </svg>
);

/** Comercial: escaparate/agencia con toldo. */
const IconComercial: IconoCategoria = (props) => (
  <svg {...base(props)}>
    <path d="M4 9.5 5.2 5h13.6L20 9.5" />
    <path d="M4 9.5c0 1.3 1 2.3 2.3 2.3S8.6 10.8 8.6 9.5c0 1.3 1 2.3 2.3 2.3s2.3-1 2.3-2.3c0 1.3 1 2.3 2.3 2.3s2.3-1 2.3-2.3" />
    <path d="M5.4 11.6V19h13.2v-7.4" />
    <path d="M10 19v-3.8h4V19" />
  </svg>
);

/** Auditoría: lupa sobre documento. */
const IconAuditoria: IconoCategoria = (props) => (
  <svg {...base(props)}>
    <path d="M6 3h7l4 4v6.5" />
    <path d="M13 3v4h4" />
    <path d="M6 3v18h4.5" />
    <circle cx="15.5" cy="16.5" r="3.2" />
    <path d="m18 19 2.4 2.4" />
  </svg>
);

/** Cumplimiento: escudo con visto bueno. */
const IconCumplimiento: IconoCategoria = (props) => (
  <svg {...base(props)}>
    <path d="M12 3 5 5.5v5.2c0 4.3 2.9 7.4 7 9.3 4.1-1.9 7-5 7-9.3V5.5L12 3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);

/** Ejecutivo / Directorio: edificio institucional con columnas. */
const IconEjecutivo: IconoCategoria = (props) => (
  <svg {...base(props)}>
    <path d="M4 9 12 4l8 5" />
    <path d="M5 9v9M9 9v9M15 9v9M19 9v9" />
    <path d="M3.5 21h17" />
    <path d="M3.5 18h17" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Catálogo de categorías                                              */
/* ------------------------------------------------------------------ */

/**
 * Las categorías tal como se muestran en el asistente, en orden.
 *
 * `GENERAL` no es una tarjeta del asistente (todo expediente arranca con los
 * generales), pero sí necesita identidad para pintarse en la cabecera de los
 * expedientes heredados que no tienen rama especial.
 */
export const CATEGORIAS: Categoria[] = [
  {
    codigo: "COMERCIAL",
    etiqueta: "Funcionario área comercial",
    etiquetaCorta: "Comercial",
    descripcion: "Personal de agencias y negocios. Requiere garantía según el tipo que presente.",
    color: "#2dd4a7",
    activa: true,
    pideGarantia: true,
    Icono: IconComercial,
  },
  {
    codigo: "AUDITORIA",
    etiqueta: "Funcionario área auditoría",
    etiquetaCorta: "Auditoría",
    descripcion: "Auditoría interna. Añade la declaración de impedimento para ser auditor.",
    color: "#a78bfa",
    activa: true,
    Icono: IconAuditoria,
  },
  {
    codigo: "CUMPLIMIENTO",
    etiqueta: "Funcionario área cumplimiento",
    etiquetaCorta: "Cumplimiento",
    descripcion: "Cumplimiento / UIF. Acreditación LGI/FT y examen presencial de la UIF.",
    color: "#38bdf8",
    activa: true,
    Icono: IconCumplimiento,
  },
  {
    codigo: "EJECUTIVO",
    etiqueta: "Funcionario ejecutivo o directorio",
    etiquetaCorta: "Ejecutivo / Directorio",
    descripcion: "En construcción: la lista de requisitos se definirá más adelante.",
    color: "#f5a524",
    activa: false,
    Icono: IconEjecutivo,
  },
];

/** Identidad de la categoría general (base de todo expediente). */
export const CATEGORIA_GENERAL: Categoria = {
  codigo: "GENERAL",
  etiqueta: "Funcionario general",
  etiquetaCorta: "General",
  descripcion: "Requisitos generales de incorporación.",
  color: "#7c8aa5",
  activa: true,
  Icono: IconGeneral,
};

const POR_CODIGO: Record<string, Categoria> = (() => {
  const mapa: Record<string, Categoria> = { GENERAL: CATEGORIA_GENERAL };
  for (const c of CATEGORIAS) mapa[c.codigo] = c;
  // El directorio comparte identidad con el ejecutivo (una sola tarjeta).
  mapa.DIRECTORIO = { ...CATEGORIAS.find((c) => c.codigo === "EJECUTIVO")!, codigo: "DIRECTORIO" };
  return mapa;
})();

/** Categoría por código de tipo de funcionario, con reserva a «general». */
export function categoriaDe(codigo: string | undefined | null): Categoria {
  if (!codigo) return CATEGORIA_GENERAL;
  return POR_CODIGO[String(codigo).toUpperCase()] ?? CATEGORIA_GENERAL;
}

/**
 * Variables CSS de una categoría, listas para un `style`.
 *
 * Devuelve el acento y dos tintes translúcidos derivados, para que un componente
 * pinte fondo, borde e icono sin repetir el `hexToRgba`.
 */
export function estiloCategoria(codigo: string | undefined | null): CSSProperties & Record<string, string> {
  const c = categoriaDe(codigo);
  return {
    "--cat-color": c.color,
    "--cat-tinte": hexAlpha(c.color, 0.14),
    "--cat-tinte-fuerte": hexAlpha(c.color, 0.24),
    "--cat-borde": hexAlpha(c.color, 0.5),
  };
}

/** `#rrggbb` + alfa → `rgba(...)`. Acepta ya `rgba`/`var` tal cual. */
export function hexAlpha(hex: string, alfa: number): string {
  const limpio = hex.trim();
  if (!limpio.startsWith("#") || (limpio.length !== 7 && limpio.length !== 4)) return limpio;
  const full = limpio.length === 4 ? `#${limpio[1]}${limpio[1]}${limpio[2]}${limpio[2]}${limpio[3]}${limpio[3]}` : limpio;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/* ------------------------------------------------------------------ */
/* Garantías comerciales                                               */
/* ------------------------------------------------------------------ */

export interface TipoGarantiaCard {
  codigo: string;
  etiqueta: string;
  titulo: string;
  caracteristicas: string[];
}

/** Las tres garantías del funcionario comercial, para las tarjetas del asistente. */
export const GARANTIAS_COMERCIAL: TipoGarantiaCard[] = [
  {
    codigo: "COMERCIAL_1",
    etiqueta: "Tipo 1",
    titulo: "Garantía real",
    caracteristicas: ["Garante con bien inmueble", "Garante familiar (hasta 4.º grado)"],
  },
  {
    codigo: "COMERCIAL_2",
    etiqueta: "Tipo 2",
    titulo: "Garante con ingresos",
    caracteristicas: ["Garante que demuestre ingresos", "Dos garantes familiares (hasta 4.º grado)"],
  },
  {
    codigo: "COMERCIAL_3",
    etiqueta: "Tipo 3",
    titulo: "Inmueble propio",
    caracteristicas: ["Postulante con inmueble propio", "Garante familiar (hasta 4.º grado)"],
  },
];
