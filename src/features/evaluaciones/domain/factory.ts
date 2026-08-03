/**
 * Constructores y valores por omisión.
 *
 * Cuando el autor inserta una pregunta, lo que aparece debe ser algo que ya se
 * puede usar: un tipo con sus opciones creadas, su modo de puntaje razonable y su
 * configuración inicial. El módulo anterior insertaba bloques vacíos que había que
 * configurar desde cero, y esa fricción es la diferencia entre un editor que se
 * usa y uno que se abandona.
 */

import { newId } from "../../../shared/ids";
import { emptyRichDoc, richFromPlain, type RichDoc } from "./richText";
import { esAutoCalificable, tipoSpec, type ModoPuntaje } from "./questionTypes";
import type { Opcion, Pregunta, Seccion } from "./model";

export function nuevaOpcion(orden: number, texto = "", extra: Partial<Opcion> = {}): Opcion {
  return {
    id: newId("op"),
    texto: texto ? richFromPlain(texto) : emptyRichDoc(),
    valor: `v${orden + 1}`,
    orden,
    correcta: false,
    puntos: 0,
    claveEmparejamiento: "",
    grupo: "",
    imagenUrl: "",
    retroalimentacion: "",
    ...extra,
  };
}

/**
 * Opciones iniciales de un tipo.
 *
 * Verdadero/falso y sí/no/NA llegan con sus etiquetas puestas: son las dos veces
 * en que el contenido de la opción no depende de la pregunta, y escribirlas a mano
 * cada vez es trabajo tonto.
 */
function opcionesIniciales(tipo: string): Opcion[] {
  const spec = tipoSpec(tipo);
  if (!spec) return [];

  if (tipo === "verdadero_falso") {
    return [
      nuevaOpcion(0, "Verdadero", { correcta: true, valor: "verdadero" }),
      nuevaOpcion(1, "Falso", { valor: "falso" }),
    ];
  }
  if (tipo === "si_no_na") {
    return [
      nuevaOpcion(0, "Sí", { valor: "si" }),
      nuevaOpcion(1, "No", { valor: "no" }),
      nuevaOpcion(2, "No aplica", { valor: "na" }),
    ];
  }
  if (tipo === "casilla_aceptacion") {
    return [nuevaOpcion(0, "Acepto", { correcta: true, valor: "acepto" })];
  }

  const cuantas = spec.opcionesIniciales ?? 0;
  const etiqueta = spec.expects === "matriz" ? "Fila" : "Opción";
  return Array.from({ length: cuantas }, (_, i) => nuevaOpcion(i, `${etiqueta} ${i + 1}`));
}

/** Modo de puntaje inicial de un tipo. */
function modoInicial(tipo: string): ModoPuntaje {
  const spec = tipoSpec(tipo);
  if (!spec || spec.kind !== "pregunta") return "ninguno";
  return spec.scoring;
}

export function nuevaPregunta(tipo: string, seccionId: string, orden: number): Pregunta {
  const spec = tipoSpec(tipo);
  const esPregunta = spec?.kind === "pregunta";
  return {
    id: newId("pr"),
    seccionId,
    tipo,
    orden,
    enunciado: enunciadoInicial(tipo),
    ayuda: emptyRichDoc(),
    obligatoria: esPregunta,
    modoPuntaje: modoInicial(tipo),
    puntos: esPregunta && modoInicial(tipo) !== "ninguno" ? 1 : 0,
    penalizacion: 0,
    competencia: "",
    codigo: "",
    respuestaEsperada: tipo === "rellenar_huecos" ? { huecos: [] } : null,
    configuracion: { ...(spec?.configuracion ?? {}) },
    validacion: {},
    retroalimentacion: {},
    medios: null,
    accesibilidad: {},
    etiquetas: [],
    opciones: opcionesIniciales(tipo),
  };
}

/**
 * Enunciado inicial.
 *
 * Los bloques de contenido llegan con un texto de ejemplo porque un título vacío
 * es invisible en el lienzo; las preguntas llegan vacías porque el autor va a
 * escribir de inmediato y un texto de relleno solo estorba.
 */
function enunciadoInicial(tipo: string): RichDoc {
  switch (tipo) {
    case "contenido_titulo":
      return richFromPlain("Nuevo apartado");
    case "contenido_parrafo":
      return richFromPlain("Escribe aquí la explicación o el caso.");
    case "contenido_aviso":
      return richFromPlain("Importante: lee esta indicación antes de continuar.");
    case "contenido_separador":
      return emptyRichDoc();
    case "rellenar_huecos":
      return richFromPlain("Completa: la razón ___ mide la ___ de la empresa.");
    default:
      return emptyRichDoc();
  }
}

export function nuevaSeccion(orden: number, titulo = ""): Seccion {
  return {
    id: newId("sc"),
    titulo: titulo || `Sección ${orden + 1}`,
    descripcion: emptyRichDoc(),
    orden,
    limiteSegundos: null,
    mezclar: false,
    tomarN: null,
    peso: 1,
    preguntas: [],
  };
}

/** Copia profunda de una pregunta con identificadores nuevos. */
export function duplicarPregunta(pregunta: Pregunta, orden: number): Pregunta {
  return {
    ...structuredClone(pregunta),
    id: newId("pr"),
    orden,
    opciones: pregunta.opciones.map((opcion, i) => ({
      ...structuredClone(opcion),
      id: newId("op"),
      orden: i,
    })),
  };
}

/** Copia profunda de una sección con identificadores nuevos. */
export function duplicarSeccion(seccion: Seccion, orden: number): Seccion {
  const nueva: Seccion = {
    ...structuredClone(seccion),
    id: newId("sc"),
    orden,
    titulo: `${seccion.titulo} (copia)`,
    preguntas: [],
  };
  nueva.preguntas = seccion.preguntas.map((pregunta, i) => ({
    ...duplicarPregunta(pregunta, i),
    seccionId: nueva.id,
  }));
  return nueva;
}

/**
 * Estimación de la duración de la prueba, en minutos.
 *
 * No pretende ser exacta: pretende evitar el error más común al configurar una
 * evaluación, que es poner diez minutos para cuarenta preguntas. Se estima por
 * tipo y se suma el tiempo de lectura del enunciado.
 */
const SEGUNDOS_POR_TIPO: Record<string, number> = {
  texto_corto: 40,
  texto_largo: 180,
  codigo: 300,
  correo: 25,
  telefono: 25,
  enlace: 30,
  numero: 45,
  decimal: 60,
  porcentaje: 45,
  moneda: 50,
  fecha: 20,
  hora: 20,
  fecha_hora: 25,
  duracion: 25,
  opcion_unica: 35,
  opcion_multiple: 55,
  desplegable: 30,
  verdadero_falso: 20,
  si_no_na: 20,
  casilla_aceptacion: 10,
  opcion_imagen: 40,
  escala_lineal: 20,
  estrellas: 15,
  deslizador: 20,
  cuadricula_opcion: 90,
  cuadricula_casillas: 110,
  likert: 90,
  ordenar: 75,
  emparejar: 90,
  clasificar: 90,
  rellenar_huecos: 70,
  archivo_enlace: 60,
};

/** Palabras por minuto de lectura atenta de un texto técnico. */
const PALABRAS_POR_MINUTO = 180;

export function estimarMinutos(secciones: Seccion[]): number {
  let segundos = 0;
  for (const seccion of secciones) {
    for (const pregunta of seccion.preguntas) {
      const spec = tipoSpec(pregunta.tipo);
      const palabras = contarPalabras(pregunta.enunciado) + contarPalabras(pregunta.ayuda);
      segundos += (palabras / PALABRAS_POR_MINUTO) * 60;
      if (spec?.kind !== "pregunta") continue;
      segundos += SEGUNDOS_POR_TIPO[pregunta.tipo] ?? 45;
      // Cada opción añade lectura.
      segundos += pregunta.opciones.length * 4;
    }
  }
  return Math.max(1, Math.ceil(segundos / 60));
}

function contarPalabras(doc: RichDoc): number {
  let total = 0;
  for (const bloque of doc.b) {
    for (const span of bloque.s) {
      total += span.x.split(/\s+/).filter(Boolean).length;
    }
  }
  return total;
}

/** Preguntas, calificables y puntos de un documento. Réplica de `evCountContent_`. */
export function contarContenido(secciones: Seccion[]): {
  preguntas: number;
  calificables: number;
  puntos: number;
  manuales: number;
} {
  let preguntas = 0;
  let calificables = 0;
  let puntos = 0;
  let manuales = 0;
  for (const seccion of secciones) {
    for (const pregunta of seccion.preguntas) {
      const spec = tipoSpec(pregunta.tipo);
      if (spec?.kind !== "pregunta") continue;
      preguntas += 1;
      if (pregunta.modoPuntaje !== "ninguno") puntos += pregunta.puntos;
      const auto = esAutoCalificable(
        pregunta.tipo,
        pregunta.modoPuntaje,
        pregunta.respuestaEsperada,
        pregunta.opciones,
      );
      if (auto) calificables += 1;
      else if (pregunta.modoPuntaje !== "ninguno" && pregunta.puntos > 0) manuales += 1;
    }
  }
  return { preguntas, calificables, puntos: Math.round(puntos * 1000) / 1000, manuales };
}
