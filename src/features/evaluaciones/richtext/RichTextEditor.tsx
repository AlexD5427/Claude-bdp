/**
 * Editor de texto enriquecido — sin `contentEditable`, pero con el formato A LA VISTA.
 *
 * ── La decisión de diseño, y la corrección de esta iteración ──────────────────
 * Los editores enriquecidos suelen construirse sobre `contentEditable` y
 * `document.execCommand`. Esa vía trae tres problemas conocidos: `execCommand`
 * está obsoleto, cada navegador produce un HTML distinto, y el estado real vive en
 * el DOM en lugar de en React, así que el componente pierde el control de lo que
 * se guarda. Añadir una biblioteca de editor (ProseMirror, Slate, TipTap) resolvería
 * eso a cambio de 100–300 KB y de un modelo de datos ajeno.
 *
 * Aquí el editor son `textarea` normales, uno por bloque, y el formato se guarda
 * como RANGOS `[inicio, fin)` sobre el texto plano de cada bloque. Eso se conserva.
 *
 * Lo que la versión anterior hacía mal es lo que el usuario describió como «no
 * funciona la negrita»: el formato SÍ se guardaba —está probado— pero no se veía
 * en ninguna parte. En el lienzo de preguntas el editor se monta con
 * `sinVistaPrevia`, así que quedaba un área de texto plano que no cambiaba al
 * pulsar Ctrl+B. Un formato invisible es, para quien lo usa, un formato roto.
 *
 * ── Cómo se ve ahora el formato dentro del área ───────────────────────────────
 * Debajo de cada `textarea` (con su texto en transparente y su cursor visible) se
 * pinta un ESPEJO con el mismo texto y sus marcas. Las dos capas comparten la
 * misma caja tipográfica (`.rt-box`), así que el texto rompe línea en el mismo
 * sitio y el cursor cae donde debe.
 *
 * La regla que hace que esto funcione: el espejo no puede cambiar el ANCHO DE
 * AVANCE del texto, porque la composición que manda es la del `textarea`. Por eso
 * la negrita se pinta engrosando el trazo del glifo (`-webkit-text-stroke`) y no
 * con `font-weight`, que ensancharía un 9 % y desalinearía el cursor. Subrayado y
 * tachado son decoraciones sin métrica; el monoespaciado se señala con un lavado
 * de fondo, y para verlo exacto está la vista previa.
 *
 * Y para no dejar ninguna duda, la vista previa —el MISMO renderizador que usa la
 * prueba del candidato— aparece sola en cuanto el bloque tiene formato.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bold,
  Code2,
  Eye,
  EyeOff,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Type,
  Underline,
} from "lucide-react";
import {
  fromEditable,
  isMarkActive,
  RICH_BLOCK_LABEL,
  RICH_MARK_LABEL,
  shiftRanges,
  spansOf,
  toEditable,
  toggleMark,
  type EditableBlock,
  type RichBlockType,
  type RichDoc,
  type RichMark,
} from "../domain/richText";
import { CLASE_MARCA_EDITOR, RichText } from "./RichText";

interface Props {
  valor: RichDoc | unknown;
  onChange: (doc: RichDoc) => void;
  etiqueta?: string;
  marcador?: string;
  /** Un solo bloque: para títulos y textos de opción. */
  unaLinea?: boolean;
  /** No muestra la vista previa desplegable (el formato sigue viéndose en el área). */
  sinVistaPrevia?: boolean;
  filasMinimas?: number;
  autoFocus?: boolean;
  id?: string;
  /** La barra de herramientas solo aparece al enfocar. Para espacios estrechos. */
  barraAlEnfocar?: boolean;
  disabled?: boolean;
}

const MARCAS_BARRA: { marca: RichMark; icono: typeof Bold; atajo: string }[] = [
  { marca: "b", icono: Bold, atajo: "Ctrl+B" },
  { marca: "i", icono: Italic, atajo: "Ctrl+I" },
  { marca: "u", icono: Underline, atajo: "Ctrl+U" },
  { marca: "s", icono: Strikethrough, atajo: "" },
  { marca: "c", icono: Code2, atajo: "" },
];

const TIPOS_BLOQUE: { tipo: RichBlockType; icono: typeof Type }[] = [
  { tipo: "p", icono: Type },
  { tipo: "h2", icono: Type },
  { tipo: "h3", icono: Type },
  { tipo: "ul", icono: List },
  { tipo: "ol", icono: ListOrdered },
  { tipo: "quote", icono: Quote },
  { tipo: "code", icono: Code2 },
];

/** Caracteres que no forman parte de una palabra. */
const NO_PALABRA = /[\s.,;:!¡?¿()[\]{}"'«»—–/\\|]/;

/**
 * Palabra que rodea al cursor.
 *
 * Sirve para que la barra funcione SIN selección: pulsar negrita con el cursor
 * dentro de una palabra la pone en negrita, que es lo que hace cualquier
 * procesador de texto y lo que la gente intenta antes de aprender a seleccionar.
 */
function palabraEn(texto: string, posicion: number): { inicio: number; fin: number } | null {
  if (!texto) return null;
  let inicio = Math.max(0, Math.min(posicion, texto.length));
  let fin = inicio;
  while (inicio > 0 && !NO_PALABRA.test(texto[inicio - 1])) inicio -= 1;
  while (fin < texto.length && !NO_PALABRA.test(texto[fin])) fin += 1;
  return fin > inicio ? { inicio, fin } : null;
}

export function RichTextEditor({
  valor,
  onChange,
  etiqueta,
  marcador = "Escribe aquí…",
  unaLinea = false,
  sinVistaPrevia = false,
  filasMinimas = 2,
  autoFocus = false,
  id,
  barraAlEnfocar = false,
  disabled = false,
}: Props) {
  const [bloques, setBloques] = useState<EditableBlock[]>(() => toEditable(valor));
  const [activo, setActivo] = useState(0);
  const [seleccion, setSeleccion] = useState<{ inicio: number; fin: number }>({ inicio: 0, fin: 0 });
  const [verPrevia, setVerPrevia] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const ultimoEmitido = useRef<string>("");

  /**
   * Sincronización con el valor externo.
   *
   * Solo se reconstruye el estado interno cuando el documento que llega es
   * DISTINTO del último que este editor emitió. Sin esa comprobación, cada
   * pulsación viajaría al padre, volvería como prop y reiniciaría los bloques,
   * perdiendo el cursor en cada tecla.
   */
  useEffect(() => {
    const entrante = JSON.stringify(fromEditable(toEditable(valor)));
    if (entrante === ultimoEmitido.current) return;
    setBloques(toEditable(valor));
    ultimoEmitido.current = entrante;
  }, [valor]);

  const emitir = useCallback(
    (siguientes: EditableBlock[]) => {
      setBloques(siguientes);
      const doc = fromEditable(siguientes);
      ultimoEmitido.current = JSON.stringify(doc);
      onChange(doc);
    },
    [onChange],
  );

  const actualizarTexto = (indice: number, texto: string) => {
    const siguientes = bloques.map((bloque, i) => {
      if (i !== indice) return bloque;
      return {
        ...bloque,
        texto,
        marcas: shiftRanges(bloque.marcas, bloque.texto, texto),
        enlaces: shiftRanges(bloque.enlaces, bloque.texto, texto),
      };
    });
    emitir(siguientes);
  };

  const cambiarTipo = (indice: number, tipo: RichBlockType) => {
    emitir(bloques.map((bloque, i) => (i === indice ? { ...bloque, tipo } : bloque)));
  };

  /** Rango sobre el que actuará la barra: la selección o la palabra del cursor. */
  const rangoDeTrabajo = (bloque: EditableBlock): { inicio: number; fin: number } | null => {
    const area = areas.current[bloque.id];
    const inicio = area ? area.selectionStart : seleccion.inicio;
    const fin = area ? area.selectionEnd : seleccion.fin;
    if (fin > inicio) return { inicio, fin };
    return palabraEn(bloque.texto, inicio);
  };

  const alternarMarca = (marca: RichMark) => {
    if (disabled) return;
    const bloque = bloques[activo];
    if (!bloque) return;
    const rango = rangoDeTrabajo(bloque);
    if (!rango) return;
    emitir(
      bloques.map((b, i) =>
        i === activo ? { ...b, marcas: toggleMark(b.marcas, marca, rango.inicio, rango.fin) } : b,
      ),
    );
    // Se devuelve el foco y la selección: aplicar negrita no debe hacer perder el
    // sitio donde se estaba escribiendo.
    const area = areas.current[bloque.id];
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(rango.inicio, rango.fin);
      setSeleccion(rango);
    });
  };

  const ponerEnlace = () => {
    const bloque = bloques[activo];
    if (!bloque || disabled) return;
    const rango = rangoDeTrabajo(bloque);
    if (!rango) return;
    const existente = bloque.enlaces.find((e) => e.inicio <= rango.inicio && e.fin >= rango.fin);
    const url = window.prompt("Dirección del enlace (https://… o mailto:…)", existente?.url ?? "https://");
    if (url === null) return;
    const limpio = url.trim();
    const sinEse = bloque.enlaces.filter((e) => e.fin <= rango.inicio || e.inicio >= rango.fin);
    emitir(
      bloques.map((b, i) =>
        i === activo
          ? { ...b, enlaces: limpio ? [...sinEse, { ...rango, url: limpio }] : sinEse }
          : b,
      ),
    );
  };

  const quitarEnlace = () => {
    const bloque = bloques[activo];
    if (!bloque || disabled) return;
    const rango = rangoDeTrabajo(bloque) ?? { inicio: 0, fin: bloque.texto.length };
    emitir(
      bloques.map((b, i) =>
        i === activo
          ? { ...b, enlaces: b.enlaces.filter((e) => e.fin <= rango.inicio || e.inicio >= rango.fin) }
          : b,
      ),
    );
  };

  const limpiarFormato = () => {
    const bloque = bloques[activo];
    if (!bloque || disabled) return;
    const area = areas.current[bloque.id];
    const inicio = area ? area.selectionStart : 0;
    const fin = area ? area.selectionEnd : bloque.texto.length;
    const rango = fin > inicio ? { inicio, fin } : { inicio: 0, fin: bloque.texto.length };
    emitir(
      bloques.map((b, i) =>
        i === activo
          ? {
              ...b,
              marcas: b.marcas.filter((m) => m.fin <= rango.inicio || m.inicio >= rango.fin),
              enlaces: b.enlaces.filter((e) => e.fin <= rango.inicio || e.inicio >= rango.fin),
            }
          : b,
      ),
    );
  };

  const nuevoBloque = (indice: number) => {
    if (unaLinea) return;
    const siguientes = [...bloques];
    const tipoHeredado = bloques[indice]?.tipo;
    siguientes.splice(indice + 1, 0, {
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      // Continuar una lista es lo que se espera al pulsar Enter dentro de ella.
      tipo: tipoHeredado === "ul" || tipoHeredado === "ol" ? tipoHeredado : "p",
      texto: "",
      marcas: [],
      enlaces: [],
    });
    emitir(siguientes);
    setActivo(indice + 1);
    requestAnimationFrame(() => areas.current[siguientes[indice + 1].id]?.focus());
  };

  const eliminarBloque = (indice: number) => {
    if (bloques.length <= 1) return;
    const anterior = Math.max(0, indice - 1);
    const siguientes = bloques.filter((_, i) => i !== indice);
    emitir(siguientes);
    setActivo(anterior);
    requestAnimationFrame(() => {
      const area = areas.current[siguientes[anterior].id];
      area?.focus();
      area?.setSelectionRange(area.value.length, area.value.length);
    });
  };

  const alTeclado = (evento: React.KeyboardEvent<HTMLTextAreaElement>, indice: number) => {
    const modificador = evento.ctrlKey || evento.metaKey;
    if (modificador) {
      const tecla = evento.key.toLowerCase();
      if (tecla === "b" || tecla === "i" || tecla === "u") {
        evento.preventDefault();
        alternarMarca(tecla === "b" ? "b" : tecla === "i" ? "i" : "u");
        return;
      }
      if (tecla === "k") {
        evento.preventDefault();
        ponerEnlace();
        return;
      }
    }
    if (evento.key === "Enter" && !evento.shiftKey && !unaLinea) {
      evento.preventDefault();
      nuevoBloque(indice);
      return;
    }
    if (evento.key === "Backspace" && bloques[indice].texto === "" && bloques.length > 1) {
      evento.preventDefault();
      eliminarBloque(indice);
    }
  };

  const documento = useMemo(() => fromEditable(bloques), [bloques]);
  const bloqueActivo = bloques[activo];
  const conFormato = useMemo(
    () => bloques.some((b) => b.marcas.length > 0 || b.enlaces.length > 0 || b.tipo !== "p"),
    [bloques],
  );
  // La barra en modo compacto aparece al enfocar; en modo normal siempre está.
  const barraVisible = !barraAlEnfocar || enfocado;
  const previaVisible = !sinVistaPrevia && (verPrevia || (conFormato && enfocado));

  return (
    <div
      className="flex flex-col gap-1.5"
      onFocusCapture={() => setEnfocado(true)}
      onBlurCapture={(evento) => {
        // Solo se considera perdido el foco cuando sale del editor completo: si no,
        // pulsar un botón de la barra cerraría la propia barra.
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setEnfocado(false);
      }}
    >
      {etiqueta && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{etiqueta}</span>
          {!sinVistaPrevia && (
            <button
              type="button"
              onClick={() => setVerPrevia((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft hover:text-ink"
            >
              {verPrevia ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {verPrevia ? "Ocultar vista previa" : "Ver vista previa"}
            </button>
          )}
        </div>
      )}

      {/* Barra de herramientas. Los botones actúan sobre la selección o, si no hay,
          sobre la palabra donde está el cursor: una barra que no hace nada porque
          «falta seleccionar» es una barra que parece averiada. */}
      <AnimatePresence initial={false}>
        {barraVisible && (
          <motion.div
            initial={barraAlEnfocar ? { opacity: 0, y: -6, height: 0 } : false}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-1 rounded-2xl fill-softer p-1.5 ring-1 ring-[color:var(--hairline)]">
              {MARCAS_BARRA.map(({ marca, icono: Icono, atajo }) => {
                const rango = bloqueActivo
                  ? seleccion.fin > seleccion.inicio
                    ? seleccion
                    : palabraEn(bloqueActivo.texto, seleccion.inicio)
                  : null;
                const activa =
                  bloqueActivo && rango
                    ? isMarkActive(bloqueActivo.marcas, marca, rango.inicio, rango.fin)
                    : false;
                return (
                  <motion.button
                    key={marca}
                    type="button"
                    disabled={disabled}
                    whileTap={{ scale: 0.88 }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => alternarMarca(marca)}
                    title={`${RICH_MARK_LABEL[marca]}${atajo ? ` (${atajo})` : ""} · aplica a la selección o a la palabra del cursor`}
                    aria-label={RICH_MARK_LABEL[marca]}
                    aria-pressed={activa}
                    className={`grid h-7 w-7 place-items-center rounded-xl transition-all duration-200 disabled:opacity-30 ${
                      activa
                        ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass"
                        : "text-ink-soft hover:fill-soft hover:text-ink"
                    }`}
                  >
                    <Icono className="h-3.5 w-3.5" />
                  </motion.button>
                );
              })}

              <span className="mx-1 h-5 w-px bg-[color:var(--hairline)]" />

              <BotonBarra onClick={ponerEnlace} titulo="Insertar enlace (Ctrl+K)" disabled={disabled}>
                <Link2 className="h-3.5 w-3.5" />
              </BotonBarra>
              <BotonBarra onClick={quitarEnlace} titulo="Quitar enlace" disabled={disabled}>
                <Link2Off className="h-3.5 w-3.5" />
              </BotonBarra>
              <BotonBarra onClick={limpiarFormato} titulo="Quitar todo el formato" disabled={disabled}>
                <RemoveFormatting className="h-3.5 w-3.5" />
              </BotonBarra>

              {!unaLinea && bloqueActivo && (
                <>
                  <span className="mx-1 h-5 w-px bg-[color:var(--hairline)]" />
                  <select
                    value={bloqueActivo.tipo}
                    disabled={disabled}
                    onChange={(e) => cambiarTipo(activo, e.target.value as RichBlockType)}
                    aria-label="Tipo de bloque"
                    className="rounded-xl fill-soft px-2 py-1 text-[0.7rem] font-semibold text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    {TIPOS_BLOQUE.map(({ tipo }) => (
                      <option key={tipo} value={tipo}>
                        {RICH_BLOCK_LABEL[tipo]}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Un área por bloque, con su espejo de formato debajo. */}
      <div className="flex flex-col gap-1">
        {bloques.map((bloque, indice) => (
          <div key={bloque.id} className="flex items-start gap-2">
            {(bloque.tipo === "ul" || bloque.tipo === "ol") && (
              <span className="mt-2.5 select-none font-mono text-xs text-ink-faint">
                {bloque.tipo === "ul" ? "•" : `${numeroDeLista(bloques, indice)}.`}
              </span>
            )}
            <AreaConFormato
              bloque={bloque}
              refArea={(nodo) => {
                areas.current[bloque.id] = nodo;
              }}
              id={indice === 0 ? id : undefined}
              autoFocus={autoFocus && indice === 0}
              marcador={indice === 0 ? marcador : ""}
              filasMinimas={unaLinea ? 1 : filasMinimas}
              disabled={disabled}
              onTexto={(texto) => actualizarTexto(indice, texto)}
              onFoco={() => setActivo(indice)}
              onTeclado={(e) => alTeclado(e, indice)}
              onSeleccion={(inicio, fin) => {
                setActivo(indice);
                setSeleccion({ inicio, fin });
              }}
            />
          </div>
        ))}
      </div>

      {!unaLinea && enfocado && (
        <p className="text-[0.7rem] text-ink-faint">
          El formato se ve mientras escribes · Enter crea un bloque · Mayús+Enter salta de línea · Ctrl+B, Ctrl+I,
          Ctrl+U y Ctrl+K
        </p>
      )}

      <AnimatePresence initial={false}>
        {previaVisible && documento.b.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-dashed border-[color:var(--hairline)] bg-[color:var(--fill-1)] p-3">
              <p className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-ink-faint">
                Así lo verá el candidato
              </p>
              <RichText doc={documento} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BotonBarra({
  children,
  onClick,
  titulo,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titulo: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="grid h-7 w-7 place-items-center rounded-xl text-ink-soft transition-colors hover:fill-soft hover:text-ink disabled:opacity-30"
    >
      {children}
    </motion.button>
  );
}

/**
 * Un bloque: `textarea` transparente sobre un espejo con el formato pintado.
 *
 * El espejo es el que ocupa sitio en el flujo, así que el alto lo decide el
 * contenido y no hay barras de desplazamiento internas que sincronizar. El
 * `textarea` se estira encima con `absolute inset-0`.
 */
function AreaConFormato({
  bloque,
  refArea,
  id,
  autoFocus,
  marcador,
  filasMinimas,
  disabled,
  onTexto,
  onFoco,
  onTeclado,
  onSeleccion,
}: {
  bloque: EditableBlock;
  refArea: (nodo: HTMLTextAreaElement | null) => void;
  id?: string;
  autoFocus?: boolean;
  marcador: string;
  filasMinimas: number;
  disabled?: boolean;
  onTexto: (texto: string) => void;
  onFoco: () => void;
  onTeclado: (evento: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSeleccion: (inicio: number, fin: number) => void;
}) {
  const spans = useMemo(() => spansOf(bloque), [bloque]);
  const mono = bloque.tipo === "code";
  const encabezado = bloque.tipo.startsWith("h");
  const clasesCaja = `rt-box ${mono ? "rt-box-mono" : ""} ${encabezado ? "font-bold" : ""}`;
  // Un salto final no genera línea propia en un <div>; el carácter invisible la
  // fuerza para que el alto del espejo coincida con el del área.
  const cola = bloque.texto.endsWith("\n") ? "\u200b" : "";

  return (
    <div
      className="relative min-w-0 flex-1 rounded-2xl fill-soft ring-1 ring-[color:var(--hairline)] transition-shadow focus-within:ring-2 focus-within:ring-cyan-300"
      style={{ minHeight: `calc(${filasMinimas} * 1.55em + 1.35rem)` }}
    >
      <div aria-hidden className={`rt-mirror ${clasesCaja}`} style={{ minHeight: "inherit" }}>
        {spans.map((span, i) => {
          const clases = [
            ...(span.m ?? []).map((marca) => CLASE_MARCA_EDITOR[marca]),
            span.l ? "rt-link" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return clases ? (
            <span key={i} className={clases}>
              {span.x}
            </span>
          ) : (
            <span key={i}>{span.x}</span>
          );
        })}
        {cola}
      </div>
      <textarea
        id={id}
        ref={refArea}
        value={bloque.texto}
        autoFocus={autoFocus}
        placeholder={marcador}
        disabled={disabled}
        spellCheck
        onChange={(e) => onTexto(e.target.value)}
        onFocus={onFoco}
        onKeyDown={onTeclado}
        onSelect={(e) => onSeleccion(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        onClick={(e) => onSeleccion(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        onKeyUp={(e) => onSeleccion(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
        className={`rt-area absolute inset-0 h-full w-full ${clasesCaja} outline-none`}
      />
    </div>
  );
}

/** Número que corresponde a un bloque dentro de su lista ordenada. */
function numeroDeLista(bloques: EditableBlock[], indice: number): number {
  let numero = 1;
  for (let i = indice - 1; i >= 0; i -= 1) {
    if (bloques[i].tipo !== "ol") break;
    numero += 1;
  }
  return numero;
}
