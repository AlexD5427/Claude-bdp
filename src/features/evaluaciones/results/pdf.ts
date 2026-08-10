/**
 * Generador de PDF sin dependencias.
 *
 * ── Por qué escribir un PDF a mano ───────────────────────────────────────────
 * El encargo pide descargar un informe en PDF con el nombre, el número
 * identificador y el CI del participante. Las tres alternativas eran: añadir una
 * biblioteca (jsPDF pesa ~350 KB), abrir `window.print()` y pedir al usuario que
 * elija «Guardar como PDF» (no es una descarga, y el resultado depende del
 * navegador), o escribir el PDF.
 *
 * Un PDF de texto es un formato sorprendentemente simple: una cabecera, unos
 * objetos numerados, un flujo de contenido con operadores de texto y una tabla de
 * referencias cruzadas. Con Helvetica y `WinAnsiEncoding` —que cubre el español
 * completo, acentos y eñes incluidos— caben en ~250 líneas y cero kilobytes de
 * dependencias. El resultado se abre en cualquier lector y se puede archivar.
 *
 * Lo que este generador NO hace: imágenes, fuentes incrustadas ni tablas
 * complejas. No hacen falta para un informe de resultados.
 */

const ANCHO_PAGINA = 595.28; // A4 en puntos
const ALTO_PAGINA = 841.89;
const MARGEN = 48;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

type Fuente = "regular" | "negrita" | "mono";

const FUENTE_PDF: Record<Fuente, string> = {
  regular: "/F1",
  negrita: "/F2",
  mono: "/F3",
};

/**
 * Anchos aproximados de Helvetica, en milésimas de em.
 *
 * Se usan solo para partir líneas. Una tabla exacta de métricas ocuparía más que
 * todo este archivo y la diferencia visible es nula para un informe.
 */
function anchoTexto(texto: string, tamano: number, fuente: Fuente): number {
  const factor = fuente === "mono" ? 0.6 : fuente === "negrita" ? 0.56 : 0.5;
  return texto.length * tamano * factor;
}

/** Escapa los caracteres que un literal de cadena PDF no admite. */
function escapar(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Texto → bytes en WinAnsiEncoding (CP1252).
 *
 * Los caracteres fuera de CP1252 se sustituyen por un equivalente razonable en
 * lugar de desaparecer: un informe con «?» donde iba una comilla tipográfica es
 * peor que uno con una comilla recta.
 */
const SUSTITUCIONES: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
  "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00A0": " ",
  "\u2022": "-", "\u2192": "->", "\u2713": "v", "\u2717": "x",
};

function aWinAnsi(texto: string): string {
  let salida = "";
  for (const caracter of texto) {
    if (SUSTITUCIONES[caracter] !== undefined) {
      salida += SUSTITUCIONES[caracter];
      continue;
    }
    const codigo = caracter.codePointAt(0) ?? 63;
    salida += codigo <= 0xff ? caracter : "?";
  }
  return salida;
}

interface LineaTexto {
  tipo: "texto";
  texto: string;
  tamano: number;
  fuente: Fuente;
  gris?: number;
  espacioAntes?: number;
  /** Sangría izquierda, en puntos. */
  sangria?: number;
}

interface Regla {
  tipo: "regla";
  espacioAntes?: number;
}

interface Banda {
  tipo: "banda";
  texto: string;
  espacioAntes?: number;
}

interface Salto {
  tipo: "salto";
}

type Elemento = LineaTexto | Regla | Banda | Salto;

/**
 * Constructor de documentos.
 *
 * Se acumulan elementos y al final se pagina. Paginar al final y no al añadir
 * permite calcular los saltos con el alto real de cada bloque y, sobre todo,
 * numerar las páginas: hasta que no está todo colocado no se sabe cuántas hay, y
 * un acta que se archiva necesita decir «página 2 de 5».
 */
export class ConstructorPdf {
  private elementos: Elemento[] = [];
  private encabezadoTitulo = "";
  private encabezadoSubtitulo = "";
  private pie = "";

  /** Cabecera repetida en cada página. */
  encabezado(titulo: string, subtitulo = ""): this {
    this.encabezadoTitulo = titulo;
    this.encabezadoSubtitulo = subtitulo;
    return this;
  }

  /** Pie repetido en cada página, junto a la numeración. */
  pieDePagina(texto: string): this {
    this.pie = texto;
    return this;
  }

  titulo(texto: string): this {
    this.elementos.push({ tipo: "texto", texto, tamano: 18, fuente: "negrita", espacioAntes: 0 });
    return this;
  }

  subtitulo(texto: string): this {
    this.elementos.push({ tipo: "texto", texto, tamano: 12, fuente: "negrita", espacioAntes: 14 });
    return this;
  }

  /** Banda gris con el texto en negrita: separa las partes del acta. */
  banda(texto: string): this {
    this.elementos.push({ tipo: "banda", texto, espacioAntes: 12 });
    return this;
  }

  parrafo(
    texto: string,
    opciones: { tamano?: number; fuente?: Fuente; gris?: number; sangria?: number } = {},
  ): this {
    const tamano = opciones.tamano ?? 9.5;
    const fuente = opciones.fuente ?? "regular";
    const sangria = opciones.sangria ?? 0;
    for (const linea of this.partir(texto, tamano, fuente, sangria)) {
      this.elementos.push({
        tipo: "texto",
        texto: linea,
        tamano,
        fuente,
        gris: opciones.gris,
        espacioAntes: 2,
        sangria,
      });
    }
    return this;
  }

  campo(etiqueta: string, valor: string): this {
    return this.parrafo(`${etiqueta}: ${valor}`, { tamano: 9.5 });
  }

  /**
   * Una opción de respuesta tal como se le presentó al candidato.
   *
   * Los marcadores son de texto y no de color porque el acta se archiva y se
   * fotocopia: `[X]` es lo que eligió, `(v)` es la correcta. Un acta que solo
   * distinga con colores deja de decir nada en cuanto se imprime en blanco y
   * negro.
   */
  opcion(letra: string, texto: string, estado: { elegida: boolean; correcta: boolean }): this {
    const marca = estado.elegida ? "[X]" : "[ ]";
    const cola = estado.correcta ? "  (v) correcta" : "";
    return this.parrafo(`${marca} ${letra}) ${texto}${cola}`, {
      tamano: 9,
      fuente: estado.correcta || estado.elegida ? "negrita" : "regular",
      gris: estado.correcta || estado.elegida ? 0.1 : 0.35,
      sangria: 14,
    });
  }

  regla(): this {
    this.elementos.push({ tipo: "regla", espacioAntes: 8 });
    return this;
  }

  espacio(): this {
    this.elementos.push({ tipo: "texto", texto: "", tamano: 6, fuente: "regular", espacioAntes: 4 });
    return this;
  }

  saltoDePagina(): this {
    this.elementos.push({ tipo: "salto" });
    return this;
  }

  /** Parte un texto en líneas que caben en el ancho útil. */
  private partir(texto: string, tamano: number, fuente: Fuente, sangria = 0): string[] {
    const lineas: string[] = [];
    const disponible = ANCHO_UTIL - sangria;
    for (const parrafo of String(texto ?? "").split("\n")) {
      if (!parrafo.trim()) {
        lineas.push("");
        continue;
      }
      let actual = "";
      for (const palabra of parrafo.split(/\s+/)) {
        const tentativa = actual ? `${actual} ${palabra}` : palabra;
        if (anchoTexto(tentativa, tamano, fuente) > disponible && actual) {
          lineas.push(actual);
          actual = palabra;
        } else {
          actual = tentativa;
        }
      }
      if (actual) lineas.push(actual);
    }
    return lineas;
  }

  /** Serializa el documento completo. */
  construir(): Blob {
    const paginas: string[] = [];
    let contenido = "";
    const altoCabecera = this.encabezadoTitulo ? 46 : 0;
    const topeSuperior = ALTO_PAGINA - MARGEN - altoCabecera;
    const suelo = this.pie ? MARGEN + 18 : MARGEN;
    let y = topeSuperior;

    const cerrarPagina = () => {
      paginas.push(contenido);
      contenido = "";
      y = topeSuperior;
    };

    for (const elemento of this.elementos) {
      if (elemento.tipo === "salto") {
        if (contenido) cerrarPagina();
        continue;
      }
      const espacio = elemento.espacioAntes ?? 0;
      const alto = elemento.tipo === "texto" ? elemento.tamano * 1.35 : elemento.tipo === "banda" ? 20 : 10;
      if (y - espacio - alto < suelo) cerrarPagina();
      y -= espacio;

      if (elemento.tipo === "regla") {
        contenido += `0.8 G ${MARGEN} ${y.toFixed(2)} m ${(ANCHO_PAGINA - MARGEN).toFixed(2)} ${y.toFixed(2)} l S\n`;
        y -= 4;
        continue;
      }
      if (elemento.tipo === "banda") {
        y -= 15;
        contenido +=
          `0.92 g ${MARGEN} ${y.toFixed(2)} ${ANCHO_UTIL.toFixed(2)} 15 re f\n` +
          `BT 0.08 g /F2 10 Tf ${(MARGEN + 6).toFixed(2)} ${(y + 4.5).toFixed(2)} Td ` +
          `(${escapar(aWinAnsi(elemento.texto))}) Tj ET\n`;
        y -= 4;
        continue;
      }
      y -= elemento.tamano;
      const gris = elemento.gris ?? 0.1;
      contenido +=
        `BT ${gris} g ${FUENTE_PDF[elemento.fuente]} ${elemento.tamano} Tf ` +
        `${(MARGEN + (elemento.sangria ?? 0)).toFixed(2)} ${y.toFixed(2)} Td (${escapar(aWinAnsi(elemento.texto))}) Tj ET\n`;
      y -= elemento.tamano * 0.35;
    }
    if (contenido) paginas.push(contenido);
    if (paginas.length === 0) paginas.push("");

    return this.ensamblar(paginas.map((pagina, indice) => this.conAdornos(pagina, indice, paginas.length)));
  }

  /** Añade cabecera y pie a una página ya compuesta. */
  private conAdornos(pagina: string, indice: number, total: number): string {
    let salida = pagina;
    if (this.encabezadoTitulo) {
      const base = ALTO_PAGINA - MARGEN;
      salida =
        `BT 0.05 g /F2 11 Tf ${MARGEN} ${(base - 11).toFixed(2)} Td (${escapar(aWinAnsi(this.encabezadoTitulo))}) Tj ET\n` +
        (this.encabezadoSubtitulo
          ? `BT 0.45 g /F1 8.5 Tf ${MARGEN} ${(base - 23).toFixed(2)} Td (${escapar(aWinAnsi(this.encabezadoSubtitulo))}) Tj ET\n`
          : "") +
        `0.75 G ${MARGEN} ${(base - 30).toFixed(2)} m ${(ANCHO_PAGINA - MARGEN).toFixed(2)} ${(base - 30).toFixed(2)} l S\n` +
        salida;
    }
    if (this.pie) {
      const numero = `Página ${indice + 1} de ${total}`;
      salida +=
        `BT 0.5 g /F1 8 Tf ${MARGEN} ${(MARGEN - 6).toFixed(2)} Td (${escapar(aWinAnsi(this.pie))}) Tj ET\n` +
        `BT 0.5 g /F1 8 Tf ${(ANCHO_PAGINA - MARGEN - anchoTexto(numero, 8, "regular")).toFixed(2)} ${(MARGEN - 6).toFixed(2)} Td (${escapar(aWinAnsi(numero))}) Tj ET\n`;
    }
    return salida;
  }

  /**
   * Ensambla los objetos del PDF y su tabla de referencias cruzadas.
   *
   * El orden importa: los desplazamientos de `xref` se miden en bytes desde el
   * inicio del archivo, así que se calculan mientras se concatena.
   */
  private ensamblar(paginas: string[]): Blob {
    const objetos: string[] = [];
    const totalPaginas = paginas.length;
    const idPrimeraPagina = 4;
    const idPrimerContenido = idPrimeraPagina + totalPaginas;

    // 1: catálogo · 2: páginas · 3: fuentes agrupadas en recursos
    objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
    const hijos = Array.from({ length: totalPaginas }, (_, i) => `${idPrimeraPagina + i} 0 R`).join(" ");
    objetos.push(`<< /Type /Pages /Kids [${hijos}] /Count ${totalPaginas} >>`);
    objetos.push(
      "<< /Font << " +
        "/F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> " +
        "/F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> " +
        "/F3 << /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >> " +
        ">> >>",
    );

    for (let i = 0; i < totalPaginas; i += 1) {
      objetos.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO_PAGINA} ${ALTO_PAGINA}] ` +
          `/Resources 3 0 R /Contents ${idPrimerContenido + i} 0 R >>`,
      );
    }
    for (const pagina of paginas) {
      objetos.push(`<< /Length ${pagina.length} >>\nstream\n${pagina}endstream`);
    }

    let salida = "%PDF-1.4\n";
    const desplazamientos: number[] = [];
    objetos.forEach((objeto, indice) => {
      desplazamientos.push(salida.length);
      salida += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
    });
    const inicioXref = salida.length;
    salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const desplazamiento of desplazamientos) {
      salida += `${String(desplazamiento).padStart(10, "0")} 00000 n \n`;
    }
    salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

    // `latin1` conserva byte a byte lo que escribimos, que ya está en WinAnsi.
    const bytes = new Uint8Array(salida.length);
    for (let i = 0; i < salida.length; i += 1) bytes[i] = salida.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: "application/pdf" });
  }
}

/** Descarga un blob con un nombre de archivo. */
export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  // Se libera en el siguiente ciclo: revocar antes cancela la descarga en Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de archivo seguro a partir de datos del participante. */
export function nombreArchivo(partes: (string | number | null | undefined)[], extension = "pdf"): string {
  const base = partes
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== "")
    .map((p) =>
      String(p)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .join("_")
    .slice(0, 120);
  return `${base || "informe"}.${extension}`;
}
