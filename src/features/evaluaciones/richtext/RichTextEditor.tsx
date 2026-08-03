/**
 * Editor de texto enriquecido — sin `contentEditable`.
 *
 * ── La decisión de diseño ────────────────────────────────────────────────────
 * Los editores enriquecidos suelen construirse sobre `contentEditable` y
 * `document.execCommand`. Esa vía trae tres problemas conocidos: `execCommand`
 * está obsoleto, cada navegador produce un HTML distinto, y el estado real vive en
 * el DOM en lugar de en React, así que el componente pierde el control de lo que
 * se guarda. Añadir una biblioteca de editor (ProseMirror, Slate, TipTap) resolvería
 * eso a cambio de 100–300 KB y de un modelo de datos ajeno.
 *
 * Aquí el editor son `textarea` normales, uno por bloque, y el formato se guarda
 * como RANGOS `[inicio, fin)` sobre el texto plano de cada bloque. Consecuencias:
 *
 *   · el estado es de React, siempre, y lo que se ve es lo que se guarda;
 *   · no hay HTML que sanear en ningún punto de la cadena;
 *   · funciona con teclado, con lectores de pantalla y en móvil, porque un
 *     `textarea` es un control nativo;
 *   · escribir al principio de un párrafo NO desplaza el formato, porque los
 *     rangos se reajustan comparando el texto anterior con el nuevo
 *     (`shiftRanges`, probado en las dos direcciones);
 *   · pesa cero kilobytes de dependencias.
 *
 * El precio es que el formato no se ve DENTRO del área de escritura. Se compensa
 * con una vista previa en vivo justo debajo, que muestra exactamente lo que verá
 * el candidato — y que, siendo el mismo renderizador que usa la prueba, no puede
 * mentir.
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
  toEditable,
  toggleMark,
  type EditableBlock,
  type RichBlockType,
  type RichDoc,
  type RichMark,
} from "../domain/richText";
import { RichText } from "./RichText";

interface Props {
  valor: RichDoc | unknown;
  onChange: (doc: RichDoc) => void;
  etiqueta?: string;
  marcador?: string;
  /** Un solo bloque: para títulos y textos de opción. */
  unaLinea?: boolean;
  /** Oculta la vista previa (útil en espacios estrechos como las opciones). */
  sinVistaPrevia?: boolean;
  filasMinimas?: number;
  autoFocus?: boolean;
  id?: string;
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
}: Props) {
  const [bloques, setBloques] = useState<EditableBlock[]>(() => toEditable(valor));
  const [activo, setActivo] = useState(0);
  const [seleccion, setSeleccion] = useState<{ inicio: number; fin: number }>({ inicio: 0, fin: 0 });
  const [verPrevia, setVerPrevia] = useState(!sinVistaPrevia);
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

  const alternarMarca = (marca: RichMark) => {
    const bloque = bloques[activo];
    if (!bloque) return;
    const area = areas.current[bloque.id];
    const inicio = area ? area.selectionStart : seleccion.inicio;
    const fin = area ? area.selectionEnd : seleccion.fin;
    if (fin <= inicio) return;
    emitir(
      bloques.map((b, i) => (i === activo ? { ...b, marcas: toggleMark(b.marcas, marca, inicio, fin) } : b)),
    );
    // Se devuelve el foco y la selección: aplicar negrita no debe hacer perder el
    // sitio donde se estaba escribiendo.
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(inicio, fin);
    });
  };

  const ponerEnlace = () => {
    const bloque = bloques[activo];
    const area = bloque ? areas.current[bloque.id] : null;
    if (!bloque || !area) return;
    const inicio = area.selectionStart;
    const fin = area.selectionEnd;
    if (fin <= inicio) return;
    const existente = bloque.enlaces.find((e) => e.inicio <= inicio && e.fin >= fin);
    const url = window.prompt(
      "Dirección del enlace (https://… o mailto:…)",
      existente?.url ?? "https://",
    );
    if (url === null) return;
    const limpio = url.trim();
    const sinEse = bloque.enlaces.filter((e) => e.fin <= inicio || e.inicio >= fin);
    emitir(
      bloques.map((b, i) =>
        i === activo ? { ...b, enlaces: limpio ? [...sinEse, { inicio, fin, url: limpio }] : sinEse } : b,
      ),
    );
  };

  const quitarEnlace = () => {
    const bloque = bloques[activo];
    const area = bloque ? areas.current[bloque.id] : null;
    if (!bloque || !area) return;
    const inicio = area.selectionStart;
    const fin = area.selectionEnd;
    emitir(
      bloques.map((b, i) =>
        i === activo ? { ...b, enlaces: b.enlaces.filter((e) => e.fin <= inicio || e.inicio >= fin) } : b,
      ),
    );
  };

  const limpiarFormato = () => {
    const bloque = bloques[activo];
    const area = bloque ? areas.current[bloque.id] : null;
    if (!bloque) return;
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
  const seleccionActiva = seleccion.fin > seleccion.inicio;

  return (
    <div className="flex flex-col gap-2">
      {etiqueta && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{etiqueta}</span>
          {!sinVistaPrevia && (
            <button
              type="button"
              onClick={() => setVerPrevia((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
            >
              {verPrevia ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {verPrevia ? "Ocultar vista previa" : "Ver vista previa"}
            </button>
          )}
        </div>
      )}

      {/* Barra de herramientas. Los botones de marca se deshabilitan sin selección:
          una barra que parece activa y no hace nada es peor que una deshabilitada. */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl fill-softer p-1.5 ring-1 ring-[color:var(--hairline)]">
        {MARCAS_BARRA.map(({ marca, icono: Icono, atajo }) => {
          const activa =
            bloqueActivo && seleccionActiva
              ? isMarkActive(bloqueActivo.marcas, marca, seleccion.inicio, seleccion.fin)
              : false;
          return (
            <button
              key={marca}
              type="button"
              disabled={!seleccionActiva}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => alternarMarca(marca)}
              title={`${RICH_MARK_LABEL[marca]}${atajo ? ` (${atajo})` : ""}`}
              aria-label={RICH_MARK_LABEL[marca]}
              aria-pressed={activa}
              className={`grid h-7 w-7 place-items-center rounded-xl transition-all duration-200 disabled:opacity-30 ${
                activa
                  ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass"
                  : "text-ink-soft hover:fill-soft hover:text-ink"
              }`}
            >
              <Icono className="h-3.5 w-3.5" />
            </button>
          );
        })}

        <span className="mx-1 h-5 w-px bg-[color:var(--hairline)]" />

        <button
          type="button"
          disabled={!seleccionActiva}
          onMouseDown={(e) => e.preventDefault()}
          onClick={ponerEnlace}
          title="Insertar enlace (Ctrl+K)"
          aria-label="Insertar enlace"
          className="grid h-7 w-7 place-items-center rounded-xl text-ink-soft transition-colors hover:fill-soft hover:text-ink disabled:opacity-30"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={quitarEnlace}
          title="Quitar enlace"
          aria-label="Quitar enlace"
          className="grid h-7 w-7 place-items-center rounded-xl text-ink-soft transition-colors hover:fill-soft hover:text-ink"
        >
          <Link2Off className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={limpiarFormato}
          title="Quitar todo el formato"
          aria-label="Quitar formato"
          className="grid h-7 w-7 place-items-center rounded-xl text-ink-soft transition-colors hover:fill-soft hover:text-ink"
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </button>

        {!unaLinea && bloqueActivo && (
          <>
            <span className="mx-1 h-5 w-px bg-[color:var(--hairline)]" />
            <select
              value={bloqueActivo.tipo}
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

      {/* Un área por bloque. El prefijo de lista se dibuja al lado para que el
          autor vea la estructura mientras escribe. */}
      <div className="flex flex-col gap-1">
        {bloques.map((bloque, indice) => (
          <div key={bloque.id} className="flex items-start gap-2">
            {(bloque.tipo === "ul" || bloque.tipo === "ol") && (
              <span className="mt-2.5 select-none font-mono text-xs text-ink-faint">
                {bloque.tipo === "ul" ? "•" : `${numeroDeLista(bloques, indice)}.`}
              </span>
            )}
            <textarea
              id={indice === 0 ? id : undefined}
              ref={(nodo) => {
                areas.current[bloque.id] = nodo;
              }}
              value={bloque.texto}
              rows={unaLinea ? 1 : Math.max(filasMinimas, bloque.texto.split("\n").length)}
              autoFocus={autoFocus && indice === 0}
              placeholder={indice === 0 ? marcador : ""}
              onChange={(e) => actualizarTexto(indice, e.target.value)}
              onFocus={() => setActivo(indice)}
              onKeyDown={(e) => alTeclado(e, indice)}
              onSelect={(e) => {
                const area = e.currentTarget;
                setActivo(indice);
                setSeleccion({ inicio: area.selectionStart, fin: area.selectionEnd });
              }}
              onBlur={(e) => setSeleccion({ inicio: e.currentTarget.selectionStart, fin: e.currentTarget.selectionEnd })}
              className={`w-full resize-y rounded-2xl fill-soft px-3.5 py-2.5 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] transition-shadow placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                bloque.tipo.startsWith("h") ? "font-bold" : ""
              } ${bloque.tipo === "code" ? "font-mono text-xs" : ""}`}
            />
          </div>
        ))}
      </div>

      {!unaLinea && (
        <p className="text-[0.7rem] text-ink-faint">
          Enter crea un bloque nuevo · Mayús+Enter salta de línea dentro del bloque · selecciona texto y usa
          Ctrl+B, Ctrl+I, Ctrl+U o Ctrl+K
        </p>
      )}

      <AnimatePresence initial={false}>
        {verPrevia && documento.b.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
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

/** Número que corresponde a un bloque dentro de su lista ordenada. */
function numeroDeLista(bloques: EditableBlock[], indice: number): number {
  let numero = 1;
  for (let i = indice - 1; i >= 0; i -= 1) {
    if (bloques[i].tipo !== "ol") break;
    numero += 1;
  }
  return numero;
}
