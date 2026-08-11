/**
 * docSchema.ts — fuente de verdad del módulo de Documentación.
 *
 * Aquí viven los tipos, el catálogo de columnas del libro y la semántica de los
 * colores. Es el espejo en TypeScript de lo que `00_Manifest.gs` declara en Apps
 * Script.
 *
 * Están duplicados a propósito, y conviene explicar por qué: gracias a esta
 * copia el frontend puede mostrar exactamente lo que se va a escribir en la
 * hoja —qué columna, qué texto, qué color— sin ir a preguntárselo al servidor.
 * La alternativa sería una llamada de red para pintar una fila, lo que dejaría
 * la interfaz muda mientras no hay conexión. El precio es mantener los dos
 * lados sincronizados; `10_Tests.gs` comprueba el lado servidor contra estas
 * mismas cifras.
 */

import type { DocGroup } from "../docTemplate";

/* ------------------------------------------------------------------ */
/* Estados                                                             */
/* ------------------------------------------------------------------ */

export type DocStatus = "pendiente" | "presentado" | "observado" | "no_aplica";

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pendiente: "Pendiente",
  presentado: "Presentado",
  observado: "Con observación",
  no_aplica: "No aplica",
};

/** Orden de recorrido al pulsar repetidamente sobre el estado. */
export const DOC_STATUS_CYCLE: DocStatus[] = ["pendiente", "presentado", "observado", "no_aplica"];

export const DOC_STATUS_TONE: Record<DocStatus, "ok" | "warn" | "danger" | "muted"> = {
  presentado: "ok",
  observado: "warn",
  pendiente: "danger",
  no_aplica: "muted",
};

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

export interface DocItem {
  id: string;
  label: string;
  group: DocGroup;
  status: DocStatus;
  pages: number;
  observation: string;
  /** ISO date (yyyy-mm-dd) — prórroga concedida para entregar. */
  prorroga?: string;
  allowProrroga?: boolean;
}

export interface EmailEvent {
  id: string;
  at: string;
  to: string;
  cc: string;
  subject: string;
  kind: "manual" | "auto";
  missingCount: number;
}

export interface Dossier {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  correo: string;
  fechaIngreso: string;
  createdAt: string;
  items: DocItem[];
  emailLog: EmailEvent[];
  /** Columnas del libro escritas a mano. Siempre ganan sobre lo derivado. */
  sheet?: Record<string, string>;
  /** Campos que solo existen en la hoja. */
  tipoEmpleado?: string;
  responsable?: string;
  observacion?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Fila histórica del Excel original, sin checklist detrás. */
  heredada?: boolean;
}

/* ------------------------------------------------------------------ */
/* Preferencias de presentación                                        */
/* ------------------------------------------------------------------ */

export type DocVista = "tarjetas" | "tabla" | "tablero";
export type DocDensidad = "comoda" | "compacta";
export type DocAnimaciones = "completas" | "suaves" | "minimas";
export type DocAgrupacion = "ninguna" | "estado" | "gerencia" | "agencia" | "mes";
export type DocOrden = "reciente" | "antiguo" | "nombre" | "avance_asc" | "avance_desc" | "atraso";

export const DOC_VISTA_LABELS: Record<DocVista, string> = {
  tarjetas: "Tarjetas",
  tabla: "Tabla",
  tablero: "Tablero",
};

export const DOC_DENSIDAD_LABELS: Record<DocDensidad, string> = {
  comoda: "Cómoda",
  compacta: "Compacta",
};

export const DOC_ANIMACION_LABELS: Record<DocAnimaciones, string> = {
  completas: "Completas",
  suaves: "Suaves",
  minimas: "Mínimas",
};

export const DOC_AGRUPACION_LABELS: Record<DocAgrupacion, string> = {
  ninguna: "Sin agrupar",
  estado: "Por estado",
  gerencia: "Por gerencia",
  agencia: "Por oficina",
  mes: "Por mes de ingreso",
};

export const DOC_ORDEN_LABELS: Record<DocOrden, string> = {
  reciente: "Más recientes",
  antiguo: "Más antiguos",
  nombre: "Nombre A-Z",
  avance_desc: "Mayor avance",
  avance_asc: "Menor avance",
  atraso: "Más atrasados",
};

/* ------------------------------------------------------------------ */
/* Estado de conexión                                                  */
/* ------------------------------------------------------------------ */

export type DocConexion =
  | "desconectado"
  | "comprobando"
  | "conectado"
  | "sin_conexion"
  | "error"
  | "sin_instalar";

export const DOC_CONEXION_LABELS: Record<DocConexion, string> = {
  desconectado: "Solo en este equipo",
  comprobando: "Conectando…",
  conectado: "Sincronizado",
  sin_conexion: "Sin conexión",
  error: "Error de conexión",
  sin_instalar: "Libro sin instalar",
};

export type DocSyncEstado = "inactivo" | "guardando" | "guardado" | "pendiente" | "error";

/* ------------------------------------------------------------------ */
/* Vocabulario del libro                                               */
/* ------------------------------------------------------------------ */

/**
 * Los cuatro valores que el área escribe en las columnas de documentos.
 *
 * El guion bajo no es un hueco por descuido: en el libro original significa
 * «revisado y no corresponde pedirlo», que no es lo mismo que una celda vacía
 * (nadie lo ha mirado todavía). Esa distinción se respeta.
 */
export const DOC_SHEET_VALUE = {
  TIENE: "TIENE",
  NO_TIENE: "NO TIENE",
  NA: "N/A",
  VACIO: "_",
} as const;

/** Colores tomados del libro real. Cada uno significa algo. */
export const DOC_COLOR = {
  COMPLETA: "#92D050",
  NUEVA: "#73DCF5",
  GESTION: "#F8CBAD",
  PRORROGA: "#FFC000",
  CRITICA: "#FF0000",
  PARCIAL: "#C5E0B4",
  OBSERVACION: "#FFFF00",
  PROCESO_BG: "#B4C7E7",
  HEADER_BASE: "#1F3864",
  HEADER_DOCS: "#4472C4",
  HEADER_EXTRA: "#005BAA",
} as const;

export const DOC_COLOR_SIGNIFICADO: { color: string; titulo: string; detalle: string }[] = [
  {
    color: DOC_COLOR.COMPLETA,
    titulo: "Expediente completo",
    detalle: "Todos los documentos aplicables están presentados.",
  },
  {
    color: DOC_COLOR.NUEVA,
    titulo: "Ingreso nuevo",
    detalle: "Registrado pero aún sin ningún documento entregado.",
  },
  {
    color: DOC_COLOR.GESTION,
    titulo: "En gestión",
    detalle: "Hay documentos con observación esperando corrección.",
  },
  {
    color: DOC_COLOR.PRORROGA,
    titulo: "Prórroga vigente",
    detalle: "Se otorgó plazo adicional; no cuenta como atraso.",
  },
  {
    color: DOC_COLOR.CRITICA,
    titulo: "Crítico",
    detalle: "Atraso grave o persona desvinculada con documentación abierta.",
  },
];

/* ------------------------------------------------------------------ */
/* Columnas de la hoja anual                                           */
/* ------------------------------------------------------------------ */

export interface DocColumnSpec {
  clave: string;
  encabezado: string;
  grupo: "base" | "documento" | "gestion";
  /** Ids del catálogo que alimentan esta columna si no se escribe a mano. */
  items?: string[];
  /** Copia el valor de otra columna (el libro repite CONTRATO DE FIANZA). */
  espejoDe?: string;
  manual?: boolean;
  derivada?: string;
}

/**
 * Columnas A–W tal como están en `registro_ingresos.xlsx`.
 *
 * Se conservan las rarezas del original a propósito: el espacio final de
 * «Tipo de Empleado », el salto de línea del consentimiento y las dos columnas
 * llamadas «CONTRATO DE FIANZA». Cambiarlas sería más limpio y rompería las
 * fórmulas y los filtros que el área ya tiene montados sobre esos nombres.
 */
export const DOC_BASE_COLUMNS: DocColumnSpec[] = [
  { clave: "nombre", encabezado: "Nombre", grupo: "base" },
  { clave: "tipo_empleado", encabezado: "Tipo de Empleado ", grupo: "base" },
  { clave: "responsable", encabezado: "Responsable de Proceso", grupo: "base" },
  { clave: "fecha_ingreso", encabezado: "Fecha Ingreso", grupo: "base" },
  { clave: "cargo", encabezado: "Cargo", grupo: "base" },
  { clave: "oficina", encabezado: "Oficina", grupo: "base" },
  { clave: "gerencia", encabezado: "Gerencia", grupo: "base" },
  { clave: "observacion", encabezado: "Observacion", grupo: "base" },
  { clave: "proceso", encabezado: "Proceso", grupo: "base", derivada: "proceso" },
  { clave: "perfil", encabezado: "PERFIL", grupo: "documento", manual: true },
  { clave: "mf_memo", encabezado: "MF Y MEMO", grupo: "documento", manual: true },
  {
    clave: "consentimiento_imagen",
    encabezado: "CONSENTIMIENTO DE USO DE IMAGEN\n(ESCANEAR)",
    grupo: "documento",
    manual: true,
  },
  {
    clave: "contrato_fianza",
    encabezado: "CONTRATO DE FIANZA",
    grupo: "documento",
    items: ["garante-ci", "garante-inmueble", "garante-folio"],
  },
  { clave: "comunicacion_interna", encabezado: "COMUNICACIÓN INTERNA", grupo: "documento", manual: true },
  {
    clave: "conozca_funcionario",
    encabezado: "CONOZCA A SU FUNCIONARIO (LISTAS LEC)",
    grupo: "documento",
    items: ["lgi-ft"],
  },
  { clave: "rejap", encabezado: "REJAP", grupo: "documento", items: ["rejap"] },
  {
    clave: "titulo_legalizado",
    encabezado: "TITULO LEGALIZADO",
    grupo: "documento",
    items: ["titulo-legalizado"],
  },
  {
    clave: "contrato_fianza_garante",
    encabezado: "CONTRATO DE FIANZA",
    grupo: "documento",
    espejoDe: "contrato_fianza",
  },
  {
    clave: "vista_informacion_rapida",
    encabezado: "VISTA O INFORMACION RAPIDA",
    grupo: "documento",
    items: ["garante-folio", "garante-boletas", "garante-form-200-400"],
  },
  {
    clave: "seguros_alianza",
    encabezado: "SEGUROS ALIANZA",
    grupo: "documento",
    items: ["seguro-accidentes"],
  },
  { clave: "crediseguro", encabezado: "CREDISEGURO", grupo: "documento", items: ["seguro-vida"] },
  {
    clave: "djj_no_codificacion",
    encabezado: "DJJ NO CODIFICACION",
    grupo: "documento",
    items: ["djj-no-vinculacion"],
  },
  {
    clave: "correo_carta_prorroga",
    encabezado: "CORREO CARTA DE PRORROGA ",
    grupo: "documento",
    derivada: "prorroga",
  },
];

/** Columnas que añade el sistema a partir de la X. */
export const DOC_EXTRA_COLUMNS: DocColumnSpec[] = [
  { clave: "id", encabezado: "ID EXPEDIENTE", grupo: "gestion" },
  { clave: "correo", encabezado: "CORREO", grupo: "gestion" },
  { clave: "avance", encabezado: "AVANCE %", grupo: "gestion" },
  { clave: "presentados", encabezado: "PRESENTADOS", grupo: "gestion" },
  { clave: "pendientes", encabezado: "PENDIENTES", grupo: "gestion" },
  { clave: "observados", encabezado: "OBSERVADOS", grupo: "gestion" },
  { clave: "paginas", encabezado: "PAGINAS", grupo: "gestion" },
  { clave: "estado", encabezado: "ESTADO", grupo: "gestion" },
  { clave: "prorroga_hasta", encabezado: "PRORROGA HASTA", grupo: "gestion" },
  { clave: "ultimo_aviso", encabezado: "ULTIMO AVISO", grupo: "gestion" },
  { clave: "avisos", encabezado: "AVISOS", grupo: "gestion" },
  { clave: "detalle_json", encabezado: "DETALLE JSON", grupo: "gestion" },
  { clave: "creado_en", encabezado: "CREADO EN", grupo: "gestion" },
  { clave: "actualizado_en", encabezado: "ACTUALIZADO EN", grupo: "gestion" },
  { clave: "actualizado_por", encabezado: "ACTUALIZADO POR", grupo: "gestion" },
  { clave: "huella", encabezado: "HUELLA", grupo: "gestion" },
];

export const DOC_YEAR_COLUMNS: DocColumnSpec[] = [...DOC_BASE_COLUMNS, ...DOC_EXTRA_COLUMNS];

export const DOC_SHEET_PREFIX = "CONTROL INGRESOS ";

export function docYearSheetName(anio: number): string {
  return `${DOC_SHEET_PREFIX}${anio}`;
}

/** Columnas que tiene sentido ofrecer en la vista de tabla. */
export const DOC_TABLE_COLUMNS: { clave: string; etiqueta: string; fijo?: boolean }[] = [
  { clave: "nombre", etiqueta: "Nombre", fijo: true },
  { clave: "cargo", etiqueta: "Cargo" },
  { clave: "agencia", etiqueta: "Oficina" },
  { clave: "gerencia", etiqueta: "Gerencia" },
  { clave: "fechaIngreso", etiqueta: "Ingreso" },
  { clave: "avance", etiqueta: "Avance" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "pendientes", etiqueta: "Pendientes" },
  { clave: "paginas", etiqueta: "Páginas" },
  { clave: "ultimoAviso", etiqueta: "Último aviso" },
];

export const DOC_TABLE_DEFAULT = [
  "nombre",
  "cargo",
  "agencia",
  "fechaIngreso",
  "avance",
  "estado",
  "pendientes",
];

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

export function normalizeStatus(value: unknown): DocStatus {
  const v = String(value ?? "").toLowerCase();
  if (v === "presentado" || v === "observado" || v === "no_aplica") return v;
  return "pendiente";
}

function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Deja un expediente en estado utilizable venga de donde venga.
 *
 * Se usa con datos del backend, de un archivo importado y del almacenamiento
 * local, y ninguno de los tres es de fiar: un archivo puede estar editado a
 * mano y el almacenamiento local puede venir de una versión anterior del
 * módulo. Nada que salga de aquí debería poder romper la interfaz.
 */
export function normalizeDossier(raw: unknown, fallbackGroup: DocGroup = "personal"): Dossier | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const identificador = toText(r.identificador ?? r.id);
  const nombre = toText(r.nombre ?? r.name);
  if (!identificador && !nombre) return null;

  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: DocItem[] = [];
  const vistos = new Set<string>();

  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = toText(o.id);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const group = toText(o.group);
    items.push({
      id,
      label: toText(o.label) || id,
      group:
        group === "personal" || group === "garantia" || group === "cumplimiento"
          ? (group as DocGroup)
          : fallbackGroup,
      status: normalizeStatus(o.status),
      pages: Math.max(0, toInt(o.pages, 0)),
      observation: toText(o.observation),
      prorroga: toText(o.prorroga) || undefined,
      allowProrroga: o.allowProrroga === true ? true : undefined,
    });
  }

  const emailRaw = Array.isArray(r.emailLog) ? r.emailLog : [];
  const emailLog: EmailEvent[] = [];
  for (const ev of emailRaw) {
    if (!ev || typeof ev !== "object") continue;
    const o = ev as Record<string, unknown>;
    const at = toText(o.at);
    if (!at) continue;
    emailLog.push({
      id: toText(o.id) || `mail-${at}`,
      at,
      to: toText(o.to),
      cc: toText(o.cc),
      subject: toText(o.subject),
      kind: o.kind === "auto" ? "auto" : "manual",
      missingCount: Math.max(0, toInt(o.missingCount, 0)),
    });
  }
  emailLog.sort((a, b) => (a.at < b.at ? 1 : -1));

  const sheet: Record<string, string> = {};
  if (r.sheet && typeof r.sheet === "object") {
    for (const [k, v] of Object.entries(r.sheet as Record<string, unknown>)) {
      const texto = toText(v);
      if (texto) sheet[k] = texto;
    }
  }

  return {
    identificador: identificador || `DOC-${Date.now().toString(36).toUpperCase()}`,
    nombre: nombre || "Sin nombre",
    cargo: toText(r.cargo),
    agencia: toText(r.agencia ?? r.oficina),
    gerencia: toText(r.gerencia),
    correo: toText(r.correo ?? r.email),
    fechaIngreso: toText(r.fechaIngreso ?? r.fecha_ingreso),
    createdAt: toText(r.createdAt) || new Date().toISOString(),
    items,
    emailLog,
    sheet: Object.keys(sheet).length ? sheet : undefined,
    tipoEmpleado: toText(r.tipoEmpleado) || undefined,
    responsable: toText(r.responsable) || undefined,
    observacion: toText(r.observacion) || undefined,
    updatedAt: toText(r.updatedAt) || undefined,
    updatedBy: toText(r.updatedBy) || undefined,
    heredada: r.heredada === true ? true : undefined,
  };
}

/** Año al que pertenece un expediente, para saber en qué pestaña va. */
export function dossierYear(d: Pick<Dossier, "fechaIngreso" | "createdAt">): number {
  const fuente = d.fechaIngreso || d.createdAt;
  const n = Number(String(fuente).slice(0, 4));
  if (n >= 2000 && n <= 2999) return n;
  return new Date().getFullYear();
}

/* ------------------------------------------------------------------ */
/* Previsualización de la fila del libro                               */
/* ------------------------------------------------------------------ */

/**
 * Calcula qué se escribirá en cada columna del libro.
 *
 * Replica `docSheetValuesFor_` del backend para que la vista previa de la hoja
 * sea fiel sin llamadas de red. Regla idéntica en los dos lados: lo que alguien
 * escribió a mano en la hoja nunca se pisa con un valor derivado.
 */
export function sheetValuesFor(dossier: Dossier): Record<string, string> {
  const porId = new Map<string, DocItem>();
  for (const item of dossier.items) porId.set(item.id, item);

  const valores: Record<string, string> = {};

  for (const columna of DOC_BASE_COLUMNS) {
    if (columna.grupo !== "documento") continue;

    if (columna.espejoDe) {
      valores[columna.clave] = valores[columna.espejoDe] ?? DOC_SHEET_VALUE.VACIO;
      continue;
    }

    if (columna.derivada === "prorroga") {
      const conProrroga = dossier.items.some((i) => !!i.prorroga);
      valores[columna.clave] = conProrroga ? "PRORROGA" : DOC_SHEET_VALUE.VACIO;
      continue;
    }

    if (columna.manual || !columna.items || !columna.items.length) {
      valores[columna.clave] = DOC_SHEET_VALUE.VACIO;
      continue;
    }

    const relacionados = columna.items
      .map((id) => porId.get(id))
      .filter((i): i is DocItem => !!i);

    if (!relacionados.length) {
      valores[columna.clave] = DOC_SHEET_VALUE.VACIO;
    } else if (relacionados.every((i) => i.status === "no_aplica")) {
      valores[columna.clave] = DOC_SHEET_VALUE.NA;
    } else {
      const aplicables = relacionados.filter((i) => i.status !== "no_aplica");
      const todos = aplicables.every((i) => i.status === "presentado");
      valores[columna.clave] = todos ? DOC_SHEET_VALUE.TIENE : DOC_SHEET_VALUE.NO_TIENE;
    }
  }

  // Lo escrito a mano manda.
  if (dossier.sheet) {
    for (const [clave, valor] of Object.entries(dossier.sheet)) {
      if (valor) valores[clave] = valor;
    }
  }

  return valores;
}

/** Color de fila que tendrá el expediente en el libro. */
export function rowTone(input: {
  avance: number;
  presentados: number;
  observados: number;
  prorroga: boolean;
  atrasado: boolean;
}): string {
  if (input.avance >= 100) return DOC_COLOR.COMPLETA;
  if (input.prorroga) return DOC_COLOR.PRORROGA;
  if (input.presentados === 0) return DOC_COLOR.NUEVA;
  if (input.observados > 0) return DOC_COLOR.GESTION;
  if (input.atrasado) return DOC_COLOR.CRITICA;
  return DOC_COLOR.PARCIAL;
}
