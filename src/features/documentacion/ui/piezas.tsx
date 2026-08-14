/**
 * Piezas reutilizables de la consola de Documentación.
 *
 * ── Por qué existen ─────────────────────────────────────────────────────────
 * Trece secciones tienen que pintar lo mismo: un chip de estado, una tabla que en
 * el móvil se convierte en tarjetas, una paginación, un estado vacío, un panel
 * lateral. Sin estas piezas cada sección lo resolvería a su manera y el módulo
 * tendría trece variantes del mismo control, que es exactamente lo que la
 * refactorización viene a eliminar.
 *
 * Todo se apoya en el sistema de diseño que ya existe (`design-system/`): esto no
 * es un sistema nuevo, es el vocabulario del módulo expresado con el suyo.
 *
 * ── Accesibilidad, de entrada ───────────────────────────────────────────────
 * El estado nunca se comunica solo con color: cada chip lleva etiqueta. Las tablas
 * llevan `scope`, los botones tienen nombre accesible, el panel lateral atrapa el
 * foco y se cierra con Escape, y todas las animaciones se apagan con
 * `prefers-reduced-motion`.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Loader2, Search, X } from "lucide-react";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import type { Intent } from "../../../design-system/tokens";
import type { Intencion } from "../domain/vocabulario";

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
 * Se consulta el ajuste del sistema. Cuando está activo, las animaciones no se
 * «suavizan»: se quitan. Media animación sigue moviendo la pantalla de alguien
 * que ha pedido que no se mueva.
 */
export function usarMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducido(consulta.matches);
    const escuchar = (evento: MediaQueryListEvent) => setReducido(evento.matches);
    consulta.addEventListener("change", escuchar);
    return () => consulta.removeEventListener("change", escuchar);
  }, []);
  return reducido;
}

/**
 * Valor que se actualiza con retardo.
 *
 * Es lo que hace que escribir en el buscador no lance una petición por letra. El
 * temporizador se limpia en el retorno del efecto: sin eso, cada pulsación deja un
 * temporizador vivo y al desmontar el componente siguen disparándose.
 */
export function usarDebounce<T>(valor: T, ms = 350): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

/* ------------------------------------------------------------------ */
/* Superficies                                                         */
/* ------------------------------------------------------------------ */

export function Panel({
  titulo,
  descripcion,
  acciones,
  children,
  className = "",
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-3xl p-4 sm:p-5 ${className}`}>
      {(titulo || acciones) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h3 className="text-sm font-semibold text-ink">{titulo}</h3>}
            {descripcion && <p className="mt-0.5 text-xs text-ink-soft">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Tarjeta de indicador. El número grande, la etiqueta legible, sin adornos. */
export function Tarjeta({
  etiqueta,
  valor,
  detalle,
  intencion = "neutral",
  onClick,
  activa,
}: {
  etiqueta: string;
  valor: number | string;
  detalle?: string;
  intencion?: Intencion;
  onClick?: () => void;
  activa?: boolean;
}) {
  const tonos: Record<Intencion, string> = {
    neutral: "text-ink",
    info: "text-cyan-300",
    exito: "text-emerald-300",
    aviso: "text-amber-300",
    peligro: "text-rose-300",
    acento: "text-indigo-300",
  };
  const contenido = (
    <>
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{etiqueta}</span>
      <span className={`mt-1 block text-2xl font-semibold tabular-nums ${tonos[intencion]}`}>{valor}</span>
      {detalle && <span className="mt-0.5 block text-[11px] text-ink-soft">{detalle}</span>}
    </>
  );

  if (!onClick) {
    return <div className="glass rounded-2xl p-3 sm:p-4">{contenido}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={`glass rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 sm:p-4 ${
        activa ? "ring-2 ring-cyan-400/60" : ""
      }`}
    >
      {contenido}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

export function ChipEstado({
  estado,
  etiqueta,
  intencion,
  titulo,
}: {
  estado: string;
  etiqueta?: string;
  intencion: Intencion;
  titulo?: string;
}) {
  return (
    <StatusPill intent={aIntent(intencion)} title={titulo ?? estado}>
      {etiqueta ?? estado}
    </StatusPill>
  );
}

/** Barra de avance con su número al lado: el color solo acompaña. */
export function BarraAvance({ valor, etiqueta }: { valor: number; etiqueta?: string }) {
  const acotado = Math.max(0, Math.min(100, Math.round(valor)));
  const tono = acotado >= 100 ? "bg-emerald-400" : acotado >= 60 ? "bg-cyan-400" : acotado > 0 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-full min-w-[64px] overflow-hidden rounded-full bg-[color:var(--fill-2)]"
        role="progressbar"
        aria-valuenow={acotado}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta ?? "Avance"}
      >
        <div className={`h-full rounded-full ${tono} transition-[width] duration-500`} style={{ width: `${acotado}%` }} />
      </div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft">{acotado}%</span>
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-soft" role="status" aria-live="polite">
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
        <div key={i} className="h-10 animate-pulse rounded-xl bg-[color:var(--fill-2)]" />
      ))}
    </div>
  );
}

export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      {detalle && <p className="max-w-md text-xs text-ink-soft">{detalle}</p>}
      {accion}
    </div>
  );
}

/**
 * Aviso con intención.
 *
 * Los errores del backend llegan con una pista de qué hacer; el aviso la muestra
 * como parte del mensaje. Un error sin salida obliga a abrir un ticket para
 * enterarse de algo que el sistema ya sabe.
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
  const estilos: Record<Intencion, string> = {
    neutral: "border-[color:var(--hairline)] bg-[color:var(--fill-2)] text-ink-soft",
    info: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
    exito: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    aviso: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    peligro: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    acento: "border-indigo-400/30 bg-indigo-500/10 text-indigo-100",
  };
  const Icono = intencion === "peligro" || intencion === "aviso" ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 text-xs ${estilos[intencion]}`} role="status">
      <Icono className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="mt-0.5 leading-relaxed">{children}</div>}
        {accion && <div className="mt-2 flex flex-wrap gap-2">{accion}</div>}
      </div>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="rounded-lg p-1 hover:bg-white/10">
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
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400";
  const variantes = {
    primario: "bg-cyan-500/90 text-slate-950 hover:bg-cyan-400",
    suave: "fill-softer text-ink ring-1 ring-[color:var(--hairline)] hover:bg-[color:var(--fill-2)]",
    peligro: "bg-rose-500/85 text-white hover:bg-rose-500",
    fantasma: "text-ink-soft hover:text-ink",
  };
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled || cargando}
      title={titulo}
      className={`${base} ${variantes[variante]} ${ancho ? "w-full" : ""} ${className}`}
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
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-rose-300">*</span>}
      </span>
      {children}
      {/* El mensaje va asociado al campo y con `aria-live`: quien usa lector de
          pantalla se entera del error sin tener que recorrer el formulario. */}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-rose-300" aria-live="polite">
          {error}
        </span>
      ) : (
        ayuda && <span className="mt-1 block text-[11px] text-ink-faint">{ayuda}</span>
      )}
    </label>
  );
}

const CLASE_ENTRADA =
  "w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--fill-1)] px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/25";

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
      className="inline-flex items-center gap-2 text-xs text-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
    >
      <span
        className={`relative h-4 w-8 rounded-full transition-colors ${activo ? "bg-cyan-500/80" : "bg-[color:var(--fill-2)]"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] ${activo ? "left-4" : "left-0.5"}`}
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      <label className="sr-only" htmlFor={id}>
        {etiqueta}
      </label>
      <input
        id={id}
        type="search"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${CLASE_ENTRADA} pl-9`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla adaptable                                                     */
/* ------------------------------------------------------------------ */

export interface ColumnaTabla<T> {
  clave: string;
  encabezado: string;
  render: (fila: T) => ReactNode;
  /** Se oculta en pantallas estrechas. */
  secundaria?: boolean;
  /** Alineación numérica a la derecha. */
  numerica?: boolean;
}

/**
 * Tabla que en el móvil se convierte en tarjetas.
 *
 * No es una tabla con scroll horizontal: es la misma información en dos
 * disposiciones. Una tabla de once columnas en un teléfono se lee arrastrando, y
 * arrastrando no se compara nada.
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
}: {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  onFila?: (fila: T) => void;
  vacio?: ReactNode;
  cargando?: boolean;
  densidad?: "comoda" | "compacta";
  titulo?: string;
}) {
  if (cargando) return <Esqueleto filas={5} />;
  if (!filas.length) return <>{vacio ?? <Vacio titulo="Sin resultados" detalle="Prueba con otros filtros." />}</>;

  const alto = densidad === "compacta" ? "py-1.5" : "py-2.5";

  return (
    <>
      {/* Escritorio y tablet */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          {titulo && <caption className="sr-only">{titulo}</caption>}
          <thead>
            <tr className="border-b border-[color:var(--hairline)] text-left">
              {columnas.map((columna) => (
                <th
                  key={columna.clave}
                  scope="col"
                  className={`px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint ${
                    columna.numerica ? "text-right" : ""
                  } ${columna.secundaria ? "hidden lg:table-cell" : ""}`}
                >
                  {columna.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr
                key={claveFila(fila)}
                onClick={onFila ? () => onFila(fila) : undefined}
                className={`border-b border-[color:var(--hairline)]/60 transition-colors ${
                  onFila ? "cursor-pointer hover:bg-[color:var(--fill-1)]" : ""
                }`}
              >
                {columnas.map((columna) => (
                  <td
                    key={columna.clave}
                    className={`px-2 ${alto} align-middle text-ink ${columna.numerica ? "text-right tabular-nums" : ""} ${
                      columna.secundaria ? "hidden lg:table-cell" : ""
                    }`}
                  >
                    {columna.render(fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: la misma información en tarjetas */}
      <ul className="space-y-2 md:hidden">
        {filas.map((fila) => (
          <li key={claveFila(fila)}>
            <button
              type="button"
              onClick={onFila ? () => onFila(fila) : undefined}
              className="w-full rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--fill-1)] p-3 text-left"
            >
              <dl className="space-y-1">
                {columnas.map((columna) => (
                  <div key={columna.clave} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">{columna.encabezado}</dt>
                    <dd className="min-w-0 flex-1 text-right text-xs text-ink">{columna.render(fila)}</dd>
                  </div>
                ))}
              </dl>
            </button>
          </li>
        ))}
      </ul>
    </>
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
    <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Paginación">
      <p className="text-xs text-ink-soft">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-1">
        <Boton variante="suave" onClick={() => onPagina(Math.max(1, pagina - 1))} disabled={pagina <= 1} titulo="Página anterior">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Anterior</span>
        </Boton>
        <span className="px-2 text-xs tabular-nums text-ink-soft">
          {pagina} / {paginas}
        </span>
        <Boton
          variante="suave"
          onClick={() => onPagina(Math.min(paginas, pagina + 1))}
          disabled={pagina >= paginas}
          titulo="Página siguiente"
        >
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
 * Se cierra con Escape, atrapa el foco mientras está abierto y devuelve el foco al
 * elemento que lo abrió. Sin eso, quien navega con teclado sigue tabulando por
 * detrás del panel y no entiende dónde está.
 */
export function Lateral({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
  pie,
  ancho = "max-w-3xl",
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: string;
}) {
  const reducido = usarMovimientoReducido();
  const contenedor = useRef<HTMLDivElement | null>(null);
  const anterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    anterior.current = document.activeElement as HTMLElement | null;
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", cerrarConEscape);
    const t = setTimeout(() => {
      contenedor.current?.querySelector<HTMLElement>("[data-foco-inicial], button, [href], input, select, textarea")?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", cerrarConEscape);
      clearTimeout(t);
      anterior.current?.focus?.();
    };
  }, [abierto, onCerrar]);

  return (
    <AnimatePresence>
      {abierto && (
        <>
          <motion.div
            className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm"
            initial={reducido ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducido ? undefined : { opacity: 0 }}
            onClick={onCerrar}
            aria-hidden
          />
          <motion.div
            ref={contenedor}
            role="dialog"
            aria-modal="true"
            aria-label={typeof titulo === "string" ? titulo : "Detalle"}
            className={`fixed right-0 top-0 z-[95] flex h-full w-full ${ancho} flex-col glass-heavy border-l border-[color:var(--hairline)]`}
            initial={reducido ? undefined : { x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reducido ? undefined : { x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-[color:var(--hairline)] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-ink">{titulo}</h2>
                {subtitulo && <p className="mt-0.5 truncate text-xs text-ink-soft">{subtitulo}</p>}
              </div>
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar"
                className="rounded-xl p-2 text-ink-soft transition-colors hover:bg-[color:var(--fill-2)] hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
            {pie && <footer className="border-t border-[color:var(--hairline)] px-4 py-3 sm:px-5">{pie}</footer>}
          </motion.div>
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
 * confirmación que solo dice «¿seguro?» no informa de nada.
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
  const reducido = usarMovimientoReducido();
  useEffect(() => {
    if (!abierta) return;
    const cerrar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCancelar();
    };
    document.addEventListener("keydown", cerrar);
    return () => document.removeEventListener("keydown", cerrar);
  }, [abierta, onCancelar]);

  return (
    <AnimatePresence>
      {abierta && (
        <motion.div
          className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={reducido ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducido ? undefined : { opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="glass-heavy w-full max-w-md rounded-3xl p-5"
            initial={reducido ? undefined : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reducido ? undefined : { scale: 0.96, opacity: 0 }}
          >
            <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
            {detalle && <div className="mt-2 text-xs leading-relaxed text-ink-soft">{detalle}</div>}
            {impacto && <div className="mt-3 rounded-2xl bg-[color:var(--fill-1)] p-3 text-xs text-ink-soft">{impacto}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <Boton variante="suave" onClick={onCancelar}>
                Cancelar
              </Boton>
              <Boton variante={peligrosa ? "peligro" : "primario"} onClick={onConfirmar} cargando={trabajando} data-foco-inicial>
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
      setTimeout(() => quitar(id), intencion === "peligro" ? 8000 : 4500);
      return id;
    },
    [quitar],
  );

  return useMemo(() => ({ notitas, avisar, quitar }), [notitas, avisar, quitar]);
}

export function Notitas({ notitas, onQuitar }: { notitas: Notita[]; onQuitar: (id: number) => void }) {
  const reducido = usarMovimientoReducido();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[140] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence>
        {notitas.map((notita) => (
          <motion.div
            key={notita.id}
            className="pointer-events-auto"
            initial={reducido ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducido ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
          >
            <Aviso intencion={notita.intencion} onCerrar={() => onQuitar(notita.id)}>
              <span className="font-medium">{notita.texto}</span>
              {notita.pista && <span className="mt-1 block text-[11px] opacity-80">{notita.pista}</span>}
            </Aviso>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
