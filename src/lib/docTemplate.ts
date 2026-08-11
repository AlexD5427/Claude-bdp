/**
 * Documentation checklist template.
 *
 * Este archivo era, hasta ahora, una lista escrita a mano. Eso significaba que
 * cada requisito vivia en DOS sitios: aqui y en la cabecera del libro. Cuando el
 * area anadio los requisitos de garantia, las dos listas dejaron de coincidir y
 * nadie se entero hasta que un expediente comercial aparecio incompleto.
 *
 * Ahora la lista se DERIVA de `doc/docCatalog.ts`, que es el catalogo
 * declarativo unico. La forma exportada (`DocDef`, `DOC_TEMPLATE`,
 * `DOC_GROUP_*`) no cambia ni un caracter, asi que todo lo que ya importaba de
 * aqui -el formulario de alta, la vista de expediente, el store- sigue
 * funcionando sin tocar una linea.
 *
 * Que se gana: los identificadores, las etiquetas, que documento admite
 * prorroga y cual admite "No aplica" dejan de poder contradecirse.
 */

import {
  CATALOGO_DOCUMENTAL,
  type RequisitoDef,
  type DocGrupoAlmacen,
} from "./doc/docCatalog";

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
 * Etiquetas cortas para la interfaz.
 *
 * El catalogo guarda el nombre institucional completo, que es el que debe salir
 * en una exportacion o en un correo. En una tarjeta de 320 px ese nombre ocupa
 * cuatro lineas. Aqui viven las versiones cortas, y solo para los casos en que
 * acortar aporta algo: el resto usa el nombre oficial tal cual.
 */
const ETIQUETA_CORTA: Record<string, string> = {
  GENERAL_FOTOGRAFIA_4X4: "Fotografía digital 4x4",
  GENERAL_ANTECEDENTES_FELCC: "Certificado de antecedentes policiales (FELCC)",
  GENERAL_REJAP: "Registro Judicial de Antecedentes Penales (REJAP)",
  GENERAL_CARNET_IDENTIDAD: "Fotocopia/escaneado de Carnet de Identidad",
  GENERAL_FACTURA_SERVICIOS: "Factura de servicios básicos",
  GENERAL_CV_ACTUALIZADO: "Curriculum Vitae actualizado",
  GENERAL_RESPALDOS_CV: "Documentos de respaldo del CV",
  GENERAL_DECLARACION_NO_VINCULACION: "Declaración Jurada de No Vinculación",
  GENERAL_DECLARACION_BIENES_RENTAS: "Declaración Jurada de Bienes y Rentas",
  GENERAL_CERTIFICADO_RC_IVA: "Certificado de saldo a favor del dependiente (RC-IVA)",
  GENERAL_EXTRACTO_GESTORA_PUBLICA: "Fotocopia de Extracto de la Gestora Pública",
  COMERCIAL_T1_CI_GARANTE: "Fotocopia de CI del garante",
  COMERCIAL_T1_BIEN_INMUEBLE_GARANTE: "Bien inmueble con o sin hipoteca",
  COMERCIAL_T1_FOLIO_INFORMACION_RAPIDA: "Folio / Información rápida",
  COMERCIAL_T1_CI_GARANTE_FAMILIAR: "Fotocopia de CI - Garante familiar 1",
  COMERCIAL_T1_CROQUIS_GARANTE_FAMILIAR: "Croquis domicilio - Garante familiar 1",
  COMERCIAL_T2_CI_GARANTE_INGRESOS: "Fotocopia de CI del garante",
  COMERCIAL_T2_CROQUIS_DOMICILIO: "Croquis del domicilio del garante",
  COMERCIAL_T2_CROQUIS_NEGOCIO: "Croquis del negocio / fuente laboral",
  COMERCIAL_T2_BOLETAS_PAGO: "3 últimas boletas de pago",
  COMERCIAL_T2_FORMULARIOS_200_400: "Formulario 200 - 400 (últimas 3 DDJJ)",
  COMERCIAL_T2_CI_FAMILIAR_1: "Fotocopia de CI - Garante familiar 1",
  COMERCIAL_T2_CROQUIS_FAMILIAR_1: "Croquis domicilio - Garante familiar 1",
  COMERCIAL_T2_CI_FAMILIAR_2: "Fotocopia de CI - Garante familiar 2",
  COMERCIAL_T2_CROQUIS_FAMILIAR_2: "Croquis domicilio - Garante familiar 2",
  COMERCIAL_T3_BIEN_INMUEBLE_PROPIO: "Bien inmueble propio del postulante",
  COMERCIAL_T3_FOLIO_INFORMACION_RAPIDA: "Folio / Información rápida",
  COMERCIAL_T3_CI_POSTULANTE: "Fotocopia de CI del postulante",
  COMERCIAL_T3_CI_GARANTE_FAMILIAR: "Fotocopia de CI - Garante familiar 1",
  COMERCIAL_T3_CROQUIS_GARANTE_FAMILIAR: "Croquis domicilio - Garante familiar 1",
  AUDITORIA_DECLARACION_IMPEDIMENTO: "Declaración de impedimento para ser Auditor Interno",
  CUMPLIMIENTO_CONOCIMIENTOS_LGI_FT: "Conocimientos acreditados LGI/FT",
  CUMPLIMIENTO_EXAMEN_UIF: "Examen presencial de la UIF",
};

/** El catalogo usa tres almacenes; la interfaz historica usa tres grupos. */
function grupoDe(almacen: DocGrupoAlmacen): DocGroup {
  if (almacen === "garantia") return "garantia";
  if (almacen === "cumplimiento") return "cumplimiento";
  return "personal";
}

/**
 * La pista corta bajo la etiqueta.
 *
 * Se prefiere el contexto ("Garante con bien inmueble") sobre la descripcion
 * larga: es lo que desambigua dos requisitos que se llaman casi igual.
 */
function pistaDe(req: RequisitoDef): string | undefined {
  const contexto = req.contexto ? req.contexto.trim() : "";
  if (contexto) return contexto;
  const descripcion = req.descripcion ? req.descripcion.trim() : "";
  if (descripcion && descripcion !== req.etiqueta) return descripcion;
  return undefined;
}

/**
 * El identificador con el que el dato ya esta guardado.
 *
 * `legacyId` es opcional en el catalogo porque un requisito nuevo todavia no
 * tiene historia. En ese caso se deriva del codigo estable, que es unico por
 * definicion, con el mismo estilo de guiones que usan los identificadores
 * antiguos. Asi la plantilla nunca queda con un `id` vacio.
 */
export function idHeredado(req: RequisitoDef): string {
  if (req.legacyId) return req.legacyId;
  return req.codigo.toLowerCase().replace(/_/g, "-");
}

function definicionDe(req: RequisitoDef): DocDef {
  const def: DocDef = {
    id: idHeredado(req),
    label: ETIQUETA_CORTA[req.codigo] ?? req.etiqueta,
    group: grupoDe(req.grupo),
  };
  if (req.permiteProrroga) def.prorroga = true;
  // "Opcional" en la interfaz historica significa "no se aplica a todo el
  // mundo": depende de la rama. Los requisitos especiales son justo eso.
  if (req.seccion !== "DOCUMENTOS_GENERALES") def.optional = true;
  const hint = pistaDe(req);
  if (hint) def.hint = hint;
  return def;
}

/**
 * El catalogo canonico de documentos.
 *
 * Un mismo `legacyId` puede venir de dos requisitos distintos del catalogo
 * (por ejemplo `garante-ci`, que existe en Tipo 1 y en Tipo 2 con el mismo
 * significado). Aqui se conserva la PRIMERA aparicion para que la lista no
 * tenga identificadores repetidos, que es la condicion que asume el store al
 * indexar los documentos de un expediente.
 */
function construirPlantilla(): DocDef[] {
  const salida: DocDef[] = [];
  const vistos = new Set<string>();

  for (const req of CATALOGO_DOCUMENTAL) {
    if (!req.activo) continue;
    const id = idHeredado(req);
    if (vistos.has(id)) continue;
    vistos.add(id);
    salida.push(definicionDe(req));
  }

  // Orden estable por grupo, respetando dentro de cada grupo el orden del
  // catalogo (que ya es el orden institucional acordado con el area).
  const peso: Record<DocGroup, number> = { personal: 0, garantia: 1, cumplimiento: 2 };
  return salida
    .map((def, indice) => ({ def, indice }))
    .sort((a, b) => {
      const d = peso[a.def.group] - peso[b.def.group];
      return d !== 0 ? d : a.indice - b.indice;
    })
    .map((entrada) => entrada.def);
}

export const DOC_TEMPLATE: DocDef[] = construirPlantilla();

/** Busqueda directa por identificador, para no recorrer la lista cada vez. */
const POR_ID: Map<string, DocDef> = new Map(DOC_TEMPLATE.map((d) => [d.id, d]));

export function docDefPorId(id: string): DocDef | undefined {
  return POR_ID.get(id);
}

export function docDefsDeGrupo(group: DocGroup): DocDef[] {
  return DOC_TEMPLATE.filter((d) => d.group === group);
}
