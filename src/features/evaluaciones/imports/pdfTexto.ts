/**
 * Extracción de texto de un PDF, en el navegador y sin dependencias.
 *
 * ── Por qué había que reescribirlo ───────────────────────────────────────────
 * El lector anterior buscaba literales entre `BT` y `ET` sobre los bytes crudos
 * del archivo. Eso funciona con PDF de juguete y falla con TODOS los PDF reales,
 * por dos razones:
 *
 *   1. El flujo de contenido viene comprimido (`/FlateDecode`), así que entre
 *      `BT` y `ET` no hay texto, hay bytes comprimidos. Los PDF que exporta Word
 *      —los que usa el equipo— siempre lo están.
 *   2. Aunque se descomprima, los códigos que aparecen en `(…)` o `<…>` NO son
 *      caracteres: son índices de glifo de una fuente incrustada en subconjunto.
 *      Sin traducirlos con el `/ToUnicode` de esa fuente, el resultado es basura
 *      («\x03\x1f\x0b\x02» en lugar de «Según»).
 *
 * ── Qué hace este archivo ────────────────────────────────────────────────────
 * Un lector de PDF mínimo pero honesto:
 *
 *   · recorre los objetos del archivo y descomprime los flujos, incluidos los
 *     FLUJOS DE OBJETOS (`/Type /ObjStm`), donde los PDF modernos esconden los
 *     diccionarios de fuente;
 *   · para cada página lee su recurso de fuentes y construye un DECODIFICADOR por
 *     fuente: `/ToUnicode` si lo hay, `WinAnsiEncoding` con sus `/Differences` si
 *     no, y latin1 como último recurso;
 *   · interpreta los operadores de texto (`Tj`, `TJ`, `'`, `"`, `Td`, `TD`, `T*`,
 *     `TL`, `Tm`, `Tf`) llevando la cuenta de la POSICIÓN, y agrupa por
 *     coordenada vertical.
 *
 * Agrupar por posición y no por operador es lo que hace que el resultado sea
 * utilizable: un generador de PDF puede partir «Según las NOGAI» en cinco
 * operadores distintos y una línea de opción en dos, y quien lea línea a línea
 * necesita la línea, no los trozos.
 *
 * ── Lo que no hace, y lo dice ────────────────────────────────────────────────
 * No hace OCR. Un PDF escaneado es una imagen y aquí no hay texto que extraer:
 * en ese caso `extraerTextoPdf` devuelve una lista vacía y quien llama avisa de
 * que hace falta pasar un OCR. Tampoco intenta reconstruir tablas.
 */

import { decompressSync } from "fflate";

/** Un fragmento de texto con su posición en la página. */
interface Fragmento {
  pagina: number;
  x: number;
  y: number;
  /**
   * Clave de orden vertical.
   *
   * En un PDF el eje Y crece hacia ARRIBA, así que el orden de lectura es de
   * mayor a menor. Pero un generador puede voltear el eje con la matriz de texto
   * (`1 0 0 -1 x y Tm`, que es lo que hace Chromium) y entonces crece hacia
   * abajo. Guardar aquí la clave ya orientada evita tener que adivinarlo después:
   * ordenando ascendente por `orden` el resultado es el orden de lectura en los
   * dos casos.
   */
  orden: number;
  /** Tamaño de la fuente en el espacio del texto, para medir los huecos. */
  tamano: number;
  texto: string;
}

export interface LineaPdf {
  pagina: number;
  texto: string;
  /** Coordenada vertical, útil para depurar la agrupación. */
  y: number;
}

/* -------------------------------------------------------------------------- */
/*                         Recorrido de objetos del PDF                        */
/* -------------------------------------------------------------------------- */

interface ObjetoPdf {
  numero: number;
  /** Cuerpo del diccionario, como texto latin1. */
  cuerpo: string;
  /** Contenido del flujo, ya descomprimido, si el objeto tenía uno. */
  flujo?: Uint8Array;
}

/** Bytes → texto latin1 (byte a byte). Es como se leen las estructuras del PDF. */
function latin1(bytes: Uint8Array, desde = 0, hasta = bytes.length): string {
  let salida = "";
  const paso = 8192;
  for (let i = desde; i < hasta; i += paso) {
    salida += String.fromCharCode(...bytes.subarray(i, Math.min(hasta, i + paso)));
  }
  return salida;
}

function texto1(texto: string): Uint8Array {
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i) & 0xff;
  return bytes;
}

/** Descomprime un flujo según su `/Filter`. Devuelve los bytes tal cual si no sabe. */
function descomprimir(dict: string, bytes: Uint8Array): Uint8Array {
  if (!/\/Filter/.test(dict)) return bytes;
  if (/\/(FlateDecode|Fl)\b/.test(dict)) {
    try {
      const salida = decompressSync(bytes);
      return /\/DecodeParms|\/Predictor/.test(dict) ? deshacerPredictor(dict, salida) : salida;
    } catch {
      return new Uint8Array(0);
    }
  }
  // ASCIIHexDecode aparece en PDF hechos a mano.
  if (/\/ASCIIHexDecode\b/.test(dict)) {
    const hex = latin1(bytes).replace(/[^0-9a-fA-F]/g, "");
    const salida = new Uint8Array(Math.floor(hex.length / 2));
    for (let i = 0; i < salida.length; i += 1) salida[i] = parseInt(hex.substr(i * 2, 2), 16);
    return salida;
  }
  return new Uint8Array(0);
}

/**
 * Deshace el predictor PNG de un flujo comprimido.
 *
 * Los flujos de referencias cruzadas y algunas imágenes lo usan. Sin deshacerlo,
 * los bytes salen desplazados. Solo se implementa el predictor «up» agrupado (el
 * que usan de hecho los generadores), y ante cualquier duda se devuelve el flujo
 * sin tocar en lugar de inventar datos.
 */
function deshacerPredictor(dict: string, bytes: Uint8Array): Uint8Array {
  const predictor = Number(/\/Predictor\s+(\d+)/.exec(dict)?.[1] ?? 1);
  if (predictor < 10) return bytes;
  const columnas = Number(/\/Columns\s+(\d+)/.exec(dict)?.[1] ?? 1);
  const colores = Number(/\/Colors\s+(\d+)/.exec(dict)?.[1] ?? 1);
  const bits = Number(/\/BitsPerComponent\s+(\d+)/.exec(dict)?.[1] ?? 8);
  const anchoFila = Math.ceil((columnas * colores * bits) / 8);
  const muestra = Math.ceil((colores * bits) / 8);
  const filas = Math.floor(bytes.length / (anchoFila + 1));
  const salida = new Uint8Array(filas * anchoFila);
  let previa = new Uint8Array(anchoFila);
  for (let f = 0; f < filas; f += 1) {
    const tipo = bytes[f * (anchoFila + 1)];
    const cruda = bytes.subarray(f * (anchoFila + 1) + 1, (f + 1) * (anchoFila + 1));
    const fila = new Uint8Array(anchoFila);
    for (let i = 0; i < anchoFila; i += 1) {
      const izquierda = i >= muestra ? fila[i - muestra] : 0;
      const arriba = previa[i];
      const diagonal = i >= muestra ? previa[i - muestra] : 0;
      const valor = cruda[i] ?? 0;
      switch (tipo) {
        case 0:
          fila[i] = valor;
          break;
        case 1:
          fila[i] = (valor + izquierda) & 0xff;
          break;
        case 2:
          fila[i] = (valor + arriba) & 0xff;
          break;
        case 3:
          fila[i] = (valor + ((izquierda + arriba) >> 1)) & 0xff;
          break;
        case 4: {
          const p = izquierda + arriba - diagonal;
          const pa = Math.abs(p - izquierda);
          const pb = Math.abs(p - arriba);
          const pc = Math.abs(p - diagonal);
          fila[i] = (valor + (pa <= pb && pa <= pc ? izquierda : pb <= pc ? arriba : diagonal)) & 0xff;
          break;
        }
        default:
          fila[i] = valor;
      }
    }
    salida.set(fila, f * anchoFila);
    previa = fila;
  }
  return salida;
}

/**
 * Todos los objetos del archivo, indexados por número.
 *
 * Se recorren los `N 0 obj … endobj` que aparecen en el archivo en lugar de
 * seguir la tabla de referencias cruzadas. Es más tolerante: un PDF con la tabla
 * desfasada —cosa habitual en archivos que pasaron por varias herramientas— se
 * lee igual de bien, y aquí no hay que escribir nada, solo leer.
 */
function leerObjetos(bytes: Uint8Array): Map<number, ObjetoPdf> {
  const crudo = latin1(bytes);
  const objetos = new Map<number, ObjetoPdf>();
  const patron = /(\d+)\s+(\d+)\s+obj\b/g;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(crudo)) !== null) {
    const numero = Number(coincidencia[1]);
    const inicio = coincidencia.index + coincidencia[0].length;
    const fin = crudo.indexOf("endobj", inicio);
    const cuerpoCompleto = crudo.slice(inicio, fin < 0 ? crudo.length : fin);
    const marcaFlujo = cuerpoCompleto.indexOf("stream");

    if (marcaFlujo < 0) {
      objetos.set(numero, { numero, cuerpo: cuerpoCompleto });
      continue;
    }
    const dict = cuerpoCompleto.slice(0, marcaFlujo);
    // Tras `stream` viene un salto de línea (CRLF o LF) y luego los bytes.
    let arranque = inicio + marcaFlujo + "stream".length;
    if (crudo[arranque] === "\r") arranque += 1;
    if (crudo[arranque] === "\n") arranque += 1;

    // La longitud declarada puede ser una referencia indirecta; si no se puede
    // resolver aquí, se busca el `endstream`.
    const declarada = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1] ?? NaN);
    let cierre = Number.isFinite(declarada) ? arranque + declarada : -1;
    if (cierre < 0 || crudo.slice(cierre, cierre + 20).indexOf("endstream") < 0) {
      cierre = crudo.indexOf("endstream", arranque);
      if (cierre < 0) cierre = crudo.length;
    }
    objetos.set(numero, {
      numero,
      cuerpo: dict,
      flujo: descomprimir(dict, bytes.subarray(arranque, cierre)),
    });
  }

  // Flujos de objetos: los PDF modernos meten los diccionarios pequeños —entre
  // ellos las fuentes— dentro de un `/Type /ObjStm` comprimido.
  for (const objeto of [...objetos.values()]) {
    if (!objeto.flujo || !/\/Type\s*\/ObjStm/.test(objeto.cuerpo)) continue;
    const cantidad = Number(/\/N\s+(\d+)/.exec(objeto.cuerpo)?.[1] ?? 0);
    const primero = Number(/\/First\s+(\d+)/.exec(objeto.cuerpo)?.[1] ?? 0);
    if (!cantidad || !primero) continue;
    const contenido = latin1(objeto.flujo);
    const cabecera = contenido.slice(0, primero).trim().split(/\s+/).map(Number);
    for (let i = 0; i < cantidad; i += 1) {
      const numero = cabecera[i * 2];
      const desplazamiento = cabecera[i * 2 + 1];
      if (!Number.isFinite(numero) || !Number.isFinite(desplazamiento)) continue;
      const siguiente = cabecera[(i + 1) * 2 + 1];
      const hasta = Number.isFinite(siguiente) ? primero + siguiente : contenido.length;
      if (objetos.has(numero)) continue;
      objetos.set(numero, { numero, cuerpo: contenido.slice(primero + desplazamiento, hasta) });
    }
  }

  return objetos;
}

/* -------------------------------------------------------------------------- */
/*                          Decodificadores de fuente                          */
/* -------------------------------------------------------------------------- */

/**
 * Traduce los códigos de una cadena del PDF a texto.
 *
 * `anchoCodigo` es 1 o 2 bytes: las fuentes incrustadas en subconjunto que usa
 * Word van con `/Identity-H`, que es de dos bytes.
 */
interface Decodificador {
  anchoCodigo: 1 | 2;
  mapa: Map<number, string>;
  /** Respaldo cuando el código no está en el mapa. */
  respaldo: (codigo: number) => string;
}

/** Tabla WinAnsi para los códigos que no coinciden con latin1. */
const WINANSI_ESPECIALES: Record<number, string> = {
  128: "\u20ac", 130: "\u201a", 131: "\u0192", 132: "\u201e", 133: "\u2026",
  134: "\u2020", 135: "\u2021", 136: "\u02c6", 137: "\u2030", 138: "\u0160",
  139: "\u2039", 140: "\u0152", 142: "\u017d", 145: "\u2018", 146: "\u2019",
  147: "\u201c", 148: "\u201d", 149: "\u2022", 150: "\u2013", 151: "\u2014",
  152: "\u02dc", 153: "\u2122", 154: "\u0161", 155: "\u203a", 156: "\u0153",
  158: "\u017e", 159: "\u0178",
};

function porWinAnsi(codigo: number): string {
  return WINANSI_ESPECIALES[codigo] ?? String.fromCharCode(codigo);
}

/** Nombres de glifo más comunes en `/Differences`, para acentos y comillas. */
const NOMBRE_A_CARACTER: Record<string, string> = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%",
  ampersand: "&", quotesingle: "'", parenleft: "(", parenright: ")", asterisk: "*",
  plus: "+", comma: ",", hyphen: "-", period: ".", slash: "/", colon: ":",
  semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@",
  bracketleft: "[", backslash: "\\", bracketright: "]", underscore: "_",
  braceleft: "{", bar: "|", braceright: "}", quoteright: "\u2019", quoteleft: "\u2018",
  quotedblleft: "\u201c", quotedblright: "\u201d", endash: "\u2013", emdash: "\u2014",
  bullet: "\u2022", ellipsis: "\u2026", aacute: "á", eacute: "é", iacute: "í",
  oacute: "ó", uacute: "ú", ntilde: "ñ", Ntilde: "Ñ", udieresis: "ü", Aacute: "Á",
  Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", questiondown: "¿",
  exclamdown: "¡", ordfeminine: "ª", ordmasculine: "º",
};

function caracterDeNombre(nombre: string): string {
  if (NOMBRE_A_CARACTER[nombre]) return NOMBRE_A_CARACTER[nombre];
  const uni = /^uni([0-9A-Fa-f]{4,6})$/.exec(nombre);
  if (uni) return String.fromCodePoint(parseInt(uni[1], 16));
  const u = /^u([0-9A-Fa-f]{4,6})$/.exec(nombre);
  if (u) return String.fromCodePoint(parseInt(u[1], 16));
  if (nombre.length === 1) return nombre;
  return "";
}

/** Convierte una cadena hexadecimal de un CMap en texto. */
function hexAUnicode(hex: string): string {
  const limpio = hex.replace(/[^0-9a-fA-F]/g, "");
  let salida = "";
  for (let i = 0; i + 3 < limpio.length + 1; i += 4) {
    const unidad = parseInt(limpio.substr(i, 4), 16);
    if (Number.isFinite(unidad)) salida += String.fromCharCode(unidad);
  }
  return salida;
}

/** Analiza un CMap `/ToUnicode`: `beginbfchar` y `beginbfrange`. */
function leerToUnicode(cmap: string): { mapa: Map<number, string>; anchoCodigo: 1 | 2 } {
  const mapa = new Map<number, string>();
  let anchoCodigo: 1 | 2 = 2;

  const codespace = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(cmap);
  if (codespace) {
    const primero = /<([0-9a-fA-F]+)>/.exec(codespace[1]);
    if (primero && primero[1].length <= 2) anchoCodigo = 1;
  }

  for (const bloque of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of bloque[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      mapa.set(parseInt(par[1], 16), hexAUnicode(par[2]));
    }
  }
  for (const bloque of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // Forma 1: <desde> <hasta> <destino>
    for (const rango of bloque[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const desde = parseInt(rango[1], 16);
      const hasta = parseInt(rango[2], 16);
      const base = rango[3];
      for (let codigo = desde; codigo <= hasta && codigo - desde < 65536; codigo += 1) {
        const desplazado = (parseInt(base, 16) + (codigo - desde)).toString(16).padStart(base.length, "0");
        mapa.set(codigo, hexAUnicode(desplazado));
      }
    }
    // Forma 2: <desde> <hasta> [ <a> <b> … ]
    for (const rango of bloque[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const desde = parseInt(rango[1], 16);
      const destinos = [...rango[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => hexAUnicode(m[1]));
      destinos.forEach((destino, i) => mapa.set(desde + i, destino));
    }
  }
  return { mapa, anchoCodigo };
}

/** Construye el decodificador de una fuente a partir de su diccionario. */
function decodificadorDeFuente(dict: string, objetos: Map<number, ObjetoPdf>): Decodificador {
  const referenciaToUnicode = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(dict);
  const identidad = /\/Encoding\s*\/Identity-[HV]/.test(dict) || /\/Subtype\s*\/Type0/.test(dict);

  if (referenciaToUnicode) {
    const objeto = objetos.get(Number(referenciaToUnicode[1]));
    if (objeto?.flujo && objeto.flujo.length > 0) {
      const { mapa, anchoCodigo } = leerToUnicode(latin1(objeto.flujo));
      if (mapa.size > 0) {
        return {
          anchoCodigo: identidad ? 2 : anchoCodigo,
          mapa,
          respaldo: (codigo) => (identidad ? "" : porWinAnsi(codigo)),
        };
      }
    }
  }

  // Sin `/ToUnicode`: codificación simple de un byte, con sus diferencias.
  const mapa = new Map<number, string>();
  const referenciaCodificacion = /\/Encoding\s+(\d+)\s+\d+\s+R/.exec(dict);
  const cuerpoCodificacion = referenciaCodificacion
    ? (objetos.get(Number(referenciaCodificacion[1]))?.cuerpo ?? "")
    : dict;
  const diferencias = /\/Differences\s*\[([\s\S]*?)\]/.exec(cuerpoCodificacion);
  if (diferencias) {
    let codigo = 0;
    for (const pieza of diferencias[1].trim().split(/\s+/)) {
      if (/^\d+$/.test(pieza)) {
        codigo = Number(pieza);
        continue;
      }
      const caracter = caracterDeNombre(pieza.replace(/^\//, ""));
      if (caracter) mapa.set(codigo, caracter);
      codigo += 1;
    }
  }
  return { anchoCodigo: identidad ? 2 : 1, mapa, respaldo: porWinAnsi };
}

/* -------------------------------------------------------------------------- */
/*                        Interpretación de los operadores                     */
/* -------------------------------------------------------------------------- */

/** Recorta una cadena literal `(...)` resolviendo sus escapes. Devuelve bytes. */
function literalABytes(cuerpo: string): number[] {
  const salida: number[] = [];
  for (let i = 0; i < cuerpo.length; i += 1) {
    const caracter = cuerpo[i];
    if (caracter !== "\\") {
      salida.push(cuerpo.charCodeAt(i) & 0xff);
      continue;
    }
    const siguiente = cuerpo[i + 1];
    i += 1;
    switch (siguiente) {
      case "n": salida.push(10); break;
      case "r": salida.push(13); break;
      case "t": salida.push(9); break;
      case "b": salida.push(8); break;
      case "f": salida.push(12); break;
      case "\n": break;
      case "\r": if (cuerpo[i + 1] === "\n") i += 1; break;
      default:
        if (siguiente >= "0" && siguiente <= "7") {
          let octal = siguiente;
          while (octal.length < 3 && cuerpo[i + 1] >= "0" && cuerpo[i + 1] <= "7") {
            octal += cuerpo[i + 1];
            i += 1;
          }
          salida.push(parseInt(octal, 8) & 0xff);
        } else if (siguiente !== undefined) {
          salida.push(siguiente.charCodeAt(0) & 0xff);
        }
    }
  }
  return salida;
}

function hexABytes(cuerpo: string): number[] {
  const limpio = cuerpo.replace(/[^0-9a-fA-F]/g, "");
  const relleno = limpio.length % 2 === 0 ? limpio : `${limpio}0`;
  const salida: number[] = [];
  for (let i = 0; i < relleno.length; i += 2) salida.push(parseInt(relleno.substr(i, 2), 16));
  return salida;
}

function decodificar(bytes: number[], decodificador: Decodificador): string {
  const { anchoCodigo, mapa, respaldo } = decodificador;
  let salida = "";
  for (let i = 0; i < bytes.length; i += anchoCodigo) {
    const codigo = anchoCodigo === 2 ? ((bytes[i] << 8) | (bytes[i + 1] ?? 0)) : bytes[i];
    const traducido = mapa.get(codigo);
    salida += traducido !== undefined ? traducido : respaldo(codigo);
  }
  return salida;
}

/**
 * Contenido de un sub-diccionario, contando llaves.
 *
 * Hace falta porque un diccionario de PDF anida: `/Resources << /ExtGState << … >>
 * /Font << … >> >>`. Una expresión regular perezosa corta en el primer `>>` y se
 * deja fuera justo lo que se buscaba —fue lo que hizo que el lector no encontrara
 * las fuentes y devolviera glifos en lugar de texto—.
 */
function subDiccionario(cuerpo: string, clave: string): string {
  const marca = new RegExp(`/${clave}\\s*`).exec(cuerpo);
  if (!marca) return "";
  let i = marca.index + marca[0].length;
  if (cuerpo[i] !== "<" || cuerpo[i + 1] !== "<") return "";
  i += 2;
  const inicio = i;
  let profundidad = 1;
  while (i < cuerpo.length && profundidad > 0) {
    if (cuerpo[i] === "<" && cuerpo[i + 1] === "<") {
      profundidad += 1;
      i += 2;
      continue;
    }
    if (cuerpo[i] === ">" && cuerpo[i + 1] === ">") {
      profundidad -= 1;
      i += 2;
      continue;
    }
    i += 1;
  }
  return cuerpo.slice(inicio, Math.max(inicio, i - 2));
}

/** Sub-diccionario propio o resuelto por referencia indirecta. */
function subDiccionarioResuelto(
  cuerpo: string,
  clave: string,
  objetos: Map<number, ObjetoPdf>,
): string {
  const propio = subDiccionario(cuerpo, clave);
  if (propio) return propio;
  const referencia = new RegExp(`/${clave}\\s+(\\d+)\\s+\\d+\\s+R`).exec(cuerpo);
  if (!referencia) return "";
  return objetos.get(Number(referencia[1]))?.cuerpo ?? "";
}

/** Fuentes declaradas en el recurso de una página: `/F1 12 0 R`. */
function fuentesDePagina(
  recursos: string,
  objetos: Map<number, ObjetoPdf>,
): Map<string, Decodificador> {
  const fuentes = new Map<string, Decodificador>();
  const cuerpo = subDiccionarioResuelto(recursos, "Font", objetos);

  for (const entrada of cuerpo.matchAll(/\/([^\s/[\]<>]+)\s+(\d+)\s+\d+\s+R/g)) {
    const objeto = objetos.get(Number(entrada[2]));
    if (!objeto) continue;
    let dict = objeto.cuerpo;
    // Type0: la información útil (ToUnicode) está en el padre; el descendiente
    // aporta las métricas, que aquí no hacen falta.
    if (/\/Subtype\s*\/Type0/.test(dict) && !/\/ToUnicode/.test(dict)) {
      const descendiente = /\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/.exec(dict);
      if (descendiente) {
        const hijo = objetos.get(Number(descendiente[1]));
        if (hijo) dict += hijo.cuerpo;
      }
    }
    fuentes.set(entrada[1], decodificadorDeFuente(dict, objetos));
  }
  return fuentes;
}

/**
 * Recorre un flujo de contenido y devuelve fragmentos con su posición.
 *
 * Se mantiene el estado mínimo que hace falta para saber dónde cae cada trozo: la
 * matriz de texto (`Tm`), el desplazamiento de línea (`Td`, `TD`, `T*`) y el
 * interlineado (`TL`). No se implementa la pila de gráficos completa porque para
 * agrupar líneas de un examen no aporta nada.
 */
function fragmentosDeContenido(
  contenido: string,
  fuentes: Map<string, Decodificador>,
  pagina: number,
): Fragmento[] {
  const fragmentos: Fragmento[] = [];
  const respaldo: Decodificador = { anchoCodigo: 1, mapa: new Map(), respaldo: porWinAnsi };
  let actual = respaldo;
  let x = 0;
  let y = 0;
  let inicioLineaX = 0;
  let inicioLineaY = 0;
  let interlineado = 12;
  let tamano = 12;
  let volteado = false;

  // Un tokenizador suficiente: cadenas, arreglos, nombres, números y operadores.
  const patron =
    /\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|\[[^\]]*\]|\/[^\s/[\]()<>]+|-?\d*\.?\d+|[A-Za-z'"*]+/g;
  const piezas = contenido.match(patron) ?? [];
  const pila: string[] = [];

  const mostrar = (bytes: number[]) => {
    const texto = decodificar(bytes, actual);
    if (texto) fragmentos.push({ pagina, x, y, orden: volteado ? y : -y, tamano, texto });
  };

  for (const pieza of piezas) {
    if (/^[-\d.]/.test(pieza) || pieza.startsWith("(") || pieza.startsWith("<") || pieza.startsWith("[") || pieza.startsWith("/")) {
      pila.push(pieza);
      if (pila.length > 12) pila.shift();
      continue;
    }
    switch (pieza) {
      case "Tf": {
        const nombre = [...pila].reverse().find((p) => p.startsWith("/"));
        if (nombre) actual = fuentes.get(nombre.slice(1)) ?? respaldo;
        const declarado = Number(pila[pila.length - 1]);
        if (Number.isFinite(declarado) && declarado > 0) tamano = declarado;
        break;
      }
      case "TL":
        interlineado = Number(pila[pila.length - 1]) || interlineado;
        break;
      case "Td":
      case "TD": {
        const ty = Number(pila[pila.length - 1]) || 0;
        const tx = Number(pila[pila.length - 2]) || 0;
        if (pieza === "TD") interlineado = -ty || interlineado;
        inicioLineaX += tx;
        inicioLineaY += ty;
        x = inicioLineaX;
        y = inicioLineaY;
        break;
      }
      case "Tm": {
        const f = Number(pila[pila.length - 1]) || 0;
        const e = Number(pila[pila.length - 2]) || 0;
        const d = Number(pila[pila.length - 3]);
        if (Number.isFinite(d) && d !== 0) volteado = d < 0;
        inicioLineaX = e;
        inicioLineaY = f;
        x = e;
        y = f;
        break;
      }
      case "T*":
        inicioLineaY -= interlineado;
        x = inicioLineaX;
        y = inicioLineaY;
        break;
      case "BT":
        x = 0;
        y = 0;
        inicioLineaX = 0;
        inicioLineaY = 0;
        break;
      case "Tj":
      case "'":
      case '"': {
        if (pieza !== "Tj") {
          inicioLineaY -= interlineado;
          x = inicioLineaX;
          y = inicioLineaY;
        }
        const cadena = [...pila].reverse().find((p) => p.startsWith("(") || p.startsWith("<"));
        if (cadena) {
          mostrar(cadena.startsWith("(") ? literalABytes(cadena.slice(1, -1)) : hexABytes(cadena.slice(1, -1)));
        }
        break;
      }
      case "TJ": {
        const arreglo = [...pila].reverse().find((p) => p.startsWith("["));
        if (!arreglo) break;
        let acumulado = "";
        const partes = arreglo.match(/\((?:\\.|[^\\()])*\)|<[0-9a-fA-F\s]*>|-?\d*\.?\d+/g) ?? [];
        for (const parte of partes) {
          if (parte.startsWith("(")) {
            acumulado += decodificar(literalABytes(parte.slice(1, -1)), actual);
          } else if (parte.startsWith("<")) {
            acumulado += decodificar(hexABytes(parte.slice(1, -1)), actual);
          } else {
            // Un ajuste negativo grande es un espacio que el generador no escribió.
            if (Number(parte) < -140) acumulado += " ";
          }
        }
        if (acumulado) fragmentos.push({ pagina, x, y, orden: volteado ? y : -y, tamano, texto: acumulado });
        break;
      }
      default:
        break;
    }
    pila.length = 0;
  }
  return fragmentos;
}

/* -------------------------------------------------------------------------- */
/*                                  Fachada                                    */
/* -------------------------------------------------------------------------- */

/** Páginas del documento, en orden, con su contenido y sus recursos. */
function paginas(objetos: Map<number, ObjetoPdf>): { contenido: string; recursos: string }[] {
  const salida: { contenido: string; recursos: string }[] = [];
  const numeros = [...objetos.keys()].sort((a, b) => a - b);

  for (const numero of numeros) {
    const objeto = objetos.get(numero)!;
    if (!/\/Type\s*\/Page\b/.test(objeto.cuerpo)) continue;

    // Recursos: propios o heredados del padre.
    let recursos = subDiccionario(objeto.cuerpo, "Resources");
    if (!recursos) {
      const referencia = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(objeto.cuerpo);
      if (referencia) recursos = objetos.get(Number(referencia[1]))?.cuerpo ?? "";
    }
    if (!recursos) {
      const padre = /\/Parent\s+(\d+)\s+\d+\s+R/.exec(objeto.cuerpo);
      if (padre) {
        const cuerpoPadre = objetos.get(Number(padre[1]))?.cuerpo ?? "";
        recursos = subDiccionarioResuelto(cuerpoPadre, "Resources", objetos);
      }
    }

    // Contenido: una referencia o un arreglo de referencias.
    const referencias: number[] = [];
    const unaSola = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(objeto.cuerpo);
    if (unaSola) referencias.push(Number(unaSola[1]));
    const arreglo = /\/Contents\s*\[([\s\S]*?)\]/.exec(objeto.cuerpo);
    if (arreglo) {
      for (const referencia of arreglo[1].matchAll(/(\d+)\s+\d+\s+R/g)) referencias.push(Number(referencia[1]));
    }
    const contenido = referencias
      .map((referencia) => {
        const flujo = objetos.get(referencia)?.flujo;
        return flujo ? latin1(flujo) : "";
      })
      .join("\n");
    if (contenido.trim()) salida.push({ contenido, recursos });
  }
  return salida;
}

/**
 * Líneas de texto de un PDF, en orden de lectura.
 *
 * Devuelve una lista vacía cuando el PDF no tiene texto extraíble (un escaneo):
 * es información, no un fallo, y quien llama la usa para explicar que hace falta
 * un OCR en lugar de mostrar un resultado vacío sin motivo.
 */
export function extraerLineasPdf(bytes: Uint8Array): LineaPdf[] {
  let objetos: Map<number, ObjetoPdf>;
  try {
    objetos = leerObjetos(bytes);
  } catch {
    return [];
  }
  const fragmentos: Fragmento[] = [];
  paginas(objetos).forEach(({ contenido, recursos }, indice) => {
    try {
      const fuentes = fuentesDePagina(recursos, objetos);
      fragmentos.push(...fragmentosDeContenido(contenido, fuentes, indice));
    } catch {
      /* una página ilegible no debe tumbar el resto del documento */
    }
  });
  return agruparEnLineas(fragmentos);
}

/**
 * Agrupa fragmentos en líneas por su coordenada vertical.
 *
 * La tolerancia (2 puntos) absorbe los desplazamientos de subíndices y de
 * ajustes finos; ordenar por `x` dentro de la línea recompone el orden de
 * lectura aunque el generador haya emitido los trozos desordenados.
 */
function agruparEnLineas(fragmentos: Fragmento[]): LineaPdf[] {
  const lineas: { pagina: number; y: number; orden: number; piezas: Fragmento[] }[] = [];
  for (const fragmento of fragmentos) {
    const existente = lineas.find(
      (linea) => linea.pagina === fragmento.pagina && Math.abs(linea.y - fragmento.y) <= 2,
    );
    if (existente) existente.piezas.push(fragmento);
    else {
      lineas.push({ pagina: fragmento.pagina, y: fragmento.y, orden: fragmento.orden, piezas: [fragmento] });
    }
  }
  lineas.sort((a, b) => (a.pagina !== b.pagina ? a.pagina - b.pagina : a.orden - b.orden));
  return lineas
    .map((linea) => {
      const piezas = [...linea.piezas].sort((a, b) => a.x - b.x);
      let texto = "";
      let anterior: Fragmento | null = null;
      for (const pieza of piezas) {
        // Un hueco entre trozos puede ser un espacio que el generador no escribió.
        // El umbral se mide contra el TAMAÑO de la fuente, no contra la distancia
        // en bruto: los generadores que emiten un glifo por operador dejan huecos
        // de un carácter entre letras consecutivas, y con un umbral absoluto
        // aparecía un espacio entre cada letra («E l a b o r a r»).
        if (anterior && !/\s$/.test(texto) && !/^\s/.test(pieza.texto)) {
          // Un trozo de un solo carácter puede ser una letra ancha («m», «W»),
          // así que se le supone casi un cuadratín; a los trozos largos les basta
          // el ancho medio. Sin esta distinción salían espacios dentro de las
          // palabras («únicam ente»), que rompen la detección de preguntas.
          const factor = anterior.texto.length === 1 ? 0.88 : 0.5;
          const anchoEstimado = anterior.texto.length * anterior.tamano * factor;
          const hueco = pieza.x - (anterior.x + anchoEstimado);
          if (hueco > anterior.tamano * 0.28) texto += " ";
        }
        texto += pieza.texto;
        anterior = pieza;
      }
      return { pagina: linea.pagina, y: linea.y, texto: texto.replace(/\s+/g, " ").trim() };
    })
    .filter((linea) => linea.texto.length > 0);
}

/** Compatibilidad: el texto completo, con un salto por línea. */
export function extraerTextoPdf(bytes: Uint8Array): string {
  return extraerLineasPdf(bytes)
    .map((linea) => linea.texto)
    .join("\n");
}

export const utilidadesPdf = { latin1, texto1, leerToUnicode };
