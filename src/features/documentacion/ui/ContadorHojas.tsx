/**
 * Contador de hojas de un documento físico.
 *
 * ── Por qué existe y dónde aparece ──────────────────────────────────────────
 * El legajo del banco se archiva en papel, y para armarlo hay que saber cuántas
 * hojas trae cada documento físico. Hasta ahora ese número no existía en ninguna
 * parte: la columna `PAGINAS` del libro anual salía siempre en cero porque nadie
 * la llenaba.
 *
 * El contador aparece **solo** en los requisitos que el catálogo marca con
 * `requiereConteoHojas`. Los digitales no lo llevan, ni siquiera oculto: un
 * escaneado no tiene hojas que contar y un campo deshabilitado que nadie puede
 * usar es ruido que hay que leer para descartarlo.
 *
 * ── Tres detalles de implementación que importan ────────────────────────────
 * 1. **No es `<input type="number">`.** Ese control cambia el valor al hacer
 *    scroll con el puntero encima: en una lista de veinticinco requisitos, bajar
 *    con la rueda modificaba los conteos por el camino. Es `type="text"` con
 *    `inputMode="numeric"` y teclas de flecha propias.
 * 2. **Campo controlado que no se reescribe mientras se teclea.** El texto local
 *    se sincroniza con el valor solo cuando el valor cambia DESDE FUERA. Sin eso,
 *    escribir «12» sobre un «0» produce «012» o pierde la primera pulsación.
 * 3. **`N/A` deshabilita pero conserva.** Si el documento se marca «no aplica»,
 *    el contador se apaga y GUARDA el valor: revertir la decisión no debería
 *    obligar a contar las hojas otra vez.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

/** Tope del backend (`DOC2_LIMITS.MAX_HOJAS_FISICAS`). */
export const MAX_HOJAS = 999;

export function ContadorHojas({
  valor,
  onChange,
  deshabilitado,
  nombreDocumento,
  /** `CONDICIONAL` pinta el asterisco de la lista del área. */
  condicional,
}: {
  valor: number;
  onChange: (valor: number) => void;
  deshabilitado?: boolean;
  nombreDocumento: string;
  condicional?: boolean;
}) {
  const [texto, setTexto] = useState(valor > 0 ? String(valor) : "");
  const valorExterno = useRef(valor);

  /**
   * Sincronización en un solo sentido y solo cuando toca.
   *
   * El efecto compara con el ÚLTIMO valor externo conocido, no con el texto: si
   * comparara con el texto, cada pulsación dispararía una reescritura y el
   * cursor saltaría al final. Es la misma disciplina que `CampoFecha`.
   */
  useEffect(() => {
    if (valorExterno.current === valor) return;
    valorExterno.current = valor;
    setTexto(valor > 0 ? String(valor) : "");
  }, [valor]);

  const emitir = useCallback(
    (siguiente: number) => {
      const acotado = Math.max(0, Math.min(MAX_HOJAS, Math.round(siguiente)));
      valorExterno.current = acotado;
      setTexto(acotado > 0 ? String(acotado) : "");
      onChange(acotado);
    },
    [onChange],
  );

  const etiqueta = `Hojas del documento físico: ${nombreDocumento}`;

  return (
    <span className="doc-hojas" data-inactivo={deshabilitado ? "si" : undefined}>
      <button
        type="button"
        onClick={() => emitir((valor || 0) - 1)}
        disabled={deshabilitado || (valor || 0) <= 0}
        aria-label={`Una hoja menos en ${nombreDocumento}`}
        className="doc-tap disabled:opacity-40"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        // `text` y no `number`: ver el punto 1 del comentario de cabecera.
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={texto}
        disabled={deshabilitado}
        aria-label={etiqueta}
        placeholder="0"
        onChange={(e) => {
          // Se acepta solo dígitos, para que el campo no llegue nunca al backend
          // con algo que este vaya a rechazar.
          const limpio = e.target.value.replace(/\D+/g, "").slice(0, 3);
          setTexto(limpio);
          const numero = limpio === "" ? 0 : parseInt(limpio, 10);
          valorExterno.current = numero;
          onChange(numero);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            emitir((valor || 0) + 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            emitir((valor || 0) - 1);
          }
        }}
      />
      <button
        type="button"
        onClick={() => emitir((valor || 0) + 1)}
        disabled={deshabilitado || (valor || 0) >= MAX_HOJAS}
        aria-label={`Una hoja más en ${nombreDocumento}`}
        className="doc-tap disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className="pr-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--doc-text-faint)]">
        hojas{condicional ? "*" : ""}
      </span>
    </span>
  );
}

/**
 * Distintivo de presentación: Física / Digital, con el asterisco del área.
 *
 * Es información del catálogo, no una decisión de la interfaz. El asterisco de
 * las filas 2 y 3 de la lista («SÍ*») está modelado como
 * `presentacionFisica: 'CONDICIONAL'` y se explica en una leyenda al pie de la
 * sección, no como un texto suelto pegado al nombre del documento.
 */
export function SelloPresentacion({
  fisica,
  digital,
}: {
  fisica: "SI" | "NO" | "CONDICIONAL";
  digital: "SI" | "NO";
}) {
  const sellos: { texto: string; tono: "fisica" | "digital" }[] = [];
  if (fisica === "SI") sellos.push({ texto: "Física", tono: "fisica" });
  if (fisica === "CONDICIONAL") sellos.push({ texto: "Física*", tono: "fisica" });
  if (digital === "SI") sellos.push({ texto: "Digital", tono: "digital" });

  if (!sellos.length) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {sellos.map((sello) => (
        <span
          key={sello.texto}
          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={
            sello.tono === "fisica"
              ? { background: "var(--doc-accent-bg)", color: "var(--doc-accent-fg)" }
              : { background: "var(--doc-surface-sunken)", color: "var(--doc-text-muted)" }
          }
          title={
            sello.tono === "fisica"
              ? "Se entrega en papel y se archiva en el legajo."
              : "Se entrega escaneado o por correo."
          }
        >
          {sello.texto}
        </span>
      ))}
    </span>
  );
}

/** Leyenda del asterisco. Va una sola vez, al pie de la sección. */
export function LeyendaCondicional() {
  return (
    <p className="doc-prose mt-2 text-[11px] italic text-[color:var(--doc-text-faint)]">
      <strong className="not-italic">Física*</strong> — el original en papel se pide solo cuando la copia digital no
      basta para el legajo (por ejemplo, si el certificado debe archivarse firmado). En los demás casos alcanza con el
      escaneado.
    </p>
  );
}
