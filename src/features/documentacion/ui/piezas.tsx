/**
 * Piezas de la consola de Documentación.
 *
 * ── Por qué existen ─────────────────────────────────────────────────────────
 * Trece secciones tienen que pintar lo mismo: un chip de estado, una tabla que en
 * el móvil se convierte en tarjetas, una paginación, un estado vacío, un panel
 * lateral. Sin estas piezas cada sección lo resolvería a su manera y el módulo
 * tendría trece variantes del mismo control.
 *
 * ── Qué cambió en el rediseño ───────────────────────────────────────────────
 * Los colores ya no se escriben aquí. Cada pieza pide un token del módulo
 * (`--doc-*`, definidos en `documentacion.css`), y es el token el que sabe qué
 * valor usar en tema oscuro, en tema claro, en alto contraste y en papel. Antes,
 * una tabla impresa perdía el significado de sus estados porque el ámbar al 15 %
 * sobre blanco es blanco.
 *
 * Además: la tabla fija su encabezado al hacer scroll, admite tres densidades y
 * ofrece una acción explícita por fila —el clic en la fila sirve para el ratón,
 * pero el teclado necesita un botón—; el panel lateral atrapa el foco de verdad
 * (ciclando con Tab) y no se cierra por accidente mientras se guarda.
 *
 * ── Accesibilidad, de entrada ───────────────────────────────────────────────
 * Ningún estado se comunica solo con color: cada chip lleva etiqueta, icono y
 * `title`. Las tablas llevan `caption` y `scope`, los botones tienen nombre
 * accesible, los errores se anuncian con `role="alert"` y las animaciones se
 * apagan enteras con `prefers-reduced-motion` o con el interruptor de la
 * aplicación.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CircleDot,
  Clock,
  Info,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { Intent } from "../../../design-system/tokens";
import type { Intencion } from "../domain/vocabulario";
import { bloquearScroll } from "../../../lib/scrollLock";
import { CURVA, DURACION, resorte, useMovimientoReducido } from "./DocMotion";
import { nombreDeVista } from "./DocViewTransitions";
import "./documentacion.css";
import "./documentacion-motion.css";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Traduce la intención del dominio al vocabulario del sistema de diseño. */
export function aIntent(intencion: Intencion): Intent {
  switch (intencion) {
    case "exito":
      return "success";
    case "aviso":
      return "warning";
    case "peligro":
      return "danger";
    case "info":
      return "info";
    case "acento":
      return "accent";
    default:
      return "neutral";
  }
}

/**
 * ¿La persona pidió menos movimiento?
 *
 * Se mantiene el nombre anterior por compatibilidad; la implementación vive en
 * `DocMotion` y ahora mira dos fuentes: la preferencia del sistema y el
 * interruptor «Reducir movimiento» de la aplicación.
 */
export const usarMovimientoReducido = useMovimientoReducido;

/**
 * Valor que se actualiza con retardo.
 *
 * Es lo que hace que escribir en el buscador no lance una petición por letra.
 */
export function usarDebounce<T>(valor: T, ms = 350): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

/**
 * Colores de cada intención, en tokens del módulo.
 *
 * Un único sitio donde se decide qué es «aviso». Cambiar el durazno del área es
 * cambiar una línea de CSS, no buscar `amber-500/15` por siete archivos.
 */
export const TONO: Record<Intencion, { fondo: string; texto: string; borde: string; punto: string }> = {
  neutral: {
    fondo: "var(--doc-surface-raised)",
    texto: "var(--doc-text-muted)",
    borde: "var(--doc-border)",
    punto: "var(--doc-text-faint)",
  },
  info: { fondo: "var(--doc-info-bg)", texto: "var(--doc-info-fg)", borde: "var(--doc-info)", punto: "var(--doc-info)" },
  exito: { fondo: "var(--doc-success-bg)", texto: "var(--doc-success-fg)", borde: "var(--doc-success)", punto: "var(--doc-success)" },
  aviso: { fondo: "var(--doc-warning-bg)", texto: "var(--doc-warning-fg)", borde: "var(--doc-warning)", punto: "var(--doc-warning)" },
  peligro: { fondo: "var(--doc-danger-bg)", texto: "var(--doc-danger-fg)", borde: "var(--doc-danger)", punto: "var(--doc-danger)" },
  acento: { fondo: "var(--doc-accent-bg)", texto: "var(--doc-accent-fg)", borde: "var(--doc-accent)", punto: "var(--doc-accent)" },
};

/** Icono por intención: el segundo canal, además del color y la etiqueta. */
function IconoIntencion({ intencion }: { intencion: Intencion }) {
  const clase = "h-3 w-3 shrink-0";
  switch (intencion) {
    case "exito":
      return <Check className={clase} aria-hidden />;
    case "aviso":
      return <Clock className={clase} aria-hidden />;
    case "peligro":
      return <AlertTriangle className={clase} aria-hidden />;
    case "info":
      return <CircleDot className={clase} aria-hidden />;
    case "acento":
      return <ChevronsRight className={clase} aria-hidden />;
    default:
      return <Ban className={clase} aria-hidden />;
  }
}

/**
 * ¿Estamos en una pantalla estrecha?
 *
 * Se usa para decidir estructura, no tamaño: los filtros avanzados son un panel
 * en escritorio y un cajón en el móvil, y eso no se puede resolver solo con CSS
 * porque son dos composiciones distintas. El umbral coincide con `md` de
 * Tailwind, el mismo punto donde la tabla se convierte en tarjetas.
 */
export function usarPantallaEstrecha(consulta = "(max-width: 767px)"): boolean {
  const [estrecha, setEstrecha] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(consulta);
    const actualizar = () => setEstrecha(mq.matches);
    actualizar();
    mq.addEventListener?.("change", actualizar);
    return () => mq.removeEventListener?.("change", actualizar);
  }, [consulta]);

  return estrecha;
}

/* ------------------------------------------------------------------ */
/* Superficies                                                         */
/* ------------------------------------------------------------------ */

/**
 * Panel de sección.
 *
 * El título se asocia a la región con `aria-labelledby`: quien navega por
 * regiones con lector de pantalla oye «Completitud por agencia, región» en lugar
 * de «región».
 */
export function Panel({
  titulo,
  descripcion,
  acciones,
  pie,
  children,
  className = "",
  denso,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  pie?: ReactNode;
  children: ReactNode;
  className?: string;
  denso?: boolean;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={titulo ? id : undefined}
      className={`doc-raised doc-print-keep ${denso ? "p-3" : "p-3.5 sm:p-4"} ${className}`}
    >
      {(titulo || acciones) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && (
              <h3 id={id} className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">
                {titulo}
              </h3>
            )}
            {descripcion && <p className="doc-prose mt-0.5 text-xs text-[color:var(--doc-text-muted)]">{descripcion}</p>}
          </div>
          {acciones && <div className="doc-no-print flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
      {pie && <footer className="mt-3 border-t border-[color:var(--doc-border)] pt-3">{pie}</footer>}
    </section>
  );
}

/**
 * Tarjeta de indicador.
 *
 * ── Qué se corrigió ─────────────────────────────────────────────────────────
 * Antes eran dieciséis números grandes idénticos: «prórrogas vencidas» y
 * «expedientes activos» pesaban lo mismo en la pantalla, y una de las dos es una
 * urgencia. Ahora la severidad se ve en el borde y en el icono, el número lleva
 * su unidad y su periodo, y la tarjeta dice a dónde lleva.
 *
 * El valor NO se anima como un contador que gira: un dígito en movimiento no se
 * puede leer. Cuando cambia tras un refetch se enciende un fondo un instante
 * (`doc-destello`), que informa sin estorbar.
 */
export function Tarjeta({
  etiqueta,
  valor,
  detalle,
  intencion = "neutral",
  onClick,
  activa,
  periodo,
  accion,
  pista,
}: {
  etiqueta: string;
  valor: number | string;
  detalle?: string;
  intencion?: Intencion;
  onClick?: () => void;
  activa?: boolean;
  /** «hoy», «este mes»: sin periodo, una cifra no se puede interpretar. */
  periodo?: string;
  /** Texto de la acción que ofrece la tarjeta: «Ver expedientes». */
  accion?: string;
  /** Explicación larga, para el `title`. */
  pista?: string;
}) {
  const tono = TONO[intencion];
  const critica = intencion === "peligro";
  const relevante = critica || intencion === "aviso";
  const destello = useDestello(valor);

  const contenido = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="doc-eyebrow doc-prose">{etiqueta}</span>
        {relevante && (
          <span className="shrink-0" style={{ color: tono.punto }} aria-hidden>
            <IconoIntencion intencion={intencion} />
          </span>
        )}
      </span>
      <span
        className={`doc-metric mt-1.5 block text-2xl font-semibold leading-none ${destello ? "doc-destello" : ""}`}
        style={{ color: relevante ? tono.texto : "var(--doc-text)" }}
      >
        {valor}
      </span>
      {(detalle || periodo) && (
        <span className="doc-prose mt-1 block text-[11px] text-[color:var(--doc-text-muted)]">
          {detalle}
          {detalle && periodo ? " · " : ""}
          {periodo}
        </span>
      )}
      {accion && onClick && (
        <span className="mt-2 flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--doc-info-fg)" }}>
          {accion}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </span>
      )}
    </>
  );

  const estilo: CSSProperties = {
    borderLeftWidth: relevante ? 3 : 1,
    borderLeftColor: relevante ? tono.borde : "var(--doc-border)",
  };

  if (!onClick) {
    return (
      <div className="doc-surface p-3.5" style={estilo} title={pista}>
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      title={pista}
      className={`doc-surface doc-tap p-3.5 text-left transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-[color:var(--doc-surface-raised)] ${
        activa ? "ring-2" : ""
      }`}
      style={{ ...estilo, ...(activa ? { boxShadow: `0 0 0 2px ${tono.borde}` } : null) }}
    >
      {contenido}
    </button>
  );
}

/**
 * Enciende un destello cuando el valor cambia.
 *
 * En el primer render no destella: si lo hiciera, al abrir el panel parpadearían
 * las dieciséis tarjetas a la vez.
 */
function useDestello(valor: unknown): boolean {
  const anterior = useRef(valor);
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    if (anterior.current === valor) return;
    anterior.current = valor;
    setActivo(true);
    const t = setTimeout(() => setActivo(false), 900);
    return () => clearTimeout(t);
  }, [valor]);

  return activo;
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

/**
 * Chip de estado.
 *
 * Cuatro canales para el mismo dato: fondo, texto, icono y etiqueta. El `title`
 * añade la explicación cuando la hay. En papel el fondo desaparece pero la
 * etiqueta y el icono siguen ahí.
 */
export function ChipEstado({
  estado,
  etiqueta,
  intencion,
  titulo,
  compacto,
  prorroga,
}: {
  estado: string;
  etiqueta?: string;
  intencion: Intencion;
  titulo?: string;
  compacto?: boolean;
  /**
   * Estado de prórroga.
   *
   * La semántica del área distingue el durazno de la observación del ámbar de la
   * prórroga: son dos cosas distintas —«hay algo mal» y «hay más plazo»— y con el
   * mismo color se confunden. La intención del dominio no cambia (sigue siendo
   * `aviso`, que es lo que el backend dice); lo que cambia es el tono con el que
   * se pinta.
   */
  prorroga?: boolean;
}) {
  const tono = prorroga
    ? {
        fondo: "var(--doc-extension-bg)",
        texto: "var(--doc-extension-fg)",
        borde: "var(--doc-extension)",
        punto: "var(--doc-extension)",
      }
    : TONO[intencion];
  const texto = etiqueta ?? estado;
  return (
    <span
      title={titulo ?? texto}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold ${
        compacto ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"
      }`}
      style={{ background: tono.fondo, color: tono.texto, boxShadow: `inset 0 0 0 1px ${tono.borde}` }}
    >
      <IconoIntencion intencion={intencion} />
      <span className="truncate">{texto}</span>
    </span>
  );
}

/**
 * Barra de avance con su número al lado.
 *
 * El color solo acompaña: el porcentaje se lee en cifras, y `aria-valuetext` dice
 * lo mismo para un lector de pantalla.
 */
export function BarraAvance({ valor, etiqueta }: { valor: number; etiqueta?: string }) {
  const acotado = Math.max(0, Math.min(100, Math.round(valor)));
  const color =
    acotado >= 100
      ? "var(--doc-success)"
      : acotado >= 60
        ? "var(--doc-info)"
        : acotado > 0
          ? "var(--doc-warning)"
          : "var(--doc-danger)";
  return (
    <div className="flex items-center gap-2">
      <div
        className="doc-medidor min-w-[64px]"
        role="progressbar"
        aria-valuenow={acotado}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${acotado} por ciento`}
        aria-label={etiqueta ?? "Avance"}
      >
        <span style={{ width: `${acotado}%`, background: color }} />
      </div>
      <span className="doc-metric shrink-0 text-xs font-semibold text-[color:var(--doc-text-muted)]">{acotado}%</span>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-[color:var(--doc-text-muted)]" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {texto}
    </div>
  );
}

/** Bloque de carga con la forma del contenido que va a aparecer. */
export function Esqueleto({ filas = 4 }: { filas?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="doc-skeleton h-10" />
      ))}
    </div>
  );
}

export function Vacio({ titulo, detalle, accion }: { titulo: string; detalle?: string; accion?: ReactNode }) {
  return (
    <div
      role="status"
      className="doc-surface doc-muted flex flex-col items-center gap-2 border-dashed px-4 py-8 text-center"
    >
      <p className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">{titulo}</p>
      {detalle && <p className="doc-prose max-w-md text-xs text-[color:var(--doc-text-muted)]">{detalle}</p>}
      {accion}
    </div>
  );
}

/**
 * Aviso con intención.
 *
 * Los errores del backend llegan con una pista de qué hacer; el aviso la muestra
 * como parte del mensaje. Lo importante del cambio: un aviso de peligro se
 * anuncia con `role="alert"` —interrumpe, porque algo se rompió— y el resto con
 * `role="status"`, que espera su turno.
 */
export function Aviso({
  intencion = "info",
  titulo,
  children,
  accion,
  onCerrar,
}: {
  intencion?: Intencion;
  titulo?: string;
  children?: ReactNode;
  accion?: ReactNode;
  onCerrar?: () => void;
}) {
  const tono = TONO[intencion];
  const Icono = intencion === "peligro" || intencion === "aviso" ? AlertTriangle : Info;
  return (
    <div
      className="flex items-start gap-3 rounded-[var(--doc-radius-sm)] border px-3 py-2.5 text-xs"
      style={{ background: tono.fondo, color: tono.texto, borderColor: tono.borde }}
      role={intencion === "peligro" ? "alert" : "status"}
    >
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="doc-prose mt-0.5 leading-relaxed">{children}</div>}
        {accion && <div className="mt-2 flex flex-wrap gap-2">{accion}</div>}
      </div>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="doc-tap rounded-lg p-1 transition-colors hover:bg-[color:var(--doc-surface-raised)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controles                                                           */
/* ------------------------------------------------------------------ */

export function Boton({
  children,
  onClick,
  variante = "suave",
  tipo = "button",
  disabled,
  cargando,
  titulo,
  className = "",
  ancho,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "primario" | "suave" | "peligro" | "fantasma";
  tipo?: "button" | "submit";
  disabled?: boolean;
  cargando?: boolean;
  titulo?: string;
  className?: string;
  ancho?: boolean;
}) {
  const base =
    "doc-tap doc-no-print inline-flex items-center justify-center gap-1.5 rounded-[var(--doc-radius-sm)] px-3 py-2 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50";

  const estilos: Record<string, CSSProperties> = {
    primario: { background: "var(--doc-info)", color: "#04121f" },
    suave: { background: "var(--doc-surface-raised)", color: "var(--doc-text)", boxShadow: "inset 0 0 0 1px var(--doc-border)" },
    peligro: { background: "var(--doc-danger)", color: "#1b0710" },
    fantasma: { color: "var(--doc-text-muted)" },
  };

  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled || cargando}
      title={titulo}
      aria-busy={cargando || undefined}
      className={`${base} ${variante === "fantasma" ? "hover:text-[color:var(--doc-text)]" : "hover:brightness-110"} ${
        ancho ? "w-full" : ""
      } ${className}`}
      style={estilos[variante]}
    >
      {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Campo({
  etiqueta,
  children,
  ayuda,
  error,
  requerido,
}: {
  etiqueta: string;
  children: ReactNode;
  ayuda?: string;
  error?: string;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[color:var(--doc-text-muted)]">
        {etiqueta}
        {requerido && (
          <>
            <span aria-hidden className="ml-0.5" style={{ color: "var(--doc-danger)" }}>
              *
            </span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        )}
      </span>
      {children}
      {/* El mensaje va con `aria-live`: quien usa lector de pantalla se entera del
          error sin tener que recorrer el formulario otra vez. */}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium" style={{ color: "var(--doc-danger-fg)" }} aria-live="polite">
          {error}
        </span>
      ) : (
        ayuda && <span className="doc-prose mt-1 block text-[11px] text-[color:var(--doc-text-faint)]">{ayuda}</span>
      )}
    </label>
  );
}

const CLASE_ENTRADA =
  "w-full rounded-[var(--doc-radius-sm)] border border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-3 py-2 text-sm text-[color:var(--doc-text)] outline-none transition-colors placeholder:text-[color:var(--doc-text-faint)] focus:border-[color:var(--doc-focus)]";

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CLASE_ENTRADA} ${props.className ?? ""}`} />;
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CLASE_ENTRADA} min-h-[80px] resize-y ${props.className ?? ""}`} />;
}

export function Selector({
  valor,
  onChange,
  opciones,
  placeholder,
  id,
  disabled,
}: {
  valor: string;
  onChange: (valor: string) => void;
  opciones: { valor: string; etiqueta: string; deshabilitado?: boolean }[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={valor}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${CLASE_ENTRADA} appearance-none pr-8`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opciones.map((opcion) => (
        <option key={opcion.valor} value={opcion.valor} disabled={opcion.deshabilitado}>
          {opcion.etiqueta}
        </option>
      ))}
    </select>
  );
}

export function Interruptor({
  activo,
  onChange,
  etiqueta,
}: {
  activo: boolean;
  onChange: (valor: boolean) => void;
  etiqueta: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onChange(!activo)}
      className="doc-tap inline-flex items-center gap-2 text-xs text-[color:var(--doc-text-muted)]"
    >
      <span
        className="relative h-4 w-8 rounded-full transition-colors duration-150"
        style={{ background: activo ? "var(--doc-info)" : "var(--doc-surface-sunken)" }}
        aria-hidden
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] duration-150"
          style={{ left: activo ? "1rem" : "0.125rem" }}
        />
      </span>
      {etiqueta}
    </button>
  );
}

export function Buscador({
  valor,
  onChange,
  placeholder = "Buscar…",
  etiqueta = "Buscar",
}: {
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  etiqueta?: string;
}) {
  const id = useId();
  return (
    <div className="relative min-w-[180px] flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--doc-text-faint)]"
        aria-hidden
      />
      <label className="sr-only" htmlFor={id}>
        {etiqueta}
      </label>
      <input id={id} type="search" value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${CLASE_ENTRADA} pl-9`} />
    </div>
  );
}

/**
 * Chip de filtro aplicado.
 *
 * Los filtros estaban escondidos detrás de un panel plegable con un contador:
 * «Filtros (3)» no dice cuáles. Cada filtro activo se muestra como un chip con
 * su valor y su aspa, y quitarlo es un clic.
 */
export function ChipFiltro({
  etiqueta,
  valor,
  onQuitar,
}: {
  etiqueta: string;
  valor: string;
  onQuitar: () => void;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-[11px]"
      style={{ background: "var(--doc-surface-raised)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
    >
      <span className="text-[color:var(--doc-text-faint)]">{etiqueta}:</span>
      <span className="truncate font-semibold text-[color:var(--doc-text)]">{valor}</span>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar el filtro ${etiqueta}: ${valor}`}
        className="doc-tap rounded-full p-1 text-[color:var(--doc-text-faint)] transition-colors hover:text-[color:var(--doc-danger-fg)]"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Conmutador segmentado accesible (densidad, vista, modo).
 *
 * Es un `radiogroup` de verdad: se recorre con las flechas y anuncia la opción
 * marcada. La píldora activa se desliza con Framer Motion y se queda quieta
 * cuando se pide menos movimiento.
 */
export function Segmento<T extends string>({
  valor,
  opciones,
  onChange,
  etiqueta,
}: {
  valor: T;
  opciones: { valor: T; etiqueta: string; icono?: ReactNode; titulo?: string }[];
  onChange: (valor: T) => void;
  etiqueta: string;
}) {
  const grupo = useId();
  const reducido = useMovimientoReducido();
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="doc-no-print inline-flex items-center gap-0.5 rounded-full p-0.5"
      style={{ background: "var(--doc-surface)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
    >
      {opciones.map((opcion) => {
        const activa = opcion.valor === valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            role="radio"
            aria-checked={activa}
            title={opcion.titulo ?? opcion.etiqueta}
            onClick={() => onChange(opcion.valor)}
            className="relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150"
            style={{ color: activa ? "var(--doc-info-fg)" : "var(--doc-text-muted)" }}
          >
            {activa && (
              <motion.span
                layoutId={reducido ? undefined : `doc-seg-${grupo}`}
                className="absolute inset-0 -z-10 rounded-full"
                style={{ background: "var(--doc-info-bg)", boxShadow: "inset 0 0 0 1px var(--doc-info)" }}
                transition={resorte(reducido)}
              />
            )}
            {opcion.icono}
            {opcion.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Texto que puede no caber.
 *
 * Se recorta con puntos suspensivos y conserva el texto completo en el `title`;
 * al pasar el puntero (o al recibir el foco) se desplaza. Nunca se pierde el
 * nombre completo, que en una lista de personas es el dato que identifica.
 */
export function TextoCompleto({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <span className={`doc-marquee block ${className}`} title={texto} tabIndex={0}>
      <span>{texto}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla adaptable                                                     */
/* ------------------------------------------------------------------ */

export type Densidad = "compacta" | "comoda" | "amplia";

export interface ColumnaTabla<T> {
  clave: string;
  encabezado: string;
  render: (fila: T) => ReactNode;
  /** Se oculta en pantallas estrechas. */
  secundaria?: boolean;
  /** Alineación numérica a la derecha. */
  numerica?: boolean;
  /** No se muestra en la tarjeta de móvil (controles de selección, por ejemplo). */
  soloTabla?: boolean;
}

/**
 * Tabla que en el móvil se convierte en tarjetas.
 *
 * No es una tabla con scroll horizontal: es la misma información en dos
 * disposiciones. Una tabla de once columnas en un teléfono se lee arrastrando, y
 * arrastrando no se compara nada.
 *
 * ── Tres cosas que el rediseño arregla ──────────────────────────────────────
 * 1. **Encabezado pegajoso.** Al bajar por doscientas filas, la columna
 *    «Pendientes» seguía ahí pero su título ya no.
 * 2. **Teclado.** El clic en la fila es del ratón. Ahora hay una acción explícita
 *    por fila —«Abrir»— también en escritorio, alcanzable con Tab.
 * 3. **Sin salto de layout.** Mientras carga se pinta un esqueleto con el mismo
 *    número de columnas, así la tabla no cambia de ancho al llegar los datos.
 */
export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  onFila,
  vacio,
  cargando,
  densidad = "comoda",
  titulo,
  etiquetaAbrir = () => "Abrir",
  nombreVista,
  estadoFila,
}: {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  onFila?: (fila: T) => void;
  vacio?: ReactNode;
  cargando?: boolean;
  densidad?: Densidad;
  titulo?: string;
  /** Nombre accesible del botón de fila: «Abrir el expediente de Ana Quiroga». */
  etiquetaAbrir?: (fila: T) => string;
  /** Nombre de transición de vista, para la continuidad fila → detalle. */
  nombreVista?: (fila: T) => string | undefined;
  /** Marca visual de la fila: pendiente de sincronización, por ejemplo. */
  estadoFila?: (fila: T) => { sincronizacion?: "pendiente" } | undefined;
}) {
  if (cargando) {
    return (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Cargando datos…</span>
        <EsqueletoDeTabla columnas={columnas.length} />
      </div>
    );
  }
  if (!filas.length) return <>{vacio ?? <Vacio titulo="Sin resultados" detalle="Prueba con otros filtros." />}</>;

  const visiblesEnTarjeta = columnas.filter((c) => !c.soloTabla);

  return (
    <>
      {/* Escritorio y tablet */}
      <div className="doc-table-wrap hidden max-h-[70vh] overflow-y-auto md:block">
        <table className="doc-table" data-densidad={densidad}>
          {titulo && <caption className="sr-only">{titulo}</caption>}
          <thead>
            <tr>
              {columnas.map((columna) => (
                <th
                  key={columna.clave}
                  scope="col"
                  className={`${columna.numerica ? "text-right" : ""} ${columna.secundaria ? "hidden lg:table-cell" : ""}`}
                >
                  {columna.encabezado}
                </th>
              ))}
              {onFila && (
                <th scope="col" className="w-16 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const estado = estadoFila?.(fila);
              return (
                <tr
                  key={claveFila(fila)}
                  onClick={onFila ? () => onFila(fila) : undefined}
                  data-interactiva={onFila ? "si" : undefined}
                  data-sincronizacion={estado?.sincronizacion}
                  style={nombreDeVista(nombreVista?.(fila))}
                >
                  {columnas.map((columna) => (
                    <td
                      key={columna.clave}
                      className={`${columna.numerica ? "doc-num" : ""} ${columna.secundaria ? "hidden lg:table-cell" : ""}`}
                    >
                      {columna.render(fila)}
                    </td>
                  ))}
                  {onFila && (
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFila(fila);
                        }}
                        aria-label={etiquetaAbrir(fila)}
                        title={etiquetaAbrir(fila)}
                        className="doc-tap rounded-[var(--doc-radius-sm)] p-1.5 text-[color:var(--doc-text-faint)] transition-colors hover:bg-[color:var(--doc-surface-raised)] hover:text-[color:var(--doc-text)]"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Móvil: la misma información en tarjetas estructuradas */}
      <ul className="doc-list-long space-y-2 md:hidden">
        {filas.map((fila) => {
          const estado = estadoFila?.(fila);
          return (
            <li key={claveFila(fila)}>
              {/*
                La tarjeta entera responde al toque, igual que la fila de la tabla,
                pero el contenedor no puede ser un `button`: las celdas traen sus
                propios controles y un botón dentro de otro botón no es HTML válido
                ni se puede alcanzar con el teclado. Para el teclado está el botón
                «Abrir» del final.
              */}
              <div
                onClick={onFila ? () => onFila(fila) : undefined}
                className={`doc-surface p-3 text-left ${onFila ? "cursor-pointer" : ""}`}
                style={estado?.sincronizacion === "pendiente" ? { borderLeftWidth: 3, borderLeftColor: "var(--doc-offline)" } : undefined}
              >
                <dl className="space-y-1.5">
                  {visiblesEnTarjeta.map((columna) => (
                    <div key={columna.clave} className="flex items-baseline justify-between gap-3">
                      <dt className="doc-eyebrow shrink-0">{columna.encabezado}</dt>
                      <dd className="min-w-0 flex-1 text-right text-xs text-[color:var(--doc-text)]">{columna.render(fila)}</dd>
                    </div>
                  ))}
                </dl>
                {onFila && (
                  <div className="mt-2.5 flex justify-end">
                    <Boton variante="suave" onClick={() => onFila(fila)} titulo={etiquetaAbrir(fila)}>
                      Abrir
                    </Boton>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Esqueleto interno de la tabla: mismas columnas, sin datos. */
function EsqueletoDeTabla({ columnas, filas = 6 }: { columnas: number; filas?: number }) {
  return (
    <div aria-hidden>
      <div className="hidden gap-3 border-b border-[color:var(--doc-border)] pb-2 md:flex">
        {Array.from({ length: columnas }).map((_, i) => (
          <div key={i} className="doc-skeleton h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-0 md:block">
        {Array.from({ length: filas }).map((_, f) => (
          <div key={f} className="flex items-center gap-3 border-b border-[color:var(--doc-border)] py-3">
            {Array.from({ length: columnas }).map((_, c) => (
              <div key={c} className="doc-skeleton h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Paginación con el contexto del total: «26–50 de 312». */
export function Paginacion({
  pagina,
  paginas,
  total,
  porPagina,
  onPagina,
}: {
  pagina: number;
  paginas: number;
  total: number;
  porPagina: number;
  onPagina: (pagina: number) => void;
}) {
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  return (
    <nav className="doc-no-print mt-3 flex items-center justify-between gap-2" aria-label="Paginación">
      <p className="doc-metric text-xs text-[color:var(--doc-text-muted)]" aria-live="polite">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-1">
        <Boton variante="suave" onClick={() => onPagina(Math.max(1, pagina - 1))} disabled={pagina <= 1} titulo="Página anterior">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Anterior</span>
        </Boton>
        <span className="doc-metric px-2 text-xs text-[color:var(--doc-text-muted)]">
          {pagina} / {paginas}
        </span>
        <Boton variante="suave" onClick={() => onPagina(Math.min(paginas, pagina + 1))} disabled={pagina >= paginas} titulo="Página siguiente">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Siguiente</span>
        </Boton>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Capas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Panel lateral.
 *
 * ── Qué hace bien ──────────────────────────────────────────────────────────
 * Se cierra con Escape, **atrapa el foco de verdad** —Tab cicla dentro del panel,
 * no se escapa al contenido de detrás— y devuelve el foco al elemento que lo
 * abrió. Cuando hay una escritura en curso (`bloqueado`) no se cierra ni con
 * Escape ni con un clic fuera: cerrar a media escritura deja a la persona sin
 * saber si se guardó.
 *
 * Cuando hay cambios sin guardar (`confirmarCierre`), el clic fuera y el Escape
 * piden confirmación en lugar de perder el trabajo.
 */
export function Lateral({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
  pie,
  ancho = "max-w-3xl",
  bloqueado,
  confirmarCierre,
  encabezadoExtra,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: string;
  /** Hay una escritura en curso: no se puede cerrar. */
  bloqueado?: boolean;
  /** Texto de confirmación si hay cambios sin guardar. */
  confirmarCierre?: string;
  encabezadoExtra?: ReactNode;
}) {
  const reducido = useMovimientoReducido();
  const contenedor = useRef<HTMLDivElement | null>(null);
  const anterior = useRef<HTMLElement | null>(null);
  const [pidiendoCierre, setPidiendoCierre] = useState(false);

  /**
   * ── El fallo que este `ref` corrige ────────────────────────────────────────
   * El efecto de teclado dependía de `intentarCerrar`, que a su vez depende de
   * `onCerrar` —una función nueva en cada renderizado del componente padre—. Es
   * decir: el efecto se desmontaba y se volvía a montar EN CADA RENDERIZADO. Y su
   * limpieza devuelve el foco al elemento que estaba enfocado antes de abrir el
   * panel.
   *
   * Consecuencia medida en un navegador real: al escribir una observación, la
   * primera tecla provoca un renderizado, la limpieza saca el foco del área de
   * texto y el temporizador de 50 ms lo deja en el primer botón del panel. Entra
   * UNA letra y el teclado parece muerto. Era el «se congela» que reportaba el
   * área en la pantalla más usada del módulo.
   *
   * Los manejadores viven ahora en referencias y el efecto solo depende de
   * `abierto`: se monta al abrir y se desmonta al cerrar, ni una vez más.
   */
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;
  const confirmarRef = useRef(confirmarCierre);
  confirmarRef.current = confirmarCierre;

  const intentarCerrar = useCallback(() => {
    if (bloqueadoRef.current) return;
    // Si hay cambios sin guardar se pregunta con la confirmación del módulo, no
    // con `window.confirm`: el diálogo nativo bloquea el hilo y Chrome permite
    // silenciarlo («no volver a mostrar»), con lo que el panel dejaba de cerrarse.
    if (confirmarRef.current) {
      setPidiendoCierre(true);
      return;
    }
    cerrarRef.current();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    anterior.current = document.activeElement as HTMLElement | null;

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        intentarCerrar();
        return;
      }
      // Trampa de foco: con Tab en el último elemento se vuelve al primero, y con
      // Shift+Tab en el primero se va al último. Sin esto, el foco sigue por
      // detrás del panel y nadie sabe dónde está.
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
    // El fondo no debe scrollear detrás del panel. El candado lleva recuento, así
    // que apilar el panel sobre otra superposición no deja la página trancada.
    const liberarScroll = bloquearScroll();
    const t = setTimeout(() => {
      contenedor.current?.querySelector<HTMLElement>("[data-foco-inicial], button, [href], input, select, textarea")?.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", alPulsar);
      clearTimeout(t);
      liberarScroll();
      anterior.current?.focus?.();
    };
  }, [abierto, intentarCerrar]);

  return (
    <AnimatePresence>
      {abierto && (
        <>
          <motion.div
            className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm"
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
            aria-label={typeof titulo === "string" ? titulo : "Detalle"}
            className={`doc-console fixed right-0 top-0 z-[95] flex h-full w-full ${ancho} flex-col glass-heavy border-l border-[color:var(--doc-border)]`}
            initial={reducido ? undefined : { x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reducido ? undefined : { x: 24, opacity: 0, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
            transition={resorte(reducido)}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--doc-border)] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">{titulo}</h2>
                {subtitulo && <p className="doc-prose mt-0.5 text-xs text-[color:var(--doc-text-muted)]">{subtitulo}</p>}
                {encabezadoExtra}
              </div>
              <button
                type="button"
                onClick={intentarCerrar}
                aria-label="Cerrar"
                disabled={bloqueado}
                className="doc-tap rounded-xl p-2 text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface-raised)] hover:text-[color:var(--doc-text)] disabled:opacity-40"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
            {pie && (
              <footer className="border-t border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-4 py-3 sm:px-5">{pie}</footer>
            )}
          </motion.div>

          <Confirmacion
            abierta={pidiendoCierre}
            titulo="Hay cambios sin guardar"
            detalle={confirmarCierre}
            textoConfirmar="Cerrar y descartar"
            peligrosa
            onConfirmar={() => {
              setPidiendoCierre(false);
              cerrarRef.current();
            }}
            onCancelar={() => setPidiendoCierre(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Confirmación.
 *
 * Se usa para lo que no se puede deshacer con un clic: archivar, cancelar una
 * solicitud, lanzar una operación masiva. Muestra el impacto ANTES, porque una
 * confirmación que solo dice «¿seguro?» no informa de nada. Las destructivas se
 * anuncian como `alertdialog`.
 */
export function Confirmacion({
  abierta,
  titulo,
  detalle,
  impacto,
  textoConfirmar = "Confirmar",
  peligrosa,
  onConfirmar,
  onCancelar,
  trabajando,
}: {
  abierta: boolean;
  titulo: string;
  detalle?: ReactNode;
  impacto?: ReactNode;
  textoConfirmar?: string;
  peligrosa?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  trabajando?: boolean;
}) {
  const reducido = useMovimientoReducido();
  // Mismo motivo que en `Lateral`: `onCancelar` y `trabajando` cambian con cada
  // renderizado del padre y no tienen por qué remontar el escuchador de teclado.
  const cancelarRef = useRef(onCancelar);
  cancelarRef.current = onCancelar;
  const trabajandoRef = useRef(trabajando);
  trabajandoRef.current = trabajando;
  useEffect(() => {
    if (!abierta) return;
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !trabajandoRef.current) cancelarRef.current();
    };
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [abierta]);

  return (
    <AnimatePresence>
      {abierta && (
        <motion.div
          className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={reducido ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducido ? undefined : { opacity: 0 }}
          transition={{ duration: reducido ? 0 : DURACION.rapida }}
        >
          <motion.div
            role={peligrosa ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-label={titulo}
            className="doc-console glass-heavy max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-5"
            initial={reducido ? undefined : { scale: 0.97, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reducido ? undefined : { scale: 0.98, opacity: 0, transition: { duration: DURACION.rapida } }}
            transition={resorte(reducido)}
          >
            <h2 className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">{titulo}</h2>
            {detalle && <div className="doc-prose mt-2 text-xs leading-relaxed text-[color:var(--doc-text-muted)]">{detalle}</div>}
            {impacto && <div className="doc-sunken mt-3 p-3 text-xs text-[color:var(--doc-text-muted)]">{impacto}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <Boton variante="suave" onClick={onCancelar} disabled={trabajando}>
                Cancelar
              </Boton>
              <Boton variante={peligrosa ? "peligro" : "primario"} onClick={onConfirmar} cargando={trabajando}>
                {textoConfirmar}
              </Boton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Avisos flotantes                                                   */
/* ------------------------------------------------------------------ */

export interface Notita {
  id: number;
  intencion: Intencion;
  texto: string;
  pista?: string;
}

/**
 * Avisos efímeros.
 *
 * Se implementa con un `useState` local en el componente raíz y se pasa hacia
 * abajo: una cola global sería más cómoda y también un sitio donde los mensajes
 * de una pantalla aparecen sobre otra.
 */
export function useNotitas() {
  const [notitas, setNotitas] = useState<Notita[]>([]);
  const contador = useRef(0);

  const quitar = useCallback((id: number) => {
    setNotitas((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const avisar = useCallback(
    (intencion: Intencion, texto: string, pista?: string) => {
      contador.current += 1;
      const id = contador.current;
      setNotitas((prev) => [...prev, { id, intencion, texto, pista }]);
      // Un error se lee más despacio que una confirmación, y a veces hay que
      // copiar el código: se queda el doble de tiempo.
      setTimeout(() => quitar(id), intencion === "peligro" ? 8000 : 4500);
      return id;
    },
    [quitar],
  );

  return useMemo(() => ({ notitas, avisar, quitar }), [notitas, avisar, quitar]);
}

export function Notitas({ notitas, onQuitar }: { notitas: Notita[]; onQuitar: (id: number) => void }) {
  const reducido = useMovimientoReducido();
  return (
    <div
      role="region"
      aria-label="Avisos del módulo"
      aria-live="polite"
      className="doc-console doc-no-print pointer-events-none fixed bottom-4 right-4 z-[140] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <AnimatePresence>
        {notitas.map((notita) => (
          <motion.div
            key={notita.id}
            className="pointer-events-auto"
            initial={reducido ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducido ? undefined : { opacity: 0, y: 8, scale: 0.98, transition: { duration: DURACION.rapida } }}
            transition={{ duration: reducido ? 0 : DURACION.normal, ease: CURVA.salidaExpo }}
          >
            <Aviso intencion={notita.intencion} onCerrar={() => onQuitar(notita.id)}>
              <span className="font-medium">{notita.texto}</span>
              {notita.pista && <span className="doc-prose mt-1 block text-[11px] opacity-80">{notita.pista}</span>}
            </Aviso>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
