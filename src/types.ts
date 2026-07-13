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

/**
 * Catalogues read from the "Auxiliar" sheet, used to feed dropdowns, the cargo
 * autocomplete and the universal KPI filters. Every list is optional so the UI
 * degrades gracefully while the backend that provides them is being deployed.
 */
export interface Auxiliares {
  /** `cargos_bdp` — every position, powers the cargo autocomplete. */
  cargos_bdp: string[];
  /** `gerencias_bdp` — management units, for the Gerencia filter. */
  gerencias_bdp: string[];
  /** `agencias_bdp` — branches, for the Agencia filter. */
  agencias_bdp: string[];
  /** `modalidad_reclutamiento` — recruitment modalities. */
  modalidad_reclutamiento: string[];
  /** `estado_proceso` — process states. */
  estado_proceso: string[];
}

export function emptyAuxiliares(): Auxiliares {
  return {
    cargos_bdp: [],
    gerencias_bdp: [],
    agencias_bdp: [],
    modalidad_reclutamiento: [],
    estado_proceso: [],
  };
}

/** A raw process row from the "Espejo_Base" / "Espejo_Ultimo_Registro" sheets. */
export type EspejoRow = Record<string, string | number>;

/** Combined payload returned by the GET endpoint. */
export interface TalentPayload {
  candidatos: RawCandidate[];
  competencias: string[];
  /**
   * Raw rows of the "Auxiliar" sheet's `arquetipo_disc` column, each shaped
   * "Nombre (Código), Descripción…". Optional: older backends omit it.
   */
  arquetipos_disc?: string[];
  /** Auxiliary catalogues (cargos, gerencias, agencias, …). Optional. */
  auxiliares?: Partial<Auxiliares>;
  /** Rows of the "Perfiles_y_Configuracion" sheet. Optional. */
  perfiles?: RawPerfil[];
  /** Rows of the "Espejo_Base" sheet (full process history). Optional. */
  espejo_base?: EspejoRow[];
  /** Rows of the "Espejo_Ultimo_Registro" sheet (latest state per process). */
  espejo_ultimo?: EspejoRow[];
}

/** A profile row exactly as delivered by the "Perfiles_y_Configuracion" sheet. */
export interface RawPerfil {
  nombre_perfil?: string;
  contraseña_perfil?: string;
  cargo_perfil?: string;
  config_personal_perfil?: string;
  datos_perfil?: string;
  log_actividad_perfil?: string;
  [key: string]: unknown;
}

/** The navigable modules surfaced in the floating dock. */
export type ModuleId =
  | "dashboard"
  | "tablero"
  | "cara-a-cara"
  | "comparador"
  | "procesos"
  | "postulantes"
  | "documentacion"
  | "configuracion";

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
