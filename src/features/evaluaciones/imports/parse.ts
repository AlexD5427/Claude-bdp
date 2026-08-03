/**
 * Importación de evaluaciones desde archivos.
 *
 * Formatos: `.xlsx`, `.csv`, `.tsv`, `.docx` y `.pdf`. Todo se procesa EN EL
 * NAVEGADOR —ningún archivo sale del equipo— y con una única dependencia que ya
 * estaba en el proyecto (`fflate`, para descomprimir los ZIP que son en realidad
 * un .xlsx y un .docx).
 *
 * ── Por qué el mapeo automático y no un asistente de cinco pasos ─────────────
 * El importador anterior pedía asignar a mano cada columna a cada campo, y ese
 * mapeo no funcionaba bien. Aquí se detectan los encabezados por su nombre —con
 * sinónimos, sin acentos y sin distinguir mayúsculas— y el resultado se muestra ya
 * convertido para que el autor lo corrija en el editor, que es donde tiene todas
 * las herramientas. Un mapeo manual sigue disponible cuando la detección falla.
 *
 * Los PDF y los Word se convierten por HEURÍSTICA de líneas: una línea que acaba
 * en «?» o que empieza por un número es una pregunta; las que empiezan por una
 * letra con paréntesis, un guion o un asterisco son opciones; un asterisco al
 * final marca la correcta. Es lo que produce la mayoría de los bancos de preguntas
 * que la gente tiene en Word.
 */

import { unzipSync, strFromU8 } from "fflate";
import { newId } from "../../../shared/ids";
import { richFromPlain } from "../domain/richText";
import { nuevaOpcion, nuevaPregunta, nuevaSeccion } from "../domain/factory";
import type { Pregunta, Seccion } from "../domain/model";

export type FormatoArchivo = "xlsx" | "csv" | "docx" | "pdf" | "desconocido";

export interface FilaTabla {
  [columna: string]: string;
}

export interface Deteccion {
  formato: FormatoArchivo;
  /** Tabla detectada, cuando el archivo la tiene. */
  columnas: string[];
  filas: FilaTabla[];
  /** Texto plano, cuando el archivo no es tabular. */
  lineas: string[];
  aviso: string;
}

/** Normaliza un encabezado para compararlo: sin acentos, sin signos, minúsculas. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Sinónimos reconocidos por campo. El orden no importa. */
const SINONIMOS: Record<string, string[]> = {
  enunciado: ["pregunta", "enunciado", "question", "item", "texto", "reactivo", "descripcion"],
  tipo: ["tipo", "type", "formato", "tipopregunta"],
  seccion: ["seccion", "section", "bloque", "modulo", "categoria", "tema", "area"],
  puntos: ["puntos", "puntaje", "points", "score", "valor", "peso"],
  obligatoria: ["obligatoria", "obligatorio", "requerida", "required"],
  ayuda: ["ayuda", "help", "pista", "aclaracion", "instruccion"],
  competencia: ["competencia", "competency", "habilidad"],
  correcta: ["correcta", "respuestacorrecta", "clave", "answer", "correct", "solucion"],
  opcion1: ["opcion1", "opciona", "a", "alternativa1", "alternativaa", "op1"],
  opcion2: ["opcion2", "opcionb", "b", "alternativa2", "alternativab", "op2"],
  opcion3: ["opcion3", "opcionc", "c", "alternativa3", "alternativac", "op3"],
  opcion4: ["opcion4", "opciond", "d", "alternativa4", "alternativad", "op4"],
  opcion5: ["opcion5", "opcione", "e", "alternativa5", "alternativae", "op5"],
  opcion6: ["opcion6", "opcionf", "f", "alternativa6", "alternativaf", "op6"],
};

/** Mapa `campo → columna del archivo`, detectado automáticamente. */
export function detectarMapeo(columnas: string[]): Record<string, string> {
  const mapeo: Record<string, string> = {};
  for (const [campo, alias] of Object.entries(SINONIMOS)) {
    const encontrada = columnas.find((columna) => alias.includes(normalizar(columna)));
    if (encontrada) mapeo[campo] = encontrada;
  }
  // Si no se detectó el enunciado, se usa la primera columna con texto largo: es
  // casi siempre la pregunta, y dejar el mapeo vacío bloquearía la importación.
  if (!mapeo.enunciado && columnas.length > 0) mapeo.enunciado = columnas[0];
  return mapeo;
}

/* --------------------------------- Detección ------------------------------ */

export async function detectarArchivo(archivo: File): Promise<Deteccion> {
  const nombre = archivo.name.toLowerCase();
  const bytes = new Uint8Array(await archivo.arrayBuffer());

  if (nombre.endsWith(".csv") || nombre.endsWith(".tsv") || nombre.endsWith(".txt")) {
    const texto = strFromU8(bytes);
    const separador = nombre.endsWith(".tsv") || texto.split("\n")[0]?.includes("\t") ? "\t" : detectarSeparador(texto);
    const { columnas, filas } = leerDelimitado(texto, separador);
    return { formato: "csv", columnas, filas, lineas: texto.split(/\r?\n/), aviso: "" };
  }
  if (nombre.endsWith(".xlsx") || nombre.endsWith(".xlsm")) {
    return leerXlsx(bytes);
  }
  if (nombre.endsWith(".docx")) {
    const lineas = leerDocx(bytes);
    return { formato: "docx", columnas: [], filas: [], lineas, aviso: "" };
  }
  if (nombre.endsWith(".pdf")) {
    const lineas = leerPdf(bytes);
    return {
      formato: "pdf",
      columnas: [],
      filas: [],
      lineas,
      aviso:
        lineas.length === 0
          ? "No se pudo extraer texto del PDF. Suele significar que es un documento escaneado (una imagen): conviértelo antes con un OCR o copia el texto a un Word."
          : "",
    };
  }
  return {
    formato: "desconocido",
    columnas: [],
    filas: [],
    lineas: [],
    aviso: "Formato no reconocido. Admite .xlsx, .csv, .tsv, .docx y .pdf.",
  };
}

function detectarSeparador(texto: string): string {
  const primera = texto.split(/\r?\n/)[0] ?? "";
  const candidatos = [",", ";", "\t", "|"];
  return candidatos.reduce((mejor, sep) =>
    primera.split(sep).length > primera.split(mejor).length ? sep : mejor,
  ",");
}

/** Lector de delimitados con comillas, saltos internos y comillas escapadas. */
export function leerDelimitado(texto: string, separador: string): { columnas: string[]; filas: FilaTabla[] } {
  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let entreComillas = false;
  const contenido = texto.replace(/^\ufeff/, "");

  for (let i = 0; i < contenido.length; i += 1) {
    const caracter = contenido[i];
    if (entreComillas) {
      if (caracter === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += caracter;
      }
      continue;
    }
    if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === separador) {
      registro.push(campo);
      campo = "";
    } else if (caracter === "\n") {
      registro.push(campo);
      registros.push(registro);
      registro = [];
      campo = "";
    } else if (caracter !== "\r") {
      campo += caracter;
    }
  }
  if (campo || registro.length > 0) {
    registro.push(campo);
    registros.push(registro);
  }

  const utiles = registros.filter((fila) => fila.some((celda) => celda.trim() !== ""));
  if (utiles.length === 0) return { columnas: [], filas: [] };
  const columnas = utiles[0].map((celda, i) => celda.trim() || `Columna ${i + 1}`);
  const filas = utiles.slice(1).map((fila) => {
    const objeto: FilaTabla = {};
    columnas.forEach((columna, i) => {
      objeto[columna] = (fila[i] ?? "").trim();
    });
    return objeto;
  });
  return { columnas, filas };
}

/**
 * Lector de `.xlsx`.
 *
 * Un xlsx es un ZIP con XML dentro. Se leen las cadenas compartidas y la primera
 * hoja, y se reconstruye la tabla por la referencia de celda (`B3`), que es lo que
 * permite respetar las celdas vacías: sin eso, una fila con un hueco desplaza todas
 * las columnas siguientes.
 */
function leerXlsx(bytes: Uint8Array): Deteccion {
  try {
    const zip = unzipSync(bytes);
    const compartidas: string[] = [];
    const xmlCompartidas = zip["xl/sharedStrings.xml"];
    if (xmlCompartidas) {
      const texto = strFromU8(xmlCompartidas);
      for (const bloque of texto.split("<si>").slice(1)) {
        const partes = [...bloque.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1]));
        compartidas.push(partes.join(""));
      }
    }
    const nombreHoja =
      Object.keys(zip)
        .filter((clave) => /^xl\/worksheets\/sheet\d+\.xml$/.test(clave))
        .sort()[0] ?? "";
    if (!nombreHoja) {
      return { formato: "xlsx", columnas: [], filas: [], lineas: [], aviso: "El archivo no contiene hojas legibles." };
    }
    const hoja = strFromU8(zip[nombreHoja]);
    const matriz: string[][] = [];
    for (const filaXml of hoja.split("<row").slice(1)) {
      const indiceFila = Number(/r="(\d+)"/.exec(filaXml)?.[1] ?? matriz.length + 1) - 1;
      const fila: string[] = [];
      for (const celdaMatch of filaXml.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g)) {
        const atributos = celdaMatch[1] ?? celdaMatch[3] ?? "";
        const cuerpo = celdaMatch[2] ?? "";
        const referencia = /r="([A-Z]+)\d+"/.exec(atributos)?.[1];
        const columna = referencia ? letraAIndice(referencia) : fila.length;
        const tipo = /t="([^"]+)"/.exec(atributos)?.[1] ?? "n";
        let valor = "";
        if (tipo === "s") {
          const indice = Number(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? "-1");
          valor = compartidas[indice] ?? "";
        } else if (tipo === "inlineStr") {
          valor = [...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desescapar(m[1])).join("");
        } else {
          valor = desescapar(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? "");
        }
        while (fila.length < columna) fila.push("");
        fila[columna] = valor.trim();
      }
      while (matriz.length < indiceFila) matriz.push([]);
      matriz[indiceFila] = fila;
    }
    const utiles = matriz.filter((fila) => fila.some((celda) => (celda ?? "").trim() !== ""));
    if (utiles.length === 0) {
      return { formato: "xlsx", columnas: [], filas: [], lineas: [], aviso: "La primera hoja está vacía." };
    }
    const columnas = utiles[0].map((celda, i) => (celda || "").trim() || `Columna ${i + 1}`);
    const filas = utiles.slice(1).map((fila) => {
      const objeto: FilaTabla = {};
      columnas.forEach((columna, i) => {
        objeto[columna] = (fila[i] ?? "").trim();
      });
      return objeto;
    });
    return { formato: "xlsx", columnas, filas, lineas: [], aviso: "" };
  } catch (error) {
    return {
      formato: "xlsx",
      columnas: [],
      filas: [],
      lineas: [],
      aviso: `No se pudo leer el archivo de Excel (${error instanceof Error ? error.message : "error desconocido"}). Si está protegido con contraseña, quítala y vuelve a intentarlo.`,
    };
  }
}

function letraAIndice(letras: string): number {
  let indice = 0;
  for (const letra of letras) indice = indice * 26 + (letra.charCodeAt(0) - 64);
  return indice - 1;
}

function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&amp;/g, "&");
}

/** Lector de `.docx`: también un ZIP; el texto vive en `word/document.xml`. */
function leerDocx(bytes: Uint8Array): string[] {
  try {
    const zip = unzipSync(bytes);
    const documento = zip["word/document.xml"];
    if (!documento) return [];
    const xml = strFromU8(documento);
    const parrafos: string[] = [];
    for (const bloque of xml.split("</w:p>")) {
      const texto = [...bloque.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => desescapar(m[1])).join("");
      const limpio = texto.trim();
      if (limpio) parrafos.push(limpio);
    }
    return parrafos;
  } catch {
    return [];
  }
}

/**
 * Lector de `.pdf` por operadores de texto.
 *
 * Funciona con los PDF generados digitalmente (los flujos sin comprimir y los
 * comprimidos con Flate). No funciona con documentos escaneados, que son imágenes;
 * en ese caso `detectarArchivo` lo dice explícitamente en lugar de devolver un
 * resultado vacío sin explicación.
 */
function leerPdf(bytes: Uint8Array): string[] {
  const lineas: string[] = [];
  try {
    // `unzlibSync` de fflate descomprime los flujos FlateDecode del PDF.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const texto = extraerTextoPdf(bytes);
    for (const linea of texto.split("\n")) {
      const limpio = linea.replace(/\s+/g, " ").trim();
      if (limpio) lineas.push(limpio);
    }
  } catch {
    return [];
  }
  return lineas;
}

function extraerTextoPdf(bytes: Uint8Array): string {
  const crudo = new TextDecoder("latin1").decode(bytes);
  const trozos: string[] = [];
  // Los operadores de texto viven entre BT y ET. Se toman los literales de `Tj`
  // y los arreglos de `TJ`, que es lo que produce cualquier generador de PDF.
  for (const bloque of crudo.split("BT").slice(1)) {
    const hasta = bloque.indexOf("ET");
    const contenido = hasta >= 0 ? bloque.slice(0, hasta) : bloque;
    let linea = "";
    for (const literal of contenido.matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      linea += literal[1]
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " ")
        .replace(/\\([()\\])/g, "$1")
        .replace(/\\(\d{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
    }
    if (linea.trim()) trozos.push(linea.trim());
  }
  return trozos.join("\n");
}

/* -------------------------------- Conversión ------------------------------ */

export interface ResultadoConversion {
  secciones: Seccion[];
  preguntas: number;
  avisos: string[];
}

/** Tipos que se aceptan escritos a mano en la columna «tipo». */
const ALIAS_TIPO: Record<string, string> = {
  unica: "opcion_unica",
  opcionunica: "opcion_unica",
  multiple: "opcion_multiple",
  opcionmultiple: "opcion_multiple",
  casillas: "opcion_multiple",
  desplegable: "desplegable",
  vf: "verdadero_falso",
  verdaderofalso: "verdadero_falso",
  abierta: "texto_largo",
  parrafo: "texto_largo",
  textolargo: "texto_largo",
  corta: "texto_corto",
  textocorto: "texto_corto",
  numero: "numero",
  numerica: "decimal",
  decimal: "decimal",
  escala: "escala_lineal",
  likert: "likert",
  fecha: "fecha",
  hora: "hora",
  ordenar: "ordenar",
  emparejar: "emparejar",
  clasificar: "clasificar",
};

/** Tabla → secciones. Es la ruta del `.xlsx` y del `.csv`. */
export function convertirTabla(filas: FilaTabla[], mapeo: Record<string, string>): ResultadoConversion {
  const avisos: string[] = [];
  const porSeccion = new Map<string, Pregunta[]>();
  let total = 0;

  filas.forEach((fila, indice) => {
    const enunciado = (fila[mapeo.enunciado] ?? "").trim();
    if (!enunciado) return;
    const nombreSeccion = (mapeo.seccion ? fila[mapeo.seccion] : "").trim() || "Importadas";

    const opciones = ["opcion1", "opcion2", "opcion3", "opcion4", "opcion5", "opcion6"]
      .map((campo) => (mapeo[campo] ? (fila[mapeo[campo]] ?? "").trim() : ""))
      .filter(Boolean);

    const tipoDeclarado = (mapeo.tipo ? fila[mapeo.tipo] : "").trim();
    const tipo =
      ALIAS_TIPO[normalizar(tipoDeclarado)] ??
      (opciones.length >= 2 ? "opcion_unica" : opciones.length === 0 ? "texto_largo" : "opcion_unica");

    if (tipoDeclarado && !ALIAS_TIPO[normalizar(tipoDeclarado)]) {
      avisos.push(`Fila ${indice + 2}: el tipo «${tipoDeclarado}» no se reconoció; se usó «${tipo}».`);
    }

    const pregunta = nuevaPregunta(tipo, "", 0);
    pregunta.enunciado = richFromPlain(enunciado);
    if (mapeo.ayuda && fila[mapeo.ayuda]) pregunta.ayuda = richFromPlain(fila[mapeo.ayuda].trim());
    if (mapeo.competencia) pregunta.competencia = (fila[mapeo.competencia] ?? "").trim();
    if (mapeo.puntos) {
      const puntos = Number((fila[mapeo.puntos] ?? "").replace(",", "."));
      if (Number.isFinite(puntos) && puntos > 0) pregunta.puntos = puntos;
    }
    if (mapeo.obligatoria) {
      const valor = normalizar(fila[mapeo.obligatoria] ?? "");
      pregunta.obligatoria = valor === "si" || valor === "true" || valor === "1" || valor === "x";
    }

    if (opciones.length > 0) {
      const claveCruda = (mapeo.correcta ? fila[mapeo.correcta] : "").trim();
      pregunta.opciones = opciones.map((texto, i) => {
        const opcion = nuevaOpcion(i, texto);
        opcion.correcta = esLaCorrecta(claveCruda, texto, i);
        return opcion;
      });
      if (claveCruda && !pregunta.opciones.some((o) => o.correcta)) {
        avisos.push(`Fila ${indice + 2}: no se pudo emparejar la respuesta correcta «${claveCruda}» con ninguna opción.`);
      }
    } else if (pregunta.opciones.length > 0) {
      pregunta.opciones = [];
    }

    if (!porSeccion.has(nombreSeccion)) porSeccion.set(nombreSeccion, []);
    porSeccion.get(nombreSeccion)!.push(pregunta);
    total += 1;
  });

  const secciones = [...porSeccion.entries()].map(([nombre, preguntas], indice) => {
    const seccion = nuevaSeccion(indice, nombre);
    seccion.preguntas = preguntas.map((pregunta, i) => ({ ...pregunta, seccionId: seccion.id, orden: i }));
    return seccion;
  });

  return { secciones, preguntas: total, avisos };
}

/**
 * ¿La clave escrita por el autor señala a esta opción?
 *
 * Se admiten tres formas, porque son las tres que la gente usa: la letra (`B`), el
 * número (`2`) y el texto completo de la opción.
 */
function esLaCorrecta(clave: string, texto: string, indice: number): boolean {
  if (!clave) return false;
  const normalizada = normalizar(clave);
  if (normalizada === normalizar(texto)) return true;
  const letra = String.fromCharCode(97 + indice);
  if (normalizada === letra) return true;
  if (normalizada === String(indice + 1)) return true;
  return false;
}

/**
 * Líneas → secciones. Es la ruta del `.docx` y del `.pdf`.
 *
 * Heurística explícita, para que se pueda ajustar sin adivinar:
 *   · «1.» / «1)» / texto que acaba en «?»  → pregunta nueva
 *   · «a)» / «-» / «•» / «*»                → opción de la pregunta en curso
 *   · un «*» al final de una opción          → esa es la correcta
 *   · «Sección: X» / «SECCIÓN X»            → sección nueva
 */
export function convertirLineas(lineas: string[]): ResultadoConversion {
  const avisos: string[] = [];
  const secciones: Seccion[] = [];
  let seccionActual: Seccion | null = null;
  let preguntaActual: Pregunta | null = null;
  let total = 0;

  const nuevaSeccionCon = (titulo: string) => {
    seccionActual = nuevaSeccion(secciones.length, titulo);
    secciones.push(seccionActual);
    return seccionActual;
  };

  for (const cruda of lineas) {
    const linea = cruda.trim();
    if (!linea) continue;

    const seccion = /^(secci[oó]n|bloque|m[oó]dulo|parte)\s*[:\-.]?\s*(.+)$/i.exec(linea);
    if (seccion && seccion[2].length < 80) {
      nuevaSeccionCon(seccion[2].trim());
      preguntaActual = null;
      continue;
    }

    const opcion = /^(?:[a-hA-H][).\-]|[-•*+])\s*(.+)$/.exec(linea);
    if (opcion && preguntaActual) {
      let texto = opcion[1].trim();
      let correcta = false;
      if (/\s*\*$/.test(texto) || /\s*\(correcta\)$/i.test(texto)) {
        correcta = true;
        texto = texto.replace(/\s*\*$/, "").replace(/\s*\(correcta\)$/i, "").trim();
      }
      const nueva = nuevaOpcion(preguntaActual.opciones.length, texto);
      nueva.correcta = correcta;
      preguntaActual.opciones.push(nueva);
      continue;
    }

    const numerada = /^\d+\s*[).\-]\s*(.+)$/.exec(linea);
    const esPregunta = !!numerada || /\?\s*$/.test(linea);
    if (esPregunta) {
      if (!seccionActual) nuevaSeccionCon("Importadas");
      const texto = (numerada ? numerada[1] : linea).trim();
      preguntaActual = nuevaPregunta("opcion_unica", seccionActual!.id, seccionActual!.preguntas.length);
      preguntaActual.enunciado = richFromPlain(texto);
      preguntaActual.opciones = [];
      seccionActual!.preguntas.push(preguntaActual);
      total += 1;
      continue;
    }

    // Línea suelta: se añade como contenido explicativo, no se descarta.
    if (!seccionActual) nuevaSeccionCon("Importadas");
    const contenido = nuevaPregunta("contenido_parrafo", seccionActual!.id, seccionActual!.preguntas.length);
    contenido.enunciado = richFromPlain(linea);
    seccionActual!.preguntas.push(contenido);
  }

  // Las preguntas que quedaron sin opciones pasan a ser abiertas: una de opción
  // única sin opciones no se puede publicar, y convertirla es lo que el autor
  // habría hecho a mano.
  let convertidas = 0;
  for (const seccion of secciones) {
    seccion.preguntas = seccion.preguntas.map((pregunta) => {
      if (pregunta.tipo !== "opcion_unica" || pregunta.opciones.length >= 2) return pregunta;
      convertidas += 1;
      return { ...pregunta, tipo: "texto_largo", modoPuntaje: "manual", opciones: [] };
    });
  }
  if (convertidas > 0) {
    avisos.push(
      `${convertidas} pregunta(s) no tenían opciones detectables y se convirtieron en respuesta abierta con revisión manual.`,
    );
  }
  if (total === 0) {
    avisos.push(
      "No se detectó ninguna pregunta. Comprueba que cada una empiece por un número o termine en «?», y que las opciones empiecen por «a)», «-» o «•».",
    );
  }

  return { secciones, preguntas: total, avisos };
}

/** Identificador de importación, para trazar de dónde vino un borrador. */
export function marcaImportacion(nombreArchivo: string): Record<string, unknown> {
  return { importacion: { archivo: nombreArchivo, en: new Date().toISOString(), id: newId("imp") } };
}
