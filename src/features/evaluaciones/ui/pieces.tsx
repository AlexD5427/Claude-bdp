/**
 * Piezas visuales compartidas del módulo.
 *
 * Todo lo que se repite en más de una pantalla vive aquí: píldoras de estado,
 * anillos de progreso, paneles de vidrio, botones de copia, cuentas atrás. Se
 * apoyan en los tokens Liquid Glass de `src/index.css` (`--glass-bg`, `--hairline`,
 * `--fill-1..3`, `--ink*`), así que respetan el tema claro y el oscuro sin
 * condicionales.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { EstadoEvaluacion, EstadoIntento } from "../domain/model";
import { ESTADO_INTENTO_LABEL, ESTADO_LABEL } from "../domain/model";

/* --------------------------------- Píldoras ------------------------------- */

export type Tono = "neutral" | "info" | "exito" | "aviso" | "peligro" | "acento";

/**
 * Clases de tono.
 *
 * Antes cada píldora traía su tríada de colores fijos de Tailwind
 * (`tone-info tone-ring`), elegida mirando el tema
 * oscuro. En el tema claro, un texto `cyan-200` sobre vidrio blanco es
 * prácticamente invisible —era el caso de los puntos de cada pregunta, del
 * contador de bloqueos y de media docena de rótulos más—. Ahora el color lo
 * decide el TEMA a través de `--tone-*` (ver `src/index.css`) y la interfaz solo
 * pide el tono.
 */
export const TONO: Record<Tono, string> = {
  neutral: "tone-neutral tone-ring",
  info: "tone-info tone-ring",
  exito: "tone-exito tone-ring",
  aviso: "tone-aviso tone-ring",
  peligro: "tone-peligro tone-ring",
  acento: "tone-acento tone-ring",
};

/** Solo el color del texto del tono, para números y rótulos sin fondo. */
export const TONO_TEXTO: Record<Tono, string> = {
  neutral: "tone-text-neutral",
  info: "tone-text-info",
  exito: "tone-text-exito",
  aviso: "tone-text-aviso",
  peligro: "tone-text-peligro",
  acento: "tone-text-acento",
};

export function Pill({
  tono = "neutral",
  children,
  punto = true,
  className = "",
  title,
}: {
  tono?: Tono;
  children: ReactNode;
  punto?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${TONO[tono]} ${className}`}
    >
      {punto && <span className="tone-dot h-1.5 w-1.5 shrink-0 rounded-full" />}
      {children}
    </span>
  );
}

const TONO_ESTADO: Record<EstadoEvaluacion, Tono> = {
  borrador: "aviso",
  publicada: "exito",
  pausada: "info",
  cerrada: "neutral",
  archivada: "neutral",
  papelera: "peligro",
};

export function EstadoPill({ estado, className = "" }: { estado: EstadoEvaluacion; className?: string }) {
  return (
    <Pill tono={TONO_ESTADO[estado]} className={className}>
      {ESTADO_LABEL[estado]}
    </Pill>
  );
}

const TONO_INTENTO: Record<EstadoIntento, Tono> = {
  en_curso: "info",
  enviado: "exito",
  expirado: "aviso",
  abandonado: "neutral",
  anulado: "peligro",
};

export function EstadoIntentoPill({ estado }: { estado: EstadoIntento }) {
  return <Pill tono={TONO_INTENTO[estado]}>{ESTADO_INTENTO_LABEL[estado]}</Pill>;
}

/**
 * Píldora de riesgo de integridad.
 *
 * Siempre lleva el número junto a la palabra: un color por sí solo no comunica
 * nada a quien no distingue tonos, y además «alto» sin cifra invita a discutir.
 */
export function RiesgoPill({ nivel, riesgo }: { nivel: string; riesgo: number }) {
  const tono: Tono = nivel === "alto" ? "peligro" : nivel === "medio" ? "aviso" : "exito";
  const texto = nivel === "alto" ? "Riesgo alto" : nivel === "medio" ? "Riesgo medio" : "Sin señales";
  return (
    <Pill tono={tono}>
      {texto} · {riesgo}
    </Pill>
  );
}

/* ------------------------------- Contenedores ----------------------------- */

export function GlassPanel({
  children,
  className = "",
  padding = "p-5",
  /** Entrada animada. Se apaga en listas largas, donde el escalonado lo pone el padre. */
  animado = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
  animado?: boolean;
  id?: string;
}) {
  if (!animado) {
    return (
      <div id={id} className={`glass rounded-3xl ${padding} ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className={`glass rounded-3xl ${padding} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-ink">{titulo}</h3>
        {descripcion && <p className="mt-1 max-w-2xl text-xs text-ink-soft">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

/* ------------------------------ Indicadores ------------------------------- */

/**
 * Número que se anima hasta su valor.
 *
 * Un contador que salta de 3 a 41 no comunica que algo cambió; uno que recorre
 * la distancia sí, y de paso dirige la mirada al dato que se movió. Se usa un
 * muelle sobre un valor de movimiento, así que la animación vive fuera del ciclo
 * de renderizado de React: no re-renderiza nada por fotograma.
 */
export function NumeroAnimado({
  valor,
  decimales = 0,
  className = "",
}: {
  valor: number;
  decimales?: number;
  className?: string;
}) {
  const crudo = useMotionValue(valor);
  const suave = useSpring(crudo, { stiffness: 90, damping: 18, restDelta: 0.001 });
  const texto = useTransform(suave, (v) =>
    (Math.round(v * 10 ** decimales) / 10 ** decimales).toFixed(decimales),
  );
  useEffect(() => {
    crudo.set(valor);
  }, [crudo, valor]);
  return <motion.span className={`tabular-nums ${className}`}>{texto}</motion.span>;
}

export function Metrica({
  etiqueta,
  valor,
  sufijo = "",
  tono = "neutral",
  icono,
  destacada = false,
  onClick,
  title,
}: {
  etiqueta: string;
  valor: string | number;
  sufijo?: string;
  tono?: Tono;
  icono?: ReactNode;
  /** Resalta la métrica con el color del tono en lugar de tinta neutra. */
  destacada?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const numerico = typeof valor === "number" && Number.isFinite(valor);
  const decimales = numerico && !Number.isInteger(valor) ? 1 : 0;
  const Contenedor = onClick ? motion.button : motion.div;
  return (
    <Contenedor
      layout
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={title}
      whileHover={onClick ? { y: -2 } : undefined}
      className={`flex min-w-[7rem] flex-col gap-0.5 rounded-2xl px-3 py-2 text-left transition-shadow duration-300 ${
        destacada ? `${TONO[tono]}` : "fill-softer ring-1 ring-[color:var(--hairline)]"
      } ${onClick ? "cursor-pointer hover:shadow-glass" : ""}`}
    >
      <span
        className={`flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] ${
          destacada ? "opacity-90" : "text-ink-faint"
        }`}
      >
        {icono}
        {etiqueta}
      </span>
      <span className={`text-lg font-black tabular-nums ${destacada ? "" : "text-ink"}`}>
        {numerico ? <NumeroAnimado valor={valor as number} decimales={decimales} /> : valor}
        {sufijo && <span className="ml-0.5 text-xs font-bold opacity-70">{sufijo}</span>}
      </span>
    </Contenedor>
  );
}

/* ------------------------------ Estados de carga -------------------------- */

/**
 * Barra de progreso de una carga por ETAPAS.
 *
 * El módulo lee de una hoja de cálculo a través de Apps Script: una espera de
 * dos o tres segundos es normal y antes no se anunciaba de ninguna manera, así
 * que la pantalla parecía colgada. Esta barra muestra el progreso real —cuántas
 * de las etapas previstas terminaron— y, mientras una etapa está en vuelo,
 * avanza con una onda para no quedarse quieta. Nunca finge llegar al 100 %: el
 * último tramo lo cierra el propio final de la carga.
 */
export function BarraCarga({
  progreso,
  etiqueta,
  className = "",
}: {
  /** 0 a 1. */
  progreso: number;
  etiqueta?: string;
  className?: string;
}) {
  const porcentaje = Math.round(Math.max(0.04, Math.min(1, progreso)) * 100);
  return (
    <div className={`flex flex-col gap-1 ${className}`} role="status" aria-live="polite">
      {etiqueta && (
        <div className="flex items-center justify-between gap-2 text-[0.68rem] font-semibold text-ink-soft">
          <span className="truncate">{etiqueta}</span>
          <span className="tabular-nums text-ink-faint">{porcentaje} %</span>
        </div>
      )}
      <div className="barra-carga h-1.5 w-full">
        <span style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}

/** Rectángulo de carga. Se usa para dibujar la FORMA de lo que va a llegar. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`esqueleto ${className}`} aria-hidden />;
}

/**
 * Esqueleto del listado.
 *
 * Preferimos la silueta al giro de una ruleta: enseña la estructura de la
 * pantalla, así que cuando llegan los datos nada se mueve de sitio.
 */
export function EsqueletoTarjetas({ cuantas = 6 }: { cuantas?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: cuantas }, (_, i) => (
        <div key={i} className="glass flex flex-col gap-3 rounded-3xl p-4">
          <div className="flex items-center gap-2">
            <Esqueleto className="h-5 w-20 rounded-full" />
            <Esqueleto className="h-5 w-24 rounded-full" />
          </div>
          <Esqueleto className="h-5 w-3/4" />
          <Esqueleto className="h-3 w-1/3" />
          <div className="grid grid-cols-3 gap-2">
            <Esqueleto className="h-10" />
            <Esqueleto className="h-10" />
            <Esqueleto className="h-10" />
          </div>
          <Esqueleto className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de una tabla, con su cabecera. */
export function EsqueletoTabla({ filas = 6, columnas = 6 }: { filas?: number; columnas?: number }) {
  return (
    <div className="glass overflow-hidden rounded-3xl p-4" aria-hidden>
      <div className="mb-3 flex gap-3">
        {Array.from({ length: columnas }, (_, i) => (
          <Esqueleto key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: filas }, (_, f) => (
          <div key={f} className="flex items-center gap-3">
            {Array.from({ length: columnas }, (_, c) => (
              <Esqueleto key={c} className={`h-4 flex-1 ${c === 0 ? "max-w-[14rem]" : ""}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Texto que se desplaza sobre su propio renglón cuando no cabe.
 *
 * Recortar con puntos suspensivos oculta justo la parte que distingue dos
 * títulos parecidos («Analista de riesgo · conocimientos» y «… · situacional»).
 * Aquí el texto se mide y, solo si desborda, recorre su renglón al pasar el
 * puntero: en reposo no se mueve nada, que es lo que se espera de una lista.
 */
export function TextoRecorrido({
  texto,
  className = "",
  /** Píxeles por segundo del recorrido. */
  velocidad = 34,
}: {
  texto: string;
  className?: string;
  velocidad?: number;
}) {
  const caja = useRef<HTMLSpanElement>(null);
  const interior = useRef<HTMLSpanElement>(null);
  const [desborde, setDesborde] = useState(0);

  useEffect(() => {
    const medir = () => {
      const c = caja.current;
      const i = interior.current;
      if (!c || !i) return;
      const diferencia = i.scrollWidth - c.clientWidth;
      setDesborde(diferencia > 3 ? diferencia : 0);
    };
    medir();
    const observador = new ResizeObserver(medir);
    if (caja.current) observador.observe(caja.current);
    if (interior.current) observador.observe(interior.current);
    return () => observador.disconnect();
  }, [texto]);

  const recorrido = desborde + 6;
  const duracion = Math.max(2.4, recorrido / velocidad);

  return (
    <motion.span
      ref={caja}
      title={texto}
      initial="reposo"
      whileHover={desborde > 0 ? "recorre" : "reposo"}
      whileFocus={desborde > 0 ? "recorre" : "reposo"}
      className={`relative block overflow-hidden whitespace-nowrap ${className}`}
    >
      <motion.span
        ref={interior}
        className="inline-block will-change-transform"
        variants={{ reposo: { x: 0 }, recorre: { x: -recorrido } }}
        transition={{ duration: duracion, ease: "easeInOut" }}
      >
        {texto}
      </motion.span>
    </motion.span>
  );
}

/**
 * Anillo de progreso.
 *
 * Se dibuja con SVG y una transición de `stroke-dashoffset`: es una sola propiedad
 * animable, así que el navegador la compone sin recalcular el diseño.
 */
export function Anillo({
  valor,
  maximo = 100,
  tamano = 64,
  grosor = 6,
  etiqueta,
  tono = "#00b0d8",
}: {
  valor: number;
  maximo?: number;
  tamano?: number;
  grosor?: number;
  etiqueta?: string;
  tono?: string;
}) {
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const proporcion = maximo > 0 ? Math.max(0, Math.min(1, valor / maximo)) : 0;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke="var(--fill-2)"
          strokeWidth={grosor}
        />
        <motion.circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke={tono}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          initial={{ strokeDashoffset: circunferencia }}
          animate={{ strokeDashoffset: circunferencia * (1 - proporcion) }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="text-sm font-black tabular-nums text-ink">{Math.round(valor)}</span>
        {etiqueta && <span className="text-[0.55rem] font-bold uppercase tracking-wide text-ink-faint">{etiqueta}</span>}
      </div>
    </div>
  );
}

/** Barra de progreso lisa, con transición de ancho. */
export function Barra({ proporcion, tono = "from-[#00b0d8] to-[#005baa]" }: { proporcion: number; tono?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--fill-2)]">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${tono}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, proporcion * 100))}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      />
    </div>
  );
}

/* --------------------------------- Acciones ------------------------------- */

export function BotonPrimario({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`magnetic inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/25 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${className}`}
    >
      {children}
    </button>
  );
}

export function BotonSecundario({
  children,
  onClick,
  disabled,
  className = "",
  title,
  activo = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-45 ${
        activo
          ? "tone-info tone-ring"
          : "fill-softer text-ink ring-[color:var(--hairline)] hover:fill-soft"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Copia al portapapeles con confirmación visible. */
export function BotonCopiar({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 1800);
    return () => clearTimeout(timer);
  }, [copiado]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(texto).then(() => setCopiado(true));
      }}
      className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft hover:text-ink"
    >
      {copiado ? <Check className="tone-text-exito h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copiado ? "Copiado" : etiqueta}
    </button>
  );
}

export function EnlaceExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-accent underline decoration-cyan-400/40 underline-offset-2 transition-colors hover:text-accent-strong"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/* ----------------------------- Menú en portal ----------------------------- */

/**
 * Menú anclado a un elemento, renderizado en un PORTAL.
 *
 * El módulo anterior tenía menús que aparecían detrás de otras capas o fuera de la
 * pantalla. La causa era doble: se renderizaban dentro de un contenedor con
 * `overflow` y su `z-index` competía con el de la tarjeta. Aquí el menú vive en
 * `document.body`, se posiciona con coordenadas absolutas medidas del ancla, y se
 * reubica solo si no cabe hacia abajo o hacia la derecha.
 */
export function MenuAnclado({
  ancla,
  onClose,
  children,
  ancho = 232,
}: {
  ancla: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  ancho?: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [posicion, setPosicion] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    const colocar = () => {
      const rect = ancla.getBoundingClientRect();
      const alto = caja.current?.offsetHeight ?? 240;
      const margen = 8;
      let top = rect.bottom + margen;
      // Si no cabe debajo, se abre hacia arriba. Si tampoco, se pega al borde.
      if (top + alto > window.innerHeight - margen) {
        top = Math.max(margen, rect.top - alto - margen);
      }
      let left = rect.right - ancho;
      if (left < margen) left = margen;
      if (left + ancho > window.innerWidth - margen) left = window.innerWidth - ancho - margen;
      setPosicion({ top, left });
    };
    colocar();
    // Reposicionar al desplazar o redimensionar mantiene el menú pegado al ancla.
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    return () => {
      window.removeEventListener("scroll", colocar, true);
      window.removeEventListener("resize", colocar);
    };
  }, [ancla, ancho]);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [onClose]);

  return createPortal(
    <>
      {/* Capa de cierre. Cubre toda la pantalla para que un clic fuera cierre el
          menú sin necesidad de escuchar en `document` y adivinar el objetivo. */}
      <div className="fixed inset-0 z-[150]" onClick={onClose} aria-hidden />
      <motion.div
        ref={caja}
        role="menu"
        initial={{ opacity: 0, scale: 0.96, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{ position: "fixed", top: posicion.top, left: posicion.left, width: ancho, zIndex: 151 }}
        className="glass-heavy overflow-hidden rounded-2xl p-1.5 shadow-glass"
      >
        {children}
      </motion.div>
    </>,
    document.body,
  );
}

export function ItemMenu({
  children,
  onClick,
  icono,
  disabled = false,
  destructivo = false,
}: {
  children: ReactNode;
  onClick: () => void;
  icono?: ReactNode;
  disabled?: boolean;
  destructivo?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        destructivo ? "tone-text-peligro hover:bg-rose-500/15" : "text-ink hover:fill-soft"
      }`}
    >
      {icono && <span className="shrink-0 opacity-80">{icono}</span>}
      {children}
    </button>
  );
}

export function SeparadorMenu() {
  return <div className="my-1 h-px bg-[color:var(--hairline)]" />;
}

/* --------------------------------- Diálogos ------------------------------- */

/**
 * Diálogo a pantalla completa con vidrio pesado.
 *
 * Se usa para el visor de intentos y los paneles de conexión. Bloquea el
 * desplazamiento del fondo mientras está abierto, porque un modal que deja
 * desplazar lo de detrás se siente roto en móvil.
 */
export function GlassOverlay({
  abierto,
  onClose,
  children,
  ancho = "max-w-6xl",
  etiqueta,
}: {
  abierto: boolean;
  onClose: () => void;
  children: ReactNode;
  ancho?: string;
  etiqueta: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", alTeclado);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = previo;
    };
  }, [abierto, onClose]);

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={etiqueta}
        >
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={onClose} aria-hidden />
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            className={`glass-heavy relative z-10 my-auto w-full ${ancho} rounded-3xl p-4 sm:p-6`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* --------------------------------- Formato -------------------------------- */

/** Duración legible a partir de segundos. */
export function formatearDuracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return "—";
  const total = Math.max(0, Math.round(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  if (horas > 0) return `${horas} h ${String(minutos).padStart(2, "0")} min`;
  if (minutos > 0) return `${minutos} min ${String(resto).padStart(2, "0")} s`;
  return `${resto} s`;
}

/** Cuenta atrás en `mm:ss`, para el temporizador de la prueba. */
export function formatearReloj(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  const base = `${String(minutos).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
  return horas > 0 ? `${horas}:${base}` : base;
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return FORMATO_FECHA.format(new Date(ms));
}

/** «hace 5 min», «hace 2 días». Para las marcas de última actualización. */
export function hace(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const segundos = Math.round((Date.now() - ms) / 1000);
  if (segundos < 60) return "hace unos segundos";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `hace ${dias} día${dias === 1 ? "" : "s"}`;
  return formatearFecha(iso);
}
