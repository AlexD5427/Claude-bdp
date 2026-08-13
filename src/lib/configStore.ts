import { useSyncExternalStore } from "react";

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

/** Tope duro de columnas del comparador (la cuadrícula deja de ser legible). */
export const MAX_COMPARADOR_LIMIT = 10;

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
/* Saneamiento                                                         */
/* ------------------------------------------------------------------ */

/**
 * Devuelve una configuración válida a partir de cualquier cosa.
 *
 * ## El fallo que esto cierra
 *
 * La configuración no sólo vive en `localStorage`: también viaja **por usuario**
 * en la columna `config_personal_perfil` de la hoja «Perfiles_y_Configuracion»,
 * y al iniciar sesión se aplica tal cual (ver `lib/profilesStore`). Es decir:
 * un valor inservible en esa celda —una versión antigua sin el campo, un
 * `NaN` que `JSON.stringify` convierte en `null`, una edición manual— no
 * afectaba a «el navegador de alguien», sino a **esa persona en cualquier
 * equipo**, y a nadie más. Eso es exactamente lo que se veía en soporte:
 * «a mí me funciona en todos los dispositivos, pero a ese usuario nunca».
 *
 * Concretamente, con `maxComparador: null` el comparador quedaba muerto: el
 * buscador se deshabilitaba con el rótulo «Límite alcanzado (null/null)»,
 * porque `selectedIds.length >= null` es cierto desde la primera columna. Con
 * `0` pasaba lo mismo, y con `"8"` (texto) el sistema seguía funcionando por
 * pura coerción, que es la clase de suerte que no se puede sostener.
 *
 * La regla ahora es una sola y está en un solo sitio: **nada entra al estado
 * sin pasar por aquí** — ni la lectura de `localStorage`, ni `setConfig`, ni el
 * paquete de preferencias del perfil.
 */
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const RANK_PLACEMENTS = ["tarjeta", "fila", "ambos"] as const;
const COMPARATOR_ORDERS = ["desc", "asc"] as const;
const PAPER_SIZES = ["Letter", "Legal"] as const;
const ORIENTATIONS = ["portrait", "landscape"] as const;
const THREE_QUALITIES = ["auto", "alta", "media", "baja"] as const;
const DOCK_POSITIONS = ["top", "bottom", "left", "right"] as const;
const DOCK_SIZES = ["sm", "md", "lg"] as const;

/** Sanea una plantilla de correo; descarta las que no tienen forma de plantilla. */
function sanitizeTemplate(raw: unknown): EmailTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<EmailTemplate>;
  if (typeof t.id !== "string" || t.id === "") return null;
  return {
    id: t.id,
    name: str(t.name, "Formato sin nombre"),
    category: oneOf(t.category, EMAIL_CATEGORY_ORDER, "convocatoria"),
    subject: str(t.subject, ""),
    body: str(t.body, ""),
    active: bool(t.active, true),
    system: bool(t.system, false),
    updatedAt: str(t.updatedAt, new Date().toISOString()),
  };
}

/**
 * Combina una base válida con un parche de cualquier procedencia y garantiza
 * que el resultado sigue siendo utilizable por todos los módulos.
 */
export function sanitizeConfig(
  base: AppConfig,
  patch?: Partial<AppConfig> | null,
): AppConfig {
  const p = (patch && typeof patch === "object" ? patch : {}) as Partial<AppConfig>;
  const pick = <K extends keyof AppConfig>(key: K): unknown =>
    key in p ? p[key] : base[key];

  const templates = pick("emailTemplates");
  const sanitizedTemplates = Array.isArray(templates)
    ? templates.map(sanitizeTemplate).filter((t): t is EmailTemplate => t !== null)
    : [];

  return {
    orgName: str(pick("orgName"), base.orgName),
    teamName: str(pick("teamName"), base.teamName),
    reclutador: str(pick("reclutador"), base.reclutador),

    capApprovalThreshold: num(pick("capApprovalThreshold"), 80, 40, 100),
    // El mínimo real es 2: comparar es, por definición, poner a dos personas
    // lado a lado. Un tope menor deja el módulo sin razón de ser.
    maxComparador: num(pick("maxComparador"), 10, 2, MAX_COMPARADOR_LIMIT),
    rankingEnabled: bool(pick("rankingEnabled"), true),
    rankPlacement: oneOf(pick("rankPlacement"), RANK_PLACEMENTS, "ambos"),
    sortByCapDesc: bool(pick("sortByCapDesc"), true),
    comparatorOrder: oneOf(pick("comparatorOrder"), COMPARATOR_ORDERS, "desc"),
    comparatorNavHelper: bool(pick("comparatorNavHelper"), true),
    defaultPaper: oneOf(pick("defaultPaper"), PAPER_SIZES, "Letter"),
    defaultOrientation: oneOf(pick("defaultOrientation"), ORIENTATIONS, "portrait"),

    evaluarUrl: str(pick("evaluarUrl"), base.evaluarUrl),
    autoRefresh: bool(pick("autoRefresh"), true),
    autoRefreshSeconds: num(pick("autoRefreshSeconds"), 60, 15, 3600),
    showRefreshButton: bool(pick("showRefreshButton"), true),

    enableThree: bool(pick("enableThree"), true),
    threeQuality: oneOf(pick("threeQuality"), THREE_QUALITIES, "auto"),
    reduceMotion: bool(pick("reduceMotion"), false),
    staticAvatars: bool(pick("staticAvatars"), false),

    dockPosition: oneOf(pick("dockPosition"), DOCK_POSITIONS, "top"),
    dockSize: oneOf(pick("dockSize"), DOCK_SIZES, "md"),
    dockCollapsed: bool(pick("dockCollapsed"), false),

    emailTemplates: sanitizedTemplates.length ? sanitizedTemplates : base.emailTemplates,
  };
}

/* ------------------------------------------------------------------ */
/* Store plumbing                                                      */
/* ------------------------------------------------------------------ */

function load(): AppConfig {
  const base = defaultConfig();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // Migración: el tope del comparador pasó de 5 (antiguo por omisión) a 10.
    // El valor 5 exacto se interpreta como «nunca lo tocaron» y se sube.
    if (parsed && parsed.maxComparador === 5) parsed.maxComparador = 10;
    return sanitizeConfig(base, parsed);
  } catch {
    return base;
  }
}

let state: AppConfig = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Aplica un cambio de configuración. Todo pasa por {@link sanitizeConfig}, así
 * que ningún origen —el módulo de Configuración, el paquete de preferencias del
 * perfil o una celda editada a mano en la hoja— puede dejar la aplicación en un
 * estado inservible.
 */
export function setConfig(patch: Partial<AppConfig>): void {
  state = sanitizeConfig(state, patch);
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
