import { useSyncExternalStore } from "react";
import { readJson, safeLocal, writeJson } from "../shared/safeStorage";

/**
 * System configuration store.
 *
 * The Configuración module is the single place where the recruitment team tunes
 * how the whole application behaves: institutional identity, the evaluation /
 * comparator rules (CAP approval threshold, tie tolerance, ranking), the visual
 * engine (Liquid Glass + Three.js) and — crucially — the library of reusable
 * **email formats** ("Formatos de Correo Activos") that power every automated
 * message the team sends across the hiring lifecycle.
 *
 * Like {@link ./docStore} and {@link ./hiringStore}, this is a resilient
 * `localStorage`-backed store exposed through `useSyncExternalStore`, so it is
 * instantly reactive and survives reloads without any backend dependency.
 */

/* ------------------------------------------------------------------ */
/* Email formats — the "Formatos de Correo Activos" library            */
/* ------------------------------------------------------------------ */

/** The stages of the hiring lifecycle an email format can belong to. */
export type EmailCategory =
  | "acefalia"
  | "convocatoria"
  | "evaluacion"
  | "entrevista"
  | "documentacion"
  | "oferta"
  | "contratacion"
  | "rechazo";

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  acefalia: "Apertura de Acefalía",
  convocatoria: "Convocatoria / Invitación",
  evaluacion: "Evaluación Psicométrica",
  entrevista: "Entrevista",
  documentacion: "Documentación",
  oferta: "Carta Oferta",
  contratacion: "Bienvenida / Onboarding",
  rechazo: "No Selección",
};

/** Ordered for display in the module. */
export const EMAIL_CATEGORY_ORDER: EmailCategory[] = [
  "acefalia",
  "convocatoria",
  "evaluacion",
  "entrevista",
  "documentacion",
  "oferta",
  "contratacion",
  "rechazo",
];

/** Placeholder tokens the composer understands, grouped for the helper UI. */
export const EMAIL_PLACEHOLDERS = [
  "{nombre}",
  "{cargo}",
  "{area}",
  "{gerencia}",
  "{proceso}",
  "{reclutador}",
  "{enlace_evaluar}",
  "{fecha}",
  "{fecha_ingreso}",
  "{dias}",
  "{faltantes}",
  "{avance}",
] as const;

export interface EmailTemplate {
  id: string;
  name: string;
  category: EmailCategory;
  subject: string;
  body: string;
  /** Whether this format is currently in service (usable / auto-selectable). */
  active: boolean;
  /** Seeded, system-provided formats can be reset but not deleted. */
  system?: boolean;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Whole configuration shape                                           */
/* ------------------------------------------------------------------ */

export type ThreeQuality = "auto" | "alta" | "media" | "baja";
export type PaperSize = "Letter" | "Legal";
export type PaperOrientation = "portrait" | "landscape";

/** Where the CAP ranking badge is surfaced in the comparator. */
export type RankPlacement = "tarjeta" | "fila" | "ambos";
/** Sort direction for the comparator columns (highest CAP left = "desc"). */
export type ComparatorOrder = "desc" | "asc";

/** Where the floating dock lives on screen. */
export type DockPosition = "top" | "bottom" | "left" | "right";
/** The dock's overall scale. */
export type DockSize = "sm" | "md" | "lg";

export interface AppConfig {
  /* Institucional */
  orgName: string;
  teamName: string;
  reclutador: string;

  /* Evaluación y comparador */
  capApprovalThreshold: number;
  maxComparador: number;
  rankingEnabled: boolean;
  /** Where the ranking badge appears: profile card, dedicated row, or both. */
  rankPlacement: RankPlacement;
  sortByCapDesc: boolean;
  /** Default column order when sorting by Nota CAP. */
  comparatorOrder: ComparatorOrder;
  /** Show the floating navigation helper when the grid overflows. */
  comparatorNavHelper: boolean;
  defaultPaper: PaperSize;
  defaultOrientation: PaperOrientation;

  /* Integraciones */
  evaluarUrl: string;
  /** Poll the database in the background so the app always shows fresh data. */
  autoRefresh: boolean;
  /** Seconds between passive background refreshes. */
  autoRefreshSeconds: number;
  /** Show the floating "actualizar base de datos" button. */
  showRefreshButton: boolean;

  /* Apariencia y rendimiento */
  enableThree: boolean;
  threeQuality: ThreeQuality;
  reduceMotion: boolean;
  /** Render profile avatars as static (no idle animations) for low-end devices. */
  staticAvatars: boolean;

  /* Dock de accesos directos */
  dockPosition: DockPosition;
  dockSize: DockSize;
  dockCollapsed: boolean;

  /* Formatos de correo */
  emailTemplates: EmailTemplate[];
}

const KEY = "bdp-config";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const SIGNATURE = [
  "",
  "Saludos cordiales,",
  "{reclutador}",
  "Equipo de Reclutamiento y Selección · BDP",
].join("\n");

/** The seeded, professionally-written email formats (inspired by leading ATS). */
export function defaultTemplates(): EmailTemplate[] {
  const now = new Date().toISOString();
  const seed = (
    t: Omit<EmailTemplate, "id" | "updatedAt" | "active" | "system"> &
      Partial<Pick<EmailTemplate, "active">>,
  ): EmailTemplate => ({
    id: uid(),
    active: t.active ?? true,
    system: true,
    updatedAt: now,
    ...t,
  });

  return [
    seed({
      name: "Apertura de acefalía",
      category: "acefalia",
      subject: "Apertura de proceso · {cargo} (Proceso {proceso})",
      body: [
        "Estimado equipo:",
        "",
        "Se ha registrado la acefalía del cargo de {cargo} en {area} ({gerencia}). Con ello queda formalmente aperturado el proceso de reclutamiento y selección N.º {proceso}.",
        "",
        "Iniciaremos la búsqueda y evaluación de postulantes conforme a los perfiles definidos. Cualquier requerimiento adicional del área, quedamos atentos.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Invitación a postular",
      category: "convocatoria",
      subject: "Convocatoria BDP · {cargo}",
      body: [
        "Estimado/a {nombre}:",
        "",
        "El Banco de Desarrollo Productivo tiene abierto el proceso {proceso} para el cargo de {cargo} en {area}. Por su perfil, le invitamos a participar.",
        "",
        "Si está interesado/a, le agradeceremos confirmar su participación respondiendo a este correo antes del {fecha}.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Invitación a evaluación (Evaluar.com)",
      category: "evaluacion",
      subject: "Evaluación en línea · Proceso {proceso} — {cargo}",
      body: [
        "Estimado/a {nombre}:",
        "",
        "Como parte del proceso de selección para el cargo de {cargo}, le invitamos a completar la batería de pruebas psicométricas en nuestra plataforma de evaluación.",
        "",
        "Ingrese al siguiente enlace y siga las instrucciones: {enlace_evaluar}",
        "",
        "Le recomendamos realizarla en un ambiente tranquilo y sin interrupciones. Tiene plazo hasta el {fecha}.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Programación de entrevista",
      category: "entrevista",
      subject: "Entrevista · {cargo} (Proceso {proceso})",
      body: [
        "Estimado/a {nombre}:",
        "",
        "Nos complace invitarle a la etapa de entrevista para el cargo de {cargo}. Le proponemos la fecha {fecha}.",
        "",
        "Por favor confirme su disponibilidad respondiendo a este correo. Ante cualquier ajuste, quedamos a su disposición.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Recordatorio de documentación",
      category: "documentacion",
      subject: "BDP · Documentación pendiente para su incorporación",
      body: [
        "Estimado/a {nombre}:",
        "",
        "Como parte de su proceso de incorporación al Banco de Desarrollo Productivo para el cargo de {cargo}, le recordamos que aún tenemos pendiente la recepción de la siguiente documentación:",
        "",
        "{faltantes}",
        "",
        "Han transcurrido {dias} día(s) desde su fecha de ingreso ({fecha_ingreso}). Le agradeceremos presentar la documentación faltante a la brevedad posible.",
        "",
        "Ante cualquier consulta, quedamos a su disposición.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Carta oferta",
      category: "oferta",
      subject: "Propuesta laboral · {cargo} — BDP",
      body: [
        "Estimado/a {nombre}:",
        "",
        "Nos complace comunicarle que ha sido seleccionado/a para el cargo de {cargo} en {area}. Adjuntamos los términos de la propuesta para su revisión.",
        "",
        "Le agradeceremos confirmar su aceptación antes del {fecha} para coordinar los siguientes pasos de su incorporación.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Bienvenida / onboarding",
      category: "contratacion",
      subject: "¡Bienvenido/a al BDP, {nombre}!",
      body: [
        "Estimado/a {nombre}:",
        "",
        "¡Le damos la más cordial bienvenida al Banco de Desarrollo Productivo! Su fecha de ingreso al cargo de {cargo} está prevista para el {fecha_ingreso}.",
        "",
        "En los próximos días le compartiremos su plan de inducción y la documentación a presentar. Estamos muy contentos de que forme parte del equipo.",
        SIGNATURE,
      ].join("\n"),
    }),
    seed({
      name: "Comunicación de no selección",
      category: "rechazo",
      subject: "Resultado del proceso {proceso} · {cargo}",
      body: [
        "Estimado/a {nombre}:",
        "",
        "Agradecemos sinceramente su participación en el proceso de selección para el cargo de {cargo}. Tras una cuidadosa evaluación, en esta oportunidad hemos decidido continuar con otros perfiles.",
        "",
        "Valoramos su interés y su tiempo, y conservaremos su postulación en nuestra base para futuras convocatorias acordes a su perfil.",
        SIGNATURE,
      ].join("\n"),
    }),
  ];
}

export function defaultConfig(): AppConfig {
  return {
    orgName: "Banco de Desarrollo Productivo BDP – S.A.M.",
    teamName: "Reclutamiento y Selección",
    reclutador: "",

    capApprovalThreshold: 80,
    maxComparador: 10,
    rankingEnabled: true,
    rankPlacement: "ambos",
    sortByCapDesc: true,
    comparatorOrder: "desc",
    comparatorNavHelper: true,
    defaultPaper: "Letter",
    defaultOrientation: "portrait",

    evaluarUrl: "https://www.evaluar.com",
    autoRefresh: true,
    autoRefreshSeconds: 60,
    showRefreshButton: true,

    enableThree: true,
    threeQuality: "auto",
    reduceMotion: false,
    staticAvatars: false,

    dockPosition: "top",
    dockSize: "md",
    dockCollapsed: false,

    emailTemplates: defaultTemplates(),
  };
}

/* ------------------------------------------------------------------ */
/* Store plumbing                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Saneamiento                                                         */
/* ------------------------------------------------------------------ */

/**
 * Un valor de configuración imposible dejaba módulos inservibles.
 *
 * La configuración no llega sólo del módulo de Configuración (cuyos controles ya
 * acotan cada campo): también llega **del `localStorage` de una versión
 * anterior** y, sobre todo, del `config_personal_perfil` que cada perfil guarda
 * en la hoja y que se aplica al iniciar sesión. Por esa segunda vía un
 * `maxComparador: 0` seguía a la persona de un equipo a otro, y el buscador del
 * Comparador aparecía apagado con «Límite alcanzado (0/0)»: la persona no podía
 * comparar a nadie mientras al resto del equipo todo le funcionaba. Reproducido
 * en el arnés de QA (`login-config-heredada`).
 *
 * Por eso el saneamiento vive aquí, en la única puerta de entrada del estado, y
 * no en cada consumidor: {@link load} y {@link setConfig} pasan por él, así que
 * ningún valor fuera de rango puede alcanzar la interfaz.
 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pickOption<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

const RANK_PLACEMENTS = ["tarjeta", "fila", "ambos"] as const;
const COMPARATOR_ORDERS = ["desc", "asc"] as const;
const PAPER_SIZES = ["Letter", "Legal"] as const;
const ORIENTATIONS = ["portrait", "landscape"] as const;
const THREE_QUALITIES = ["auto", "alta", "media", "baja"] as const;
const DOCK_POSITIONS = ["top", "bottom", "left", "right"] as const;
const DOCK_SIZES = ["sm", "md", "lg"] as const;

/** Sólo se conservan los formatos de correo que tienen la forma esperada. */
function sanitiseTemplates(value: unknown, fallback: EmailTemplate[]): EmailTemplate[] {
  if (!Array.isArray(value)) return fallback;
  const valid = value.filter(
    (t): t is EmailTemplate =>
      Boolean(t) &&
      typeof t === "object" &&
      typeof (t as EmailTemplate).id === "string" &&
      typeof (t as EmailTemplate).name === "string" &&
      EMAIL_CATEGORY_ORDER.includes((t as EmailTemplate).category),
  );
  return valid.length ? valid : fallback;
}

/**
 * Devuelve una configuración completa y coherente a partir de cualquier objeto
 * (persistido, heredado del perfil o parcial). `base` es el estado sobre el que
 * se aplica el parche; los campos ausentes se conservan tal cual.
 */
export function sanitiseConfig(
  patch: Partial<AppConfig> | null | undefined,
  base: AppConfig = defaultConfig(),
): AppConfig {
  if (!patch || typeof patch !== "object") return base;
  const has = (key: keyof AppConfig) => key in patch;
  const keep = <K extends keyof AppConfig>(key: K): AppConfig[K] => base[key];

  return {
    orgName: has("orgName") ? pickText(patch.orgName, base.orgName) : keep("orgName"),
    teamName: has("teamName") ? pickText(patch.teamName, base.teamName) : keep("teamName"),
    reclutador: has("reclutador") ? pickText(patch.reclutador, base.reclutador) : keep("reclutador"),

    capApprovalThreshold: has("capApprovalThreshold")
      ? clampNumber(patch.capApprovalThreshold, 40, 100, base.capApprovalThreshold)
      : keep("capApprovalThreshold"),
    // El máximo de columnas nunca puede bajar de 2: con 0 o 1 el comparador
    // deja de poder comparar, que es literalmente su única función.
    maxComparador: has("maxComparador")
      ? clampNumber(patch.maxComparador, 2, 10, base.maxComparador)
      : keep("maxComparador"),
    rankingEnabled: has("rankingEnabled")
      ? pickBoolean(patch.rankingEnabled, base.rankingEnabled)
      : keep("rankingEnabled"),
    rankPlacement: has("rankPlacement")
      ? pickOption(patch.rankPlacement, RANK_PLACEMENTS, base.rankPlacement)
      : keep("rankPlacement"),
    sortByCapDesc: has("sortByCapDesc")
      ? pickBoolean(patch.sortByCapDesc, base.sortByCapDesc)
      : keep("sortByCapDesc"),
    comparatorOrder: has("comparatorOrder")
      ? pickOption(patch.comparatorOrder, COMPARATOR_ORDERS, base.comparatorOrder)
      : keep("comparatorOrder"),
    comparatorNavHelper: has("comparatorNavHelper")
      ? pickBoolean(patch.comparatorNavHelper, base.comparatorNavHelper)
      : keep("comparatorNavHelper"),
    defaultPaper: has("defaultPaper")
      ? pickOption(patch.defaultPaper, PAPER_SIZES, base.defaultPaper)
      : keep("defaultPaper"),
    defaultOrientation: has("defaultOrientation")
      ? pickOption(patch.defaultOrientation, ORIENTATIONS, base.defaultOrientation)
      : keep("defaultOrientation"),

    evaluarUrl: has("evaluarUrl") ? pickText(patch.evaluarUrl, base.evaluarUrl) : keep("evaluarUrl"),
    autoRefresh: has("autoRefresh")
      ? pickBoolean(patch.autoRefresh, base.autoRefresh)
      : keep("autoRefresh"),
    // Menos de 15 s martillearía la hoja y agotaría la cuota de Apps Script.
    autoRefreshSeconds: has("autoRefreshSeconds")
      ? clampNumber(patch.autoRefreshSeconds, 15, 900, base.autoRefreshSeconds)
      : keep("autoRefreshSeconds"),
    showRefreshButton: has("showRefreshButton")
      ? pickBoolean(patch.showRefreshButton, base.showRefreshButton)
      : keep("showRefreshButton"),

    enableThree: has("enableThree")
      ? pickBoolean(patch.enableThree, base.enableThree)
      : keep("enableThree"),
    threeQuality: has("threeQuality")
      ? pickOption(patch.threeQuality, THREE_QUALITIES, base.threeQuality)
      : keep("threeQuality"),
    reduceMotion: has("reduceMotion")
      ? pickBoolean(patch.reduceMotion, base.reduceMotion)
      : keep("reduceMotion"),
    staticAvatars: has("staticAvatars")
      ? pickBoolean(patch.staticAvatars, base.staticAvatars)
      : keep("staticAvatars"),

    dockPosition: has("dockPosition")
      ? pickOption(patch.dockPosition, DOCK_POSITIONS, base.dockPosition)
      : keep("dockPosition"),
    dockSize: has("dockSize")
      ? pickOption(patch.dockSize, DOCK_SIZES, base.dockSize)
      : keep("dockSize"),
    dockCollapsed: has("dockCollapsed")
      ? pickBoolean(patch.dockCollapsed, base.dockCollapsed)
      : keep("dockCollapsed"),

    emailTemplates: has("emailTemplates")
      ? sanitiseTemplates(patch.emailTemplates, base.emailTemplates)
      : keep("emailTemplates"),
  };
}

function load(): AppConfig {
  const base = defaultConfig();
  const parsed = readJson<Partial<AppConfig> | null>(safeLocal, KEY, null);
  if (!parsed) return base;
  // Migración: el máximo del comparador pasó de 5 (valor antiguo por omisión) a
  // 10. Se respeta cualquier elección explícita distinta de la anterior.
  const migrated: Partial<AppConfig> = { ...parsed };
  if (migrated.maxComparador === undefined || migrated.maxComparador === 5) {
    migrated.maxComparador = 10;
  }
  return sanitiseConfig(migrated, base);
}

let state: AppConfig = load();
const listeners = new Set<() => void>();

function persist() {
  writeJson(safeLocal, KEY, state);
}

function emit() {
  persist();
  for (const l of listeners) l();
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Aplica un parche de configuración **saneado**.
 *
 * Los parches no vienen sólo de los controles del módulo: `applyBundle` (ver
 * `lib/profilesStore`) aplica aquí lo que el perfil guardó en la hoja, que puede
 * ser de otra versión o estar corrupto. Sanear en la puerta de entrada es lo que
 * garantiza que el resto de la aplicación pueda confiar en estos valores.
 */
export function setConfig(patch: Partial<AppConfig>): void {
  state = sanitiseConfig(patch, state);
  emit();
}

export function resetConfig(): void {
  state = defaultConfig();
  emit();
}

export function upsertTemplate(tpl: EmailTemplate): void {
  const idx = state.emailTemplates.findIndex((t) => t.id === tpl.id);
  const next = [...state.emailTemplates];
  const stamped = { ...tpl, updatedAt: new Date().toISOString() };
  if (idx >= 0) next[idx] = stamped;
  else next.push(stamped);
  state = { ...state, emailTemplates: next };
  emit();
}

export function createTemplate(category: EmailCategory): EmailTemplate {
  const tpl: EmailTemplate = {
    id: uid(),
    name: "Nuevo formato",
    category,
    subject: "",
    body: "",
    active: true,
    system: false,
    updatedAt: new Date().toISOString(),
  };
  state = { ...state, emailTemplates: [...state.emailTemplates, tpl] };
  emit();
  return tpl;
}

export function duplicateTemplate(id: string): void {
  const src = state.emailTemplates.find((t) => t.id === id);
  if (!src) return;
  const copy: EmailTemplate = {
    ...src,
    id: uid(),
    name: `${src.name} (copia)`,
    system: false,
    updatedAt: new Date().toISOString(),
  };
  state = { ...state, emailTemplates: [...state.emailTemplates, copy] };
  emit();
}

export function removeTemplate(id: string): void {
  state = { ...state, emailTemplates: state.emailTemplates.filter((t) => t.id !== id) };
  emit();
}

export function toggleTemplateActive(id: string, active: boolean): void {
  state = {
    ...state,
    emailTemplates: state.emailTemplates.map((t) => (t.id === id ? { ...t, active } : t)),
  };
  emit();
}

/** The first active template for a category (used to bridge with Documentación). */
export function activeTemplateFor(
  templates: EmailTemplate[],
  category: EmailCategory,
): EmailTemplate | undefined {
  return templates.find((t) => t.category === category && t.active);
}

/* ------------------------------------------------------------------ */
/* React bindings                                                      */
/* ------------------------------------------------------------------ */

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): AppConfig {
  return state;
}

/** Imperative snapshot getter (for non-React consumers, e.g. profile bundles). */
export function getConfig(): AppConfig {
  return state;
}

/** Subscribe to config changes outside React (returns an unsubscribe fn). */
export function subscribeConfig(cb: () => void): () => void {
  return subscribe(cb);
}

export function useConfig(): AppConfig {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
