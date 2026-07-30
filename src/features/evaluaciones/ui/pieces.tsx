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
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { EstadoEvaluacion, EstadoIntento } from "../domain/model";
import { ESTADO_INTENTO_LABEL, ESTADO_LABEL } from "../domain/model";

/* --------------------------------- Píldoras ------------------------------- */

type Tono = "neutral" | "info" | "exito" | "aviso" | "peligro" | "acento";

const TONO: Record<Tono, string> = {
  neutral: "bg-[color:var(--fill-2)] text-ink-soft ring-[color:var(--hairline)]",
  info: "bg-cyan-500/15 text-cyan-200 ring-cyan-400/30",
  exito: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
  aviso: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
  peligro: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
  acento: "bg-indigo-500/15 text-indigo-200 ring-indigo-400/30",
};

const PUNTO: Record<Tono, string> = {
  neutral: "bg-slate-400",
  info: "bg-cyan-400",
  exito: "bg-emerald-400",
  aviso: "bg-amber-400",
  peligro: "bg-rose-400",
  acento: "bg-indigo-400",
};

export function Pill({
  tono = "neutral",
  children,
  punto = true,
  className = "",
}: {
  tono?: Tono;
  children: ReactNode;
  punto?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ring-1 ${TONO[tono]} ${className}`}
    >
      {punto && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />}
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
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return <div className={`glass rounded-3xl ${padding} ${className}`}>{children}</div>;
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

export function Metrica({
  etiqueta,
  valor,
  sufijo = "",
  tono = "neutral",
  icono,
}: {
  etiqueta: string;
  valor: string | number;
  sufijo?: string;
  tono?: Tono;
  icono?: ReactNode;
}) {
  return (
    <div className="flex min-w-[7rem] flex-col gap-0.5 rounded-2xl fill-softer px-3 py-2 ring-1 ring-[color:var(--hairline)]">
      <span className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {icono}
        {etiqueta}
      </span>
      <span className={`text-lg font-black tabular-nums ${tono === "neutral" ? "text-ink" : ""}`}>
        {valor}
        {sufijo && <span className="ml-0.5 text-xs font-bold text-ink-soft">{sufijo}</span>}
      </span>
    </div>
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
          ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/40"
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
      {copiado ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
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
      className="inline-flex items-center gap-1 text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 transition-colors hover:text-cyan-200"
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
        destructivo ? "text-rose-300 hover:bg-rose-500/15" : "text-ink hover:fill-soft"
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
