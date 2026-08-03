/**
 * Modelo de texto enriquecido — implementación de referencia en TypeScript.
 *
 * Es el espejo exacto de `apps-script/evaluaciones/07_RichText.gs`. El contrato
 * completo, pensado para que un segundo frontend (o otra IA) lo implemente sin
 * adivinar nada, está en `docs/evaluaciones/TEXTO_ENRIQUECIDO.md`.
 *
 * ── El modelo en una frase ───────────────────────────────────────────────────
 * Un documento son BLOQUES; cada bloque tiene FRAGMENTOS; cada fragmento tiene
 * texto, marcas de una lista blanca y, opcionalmente, un enlace seguro.
 *
 *   { v: 1, b: [ { t: "p", s: [ { x: "texto", m: ["b"], l: "https://…" } ] } ] }
 *
 * ── Por qué no HTML ──────────────────────────────────────────────────────────
 * Porque entonces cada consumidor tendría que defenderse de `<script>` y basta
 * que uno se olvide para tener XSS. Aquí lo único que existe son textos y cinco
 * marcas: renderizarlo es seguro por construcción.
 *
 * ── Dos representaciones ─────────────────────────────────────────────────────
 * El documento (`RichDoc`) es lo que se guarda y lo que viaja. El editor trabaja
 * con una forma más cómoda para un `textarea` (`EditableBlock`: texto plano más
 * rangos de marcas) y convierte en los dos sentidos. La conversión es
 * determinista y está probada en las dos direcciones, porque un editor que
 * pierde formato al guardar es peor que no tener formato.
 */

export const RICH_TEXT_VERSION = 1;

export const RICH_BLOCK_TYPES = ["p", "h1", "h2", "h3", "ul", "ol", "quote", "code"] as const;
export type RichBlockType = (typeof RICH_BLOCK_TYPES)[number];

export const RICH_MARKS = ["b", "i", "u", "s", "c"] as const;
export type RichMark = (typeof RICH_MARKS)[number];

export interface RichSpan {
  /** Texto del fragmento. */
  x: string;
  /** Marcas activas. Ausente cuando no hay ninguna. */
  m?: RichMark[];
  /** Enlace, solo `http(s)` o `mailto`. */
  l?: string;
}

export interface RichBlock {
  t: RichBlockType;
  s: RichSpan[];
}

export interface RichDoc {
  v: number;
  b: RichBlock[];
}

/** Etiquetas de los tipos de bloque para la interfaz. */
export const RICH_BLOCK_LABEL: Record<RichBlockType, string> = {
  p: "Párrafo",
  h1: "Título 1",
  h2: "Título 2",
  h3: "Título 3",
  ul: "Lista con viñetas",
  ol: "Lista numerada",
  quote: "Cita",
  code: "Código",
};

export const RICH_MARK_LABEL: Record<RichMark, string> = {
  b: "Negrita",
  i: "Cursiva",
  u: "Subrayado",
  s: "Tachado",
  c: "Monoespaciado",
};

const LIMITS = {
  blocks: 60,
  spansPerBlock: 80,
  spanChars: 4000,
  totalChars: 20000,
  linkChars: 600,
};

export function emptyRichDoc(): RichDoc {
  return { v: RICH_TEXT_VERSION, b: [] };
}

/** Quita caracteres de control y acota la longitud. */
function cleanText(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  // eslint-disable-next-line no-control-regex
  const stripped = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return stripped.length > max ? stripped.slice(0, max) : stripped;
}

/**
 * Enlace admisible.
 *
 * Solo `http`, `https` y `mailto`. Cualquier otro esquema se descarta: el texto
 * se conserva y el enlace desaparece. Es la única defensa que el renderizador
 * necesita, y por eso vive aquí y no en cada componente.
 */
export function safeRichLink(value: unknown): string {
  const url = cleanText(value, LIMITS.linkChars).trim();
  if (!url) return "";
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
  return "";
}

/** Texto plano → documento con un párrafo por línea. */
export function richFromPlain(text: string): RichDoc {
  const raw = String(text ?? "");
  if (!raw) return emptyRichDoc();
  const blocks: RichBlock[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (blocks.length >= LIMITS.blocks) break;
    blocks.push({ t: "p", s: [{ x: cleanText(line, LIMITS.spanChars) }] });
  }
  return { v: RICH_TEXT_VERSION, b: blocks };
}

/**
 * Sanea cualquier entrada y devuelve un documento válido.
 *
 * Nunca lanza: lo que no encaja se descarta. Acepta también una cadena (se lee
 * como texto plano) para que un importador simple no tenga que construir el
 * modelo.
 */
export function sanitizeRichDoc(input: unknown): RichDoc {
  if (input === null || input === undefined || input === "") return emptyRichDoc();
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        return sanitizeRichDoc(JSON.parse(trimmed));
      } catch {
        return richFromPlain(input);
      }
    }
    return richFromPlain(input);
  }
  if (Array.isArray(input)) return sanitizeRichDoc({ v: RICH_TEXT_VERSION, b: input });
  if (typeof input !== "object") return richFromPlain(String(input));

  const source = input as { b?: unknown; blocks?: unknown };
  const rawBlocks = Array.isArray(source.b)
    ? source.b
    : Array.isArray(source.blocks)
      ? source.blocks
      : [];

  const blocks: RichBlock[] = [];
  let total = 0;

  for (const rawBlock of rawBlocks) {
    if (blocks.length >= LIMITS.blocks || total >= LIMITS.totalChars) break;
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const candidate = rawBlock as { t?: unknown; type?: unknown; s?: unknown; spans?: unknown };
    const rawType = String(candidate.t ?? candidate.type ?? "p") as RichBlockType;
    const type: RichBlockType = RICH_BLOCK_TYPES.includes(rawType) ? rawType : "p";

    const rawSpans = Array.isArray(candidate.s)
      ? candidate.s
      : Array.isArray(candidate.spans)
        ? candidate.spans
        : [];

    const spans: RichSpan[] = [];
    for (const rawSpan of rawSpans) {
      if (spans.length >= LIMITS.spansPerBlock || total >= LIMITS.totalChars) break;
      let text: unknown;
      let marks: RichMark[] = [];
      let link = "";
      if (typeof rawSpan === "string") {
        text = rawSpan;
      } else if (rawSpan && typeof rawSpan === "object") {
        const span = rawSpan as { x?: unknown; text?: unknown; m?: unknown; marks?: unknown; l?: unknown; link?: unknown };
        text = span.x ?? span.text;
        const rawMarks = Array.isArray(span.m) ? span.m : Array.isArray(span.marks) ? span.marks : [];
        for (const mark of rawMarks) {
          const value = String(mark) as RichMark;
          if (RICH_MARKS.includes(value) && !marks.includes(value)) marks.push(value);
        }
        marks = RICH_MARKS.filter((m) => marks.includes(m));
        link = safeRichLink(span.l ?? span.link);
      } else {
        continue;
      }
      let clean = cleanText(text, LIMITS.spanChars);
      if (!clean) continue;
      if (total + clean.length > LIMITS.totalChars) {
        clean = clean.slice(0, Math.max(0, LIMITS.totalChars - total));
        if (!clean) break;
      }
      total += clean.length;
      const entry: RichSpan = { x: clean };
      if (marks.length > 0) entry.m = marks;
      if (link) entry.l = link;
      spans.push(entry);
    }
    blocks.push({ t: type, s: spans });
  }

  while (blocks.length > 0 && blocks[blocks.length - 1].s.length === 0) blocks.pop();
  return { v: RICH_TEXT_VERSION, b: blocks };
}

/**
 * Proyección a texto plano.
 *
 * Las listas se marcan con «• » y «1. » para que el resultado sea legible en un
 * informe o en una celda. Es una proyección, no una ida y vuelta.
 */
export function richToPlain(doc: unknown): string {
  const sane = isRichDoc(doc) ? (doc as RichDoc) : sanitizeRichDoc(doc);
  const lines: string[] = [];
  let ordinal = 0;
  for (const block of sane.b) {
    const text = block.s.map((span) => span.x).join("");
    if (block.t === "ul") {
      lines.push(`• ${text}`);
      ordinal = 0;
    } else if (block.t === "ol") {
      ordinal += 1;
      lines.push(`${ordinal}. ${text}`);
    } else {
      ordinal = 0;
      lines.push(text);
    }
  }
  return lines.join("\n");
}

function isRichDoc(value: unknown): boolean {
  return !!value && typeof value === "object" && Array.isArray((value as RichDoc).b);
}

/** ¿El documento no tiene ningún carácter visible? */
export function isRichEmpty(doc: unknown): boolean {
  return richToPlain(doc).replace(/\s+/g, "") === "";
}

/** Número de caracteres visibles. Se usa para las estimaciones de duración. */
export function richLength(doc: unknown): number {
  return richToPlain(doc).length;
}

/* ------------------------------------------------------------------------- */
/*                       Forma editable (texto + rangos)                     */
/* ------------------------------------------------------------------------- */

/**
 * Un rango de marca sobre el texto plano del bloque.
 *
 * `[inicio, fin)` en índices de carácter. Es la forma que un `textarea` puede
 * manipular con la API de selección del navegador, sin `contentEditable`.
 */
export interface MarkRange {
  inicio: number;
  fin: number;
  marca: RichMark;
}

export interface LinkRange {
  inicio: number;
  fin: number;
  url: string;
}

export interface EditableBlock {
  id: string;
  tipo: RichBlockType;
  texto: string;
  marcas: MarkRange[];
  enlaces: LinkRange[];
}

let editableCounter = 0;

function nextEditableId(): string {
  editableCounter += 1;
  return `blk_${editableCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Documento → bloques editables. */
export function toEditable(doc: unknown): EditableBlock[] {
  const sane = sanitizeRichDoc(doc);
  if (sane.b.length === 0) {
    return [{ id: nextEditableId(), tipo: "p", texto: "", marcas: [], enlaces: [] }];
  }
  return sane.b.map((block) => {
    let cursor = 0;
    let texto = "";
    const marcas: MarkRange[] = [];
    const enlaces: LinkRange[] = [];
    for (const span of block.s) {
      const inicio = cursor;
      texto += span.x;
      cursor += span.x.length;
      for (const marca of span.m ?? []) marcas.push({ inicio, fin: cursor, marca });
      if (span.l) enlaces.push({ inicio, fin: cursor, url: span.l });
    }
    return {
      id: nextEditableId(),
      tipo: block.t,
      texto,
      marcas: mergeRanges(marcas),
      enlaces,
    };
  });
}

/** Bloques editables → documento. */
export function fromEditable(blocks: EditableBlock[]): RichDoc {
  const out: RichBlock[] = [];
  for (const block of blocks) {
    out.push({ t: block.tipo, s: spansOf(block) });
  }
  while (out.length > 0 && out[out.length - 1].s.length === 0) out.pop();
  return sanitizeRichDoc({ v: RICH_TEXT_VERSION, b: out });
}

/**
 * Fragmentos de un bloque editable.
 *
 * Se recorren los puntos de corte (todos los inicios y finales de rango) y se
 * emite un fragmento por tramo con el conjunto de marcas activo. Así el resultado
 * es canónico: dos ediciones que producen el mismo formato producen el mismo
 * JSON, lo que hace que las huellas de versión sean estables.
 */
export function spansOf(block: EditableBlock): RichSpan[] {
  const texto = block.texto;
  if (!texto) return [];
  const cortes = new Set<number>([0, texto.length]);
  for (const rango of block.marcas) {
    cortes.add(clamp(rango.inicio, texto.length));
    cortes.add(clamp(rango.fin, texto.length));
  }
  for (const rango of block.enlaces) {
    cortes.add(clamp(rango.inicio, texto.length));
    cortes.add(clamp(rango.fin, texto.length));
  }
  const puntos = [...cortes].sort((a, b) => a - b);
  const spans: RichSpan[] = [];
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const desde = puntos[i];
    const hasta = puntos[i + 1];
    if (hasta <= desde) continue;
    const trozo = texto.slice(desde, hasta);
    if (!trozo) continue;
    const marcas = RICH_MARKS.filter((marca) =>
      block.marcas.some((r) => r.marca === marca && r.inicio <= desde && r.fin >= hasta),
    );
    const enlace = block.enlaces.find((r) => r.inicio <= desde && r.fin >= hasta);
    const span: RichSpan = { x: trozo };
    if (marcas.length > 0) span.m = [...marcas];
    if (enlace) span.l = enlace.url;
    // Se fusiona con el anterior cuando el formato es idéntico: menos ruido en el
    // JSON y huellas más estables.
    const previo = spans[spans.length - 1];
    if (previo && sameFormat(previo, span)) previo.x += span.x;
    else spans.push(span);
  }
  return spans;
}

function sameFormat(a: RichSpan, b: RichSpan): boolean {
  return (a.m ?? []).join() === (b.m ?? []).join() && (a.l ?? "") === (b.l ?? "");
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), max));
}

/** Une los rangos de la misma marca que se solapan o se tocan. */
export function mergeRanges(rangos: MarkRange[]): MarkRange[] {
  const out: MarkRange[] = [];
  for (const marca of RICH_MARKS) {
    const propios = rangos
      .filter((r) => r.marca === marca && r.fin > r.inicio)
      .sort((a, b) => a.inicio - b.inicio);
    let actual: MarkRange | null = null;
    for (const rango of propios) {
      if (actual && rango.inicio <= actual.fin) {
        actual.fin = Math.max(actual.fin, rango.fin);
      } else {
        actual = { ...rango };
        out.push(actual);
      }
    }
  }
  return out;
}

/** Aplica (o quita) una marca en un rango. Devuelve los rangos resultantes. */
export function toggleMark(
  rangos: MarkRange[],
  marca: RichMark,
  inicio: number,
  fin: number,
): MarkRange[] {
  if (fin <= inicio) return rangos;
  const activo = isMarkActive(rangos, marca, inicio, fin);
  const otros = rangos.filter((r) => r.marca !== marca);
  const propios = rangos.filter((r) => r.marca === marca);

  if (activo) {
    const recortados: MarkRange[] = [];
    for (const rango of propios) {
      if (rango.fin <= inicio || rango.inicio >= fin) {
        recortados.push(rango);
        continue;
      }
      if (rango.inicio < inicio) recortados.push({ ...rango, fin: inicio });
      if (rango.fin > fin) recortados.push({ ...rango, inicio: fin });
    }
    return mergeRanges([...otros, ...recortados]);
  }
  return mergeRanges([...otros, ...propios, { inicio, fin, marca }]);
}

/** ¿La marca cubre TODO el rango? */
export function isMarkActive(rangos: MarkRange[], marca: RichMark, inicio: number, fin: number): boolean {
  if (fin <= inicio) return false;
  let cursor = inicio;
  const propios = rangos
    .filter((r) => r.marca === marca)
    .sort((a, b) => a.inicio - b.inicio);
  for (const rango of propios) {
    if (rango.fin <= cursor) continue;
    if (rango.inicio > cursor) return false;
    cursor = Math.max(cursor, rango.fin);
    if (cursor >= fin) return true;
  }
  return cursor >= fin;
}

/**
 * Reajusta los rangos cuando el texto cambia.
 *
 * Se compara el texto anterior con el nuevo, se localiza el tramo que cambió por
 * prefijo y sufijo común, y los rangos se desplazan o se recortan. Sin esto,
 * escribir al principio de un párrafo desplazaría todo el formato y el negrita
 * acabaría en la palabra equivocada — un fallo clásico y muy visible.
 */
export function shiftRanges<T extends { inicio: number; fin: number }>(
  rangos: T[],
  textoAnterior: string,
  textoNuevo: string,
): T[] {
  if (textoAnterior === textoNuevo) return rangos;
  let prefijo = 0;
  const maxPrefijo = Math.min(textoAnterior.length, textoNuevo.length);
  while (prefijo < maxPrefijo && textoAnterior[prefijo] === textoNuevo[prefijo]) prefijo += 1;

  let sufijo = 0;
  while (
    sufijo < maxPrefijo - prefijo &&
    textoAnterior[textoAnterior.length - 1 - sufijo] === textoNuevo[textoNuevo.length - 1 - sufijo]
  ) {
    sufijo += 1;
  }

  const borradoDesde = prefijo;
  const borradoHasta = textoAnterior.length - sufijo;
  const insertado = textoNuevo.length - sufijo - prefijo;
  const delta = insertado - (borradoHasta - borradoDesde);

  const out: T[] = [];
  for (const rango of rangos) {
    const inicio = mapIndex(rango.inicio, borradoDesde, borradoHasta, delta);
    const fin = mapIndex(rango.fin, borradoDesde, borradoHasta, delta);
    if (fin > inicio) out.push({ ...rango, inicio, fin });
  }
  return out;
}

function mapIndex(index: number, desde: number, hasta: number, delta: number): number {
  if (index <= desde) return index;
  if (index >= hasta) return index + delta;
  // Estaba dentro del tramo reemplazado: se ancla al inicio del cambio.
  return desde;
}
