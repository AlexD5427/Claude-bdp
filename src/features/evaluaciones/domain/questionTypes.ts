/**
 * Catálogo de tipos de bloque y pregunta — espejo del backend.
 *
 * `apps-script/evaluaciones/08_Types.gs` declara lo mismo con las mismas claves.
 * `__tests__/typeParity.test.ts` compara los dos catálogos y falla si alguien
 * añade un tipo en un lado y lo olvida en el otro. Esa desincronización era una
 * de las grietas del módulo anterior: el navegador ofrecía tipos que el servidor
 * no sabía guardar ni calificar.
 *
 * Aquí, además de la parte compartida (`kind`, `expects`, `options`, `auto`,
 * `scoring`, `multiple`), viven los metadatos que solo la interfaz necesita:
 * etiqueta, descripción, grupo del panel y valores iniciales al insertar.
 *
 * Cobertura: todos los tipos de Google Forms más los que un proceso de selección
 * necesita de verdad.
 */

export type TipoKind = "contenido" | "pregunta";

export type TipoExpects =
  | "ninguno"
  | "texto"
  | "numero"
  | "fecha"
  | "hora"
  | "opcion"
  | "opciones"
  | "matriz"
  | "orden"
  | "emparejamiento"
  | "clasificacion"
  | "huecos"
  | "archivo"
  | "escala";

export type TipoOptions = "ninguna" | "requeridas" | "opcionales";
export type ModoPuntaje = "ninguno" | "exacto" | "parcial" | "por_opcion" | "manual";

/** Grupos del panel de inserción, en el orden en que se muestran. */
export const GRUPOS_TIPO = [
  "contenido",
  "texto",
  "numeros",
  "fechas",
  "opciones",
  "escalas",
  "cuadriculas",
  "avanzadas",
  "archivos",
] as const;
export type GrupoTipo = (typeof GRUPOS_TIPO)[number];

export const GRUPO_LABEL: Record<GrupoTipo, string> = {
  contenido: "Contenido",
  texto: "Texto libre",
  numeros: "Números",
  fechas: "Fecha y hora",
  opciones: "Opciones",
  escalas: "Escalas",
  cuadriculas: "Cuadrículas",
  avanzadas: "Estructuras avanzadas",
  archivos: "Archivos",
};

export interface TipoSpec {
  /** Parte compartida con el backend. */
  kind: TipoKind;
  expects: TipoExpects;
  options: TipoOptions;
  auto: boolean;
  scoring: ModoPuntaje;
  multiple?: boolean;
  /** Metadatos de interfaz. */
  etiqueta: string;
  descripcion: string;
  grupo: GrupoTipo;
  /** Icono de `lucide-react`, por nombre. */
  icono: string;
  /** Cuántas opciones se crean al insertar el bloque. */
  opcionesIniciales?: number;
  /** Configuración inicial. */
  configuracion?: Record<string, unknown>;
  /** Equivalente en Google Forms, cuando existe. Solo documental. */
  googleForms?: string;
}

export const TIPOS: Record<string, TipoSpec> = {
  /* ------------------------------- Contenido ----------------------------- */

  contenido_titulo: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Título", descripcion: "Encabezado para separar partes de la prueba.",
    grupo: "contenido", icono: "Heading", googleForms: "Título y descripción",
  },
  contenido_parrafo: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Párrafo", descripcion: "Texto explicativo con formato enriquecido.",
    grupo: "contenido", icono: "AlignLeft", googleForms: "Título y descripción",
  },
  contenido_aviso: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Aviso destacado", descripcion: "Bloque resaltado para instrucciones críticas.",
    grupo: "contenido", icono: "Info", configuracion: { tonoAviso: "info" },
  },
  contenido_imagen: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Imagen", descripcion: "Imagen por URL, con texto alternativo.",
    grupo: "contenido", icono: "Image", googleForms: "Imagen",
  },
  contenido_video: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Video", descripcion: "Video incrustado por URL.",
    grupo: "contenido", icono: "Video", googleForms: "Video",
  },
  contenido_recurso: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Recurso o enlace", descripcion: "Enlace a un documento de apoyo.",
    grupo: "contenido", icono: "Link",
  },
  contenido_separador: {
    kind: "contenido", expects: "ninguno", options: "ninguna", auto: false, scoring: "ninguno",
    etiqueta: "Separador", descripcion: "Línea divisoria.",
    grupo: "contenido", icono: "Minus",
  },

  /* ------------------------------ Texto libre ---------------------------- */

  texto_corto: {
    kind: "pregunta", expects: "texto", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Respuesta corta", descripcion: "Una línea. Se puede calificar comparando con la clave.",
    grupo: "texto", icono: "Type", googleForms: "Respuesta corta",
    configuracion: { marcador: "Escribe tu respuesta" },
  },
  texto_largo: {
    kind: "pregunta", expects: "texto", options: "ninguna", auto: false, scoring: "manual",
    etiqueta: "Párrafo de respuesta", descripcion: "Texto extenso. Lo califica una persona.",
    grupo: "texto", icono: "AlignJustify", googleForms: "Párrafo",
    configuracion: { lineas: 5 },
  },
  correo: {
    kind: "pregunta", expects: "texto", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Correo electrónico", descripcion: "Valida el formato del correo.",
    grupo: "texto", icono: "Mail",
  },
  telefono: {
    kind: "pregunta", expects: "texto", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Teléfono", descripcion: "Número de contacto.",
    grupo: "texto", icono: "Phone",
  },
  enlace: {
    kind: "pregunta", expects: "texto", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Enlace", descripcion: "URL que el candidato aporta.",
    grupo: "texto", icono: "Globe",
  },
  codigo: {
    kind: "pregunta", expects: "texto", options: "ninguna", auto: false, scoring: "manual",
    etiqueta: "Código o consulta", descripcion: "Editor monoespaciado. Lo califica una persona.",
    grupo: "texto", icono: "Code", configuracion: { lenguaje: "sql", lineasCodigo: 10 },
  },

  /* -------------------------------- Números ------------------------------ */

  numero: {
    kind: "pregunta", expects: "numero", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Número entero", descripcion: "Valor entero con clave y tolerancia.",
    grupo: "numeros", icono: "Hash", configuracion: { paso: 1 },
  },
  decimal: {
    kind: "pregunta", expects: "numero", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Número decimal", descripcion: "Valor con decimales y tolerancia.",
    grupo: "numeros", icono: "Sigma", configuracion: { decimales: 2, paso: 0.01 },
  },
  porcentaje: {
    kind: "pregunta", expects: "numero", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Porcentaje", descripcion: "Valor de 0 a 100 con sufijo %.",
    grupo: "numeros", icono: "Percent", configuracion: { minimo: 0, maximo: 100, sufijo: "%" },
  },
  moneda: {
    kind: "pregunta", expects: "numero", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Importe", descripcion: "Cantidad monetaria con su divisa.",
    grupo: "numeros", icono: "Banknote", configuracion: { moneda: "BOB", decimales: 2 },
  },

  /* ------------------------------ Fecha y hora --------------------------- */

  fecha: {
    kind: "pregunta", expects: "fecha", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Fecha", descripcion: "Selector de fecha.",
    grupo: "fechas", icono: "Calendar", googleForms: "Fecha",
  },
  hora: {
    kind: "pregunta", expects: "hora", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Hora", descripcion: "Selector de hora.",
    grupo: "fechas", icono: "Clock", googleForms: "Hora",
  },
  fecha_hora: {
    kind: "pregunta", expects: "fecha", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Fecha y hora", descripcion: "Momento exacto.",
    grupo: "fechas", icono: "CalendarClock",
  },
  duracion: {
    kind: "pregunta", expects: "numero", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Duración", descripcion: "Cantidad de minutos.",
    grupo: "fechas", icono: "Timer", googleForms: "Duración", configuracion: { sufijo: "min" },
  },

  /* -------------------------------- Opciones ----------------------------- */

  opcion_unica: {
    kind: "pregunta", expects: "opcion", options: "requeridas", auto: true, scoring: "exacto", multiple: false,
    etiqueta: "Opción única", descripcion: "Una sola respuesta correcta.",
    grupo: "opciones", icono: "CircleDot", googleForms: "Varias opciones", opcionesIniciales: 3,
  },
  opcion_multiple: {
    kind: "pregunta", expects: "opciones", options: "requeridas", auto: true, scoring: "parcial", multiple: true,
    etiqueta: "Opción múltiple", descripcion: "Varias correctas, con crédito parcial.",
    grupo: "opciones", icono: "CheckSquare", googleForms: "Casillas", opcionesIniciales: 4,
  },
  desplegable: {
    kind: "pregunta", expects: "opcion", options: "requeridas", auto: true, scoring: "exacto", multiple: false,
    etiqueta: "Lista desplegable", descripcion: "Una respuesta, en un desplegable.",
    grupo: "opciones", icono: "ChevronDown", googleForms: "Desplegable", opcionesIniciales: 3,
  },
  verdadero_falso: {
    kind: "pregunta", expects: "opcion", options: "requeridas", auto: true, scoring: "exacto", multiple: false,
    etiqueta: "Verdadero o falso", descripcion: "Dos opciones, ya creadas.",
    grupo: "opciones", icono: "ToggleLeft", opcionesIniciales: 2,
  },
  si_no_na: {
    kind: "pregunta", expects: "opcion", options: "requeridas", auto: true, scoring: "exacto", multiple: false,
    etiqueta: "Sí / No / N/A", descripcion: "Terna típica de una lista de verificación.",
    grupo: "opciones", icono: "ListChecks", opcionesIniciales: 3,
  },
  casilla_aceptacion: {
    kind: "pregunta", expects: "opcion", options: "requeridas", auto: true, scoring: "exacto", multiple: false,
    etiqueta: "Casilla de aceptación", descripcion: "Una sola casilla que hay que marcar.",
    grupo: "opciones", icono: "Check", opcionesIniciales: 1,
  },
  opcion_imagen: {
    kind: "pregunta", expects: "opcion", options: "requeridas", auto: true, scoring: "exacto", multiple: false,
    etiqueta: "Opciones con imagen", descripcion: "Cada opción muestra una imagen.",
    grupo: "opciones", icono: "Images", opcionesIniciales: 3, configuracion: { columnas: 3 },
  },

  /* --------------------------------- Escalas ----------------------------- */

  escala_lineal: {
    kind: "pregunta", expects: "escala", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Escala lineal", descripcion: "Del mínimo al máximo, con etiquetas.",
    grupo: "escalas", icono: "SlidersHorizontal", googleForms: "Escala lineal",
    configuracion: { minimo: 1, maximo: 5, etiquetaMinimo: "Muy bajo", etiquetaMaximo: "Muy alto" },
  },
  estrellas: {
    kind: "pregunta", expects: "escala", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Estrellas", descripcion: "Valoración con estrellas.",
    grupo: "escalas", icono: "Star", googleForms: "Clasificación", configuracion: { estrellas: 5 },
  },
  deslizador: {
    kind: "pregunta", expects: "escala", options: "ninguna", auto: true, scoring: "exacto",
    etiqueta: "Deslizador", descripcion: "Rango continuo con paso configurable.",
    grupo: "escalas", icono: "Move", configuracion: { minimo: 0, maximo: 100, paso: 5 },
  },

  /* ------------------------------ Cuadrículas ---------------------------- */

  cuadricula_opcion: {
    kind: "pregunta", expects: "matriz", options: "requeridas", auto: true, scoring: "parcial", multiple: false,
    etiqueta: "Cuadrícula de opción", descripcion: "Una columna por fila.",
    grupo: "cuadriculas", icono: "Grid3x3", googleForms: "Cuadrícula de varias opciones",
    opcionesIniciales: 3, configuracion: { columnasMatriz: ["Bajo", "Medio", "Alto"] },
  },
  cuadricula_casillas: {
    kind: "pregunta", expects: "matriz", options: "requeridas", auto: true, scoring: "parcial", multiple: true,
    etiqueta: "Cuadrícula de casillas", descripcion: "Varias columnas por fila.",
    grupo: "cuadriculas", icono: "LayoutGrid", googleForms: "Cuadrícula de casillas",
    opcionesIniciales: 3, configuracion: { columnasMatriz: ["Sí", "No", "N/A"] },
  },
  likert: {
    kind: "pregunta", expects: "matriz", options: "requeridas", auto: false, scoring: "ninguno", multiple: false,
    etiqueta: "Matriz Likert", descripcion: "Escala de acuerdo, sin respuesta correcta.",
    grupo: "cuadriculas", icono: "BarChart3", opcionesIniciales: 4,
    configuracion: {
      columnasMatriz: ["Muy en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Muy de acuerdo"],
    },
  },

  /* --------------------------- Estructuras ricas ------------------------- */

  ordenar: {
    kind: "pregunta", expects: "orden", options: "requeridas", auto: true, scoring: "parcial",
    etiqueta: "Ordenar", descripcion: "El candidato coloca los elementos en secuencia.",
    grupo: "avanzadas", icono: "ArrowUpDown", opcionesIniciales: 4,
  },
  emparejar: {
    kind: "pregunta", expects: "emparejamiento", options: "requeridas", auto: true, scoring: "parcial",
    etiqueta: "Emparejar", descripcion: "Cada elemento se asocia con su pareja.",
    grupo: "avanzadas", icono: "GitCompareArrows", opcionesIniciales: 3,
  },
  clasificar: {
    kind: "pregunta", expects: "clasificacion", options: "requeridas", auto: true, scoring: "parcial",
    etiqueta: "Clasificar en grupos", descripcion: "Cada elemento va a un grupo.",
    grupo: "avanzadas", icono: "FolderTree", opcionesIniciales: 4,
    configuracion: { grupos: ["Grupo A", "Grupo B"] },
  },
  rellenar_huecos: {
    kind: "pregunta", expects: "huecos", options: "ninguna", auto: true, scoring: "parcial",
    etiqueta: "Rellenar huecos", descripcion: "Texto con espacios que hay que completar.",
    grupo: "avanzadas", icono: "TextCursorInput",
  },

  /* -------------------------------- Archivos ----------------------------- */

  archivo_enlace: {
    kind: "pregunta", expects: "archivo", options: "ninguna", auto: false, scoring: "manual",
    etiqueta: "Archivo por enlace", descripcion: "El candidato comparte un enlace a su archivo.",
    grupo: "archivos", icono: "Paperclip", googleForms: "Subida de archivos",
    configuracion: { ayudaArchivo: "Comparte el enlace con permiso de lectura." },
  },
};

export type TipoId = keyof typeof TIPOS;

export const TIPO_IDS: string[] = Object.keys(TIPOS).sort();

export function tipoSpec(tipo: string): TipoSpec | null {
  return TIPOS[tipo] ?? null;
}

export function esPregunta(tipo: string): boolean {
  return tipoSpec(tipo)?.kind === "pregunta";
}

export function esContenido(tipo: string): boolean {
  return tipoSpec(tipo)?.kind === "contenido";
}

/** Tipos agrupados para el panel de inserción. */
export function tiposPorGrupo(): { grupo: GrupoTipo; etiqueta: string; tipos: { id: string; spec: TipoSpec }[] }[] {
  return GRUPOS_TIPO.map((grupo) => ({
    grupo,
    etiqueta: GRUPO_LABEL[grupo],
    tipos: Object.entries(TIPOS)
      .filter(([, spec]) => spec.grupo === grupo)
      .map(([id, spec]) => ({ id, spec })),
  })).filter((entry) => entry.tipos.length > 0);
}

/** Modos de puntaje admitidos por un tipo, para el inspector. */
export function modosPuntajeDe(tipo: string): ModoPuntaje[] {
  const spec = tipoSpec(tipo);
  if (!spec || spec.kind !== "pregunta") return ["ninguno"];
  const modos: ModoPuntaje[] = ["ninguno", "manual"];
  if (spec.auto) {
    modos.push("exacto");
    if (
      spec.expects === "opciones" ||
      spec.expects === "matriz" ||
      spec.expects === "orden" ||
      spec.expects === "emparejamiento" ||
      spec.expects === "clasificacion" ||
      spec.expects === "huecos"
    ) {
      modos.push("parcial");
    }
    if (spec.expects === "opciones") modos.push("por_opcion");
  }
  return modos;
}

export const MODO_PUNTAJE_LABEL: Record<ModoPuntaje, string> = {
  ninguno: "Sin puntaje",
  exacto: "Exacto (todo o nada)",
  parcial: "Parcial (proporcional)",
  por_opcion: "Puntaje por opción",
  manual: "Revisión manual",
};

/**
 * ¿Puede el servidor calificar esta pregunta sin intervención humana?
 *
 * Réplica exacta de `evIsAutoGradable_`. Se usa para estimar en el editor y para
 * el panel de revisión previa; la autoridad sigue siendo el servidor.
 */
export function esAutoCalificable(
  tipo: string,
  modoPuntaje: ModoPuntaje,
  respuestaEsperada: unknown,
  opciones: { correcta?: boolean; claveEmparejamiento?: string }[],
): boolean {
  const spec = tipoSpec(tipo);
  if (!spec || spec.kind !== "pregunta") return false;
  if (modoPuntaje === "ninguno" || modoPuntaje === "manual") return false;
  if (!spec.auto) return false;

  if (spec.options === "requeridas") {
    if (opciones.length === 0) return false;
    if (spec.expects === "emparejamiento" || spec.expects === "clasificacion" || spec.expects === "matriz") {
      return opciones.some((o) => !!(o.claveEmparejamiento ?? "").trim());
    }
    if (spec.expects === "orden") return opciones.length >= 2;
    return opciones.some((o) => o.correcta === true);
  }

  if (spec.expects === "huecos") {
    const huecos = (respuestaEsperada as { huecos?: unknown[] } | null)?.huecos;
    return Array.isArray(huecos) && huecos.length > 0;
  }

  if (respuestaEsperada === null || respuestaEsperada === undefined) return false;
  if (typeof respuestaEsperada === "object") {
    const esperado = respuestaEsperada as { valor?: unknown; valores?: unknown[] };
    if (Array.isArray(esperado.valores)) return esperado.valores.length > 0;
    return esperado.valor !== undefined && esperado.valor !== null && esperado.valor !== "";
  }
  return String(respuestaEsperada) !== "";
}

/** Réplica de `evRequiresManualReview_`. */
export function requiereRevisionManual(
  tipo: string,
  modoPuntaje: ModoPuntaje,
  puntos: number,
  respuestaEsperada: unknown,
  opciones: { correcta?: boolean; claveEmparejamiento?: string }[],
): boolean {
  const spec = tipoSpec(tipo);
  if (!spec || spec.kind !== "pregunta") return false;
  if (modoPuntaje === "ninguno") return false;
  if (modoPuntaje === "manual") return true;
  if (!spec.auto) return puntos > 0;
  return !esAutoCalificable(tipo, modoPuntaje, respuestaEsperada, opciones) && puntos > 0;
}
