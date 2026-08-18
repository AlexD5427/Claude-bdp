/**
 * Calendario del módulo.
 *
 * ── Por qué no basta `<input type="date">` ──────────────────────────────────
 * El campo nativo funciona, pero cada navegador lo pinta a su manera, en el móvil
 * abre una rueda que no se parece a nada del sistema, y no puede decir lo que aquí
 * hace falta decir: «este día es sábado», «faltan 12 días», «el año del libro
 * cambia si eliges diciembre». El área registra fechas de ingreso y plazos de
 * prórroga todo el día; el control que más usa merece ser bueno.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * Un campo con eco legible («martes, 18 de agosto de 2026») que abre una rejilla
 * mensual en un panel flotante:
 *
 *   · semana que empieza en lunes, como el calendario boliviano;
 *   · hoy marcado, fines de semana atenuados, día elegido con el acento;
 *   · navegación por mes y por año, y salto directo a un mes desde la lista;
 *   · atajos («hoy», «mañana», «en una semana», «en 15 días», «en 30 días»),
 *     filtrados por los límites del campo;
 *   · teclado completo: flechas mueven un día, Re/Av Pág un mes, Inicio/Fin la
 *     semana, Enter elige, Escape cierra y devuelve el foco;
 *   · límites `min`/`max` que deshabilitan de verdad los días fuera de rango;
 *   · se puede escribir la fecha a mano en formato `dd/mm/aaaa` o `aaaa-mm-dd`.
 *
 * ── Sobre el movimiento ─────────────────────────────────────────────────────
 * Solo `opacity` y `transform`: nada que provoque recálculo de diseño. Al cambiar
 * de mes, la rejilla se desliza en la dirección del cambio. Con
 * `prefers-reduced-motion` (o el interruptor de la aplicación) no se mueve nada.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";

/* ------------------------------------------------------------------ */
/* Fechas: todo en ISO local, sin zonas horarias                       */
/* ------------------------------------------------------------------ */

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** `YYYY-MM-DD` de una fecha, en hora local (nunca `toISOString`, que aplica UTC). */
export function aIso(fecha: Date): string {
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${m}-${d}`;
}

/** `YYYY-MM-DD` → `Date` a mediodía local: inmune a saltos de horario de verano. */
export function deIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function hoyIso(): string {
  return aIso(new Date());
}

function sumarDias(iso: string, dias: number): string {
  const base = deIso(iso) ?? new Date();
  base.setDate(base.getDate() + dias);
  return aIso(base);
}

/** Texto largo y legible. Se usa como eco del campo y en los resúmenes. */
export function fechaLegible(iso: string): string {
  const fecha = deIso(iso);
  if (!fecha) return "";
  return `${DIAS[(fecha.getDay() + 6) % 7]}, ${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

/** Días naturales entre hoy y la fecha (negativo si ya pasó). */
export function diasDesdeHoy(iso: string): number | null {
  const fecha = deIso(iso);
  if (!fecha) return null;
  const hoy = deIso(hoyIso())!;
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

/**
 * Lo que la persona escribe a mano: `18/08/2026`, `18-8-2026`, `2026-08-18`.
 *
 * El año se exige **completo, de cuatro cifras**, y no por purismo: al escribir
 * carácter a carácter, `18/08/20` sería un año válido (2020) y el campo daría por
 * buena una fecha a medio teclear. Con cuatro cifras, el valor solo cambia cuando
 * la fecha está entera.
 */
function interpretar(texto: string): string {
  const limpio = texto.trim();
  if (!limpio) return "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(limpio);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(limpio);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return "";
}

/** Matriz de seis semanas del mes: siempre 42 celdas, para que no salte de alto. */
function rejilla(anio: number, mes: number): string[] {
  const primero = new Date(anio, mes, 1, 12);
  const desplazamiento = (primero.getDay() + 6) % 7; // lunes = 0
  const inicio = new Date(anio, mes, 1 - desplazamiento, 12);
  const celdas: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    celdas.push(aIso(d));
  }
  return celdas;
}

/* ------------------------------------------------------------------ */
/* Campo                                                               */
/* ------------------------------------------------------------------ */

export interface AtajoFecha {
  etiqueta: string;
  dias: number;
}

const ATAJOS_PASADO: AtajoFecha[] = [
  { etiqueta: "Hoy", dias: 0 },
  { etiqueta: "Ayer", dias: -1 },
  { etiqueta: "Hace una semana", dias: -7 },
  { etiqueta: "Hace 15 días", dias: -15 },
  { etiqueta: "Hace un mes", dias: -30 },
];

const ATAJOS_FUTURO: AtajoFecha[] = [
  { etiqueta: "Hoy", dias: 0 },
  { etiqueta: "Mañana", dias: 1 },
  { etiqueta: "En una semana", dias: 7 },
  { etiqueta: "En 15 días", dias: 15 },
  { etiqueta: "En 30 días", dias: 30 },
];

export function CampoFecha({
  valor,
  onChange,
  min,
  max,
  placeholder = "dd/mm/aaaa",
  /** Hacia dónde apuntan los atajos: una fecha de ingreso mira al pasado; un plazo, al futuro. */
  sentido = "pasado",
  id,
  etiquetaAccesible,
  invalido,
  autoFocus,
}: {
  valor: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  sentido?: "pasado" | "futuro";
  id?: string;
  etiquetaAccesible?: string;
  invalido?: boolean;
  autoFocus?: boolean;
}) {
  const generado = useId();
  const idCampo = id ?? `fecha-${generado}`;
  const reducido = useMovimientoReducido();

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(() => (valor ? formatoCorto(valor) : ""));
  const disparador = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLInputElement | null>(null);

  /**
   * El texto sigue al valor SOLO cuando el valor cambia desde fuera: un atajo, un
   * borrador restaurado, otro control. Si se sincronizara siempre, escribir a mano
   * sería imposible: en cuanto el texto se interpreta, el efecto lo reescribiría en
   * formato canónico y machacaría lo que la persona está teclando.
   */
  const emitido = useRef(valor);
  useEffect(() => {
    if (valor === emitido.current) return;
    emitido.current = valor;
    setTexto(valor ? formatoCorto(valor) : "");
  }, [valor]);

  const emitir = (iso: string) => {
    emitido.current = iso;
    onChange(iso);
  };

  const legible = valor ? fechaLegible(valor) : "";
  const fueraDeRango = Boolean(valor) && ((min && valor < min) || (max && valor > max));

  return (
    <div className="relative" ref={disparador}>
      <div
        className={`doc-campo-fecha flex items-center gap-1.5 rounded-[var(--doc-radius-sm,10px)] px-2.5 py-2 transition-shadow ${
          abierto ? "doc-campo-fecha--abierto" : ""
        }`}
        style={{
          background: "var(--doc-surface)",
          boxShadow: `inset 0 0 0 1px ${invalido || fueraDeRango ? "var(--doc-danger)" : abierto ? "var(--doc-focus)" : "var(--doc-border)"}`,
        }}
      >
        <CalendarDays className="h-4 w-4 shrink-0" style={{ color: abierto ? "var(--doc-focus)" : "var(--doc-text-faint)" }} aria-hidden />
        <input
          ref={entrada}
          id={idCampo}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label={etiquetaAccesible ?? "Fecha"}
          aria-invalid={invalido || fueraDeRango ? true : undefined}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          value={texto}
          placeholder={placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            const iso = interpretar(e.target.value);
            if (iso) emitir(iso);
            else if (!e.target.value.trim()) emitir("");
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              e.preventDefault();
              setAbierto(true);
            }
            if (e.key === "Escape" && abierto) {
              e.preventDefault();
              setAbierto(false);
            }
          }}
          className="w-full min-w-0 bg-transparent text-sm text-[color:var(--doc-text)] outline-none placeholder:text-[color:var(--doc-text-faint)]"
        />
        {valor && (
          <button
            type="button"
            aria-label="Quitar la fecha"
            onClick={() => {
              emitir("");
              setTexto("");
              entrada.current?.focus();
            }}
            className="doc-tap shrink-0 rounded-md p-0.5 text-[color:var(--doc-text-faint)] transition-colors hover:text-[color:var(--doc-text)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {legible && !abierto && (
        <p className="mt-1 truncate text-[11px] capitalize text-[color:var(--doc-text-muted)]">{legible}</p>
      )}
      {fueraDeRango && (
        <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--doc-danger-fg)" }} role="alert">
          {min && valor < min ? `No puede ser antes del ${formatoCorto(min)}.` : `No puede ser después del ${formatoCorto(max!)}.`}
        </p>
      )}

      <AnimatePresence>
        {abierto && (
          <PanelCalendario
            ancla={disparador}
            valor={valor}
            min={min}
            max={max}
            sentido={sentido}
            reducido={reducido}
            onElegir={(iso) => {
              emitir(iso);
              setTexto(formatoCorto(iso));
              setAbierto(false);
              entrada.current?.focus();
            }}
            onCerrar={() => {
              setAbierto(false);
              entrada.current?.focus();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function formatoCorto(iso: string): string {
  const f = deIso(iso);
  if (!f) return iso;
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()}`;
}

/* ------------------------------------------------------------------ */
/* Panel flotante                                                      */
/* ------------------------------------------------------------------ */

function PanelCalendario({
  ancla,
  valor,
  min,
  max,
  sentido,
  reducido,
  onElegir,
  onCerrar,
}: {
  ancla: React.RefObject<HTMLDivElement | null>;
  valor: string;
  min?: string;
  max?: string;
  sentido: "pasado" | "futuro";
  reducido: boolean;
  onElegir: (iso: string) => void;
  onCerrar: () => void;
}) {
  const hoy = hoyIso();
  const inicial = deIso(valor) ?? deIso(hoy)!;
  const [anio, setAnio] = useState(inicial.getFullYear());
  const [mes, setMes] = useState(inicial.getMonth());
  const [direccion, setDireccion] = useState(0);
  const [foco, setFoco] = useState(valor || hoy);
  const [eligiendoMes, setEligiendoMes] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const [posicion, setPosicion] = useState<{ top: number; left: number; ancho: number } | null>(null);

  /* Posición: se calcula contra la ventana porque el panel vive en un portal (si
     viviera dentro del campo, cualquier contenedor con `overflow` lo recortaría). */
  useLayoutEffect(() => {
    const calcular = () => {
      const caja = ancla.current?.getBoundingClientRect();
      if (!caja) return;
      const ancho = Math.max(300, Math.min(340, window.innerWidth - 24));
      const alto = 400;
      const cabeAbajo = caja.bottom + alto + 12 < window.innerHeight;
      const top = cabeAbajo ? caja.bottom + 8 : Math.max(8, caja.top - alto - 8);
      const left = Math.min(Math.max(8, caja.left), window.innerWidth - ancho - 8);
      setPosicion({ top, left, ancho });
    };
    calcular();
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
    };
  }, [ancla]);

  /* Cierre por clic fuera y por Escape, y navegación con teclado. */
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  const elegirRef = useRef(onElegir);
  elegirRef.current = onElegir;
  const focoRef = useRef(foco);
  focoRef.current = foco;

  const habilitado = useCallback(
    (iso: string) => !((min && iso < min) || (max && iso > max)),
    [min, max],
  );

  useEffect(() => {
    const alPulsarFuera = (e: MouseEvent) => {
      const destino = e.target as Node;
      if (panel.current?.contains(destino)) return;
      if (ancla.current?.contains(destino)) return;
      cerrarRef.current();
    };
    const alPulsarTecla = (e: KeyboardEvent) => {
      const mover = (dias: number) => {
        e.preventDefault();
        const siguiente = sumarDias(focoRef.current, dias);
        setFoco(siguiente);
        const f = deIso(siguiente)!;
        setDireccion(dias > 0 ? 1 : -1);
        setAnio(f.getFullYear());
        setMes(f.getMonth());
      };
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cerrarRef.current();
      } else if (e.key === "ArrowLeft") mover(-1);
      else if (e.key === "ArrowRight") mover(1);
      else if (e.key === "ArrowUp") mover(-7);
      else if (e.key === "ArrowDown") mover(7);
      else if (e.key === "PageUp") mover(-28);
      else if (e.key === "PageDown") mover(28);
      else if (e.key === "Enter" && habilitado(focoRef.current)) {
        e.preventDefault();
        elegirRef.current(focoRef.current);
      }
    };
    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alPulsarTecla);
    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alPulsarTecla);
    };
  }, [ancla, habilitado]);

  const celdas = useMemo(() => rejilla(anio, mes), [anio, mes]);
  const atajos = (sentido === "futuro" ? ATAJOS_FUTURO : ATAJOS_PASADO).filter((a) => habilitado(sumarDias(hoy, a.dias)));

  const irAlMes = (delta: number) => {
    const f = new Date(anio, mes + delta, 1, 12);
    setDireccion(delta);
    setAnio(f.getFullYear());
    setMes(f.getMonth());
  };

  if (!posicion) return null;

  return createPortal(
    <motion.div
      ref={panel}
      role="dialog"
      aria-label="Elegir fecha"
      className="doc-console doc-calendario glass-heavy fixed z-[130] rounded-[var(--doc-radius,16px)] p-3"
      style={{ top: posicion.top, left: posicion.left, width: posicion.ancho }}
      initial={reducido ? false : { opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducido ? undefined : { opacity: 0, y: -4, scale: 0.99, transition: { duration: DURACION.rapida, ease: CURVA.salidaQuint } }}
      transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
    >
      {/* Cabecera: mes/año con navegación */}
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => irAlMes(-1)}
          aria-label="Mes anterior"
          className="doc-tap grid h-8 w-8 place-items-center rounded-lg text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface-raised)] hover:text-[color:var(--doc-text)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setEligiendoMes((v) => !v)}
          aria-expanded={eligiendoMes}
          className="doc-tap flex-1 rounded-lg px-2 py-1 text-sm font-semibold capitalize text-[color:var(--doc-text)] transition-colors hover:bg-[color:var(--doc-surface-raised)]"
        >
          {MESES[mes]} {anio}
        </button>
        <button
          type="button"
          onClick={() => irAlMes(1)}
          aria-label="Mes siguiente"
          className="doc-tap grid h-8 w-8 place-items-center rounded-lg text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface-raised)] hover:text-[color:var(--doc-text)]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {eligiendoMes ? (
          <motion.div
            key="meses"
            initial={reducido ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducido ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: reducido ? 0 : DURACION.normal, ease: CURVA.salidaQuint }}
          >
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setAnio(anio - 1)}
                aria-label="Año anterior"
                className="doc-tap rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--doc-text-muted)] hover:bg-[color:var(--doc-surface-raised)]"
              >
                ‹ {anio - 1}
              </button>
              <span className="text-sm font-bold text-[color:var(--doc-text)]">{anio}</span>
              <button
                type="button"
                onClick={() => setAnio(anio + 1)}
                aria-label="Año siguiente"
                className="doc-tap rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--doc-text-muted)] hover:bg-[color:var(--doc-surface-raised)]"
              >
                {anio + 1} ›
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {MESES.map((nombre, i) => {
                const activo = i === mes;
                return (
                  <button
                    key={nombre}
                    type="button"
                    onClick={() => {
                      setMes(i);
                      setEligiendoMes(false);
                    }}
                    className="doc-tap rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors"
                    style={
                      activo
                        ? { background: "var(--doc-info-bg)", color: "var(--doc-info-fg)" }
                        : { color: "var(--doc-text-muted)" }
                    }
                  >
                    {nombre.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div key={`${anio}-${mes}`} className="mt-2">
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {DIAS.map((d) => (
                <span key={d} className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--doc-text-faint)]">
                  {d.slice(0, 2)}
                </span>
              ))}
            </div>
            <motion.div
              key={`rejilla-${anio}-${mes}`}
              className="grid grid-cols-7 gap-0.5"
              initial={reducido ? false : { opacity: 0, x: direccion >= 0 ? 12 : -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
            >
              {celdas.map((iso) => {
                const f = deIso(iso)!;
                const delMes = f.getMonth() === mes;
                const esHoy = iso === hoy;
                const elegido = iso === valor;
                const enFoco = iso === foco;
                const finDeSemana = f.getDay() === 0 || f.getDay() === 6;
                const permitido = habilitado(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={!permitido}
                    aria-current={esHoy ? "date" : undefined}
                    aria-pressed={elegido}
                    aria-label={fechaLegible(iso)}
                    onMouseEnter={() => setFoco(iso)}
                    onClick={() => onElegir(iso)}
                    className="doc-tap doc-dia relative grid h-9 place-items-center rounded-lg text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    style={{
                      color: elegido
                        ? "#04121f"
                        : !delMes
                          ? "var(--doc-text-faint)"
                          : finDeSemana
                            ? "var(--doc-text-muted)"
                            : "var(--doc-text)",
                      background: elegido
                        ? "var(--doc-info)"
                        : enFoco && permitido
                          ? "var(--doc-surface-raised)"
                          : "transparent",
                      fontWeight: elegido || esHoy ? 700 : 500,
                      boxShadow: esHoy && !elegido ? "inset 0 0 0 1px var(--doc-info)" : undefined,
                    }}
                  >
                    {f.getDate()}
                  </button>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Atajos */}
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[color:var(--doc-border)] pt-2">
        {atajos.map((a) => (
          <button
            key={a.etiqueta}
            type="button"
            onClick={() => onElegir(sumarDias(hoy, a.dias))}
            className="doc-tap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{ background: "var(--doc-surface-raised)", color: "var(--doc-text-muted)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
          >
            {a.etiqueta}
          </button>
        ))}
      </div>
    </motion.div>,
    document.body,
  );
}
