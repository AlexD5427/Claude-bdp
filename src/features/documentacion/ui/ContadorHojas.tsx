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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
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

/* ------------------------------------------------------------------ */
/* Presentación elegible: el chip deslizable                           */
/* ------------------------------------------------------------------ */

/** Las tres formas en que el área piensa la presentación de un documento. */
export type ModoPresentacion = "FISICO" | "DIGITAL" | "AMBOS";

const MODOS: { codigo: ModoPresentacion; etiqueta: string; ayuda: string }[] = [
  { codigo: "FISICO", etiqueta: "Físico", ayuda: "Solo en papel: se archiva en el legajo y se cuentan sus hojas." },
  { codigo: "DIGITAL", etiqueta: "Digital", ayuda: "Solo escaneado o por correo: no tiene hojas que contar." },
  { codigo: "AMBOS", etiqueta: "Ambos", ayuda: "En papel y escaneado. Es lo más habitual, y por eso viene marcado." },
];

/** Par de banderas del modelo → el modo que entiende la pantalla. */
export function modoDesdePresentacion(fisica: string, digital: string): ModoPresentacion {
  const hayFisica = fisica === "SI" || fisica === "CONDICIONAL";
  const hayDigital = digital === "SI";
  if (hayFisica && hayDigital) return "AMBOS";
  if (hayFisica) return "FISICO";
  return "DIGITAL";
}

/** ¿Este modo lleva conteo de hojas? Es la regla del backend, en una línea. */
export function modoLlevaHojas(modo: ModoPresentacion): boolean {
  return modo !== "DIGITAL";
}

/**
 * Selector de presentación con indicador deslizante.
 *
 * ── Por qué un segmentado y no dos casillas ─────────────────────────────────
 * Dos casillas «física» y «digital» permiten desmarcar las dos, y un documento
 * que no se entrega de ninguna forma no existe. El backend lo rechaza, pero
 * rechazar algo que la interfaz dejó construir es una mala conversación: la
 * persona ya decidió algo imposible y tiene que deshacerlo. Con tres opciones
 * excluyentes, el estado imposible no se puede ni pedir.
 *
 * ── Por qué el indicador se mueve con `transform` ───────────────────────────
 * Un `layoutId` de framer-motion mide y reposiciona en el hilo principal en cada
 * fotograma. Aquí la posición es aritmética —un tercio por opción— así que se
 * anima `translateX`, que el compositor resuelve en la GPU y no toca el diseño.
 * En un equipo modesto con veinticinco filas en pantalla, esa diferencia es la
 * que separa un deslizamiento fluido de un salto.
 */
export function SelectorPresentacion({
  valor,
  onChange,
  nombreDocumento,
  deshabilitado,
  reducido,
}: {
  valor: ModoPresentacion;
  onChange: (modo: ModoPresentacion) => void;
  nombreDocumento: string;
  deshabilitado?: boolean;
  reducido?: boolean;
}) {
  const indice = Math.max(0, MODOS.findIndex((m) => m.codigo === valor));
  const grupo = useRef<HTMLDivElement | null>(null);

  function mover(direccion: 1 | -1) {
    const siguiente = MODOS[(indice + direccion + MODOS.length) % MODOS.length];
    onChange(siguiente.codigo);
    grupo.current?.querySelector<HTMLElement>(`[data-modo="${siguiente.codigo}"]`)?.focus();
  }

  return (
    <span
      ref={grupo}
      role="radiogroup"
      aria-label={`Forma de presentación de ${nombreDocumento}`}
      className="doc-presentacion"
      data-inactivo={deshabilitado ? "si" : undefined}
      data-reducido={reducido ? "si" : undefined}
    >
      <span
        className="doc-presentacion-indicador"
        style={{ transform: `translate3d(${indice * 100}%, 0, 0)` }}
        aria-hidden
      />
      {MODOS.map((modo) => {
        const activo = modo.codigo === valor;
        return (
          <button
            key={modo.codigo}
            type="button"
            role="radio"
            aria-checked={activo}
            data-modo={modo.codigo}
            /* Patrón de radiogrupo: una sola parada de tabulador y las flechas
               recorren las tres opciones. Con tres botones tabulables, llegar al
               campo siguiente costaba tres pulsaciones por fila. */
            tabIndex={activo || (indice < 0 && modo.codigo === "AMBOS") ? 0 : -1}
            disabled={deshabilitado}
            title={modo.ayuda}
            onClick={() => onChange(modo.codigo)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                mover(1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                mover(-1);
              }
            }}
          >
            {modo.etiqueta}
          </button>
        );
      })}
    </span>
  );
}

/**
 * El contador de hojas que aparece y desaparece.
 *
 * ── Por qué la altura se anima y el contenido no se desmonta al instante ────
 * Porque el contador aparece como CONSECUENCIA de elegir «Físico» o «Ambos», y
 * una fila que crece de golpe empuja las de abajo sin avisar: quien iba a pulsar
 * el chip de la fila siguiente pulsa otra cosa. Con la transición, el ojo sigue
 * el movimiento.
 *
 * `AnimatePresence` desmonta al terminar la salida, así que un contador oculto
 * no queda en el árbol: un campo de formulario invisible sigue siendo tabulable
 * y sigue leyéndose con un lector de pantalla.
 */
export function ContadorHojasRevelado({
  visible,
  reducido,
  children,
}: {
  visible: boolean;
  reducido?: boolean;
  children: ReactNode;
}) {
  return (
    /* `AnimatePresence` identifica a sus hijos por `key`. Sin ella no detecta la
       salida y el nodo se queda montado: el contador desaparecía de la vista
       —ancho cero— pero seguía en el árbol, tabulable y audible. */
    <AnimatePresence initial={false}>
      {visible && (
        <motion.span
          key="contador-hojas"
          className="inline-flex overflow-hidden"
          initial={reducido ? false : { opacity: 0, width: 0, scale: 0.94 }}
          animate={{ opacity: 1, width: "auto", scale: 1 }}
          exit={reducido ? undefined : { opacity: 0, width: 0, scale: 0.94 }}
          transition={reducido ? { duration: 0 } : { duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
          style={{ transformOrigin: "left center" }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * Campo de nombre libre para el requisito «Otros».
 *
 * ── Tres decisiones ─────────────────────────────────────────────────────────
 * 1. **El nombre no se valida como obligatorio al escribir.** Se avisa, en ámbar
 *    y sin bloquear: quien está llenando el expediente puede querer volver luego.
 *    La revisión final del asistente sí lo lista como pendiente.
 * 2. **Tope de 160 caracteres**, el mismo del backend, aplicado en el campo: un
 *    rechazo del servidor por longitud es una espera de red para decir algo que
 *    el navegador sabía.
 * 3. **Sin `autoFocus`.** Es una fila entre veinte: robar el foco al pintarla
 *    interrumpe a quien está tecleando en otra.
 */
export function CampoNombreLibre({
  valor,
  onChange,
  deshabilitado,
  placeholder = "Escribe el nombre del documento",
}: {
  valor: string;
  onChange: (valor: string) => void;
  deshabilitado?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={valor}
      disabled={deshabilitado}
      maxLength={MAX_NOMBRE_LIBRE}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Nombre del documento"
      className="doc-nombre-libre"
    />
  );
}

/** Tope del backend (`DOC2_LIMITS.MAX_NOMBRE_PERSONALIZADO`). */
export const MAX_NOMBRE_LIBRE = 160;
