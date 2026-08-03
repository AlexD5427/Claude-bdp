/**
 * 07_RichText.gs — modelo de texto enriquecido, saneado y proyección a plano.
 *
 * ── El modelo ────────────────────────────────────────────────────────────────
 * Un valor de texto enriquecido es un documento con bloques, y cada bloque tiene
 * fragmentos («spans») con marcas:
 *
 *   {
 *     "v": 1,
 *     "b": [                                  // bloques, en orden
 *       { "t": "p",                           // tipo de bloque
 *         "s": [                              // fragmentos
 *           { "x": "El margen es ", "m": [] },
 *           { "x": "obligatorio",  "m": ["b"] },
 *           { "x": " (ver norma)", "m": ["i"], "l": "https://…" }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Tipos de bloque:  p · h1 · h2 · h3 · ul · ol · quote · code
 * Marcas:           b (negrita) · i (cursiva) · u (subrayado) · s (tachado) ·
 *                   c (monoespaciado)
 *
 * ── Por qué así ──────────────────────────────────────────────────────────────
 * Se eligió un modelo de fragmentos y no HTML por tres razones concretas:
 *
 *  1. **No hay que sanear HTML.** Guardar HTML significa que cada consumidor
 *     tiene que defenderse de `<script>` y de atributos peligrosos, y basta que
 *     uno se olvide para tener XSS. Aquí lo único que puede existir son textos y
 *     un puñado de marcas de una lista blanca; renderizarlo es seguro por
 *     construcción.
 *  2. **Es portable.** El segundo frontend solo necesita recorrer bloques y
 *     fragmentos. No hace falta un parser ni una biblioteca de editor.
 *  3. **Cabe en una celda.** Es JSON compacto y sin ruido, así que el texto de
 *     una pregunta larga sigue entrando en el límite de Sheets.
 *
 * Cada campo enriquecido se guarda DOS veces: el JSON y un espejo en texto plano
 * (`*_texto`). El espejo hace que el libro sea legible a mano, que se pueda
 * buscar con Ctrl+F y que un informe o un CSV no tengan que entender el modelo.
 *
 * El contrato completo, con el renderizador de referencia, está en
 * `docs/evaluaciones/TEXTO_ENRIQUECIDO.md`.
 */

var EV_RT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'quote', 'code'];
var EV_RT_MARKS = ['b', 'i', 'u', 's', 'c'];

var EV_RT_LIMITS = {
  BLOCKS: 60,
  SPANS_PER_BLOCK: 80,
  SPAN_CHARS: 4000,
  TOTAL_CHARS: 20000,
  LINK_CHARS: 600
};

/** Documento vacío canónico. */
function evRichEmpty_() {
  return { v: EV_BACKEND.richTextVersion, b: [] };
}

/** ¿Está vacío (sin ningún carácter visible)? */
function evRichIsEmpty_(doc) {
  return evRichToPlain_(doc).replace(/\s+/g, '') === '';
}

/** Texto plano → documento de un solo párrafo por línea. */
function evRichFromPlain_(text) {
  var raw = String(text === null || text === undefined ? '' : text);
  if (!raw) return evRichEmpty_();
  var lines = raw.split(/\r?\n/);
  var blocks = [];
  for (var i = 0; i < lines.length && blocks.length < EV_RT_LIMITS.BLOCKS; i++) {
    blocks.push({ t: 'p', s: [{ x: evRaw_(lines[i], EV_RT_LIMITS.SPAN_CHARS), m: [] }] });
  }
  return { v: EV_BACKEND.richTextVersion, b: blocks };
}

/**
 * Enlace admisible.
 *
 * Solo `http`, `https` y `mailto`. Cualquier otra cosa (`javascript:`, `data:`,
 * rutas relativas) se descarta en silencio: el enlace desaparece y el texto se
 * conserva. Es la única defensa que el renderizador necesita.
 */
function evRichSafeLink_(value) {
  var url = evRaw_(value, EV_RT_LIMITS.LINK_CHARS).trim();
  if (!url) return '';
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
  return '';
}

/**
 * Sanea un documento que llega del cliente.
 *
 * Acepta también una cadena (se interpreta como texto plano) para que un cliente
 * antiguo o un importador simple no tengan que construir el modelo. Nunca lanza:
 * lo que no encaja se descarta, y lo que queda es válido por construcción.
 */
function evRichSanitize_(input) {
  if (input === null || input === undefined || input === '') return evRichEmpty_();
  if (typeof input === 'string') {
    var parsed = evParseJson_(input, null);
    return parsed && typeof parsed === 'object' ? evRichSanitize_(parsed) : evRichFromPlain_(input);
  }
  if (Array.isArray(input)) return evRichSanitize_({ v: 1, b: input });
  if (typeof input !== 'object') return evRichFromPlain_(String(input));

  var blocksIn = Array.isArray(input.b) ? input.b : (Array.isArray(input.blocks) ? input.blocks : []);
  var out = [];
  var total = 0;

  for (var i = 0; i < blocksIn.length && out.length < EV_RT_LIMITS.BLOCKS; i++) {
    var raw = blocksIn[i];
    if (!raw || typeof raw !== 'object') continue;
    var type = String(raw.t || raw.type || 'p');
    if (EV_RT_BLOCKS.indexOf(type) < 0) type = 'p';

    var spansIn = Array.isArray(raw.s) ? raw.s : (Array.isArray(raw.spans) ? raw.spans : []);
    var spans = [];
    for (var j = 0; j < spansIn.length && spans.length < EV_RT_LIMITS.SPANS_PER_BLOCK; j++) {
      var span = spansIn[j];
      var text;
      var marks = [];
      var link = '';
      if (typeof span === 'string') {
        text = span;
      } else if (span && typeof span === 'object') {
        text = span.x === undefined ? span.text : span.x;
        var marksIn = Array.isArray(span.m) ? span.m : (Array.isArray(span.marks) ? span.marks : []);
        for (var m = 0; m < marksIn.length; m++) {
          var mark = String(marksIn[m]);
          if (EV_RT_MARKS.indexOf(mark) >= 0 && marks.indexOf(mark) < 0) marks.push(mark);
        }
        link = evRichSafeLink_(span.l === undefined ? span.link : span.l);
      } else {
        continue;
      }
      var clean = evRaw_(text, EV_RT_LIMITS.SPAN_CHARS);
      if (clean === '') continue;
      if (total + clean.length > EV_RT_LIMITS.TOTAL_CHARS) {
        clean = clean.slice(0, Math.max(0, EV_RT_LIMITS.TOTAL_CHARS - total));
        if (!clean) break;
      }
      total += clean.length;
      var entry = { x: clean };
      if (marks.length > 0) entry.m = marks;
      if (link) entry.l = link;
      spans.push(entry);
    }
    // Un bloque sin fragmentos representa una línea en blanco deliberada; se
    // conserva solo si el documento tiene más contenido, para no acumular vacíos.
    out.push({ t: type, s: spans });
    if (total >= EV_RT_LIMITS.TOTAL_CHARS) break;
  }

  while (out.length > 0 && out[out.length - 1].s.length === 0) out.pop();
  return { v: EV_BACKEND.richTextVersion, b: out };
}

/**
 * Proyección a texto plano.
 *
 * Las listas se marcan con «• » y «1. » para que el espejo del libro y los
 * informes sean legibles sin interpretar el modelo. Es una proyección, no una
 * ida y vuelta: no se pretende reconstruir el documento desde aquí.
 */
function evRichToPlain_(doc) {
  var sane = doc && doc.b ? doc : evRichSanitize_(doc);
  var lines = [];
  var ordinal = 0;
  for (var i = 0; i < sane.b.length; i++) {
    var block = sane.b[i];
    var text = '';
    for (var j = 0; j < block.s.length; j++) text += block.s[j].x;
    if (block.t === 'ul') {
      lines.push('• ' + text);
      ordinal = 0;
    } else if (block.t === 'ol') {
      ordinal++;
      lines.push(ordinal + '. ' + text);
    } else {
      ordinal = 0;
      lines.push(text);
    }
  }
  return evRaw_(lines.join('\n'), EV_RT_LIMITS.TOTAL_CHARS);
}

/**
 * Par listo para guardar: `{ json, texto }`.
 *
 * Todas las escrituras de un campo enriquecido pasan por aquí, así que el JSON y
 * su espejo no pueden desincronizarse.
 */
function evRichPair_(input) {
  var doc = evRichSanitize_(input);
  return { json: evRichIsEmpty_(doc) ? '' : evWriteJson_(doc), texto: evRichToPlain_(doc) };
}

/** Lectura: `{ json, texto }` de la hoja → documento saneado. */
function evRichRead_(json, texto) {
  if (json) return evRichSanitize_(json);
  if (texto) return evRichFromPlain_(texto);
  return evRichEmpty_();
}
