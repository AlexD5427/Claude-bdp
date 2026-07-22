/**
 * Domain model + (de)serialisation for the "Perfiles de Cargo" module.
 *
 * The module authors *job profiles* that live in the `perfil_cargo_bdp` sheet.
 * A second, read-only frontend renders those rows, so the storage contract is
 * fixed:
 *
 *   · The sheet has 21 columns with the exact header names below (accents and
 *     all). Two of them carry Spanish accents on purpose
 *     (`formación_complementaria`, `conocimientos_genéricos`).
 *   · Multi-value fields are stored as **plain text** where each entry is
 *     separated by a space-pipe-space token (`" | "`). The reader turns each
 *     segment into its own bullet, so we must write that exact separator.
 *   · Images live in ten ordered slots `link_img_1 … link_img_10`; empty slots
 *     stay blank and non-empty links are kept compacted from slot 1 upward.
 *
 * This module is the single source of truth for that mapping: the UI works with
 * friendly arrays, and everything is (de)serialised here so the sheet layout
 * never leaks into components.
 */

import type { RawPerfilCargo } from "../types";

/** The separator token the read-only frontend splits multi-value cells on. */
export const PIPE = " | ";

/** How many ordered image slots the sheet exposes. */
export const MAX_IMAGENES = 10;

/** The exact header row of `perfil_cargo_bdp`, in column order. */
export const PERFIL_CARGO_HEADERS = [
  "area_cargo",
  "puesto_bdp",
  "gestion_bdp",
  "formacion_principal",
  "formación_complementaria",
  "experiencia_general",
  "experiencia_especifica",
  "conocimientos_tecnicos",
  "conocimientos_genéricos",
  "conductas_requeridas",
  "competencias_requeridas",
  "link_evaluar",
  "link_img_1",
  "link_img_2",
  "link_img_3",
  "link_img_4",
  "link_img_5",
  "link_img_6",
  "link_img_7",
  "link_img_8",
  "link_img_9",
  "link_img_10",
] as const;

/** A job profile after normalisation — friendly arrays the UI can trust. */
export interface PerfilCargo {
  /** 1-based index among data rows: the sheet write key (edit/delete target). */
  fila: number;
  /** Stable React key. */
  id: string;
  areaCargo: string;
  puestoBdp: string;
  gestionBdp: string;
  formacionPrincipal: string[];
  formacionComplementaria: string[];
  experienciaGeneral: string[];
  experienciaEspecifica: string[];
  conocimientosTecnicos: string[];
  conocimientosGenericos: string[];
  conductasRequeridas: string[];
  competenciasRequeridas: string[];
  linkEvaluar: string;
  /** Ordered, compacted image links (empty slots removed). */
  imagenes: string[];
}

/** The editable form shape (mirrors {@link PerfilCargo} minus the row key). */
export interface PerfilCargoForm {
  areaCargo: string;
  puestoBdp: string;
  gestionBdp: string;
  formacionPrincipal: string[];
  formacionComplementaria: string[];
  experienciaGeneral: string[];
  experienciaEspecifica: string[];
  conocimientosTecnicos: string[];
  conocimientosGenericos: string[];
  conductasRequeridas: string[];
  competenciasRequeridas: string[];
  linkEvaluar: string;
  imagenes: string[];
}

/* ------------------------------------------------------------------ */
/* Pipe helpers                                                        */
/* ------------------------------------------------------------------ */

/** Split a stored cell into its bullet segments (tolerant of odd spacing). */
export function splitPipes(value: unknown): string[] {
  const text = value == null ? "" : String(value);
  if (!text.trim()) return [];
  return text
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join UI entries back into the exact `" | "`-separated storage format. */
export function joinPipes(items: string[]): string {
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .join(PIPE);
}

/* ------------------------------------------------------------------ */
/* (De)serialisation                                                   */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Read the ten image slots into a compacted, ordered array. */
function readImagenes(raw: RawPerfilCargo): string[] {
  const out: string[] = [];
  for (let i = 1; i <= MAX_IMAGENES; i++) {
    const v = str(raw[`link_img_${i}`]);
    if (v) out.push(v);
  }
  return out;
}

/** Normalise a raw sheet row into a friendly profile. */
export function normalisePerfilCargo(raw: RawPerfilCargo, index: number): PerfilCargo {
  const fila = Number(raw._fila ?? index + 1);
  const areaCargo = str(raw.area_cargo);
  const puestoBdp = str(raw.puesto_bdp);
  const gestionBdp = str(raw.gestion_bdp);
  return {
    fila,
    id: `pc-${fila}-${slugKey(`${puestoBdp}-${areaCargo}-${gestionBdp}`)}`,
    areaCargo,
    puestoBdp,
    gestionBdp,
    formacionPrincipal: splitPipes(raw.formacion_principal),
    formacionComplementaria: splitPipes(raw["formación_complementaria"]),
    experienciaGeneral: splitPipes(raw.experiencia_general),
    experienciaEspecifica: splitPipes(raw.experiencia_especifica),
    conocimientosTecnicos: splitPipes(raw.conocimientos_tecnicos),
    conocimientosGenericos: splitPipes(raw["conocimientos_genéricos"]),
    conductasRequeridas: splitPipes(raw.conductas_requeridas),
    competenciasRequeridas: splitPipes(raw.competencias_requeridas),
    linkEvaluar: str(raw.link_evaluar),
    imagenes: readImagenes(raw),
  };
}

/** Serialise a form into the flat, header-keyed row the sheet expects. */
export function toRawPerfilCargo(form: PerfilCargoForm): RawPerfilCargo {
  const row: RawPerfilCargo = {
    area_cargo: form.areaCargo.trim(),
    puesto_bdp: form.puestoBdp.trim(),
    gestion_bdp: form.gestionBdp.trim(),
    formacion_principal: joinPipes(form.formacionPrincipal),
    "formación_complementaria": joinPipes(form.formacionComplementaria),
    experiencia_general: joinPipes(form.experienciaGeneral),
    experiencia_especifica: joinPipes(form.experienciaEspecifica),
    conocimientos_tecnicos: joinPipes(form.conocimientosTecnicos),
    "conocimientos_genéricos": joinPipes(form.conocimientosGenericos),
    conductas_requeridas: joinPipes(form.conductasRequeridas),
    competencias_requeridas: joinPipes(form.competenciasRequeridas),
    link_evaluar: form.linkEvaluar.trim(),
  };
  const imgs = form.imagenes.map((s) => s.trim()).filter(Boolean).slice(0, MAX_IMAGENES);
  for (let i = 1; i <= MAX_IMAGENES; i++) {
    row[`link_img_${i}`] = imgs[i - 1] ?? "";
  }
  return row;
}

/** Turn a normalised profile back into an editable form. */
export function toForm(p: PerfilCargo): PerfilCargoForm {
  return {
    areaCargo: p.areaCargo,
    puestoBdp: p.puestoBdp,
    gestionBdp: p.gestionBdp,
    formacionPrincipal: p.formacionPrincipal.length ? [...p.formacionPrincipal] : [""],
    formacionComplementaria: p.formacionComplementaria.length ? [...p.formacionComplementaria] : [""],
    experienciaGeneral: p.experienciaGeneral.length ? [...p.experienciaGeneral] : [""],
    experienciaEspecifica: p.experienciaEspecifica.length ? [...p.experienciaEspecifica] : [""],
    conocimientosTecnicos: p.conocimientosTecnicos.length ? [...p.conocimientosTecnicos] : [""],
    conocimientosGenericos: p.conocimientosGenericos.length ? [...p.conocimientosGenericos] : [""],
    conductasRequeridas: p.conductasRequeridas.length ? [...p.conductasRequeridas] : [""],
    competenciasRequeridas: p.competenciasRequeridas.length ? [...p.competenciasRequeridas] : [""],
    linkEvaluar: p.linkEvaluar,
    imagenes: [...p.imagenes],
  };
}

/** A blank form, with the current year pre-filled for `gestion_bdp`. */
export function emptyForm(): PerfilCargoForm {
  return {
    areaCargo: "",
    puestoBdp: "",
    gestionBdp: String(new Date().getFullYear()),
    formacionPrincipal: [""],
    formacionComplementaria: [""],
    experienciaGeneral: [""],
    experienciaEspecifica: [""],
    conocimientosTecnicos: [""],
    conocimientosGenericos: [""],
    conductasRequeridas: [""],
    competenciasRequeridas: [""],
    linkEvaluar: "",
    imagenes: [],
  };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * The Evaluar.com convocatoria link follows a fixed shape, e.g.
 *   https://bdp.evaluar.com/trabajo/oficial-de-creditos-2026/
 * We accept any `*.evaluar.com` host with a `/trabajo/<slug>` path (trailing
 * slash optional). This is a first automatic filter; a human then confirms.
 */
const EVALUAR_RE = /^https:\/\/[a-z0-9-]+\.evaluar\.com\/trabajo\/[a-z0-9-]+\/?$/i;

export function isValidEvaluarUrl(url: string): boolean {
  return EVALUAR_RE.test(url.trim());
}

/** Whether a string looks like a usable http(s) image URL. */
export function isLikelyUrl(url: string): boolean {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

/** Field-level validation for the confirm-and-save step. */
export function validateForm(form: PerfilCargoForm): string[] {
  const errors: string[] = [];
  if (!form.areaCargo.trim()) errors.push("El «Área del Perfil» es obligatoria.");
  if (!form.puestoBdp.trim()) errors.push("El «Puesto del Perfil» es obligatorio.");
  if (!/^\d{4}$/.test(form.gestionBdp.trim())) errors.push("La «Gestión» debe ser un año de 4 dígitos.");
  const hasOne = (arr: string[]) => arr.some((s) => s.trim());
  if (!hasOne(form.formacionPrincipal)) errors.push("Agrega al menos una «Formación Principal».");
  if (!hasOne(form.experienciaGeneral)) errors.push("Agrega al menos una «Experiencia General».");
  if (form.linkEvaluar.trim() && !isValidEvaluarUrl(form.linkEvaluar))
    errors.push("El enlace de Evaluar no tiene el formato esperado.");
  return errors;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function slugKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/** True when a form has any user-entered content (drives draft autosave). */
export function formHasContent(form: PerfilCargoForm): boolean {
  if (form.areaCargo.trim() || form.puestoBdp.trim() || form.linkEvaluar.trim()) return true;
  if (form.imagenes.some((s) => s.trim())) return true;
  const lists = [
    form.formacionPrincipal,
    form.formacionComplementaria,
    form.experienciaGeneral,
    form.experienciaEspecifica,
    form.conocimientosTecnicos,
    form.conocimientosGenericos,
    form.conductasRequeridas,
    form.competenciasRequeridas,
  ];
  return lists.some((l) => l.some((s) => s.trim()));
}
