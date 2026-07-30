/**
 * Modelo de dominio del módulo de Evaluaciones.
 *
 * Es el mismo documento que viaja por la API, en camelCase y anidado: la
 * evaluación contiene secciones, la sección contiene preguntas y la pregunta
 * contiene sus opciones. Que la forma de la API y la del editor coincidan
 * elimina toda una capa de mapeadores y la clase de fallos que traen (campos que
 * se pierden al guardar, órdenes que discrepan).
 *
 * Se declara con tipos de TypeScript y no con esquemas de validación en
 * ejecución. La razón es concreta: el SERVIDOR ya valida, sanea y acota todo lo
 * que recibe, y es la única autoridad. Repetir la validación aquí duplicaría las
 * reglas en dos lugares que acabarían discrepando —exactamente lo que pasó con
 * los tipos de pregunta en la versión anterior—. Lo que sí vive en el cliente es
 * la REVISIÓN PREVIA (`validation.ts`), que ayuda al autor a corregir antes de
 * publicar y que reconoce que el veredicto final lo da el backend.
 */

import type { RichDoc } from "./richText";
import type { ModoPuntaje } from "./questionTypes";

/* ------------------------------- Enumeraciones --------------------------- */

export const ESTADOS = ["borrador", "publicada", "pausada", "cerrada", "archivada", "papelera"] as const;
export type EstadoEvaluacion = (typeof ESTADOS)[number];

export const ESTADO_LABEL: Record<EstadoEvaluacion, string> = {
  borrador: "Borrador",
  publicada: "Publicada",
  pausada: "Pausada",
  cerrada: "Cerrada",
  archivada: "Archivada",
  papelera: "En la papelera",
};

export const CATEGORIAS = [
  "preseleccion", "conocimientos", "tecnica", "numerica", "situacional",
  "competencias", "entrevista", "caso", "simulacion", "desempeno", "otra",
] as const;
export type CategoriaEvaluacion = (typeof CATEGORIAS)[number];

export const CATEGORIA_LABEL: Record<CategoriaEvaluacion, string> = {
  preseleccion: "Preselección",
  conocimientos: "Conocimientos",
  tecnica: "Prueba técnica",
  numerica: "Prueba numérica",
  situacional: "Juicio situacional",
  competencias: "Competencias",
  entrevista: "Guía de entrevista",
  caso: "Caso práctico",
  simulacion: "Simulación",
  desempeno: "Desempeño",
  otra: "Otra",
};

export const NAVEGACIONES = ["libre", "secuencial", "una_por_pagina"] as const;
export type Navegacion = (typeof NAVEGACIONES)[number];

export const NAVEGACION_LABEL: Record<Navegacion, string> = {
  libre: "Libre (todo en una página)",
  secuencial: "Por secciones, en orden",
  una_por_pagina: "Una pregunta por página",
};

export const VISIBILIDADES = ["nada", "solo_envio", "nota", "nota_y_detalle"] as const;
export type VisibilidadResultado = (typeof VISIBILIDADES)[number];

export const VISIBILIDAD_LABEL: Record<VisibilidadResultado, string> = {
  nada: "No mostrar nada",
  solo_envio: "Solo confirmar el envío",
  nota: "Mostrar la nota",
  nota_y_detalle: "Nota y desglose de aciertos",
};

export type CriterioAprobacion = "porcentaje" | "puntos";

export const CRITERIO_LABEL: Record<CriterioAprobacion, string> = {
  porcentaje: "Porcentaje de la nota",
  puntos: "Puntos obtenidos",
};

export const ESTADOS_INTENTO = ["en_curso", "enviado", "expirado", "abandonado", "anulado"] as const;
export type EstadoIntento = (typeof ESTADOS_INTENTO)[number];

export const ESTADO_INTENTO_LABEL: Record<EstadoIntento, string> = {
  en_curso: "En curso",
  enviado: "Enviado",
  expirado: "Expirado",
  abandonado: "Abandonado",
  anulado: "Anulado",
};

export type EstadoCalificacion = "automatica" | "pendiente_revision" | "revisada";

export const CALIFICACION_LABEL: Record<EstadoCalificacion, string> = {
  automatica: "Calificación automática",
  pendiente_revision: "Pendiente de revisión",
  revisada: "Revisada",
};

export type SeveridadEvento = "info" | "aviso" | "alerta";

/* --------------------------------- Contenido ----------------------------- */

export interface Opcion {
  id: string;
  texto: RichDoc;
  valor: string;
  orden: number;
  correcta: boolean;
  puntos: number;
  /** Para emparejar, clasificar y cuadrículas: la respuesta correcta de la fila. */
  claveEmparejamiento: string;
  grupo: string;
  imagenUrl: string;
  retroalimentacion: string;
}

export interface HuecoEsperado {
  clave: string;
  respuestas: string[];
  ignorarMayusculas: boolean;
  ignorarAcentos: boolean;
}

export interface RespuestaEsperada {
  valor?: string | number;
  valores?: string[];
  alternativas?: string[];
  tolerancia?: number;
  ignorarMayusculas?: boolean;
  ignorarAcentos?: boolean;
  huecos?: HuecoEsperado[];
}

export interface Medios {
  tipo: "imagen" | "video" | "audio" | "enlace";
  url: string;
  alt: string;
  pie: string;
}

export interface Pregunta {
  id: string;
  seccionId: string;
  tipo: string;
  orden: number;
  enunciado: RichDoc;
  ayuda: RichDoc;
  obligatoria: boolean;
  modoPuntaje: ModoPuntaje;
  puntos: number;
  penalizacion: number;
  competencia: string;
  codigo: string;
  respuestaEsperada: RespuestaEsperada | null;
  configuracion: Record<string, unknown>;
  validacion: Record<string, unknown>;
  retroalimentacion: { correcta?: string; incorrecta?: string; general?: string };
  medios: Medios | null;
  accesibilidad: { etiquetaAria?: string; descripcionLarga?: string };
  etiquetas: string[];
  opciones: Opcion[];
}

export interface Seccion {
  id: string;
  titulo: string;
  descripcion: RichDoc;
  orden: number;
  limiteSegundos: number | null;
  mezclar: boolean;
  /** Banco de preguntas: sirve solo N de las declaradas. */
  tomarN: number | null;
  peso: number;
  preguntas: Pregunta[];
}

/* -------------------------------- Evaluación ----------------------------- */

export interface CampoParticipante {
  clave: string;
  etiqueta: string;
  obligatorio: boolean;
  activo: boolean;
}

export interface Aplicacion {
  duracionMinutos: number | null;
  segundosExtra: number;
  puntajeAprobacion: number | null;
  criterioAprobacion: CriterioAprobacion;
  intentosMaximos: number;
  ventanaInicio: string;
  ventanaFin: string;
  navegacion: Navegacion;
  permitirRetroceso: boolean;
  mostrarProgreso: boolean;
  mezclarPreguntas: boolean;
  mezclarOpciones: boolean;
  autoenviarAlExpirar: boolean;
  guardadoAutomaticoSegundos: number;
}

export interface ParticipanteConfig {
  campos: CampoParticipante[];
  requiereConsentimiento: boolean;
  textoConsentimiento: string;
  visibilidadResultado: VisibilidadResultado;
}

export interface PoliticaIntegridad {
  registrarCambioPestana: boolean;
  registrarCopiaPegado: boolean;
  registrarTiempos: boolean;
  registrarNavegacion: boolean;
  bloquearPegado: boolean;
  bloquearMenuContextual: boolean;
  avisarAlSalir: boolean;
  pantallaCompletaSugerida: boolean;
  umbralRiesgo: number;
}

export type AcentoTema = "cian" | "azul" | "indigo" | "esmeralda" | "violeta" | "ambar";

export interface TemaEvaluacion {
  acento: AcentoTema;
  densidad: "comoda" | "compacta";
  portadaUrl: string;
  logoUrl: string;
  mostrarNumeracion: boolean;
  animaciones: boolean;
}

export interface ReglaLogica {
  id: string;
  preguntaId: string;
  operador: "igual" | "distinto" | "contiene" | "mayor" | "menor" | "vacio" | "no_vacio";
  valor: string;
  accion: "saltar" | "mostrar" | "terminar";
  destinoSeccionId: string;
  destinoPreguntaId: string;
}

export interface Evaluacion {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaEvaluacion;
  estado: EstadoEvaluacion;
  revision: number;
  ultimoCliente: string;
  creadoEn: string;
  creadoPor: string;
  actualizadoEn: string;
  actualizadoPor: string;
  publicadoEn: string;
  publicadoPor: string;
  archivadoEn: string;
  eliminadoEn: string;
  versionMayor: number;
  versionMenor: number;
  versionEtiqueta: string;
  versionVigenteId: string;
  preguntas: number;
  preguntasCalificables: number;
  puntosTotales: number;
  instrucciones: RichDoc;
  notasInternas: string;
  aplicacion: Aplicacion;
  participante: ParticipanteConfig;
  integridad: PoliticaIntegridad;
  tema: TemaEvaluacion;
  etiquetas: string[];
  procesos: string[];
  reglas: ReglaLogica[];
  extras: Record<string, unknown>;
  esquemaVersion: number;
}

export interface VersionPublicada {
  id: string;
  etiqueta: string;
  mayor: number;
  menor: number;
  estado: "vigente" | "reemplazada";
  notas: string;
  preguntas: number;
  preguntasCalificables: number;
  puntosTotales: number;
  huella: string;
  caracteres: number;
  publicadoEn: string;
  publicadoPor: string;
}

/** El documento completo: lo que devuelve `getEvaluation` y espera `saveEvaluation`. */
export interface DocumentoEvaluacion {
  evaluacion: Evaluacion;
  secciones: Seccion[];
  versiones: VersionPublicada[];
}

/** Fila del listado. Deliberadamente ligera: sin secciones ni preguntas. */
export interface ResumenEvaluacion {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaEvaluacion;
  estado: EstadoEvaluacion;
  revision: number;
  versionEtiqueta: string;
  versiones: number;
  preguntas: number;
  preguntasCalificables: number;
  puntosTotales: number;
  duracionMinutos: number | null;
  puntajeAprobacion: number | null;
  criterioAprobacion: CriterioAprobacion;
  intentos: number;
  intentosEnviados: number;
  etiquetas: string[];
  procesos: string[];
  creadoEn: string;
  creadoPor: string;
  actualizadoEn: string;
  actualizadoPor: string;
  publicadoEn: string;
  archivadoEn: string;
}

/* --------------------------------- Intentos ------------------------------ */

export interface ResumenIntegridad {
  riesgo: number;
  nivel: "bajo" | "medio" | "alto";
  total: number;
  porSeveridad: Record<SeveridadEvento, number>;
  porTipo: Record<string, number>;
  caracteresPegados: number;
  segundosFueraDeFoco: number;
  vecesFueraDeFoco: number;
}

export interface Intento {
  id: string;
  evaluacionId: string;
  versionId: string;
  versionEtiqueta: string;
  participante: {
    nombre: string;
    documento: string;
    correo: string;
    extra: Record<string, string>;
  };
  estado: EstadoIntento;
  iniciadoEn: string;
  limiteEn: string;
  ultimoGuardadoEn: string;
  enviadoEn: string;
  envioAutomatico: boolean;
  segundosUsados: number;
  segundosRestantes?: number | null;
  puntosObtenidos: number | null;
  puntosPosibles: number | null;
  nota: number | null;
  notaAutomatica: number | null;
  correctas: number;
  incorrectas: number;
  sinResponder: number;
  calificables: number;
  pendientesRevision: number;
  estadoCalificacion: EstadoCalificacion;
  aprobado: boolean | null;
  calificadoEn: string;
  calificadoPor: string;
  riesgoIntegridad: number;
  eventosIntegridad: number;
  resumenIntegridad: ResumenIntegridad | Record<string, never>;
  agenteUsuario: string;
  zonaHoraria: string;
  procesoId: string;
  notasRevision: string;
}

export interface OpcionDetalle {
  id: string;
  texto: string;
  valor: string;
  elegida: boolean;
  correcta: boolean;
  puntos: number;
  claveEmparejamiento: string;
  grupo: string;
}

export interface RespuestaDetalle {
  preguntaId: string;
  tipo: string;
  orden: number;
  respondida: boolean;
  respondidaEn: string;
  opcionesElegidas: string[];
  valor: unknown;
  valorTexto: string;
  correcta: boolean | null;
  puntosObtenidos: number | null;
  puntosPosibles: number;
  requiereRevision: boolean;
  comentarioRevisor: string;
  segundosEnPregunta: number;
  visitas: number;
  cambios: number;
  enunciado: RichDoc;
  enunciadoTexto: string;
  ayudaTexto: string;
  obligatoria: boolean;
  modoPuntaje: ModoPuntaje;
  competencia: string;
  opciones: OpcionDetalle[];
  claveTexto: string;
}

export interface EventoIntegridad {
  id: string;
  intentoId: string;
  secuencia: number;
  tipo: string;
  severidad: SeveridadEvento;
  preguntaId: string;
  ocurridoEn: string;
  segundosDesdeInicio: number;
  duracionMs: number;
  detalle: Record<string, unknown>;
}

export interface HitoCronologia {
  segundos: number;
  tipo: string;
  severidad: SeveridadEvento;
  preguntaId?: string;
  duracionMs?: number;
  detalle?: Record<string, unknown>;
  texto: string;
  ocurridoEn: string;
}

export interface ResumenCola {
  total: number;
  enCurso: number;
  enviados: number;
  expirados: number;
  anulados: number;
  pendientesRevision: number;
  conNota: number;
  notaPromedio: number | null;
  notaMediana: number | null;
  notaMinima: number | null;
  notaMaxima: number | null;
  tasaAprobacion: number | null;
  aprobados: number;
  conVeredicto: number;
  riesgoAlto: number;
  duracionPromedioSegundos: number | null;
}

export interface ContextoEvaluacionCola {
  id: string;
  codigo: string;
  titulo: string;
  estado: EstadoEvaluacion;
  versionEtiqueta: string;
  puntosTotales: number;
  puntajeAprobacion: number | null;
  criterioAprobacion: CriterioAprobacion;
  duracionMinutos: number | null;
}

export interface ColaIntentos {
  evaluacion: ContextoEvaluacionCola;
  intentos: Intento[];
  resumen: ResumenCola;
  sincronizadoEn: string;
}

export interface DetalleIntento {
  intento: Intento;
  evaluacion: (ContextoEvaluacionCola & { integridad: PoliticaIntegridad }) | null;
  respuestas: RespuestaDetalle[];
  eventos: EventoIntegridad[];
  cronologia: HitoCronologia[];
  advertencias: string[];
}

export interface PaqueteExportacion {
  generadoEn: string;
  backend: string;
  evaluacion: DetalleIntento["evaluacion"];
  intento: Intento;
  identidad: {
    nombre: string;
    documento: string;
    correo: string;
    identificador: string;
    extra: Record<string, string>;
  };
  resultado: {
    nota: number | null;
    notaAutomatica: number | null;
    puntosObtenidos: number | null;
    puntosPosibles: number | null;
    correctas: number;
    incorrectas: number;
    sinResponder: number;
    aprobado: boolean | null;
    estadoCalificacion: EstadoCalificacion;
    pendientesRevision: number;
  };
  integridad: { riesgo: number; resumen: ResumenIntegridad | Record<string, never>; eventos: number };
  respuestas: RespuestaDetalle[];
  cronologia: HitoCronologia[];
  advertencias: string[];
}

/* ------------------------- Superficie del candidato ---------------------- */

export interface PreguntaPublica {
  id: string;
  tipo: string;
  enunciado: RichDoc;
  ayuda: RichDoc;
  obligatoria: boolean;
  configuracion: Record<string, unknown>;
  opciones: { id: string; valor: string; texto: RichDoc; imagenUrl?: string; grupo?: string }[];
  medios?: Medios | null;
  accesibilidad?: { etiquetaAria?: string; descripcionLarga?: string };
  puntos?: number;
}

export interface SeccionPublica {
  id: string;
  titulo: string;
  descripcion: RichDoc;
  limiteSegundos: number | null;
  preguntas: PreguntaPublica[];
}

export interface PruebaPublica {
  codigo: string;
  titulo: string;
  descripcion: string;
  instrucciones: RichDoc;
  versionEtiqueta: string;
  totalPreguntas: number;
  aplicacion: {
    duracionMinutos: number | null;
    navegacion: Navegacion;
    permitirRetroceso: boolean;
    mostrarProgreso: boolean;
    autoenviarAlExpirar: boolean;
    guardadoAutomaticoSegundos: number;
  };
  participante: {
    campos: CampoParticipante[];
    requiereConsentimiento: boolean;
    textoConsentimiento: string;
    visibilidadResultado: VisibilidadResultado;
  };
  integridad: PoliticaIntegridad;
  tema: TemaEvaluacion;
  secciones: SeccionPublica[];
}

export interface PortadaPublica {
  codigo: string;
  disponible: boolean;
  motivo: string;
  mensaje: string;
  titulo: string;
  horaServidor: string;
  descripcion?: string;
  instrucciones?: RichDoc;
  versionEtiqueta?: string;
  totalPreguntas?: number;
  duracionMinutos?: number | null;
  intentosMaximos?: number;
  participante?: {
    campos: CampoParticipante[];
    requiereConsentimiento: boolean;
    textoConsentimiento: string;
  };
  integridad?: PoliticaIntegridad;
  tema?: TemaEvaluacion;
  ventanaFin?: string;
}

/** Respuesta que el runner envía por pregunta. */
export interface RespuestaEnviada {
  preguntaId: string;
  opciones?: string[];
  valor?: unknown;
  segundos?: number;
  visitas?: number;
  cambios?: number;
}

export interface EventoEnviado {
  tipo: string;
  secuencia: number;
  ocurridoEn?: string;
  preguntaId?: string;
  segundosDesdeInicio?: number;
  duracionMs?: number;
  detalle?: Record<string, number | string>;
}

export interface InicioIntento {
  intentoId: string;
  token: string;
  retomado: boolean;
  horaServidor: string;
  iniciadoEn: string;
  limiteEn: string;
  segundosRestantes: number | null;
  respuestasPrevias: { preguntaId: string; opciones: string[]; valor: unknown }[];
  prueba: PruebaPublica;
}

export interface ResultadoCandidato {
  intentoId: string;
  evaluacion: string;
  estado: EstadoIntento;
  enviadoEn: string;
  envioAutomatico: boolean;
  repetido: boolean;
  respuestasRegistradas: number;
  calificacionPendiente: boolean;
  segundosUsados: number;
  nota?: number | null;
  aprobado?: boolean | null;
  puntosObtenidos?: number | null;
  puntosPosibles?: number | null;
  correctas?: number;
  incorrectas?: number;
  sinResponder?: number;
}

export interface LatidoIntento {
  intentoId: string;
  estado: EstadoIntento;
  horaServidor: string;
  limiteEn: string;
  segundosRestantes: number | null;
  expirado: boolean;
  ultimoGuardadoEn: string;
}

/* ------------------------------ Diagnóstico ------------------------------ */

export interface Hallazgo {
  severidad: "critico" | "alto" | "medio" | "info";
  codigo: string;
  titulo: string;
  detalle: string;
  remedio: string;
  datos: Record<string, unknown>;
}

export interface InformeHoja {
  sheet: string;
  exists: boolean;
  dataRows: number;
  missingColumns: string[];
  extraColumns: string[];
  describe: string;
}

export interface Diagnostico {
  estado: "ok" | "aceptable" | "atencion" | "critico";
  generadoEn: string;
  backend: {
    version: string;
    esquema: number;
    snapshot: number;
    textoEnriquecido: number;
    tiposSoportados: string[];
  };
  libro: { nombre: string; id: string; zonaHoraria: string; hojas: number } | null;
  esquema: {
    ok: boolean;
    installed: boolean;
    schemaVersion: number;
    spreadsheetId: string;
    spreadsheetName: string;
    sheets: InformeHoja[];
    missingSheets: string[];
    sheetsNeedingRepair: string[];
  } | null;
  autorizacion: {
    modo: "llave" | "abierto";
    llaveConfigurada: boolean;
    llaveLongitud: number;
    llaveSuficiente: boolean;
    llaveRotacionPreparada: boolean;
    secretoIntentos: boolean;
  };
  conteos: Record<string, number> | null;
  rendimiento: { lecturaMs: number; filasLeidas: number; cacheDisponible: boolean; cacheMs: number } | null;
  profundo: boolean;
  profundas: {
    snapshotsRevisados: number;
    snapshotsIlegibles: { versionId: string; etiqueta: string; motivo: string }[];
    respuestasHuerfanas: number;
    eventosHuerfanos: number;
    preguntasHuerfanas: number;
    opcionesHuerfanas: number;
    bloquesHuerfanos: number;
  } | null;
  resumen: Record<string, number>;
  hallazgos: Hallazgo[];
}

export interface EstadoBackend {
  servicio: string;
  version: string;
  esquema: number;
  snapshot: number;
  textoEnriquecido: number;
  instalado: boolean;
  horaServidor: string;
  autorizacion: Diagnostico["autorizacion"];
  tiposSoportados: number;
  libro: { nombre: string; id: string } | null;
  problemaLibro?: string;
  conteos?: { evaluaciones: number; intentos: number; versiones: number };
}
