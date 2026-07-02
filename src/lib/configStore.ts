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

export interface AppConfig {
  /* Institucional */
  orgName: string;
  teamName: string;
  reclutador: string;

  /* Evaluación y comparador */
  capApprovalThreshold: number;
  tieThreshold: number;
  maxComparador: number;
  rankingEnabled: boolean;
  sortByCapDesc: boolean;
  defaultPaper: PaperSize;
  defaultOrientation: PaperOrientation;

  /* Integraciones */
  evaluarUrl: string;

  /* Apariencia y rendimiento */
  enableThree: boolean;
  threeQuality: ThreeQuality;
  reduceMotion: boolean;

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
    tieThreshold: 2,
    maxComparador: 5,
    rankingEnabled: true,
    sortByCapDesc: true,
    defaultPaper: "Letter",
    defaultOrientation: "portrait",

    evaluarUrl: "https://www.evaluar.com",

    enableThree: true,
    threeQuality: "auto",
    reduceMotion: false,

    emailTemplates: defaultTemplates(),
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
    return {
      ...base,
      ...parsed,
      // Templates: keep persisted ones if present, else the seeded set.
      emailTemplates:
        Array.isArray(parsed.emailTemplates) && parsed.emailTemplates.length
          ? parsed.emailTemplates
          : base.emailTemplates,
    };
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

export function setConfig(patch: Partial<AppConfig>): void {
  state = { ...state, ...patch };
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

export function useConfig(): AppConfig {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
