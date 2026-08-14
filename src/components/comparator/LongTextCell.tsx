import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Expand, X, Sparkles } from "lucide-react";
import { LevelBadge } from "../LevelBadge";
import { MarqueeText } from "../MarqueeText";
import { proficiencyTone } from "../../lib/levels";
import { usePrefersReducedMotion } from "../../shared/hooks";
import { observeResize } from "../../lib/observers";
import type { TechnicalKnowledge } from "../../types";
import "./comparator-motion.css";

/**
 * Celdas de texto largo del Comparador (Conocimientos, Herramientas y
 * Observaciones).
 *
 * ## El problema
 *
 * Estas tres filas guardan párrafos, no etiquetas: un conocimiento técnico trae
 * nombre, nivel y un detalle de varias líneas. En un monitor grande caben; en un
 * portátil de 13" la celda recorta el texto y el analista no puede leer lo que
 * está evaluando, que es justo lo que vino a hacer.
 *
 * ## Las dos salidas
 *
 * 1. **Revelado al pasar el puntero (o el dedo).** La celda mantiene su alto y,
 *    mientras hay puntero encima, el contenido se desliza dentro de sus límites
 *    hasta el final y vuelve al principio, en bucle y con descansos en los
 *    extremos. Sin puntero, la celda se ve exactamente como antes: nada se mueve
 *    solo. El desplazamiento es una animación CSS de `transform`, así que la
 *    resuelve la GPU y no cuesta un solo re-render de React.
 * 2. **Visor ampliado.** Un botón sobre la celda abre el contenido completo en
 *    un panel grande de vidrio, con tipografía cómoda, que **crece desde la
 *    propia celda** y al cerrarse **vuelve a ella**, sin mover el
 *    desplazamiento de la página. El texto se revela escalonado, bloque a
 *    bloque.
 *
 * Todo respeta `prefers-reduced-motion`: con movimiento reducido no hay
 * marquesina ni recorrido, y el visor aparece con un simple fundido.
 */

export type LongCellKind = "items" | "tags";

interface LongCellProps {
  kind: LongCellKind;
  /** Filas de conocimientos / herramientas. */
  items?: TechnicalKnowledge[];
  /** Etiquetas de observaciones. */
  tags?: string[];
  /** Mostrar el detalle de cada ítem (Conocimientos Técnicos). */
  withDetalle?: boolean;
  /** Rótulo de la fila, para el encabezado del visor ("Conocimientos"). */
  rowLabel: string;
  rowSub?: string;
  /** A quién pertenece la celda, para el encabezado del visor. */
  candidateName: string;
}

export function LongCell({
  kind,
  items = [],
  tags = [],
  withDetalle = false,
  rowLabel,
  rowSub,
  candidateName,
}: LongCellProps) {
  const reduceMotion = usePrefersReducedMotion();
  const clipRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);

  // Medimos el desborde real (no el declarado): sólo así sabemos si hace falta
  // recorrer la celda. Un ResizeObserver en el recorte y en el contenido cubre
  // el cambio de tamaño de ventana, el modo compacto y la llegada de más datos.
  useEffect(() => {
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!clip || !inner) return;
    const measure = () => {
      const diff = inner.scrollHeight - clip.clientHeight;
      setOverflow(diff > 6 ? diff : 0);
    };
    measure();
    return observeResize([clip, inner], measure);
  }, [items, tags]);

  const revealing = hover && overflow > 0 && !reduceMotion;
  // ~26 px/s de lectura cómoda, con un 30 % del ciclo en pausa a cada extremo.
  const duration = Math.max(4, ((overflow / 26) * 2) / 0.7);

  const openViewer = useCallback(() => {
    setOrigin(clipRef.current?.getBoundingClientRect() ?? null);
  }, []);

  const empty = kind === "items" ? items.length === 0 : tags.length === 0;
  if (empty) {
    return (
      <div className="flex h-full min-h-[64px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--hairline)] text-sm text-ink-faint">
        —
      </div>
    );
  }

  return (
    <div
      className="cmp-long group relative h-full"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerCancel={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="glass h-full rounded-2xl p-3 print-avoid-break">
        <div ref={clipRef} className="cmp-clip">
          <div
            ref={innerRef}
            className={revealing ? "cmp-reveal" : undefined}
            style={
              revealing
                ? ({
                    "--cmp-reveal-y": `-${overflow}px`,
                    animationDuration: `${duration}s`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {kind === "items" ? (
              <ItemRows items={items} withDetalle={withDetalle} marquee={hover} />
            ) : (
              <TagRows tags={tags} />
            )}
          </div>
        </div>

        {/* Degradados que enmarcan el recorte: el inferior avisa de que hay más
            texto; el superior aparece sólo durante el recorrido, para que la
            línea que sale por arriba se desvanezca en vez de cortarse en seco. */}
        {overflow > 0 && <span aria-hidden className="cmp-fade" />}
        {revealing && <span aria-hidden className="cmp-fade-top" />}

        <button
          type="button"
          onClick={openViewer}
          title={`Ampliar ${rowLabel.toLowerCase()} de ${candidateName}`}
          aria-label={`Ampliar ${rowLabel} de ${candidateName}`}
          className="cmp-expand no-print"
        >
          <Expand className="h-3.5 w-3.5" />
        </button>
      </div>

      <CellViewer
        origin={origin}
        onClose={() => setOrigin(null)}
        title={rowLabel}
        subtitle={rowSub}
        candidateName={candidateName}
        kind={kind}
        items={items}
        tags={tags}
        withDetalle={withDetalle}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contenido                                                           */
/* ------------------------------------------------------------------ */

function ItemRows({
  items,
  withDetalle,
  marquee,
}: {
  items: TechnicalKnowledge[];
  withDetalle: boolean;
  marquee: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div
          key={`${it.nombre}-${i}`}
          className="border-b border-[color:var(--hairline)] pb-2 last:border-0 last:pb-0"
        >
          {/* La primera línea deja hueco al botón de ampliación, que flota en
              esa esquina; sin el hueco pisaba la píldora de nivel. */}
          <div className={`flex items-center justify-between gap-2 ${i === 0 ? "pr-7" : ""}`}>
            <MarqueeText
              text={it.nombre}
              // Sólo se mueve mientras el puntero está sobre la celda.
              active={marquee}
              className="min-w-0 flex-1 text-xs font-bold text-ink"
            />
            {it.nivel && <LevelBadge value={it.nivel} tone={proficiencyTone(it.nivel)} />}
          </div>
          {withDetalle && it.detalle && (
            <p className="mt-0.5 text-[0.65rem] italic text-ink-faint">{it.detalle}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function TagRows({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap content-start gap-1.5 pr-7">
      {tags.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="rounded-full fill-softer px-2.5 py-0.5 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visor ampliado                                                      */
/* ------------------------------------------------------------------ */

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.12 } },
};

const blockVariants: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  },
};

function CellViewer({
  origin,
  onClose,
  title,
  subtitle,
  candidateName,
  kind,
  items,
  tags,
  withDetalle,
}: {
  /** Rectángulo de la celda que abrió el visor: de ahí nace y ahí vuelve. */
  origin: DOMRect | null;
  onClose: () => void;
  title: string;
  subtitle?: string;
  candidateName: string;
  kind: LongCellKind;
  items: TechnicalKnowledge[];
  tags: string[];
  withDetalle: boolean;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = origin !== null;

  // Cerrar con Escape y bloquear el desplazamiento del fondo SIN perder la
  // posición: al cerrar, el comparador queda exactamente donde estaba.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 220);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      // Algunos navegadores restauran el scroll al liberar `overflow`; lo
      // devolvemos nosotros para que la vuelta sea siempre al mismo sitio.
      if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo({ top: scrollY });
    };
  }, [open, onClose]);

  // Transformación de partida: el panel nace en el centro de la celda.
  const from = useMemo(() => {
    if (!origin || reduceMotion) return { opacity: 0, scale: 1, x: 0, y: 0 };
    const dx = origin.left + origin.width / 2 - window.innerWidth / 2;
    const dy = origin.top + origin.height / 2 - window.innerHeight / 2;
    return { opacity: 0, scale: 0.7, x: dx, y: dy };
  }, [origin, reduceMotion]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} · ${candidateName}`}
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="cmp-viewer glass-heavy relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] shadow-glass ring-1 ring-white/25"
            initial={from}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={from}
            transition={
              reduceMotion
                ? { duration: 0.001 }
                : { type: "spring", stiffness: 210, damping: 26, mass: 0.9 }
            }
          >
            {/* Barrido especular, una sola pasada al abrir. */}
            <span aria-hidden className="cmp-viewer-sheen" />

            <header className="relative flex items-start gap-3 border-b border-[color:var(--hairline)] px-6 py-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <motion.h3
                  className="text-lg font-black tracking-tight text-ink sm:text-xl"
                  initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {title}
                </motion.h3>
                <motion.p
                  className="truncate text-xs text-ink-soft"
                  initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.14, duration: 0.35 }}
                >
                  {candidateName}
                  {subtitle ? ` · ${subtitle}` : ""}
                </motion.p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:bg-rose-500/80 hover:text-white active:scale-90"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <motion.div
              className="cmp-viewer-body min-h-0 flex-1 overflow-y-auto px-6 py-5"
              variants={reduceMotion ? undefined : listVariants}
              initial="hidden"
              animate="show"
            >
              {kind === "items" ? (
                <ul className="space-y-3">
                  {items.map((it, i) => (
                    <motion.li
                      key={`${it.nombre}-${i}`}
                      variants={reduceMotion ? undefined : blockVariants}
                      className="glass rounded-2xl p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="min-w-0 flex-1 text-base font-bold text-ink">
                          {it.nombre}
                        </h4>
                        {it.nivel && (
                          <LevelBadge value={it.nivel} tone={proficiencyTone(it.nivel)} />
                        )}
                      </div>
                      {withDetalle && it.detalle && (
                        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                          {it.detalle}
                        </p>
                      )}
                    </motion.li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {tags.map((t, i) => (
                    <motion.span
                      key={`${t}-${i}`}
                      variants={reduceMotion ? undefined : blockVariants}
                      className="rounded-2xl fill-softer px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)]"
                    >
                      {t}
                    </motion.span>
                  ))}
                </div>
              )}
            </motion.div>

            <footer className="border-t border-[color:var(--hairline)] px-6 py-3 text-[0.7rem] text-ink-faint">
              {kind === "items"
                ? `${items.length} registro(s) · pulse Escape para volver a la comparativa`
                : `${tags.length} observación(es) · pulse Escape para volver a la comparativa`}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
