/**
 * Hoja central: la superficie modal grande del módulo.
 *
 * ── Qué reemplaza y por qué ─────────────────────────────────────────────────
 * Dos superficies del módulo estaban mal resueltas y por el mismo motivo:
 *
 *   · el asistente de alta ocupaba TODA la pantalla (`inset-0`). Una superficie
 *     a pantalla completa no dice de dónde vino ni a qué se vuelve, y con seis
 *     campos en el primer paso deja el 70 % del monitor vacío;
 *   · el expediente entraba como cajón desde la derecha con `max-w-5xl`. Un
 *     expediente Tipo 2 tiene veinticinco requisitos con chips, contadores y
 *     observaciones: en una columna estrecha se lee arrastrando, y arrastrando no
 *     se compara nada.
 *
 * Las dos son ahora la misma pieza: una hoja central grande sobre fondo
 * atenuado, con aire alrededor, esquinas continuas y scroll DENTRO de sí misma.
 * En móvil ocupa todo el ancho y se pega abajo, que ahí es lo correcto.
 *
 * ── Los invariantes que esta pieza cumple ───────────────────────────────────
 * Son los que este repositorio ya pagó con errores, y están todos:
 *
 * 1. **Candado de scroll con recuento** (`lib/scrollLock`). Nunca se toca
 *    `document.body.style.overflow` a mano: apilar dos superficies y cerrar una
 *    dejaba la página trancada.
 * 2. **Foco atrapado y devuelto.** Tab cicla dentro; al cerrar, el foco vuelve al
 *    elemento que abrió.
 * 3. **Manejadores en referencias.** El efecto de teclado depende SOLO de
 *    `abierta`. Si dependiera de `onCerrar` —una función nueva por renderizado—,
 *    se remontaría en cada tecla y su limpieza movería el foco: es el fallo por
 *    el que en las observaciones entraba una sola letra.
 * 4. **Sin `window.confirm`.** La confirmación de «salir sin guardar» es la del
 *    módulo: el diálogo nativo bloquea el hilo y el navegador permite silenciarlo,
 *    y entonces la superficie deja de poder cerrarse.
 * 5. **Apilamiento por debajo de `Z.dialog`.** La hoja vive en 120 y la
 *    confirmación en 165, así que la confirmación siempre queda por encima.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { bloquearScroll } from "../../../lib/scrollLock";
import { DURACION, useMovimientoReducido } from "./DocMotion";

/**
 * Curva de las hojas de iOS.
 *
 * `cubic-bezier(0.32, 0.72, 0, 1)`: arranca decidida y frena muy largo. Es lo
 * que hace que una superficie grande no se sienta pesada al entrar.
 */
export const CURVA_HOJA = [0.32, 0.72, 0, 1] as const;

export type AnchoHoja = "media" | "ancha" | "completa";

const ANCHOS: Record<AnchoHoja, string> = {
  /** Formularios: cómoda de leer, no una sábana. */
  media: "max-w-3xl",
  /** Expediente: aprovecha el monitor sin llegar a línea infinita. */
  ancha: "max-w-6xl",
  /** Casos con tablas anchas. */
  completa: "max-w-[92rem]",
};

export function HojaCentral({
  abierta,
  onCerrar,
  etiqueta,
  encabezado,
  pie,
  children,
  ancho = "media",
  /** Hay una escritura en curso: no se puede cerrar a media escritura. */
  bloqueada,
  /** Hay cambios sin guardar: el cierre pide confirmación en lugar de perderlos. */
  pideConfirmacion,
  onPedirConfirmacion,
}: {
  abierta: boolean;
  onCerrar: () => void;
  /** Nombre accesible del diálogo. */
  etiqueta: string;
  encabezado: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
  ancho?: AnchoHoja;
  bloqueada?: boolean;
  pideConfirmacion?: boolean;
  onPedirConfirmacion?: () => void;
}) {
  const reducido = useMovimientoReducido();
  const contenedor = useRef<HTMLDivElement | null>(null);
  const anterior = useRef<HTMLElement | null>(null);

  /* Invariante 3: los manejadores viven en referencias. */
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const bloqueadaRef = useRef(bloqueada);
  bloqueadaRef.current = bloqueada;
  const confirmaRef = useRef(pideConfirmacion);
  confirmaRef.current = pideConfirmacion;
  const pedirRef = useRef(onPedirConfirmacion);
  pedirRef.current = onPedirConfirmacion;

  const intentarCerrar = useCallback(() => {
    if (bloqueadaRef.current) return;
    if (confirmaRef.current && pedirRef.current) {
      pedirRef.current();
      return;
    }
    cerrarRef.current();
  }, []);

  useEffect(() => {
    if (!abierta) return;
    anterior.current = document.activeElement as HTMLElement | null;

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        intentarCerrar();
        return;
      }
      if (evento.key !== "Tab" || !contenedor.current) return;
      const enfocables = contenedor.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      } else if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      }
    };

    document.addEventListener("keydown", alPulsar);
    const liberarScroll = bloquearScroll();
    const t = setTimeout(() => {
      /**
       * ── El fallo que este `enfocarInicial` corrige ───────────────────────
       * Antes era un `querySelector` con una lista de selectores separados por
       * comas: `'[data-foco-inicial], button, [href], input, …'`. Y eso NO
       * respeta el orden de la lista: `querySelector` devuelve el primer
       * elemento en ORDEN DE DOCUMENTO que encaje con cualquiera de los
       * selectores. El botón de cerrar de la cabecera está antes que el
       * formulario, así que ganaba siempre y el campo marcado con
       * `data-foco-inicial` nunca recibía el foco.
       *
       * En un navegador real eso se nota: `autoFocus` pone el cursor en el
       * primer campo, y 50 ms después este temporizador lo saca. Quien empieza
       * a escribir de inmediato pierde los primeros caracteres —medido: dos de
       * «7654321» acababan en el botón de cerrar—.
       *
       * Ahora se prueba el marcador PRIMERO y, además, no se toca el foco si ya
       * está dentro de la superficie: si `autoFocus` funcionó, o si la persona
       * ya escribió, moverlo es siempre peor.
       */
      const raiz = contenedor.current;
      if (!raiz) return;
      if (raiz.contains(document.activeElement)) return;
      const preferido = raiz.querySelector<HTMLElement>("[data-foco-inicial]");
      const alternativo = raiz.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      (preferido ?? alternativo)?.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", alPulsar);
      clearTimeout(t);
      liberarScroll();
      /**
       * Devolver el foco, pero solo si hay a dónde devolverlo.
       *
       * ── El fallo que esto corrige ────────────────────────────────────────
       * Antes era `anterior.current?.focus?.()` a secas, y eso incluía el caso
       * en que `anterior.current` es `document.body`: cuando la hoja se monta ya
       * abierta —al llegar por un enlace directo, o al restaurar la sesión—
       * nadie tenía el foco al montarla, así que lo capturado es el `body`.
       * Llamar a `body.focus()` no es inofensivo: BORRA el foco activo. O sea,
       * la rama pensada para no perder el sitio era justamente la que lo perdía,
       * y quien cerraba la hoja con Escape se quedaba sin punto de partida para
       * el teclado.
       *
       * También se comprueba que el elemento siga en el documento: si la fila
       * que abrió la hoja desapareció —porque el filtro cambió, o porque el
       * expediente se archivó— enfocar un nodo desconectado tiene el mismo
       * efecto de borrar el foco.
       */
      const destino = anterior.current;
      if (
        destino &&
        destino !== document.body &&
        destino !== document.documentElement &&
        destino.isConnected &&
        typeof destino.focus === "function"
      ) {
        destino.focus();
      }
    };
    // Solo `abierta` e `intentarCerrar` (estable por `useCallback` sin deps).
  }, [abierta, intentarCerrar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            className="doc-velo absolute inset-0"
            initial={reducido ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducido ? undefined : { opacity: 0 }}
            transition={{ duration: reducido ? 0 : DURACION.rapida }}
            onClick={intentarCerrar}
            aria-hidden
          />
          <motion.div
            ref={contenedor}
            role="dialog"
            aria-modal="true"
            aria-label={etiqueta}
            className={`doc-console doc-hoja glass-heavy relative max-h-[100dvh] w-full sm:max-h-[92vh] ${ANCHOS[ancho]}`}
            initial={reducido ? undefined : { opacity: 0, y: 28, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reducido
                ? undefined
                : { opacity: 0, y: 18, scale: 0.99, transition: { duration: DURACION.rapida, ease: CURVA_HOJA } }
            }
            transition={reducido ? { duration: 0 } : { duration: 0.52, ease: CURVA_HOJA }}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <header className="shrink-0 border-b border-[color:var(--doc-border)] px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">{encabezado}</div>
                <button
                  type="button"
                  onClick={intentarCerrar}
                  aria-label="Cerrar"
                  disabled={bloqueada}
                  className="doc-tap shrink-0 rounded-full p-2 text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface-raised)] hover:text-[color:var(--doc-text)] disabled:opacity-40"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </header>

            {/* El scroll vive DENTRO de la hoja: el fondo no se mueve. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</div>

            {pie && (
              <footer className="shrink-0 border-t border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-4 py-3 sm:px-6">
                {pie}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
