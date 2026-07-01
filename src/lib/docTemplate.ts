/**
 * Documentation checklist template.
 *
 * The recruitment team used to track incoming documentation in a hand-made
 * spreadsheet whose header row is a long, repetitive string. This module turns
 * that into a clean, grouped catalogue of *document definitions* that seed each
 * new person's dossier. Everything is editable afterwards — a name can change,
 * documents can be added or removed — so this is only the starting point.
 */

export type DocGroup = "personal" | "garantia" | "cumplimiento";

export const DOC_GROUP_LABELS: Record<DocGroup, string> = {
  personal: "Documentación personal",
  garantia: "Garantía / Garantes",
  cumplimiento: "Cumplimiento y UIF",
};

export const DOC_GROUP_ORDER: DocGroup[] = ["personal", "garantia", "cumplimiento"];

export interface DocDef {
  id: string;
  label: string;
  group: DocGroup;
  /** Whether the document carries an extension ("prórroga") date. */
  prorroga?: boolean;
  /** Not required by default (e.g. garante docs depend on the funcionario type). */
  optional?: boolean;
  /** A short hint shown under the label. */
  hint?: string;
}

/**
 * The canonical document catalogue, transcribed and de-duplicated from the
 * team's spreadsheet headers.
 */
export const DOC_TEMPLATE: DocDef[] = [
  // ── Documentación personal ────────────────────────────────────────────
  { id: "foto-4x4", group: "personal", label: "Fotografía digital 4x4", hint: "Fondo blanco, vestimenta formal" },
  { id: "antecedentes-felcc", group: "personal", label: "Certificado de antecedentes policiales (FELCC)" },
  { id: "rejap", group: "personal", label: "Registro Judicial de Antecedentes Penales (REJAP)" },
  { id: "ci-copia", group: "personal", label: "Fotocopia/escaneado de Carnet de Identidad" },
  { id: "factura-servicios", group: "personal", label: "Factura de servicios básicos", hint: "Fotocopia o escaneado" },
  { id: "croquis-domicilio", group: "personal", label: "Croquis domiciliario" },
  { id: "cv", group: "personal", label: "Curriculum Vitae actualizado" },
  { id: "cv-respaldo", group: "personal", label: "Documentos de respaldo del CV", hint: "Títulos de formación académica" },
  { id: "cert-trabajo", group: "personal", label: "Certificados de trabajo", prorroga: true },
  { id: "titulo-legalizado", group: "personal", label: "Fotocopia legalizada del Título académico", prorroga: true },
  { id: "cuenta-bancaria", group: "personal", label: "N° de Cuenta Bancaria" },
  { id: "extracto-gestora", group: "personal", label: "Fotocopia de Extracto de la Gestora Pública" },
  { id: "djj-no-vinculacion", group: "personal", label: "Declaración Jurada de No Vinculación", hint: "Parentesco ni favorecimiento crediticio" },
  { id: "djj-bienes-rentas", group: "personal", label: "Declaración Jurada de Bienes y Rentas", hint: "Recepcionada por la Contraloría General del Estado" },
  { id: "seguro-accidentes", group: "personal", label: "Seguro de Accidentes Personales" },
  { id: "seguro-vida", group: "personal", label: "Seguro de Vida Individual" },
  { id: "rc-iva", group: "personal", label: "Certificado de saldo a favor del dependiente (RC-IVA)" },
  { id: "carnet-heredero", group: "personal", label: "Fotocopia de carnet de heredero de contrato" },

  // ── Garantía / Garantes (depende del tipo de funcionario) ─────────────
  { id: "garante-ci", group: "garantia", label: "Fotocopia de CI del garante", optional: true },
  { id: "garante-inmueble", group: "garantia", label: "Bien inmueble con o sin hipoteca", optional: true },
  { id: "garante-folio", group: "garantia", label: "Folio / Información rápida", hint: "Antigüedad no menor a un mes", optional: true },
  { id: "garante-croquis-negocio", group: "garantia", label: "Croquis del negocio / fuente laboral", optional: true },
  { id: "garante-boletas", group: "garantia", label: "3 últimas boletas de pago", hint: "Garante dependiente", optional: true },
  { id: "garante-form-200-400", group: "garantia", label: "Formulario 200 - 400 (últimas 3 DDJJ)", hint: "Garante independiente", optional: true },
  { id: "garante-fam1-ci", group: "garantia", label: "Fotocopia de CI - Garante familiar 1", optional: true },
  { id: "garante-fam1-croquis", group: "garantia", label: "Croquis domicilio - Garante familiar 1", optional: true },
  { id: "garante-fam2-ci", group: "garantia", label: "Fotocopia de CI - Garante familiar 2", optional: true },
  { id: "garante-fam2-croquis", group: "garantia", label: "Croquis domicilio - Garante familiar 2", optional: true },

  // ── Cumplimiento y UIF ────────────────────────────────────────────────
  { id: "impedimento-auditor", group: "cumplimiento", label: "Declaración de impedimento para ser Auditor Interno", optional: true },
  { id: "lgi-ft", group: "cumplimiento", label: "Conocimientos acreditados LGI/FT", hint: "Previsión, detección, control y reporte", optional: true },
  { id: "examen-uif", group: "cumplimiento", label: "Examen presencial de la UIF", optional: true },
];
