/**
 * Renderizador de referencia del texto enriquecido.
 *
 * Es la implementación que el segundo frontend puede copiar tal cual: recorre
 * bloques y fragmentos y no interpreta HTML en ningún punto. No hay
 * `dangerouslySetInnerHTML` ni `innerHTML` en todo el archivo, y eso es
 * deliberado: el modelo se diseñó precisamente para que renderizarlo fuera seguro
 * sin sanear nada.
 *
 * El contrato completo está en `docs/evaluaciones/TEXTO_ENRIQUECIDO.md`.
 */

import type { ReactNode } from "react";
import type { RichBlock, RichDoc, RichMark, RichSpan } from "../domain/richText";
import { sanitizeRichDoc } from "../domain/richText";

/**
 * Clases de cada marca.
 *
 * Se exporta porque el EDITOR pinta el texto con formato dentro del área de
 * escritura usando exactamente estas clases: si el editor y el renderizador
 * usaran tablas distintas, lo que se ve al escribir dejaría de ser lo que ve el
 * candidato — que es justo el problema que este modelo quiere evitar.
 *
 * `c` (monoespaciado) no lleva fondo ni relleno propio en el editor porque
 * alteraría el ancho del texto y desalinearía el espejo; ese detalle lo resuelve
 * `CLASE_MARCA_EDITOR`.
 */
export const CLASE_MARCA: Record<RichMark, string> = {
  b: "font-bold",
  i: "italic",
  u: "underline decoration-1 underline-offset-2",
  s: "line-through",
  c: "font-mono text-[0.94em] rounded bg-[color:var(--fill-2)] px-1 py-[1px]",
};

/** Variante para el espejo del editor: sin nada que cambie el ancho del texto. */
export const CLASE_MARCA_EDITOR: Record<RichMark, string> = {
  b: "rt-b",
  i: "rt-i",
  u: "rt-u",
  s: "rt-s",
  c: "rt-c",
};

function Fragmento({ span }: { span: RichSpan }) {
  const clases = (span.m ?? []).map((marca) => CLASE_MARCA[marca]).join(" ");
  const contenido = clases ? <span className={clases}>{span.x}</span> : <>{span.x}</>;
  if (!span.l) return contenido;
  return (
    <a
      href={span.l}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline decoration-cyan-400/40 underline-offset-2 transition-colors hover:text-accent-strong"
    >
      {contenido}
    </a>
  );
}

function contenidoDe(block: RichBlock): ReactNode {
  return block.s.map((span, i) => <Fragmento key={i} span={span} />);
}

/** Un bloque suelto, con las clases de su tipo. */
function Bloque({ block, compacto }: { block: RichBlock; compacto: boolean }) {
  const contenido = contenidoDe(block);
  switch (block.t) {
    case "h1":
      return <h3 className="text-lg font-black tracking-tight text-ink sm:text-xl">{contenido}</h3>;
    case "h2":
      return <h4 className="text-base font-black tracking-tight text-ink sm:text-lg">{contenido}</h4>;
    case "h3":
      return <h5 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{contenido}</h5>;
    case "quote":
      return (
        <blockquote className="border-l-2 border-cyan-400/50 pl-3 text-sm italic text-ink-soft">
          {contenido}
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-2xl bg-slate-950/40 p-3 font-mono text-xs text-ink ring-1 ring-[color:var(--hairline)]">
          <code>{contenido}</code>
        </pre>
      );
    default:
      return <p className={compacto ? "text-sm text-ink" : "text-[0.95rem] leading-relaxed text-ink"}>{contenido}</p>;
  }
}

/**
 * Agrupa los bloques de lista consecutivos.
 *
 * Sin esto, cada elemento de una lista sería su propia `<ul>`, lo que además de
 * ser HTML incorrecto rompe la numeración de las listas ordenadas y el anuncio de
 * los lectores de pantalla («lista de un elemento», cinco veces).
 */
function agrupar(blocks: RichBlock[]): { tipo: "lista-ul" | "lista-ol" | "suelto"; blocks: RichBlock[] }[] {
  const grupos: { tipo: "lista-ul" | "lista-ol" | "suelto"; blocks: RichBlock[] }[] = [];
  for (const block of blocks) {
    const tipo = block.t === "ul" ? "lista-ul" : block.t === "ol" ? "lista-ol" : "suelto";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.tipo === tipo && tipo !== "suelto") ultimo.blocks.push(block);
    else grupos.push({ tipo, blocks: [block] });
  }
  return grupos;
}

export function RichText({
  doc,
  className = "",
  compacto = false,
}: {
  doc: RichDoc | unknown;
  className?: string;
  compacto?: boolean;
}) {
  const sane = sanitizeRichDoc(doc);
  if (sane.b.length === 0) return null;
  return (
    <div className={`flex flex-col ${compacto ? "gap-1.5" : "gap-2.5"} ${className}`}>
      {agrupar(sane.b).map((grupo, i) => {
        if (grupo.tipo === "lista-ul") {
          return (
            <ul key={i} className="ml-5 list-disc space-y-1 text-[0.95rem] text-ink">
              {grupo.blocks.map((block, j) => (
                <li key={j}>{contenidoDe(block)}</li>
              ))}
            </ul>
          );
        }
        if (grupo.tipo === "lista-ol") {
          return (
            <ol key={i} className="ml-5 list-decimal space-y-1 text-[0.95rem] text-ink">
              {grupo.blocks.map((block, j) => (
                <li key={j}>{contenidoDe(block)}</li>
              ))}
            </ol>
          );
        }
        return <Bloque key={i} block={grupo.blocks[0]} compacto={compacto} />;
      })}
    </div>
  );
}

/**
 * Versión en una sola línea, para tablas y listados.
 *
 * Conserva las marcas pero descarta la estructura de bloques: en una celda de
 * tabla los saltos de párrafo estorban más de lo que aportan.
 */
export function RichTextInline({ doc, className = "" }: { doc: RichDoc | unknown; className?: string }) {
  const sane = sanitizeRichDoc(doc);
  const spans = sane.b.flatMap((block, i) =>
    block.s.map((span, j) => ({ span, key: `${i}-${j}` })),
  );
  if (spans.length === 0) return null;
  return (
    <span className={className}>
      {spans.map(({ span, key }, index) => (
        <span key={key}>
          {index > 0 && !/\s$/.test(spans[index - 1].span.x) ? " " : ""}
          <Fragmento span={span} />
        </span>
      ))}
    </span>
  );
}
