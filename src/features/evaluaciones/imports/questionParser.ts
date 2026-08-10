/**
 * Analizador de bancos de preguntas escritos en prosa (Word y PDF).
 *
 * ── El formato real, que es el que manda ─────────────────────────────────────
 * Las pruebas del equipo llegan así:
 *
 *     1. Según las NOGAI, el propósito principal de la auditoría interna es:
 *     A) Elaborar estados financieros.
 *     B) Detectar únicamente hechos de fraude.
 *     C) Evaluar y mejorar los procesos de control, gestión de riesgos y gobierno.
 *     D) Sustituir los controles operativos.
 *
 *     2. De acuerdo con el Reglamento de Control Interno y Auditores Internos de
 *     la ASFI, la Unidad de Auditoría Interna debe depender:
 *     …
 *
 *     16. Durante la auditoría de fideicomisos se observa lo siguiente:
 *     • Existen procedimientos documentados.
 *     • Los controles no dejan evidencia de su ejecución.
 *     ¿Cuál es la conclusión técnicamente más adecuada?
 *     A. El control interno es efectivo porque existen procedimientos.
 *     …
 *
 * ── Por qué la heurística anterior no servía ─────────────────────────────────
 * La versión anterior decidía línea a línea con tres reglas: número al principio o
 * «?» al final es pregunta; letra con paréntesis, guion o viñeta es opción; el
 * resto, párrafo suelto. Sobre el documento de arriba eso produce un desastre
 * concreto y verificable:
 *
 *   · el enunciado de la 2, que ocupa dos líneas, se parte: la segunda mitad se
 *     convierte en un párrafo suelto y la pregunta queda a medias;
 *   · las opciones largas también se parten y la mitad de la C se pierde;
 *   · las viñetas del caso 16 se convierten en OPCIONES, porque la regla mira el
 *     guion y no el contexto;
 *   · «¿Cuál es la conclusión técnicamente más adecuada?» abre una pregunta NUEVA
 *     —acaba en «?»— y el caso se queda sin su pregunta;
 *   · y la clave de respuestas no se detecta nunca, así que las cuarenta claves
 *     hay que marcarlas a mano.
 *
 * ── Cómo funciona ahora ──────────────────────────────────────────────────────
 * Dos pasadas. La primera CLASIFICA cada línea (sección, inicio de pregunta,
 * opción con letra, viñeta, clave de respuestas, texto). La segunda AGRUPA en
 * preguntas y decide qué es cada cosa con el contexto delante:
 *
 *   · un número solo abre pregunta si CONTINÚA la numeración (tras la 7 viene la
 *     8, no la 2026 de una fecha ni el 1 de una enumeración interna);
 *   · una letra solo abre opción si es la que toca (A, luego B, luego C…), lo que
 *     evita convertir «A partir de la norma…» en la opción A;
 *   · una línea suelta CONTINÚA lo último abierto —el enunciado o la última
 *     opción— en lugar de convertirse en un bloque nuevo;
 *   · las viñetas son parte del enunciado cuando la pregunta tiene opciones con
 *     letra, y son las opciones cuando no las tiene;
 *   · una línea que acaba en «?» dentro de una pregunta que aún no tiene opciones
 *     es el remate del enunciado, no una pregunta nueva.
 *
 * ── Y la clave de respuestas, que es el dato que más trabajo ahorra ──────────
 * Se reconoce por tres vías, en este orden de confianza:
 *
 *   1. el FORMATO: en los `.docx` del equipo la correcta va subrayada o
 *      resaltada, y esa marca llega hasta aquí (ver `docxTexto.ts`);
 *   2. un MARCADOR explícito en el texto: `*`, `(correcta)`, `[X]`, `✔`;
 *   3. una TABLA DE RESPUESTAS al final del documento («Respuestas: 1-C, 2-C…»).
 *
 * Cuando ninguna de las tres aparece —el caso de un PDF, donde el subrayado es
 * un rectángulo dibujado y no un atributo del texto— el analizador lo DICE en su
 * informe y el panel de importación pide las claves con un selector A/B/C/D. No
 * inventa ninguna: una clave equivocada es peor que una clave ausente.
 */

import { newId } from "../../../shared/ids";
import { nuevaOpcion, nuevaPregunta, nuevaSeccion } from "../domain/factory";
import { emptyRichDoc, type RichDoc, type RichMark } from "../domain/richText";
import type { Opcion, Pregunta, Seccion } from "../domain/model";
import type { LineaDocumento, TramoTexto } from "./docxTexto";

/* ------------------------------- Resultado -------------------------------- */

export type OrigenClave = "formato" | "marcador" | "tabla" | "ninguna";

export interface InformePregunta {
  preguntaId: string;
  seccionId: string;
  /** Número que traía el documento, si lo traía. */
  numero: number | null;
  enunciado: string;
  opciones: string[];
  /** Índice de la opción marcada como correcta, o -1. */
  correcta: number;
  origenClave: OrigenClave;
  tipo: string;
  avisos: string[];
}

export interface ResultadoAnalisis {
  secciones: Seccion[];
  informe: InformePregunta[];
  avisos: string[];
  /** Cuántas preguntas quedaron sin clave: es el trabajo que queda por hacer. */
  sinClave: number;
}

/* ------------------------------ Clasificación ----------------------------- */

type Clase =
  | { tipo: "seccion"; titulo: string }
  | { tipo: "pregunta"; numero: number | null; texto: string }
  | { tipo: "opcion"; letra: string; texto: string }
  | { tipo: "vineta"; texto: string }
  | { tipo: "tablaRespuestas" }
  | { tipo: "texto"; texto: string };

const RE_SECCION = /^(?:secci[oó]n|bloque|m[oó]dulo|parte|[aá]rea|tema)\s*[:\-.]?\s*(.{2,80})$/i;
const RE_PREGUNTA_NUMERO = /^(?:pregunta\s*)?(\d{1,3})\s*[).\-–:]\s*(.+)$/i;
const RE_PREGUNTA_ETIQUETA = /^(?:pregunta|p)\s*(\d{1,3})\s*[).\-–:]?\s*(.+)$/i;
const RE_OPCION = /^\(?([a-hA-H])\)?\s*[).\-–:]\s*(.+)$/;
const RE_VINETA = /^[•·▪◦*\-–—+]\s+(.+)$/;
const RE_TABLA_RESPUESTAS = /^(?:clave|claves|respuestas?|hoja\s+de\s+respuestas|solucionario)\b[\s:]*$/i;
const RE_PUNTOS = /[([]\s*(\d+(?:[.,]\d+)?)\s*(?:puntos?|pts?|p)\s*[)\]]\s*$/i;

/** Marcadores que el autor escribe para señalar la correcta. */
const RE_MARCADOR_CORRECTA =
  /(\s*\*+\s*$)|(\s*\((?:correcta|correcto|clave|respuesta)\)\s*$)|(\s*\[\s*[xX✓✔]\s*\]\s*)|(\s*[✓✔☑]\s*$)|(\s*<-+\s*$)|(\s*←\s*$)/;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Quita ligaduras tipográficas que dejan los PDF («ﬁ» → «fi»). */
export function limpiarTipografia(texto: string): string {
  return texto
    .replace(/\ufb00/g, "ff")
    .replace(/\ufb01/g, "fi")
    .replace(/\ufb02/g, "fl")
    .replace(/\ufb03/g, "ffi")
    .replace(/\ufb04/g, "ffl")
    .replace(/\u00ad/g, "")
    .replace(/\u2019/g, "'")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clasificar(linea: LineaDocumento): Clase {
  const texto = limpiarTipografia(linea.texto);
  if (!texto) return { tipo: "texto", texto: "" };

  if (RE_TABLA_RESPUESTAS.test(texto)) return { tipo: "tablaRespuestas" };

  const seccion = RE_SECCION.exec(texto);
  if (seccion && !RE_OPCION.test(texto)) return { tipo: "seccion", titulo: seccion[1].trim() };
  // Un párrafo con estilo de título es una sección aunque no diga «Sección».
  if (linea.titulo && texto.length <= 90) return { tipo: "seccion", titulo: texto };

  const etiquetada = RE_PREGUNTA_ETIQUETA.exec(texto);
  if (etiquetada && /^p/i.test(texto)) {
    return { tipo: "pregunta", numero: Number(etiquetada[1]), texto: etiquetada[2].trim() };
  }
  const numerada = RE_PREGUNTA_NUMERO.exec(texto);
  if (numerada) return { tipo: "pregunta", numero: Number(numerada[1]), texto: numerada[2].trim() };

  const opcion = RE_OPCION.exec(texto);
  if (opcion) return { tipo: "opcion", letra: opcion[1].toUpperCase(), texto: opcion[2].trim() };

  const vineta = RE_VINETA.exec(texto);
  if (vineta || linea.lista) {
    return { tipo: "vineta", texto: (vineta ? vineta[1] : texto).trim() };
  }

  return { tipo: "texto", texto };
}

/* --------------------------- Tabla de respuestas -------------------------- */

/**
 * Lee una tabla de respuestas suelta.
 *
 * Admite las formas que la gente escribe de verdad: «1-C», «1. C», «1) c»,
 * «1: C», y varias en la misma línea separadas por comas o espacios. Devuelve un
 * mapa de número de pregunta a letra.
 */
export function leerTablaRespuestas(lineas: string[]): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const linea of lineas) {
    const texto = limpiarTipografia(linea);
    for (const par of texto.matchAll(/(\d{1,3})\s*[).\-–:=]?\s*([a-hA-H])(?![a-zA-Z])/g)) {
      const numero = Number(par[1]);
      if (numero > 0 && numero < 500) mapa.set(numero, par[2].toUpperCase());
    }
  }
  return mapa;
}

/* ------------------------------ Texto enriquecido ------------------------- */

/**
 * Tramos con formato → documento enriquecido.
 *
 * El subrayado NO se traslada como formato en las opciones: en estos documentos
 * significa «esta es la correcta», y arrastrarlo dejaría la respuesta correcta
 * subrayada delante del candidato. En el enunciado sí se conserva, porque ahí es
 * énfasis.
 */
function richDeTramos(tramos: TramoTexto[], opciones: { conservarSubrayado: boolean }): RichDoc {
  const spans = tramos
    .map((tramo) => {
      const texto = limpiarTipografia(tramo.texto);
      if (!texto) return null;
      const marcas: RichMark[] = [];
      if (tramo.negrita) marcas.push("b");
      if (tramo.cursiva) marcas.push("i");
      if (tramo.subrayado && opciones.conservarSubrayado) marcas.push("u");
      if (tramo.tachado) marcas.push("s");
      return marcas.length > 0 ? { x: texto, m: marcas } : { x: texto };
    })
    .filter((span): span is { x: string; m?: RichMark[] } => span !== null);
  if (spans.length === 0) return emptyRichDoc();
  // Se une con espacios los tramos que el generador partió sin ellos.
  const unidos: typeof spans = [];
  for (const span of spans) {
    const previo = unidos[unidos.length - 1];
    if (previo && !/\s$/.test(previo.x) && !/^[\s.,;:)]/.test(span.x)) previo.x += " ";
    unidos.push(span);
  }
  return { v: 1, b: [{ t: "p", s: unidos }] };
}

/**
 * Documento enriquecido a partir de varias líneas.
 *
 * Las líneas que son CONTINUACIÓN se unen al mismo párrafo. Un PDF corta el
 * enunciado donde acaba el renglón («…de la ASFI, la Unidad de» / «Auditoría
 * Interna debe depender:») y tratar cada renglón como un párrafo dejaría el
 * enunciado partido en el editor y en la prueba. La señal es simple y fiable: si
 * la línea anterior no acaba en signo de cierre, lo que sigue es la misma frase.
 *
 * Las viñetas conservan su bloque de lista, porque ahí el salto SÍ es estructura.
 */
function richDeLineas(lineas: LineaDocumento[]): RichDoc {
  const bloques: RichDoc["b"] = [];
  let anterior: LineaDocumento | null = null;
  for (const linea of lineas) {
    const doc = richDeTramos(linea.tramos.length > 0 ? linea.tramos : [{ texto: linea.texto }], {
      conservarSubrayado: true,
    });
    const propios = doc.b.filter((bloque) => bloque.s.length > 0);
    if (propios.length === 0) continue;
    const esLista = linea.lista === "ul" || linea.lista === "ol";
    const ultimo = bloques[bloques.length - 1];
    const continua =
      !!ultimo &&
      !esLista &&
      anterior !== null &&
      anterior.lista !== "ul" &&
      anterior.lista !== "ol" &&
      !/[.:;?!»)]$/.test(limpiarTipografia(anterior.texto));
    if (continua) {
      const spans = ultimo.s;
      const cola = spans[spans.length - 1];
      if (cola && !/\s$/.test(cola.x)) cola.x += " ";
      spans.push(...propios[0].s);
      bloques.push(...propios.slice(1));
    } else {
      bloques.push(...propios.map((bloque) => ({ ...bloque, t: esLista ? ("ul" as const) : bloque.t })));
    }
    anterior = linea;
  }
  return bloques.length > 0 ? { v: 1, b: bloques } : emptyRichDoc();
}

/**
 * Quita del final del documento un sufijo que ya se interpretó como dato.
 *
 * La anotación «(5 puntos)» pasa a ser el puntaje de la pregunta, así que no debe
 * quedarse también dentro del enunciado que ve el candidato.
 */
function quitarSufijo(doc: RichDoc, sufijo: string): RichDoc {
  const limpio = sufijo.trim();
  if (!limpio) return doc;
  const bloques = [...doc.b];
  const ultimo = bloques[bloques.length - 1];
  if (!ultimo || ultimo.s.length === 0) return doc;
  const spans = [...ultimo.s];
  const cola = spans[spans.length - 1];
  const indice = cola.x.lastIndexOf(limpio);
  if (indice < 0) return doc;
  const recortado = cola.x.slice(0, indice).replace(/\s+$/, "");
  spans[spans.length - 1] = { ...cola, x: recortado };
  bloques[bloques.length - 1] = { ...ultimo, s: spans.filter((span) => span.x.length > 0) };
  return { ...doc, b: bloques.filter((bloque) => bloque.s.length > 0) };
}

/** ¿Esta línea está subrayada o resaltada en su mayor parte? */
function marcadaPorFormato(tramos: TramoTexto[]): boolean {
  const total = tramos.reduce((suma, tramo) => suma + tramo.texto.trim().length, 0);
  if (total === 0) return false;
  const marcado = tramos.reduce(
    (suma, tramo) => suma + (tramo.subrayado || tramo.resaltado ? tramo.texto.trim().length : 0),
    0,
  );
  return marcado / total >= 0.6;
}

/* ------------------------------ Analizador -------------------------------- */

interface OpcionEnCurso {
  letra: string;
  lineas: LineaDocumento[];
  marcadorExplicito: boolean;
}

interface PreguntaEnCurso {
  numero: number | null;
  enunciado: LineaDocumento[];
  vinetas: LineaDocumento[];
  opciones: OpcionEnCurso[];
  puntos: number | null;
}

/** Siguiente letra esperada: A, B, C… */
function letraEsperada(cuantas: number): string {
  return String.fromCharCode(65 + cuantas);
}

/**
 * Analiza un documento ya extraído.
 *
 * `lineas` viene de `extraerLineasDocx` (con formato) o de `extraerLineasPdf`
 * (sin formato, convertido a `LineaDocumento` con tramos sin marcas).
 */
export function analizarPreguntas(lineas: LineaDocumento[]): ResultadoAnalisis {
  const avisos: string[] = [];
  const clasificadas = lineas.map((linea) => ({ linea, clase: clasificar(linea) }));

  /* --- Tabla de respuestas al final: se aparta antes de analizar el cuerpo --- */
  let corte = clasificadas.length;
  for (let i = 0; i < clasificadas.length; i += 1) {
    if (clasificadas[i].clase.tipo === "tablaRespuestas") {
      corte = i;
      break;
    }
  }
  const tabla =
    corte < clasificadas.length
      ? leerTablaRespuestas(clasificadas.slice(corte + 1).map((c) => c.linea.texto))
      : new Map<number, string>();
  if (tabla.size > 0) {
    avisos.push(`Se leyó una tabla de respuestas con ${tabla.size} clave(s) al final del documento.`);
  }
  const cuerpo = clasificadas.slice(0, corte);

  /* --- Agrupación --- */
  const grupos: { titulo: string; preguntas: PreguntaEnCurso[] }[] = [];
  let seccion: { titulo: string; preguntas: PreguntaEnCurso[] } | null = null;
  let pregunta: PreguntaEnCurso | null = null;
  let ultimoNumero = 0;

  const abrirSeccion = (titulo: string) => {
    seccion = { titulo, preguntas: [] };
    grupos.push(seccion);
    // La numeración suele reiniciarse en cada sección.
    ultimoNumero = 0;
    return seccion;
  };
  const seccionActual = () => seccion ?? abrirSeccion("Importadas");

  for (const { linea, clase } of cuerpo) {
    switch (clase.tipo) {
      case "seccion":
        abrirSeccion(clase.titulo);
        pregunta = null;
        continue;

      case "pregunta": {
        const numero = clase.numero;
        /**
         * Solo abre pregunta si la numeración AVANZA.
         *
         * Es la regla que distingue «17. El auditor detecta que…» —una pregunta— de
         * una enumeración dentro del enunciado («1. Existen procedimientos…», que
         * viene después de la 16 y por tanto no avanza) y de un «2026,» de una
         * fecha, que ni siquiera llega aquí porque la coma no separa. Al empezar una
         * sección nueva el contador se reinicia, así que una prueba numerada por
         * secciones (1–10, luego 1–8) también se lee bien.
         */
        const continua = numero === null || ultimoNumero === 0 || numero > ultimoNumero;
        if (!continua && pregunta) {
          empujarTexto(pregunta, conTexto(linea, linea.texto));
          continue;
        }
        pregunta = { numero, enunciado: [conTexto(linea, clase.texto)], vinetas: [], opciones: [], puntos: null };
        seccionActual().preguntas.push(pregunta);
        if (numero !== null) ultimoNumero = numero;
        continue;
      }

      case "opcion": {
        if (!pregunta) {
          // Una opción sin pregunta delante: se guarda como texto para no perderla.
          pregunta = { numero: null, enunciado: [], vinetas: [], opciones: [], puntos: null };
          seccionActual().preguntas.push(pregunta);
        }
        const esperada = letraEsperada(pregunta.opciones.length);
        const alternativa = letraEsperada(pregunta.opciones.length + 1);
        // Una «A)» cuando la pregunta ya tenía opciones significa que empezó otra
        // pregunta a la que no le detectamos el número. Abrirla aquí evita el fallo
        // más visible: una pregunta con ocho opciones que son en realidad dos
        // preguntas pegadas.
        if (clase.letra === "A" && pregunta.opciones.length >= 2) {
          pregunta = { numero: null, enunciado: [], vinetas: [], opciones: [], puntos: null };
          seccionActual().preguntas.push(pregunta);
        } else if (clase.letra !== esperada && clase.letra !== alternativa && clase.letra !== "A") {
          // No es la letra que toca: es texto que empieza por una letra y un punto.
          empujarTexto(pregunta, conTexto(linea, linea.texto));
          continue;
        }
        pregunta.opciones.push({
          letra: clase.letra,
          lineas: [conTexto(linea, clase.texto)],
          marcadorExplicito: false,
        });
        continue;
      }

      case "vineta": {
        if (!pregunta) {
          pregunta = { numero: null, enunciado: [], vinetas: [], opciones: [], puntos: null };
          seccionActual().preguntas.push(pregunta);
        }
        // Con opciones ya abiertas, una viñeta continúa la última opción; sin ellas,
        // es parte del caso que plantea el enunciado (y podría acabar siendo opción
        // si la pregunta nunca declara letras).
        if (pregunta.opciones.length > 0) {
          pregunta.opciones[pregunta.opciones.length - 1].lineas.push(conTexto(linea, clase.texto));
        } else {
          pregunta.vinetas.push({ ...conTexto(linea, clase.texto), lista: "ul" });
        }
        continue;
      }

      case "texto": {
        if (!clase.texto) continue;
        if (!pregunta) {
          // Texto antes de la primera pregunta: encabezado del documento. Se
          // conserva como contenido de la sección.
          const grupo = seccionActual();
          if (grupo.preguntas.length === 0) {
            grupo.titulo = grupo.titulo === "Importadas" && clase.texto.length <= 80 ? clase.texto : grupo.titulo;
          }
          continue;
        }
        empujarTexto(pregunta, conTexto(linea, clase.texto));
        continue;
      }

      default:
        continue;
    }
  }

  /* --- Construcción del modelo --- */
  const secciones: Seccion[] = [];
  const informe: InformePregunta[] = [];
  let sinClave = 0;
  let numeroGlobal = 0;

  for (const [indice, grupo] of grupos.entries()) {
    const destino = nuevaSeccion(indice, grupo.titulo);
    for (const enCurso of grupo.preguntas) {
      numeroGlobal += 1;
      const construida = construirPregunta(enCurso, destino.id, destino.preguntas.length, tabla);
      if (!construida) continue;
      destino.preguntas.push(construida.pregunta);
      informe.push({ ...construida.informe, seccionId: destino.id, numero: enCurso.numero ?? numeroGlobal });
      if (construida.informe.origenClave === "ninguna" && construida.informe.opciones.length > 0) sinClave += 1;
    }
    if (destino.preguntas.length > 0) secciones.push(destino);
  }

  if (informe.length === 0) {
    avisos.push(
      "No se reconoció ninguna pregunta. Comprueba que cada una empiece por su número («1.», «2.»…) y que las opciones empiecen por «A)», «B)»…",
    );
  }
  if (sinClave > 0) {
    avisos.push(
      `${sinClave} pregunta(s) quedaron sin respuesta correcta: el documento no la marcaba de ninguna forma reconocible. Márcalas abajo antes de crear el borrador.`,
    );
  }

  return { secciones, informe, avisos, sinClave };
}

/** Copia una línea cambiando su texto visible y recortando los tramos. */
function conTexto(linea: LineaDocumento, texto: string): LineaDocumento {
  if (linea.tramos.length === 0) return { ...linea, texto, tramos: [{ texto }] };
  // El texto puede haber perdido el prefijo («A) »); los tramos se recortan por la
  // izquierda para que el formato siga cuadrando con el texto que queda.
  const original = limpiarTipografia(linea.texto);
  const limpio = limpiarTipografia(texto);
  const quitar = Math.max(0, original.length - limpio.length);
  let restante = quitar;
  const tramos: TramoTexto[] = [];
  for (const tramo of linea.tramos) {
    const valor = tramo.texto;
    if (restante >= valor.length) {
      restante -= valor.length;
      continue;
    }
    tramos.push({ ...tramo, texto: restante > 0 ? valor.slice(restante) : valor });
    restante = 0;
  }
  return { ...linea, texto: limpio, tramos: tramos.length > 0 ? tramos : [{ texto: limpio }] };
}

/** Añade una línea suelta a lo último que esté abierto. */
function empujarTexto(pregunta: PreguntaEnCurso, linea: LineaDocumento): void {
  if (pregunta.opciones.length > 0) {
    pregunta.opciones[pregunta.opciones.length - 1].lineas.push(linea);
    return;
  }
  if (pregunta.vinetas.length > 0) {
    pregunta.vinetas.push(linea);
    return;
  }
  pregunta.enunciado.push(linea);
}

/** Une las líneas de un bloque en un solo texto legible. */
function unir(lineas: LineaDocumento[]): string {
  return limpiarTipografia(lineas.map((linea) => linea.texto).join(" "));
}

/** Fusiona los tramos de varias líneas en una sola secuencia. */
function tramosDe(lineas: LineaDocumento[]): TramoTexto[] {
  const tramos: TramoTexto[] = [];
  for (const [indice, linea] of lineas.entries()) {
    const propios = linea.tramos.length > 0 ? linea.tramos : [{ texto: linea.texto }];
    if (indice > 0) tramos.push({ texto: " " });
    tramos.push(...propios);
  }
  return tramos;
}

function construirPregunta(
  enCurso: PreguntaEnCurso,
  seccionId: string,
  orden: number,
  tabla: Map<number, string>,
): { pregunta: Pregunta; informe: Omit<InformePregunta, "seccionId" | "numero"> } | null {
  const avisosPregunta: string[] = [];

  // Sin opciones con letra pero con viñetas: las viñetas SON las opciones. Es el
  // otro formato que se usa (bancos escritos con guiones en lugar de letras).
  let opciones = enCurso.opciones;
  let vinetas = enCurso.vinetas;
  if (opciones.length === 0 && vinetas.length >= 2) {
    opciones = vinetas.map((linea, i) => ({
      letra: letraEsperada(i),
      lineas: [linea],
      marcadorExplicito: false,
    }));
    vinetas = [];
    avisosPregunta.push("Las opciones venían con viñetas, sin letras.");
  }

  const lineasEnunciado = [...enCurso.enunciado, ...vinetas];
  let textoEnunciado = unir(lineasEnunciado);
  if (!textoEnunciado && opciones.length === 0) return null;

  // Puntos declarados al final del enunciado: «(5 puntos)».
  let puntos: number | null = enCurso.puntos;
  const conPuntos = RE_PUNTOS.exec(textoEnunciado);
  if (conPuntos) {
    puntos = Number(conPuntos[1].replace(",", "."));
    textoEnunciado = textoEnunciado.replace(RE_PUNTOS, "").trim();
  }

  /* --- Qué opción es la correcta --- */
  let correcta = -1;
  let origenClave: OrigenClave = "ninguna";

  const textosOpcion = opciones.map((opcion) => {
    let texto = unir(opcion.lineas);
    if (RE_MARCADOR_CORRECTA.test(texto)) {
      opcion.marcadorExplicito = true;
      texto = texto.replace(RE_MARCADOR_CORRECTA, "").trim();
    }
    return texto;
  });

  const porMarcador = opciones.findIndex((opcion) => opcion.marcadorExplicito);
  if (porMarcador >= 0) {
    correcta = porMarcador;
    origenClave = "marcador";
  } else {
    const porFormato = opciones.findIndex((opcion) => marcadaPorFormato(tramosDe(opcion.lineas)));
    if (porFormato >= 0) {
      correcta = porFormato;
      origenClave = "formato";
    } else if (enCurso.numero !== null && tabla.has(enCurso.numero)) {
      const letra = tabla.get(enCurso.numero)!;
      const indice = opciones.findIndex((opcion) => opcion.letra === letra);
      if (indice >= 0) {
        correcta = indice;
        origenClave = "tabla";
      } else {
        avisosPregunta.push(`La tabla de respuestas dice «${letra}» y esa opción no existe en la pregunta.`);
      }
    }
  }

  const marcadasPorFormato = opciones.filter((opcion) => marcadaPorFormato(tramosDe(opcion.lineas))).length;
  if (marcadasPorFormato > 1) {
    avisosPregunta.push(
      `${marcadasPorFormato} opciones están subrayadas o resaltadas: se tomó la primera. Revisa si la pregunta admite varias respuestas.`,
    );
  }

  /* --- Tipo --- */
  const normalizadas = textosOpcion.map(normalizar);
  const esVerdaderoFalso =
    opciones.length === 2 &&
    normalizadas.every((texto) => ["verdadero", "falso", "v", "f", "si", "no", "cierto"].includes(texto));
  const tipo =
    opciones.length === 0 ? "texto_largo" : esVerdaderoFalso ? "verdadero_falso" : "opcion_unica";

  const pregunta = nuevaPregunta(tipo, seccionId, orden);
  pregunta.enunciado = quitarSufijo(richDeLineas(lineasEnunciado), conPuntos ? conPuntos[0] : "");
  if (!textoEnunciado) {
    pregunta.enunciado = emptyRichDoc();
    avisosPregunta.push("La pregunta se detectó por sus opciones: le falta el enunciado.");
  }
  if (puntos !== null && puntos > 0) pregunta.puntos = puntos;

  if (opciones.length === 0) {
    pregunta.modoPuntaje = "manual";
    pregunta.opciones = [];
  } else {
    pregunta.opciones = opciones.map((opcion, i): Opcion => {
      const construida = nuevaOpcion(i, "");
      construida.texto = richDeTramos(tramosDe(opcion.lineas), { conservarSubrayado: false });
      // El texto ya viene sin el marcador; se recompone desde el texto limpio para
      // que un «*» al final no acabe delante del candidato.
      if (textosOpcion[i]) construida.texto = { v: 1, b: [{ t: "p", s: [{ x: textosOpcion[i] }] }] };
      construida.correcta = i === correcta;
      construida.valor = opcion.letra.toLowerCase();
      return construida;
    });
  }

  return {
    pregunta,
    informe: {
      preguntaId: pregunta.id,
      enunciado: textoEnunciado,
      opciones: textosOpcion,
      correcta,
      origenClave,
      tipo,
      avisos: avisosPregunta,
    },
  };
}

/** Convierte líneas planas (PDF, CSV, texto pegado) al formato con tramos. */
export function comoLineasDocumento(lineas: string[]): LineaDocumento[] {
  return lineas
    .map((texto) => limpiarTipografia(texto))
    .filter((texto) => texto.length > 0)
    .map((texto) => ({ texto, tramos: [{ texto }], lista: null }));
}

/** Marca de importación, para trazar de dónde vino un borrador. */
export function marcaImportacion(nombreArchivo: string): Record<string, unknown> {
  return { importacion: { archivo: nombreArchivo, en: new Date().toISOString(), id: newId("imp") } };
}
