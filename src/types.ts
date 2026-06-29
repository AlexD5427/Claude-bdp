/**
 * Domain types for the Talent Evaluation Dashboard.
 *
 * The Google Apps Script backend returns "loose" records: numeric fields can
 * arrive as strings, and the `competencias` / `conocimientos_tecnicos` columns
 * are JSON encoded as strings. We model the raw shape, then normalise it into
 * strongly typed structures the UI can trust.
 */

/** A single competency score once normalised. */
export interface CompetencyScore {
  /** Competency name (from `name`, `nombre` or `competencia`). */
  name: string;
  /** Expected value (Valor Esperado). `null` when unknown. */
  esperado: number | null;
  /** Obtained value (Valor Obtenido). `null` when unknown. */
  obtenido: number | null;
  /** Gap = obtenido - esperado, forced to be <= 0. `null` when uncomputable. */
  brecha: number | null;
  /** Fit percentage 0..100. `null` when unknown. */
  ajuste: number | null;
}

/** A technical-knowledge entry (conocimientos_tecnicos). */
export interface TechnicalKnowledge {
  nombre: string;
  nivel?: string;
  detalle?: string;
}

/** The candidate exactly as delivered by the backend. */
export interface RawCandidate {
  identificador?: string;
  nombres?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  edad?: number | string;
  departamento_residencia?: string;
  localidad_residencia?: string;
  estado_civil?: string;
  nivel_academico?: string;
  carrera?: string;
  trabaja_bdp?: string;
  cargo_bdp?: string;
  nota_cap?: number | string;
  perfil_disc?: string;
  nota_curriculum?: number | string;
  nota_conocimiento?: number | string;
  nota_competencias?: number | string;
  conocimientos_tecnicos?: string;
  herramientas?: string;
  competencias?: string;
  nivel_general_confiabilidad?: string;
  nivel_integridad?: string;
  riesgo_robo?: string;
  riesgo_mentira?: string;
  observaciones?: string;
  [key: string]: unknown;
}

/** A candidate after normalisation — safe for the UI to consume. */
export interface Candidate extends RawCandidate {
  /** Stable key for React lists. */
  id: string;
  /** Pre-computed display name with graceful fallback. */
  fullName: string;
  /** Parsed competency scores. */
  competenciasList: CompetencyScore[];
  /** Parsed technical-knowledge entries. */
  conocimientosList: TechnicalKnowledge[];
  /** Parsed tool-handling entries (Manejo de Herramientas u otros). */
  herramientasList: TechnicalKnowledge[];
}

/** Combined payload returned by the GET endpoint. */
export interface TalentPayload {
  candidatos: RawCandidate[];
  competencias: string[];
}

/** The five navigable modules surfaced in the floating dock. */
export type ModuleId =
  | "tablero"
  | "cara-a-cara"
  | "comparador"
  | "procesos"
  | "postulantes";

/** A free-form list item used by the knowledge / tools builders. */
export interface FormItem {
  uid: string;
  nombre: string;
  nivel: string;
  /** Optional free-text detail (only Conocimientos Técnicos uses it). */
  detalle?: string;
}

/** A configured competency inside the registration form. */
export interface FormCompetency {
  /** Local id so rows stay stable while editing. */
  uid: string;
  name: string;
  /** Raw text so we can accept both "." and "," decimals while typing. */
  esperadoText: string;
  obtenidoText: string;
}

/** The competency object persisted with a new candidate. */
export interface SavedCompetency {
  name: string;
  esperado: number | null;
  obtenido: number | null;
  brecha: number | null;
  ajuste: number | null;
}
