/**
 * Campo con sugerencias en vivo de un catálogo auxiliar.
 *
 * ── De dónde salen las opciones ─────────────────────────────────────────────
 * De la hoja `Auxiliar` del libro, una columna por catálogo: `agencia_bdp`,
 * `gerencia_bdp` y `cargo_bdp`. El backend localiza la columna POR SU CABECERA
 * —normalizada, sin acentos ni distinguir mayúsculas— y devuelve la columna
 * entera. El frontend no tiene una lista propia: si el área añade una agencia en
 * la hoja, aparece aquí sin tocar código.
 *
 * ── Por qué «Cargo» usa la misma pieza ──────────────────────────────────────
 * Porque el problema era el mismo. «Cargo» era un campo de texto libre sin
 * fuente de datos: cada persona lo escribía a su manera («Oficial de Negocios»,
 * «OFICIAL NEGOCIOS», «Of. de negocios») y después los reportes por cargo no
 * agrupaban nada. Con `cargo_bdp` en la hoja, el campo tiene catálogo y se
 * comporta exactamente igual que Agencia y Gerencia: búsqueda en vivo, teclado,
 * ratón y alta de un valor nuevo sin salir del formulario.
 *
 * ── Por qué se puede añadir desde aquí ──────────────────────────────────────
 * Porque el caso real existe: se abre un expediente de una agencia nueva un lunes
 * a las ocho y quien registra no tiene el libro abierto ni permisos para editarlo
 * a mano. El valor se envía a `documentacion.auxiliares.agregar`, que lo escribe
 * al final de la columna —**nunca quita nada**— y lo devuelve normalizado. Si la
 * escritura falla, el valor se usa igual en este expediente y se avisa: es mejor
 * un expediente con la agencia correcta y un catálogo por completar que un
 * expediente sin agencia.
 *
 * ── Accesibilidad y listas largas ───────────────────────────────────────────
 * Es un `combobox` con `listbox`: `aria-activedescendant` señala la opción
 * resaltada, las flechas mueven, Enter elige, Escape cierra y devuelve el foco.
 * La lista se recorta a una ventana desplazable y se dice el recuento («12 de
 * 187 coincidencias»), porque una columna del banco puede tener trescientos
 * valores y un panel con trescientos botones cuesta pintar.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { docApi, type ColumnaAuxiliar } from "../api/acciones";
import { refrescarCatalogo } from "../state/consola";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";

/**
 * Envoltorio de portal.
 *
 * `AnimatePresence` descarta un hijo que sea directamente el resultado de
 * `createPortal`, así que el panel no llegaba a montarse. Envolverlo en un
 * componente le da un hijo normal que sí reconoce, y el portal se crea dentro.
 */
function EnPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/** Normaliza para comparar: sin acentos, sin espacios de más, en mayúsculas. */
function llave(texto: string): string {
  return texto
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Etiqueta legible de cada columna, para los mensajes. */
const NOMBRE_COLUMNA: Record<ColumnaAuxiliar, string> = {
  agencia_bdp: "agencias",
  gerencia_bdp: "gerencias",
  cargo_bdp: "cargos",
};

/**
 * Cuántas opciones se pintan a la vez.
 *
 * Es ventaneo simple, no virtualización con alturas medidas: la lista está
 * ordenada y quien busca escribe dos letras y filtra. Pintar treinta botones y
 * decir «hay 187» resuelve el caso real sin una librería.
 */
const VENTANA = 40;

export function SelectorAuxiliar({
  valor,
  onChange,
  opciones,
  columna,
  placeholder,
  permitirAlta = true,
  onAviso,
  id,
}: {
  valor: string;
  onChange: (valor: string) => void;
  opciones: string[];
  /** Cabecera de la hoja `Auxiliar` a la que pertenece la lista. */
  columna: ColumnaAuxiliar;
  placeholder?: string;
  permitirAlta?: boolean;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  id?: string;
}) {
  const reducido = useMovimientoReducido();
  const idBase = useId();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);
  const [guardando, setGuardando] = useState(false);
  /** Valores añadidos en esta sesión, para que aparezcan aunque el catálogo no se haya refrescado. */
  const [extra, setExtra] = useState<string[]>([]);
  const ancla = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const buscador = useRef<HTMLInputElement | null>(null);
  const lista = useRef<HTMLUListElement | null>(null);
  const [caja, setCaja] = useState<{ top: number; left: number; ancho: number; arriba: boolean } | null>(null);

  const todas = useMemo(() => {
    const vistas = new Set<string>();
    const salida: string[] = [];
    for (const o of [...opciones, ...extra]) {
      const k = llave(o);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      salida.push(o);
    }
    return salida.sort((a, b) => a.localeCompare(b, "es"));
  }, [opciones, extra]);

  const filtradas = useMemo(() => {
    const k = llave(consulta);
    if (!k) return todas;
    return todas.filter((o) => llave(o).includes(k));
  }, [todas, consulta]);

  /** Solo se pinta la ventana; el recuento dice cuántas hay de verdad. */
  const visibles = filtradas.slice(0, VENTANA);
  const existeExacta = filtradas.some((o) => llave(o) === llave(consulta));
  const puedeAgregar = permitirAlta && consulta.trim().length >= 2 && !existeExacta;

  useEffect(() => {
    if (!abierto) return;
    const calcular = () => {
      const r = ancla.current?.getBoundingClientRect();
      if (!r) return;
      const alto = 320;
      const arriba = r.bottom + alto + 12 > window.innerHeight && r.top > alto;
      setCaja({ top: arriba ? r.top - alto - 6 : r.bottom + 6, left: r.left, ancho: Math.max(240, r.width), arriba });
    };
    calcular();
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || ancla.current?.contains(t)) return;
      setAbierto(false);
    };
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", calcular, true);
    document.addEventListener("mousedown", fuera);
    const t = setTimeout(() => buscador.current?.focus(), 40);
    return () => {
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", calcular, true);
      document.removeEventListener("mousedown", fuera);
      clearTimeout(t);
    };
  }, [abierto]);

  /* La opción resaltada tiene que estar a la vista: con doscientas agencias, la
     flecha abajo la movía fuera del panel y parecía que no pasaba nada. */
  useEffect(() => {
    if (!abierto || !lista.current) return;
    const activa = lista.current.querySelector<HTMLElement>('[data-activa="si"]');
    activa?.scrollIntoView({ block: "nearest" });
  }, [indice, abierto]);

  function elegir(opcion: string) {
    onChange(opcion);
    setAbierto(false);
    setConsulta("");
    ancla.current?.focus();
  }

  async function agregar(nuevo: string) {
    const limpio = nuevo.trim().replace(/\s+/g, " ").toUpperCase();
    if (!limpio) return;
    setGuardando(true);
    // Se aplica ya en el formulario: el expediente no debe esperar al libro.
    setExtra((prev) => [...prev, limpio]);
    onChange(limpio);
    setAbierto(false);
    setConsulta("");
    try {
      await docApi.agregarAuxiliar(columna, [limpio]);
      await refrescarCatalogo();
      onAviso?.("exito", `«${limpio}» se añadió al catálogo de ${NOMBRE_COLUMNA[columna]}.`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      onAviso?.(
        "aviso",
        `El valor se usará en este expediente, pero no se pudo añadir al catálogo: ${fallo.message ?? ""}`,
        fallo.pista ?? `Añádelo a mano en la hoja Auxiliar, columna ${columna}, cuando puedas.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  const idLista = `${idBase}-lista`;
  const idOpcionActiva = visibles[indice] ? `${idBase}-op-${indice}` : undefined;

  return (
    <>
      <button
        ref={ancla}
        id={id}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => {
          // Abrir con flecha abajo es lo que espera cualquiera que venga de un
          // `<select>`; sin esto había que pulsar Enter y luego bajar.
          if (e.key === "ArrowDown" && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        /* Un `combobox` NO toma su nombre accesible del contenido (a diferencia
           de un botón), así que hay que dárselo explícitamente: sin esto el
           control se anuncia como «cuadro combinado» sin más. */
        aria-label={placeholder ?? `Catálogo de ${NOMBRE_COLUMNA[columna]}`}
        className="doc-tap flex w-full items-center justify-between gap-2 rounded-[var(--doc-radius-sm,10px)] px-2.5 py-2 text-left text-sm transition-shadow"
        style={{
          background: "var(--doc-surface)",
          color: valor ? "var(--doc-text)" : "var(--doc-text-faint)",
          boxShadow: `inset 0 0 0 1px ${abierto ? "var(--doc-focus)" : "var(--doc-border)"}`,
        }}
      >
        <span className="min-w-0 truncate">{valor || placeholder || "Elige una opción"}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: "var(--doc-text-faint)", transform: abierto ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {abierto && caja && (
          <EnPortal>
            <motion.div
              ref={panel}
              className="doc-console glass-heavy fixed z-[130] overflow-hidden rounded-[var(--doc-radius,14px)]"
              style={{ top: caja.top, left: caja.left, width: caja.ancho }}
              initial={reducido ? false : { opacity: 0, y: caja.arriba ? 6 : -6, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducido ? undefined : { opacity: 0, y: caja.arriba ? 4 : -4, transition: { duration: DURACION.rapida } }}
              transition={reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo }}
            >
              <div className="flex items-center gap-2 border-b border-[color:var(--doc-border)] px-2.5 py-2">
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--doc-text-faint)" }} aria-hidden />
                <input
                  ref={buscador}
                  value={consulta}
                  role="combobox"
                  aria-expanded
                  aria-controls={idLista}
                  aria-autocomplete="list"
                  aria-activedescendant={idOpcionActiva}
                  aria-label={`Buscar en el catálogo de ${NOMBRE_COLUMNA[columna]}`}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setIndice(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setIndice((i) => Math.min(i + 1, Math.max(0, visibles.length - 1)));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setIndice((i) => Math.max(0, i - 1));
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      setIndice(0);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      setIndice(Math.max(0, visibles.length - 1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (visibles[indice]) elegir(visibles[indice]);
                      else if (puedeAgregar) void agregar(consulta);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setAbierto(false);
                      ancla.current?.focus();
                    }
                  }}
                  placeholder="Buscar o escribir uno nuevo…"
                  className="w-full bg-transparent text-sm text-[color:var(--doc-text)] outline-none placeholder:text-[color:var(--doc-text-faint)]"
                />
              </div>

              <ul
                ref={lista}
                id={idLista}
                role="listbox"
                aria-label={`Catálogo de ${NOMBRE_COLUMNA[columna]}`}
                className="max-h-60 overflow-y-auto overscroll-contain py-1"
              >
                {filtradas.length === 0 && !puedeAgregar && (
                  <li className="px-3 py-3 text-xs text-[color:var(--doc-text-faint)]">
                    {todas.length === 0
                      ? `El catálogo de ${NOMBRE_COLUMNA[columna]} llegó vacío. Escribe el valor y añádelo, o pégalo en la hoja Auxiliar (columna ${columna}).`
                      : "Ningún valor coincide."}
                  </li>
                )}
                {visibles.map((o, i) => {
                  const elegido = llave(o) === llave(valor);
                  const activa = i === indice;
                  return (
                    <li key={o} id={`${idBase}-op-${i}`} role="option" aria-selected={elegido} data-activa={activa ? "si" : undefined}>
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseEnter={() => setIndice(i)}
                        onClick={() => elegir(o)}
                        className="doc-tap flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                        style={{
                          background: activa ? "var(--doc-surface-raised)" : "transparent",
                          color: elegido ? "var(--doc-info-fg)" : "var(--doc-text)",
                          fontWeight: elegido ? 600 : 400,
                        }}
                      >
                        <span className="min-w-0 truncate">{o}</span>
                        {elegido && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Recuento honesto: cuántas se ven y cuántas hay. */}
              {todas.length > 0 && (
                <p
                  className="border-t border-[color:var(--doc-border)] px-3 py-1.5 text-[11px] text-[color:var(--doc-text-faint)]"
                  aria-live="polite"
                >
                  {consulta.trim()
                    ? `${filtradas.length} de ${todas.length} coincidencia${todas.length === 1 ? "" : "s"}`
                    : `${todas.length} valor${todas.length === 1 ? "" : "es"} en el catálogo`}
                  {filtradas.length > visibles.length ? ` · se muestran ${visibles.length}, escribe para filtrar` : ""}
                </p>
              )}

              {puedeAgregar && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void agregar(consulta)}
                  className="doc-tap flex w-full items-center gap-2 border-t border-[color:var(--doc-border)] px-3 py-2 text-left text-xs font-semibold transition-colors disabled:opacity-60"
                  style={{ color: "var(--doc-success-fg)", background: "var(--doc-success-bg)" }}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Añadir «{consulta.trim().toUpperCase()}» al catálogo
                </button>
              )}
            </motion.div>
          </EnPortal>
        )}
      </AnimatePresence>
    </>
  );
}
