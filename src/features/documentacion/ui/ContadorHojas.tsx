/**
 * Contador de hojas de un documento físico.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 * Nueve de los requisitos del proceso se entregan en papel, y el área necesita
 * saber cuántas hojas tiene cada uno: es lo que se archiva, lo que se fotocopia y
 * lo que se cuenta al cerrar la carpeta. Hasta ahora se anotaba a mano en un
 * cuaderno.
 *
 * ── Tres decisiones de diseño que parecen detalles y no lo son ──────────────
 *
 * 1. **No es un `type="number"`.** El control nativo cambia el valor cuando la
 *    rueda del ratón pasa por encima. En una lista de veinticinco requisitos que
 *    se recorre desplazándose, eso significa alterar en silencio un dato que
 *    alguien ya había anotado, y no queda ni rastro de que se tocó. Aquí es un
 *    `type="text"` con `inputMode="numeric"`: mismo teclado en el móvil, ninguna
 *    sorpresa con la rueda.
 *
 * 2. **Vacío y cero son distintos.** `null` es «nadie lo ha contado» y `0` es «se
 *    contó y no había hojas». Si el vacío se guardara como cero, un expediente sin
 *    revisar parecería revisado con resultado nulo, y el informe no podría
 *    distinguir lo que falta por anotar de lo que está anotado.
 *
 * 3. **Al marcar `N/A` se deshabilita pero NO se borra.** Marcar «no aplica» por
 *    error y revertirlo es habitual; perder el conteo en el intermedio obliga a
 *    volver a contar las hojas de un documento que ya está en la carpeta.
 *
 * El texto local se sincroniza con el valor SOLO cuando el valor cambia desde
 * fuera (invariante de campo controlado): reescribirlo en cada pulsación haría
 * imposible escribir «12», porque el «1» se normalizaría antes del «2».
 */

import { useEffect, useRef, useState } from "react";
import { Layers, Minus, Plus } from "lucide-react";
import { MAX_HOJAS_FISICAS } from "../domain/vocabulario";

/** Deja solo dígitos y recorta al tope del backend. */
function sanear(texto: string): string {
  const digitos = texto.replace(/\D+/g, "").replace(/^0+(?=\d)/, "");
  if (!digitos) return "";
  return String(Math.min(Number(digitos), MAX_HOJAS_FISICAS));
}

export function ContadorHojas({
  valor,
  onChange,
  nombreDocumento,
  deshabilitado = false,
  id,
}: {
  /** Hojas anotadas, o `null` si nadie las ha contado. */
  valor: number | null;
  onChange: (valor: number | null) => void;
  /** Se usa en la etiqueta accesible: «Hojas del documento físico: REJAP». */
  nombreDocumento: string;
  /** `true` cuando el requisito está marcado como «no aplica». */
  deshabilitado?: boolean;
  id?: string;
}) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? "" : String(valor));
  const ultimoPropio = useRef<number | null>(valor);

  /* Sincronización solo hacia dentro y solo si el cambio viene de fuera. El `ref`
     recuerda lo último que este control emitió, así que un eco del padre —el
     mismo número que acabamos de mandar— no reescribe el texto que se está
     tecleando. Es el mismo patrón que `CampoFecha`, y por el mismo motivo. */
  useEffect(() => {
    if (valor === ultimoPropio.current) return;
    ultimoPropio.current = valor;
    setTexto(valor === null || valor === undefined ? "" : String(valor));
  }, [valor]);

  function emitir(siguiente: string) {
    const limpio = sanear(siguiente);
    setTexto(limpio);
    const numero = limpio === "" ? null : Number(limpio);
    ultimoPropio.current = numero;
    onChange(numero);
  }

  function ajustar(delta: number) {
    const base = texto === "" ? 0 : Number(texto);
    emitir(String(Math.max(0, Math.min(base + delta, MAX_HOJAS_FISICAS))));
  }

  const etiqueta = `Hojas del documento físico: ${nombreDocumento}`;

  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5"
      style={{
        background: deshabilitado ? "var(--doc-surface-muted)" : "var(--doc-surface)",
        boxShadow: "inset 0 0 0 1px var(--doc-border)",
        opacity: deshabilitado ? 0.55 : 1,
      }}
      title={deshabilitado ? "El documento está marcado como «no aplica»: el conteo se conserva por si se revierte." : etiqueta}
    >
      <Layers className="ml-1 h-3.5 w-3.5 shrink-0" style={{ color: "var(--doc-text-muted)" }} aria-hidden />
      <button
        type="button"
        onClick={() => ajustar(-1)}
        disabled={deshabilitado || texto === "" || Number(texto) <= 0}
        aria-label={`Una hoja menos en ${nombreDocumento}`}
        className="doc-tap grid h-6 w-6 place-items-center rounded-full transition-colors disabled:opacity-35"
        style={{ color: "var(--doc-text-muted)" }}
      >
        <Minus className="h-3 w-3" aria-hidden />
      </button>
      <input
        id={id}
        // `text` + `inputMode` a propósito: ver la nota 1 de la cabecera.
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={texto}
        disabled={deshabilitado}
        onChange={(e) => emitir(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            ajustar(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            ajustar(-1);
          }
        }}
        aria-label={etiqueta}
        placeholder="—"
        className="w-9 bg-transparent text-center text-xs font-bold tabular-nums outline-none disabled:cursor-not-allowed"
        style={{ color: texto === "" ? "var(--doc-text-muted)" : "var(--doc-text)" }}
      />
      <button
        type="button"
        onClick={() => ajustar(1)}
        disabled={deshabilitado || Number(texto || 0) >= MAX_HOJAS_FISICAS}
        aria-label={`Una hoja más en ${nombreDocumento}`}
        className="doc-tap mr-1 grid h-6 w-6 place-items-center rounded-full transition-colors disabled:opacity-35"
        style={{ color: "var(--doc-text-muted)" }}
      >
        <Plus className="h-3 w-3" aria-hidden />
      </button>
      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--doc-text-muted)" }} aria-hidden>
        {Number(texto || 0) === 1 ? "hoja" : "hojas"}
      </span>
    </div>
  );
}
