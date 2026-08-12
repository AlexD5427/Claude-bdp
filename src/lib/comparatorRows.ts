import { reliabilityTone, riskTone, type Tone } from "./levels";
import type { ComparatorSectionId } from "./comparatorStore";
import type { Candidate } from "../types";

/**
 * Catálogo de filas de la comparativa.
 *
 * Antes cada bloque de filas vivía dentro del JSX del módulo, así que la
 * pestaña de Configuración sólo podía ofrecer secciones enteras: no había
 * ninguna lista de filas que enumerar. Aquí están todas, con su identificador
 * estable, su rótulo, su subtítulo y de qué columna de la hoja salen. El módulo
 * dibuja desde este catálogo y el panel de ajustes lo recorre para ofrecer el
 * interruptor de cada fila. Una sola fuente de verdad para las dos cosas.
 *
 * Las filas de competencias no están aquí porque son **dinámicas**: dependen de
 * las competencias que traigan los postulantes comparados. Se identifican con
 * {@link competencyRowId} y se listan en Configuración a partir de la
 * comparación en curso.
 */

/** Cómo se pinta el valor de una fila. */
export type ComparatorRowKind = "ranking" | "pct" | "disc" | "level" | "items" | "tags";

export interface ComparatorRowDef {
  /** Identificador estable usado por la visibilidad por fila. */
  id: string;
  /** Sección a la que pertenece ("ranking" es la fila suelta de cabecera). */
  section: ComparatorSectionId | "ranking";
  /** Rótulo principal (primer renglón de la primera columna). */
  label: string;
  /** Segundo renglón, en tono más tenue. */
  sub?: string;
  kind: ComparatorRowKind;
  /** Columna del postulante de la que se lee el valor. */
  key?: keyof Candidate;
  /** Escala semántica de color, sólo para las filas de nivel. */
  tone?: (value?: string) => Tone;
}

export const COMPARATOR_ROWS: ComparatorRowDef[] = [
  {
    id: "ranking",
    section: "ranking",
    label: "Ranking",
    sub: "Nota de Adecuación al Puesto",
    kind: "ranking",
  },

  /* ---- Resultados de Evaluación ---- */
  {
    id: "nota_cap",
    section: "resultados",
    label: "Nota CAP",
    sub: "Coeficiente de Adecuación al Puesto",
    kind: "pct",
    key: "nota_cap",
  },
  {
    id: "perfil_disc",
    section: "resultados",
    label: "Perfil DISC",
    sub: "Arquetipo de Comportamiento",
    kind: "disc",
    key: "perfil_disc",
  },
  {
    id: "nota_curriculum",
    section: "resultados",
    label: "Nota Currículum",
    sub: "Calificación de Hoja de Vida",
    kind: "pct",
    key: "nota_curriculum",
  },
  {
    id: "nota_conocimiento",
    section: "resultados",
    label: "Nota Conocimientos",
    sub: "Evaluación de Conocimientos Técnicos",
    kind: "pct",
    key: "nota_conocimiento",
  },
  {
    id: "nota_competencias",
    section: "resultados",
    label: "Nota Competencias",
    sub: "Calificación de las competencias a nivel general",
    kind: "pct",
    key: "nota_competencias",
  },

  /* ---- Conocimientos Técnicos ---- */
  {
    id: "conocimientos",
    section: "conocimientos",
    label: "Conocimientos",
    sub: "Detalle técnico declarado",
    kind: "items",
  },

  /* ---- Manejo de Herramientas ---- */
  {
    id: "herramientas",
    section: "herramientas",
    label: "Herramientas",
    sub: "Instrumentos y software",
    kind: "items",
  },

  /* ---- Integridad y Confiabilidad ---- */
  {
    id: "nivel_general_confiabilidad",
    section: "integridad",
    label: "Confiabilidad e Integridad",
    sub: "Mide la honestidad y el compromiso con las normas",
    kind: "level",
    key: "nivel_general_confiabilidad",
    tone: reliabilityTone,
  },
  {
    // "Nivel de Integridad" es una escala de riesgo etiquetada ("Riesgo
    // Bajo/Medio/Alto"): menos riesgo se lee como mejor, igual que las de abajo.
    id: "nivel_integridad",
    section: "integridad",
    label: "Integridad",
    sub: "Riesgo asociado a la integridad del postulante",
    kind: "level",
    key: "nivel_integridad",
    tone: riskTone,
  },
  {
    id: "riesgo_robo",
    section: "integridad",
    label: "Robo",
    sub: "Probabilidad de cometer o justificar sustracciones",
    kind: "level",
    key: "riesgo_robo",
    tone: riskTone,
  },
  {
    id: "riesgo_mentira",
    section: "integridad",
    label: "Mentira",
    sub: "Tendencia a exagerar o distorsionar la verdad",
    kind: "level",
    key: "riesgo_mentira",
    tone: riskTone,
  },

  /* ---- Observaciones ---- */
  {
    id: "observaciones",
    section: "observaciones",
    label: "Observaciones",
    sub: "Anotaciones de selección",
    kind: "tags",
    key: "observaciones",
  },
];

/** Filas fijas de una sección, en orden de aparición. */
export function rowsOfSection(section: ComparatorSectionId | "ranking"): ComparatorRowDef[] {
  return COMPARATOR_ROWS.filter((r) => r.section === section);
}

/**
 * Identificador de una fila de competencia. Se normaliza a minúsculas porque la
 * hoja escribe el mismo nombre con mayúsculas distintas según quién lo cargue.
 */
export function competencyRowId(name: string): string {
  return `competencia:${name.trim().toLowerCase()}`;
}
