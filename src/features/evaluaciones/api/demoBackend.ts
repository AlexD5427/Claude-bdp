/**
 * Backend de demostración — el módulo funciona sin desplegar nada.
 *
 * ── Para qué sirve y para qué NO ──────────────────────────────────────────────
 * Sirve para abrir el módulo, construir una evaluación, previsualizarla, hacerla
 * como candidato y ver los resultados sin tener todavía un libro de cálculo ni un
 * despliegue de Apps Script. Los datos viven en `localStorage` de este navegador.
 *
 * NO sirve para operar de verdad: no hay concurrencia, ni auditoría, ni un libro
 * que el equipo pueda revisar. La interfaz lo anuncia de forma permanente mientras
 * este modo está activo, para que nunca haya duda sobre qué se está mirando. Esa
 * confusión —datos de demostración presentados como reales— es de los errores más
 * caros que puede cometer un módulo de este tipo.
 *
 * ── Sobre la duplicación de la calificación ──────────────────────────────────
 * Este archivo tiene su propio calificador porque no puede ejecutar el de Apps
 * Script. La duplicación es real y está reconocida: `__tests__/demoParity.test.ts`
 * pasa la MISMA matriz de casos por los dos calificadores y compara los puntos,
 * de modo que si uno cambia y el otro no, la suite lo detecta.
 *
 * Habla exactamente el mismo contrato que el backend real (mismas acciones, mismo
 * envoltorio, mismos códigos de error), así que el resto de la aplicación no sabe
 * cuál de los dos está detrás.
 */

import { newId } from "../../../shared/ids";
import { errorEnvelope, type Envelope } from "./envelope";
import {
  emptyRichDoc,
  isRichEmpty,
  richToPlain,
  sanitizeRichDoc,
  type RichDoc,
} from "../domain/richText";
import { esAutoCalificable, requiereRevisionManual, tipoSpec, TIPO_IDS } from "../domain/questionTypes";
import { contarContenido } from "../domain/factory";
import { revisarDocumento, soloErrores } from "../domain/validation";
import type {
  DocumentoEvaluacion,
  Evaluacion,
  EventoIntegridad,
  Intento,
  Pregunta,
  RespuestaDetalle,
  Seccion,
  VersionPublicada,
} from "../domain/model";

/* ------------------------------- Almacenamiento --------------------------- */

interface RespuestaGuardada {
  intentoId: string;
  preguntaId: string;
  tipo: string;
  orden: number;
  opciones: string[];
  valor: unknown;
  valorTexto: string;
  correcta: boolean | null;
  puntosObtenidos: number | null;
  puntosPosibles: number;
  requiereRevision: boolean;
  comentarioRevisor: string;
  segundos: number;
  visitas: number;
  cambios: number;
  respondidaEn: string;
}

interface VersionGuardada extends VersionPublicada {
  evaluacionId: string;
  /** Copia inmutable del documento en el momento de publicar. */
  snapshot: { evaluacion: Evaluacion; secciones: Seccion[] };
}

interface Base {
  documentos: Record<string, { evaluacion: Evaluacion; secciones: Seccion[] }>;
  versiones: VersionGuardada[];
  intentos: Intento[];
  respuestas: RespuestaGuardada[];
  eventos: EventoIntegridad[];
  solicitudes: Record<string, { referencia: string; procesadoEn: string; resumen: Record<string, unknown> }>;
  tokens: Record<string, string>;
}

const CLAVE = "bdp-evaluaciones-demo";

function baseVacia(): Base {
  return {
    documentos: {},
    versiones: [],
    intentos: [],
    respuestas: [],
    eventos: [],
    solicitudes: {},
    tokens: {},
  };
}

function leerBase(): Base {
  if (typeof window === "undefined") return memoria;
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (!raw) return baseVacia();
    return { ...baseVacia(), ...(JSON.parse(raw) as Base) };
  } catch {
    return baseVacia();
  }
}

let memoria: Base = baseVacia();

function guardarBase(base: Base): void {
  memoria = base;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(base));
  } catch {
    /* modo privado o cuota agotada: se conserva en memoria */
  }
}

/** Utilidad de pruebas: vacía la base de demostración. */
export function reiniciarDemostracion(): void {
  guardarBase(baseVacia());
}

/* --------------------------------- Envoltorio ----------------------------- */

const VERSION_DEMO = "2.0.0-demostracion";

function meta(): Envelope<never>["meta"] {
  return {
    traza: newId("tz"),
    horaServidor: new Date().toISOString(),
    milisegundos: 1,
    backend: VERSION_DEMO,
    esquema: 2,
    textoEnriquecido: 1,
    modoAuth: "demostracion",
    instalado: true,
  };
}

function correcto<T>(accion: string, solicitudId: string, datos: T, avisos: string[] = []): Envelope<T> {
  return { ok: true, accion, solicitudId, datos, error: null, avisos: ["MODO_DEMOSTRACION", ...avisos], meta: meta() };
}

function fallo(
  accion: string,
  solicitudId: string,
  codigo: string,
  mensaje: string,
  extra: { pista?: string; detalle?: Record<string, unknown> } = {},
): Envelope<never> {
  const envelope = errorEnvelope(codigo, mensaje, extra);
  return { ...envelope, accion, solicitudId, avisos: ["MODO_DEMOSTRACION"], meta: meta() };
}

/* ------------------------------- Calificación ----------------------------- */

function comparable(valor: unknown, ignorarMayusculas = true, ignorarAcentos = true): string {
  let texto = String(valor ?? "").trim().replace(/\s+/g, " ");
  if (ignorarAcentos) texto = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (ignorarMayusculas) texto = texto.toLowerCase();
  return texto;
}

function redondear(valor: number, decimales = 3): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}

interface Calificacion {
  correcta: boolean | null;
  puntosObtenidos: number | null;
  puntosPosibles: number;
  requiereRevision: boolean;
}

/**
 * Calificador de demostración.
 *
 * Réplica de `14_Scoring.gs` para los tipos que el editor puede producir. La
 * prueba de paridad compara los dos, caso por caso.
 */
export function calificarRespuestaDemo(
  pregunta: Pregunta,
  respuesta: { opciones: string[]; valor: unknown },
): Calificacion {
  const spec = tipoSpec(pregunta.tipo);
  const maximo = pregunta.modoPuntaje === "ninguno" ? 0 : pregunta.puntos;
  if (!spec || spec.kind !== "pregunta") {
    return { correcta: null, puntosObtenidos: null, puntosPosibles: 0, requiereRevision: false };
  }
  if (pregunta.modoPuntaje === "ninguno") {
    return { correcta: null, puntosObtenidos: null, puntosPosibles: 0, requiereRevision: false };
  }
  if (
    requiereRevisionManual(pregunta.tipo, pregunta.modoPuntaje, maximo, pregunta.respuestaEsperada, pregunta.opciones)
  ) {
    return { correcta: null, puntosObtenidos: null, puntosPosibles: maximo, requiereRevision: true };
  }
  if (!esAutoCalificable(pregunta.tipo, pregunta.modoPuntaje, pregunta.respuestaEsperada, pregunta.opciones)) {
    return { correcta: null, puntosObtenidos: 0, puntosPosibles: maximo, requiereRevision: false };
  }

  const vacia = estaVacia(spec.expects, respuesta);
  if (vacia) return { correcta: false, puntosObtenidos: 0, puntosPosibles: maximo, requiereRevision: false };

  let resultado: { correcta: boolean | null; puntosObtenidos: number };
  switch (spec.expects) {
    case "opcion":
    case "opciones":
      resultado = calificarOpciones(pregunta, respuesta, maximo);
      break;
    case "orden":
      resultado = calificarOrden(pregunta, respuesta, maximo);
      break;
    case "emparejamiento":
    case "clasificacion":
      resultado = calificarPares(pregunta, respuesta, maximo);
      break;
    case "matriz":
      resultado = calificarMatriz(pregunta, respuesta, maximo);
      break;
    case "huecos":
      resultado = calificarHuecos(pregunta, respuesta, maximo);
      break;
    case "numero":
    case "escala":
      resultado = calificarNumero(pregunta, respuesta, maximo);
      break;
    default:
      resultado = calificarTexto(pregunta, respuesta, maximo);
      break;
  }

  let puntos = resultado.puntosObtenidos;
  if (pregunta.penalizacion > 0 && resultado.correcta === false) {
    puntos = Math.max(0, redondear(puntos - pregunta.penalizacion));
  }
  return { correcta: resultado.correcta, puntosObtenidos: puntos, puntosPosibles: maximo, requiereRevision: false };
}

function estaVacia(expects: string, respuesta: { opciones: string[]; valor: unknown }): boolean {
  if (expects === "opcion" || expects === "opciones") {
    return respuesta.opciones.length === 0 && (respuesta.valor === null || respuesta.valor === undefined || respuesta.valor === "");
  }
  if (Array.isArray(respuesta.valor)) return respuesta.valor.length === 0;
  if (respuesta.valor && typeof respuesta.valor === "object") return Object.keys(respuesta.valor).length === 0;
  return respuesta.valor === null || respuesta.valor === undefined || respuesta.valor === "";
}

function calificarOpciones(pregunta: Pregunta, respuesta: { opciones: string[] }, maximo: number) {
  const spec = tipoSpec(pregunta.tipo);
  const elegidas = new Set(respuesta.opciones);
  let correctasTotales = 0;
  let acertadas = 0;
  let falsosPositivos = 0;
  let porOpcion = 0;
  for (const opcion of pregunta.opciones) {
    const elegida = elegidas.has(opcion.id);
    if (opcion.correcta) {
      correctasTotales += 1;
      if (elegida) acertadas += 1;
    } else if (elegida) {
      falsosPositivos += 1;
    }
    if (elegida) porOpcion += opcion.puntos;
  }
  const perfecta = correctasTotales > 0 && acertadas === correctasTotales && falsosPositivos === 0;
  if (pregunta.modoPuntaje === "por_opcion") {
    return { correcta: perfecta, puntosObtenidos: redondear(Math.max(0, Math.min(porOpcion, maximo))) };
  }
  if (pregunta.modoPuntaje === "parcial" && spec?.multiple === true) {
    if (correctasTotales === 0) return { correcta: false, puntosObtenidos: 0 };
    const neto = Math.max(0, acertadas - falsosPositivos);
    return { correcta: perfecta, puntosObtenidos: redondear((neto / correctasTotales) * maximo) };
  }
  return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
}

function calificarOrden(pregunta: Pregunta, respuesta: { valor: unknown }, maximo: number) {
  const esperado = [...pregunta.opciones].sort((a, b) => a.orden - b.orden);
  const recibido = Array.isArray(respuesta.valor) ? (respuesta.valor as string[]) : [];
  if (esperado.length === 0) return { correcta: null, puntosObtenidos: 0 };
  let aciertos = 0;
  esperado.forEach((opcion, i) => {
    if (String(recibido[i]) === opcion.id) aciertos += 1;
  });
  const perfecta = aciertos === esperado.length && recibido.length === esperado.length;
  if (pregunta.modoPuntaje === "exacto") return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  return { correcta: perfecta, puntosObtenidos: redondear((aciertos / esperado.length) * maximo) };
}

function calificarPares(pregunta: Pregunta, respuesta: { valor: unknown }, maximo: number) {
  const mapa = (respuesta.valor ?? {}) as Record<string, string>;
  let total = 0;
  let aciertos = 0;
  for (const opcion of pregunta.opciones) {
    const clave = opcion.claveEmparejamiento.trim();
    if (!clave) continue;
    total += 1;
    const dada = mapa[opcion.id];
    if (dada !== undefined && comparable(dada) === comparable(clave)) aciertos += 1;
  }
  if (total === 0) return { correcta: null, puntosObtenidos: 0 };
  const perfecta = aciertos === total;
  if (pregunta.modoPuntaje === "exacto") return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  return { correcta: perfecta, puntosObtenidos: redondear((aciertos / total) * maximo) };
}

function calificarMatriz(pregunta: Pregunta, respuesta: { valor: unknown }, maximo: number) {
  const spec = tipoSpec(pregunta.tipo);
  const mapa = (respuesta.valor ?? {}) as Record<string, string | string[]>;
  let filas = 0;
  let aciertos = 0;
  for (const opcion of pregunta.opciones) {
    const cruda = opcion.claveEmparejamiento.trim();
    if (!cruda) continue;
    filas += 1;
    const esperadas = cruda.split(",").map((p) => comparable(p)).filter(Boolean);
    const valor = mapa[opcion.id];
    const dadas = Array.isArray(valor)
      ? [...new Set(valor.map((v) => comparable(v)).filter(Boolean))]
      : valor !== undefined && valor !== null && valor !== ""
        ? [comparable(valor)]
        : [];
    if (spec?.multiple === true) {
      if (dadas.length !== esperadas.length) continue;
      if (esperadas.every((e) => dadas.includes(e))) aciertos += 1;
    } else if (dadas.length === 1 && esperadas.includes(dadas[0])) {
      aciertos += 1;
    }
  }
  if (filas === 0) return { correcta: null, puntosObtenidos: 0 };
  const perfecta = aciertos === filas;
  if (pregunta.modoPuntaje === "exacto") return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  return { correcta: perfecta, puntosObtenidos: redondear((aciertos / filas) * maximo) };
}

function calificarHuecos(pregunta: Pregunta, respuesta: { valor: unknown }, maximo: number) {
  const huecos = pregunta.respuestaEsperada?.huecos ?? [];
  if (huecos.length === 0) return { correcta: null, puntosObtenidos: 0 };
  const dadas = (respuesta.valor ?? {}) as Record<string, string>;
  let aciertos = 0;
  for (const hueco of huecos) {
    const dada = dadas[hueco.clave];
    if (dada === undefined || dada === null || dada === "") continue;
    const normalizada = comparable(dada, hueco.ignorarMayusculas !== false, hueco.ignorarAcentos !== false);
    if (
      hueco.respuestas.some(
        (r) => comparable(r, hueco.ignorarMayusculas !== false, hueco.ignorarAcentos !== false) === normalizada,
      )
    ) {
      aciertos += 1;
    }
  }
  const perfecta = aciertos === huecos.length;
  if (pregunta.modoPuntaje === "exacto") return { correcta: perfecta, puntosObtenidos: perfecta ? maximo : 0 };
  return { correcta: perfecta, puntosObtenidos: redondear((aciertos / huecos.length) * maximo) };
}

function calificarNumero(pregunta: Pregunta, respuesta: { valor: unknown }, maximo: number) {
  const objetivo = Number(pregunta.respuestaEsperada?.valor);
  const recibido = Number(respuesta.valor);
  if (!Number.isFinite(objetivo) || !Number.isFinite(recibido)) return { correcta: false, puntosObtenidos: 0 };
  const tolerancia = Math.abs(pregunta.respuestaEsperada?.tolerancia ?? 0);
  const correcta = Math.abs(recibido - objetivo) <= tolerancia;
  return { correcta, puntosObtenidos: correcta ? maximo : 0 };
}

function calificarTexto(pregunta: Pregunta, respuesta: { valor: unknown }, maximo: number) {
  const esperado = pregunta.respuestaEsperada;
  const candidatas: unknown[] = [];
  if (esperado?.valor !== undefined && esperado.valor !== null && esperado.valor !== "") candidatas.push(esperado.valor);
  if (Array.isArray(esperado?.valores)) candidatas.push(...esperado.valores);
  if (Array.isArray(esperado?.alternativas)) candidatas.push(...esperado.alternativas);
  if (candidatas.length === 0) return { correcta: null, puntosObtenidos: 0 };
  const ignorarMayusculas = esperado?.ignorarMayusculas !== false;
  const ignorarAcentos = esperado?.ignorarAcentos !== false;
  const recibido = comparable(respuesta.valor, ignorarMayusculas, ignorarAcentos);
  const acierta = candidatas.some((c) => comparable(c, ignorarMayusculas, ignorarAcentos) === recibido);
  return { correcta: acierta, puntosObtenidos: acierta ? maximo : 0 };
}

/* -------------------------------- Auxiliares ------------------------------ */

function ahora(): string {
  return new Date().toISOString();
}

function evaluacionInicial(titulo: string, categoria: string): Evaluacion {
  const momento = ahora();
  return {
    id: newId("ev"),
    codigo: codigoPublico(titulo),
    titulo,
    descripcion: "",
    categoria: (categoria as Evaluacion["categoria"]) || "conocimientos",
    estado: "borrador",
    revision: 1,
    ultimoCliente: "",
    creadoEn: momento,
    creadoPor: "demostración",
    actualizadoEn: momento,
    actualizadoPor: "demostración",
    publicadoEn: "",
    publicadoPor: "",
    archivadoEn: "",
    eliminadoEn: "",
    versionMayor: 0,
    versionMenor: 0,
    versionEtiqueta: "v0",
    versionVigenteId: "",
    preguntas: 0,
    preguntasCalificables: 0,
    puntosTotales: 0,
    instrucciones: emptyRichDoc(),
    notasInternas: "",
    aplicacion: {
      duracionMinutos: 30,
      segundosExtra: 0,
      puntajeAprobacion: 70,
      criterioAprobacion: "porcentaje",
      intentosMaximos: 1,
      ventanaInicio: "",
      ventanaFin: "",
      navegacion: "libre",
      permitirRetroceso: true,
      mostrarProgreso: true,
      mezclarPreguntas: false,
      mezclarOpciones: false,
      autoenviarAlExpirar: true,
      guardadoAutomaticoSegundos: 20,
    },
    participante: {
      campos: [
        { clave: "nombre", etiqueta: "Nombre completo", obligatorio: true, activo: true },
        { clave: "documento", etiqueta: "Documento de identidad (CI)", obligatorio: true, activo: true },
      ],
      requiereConsentimiento: false,
      textoConsentimiento: "",
      visibilidadResultado: "solo_envio",
    },
    integridad: {
      registrarCambioPestana: true,
      registrarCopiaPegado: true,
      registrarTiempos: true,
      registrarNavegacion: true,
      bloquearPegado: false,
      bloquearMenuContextual: false,
      avisarAlSalir: true,
      pantallaCompletaSugerida: false,
      umbralRiesgo: 5,
    },
    tema: {
      acento: "cian",
      densidad: "comoda",
      portadaUrl: "",
      logoUrl: "",
      mostrarNumeracion: true,
      animaciones: true,
    },
    etiquetas: [],
    procesos: [],
    reglas: [],
    extras: {},
    esquemaVersion: 2,
  };
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function codigoPublico(titulo: string): string {
  const raiz =
    titulo
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4) || "EVAL";
  let sufijo = "";
  for (let i = 0; i < 4; i += 1) sufijo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `EV-${raiz}-${sufijo}`;
}

function normalizarSecciones(secciones: unknown, evaluacionId: string): Seccion[] {
  const entrada = Array.isArray(secciones) ? secciones : [];
  return entrada.map((cruda, indice) => {
    const seccion = (cruda ?? {}) as Partial<Seccion>;
    const id = typeof seccion.id === "string" && seccion.id.length >= 3 ? seccion.id : newId("sc");
    const preguntas = (Array.isArray(seccion.preguntas) ? seccion.preguntas : [])
      .filter((p) => tipoSpec(String((p as Pregunta).tipo)) !== null)
      .map((cruda2, i) => {
        const pregunta = cruda2 as Pregunta;
        return {
          ...pregunta,
          id: typeof pregunta.id === "string" && pregunta.id.length >= 3 ? pregunta.id : newId("pr"),
          seccionId: id,
          orden: i,
          enunciado: sanitizeRichDoc(pregunta.enunciado),
          ayuda: sanitizeRichDoc(pregunta.ayuda),
          opciones: (pregunta.opciones ?? []).map((opcion, j) => ({
            ...opcion,
            id: typeof opcion.id === "string" && opcion.id.length >= 3 ? opcion.id : newId("op"),
            orden: j,
            texto: sanitizeRichDoc(opcion.texto),
          })),
        } as Pregunta;
      });
    return {
      ...(seccion as Seccion),
      id,
      titulo: seccion.titulo || `Sección ${indice + 1}`,
      descripcion: sanitizeRichDoc(seccion.descripcion),
      orden: indice,
      preguntas,
    } as Seccion;
  }).map((seccion) => ({ ...seccion, preguntas: seccion.preguntas.map((p) => ({ ...p, seccionId: seccion.id })) })) as Seccion[];
  void evaluacionId;
}

function documentoDe(base: Base, id: string): DocumentoEvaluacion | null {
  const guardado = base.documentos[id];
  if (!guardado) return null;
  return {
    evaluacion: guardado.evaluacion,
    secciones: guardado.secciones,
    versiones: base.versiones
      .filter((v) => v.evaluacionId === id)
      .map(({ snapshot: _snapshot, evaluacionId: _evaluacionId, ...resto }) => resto),
  };
}

function preguntasDe(secciones: Seccion[]): Pregunta[] {
  return secciones.flatMap((s) => s.preguntas);
}

/* ---------------------------------- Rutas -------------------------------- */

export async function ejecutarEnDemostracion<T>(
  accion: string,
  payload: Record<string, unknown>,
  contexto: { solicitudId: string; cliente: string; actor: string },
): Promise<Envelope<T>> {
  // Una latencia mínima hace visibles los estados de carga durante el desarrollo.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const base = leerBase();
  const solicitud = contexto.solicitudId;

  // Idempotencia, igual que en el backend real.
  if (solicitud && base.solicitudes[solicitud]) {
    const previa = base.solicitudes[solicitud];
    return correcto(
      accion,
      solicitud,
      { repetida: true, referencia: previa.referencia, procesadoEn: previa.procesadoEn, resumen: previa.resumen } as T,
      ["SOLICITUD_REPETIDA"],
    );
  }

  const registrar = (referencia: string, resumen: Record<string, unknown> = {}) => {
    if (!solicitud) return;
    base.solicitudes[solicitud] = { referencia, procesadoEn: ahora(), resumen };
  };

  switch (accion) {
    case "ping":
      return correcto(accion, solicitud, {
        servicio: "evaluaciones",
        version: VERSION_DEMO,
        esquema: 2,
        snapshot: 2,
        textoEnriquecido: 1,
        instalado: true,
        horaServidor: ahora(),
        autorizacion: {
          modo: "abierto",
          llaveConfigurada: false,
          llaveLongitud: 0,
          llaveSuficiente: false,
          llaveRotacionPreparada: false,
          secretoIntentos: true,
        },
        tiposSoportados: TIPO_IDS.length,
        libro: { nombre: "Datos de demostración (este navegador)", id: "demostracion" },
        conteos: {
          evaluaciones: Object.keys(base.documentos).length,
          intentos: base.intentos.length,
          versiones: base.versiones.length,
        },
      } as T);

    case "install":
    case "repair":
      return correcto(accion, solicitud, {
        acciones: [{ sheet: "—", action: "no aplica en modo demostración" }],
        informe: { ok: true, installed: true, sheets: [], missingSheets: [], sheetsNeedingRepair: [] },
        autorizacion: { modo: "abierto" },
      } as T);

    case "diagnose":
      return correcto(accion, solicitud, {
        estado: "atencion",
        generadoEn: ahora(),
        backend: { version: VERSION_DEMO, esquema: 2, snapshot: 2, textoEnriquecido: 1, tiposSoportados: TIPO_IDS },
        libro: { nombre: "Datos de demostración (este navegador)", id: "demostracion", zonaHoraria: "", hojas: 0 },
        esquema: null,
        autorizacion: {
          modo: "abierto",
          llaveConfigurada: false,
          llaveLongitud: 0,
          llaveSuficiente: false,
          llaveRotacionPreparada: false,
          secretoIntentos: true,
        },
        conteos: {
          evaluaciones: Object.keys(base.documentos).length,
          intentos: base.intentos.length,
          respuestas: base.respuestas.length,
        },
        rendimiento: null,
        profundo: false,
        profundas: null,
        resumen: { critico: 0, alto: 1, medio: 0, info: 0 },
        hallazgos: [
          {
            severidad: "alto",
            codigo: "MODO_DEMOSTRACION",
            titulo: "Estás en modo demostración",
            detalle:
              "Los datos viven solo en este navegador. No hay libro de cálculo, ni auditoría, ni resultados compartidos con el equipo.",
            remedio:
              "Cuando tengas el libro y el despliegue, cambia a «Apps Script» en Evaluaciones → Conexión y pega la URL /exec.",
            datos: {},
          },
        ],
      } as T);

    case "listEvaluations": {
      const buscar = String(payload.buscar ?? "").toLowerCase().trim();
      const estados = Array.isArray(payload.estados) ? (payload.estados as string[]) : [];
      const incluirPapelera = payload.incluirPapelera === true;
      const items = Object.values(base.documentos)
        .filter(({ evaluacion }) => {
          if (!incluirPapelera && evaluacion.estado === "papelera") return false;
          if (estados.length > 0 && !estados.includes(evaluacion.estado)) return false;
          if (!buscar) return true;
          return `${evaluacion.titulo} ${evaluacion.codigo} ${evaluacion.categoria} ${evaluacion.descripcion}`
            .toLowerCase()
            .includes(buscar);
        })
        .map(({ evaluacion }) => ({
          id: evaluacion.id,
          codigo: evaluacion.codigo,
          titulo: evaluacion.titulo,
          descripcion: evaluacion.descripcion,
          categoria: evaluacion.categoria,
          estado: evaluacion.estado,
          revision: evaluacion.revision,
          versionEtiqueta: evaluacion.versionEtiqueta,
          versiones: base.versiones.filter((v) => v.evaluacionId === evaluacion.id).length,
          preguntas: evaluacion.preguntas,
          preguntasCalificables: evaluacion.preguntasCalificables,
          puntosTotales: evaluacion.puntosTotales,
          duracionMinutos: evaluacion.aplicacion.duracionMinutos,
          puntajeAprobacion: evaluacion.aplicacion.puntajeAprobacion,
          criterioAprobacion: evaluacion.aplicacion.criterioAprobacion,
          intentos: base.intentos.filter((i) => i.evaluacionId === evaluacion.id).length,
          intentosEnviados: base.intentos.filter((i) => i.evaluacionId === evaluacion.id && i.estado === "enviado").length,
          etiquetas: evaluacion.etiquetas,
          procesos: evaluacion.procesos,
          creadoEn: evaluacion.creadoEn,
          creadoPor: evaluacion.creadoPor,
          actualizadoEn: evaluacion.actualizadoEn,
          actualizadoPor: evaluacion.actualizadoPor,
          publicadoEn: evaluacion.publicadoEn,
          archivadoEn: evaluacion.archivadoEn,
        }))
        .sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
      return correcto(accion, solicitud, { items, total: items.length, sincronizadoEn: ahora() } as T);
    }

    case "getEvaluation": {
      const documento = documentoDe(base, String(payload.id ?? ""));
      if (!documento) {
        return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe en los datos de demostración.");
      }
      return correcto(accion, solicitud, documento as T);
    }

    case "createEvaluation": {
      const evaluacion = evaluacionInicial(
        String(payload.titulo ?? "Evaluación sin título"),
        String(payload.categoria ?? "conocimientos"),
      );
      const seccion: Seccion = {
        id: newId("sc"),
        titulo: "Sección 1",
        descripcion: emptyRichDoc(),
        orden: 0,
        limiteSegundos: null,
        mezclar: false,
        tomarN: null,
        peso: 1,
        preguntas: [],
      };
      base.documentos[evaluacion.id] = { evaluacion, secciones: [seccion] };
      registrar(evaluacion.id, { id: evaluacion.id });
      guardarBase(base);
      return correcto(accion, solicitud, documentoDe(base, evaluacion.id) as T);
    }

    case "saveEvaluation": {
      const id = String(payload.id ?? "");
      const guardado = base.documentos[id];
      if (!guardado) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      if (guardado.evaluacion.estado === "archivada" || guardado.evaluacion.estado === "papelera") {
        return fallo(accion, solicitud, "CONFLICT", "Una evaluación archivada o en la papelera no se puede editar.", {
          pista: "Restáurala primero.",
        });
      }
      const revisionBase = payload.revisionBase;
      if (
        typeof revisionBase === "number" &&
        revisionBase < guardado.evaluacion.revision &&
        guardado.evaluacion.ultimoCliente &&
        guardado.evaluacion.ultimoCliente !== contexto.cliente &&
        payload.forzar !== true
      ) {
        return fallo(accion, solicitud, "CONFLICT", "Otra sesión guardó esta evaluación después de que la abriste.", {
          pista: "Vuelve a cargarla o confirma que quieres sobrescribir.",
          detalle: { revisionBase, revisionActual: guardado.evaluacion.revision, puedeForzar: true },
        });
      }

      const secciones = normalizarSecciones(payload.secciones, id);
      const entrante = (payload.evaluacion ?? {}) as Partial<Evaluacion>;
      const conteos = contarContenido(secciones);
      const evaluacion: Evaluacion = {
        ...guardado.evaluacion,
        ...entrante,
        id,
        codigo: guardado.evaluacion.codigo,
        estado: guardado.evaluacion.estado,
        revision: guardado.evaluacion.revision + 1,
        ultimoCliente: contexto.cliente,
        actualizadoEn: ahora(),
        actualizadoPor: contexto.actor || "demostración",
        instrucciones: sanitizeRichDoc(entrante.instrucciones ?? guardado.evaluacion.instrucciones),
        aplicacion: { ...guardado.evaluacion.aplicacion, ...(entrante.aplicacion ?? {}) },
        participante: { ...guardado.evaluacion.participante, ...(entrante.participante ?? {}) },
        integridad: { ...guardado.evaluacion.integridad, ...(entrante.integridad ?? {}) },
        tema: { ...guardado.evaluacion.tema, ...(entrante.tema ?? {}) },
        preguntas: conteos.preguntas,
        preguntasCalificables: conteos.calificables,
        puntosTotales: conteos.puntos,
        versionMayor: guardado.evaluacion.versionMayor,
        versionMenor: guardado.evaluacion.versionMenor,
        versionEtiqueta: guardado.evaluacion.versionEtiqueta,
        versionVigenteId: guardado.evaluacion.versionVigenteId,
      };
      base.documentos[id] = { evaluacion, secciones };
      registrar(id, { id, revision: evaluacion.revision });
      guardarBase(base);
      return correcto(accion, solicitud, documentoDe(base, id) as T);
    }

    case "duplicateEvaluation": {
      const origen = base.documentos[String(payload.id ?? "")];
      if (!origen) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      const titulo = String(payload.titulo ?? `${origen.evaluacion.titulo} (copia)`);
      const copia = evaluacionInicial(titulo, origen.evaluacion.categoria);
      const secciones = origen.secciones.map((seccion, i) => {
        const nuevaSeccionId = newId("sc");
        return {
          ...structuredClone(seccion),
          id: nuevaSeccionId,
          orden: i,
          preguntas: seccion.preguntas.map((pregunta, j) => ({
            ...structuredClone(pregunta),
            id: newId("pr"),
            seccionId: nuevaSeccionId,
            orden: j,
            opciones: pregunta.opciones.map((opcion, k) => ({ ...structuredClone(opcion), id: newId("op"), orden: k })),
          })),
        };
      });
      const conteos = contarContenido(secciones);
      base.documentos[copia.id] = {
        evaluacion: {
          ...copia,
          instrucciones: origen.evaluacion.instrucciones,
          descripcion: origen.evaluacion.descripcion,
          notasInternas: origen.evaluacion.notasInternas,
          aplicacion: { ...origen.evaluacion.aplicacion },
          participante: { ...origen.evaluacion.participante },
          integridad: { ...origen.evaluacion.integridad },
          tema: { ...origen.evaluacion.tema },
          etiquetas: [...origen.evaluacion.etiquetas],
          preguntas: conteos.preguntas,
          preguntasCalificables: conteos.calificables,
          puntosTotales: conteos.puntos,
        },
        secciones,
      };
      registrar(copia.id, { id: copia.id });
      guardarBase(base);
      return correcto(accion, solicitud, documentoDe(base, copia.id) as T);
    }

    case "publishEvaluation": {
      const id = String(payload.id ?? "");
      const guardado = base.documentos[id];
      if (!guardado) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      const hallazgos = soloErrores(revisarDocumento(guardado.evaluacion, guardado.secciones));
      if (hallazgos.length > 0) {
        return fallo(
          accion,
          solicitud,
          "VALIDATION_ERROR",
          hallazgos.length === 1
            ? "Falta un detalle antes de poder publicar."
            : `Faltan ${hallazgos.length} detalles antes de poder publicar.`,
          {
            pista: "Corrige los puntos señalados.",
            detalle: {
              issues: hallazgos.map((h) => ({
                code: h.codigo,
                message: h.mensaje,
                path: h.ruta,
                details: h.datos ?? {},
              })),
            },
          },
        );
      }
      const previas = base.versiones.filter((v) => v.evaluacionId === id);
      const mayor = previas.length === 0 ? 1 : Math.max(...previas.map((v) => v.mayor));
      const menor = previas.length === 0 ? 0 : Math.max(...previas.filter((v) => v.mayor === mayor).map((v) => v.menor)) + 1;
      const etiqueta = `v${mayor}.${menor}`;
      const conteos = contarContenido(guardado.secciones);
      const versionId = newId("vr");
      for (const previa of previas) previa.estado = "reemplazada";
      base.versiones.push({
        id: versionId,
        evaluacionId: id,
        etiqueta,
        mayor,
        menor,
        estado: "vigente",
        notas: String(payload.notas ?? ""),
        preguntas: conteos.preguntas,
        preguntasCalificables: conteos.calificables,
        puntosTotales: conteos.puntos,
        huella: newId("hz"),
        caracteres: JSON.stringify(guardado.secciones).length,
        publicadoEn: ahora(),
        publicadoPor: contexto.actor || "demostración",
        snapshot: structuredClone({ evaluacion: guardado.evaluacion, secciones: guardado.secciones }),
      });
      guardado.evaluacion = {
        ...guardado.evaluacion,
        estado: "publicada",
        revision: guardado.evaluacion.revision + 1,
        versionMayor: mayor,
        versionMenor: menor,
        versionEtiqueta: etiqueta,
        versionVigenteId: versionId,
        publicadoEn: guardado.evaluacion.publicadoEn || ahora(),
        publicadoPor: contexto.actor || "demostración",
        actualizadoEn: ahora(),
        ultimoCliente: contexto.cliente,
      };
      registrar(id, { id, versionId, etiqueta });
      guardarBase(base);
      return correcto(accion, solicitud, {
        documento: documentoDe(base, id),
        version: { id: versionId, etiqueta, mayor, menor, tipoCambio: previas.length === 0 ? "inicial" : "presentacion" },
        enlacePublico: { codigo: guardado.evaluacion.codigo },
        advertencias: [],
      } as T);
    }

    case "transitionEvaluation": {
      const id = String(payload.id ?? "");
      const guardado = base.documentos[id];
      if (!guardado) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      const transiciones: Record<string, { desde: string[]; hacia: Evaluacion["estado"] }> = {
        pausar: { desde: ["publicada"], hacia: "pausada" },
        reanudar: { desde: ["pausada"], hacia: "publicada" },
        cerrar: { desde: ["publicada", "pausada"], hacia: "cerrada" },
        archivar: { desde: ["borrador", "publicada", "pausada", "cerrada"], hacia: "archivada" },
        restaurar: { desde: ["archivada", "papelera"], hacia: "borrador" },
        despublicar: { desde: ["publicada", "pausada", "cerrada"], hacia: "borrador" },
      };
      const transicion = transiciones[String(payload.transicion ?? "")];
      if (!transicion) {
        return fallo(accion, solicitud, "BAD_REQUEST", "Transición desconocida.", {
          detalle: { validas: Object.keys(transiciones) },
        });
      }
      if (!transicion.desde.includes(guardado.evaluacion.estado)) {
        return fallo(
          accion,
          solicitud,
          "CONFLICT",
          `La evaluación está «${guardado.evaluacion.estado}» y desde ahí no se puede ${payload.transicion}.`,
          { detalle: { estadoActual: guardado.evaluacion.estado, estadosValidos: transicion.desde } },
        );
      }
      guardado.evaluacion = {
        ...guardado.evaluacion,
        estado: transicion.hacia,
        revision: guardado.evaluacion.revision + 1,
        archivadoEn: transicion.hacia === "archivada" ? ahora() : "",
        eliminadoEn: transicion.hacia === "borrador" ? "" : guardado.evaluacion.eliminadoEn,
        actualizadoEn: ahora(),
        ultimoCliente: contexto.cliente,
      };
      registrar(id, { id, estado: transicion.hacia });
      guardarBase(base);
      return correcto(accion, solicitud, documentoDe(base, id) as T);
    }

    case "relaunchEvaluation": {
      const id = String(payload.id ?? "");
      const guardado = base.documentos[id];
      if (!guardado) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      if (!guardado.evaluacion.versionVigenteId) {
        return fallo(accion, solicitud, "CONFLICT", "No se puede relanzar una evaluación que nunca se publicó.", {
          pista: "Publícala primero.",
        });
      }
      guardado.evaluacion = {
        ...guardado.evaluacion,
        estado: "publicada",
        revision: guardado.evaluacion.revision + 1,
        archivadoEn: "",
        eliminadoEn: "",
        aplicacion: {
          ...guardado.evaluacion.aplicacion,
          ventanaInicio: String(payload.ventanaInicio ?? ahora()),
          ventanaFin: String(payload.ventanaFin ?? ""),
        },
        actualizadoEn: ahora(),
      };
      registrar(id, { id });
      guardarBase(base);
      return correcto(accion, solicitud, documentoDe(base, id) as T);
    }

    case "rollbackEvaluation": {
      const id = String(payload.id ?? "");
      const versionId = String(payload.versionId ?? "");
      const guardado = base.documentos[id];
      const version = base.versiones.find((v) => v.id === versionId && v.evaluacionId === id);
      if (!guardado || !version) {
        return fallo(accion, solicitud, "NOT_FOUND", "La versión indicada no pertenece a esta evaluación.");
      }
      for (const v of base.versiones.filter((x) => x.evaluacionId === id)) {
        v.estado = v.id === versionId ? "vigente" : "reemplazada";
      }
      guardado.evaluacion = {
        ...guardado.evaluacion,
        versionVigenteId: versionId,
        versionMayor: version.mayor,
        versionMenor: version.menor,
        versionEtiqueta: version.etiqueta,
        revision: guardado.evaluacion.revision + 1,
        actualizadoEn: ahora(),
      };
      registrar(id, { id, versionId });
      guardarBase(base);
      return correcto(accion, solicitud, documentoDe(base, id) as T);
    }

    case "deleteEvaluation": {
      const id = String(payload.id ?? "");
      const guardado = base.documentos[id];
      if (!guardado) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      guardado.evaluacion = {
        ...guardado.evaluacion,
        estado: "papelera",
        eliminadoEn: ahora(),
        revision: guardado.evaluacion.revision + 1,
      };
      registrar(id, { id });
      guardarBase(base);
      return correcto(accion, solicitud, { id, estado: "papelera" } as T);
    }

    case "purgeEvaluation": {
      const id = String(payload.id ?? "");
      if (payload.confirmacion !== "ELIMINAR") {
        return fallo(accion, solicitud, "BAD_REQUEST", "El borrado permanente exige confirmación explícita.", {
          pista: 'Envía `confirmacion: "ELIMINAR"`.',
        });
      }
      const intentos = base.intentos.filter((i) => i.evaluacionId === id).map((i) => i.id);
      delete base.documentos[id];
      base.versiones = base.versiones.filter((v) => v.evaluacionId !== id);
      base.intentos = base.intentos.filter((i) => i.evaluacionId !== id);
      base.respuestas = base.respuestas.filter((r) => !intentos.includes(r.intentoId));
      base.eventos = base.eventos.filter((e) => !intentos.includes(e.intentoId));
      registrar(id, { id });
      guardarBase(base);
      return correcto(accion, solicitud, { id, borrado: { evaluacion: 1, intentos: intentos.length } } as T);
    }

    case "openAssessment": {
      const codigo = String(payload.codigo ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const encontrado = Object.values(base.documentos).find((d) => d.evaluacion.codigo === codigo);
      if (!encontrado) {
        return fallo(accion, solicitud, "NOT_FOUND", "No existe ninguna evaluación con ese código.", {
          detalle: { motivo: "codigo_inexistente" },
        });
      }
      const evaluacion = encontrado.evaluacion;
      const motivo =
        evaluacion.estado === "publicada" && evaluacion.versionVigenteId
          ? ""
          : evaluacion.estado === "borrador"
            ? "no_publicada"
            : evaluacion.estado === "pausada"
              ? "pausada"
              : evaluacion.estado === "cerrada"
                ? "cerrada"
                : "no_disponible";
      if (motivo) {
        return correcto(accion, solicitud, {
          codigo,
          disponible: false,
          motivo,
          mensaje: "Esta evaluación no está disponible ahora mismo.",
          titulo: evaluacion.titulo,
          horaServidor: ahora(),
        } as T);
      }
      const version = base.versiones.find((v) => v.id === evaluacion.versionVigenteId);
      return correcto(accion, solicitud, {
        codigo,
        disponible: true,
        motivo: "",
        mensaje: "",
        titulo: evaluacion.titulo,
        horaServidor: ahora(),
        descripcion: evaluacion.descripcion,
        instrucciones: evaluacion.instrucciones,
        versionEtiqueta: version?.etiqueta ?? evaluacion.versionEtiqueta,
        totalPreguntas: version?.preguntas ?? evaluacion.preguntas,
        duracionMinutos: evaluacion.aplicacion.duracionMinutos,
        intentosMaximos: evaluacion.aplicacion.intentosMaximos,
        participante: {
          campos: evaluacion.participante.campos,
          requiereConsentimiento: evaluacion.participante.requiereConsentimiento,
          textoConsentimiento: evaluacion.participante.textoConsentimiento,
        },
        integridad: evaluacion.integridad,
        tema: evaluacion.tema,
        ventanaFin: evaluacion.aplicacion.ventanaFin,
      } as T);
    }

    case "startAttempt": {
      const codigo = String(payload.codigo ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const encontrado = Object.values(base.documentos).find((d) => d.evaluacion.codigo === codigo);
      if (!encontrado || encontrado.evaluacion.estado !== "publicada") {
        return fallo(accion, solicitud, "NOT_FOUND", "Esta evaluación no está disponible.");
      }
      const version = base.versiones.find((v) => v.id === encontrado.evaluacion.versionVigenteId);
      if (!version) return fallo(accion, solicitud, "NOT_FOUND", "La versión publicada no está disponible.");
      const participante = (payload.participante ?? {}) as Record<string, string>;
      if (!participante.nombre || !participante.documento) {
        return fallo(accion, solicitud, "VALIDATION_ERROR", "Faltan datos para identificar al participante.", {
          detalle: {
            issues: [
              ...(participante.nombre ? [] : [{ code: "CAMPO_OBLIGATORIO", message: "Falta el nombre.", path: "participante.nombre", details: {} }]),
              ...(participante.documento
                ? []
                : [{ code: "CAMPO_OBLIGATORIO", message: "Falta el documento.", path: "participante.documento", details: {} }]),
            ],
          },
        });
      }
      const enCurso = base.intentos.find(
        (i) =>
          i.evaluacionId === encontrado.evaluacion.id &&
          i.estado === "en_curso" &&
          comparable(i.participante.documento) === comparable(participante.documento),
      );
      const snapshot = version.snapshot;
      if (enCurso) {
        const previas = base.respuestas
          .filter((r) => r.intentoId === enCurso.id)
          .map((r) => ({ preguntaId: r.preguntaId, opciones: r.opciones, valor: r.valor }));
        return correcto(accion, solicitud, {
          intentoId: enCurso.id,
          token: base.tokens[enCurso.id] ?? "",
          retomado: true,
          horaServidor: ahora(),
          iniciadoEn: enCurso.iniciadoEn,
          limiteEn: enCurso.limiteEn,
          segundosRestantes: restantes(enCurso),
          respuestasPrevias: previas,
          prueba: pruebaPublica(snapshot, enCurso.id),
        } as T);
      }
      const enviados = base.intentos.filter(
        (i) =>
          i.evaluacionId === encontrado.evaluacion.id &&
          comparable(i.participante.documento) === comparable(participante.documento) &&
          (i.estado === "enviado" || i.estado === "expirado"),
      ).length;
      if (enviados >= encontrado.evaluacion.aplicacion.intentosMaximos) {
        return fallo(accion, solicitud, "FORBIDDEN", "Ya agotaste los intentos permitidos.", {
          detalle: { intentosRealizados: enviados, intentosMaximos: encontrado.evaluacion.aplicacion.intentosMaximos },
        });
      }
      const duracion = encontrado.evaluacion.aplicacion.duracionMinutos;
      const inicio = new Date();
      const intento: Intento = {
        id: newId("it"),
        evaluacionId: encontrado.evaluacion.id,
        versionId: version.id,
        versionEtiqueta: version.etiqueta,
        participante: {
          nombre: participante.nombre,
          documento: participante.documento,
          correo: participante.correo ?? "",
          extra: {},
        },
        estado: "en_curso",
        iniciadoEn: inicio.toISOString(),
        limiteEn: duracion ? new Date(inicio.getTime() + duracion * 60000).toISOString() : "",
        ultimoGuardadoEn: "",
        enviadoEn: "",
        envioAutomatico: false,
        segundosUsados: 0,
        puntosObtenidos: null,
        puntosPosibles: version.puntosTotales,
        nota: null,
        notaAutomatica: null,
        correctas: 0,
        incorrectas: 0,
        sinResponder: version.preguntas,
        calificables: version.preguntasCalificables,
        pendientesRevision: 0,
        estadoCalificacion: "automatica",
        aprobado: null,
        calificadoEn: "",
        calificadoPor: "",
        riesgoIntegridad: 0,
        eventosIntegridad: 0,
        resumenIntegridad: {},
        agenteUsuario: String(payload.agenteUsuario ?? ""),
        zonaHoraria: String(payload.zonaHoraria ?? ""),
        procesoId: "",
        notasRevision: "",
      };
      const token = `demo.${newId("tk")}`;
      base.intentos.push(intento);
      base.tokens[intento.id] = token;
      registrar(intento.id, { intentoId: intento.id });
      guardarBase(base);
      return correcto(accion, solicitud, {
        intentoId: intento.id,
        token,
        retomado: false,
        horaServidor: ahora(),
        iniciadoEn: intento.iniciadoEn,
        limiteEn: intento.limiteEn,
        segundosRestantes: restantes(intento),
        respuestasPrevias: [],
        prueba: pruebaPublica(snapshot, intento.id),
      } as T);
    }

    case "heartbeat": {
      const intento = base.intentos.find((i) => i.id === String(payload.intentoId ?? ""));
      if (!intento) return fallo(accion, solicitud, "NOT_FOUND", "Este intento no existe.");
      if (base.tokens[intento.id] !== String(payload.token ?? "")) {
        return fallo(accion, solicitud, "FORBIDDEN", "La credencial de este intento no es válida.");
      }
      const restante = restantes(intento);
      return correcto(accion, solicitud, {
        intentoId: intento.id,
        estado: intento.estado,
        horaServidor: ahora(),
        limiteEn: intento.limiteEn,
        segundosRestantes: restante,
        expirado: intento.estado === "en_curso" && restante !== null && restante <= 0,
        ultimoGuardadoEn: intento.ultimoGuardadoEn,
      } as T);
    }

    case "saveProgress":
    case "submitAttempt": {
      const intento = base.intentos.find((i) => i.id === String(payload.intentoId ?? ""));
      if (!intento) return fallo(accion, solicitud, "NOT_FOUND", "Este intento no existe.");
      if (base.tokens[intento.id] !== String(payload.token ?? "")) {
        return fallo(accion, solicitud, "FORBIDDEN", "La credencial de este intento no es válida.");
      }
      const version = base.versiones.find((v) => v.id === intento.versionId);
      if (!version) return fallo(accion, solicitud, "NOT_FOUND", "No se encontró la versión de este intento.");
      const preguntas = new Map(preguntasDe(version.snapshot.secciones).map((p) => [p.id, p]));

      if (accion === "saveProgress" && intento.estado !== "en_curso") {
        return fallo(accion, solicitud, "CONFLICT", "Este intento ya fue enviado y no admite más cambios.");
      }
      if (accion === "submitAttempt" && intento.estado === "enviado") {
        return correcto(accion, solicitud, resultadoCandidato(intento, version.snapshot.evaluacion, true) as T);
      }

      const entrantes = Array.isArray(payload.respuestas) ? (payload.respuestas as Record<string, unknown>[]) : [];
      for (const cruda of entrantes) {
        const preguntaId = String(cruda.preguntaId ?? "");
        const pregunta = preguntas.get(preguntaId);
        if (!pregunta) continue;
        const opciones = Array.isArray(cruda.opciones) ? (cruda.opciones as string[]) : [];
        const valor = cruda.valor ?? null;
        const existente = base.respuestas.find((r) => r.intentoId === intento.id && r.preguntaId === preguntaId);
        const fila: RespuestaGuardada = {
          intentoId: intento.id,
          preguntaId,
          tipo: pregunta.tipo,
          orden: pregunta.orden,
          opciones,
          valor,
          valorTexto: textoDeRespuesta(pregunta, opciones, valor),
          correcta: null,
          puntosObtenidos: null,
          puntosPosibles: pregunta.modoPuntaje === "ninguno" ? 0 : pregunta.puntos,
          requiereRevision: false,
          comentarioRevisor: existente?.comentarioRevisor ?? "",
          segundos: Number(cruda.segundos ?? 0),
          visitas: Number(cruda.visitas ?? 0),
          cambios: Number(cruda.cambios ?? 0),
          respondidaEn: ahora(),
        };
        if (existente) Object.assign(existente, fila);
        else base.respuestas.push(fila);
      }

      registrarEventos(base, intento, Array.isArray(payload.eventos) ? (payload.eventos as Record<string, unknown>[]) : []);
      intento.ultimoGuardadoEn = ahora();
      intento.segundosUsados = transcurridos(intento);

      if (accion === "saveProgress") {
        guardarBase(base);
        const restante = restantes(intento);
        return correcto(accion, solicitud, {
          guardadoEn: intento.ultimoGuardadoEn,
          respuestasGuardadas: entrantes.length,
          horaServidor: ahora(),
          segundosRestantes: restante,
          expirado: restante !== null && restante <= 0,
        } as T);
      }

      // Envío: se califica todo lo guardado.
      let puntosObtenidos = 0;
      let correctas = 0;
      let incorrectas = 0;
      let pendientes = 0;
      const respondidas = new Set<string>();
      for (const fila of base.respuestas.filter((r) => r.intentoId === intento.id)) {
        const pregunta = preguntas.get(fila.preguntaId);
        if (!pregunta) continue;
        respondidas.add(fila.preguntaId);
        const calificacion = calificarRespuestaDemo(pregunta, { opciones: fila.opciones, valor: fila.valor });
        fila.correcta = calificacion.correcta;
        fila.puntosObtenidos = calificacion.puntosObtenidos;
        fila.puntosPosibles = calificacion.puntosPosibles;
        fila.requiereRevision = calificacion.requiereRevision;
        if (calificacion.requiereRevision) pendientes += 1;
        else {
          puntosObtenidos += calificacion.puntosObtenidos ?? 0;
          if (calificacion.correcta === true) correctas += 1;
          else if (calificacion.correcta === false) incorrectas += 1;
        }
      }
      const conteos = contarContenido(version.snapshot.secciones);
      const manualesSinResponder = preguntasDe(version.snapshot.secciones).filter(
        (p) =>
          !respondidas.has(p.id) &&
          requiereRevisionManual(p.tipo, p.modoPuntaje, p.puntos, p.respuestaEsperada, p.opciones),
      ).length;
      pendientes += manualesSinResponder;

      const puntosPosibles = conteos.puntos;
      const notaAutomatica = puntosPosibles > 0 ? redondear((puntosObtenidos / puntosPosibles) * 100, 2) : null;
      const evaluacion = version.snapshot.evaluacion;
      const restante = restantes(intento);
      const expirado = restante !== null && restante <= 0;

      intento.estado = expirado ? "expirado" : "enviado";
      intento.enviadoEn = ahora();
      intento.envioAutomatico = payload.automatico === true || expirado;
      intento.puntosObtenidos = redondear(puntosObtenidos);
      intento.puntosPosibles = puntosPosibles;
      intento.notaAutomatica = notaAutomatica;
      intento.nota = pendientes > 0 ? null : notaAutomatica;
      intento.correctas = correctas;
      intento.incorrectas = incorrectas;
      intento.sinResponder = conteos.preguntas - respondidas.size;
      intento.calificables = conteos.calificables;
      intento.pendientesRevision = pendientes;
      intento.estadoCalificacion = pendientes > 0 ? "pendiente_revision" : "automatica";
      intento.aprobado =
        intento.nota !== null && evaluacion.aplicacion.puntajeAprobacion !== null
          ? evaluacion.aplicacion.criterioAprobacion === "puntos"
            ? (intento.puntosObtenidos ?? 0) >= evaluacion.aplicacion.puntajeAprobacion
            : intento.nota >= evaluacion.aplicacion.puntajeAprobacion
          : null;
      intento.calificadoEn = pendientes > 0 ? "" : ahora();
      intento.calificadoPor = pendientes > 0 ? "" : "sistema";
      registrar(intento.id, { intentoId: intento.id });
      guardarBase(base);
      return correcto(accion, solicitud, resultadoCandidato(intento, evaluacion, false) as T);
    }

    case "listAttempts": {
      const evaluacionId = String(payload.evaluacionId ?? "");
      const guardado = base.documentos[evaluacionId];
      if (!guardado) return fallo(accion, solicitud, "NOT_FOUND", "La evaluación no existe.");
      const intentos = base.intentos
        .filter((i) => i.evaluacionId === evaluacionId)
        .map((i) => ({ ...i, segundosRestantes: i.estado === "en_curso" ? restantes(i) : null }))
        .sort((a, b) => (b.enviadoEn || b.iniciadoEn).localeCompare(a.enviadoEn || a.iniciadoEn));
      return correcto(accion, solicitud, {
        evaluacion: {
          id: guardado.evaluacion.id,
          codigo: guardado.evaluacion.codigo,
          titulo: guardado.evaluacion.titulo,
          estado: guardado.evaluacion.estado,
          versionEtiqueta: guardado.evaluacion.versionEtiqueta,
          puntosTotales: guardado.evaluacion.puntosTotales,
          puntajeAprobacion: guardado.evaluacion.aplicacion.puntajeAprobacion,
          criterioAprobacion: guardado.evaluacion.aplicacion.criterioAprobacion,
          duracionMinutos: guardado.evaluacion.aplicacion.duracionMinutos,
        },
        intentos,
        resumen: resumenCola(intentos),
        sincronizadoEn: ahora(),
      } as T);
    }

    case "getAttempt":
    case "exportAttempt": {
      const intento = base.intentos.find((i) => i.id === String(payload.intentoId ?? ""));
      if (!intento) return fallo(accion, solicitud, "NOT_FOUND", "El intento no existe.");
      const version = base.versiones.find((v) => v.id === intento.versionId);
      const preguntas = version ? preguntasDe(version.snapshot.secciones) : [];
      const guardado = base.documentos[intento.evaluacionId];
      const respuestas: RespuestaDetalle[] = preguntas
        .filter((p) => tipoSpec(p.tipo)?.kind === "pregunta")
        .map((pregunta) => {
          const fila = base.respuestas.find((r) => r.intentoId === intento.id && r.preguntaId === pregunta.id);
          return detalleRespuesta(pregunta, fila);
        })
        .sort((a, b) => a.orden - b.orden);
      const eventos = base.eventos
        .filter((e) => e.intentoId === intento.id)
        .sort((a, b) => a.secuencia - b.secuencia);
      const detalle = {
        intento: { ...intento, segundosRestantes: intento.estado === "en_curso" ? restantes(intento) : null },
        evaluacion: guardado
          ? {
              id: guardado.evaluacion.id,
              codigo: guardado.evaluacion.codigo,
              titulo: guardado.evaluacion.titulo,
              estado: guardado.evaluacion.estado,
              versionEtiqueta: guardado.evaluacion.versionEtiqueta,
              puntosTotales: guardado.evaluacion.puntosTotales,
              puntajeAprobacion: guardado.evaluacion.aplicacion.puntajeAprobacion,
              criterioAprobacion: guardado.evaluacion.aplicacion.criterioAprobacion,
              duracionMinutos: guardado.evaluacion.aplicacion.duracionMinutos,
              integridad: guardado.evaluacion.integridad,
            }
          : null,
        respuestas,
        eventos,
        cronologia: cronologia(intento, eventos),
        advertencias: version ? [] : ["VERSION_INEXISTENTE"],
      };
      if (accion === "getAttempt") return correcto(accion, solicitud, detalle as T);
      return correcto(accion, solicitud, {
        generadoEn: ahora(),
        backend: VERSION_DEMO,
        evaluacion: detalle.evaluacion,
        intento: detalle.intento,
        identidad: {
          nombre: intento.participante.nombre,
          documento: intento.participante.documento,
          correo: intento.participante.correo,
          identificador: intento.id,
          extra: intento.participante.extra,
        },
        resultado: {
          nota: intento.nota,
          notaAutomatica: intento.notaAutomatica,
          puntosObtenidos: intento.puntosObtenidos,
          puntosPosibles: intento.puntosPosibles,
          correctas: intento.correctas,
          incorrectas: intento.incorrectas,
          sinResponder: intento.sinResponder,
          aprobado: intento.aprobado,
          estadoCalificacion: intento.estadoCalificacion,
          pendientesRevision: intento.pendientesRevision,
        },
        integridad: { riesgo: intento.riesgoIntegridad, resumen: intento.resumenIntegridad, eventos: eventos.length },
        respuestas,
        cronologia: detalle.cronologia,
        advertencias: detalle.advertencias,
      } as T);
    }

    case "gradeAnswer": {
      const intento = base.intentos.find((i) => i.id === String(payload.intentoId ?? ""));
      if (!intento) return fallo(accion, solicitud, "NOT_FOUND", "El intento no existe.");
      const fila = base.respuestas.find(
        (r) => r.intentoId === intento.id && r.preguntaId === String(payload.preguntaId ?? ""),
      );
      if (!fila) return fallo(accion, solicitud, "NOT_FOUND", "Esa pregunta no tiene respuesta registrada.");
      if (!fila.requiereRevision && payload.forzar !== true) {
        return fallo(accion, solicitud, "CONFLICT", "Esta pregunta la calificó el sistema automáticamente.", {
          detalle: { puedeForzar: true },
        });
      }
      const puntos = Number(payload.puntos);
      if (!Number.isFinite(puntos) || puntos < 0 || puntos > fila.puntosPosibles) {
        return fallo(accion, solicitud, "VALIDATION_ERROR", `El puntaje debe estar entre 0 y ${fila.puntosPosibles}.`, {
          detalle: { maximo: fila.puntosPosibles },
        });
      }
      fila.puntosObtenidos = redondear(puntos);
      fila.correcta = fila.puntosPosibles > 0 ? puntos >= fila.puntosPosibles : null;
      fila.requiereRevision = false;
      fila.comentarioRevisor = String(payload.comentario ?? "");

      const propias = base.respuestas.filter((r) => r.intentoId === intento.id);
      const pendientes = propias.filter((r) => r.requiereRevision).length;
      const obtenidos = propias.filter((r) => !r.requiereRevision).reduce((suma, r) => suma + (r.puntosObtenidos ?? 0), 0);
      const evaluacion = base.documentos[intento.evaluacionId]?.evaluacion;
      intento.puntosObtenidos = redondear(obtenidos);
      intento.correctas = propias.filter((r) => r.correcta === true).length;
      intento.incorrectas = propias.filter((r) => r.correcta === false).length;
      intento.pendientesRevision = pendientes;
      intento.nota =
        pendientes > 0 || !intento.puntosPosibles
          ? null
          : redondear((obtenidos / intento.puntosPosibles) * 100, 2);
      intento.estadoCalificacion = pendientes > 0 ? "pendiente_revision" : "revisada";
      intento.aprobado =
        intento.nota !== null && evaluacion?.aplicacion.puntajeAprobacion != null
          ? evaluacion.aplicacion.criterioAprobacion === "puntos"
            ? (intento.puntosObtenidos ?? 0) >= evaluacion.aplicacion.puntajeAprobacion
            : intento.nota >= evaluacion.aplicacion.puntajeAprobacion
          : null;
      intento.calificadoEn = ahora();
      intento.calificadoPor = contexto.actor || "demostración";
      registrar(intento.id, {});
      guardarBase(base);
      return correcto(accion, solicitud, {
        intentoId: intento.id,
        preguntaId: fila.preguntaId,
        puntosObtenidos: fila.puntosObtenidos,
        nota: intento.nota,
        aprobado: intento.aprobado,
        estadoCalificacion: intento.estadoCalificacion,
        pendientesRevision: pendientes,
      } as T);
    }

    case "annulAttempt": {
      const intento = base.intentos.find((i) => i.id === String(payload.intentoId ?? ""));
      if (!intento) return fallo(accion, solicitud, "NOT_FOUND", "El intento no existe.");
      intento.estado = payload.restablecer === true ? (intento.enviadoEn ? "enviado" : "en_curso") : "anulado";
      intento.notasRevision = String(payload.motivo ?? intento.notasRevision);
      registrar(intento.id, {});
      guardarBase(base);
      return correcto(accion, solicitud, { intentoId: intento.id, estado: intento.estado } as T);
    }

    case "listLogs":
      return correcto(accion, solicitud, { entradas: [], total: 0, nivelMinimo: "info" } as T);

    case "getMetrics":
      return correcto(accion, solicitud, { acciones: [], muestras: 0, habilitadas: false } as T);

    case "pruneLogs":
      return correcto(accion, solicitud, { borrado: { registro: 0, metricas: 0 }, conservar: 0 } as T);

    default:
      return fallo(accion, solicitud, "UNSUPPORTED_ACTION", `El modo demostración no implementa «${accion}».`, {
        pista: "Cambia a Apps Script en Evaluaciones → Conexión para usar el backend completo.",
      });
  }
}

/* ------------------------------- Proyecciones ----------------------------- */

function restantes(intento: Intento): number | null {
  if (!intento.limiteEn) return null;
  return Math.max(0, Math.round((Date.parse(intento.limiteEn) - Date.now()) / 1000));
}

function transcurridos(intento: Intento): number {
  const inicio = Date.parse(intento.iniciadoEn);
  if (!Number.isFinite(inicio)) return intento.segundosUsados;
  let hasta = Date.now();
  const limite = intento.limiteEn ? Date.parse(intento.limiteEn) : NaN;
  if (Number.isFinite(limite) && hasta > limite) hasta = limite;
  return Math.max(0, Math.round((hasta - inicio) / 1000));
}

function pruebaPublica(snapshot: { evaluacion: Evaluacion; secciones: Seccion[] }, semilla: string) {
  const { evaluacion, secciones } = snapshot;
  void semilla;
  return {
    codigo: evaluacion.codigo,
    titulo: evaluacion.titulo,
    descripcion: evaluacion.descripcion,
    instrucciones: evaluacion.instrucciones,
    versionEtiqueta: evaluacion.versionEtiqueta,
    totalPreguntas: secciones.flatMap((s) => s.preguntas).filter((p) => tipoSpec(p.tipo)?.kind === "pregunta").length,
    aplicacion: {
      duracionMinutos: evaluacion.aplicacion.duracionMinutos,
      navegacion: evaluacion.aplicacion.navegacion,
      permitirRetroceso: evaluacion.aplicacion.permitirRetroceso,
      mostrarProgreso: evaluacion.aplicacion.mostrarProgreso,
      autoenviarAlExpirar: evaluacion.aplicacion.autoenviarAlExpirar,
      guardadoAutomaticoSegundos: evaluacion.aplicacion.guardadoAutomaticoSegundos,
    },
    participante: {
      campos: evaluacion.participante.campos,
      requiereConsentimiento: evaluacion.participante.requiereConsentimiento,
      textoConsentimiento: evaluacion.participante.textoConsentimiento,
      visibilidadResultado: evaluacion.participante.visibilidadResultado,
    },
    integridad: evaluacion.integridad,
    tema: evaluacion.tema,
    // Proyección pública: se construye campo por campo, igual que en el servidor,
    // para que la clave de respuestas no salga ni por descuido.
    secciones: secciones.map((seccion) => ({
      id: seccion.id,
      titulo: seccion.titulo,
      descripcion: seccion.descripcion,
      limiteSegundos: seccion.limiteSegundos,
      preguntas: seccion.preguntas.map((pregunta) => ({
        id: pregunta.id,
        tipo: pregunta.tipo,
        enunciado: pregunta.enunciado,
        ayuda: pregunta.ayuda,
        obligatoria: pregunta.obligatoria,
        configuracion: pregunta.configuracion,
        medios: pregunta.medios,
        accesibilidad: pregunta.accesibilidad,
        ...(pregunta.modoPuntaje !== "ninguno" && pregunta.puntos > 0 ? { puntos: pregunta.puntos } : {}),
        opciones: pregunta.opciones.map((opcion) => ({
          id: opcion.id,
          valor: opcion.valor,
          texto: opcion.texto,
          ...(opcion.imagenUrl ? { imagenUrl: opcion.imagenUrl } : {}),
          ...(opcion.grupo ? { grupo: opcion.grupo } : {}),
        })),
      })),
    })),
  };
}

function textoDeRespuesta(pregunta: Pregunta, opciones: string[], valor: unknown): string {
  const spec = tipoSpec(pregunta.tipo);
  const porId = new Map(pregunta.opciones.map((o) => [o.id, richToPlain(o.texto)]));
  if (spec?.expects === "opcion" || spec?.expects === "opciones") {
    return opciones.map((id) => porId.get(id) ?? id).join(" · ");
  }
  if (spec?.expects === "orden" && Array.isArray(valor)) {
    return (valor as string[]).map((id, i) => `${i + 1}. ${porId.get(id) ?? id}`).join(" | ");
  }
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    return Object.entries(valor as Record<string, unknown>)
      .map(([clave, v]) => `${porId.get(clave) ?? clave} → ${Array.isArray(v) ? v.join(", ") : String(v)}`)
      .join(" | ");
  }
  if (Array.isArray(valor)) return valor.join(", ");
  return valor === null || valor === undefined ? "" : String(valor);
}

function detalleRespuesta(pregunta: Pregunta, fila: RespuestaGuardada | undefined): RespuestaDetalle {
  const elegidas = new Set(fila?.opciones ?? []);
  const claves: string[] = [];
  for (const opcion of pregunta.opciones) {
    if (opcion.correcta) claves.push(richToPlain(opcion.texto));
    else if (opcion.claveEmparejamiento) {
      claves.push(`${richToPlain(opcion.texto)} → ${opcion.claveEmparejamiento}`);
    }
  }
  if (pregunta.respuestaEsperada?.huecos) {
    for (const hueco of pregunta.respuestaEsperada.huecos) {
      claves.push(`${hueco.clave}: ${hueco.respuestas.join(" / ")}`);
    }
  } else if (pregunta.respuestaEsperada?.valor !== undefined) {
    claves.push(String(pregunta.respuestaEsperada.valor));
  }
  return {
    preguntaId: pregunta.id,
    tipo: pregunta.tipo,
    orden: pregunta.orden,
    respondida: !!fila?.respondidaEn,
    respondidaEn: fila?.respondidaEn ?? "",
    opcionesElegidas: fila?.opciones ?? [],
    valor: fila?.valor ?? null,
    valorTexto: fila?.valorTexto ?? "",
    correcta: fila?.correcta ?? null,
    puntosObtenidos: fila?.puntosObtenidos ?? null,
    puntosPosibles: fila?.puntosPosibles ?? (pregunta.modoPuntaje === "ninguno" ? 0 : pregunta.puntos),
    requiereRevision: fila?.requiereRevision ?? false,
    comentarioRevisor: fila?.comentarioRevisor ?? "",
    segundosEnPregunta: fila?.segundos ?? 0,
    visitas: fila?.visitas ?? 0,
    cambios: fila?.cambios ?? 0,
    enunciado: pregunta.enunciado,
    enunciadoTexto: richToPlain(pregunta.enunciado),
    ayudaTexto: isRichEmpty(pregunta.ayuda) ? "" : richToPlain(pregunta.ayuda),
    obligatoria: pregunta.obligatoria,
    modoPuntaje: pregunta.modoPuntaje,
    competencia: pregunta.competencia,
    opciones: pregunta.opciones.map((opcion) => ({
      id: opcion.id,
      texto: richToPlain(opcion.texto),
      valor: opcion.valor,
      elegida: elegidas.has(opcion.id),
      correcta: opcion.correcta,
      puntos: opcion.puntos,
      claveEmparejamiento: opcion.claveEmparejamiento,
      grupo: opcion.grupo,
    })),
    claveTexto: claves.join(" | "),
  };
}

/** Pesos de los eventos: réplica de `EV_EVENTOS` en 15_Integrity.gs. */
const PESOS: Record<string, { severidad: EventoIntegridad["severidad"]; peso: number }> = {
  reconexion: { severidad: "aviso", peso: 2 },
  pantalla_completa_off: { severidad: "aviso", peso: 3 },
  foco_perdido: { severidad: "aviso", peso: 2 },
  pestana_oculta: { severidad: "alerta", peso: 6 },
  copiar: { severidad: "aviso", peso: 3 },
  cortar: { severidad: "aviso", peso: 3 },
  pegar: { severidad: "alerta", peso: 8 },
  menu_contextual: { severidad: "aviso", peso: 1 },
  impresion: { severidad: "alerta", peso: 8 },
  captura_sospechosa: { severidad: "alerta", peso: 6 },
  inactividad: { severidad: "aviso", peso: 2 },
  ausencia_prolongada: { severidad: "alerta", peso: 10 },
  recarga: { severidad: "aviso", peso: 4 },
  salida_intentada: { severidad: "aviso", peso: 2 },
};

function registrarEventos(base: Base, intento: Intento, entrantes: Record<string, unknown>[]): void {
  const yaVistas = new Set(base.eventos.filter((e) => e.intentoId === intento.id).map((e) => e.secuencia));
  for (const cruda of entrantes) {
    const secuencia = Number(cruda.secuencia ?? 0);
    if (!secuencia || yaVistas.has(secuencia)) continue;
    const tipo = String(cruda.tipo ?? "");
    const catalogo = PESOS[tipo] ?? { severidad: "info" as const, peso: 0 };
    yaVistas.add(secuencia);
    base.eventos.push({
      id: newId("evt"),
      intentoId: intento.id,
      secuencia,
      tipo,
      severidad: catalogo.severidad,
      preguntaId: String(cruda.preguntaId ?? ""),
      ocurridoEn: String(cruda.ocurridoEn ?? ahora()),
      segundosDesdeInicio: Number(cruda.segundosDesdeInicio ?? 0),
      duracionMs: Number(cruda.duracionMs ?? 0),
      detalle: (cruda.detalle ?? {}) as Record<string, unknown>,
    });
  }
  const propios = base.eventos.filter((e) => e.intentoId === intento.id);
  let riesgo = 0;
  let pegados = 0;
  let fuera = 0;
  const porSeveridad = { info: 0, aviso: 0, alerta: 0 };
  const porTipo: Record<string, number> = {};
  for (const evento of propios) {
    const catalogo = PESOS[evento.tipo] ?? { severidad: "info" as const, peso: 0 };
    riesgo += catalogo.peso;
    porSeveridad[evento.severidad] += 1;
    porTipo[evento.tipo] = (porTipo[evento.tipo] ?? 0) + 1;
    if (evento.tipo === "pegar") pegados += Number(evento.detalle.caracteres ?? 0);
    if (evento.tipo === "pestana_oculta" || evento.tipo === "foco_perdido" || evento.tipo === "ausencia_prolongada") {
      fuera += Math.round(evento.duracionMs / 1000);
    }
  }
  riesgo += Math.min(40, Math.floor(pegados / 50));
  riesgo += Math.min(25, Math.floor(fuera / 20));
  riesgo = Math.max(0, Math.min(100, Math.round(riesgo)));
  const umbral = 5;
  const nivel = porSeveridad.alerta >= umbral || riesgo >= 40 ? "alto" : porSeveridad.alerta > 0 || riesgo >= 12 ? "medio" : "bajo";
  intento.eventosIntegridad = propios.length;
  intento.riesgoIntegridad = riesgo;
  intento.resumenIntegridad = {
    riesgo,
    nivel,
    total: propios.length,
    porSeveridad,
    porTipo,
    caracteresPegados: pegados,
    segundosFueraDeFoco: fuera,
    vecesFueraDeFoco: propios.filter((e) => e.tipo === "pestana_oculta" || e.tipo === "foco_perdido").length,
  };
}

function cronologia(intento: Intento, eventos: EventoIntegridad[]) {
  const hitos = [
    { segundos: 0, tipo: "inicio", severidad: "info" as const, texto: "Inició la evaluación", ocurridoEn: intento.iniciadoEn },
    ...eventos
      .filter((e) => e.tipo !== "envio_manual" && e.tipo !== "envio_automatico")
      .map((e) => ({
        segundos: e.segundosDesdeInicio,
        tipo: e.tipo,
        severidad: e.severidad,
        preguntaId: e.preguntaId,
        duracionMs: e.duracionMs,
        detalle: e.detalle,
        texto: textoEvento(e),
        ocurridoEn: e.ocurridoEn,
      })),
  ];
  if (intento.enviadoEn) {
    const ultimo = hitos.reduce((max, h) => Math.max(max, h.segundos), 0);
    hitos.push({
      segundos: Math.max(intento.segundosUsados, ultimo),
      tipo: intento.envioAutomatico ? "envio_automatico" : "envio_manual",
      severidad: "info" as const,
      texto: intento.envioAutomatico ? "Se envió automáticamente al agotarse el tiempo" : "Envió la evaluación",
      ocurridoEn: intento.enviadoEn,
    });
  }
  return hitos.sort((a, b) => a.segundos - b.segundos);
}

function textoEvento(evento: EventoIntegridad): string {
  const segundos = evento.duracionMs > 0 ? Math.round(evento.duracionMs / 1000) : 0;
  switch (evento.tipo) {
    case "pestana_oculta":
      return segundos > 0 ? `Salió de la pestaña durante ${segundos} s` : "Salió de la pestaña de la evaluación";
    case "pestana_visible":
      return "Volvió a la pestaña de la evaluación";
    case "foco_perdido":
      return segundos > 0 ? `La ventana perdió el foco ${segundos} s` : "La ventana perdió el foco";
    case "pegar":
      return `Pegó texto${evento.detalle.caracteres ? ` (${evento.detalle.caracteres} caracteres)` : ""}`;
    case "copiar":
      return "Copió texto de la evaluación";
    case "menu_contextual":
      return "Abrió el menú contextual";
    case "recarga":
      return "Recargó la página";
    case "salida_intentada":
      return "Intentó cerrar o abandonar la página";
    case "pregunta_vista":
      return "Abrió una pregunta";
    case "pregunta_respondida":
      return "Respondió una pregunta";
    case "guardado":
      return "Se guardó el progreso";
    default:
      return evento.tipo;
  }
}

function resumenCola(intentos: Intento[]) {
  const notas = intentos.filter((i) => i.estado !== "anulado" && typeof i.nota === "number").map((i) => i.nota as number);
  const ordenadas = [...notas].sort((a, b) => a - b);
  const conVeredicto = intentos.filter((i) => i.estado !== "anulado" && i.aprobado !== null);
  const duraciones = intentos.filter((i) => i.segundosUsados > 0).map((i) => i.segundosUsados);
  return {
    total: intentos.length,
    enCurso: intentos.filter((i) => i.estado === "en_curso").length,
    enviados: intentos.filter((i) => i.estado === "enviado").length,
    expirados: intentos.filter((i) => i.estado === "expirado").length,
    anulados: intentos.filter((i) => i.estado === "anulado").length,
    pendientesRevision: intentos.filter((i) => i.estadoCalificacion === "pendiente_revision").length,
    conNota: notas.length,
    notaPromedio: notas.length > 0 ? redondear(notas.reduce((a, b) => a + b, 0) / notas.length, 2) : null,
    notaMediana:
      ordenadas.length === 0
        ? null
        : ordenadas.length % 2 === 1
          ? ordenadas[(ordenadas.length - 1) / 2]
          : redondear((ordenadas[ordenadas.length / 2 - 1] + ordenadas[ordenadas.length / 2]) / 2, 2),
    notaMinima: ordenadas[0] ?? null,
    notaMaxima: ordenadas[ordenadas.length - 1] ?? null,
    tasaAprobacion:
      conVeredicto.length > 0
        ? redondear((conVeredicto.filter((i) => i.aprobado === true).length / conVeredicto.length) * 100, 2)
        : null,
    aprobados: conVeredicto.filter((i) => i.aprobado === true).length,
    conVeredicto: conVeredicto.length,
    riesgoAlto: intentos.filter((i) => (i.resumenIntegridad as { nivel?: string }).nivel === "alto").length,
    duracionPromedioSegundos:
      duraciones.length > 0 ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null,
  };
}

function resultadoCandidato(intento: Intento, evaluacion: Evaluacion, repetido: boolean) {
  const visibilidad = evaluacion.participante.visibilidadResultado;
  const base = {
    intentoId: intento.id,
    evaluacion: evaluacion.titulo,
    estado: intento.estado,
    enviadoEn: intento.enviadoEn,
    envioAutomatico: intento.envioAutomatico,
    repetido,
    respuestasRegistradas: intento.correctas + intento.incorrectas,
    calificacionPendiente: intento.estadoCalificacion === "pendiente_revision",
    segundosUsados: intento.segundosUsados,
  };
  if (visibilidad === "nada" || visibilidad === "solo_envio") return base;
  const conNota = { ...base, nota: intento.nota, aprobado: intento.aprobado };
  if (visibilidad === "nota") return conNota;
  return {
    ...conNota,
    puntosObtenidos: intento.puntosObtenidos,
    puntosPosibles: intento.puntosPosibles,
    correctas: intento.correctas,
    incorrectas: intento.incorrectas,
    sinResponder: intento.sinResponder,
  };
}

/** Documento vacío exportado para las pruebas del renderizador. */
export const DOCUMENTO_VACIO: RichDoc = emptyRichDoc();
