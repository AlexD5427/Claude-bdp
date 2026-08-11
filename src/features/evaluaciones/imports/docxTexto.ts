/**
 * Extracción de texto con FORMATO de un `.docx`.
 *
 * ── Por qué el formato importa aquí ──────────────────────────────────────────
 * Así es como el equipo escribe sus pruebas en Word:
 *
 *     1. Según las NOGAI, el propósito principal de la auditoría interna es:
 *     A) Elaborar estados financieros.
 *     C) Evaluar y mejorar los procesos de control…      ← subrayada
 *
 * La respuesta correcta no se marca con un asterisco ni con la palabra
 * «(correcta)»: se marca SUBRAYANDO o RESALTANDO la opción. Un importador que
 * solo lea texto plano tira justamente el dato más valioso del documento y deja al
 * analista marcando cuarenta claves a mano.
 *
 * Este lector devuelve cada párrafo con sus TRAMOS, y cada tramo con sus marcas
 * (negrita, cursiva, subrayado, tachado, resaltado). El analizador de preguntas
 * usa el subrayado y el resaltado como señal de «esta es la correcta», y conserva
 * la negrita y la cursiva como formato del enunciado.
 *
 * Un `.docx` es un ZIP con XML dentro, así que basta `fflate` —que ya estaba en el
 * proyecto— y no hace falta ninguna dependencia nueva.
 */

import { strFromU8, unzipSync } from "fflate";

export interface TramoTexto {
  texto: string;
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  tachado?: boolean;
  resaltado?: boolean;
}

export interface LineaDocumento {
  texto: string;
  tramos: TramoTexto[];
  /** El párrafo venía como elemento de lista con viñeta o numerada. */
  lista?: "ul" | "ol" | null;
  /** Nivel de sangría de la lista, si lo declara. */
  nivel?: number;
  /** El párrafo usa un estilo de título (Heading). Se usa para detectar secciones. */
  titulo?: boolean;
  /** Venía dentro de una tabla: en esos casos la estructura manda más que el texto. */
  enTabla?: boolean;
}

function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, codigo) => String.fromCodePoint(parseInt(codigo, 16)))
    .replace(/&amp;/g, "&");
}

/** ¿La propiedad está activa? En OOXML `<w:b/>` es sí y `<w:b w:val="0"/>` es no. */
function activa(propiedades: string, etiqueta: string): boolean {
  const patron = new RegExp(`<w:${etiqueta}(\\s[^>]*)?/?>`);
  const encontrada = patron.exec(propiedades);
  if (!encontrada) return false;
  const atributos = encontrada[1] ?? "";
  const valor = /w:val="([^"]*)"/.exec(atributos)?.[1];
  if (valor === undefined) return true;
  return valor !== "0" && valor !== "false" && valor !== "none";
}

/** Marcas de un `<w:rPr>`. */
function marcasDeRun(propiedades: string): Omit<TramoTexto, "texto"> {
  return {
    negrita: activa(propiedades, "b"),
    cursiva: activa(propiedades, "i"),
    subrayado: activa(propiedades, "u"),
    tachado: activa(propiedades, "strike"),
    resaltado: activa(propiedades, "highlight") || /w:fill="(?!auto|FFFFFF)[0-9A-Fa-f]{6}"/.test(propiedades),
  };
}

/** Fusiona tramos consecutivos con el mismo formato: menos ruido, misma información. */
function fusionar(tramos: TramoTexto[]): TramoTexto[] {
  const salida: TramoTexto[] = [];
  for (const tramo of tramos) {
    if (!tramo.texto) continue;
    const previo = salida[salida.length - 1];
    if (
      previo &&
      !!previo.negrita === !!tramo.negrita &&
      !!previo.cursiva === !!tramo.cursiva &&
      !!previo.subrayado === !!tramo.subrayado &&
      !!previo.tachado === !!tramo.tachado &&
      !!previo.resaltado === !!tramo.resaltado
    ) {
      previo.texto += tramo.texto;
      continue;
    }
    salida.push({ ...tramo });
  }
  return salida;
}

/**
 * Párrafos de un `.docx`, con sus tramos y su formato.
 *
 * Se recorre `word/document.xml` en orden, así que el resultado respeta la
 * secuencia del documento (incluido el contenido de las tablas, aplanado).
 */
export function extraerLineasDocx(bytes: Uint8Array): LineaDocumento[] {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    return [];
  }
  const documento = zip["word/document.xml"];
  if (!documento) return [];
  const xml = strFromU8(documento);

  // Numeración: `<w:numPr>` remite a un `numId`, y saber si es viñeta o número
  // exige mirar `numbering.xml`. Para lo que hace falta aquí —distinguir un
  // elemento de lista de un párrafo normal— basta con detectar la presencia y,
  // cuando se puede, el formato declarado.
  const numeracion = zip["word/numbering.xml"] ? strFromU8(zip["word/numbering.xml"]) : "";
  const listasNumeradas = new Set<string>();
  for (const bloque of numeracion.matchAll(/<w:abstractNum[^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g)) {
    if (/<w:numFmt[^>]*w:val="(decimal|lowerLetter|upperLetter|lowerRoman|upperRoman)"/.test(bloque[0])) {
      listasNumeradas.add(bloque[1]);
    }
  }

  const lineas: LineaDocumento[] = [];
  const enTablaPorPosicion = (indice: number): boolean => {
    const antes = xml.lastIndexOf("<w:tbl>", indice);
    if (antes < 0) return false;
    const cierre = xml.lastIndexOf("</w:tbl>", indice);
    return antes > cierre;
  };

  for (const parrafo of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const cuerpo = parrafo[1];
    const propiedadesParrafo = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(cuerpo)?.[1] ?? "";
    const estilo = /<w:pStyle[^>]*w:val="([^"]*)"/.exec(propiedadesParrafo)?.[1] ?? "";
    const conNumeracion = /<w:numPr>/.test(propiedadesParrafo);
    const numId = /<w:numId[^>]*w:val="(\d+)"/.exec(propiedadesParrafo)?.[1] ?? "";
    const nivel = Number(/<w:ilvl[^>]*w:val="(\d+)"/.exec(propiedadesParrafo)?.[1] ?? 0);

    const tramos: TramoTexto[] = [];
    for (const run of cuerpo.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
      const contenido = run[1];
      const propiedades = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(contenido)?.[1] ?? "";
      const marcas = marcasDeRun(propiedades);
      let texto = "";
      for (const pieza of contenido.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
        if (pieza[1] !== undefined) texto += desescapar(pieza[1]);
        else texto += pieza[0].startsWith("<w:tab") ? " " : " ";
      }
      if (texto) tramos.push({ texto, ...marcas });
    }

    const fusionados = fusionar(tramos);
    const texto = fusionados.map((t) => t.texto).join("").replace(/\s+/g, " ").trim();
    if (!texto) continue;
    lineas.push({
      texto,
      tramos: fusionados,
      lista: conNumeracion ? (listasNumeradas.has(numId) ? "ol" : "ul") : null,
      nivel,
      titulo: /^Heading|^Ttulo|^Titulo|^T\u00edtulo/i.test(estilo),
      enTabla: enTablaPorPosicion(parrafo.index ?? 0),
    });
  }

  return lineas;
}

/** Convierte líneas con formato en líneas planas, para los lectores que no lo usan. */
export function soloTexto(lineas: LineaDocumento[]): string[] {
  return lineas.map((linea) => linea.texto);
}
