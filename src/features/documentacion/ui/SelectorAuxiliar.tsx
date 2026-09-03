/**
 * Campo con sugerencias en vivo desde la hoja `Auxiliar`.
 *
 * ── De dónde salen las opciones ─────────────────────────────────────────────
 * De una columna de la hoja `Auxiliar` del libro (`agencia_bdp`, `gerencia_bdp`,
 * `cargo_bdp`). El backend localiza la columna POR SU CABECERA —normalizada, así
 * que `Cargo_BDP` o `cargo bdp` valen igual—, la lee entera hasta su último valor
 * y la devuelve deduplicada y ordenada. El frontend no tiene lista propia: si el
 * área pega trescientos cargos en la hoja, aparecen los trescientos.
 *
 * ── Por qué se puede añadir desde aquí ──────────────────────────────────────
 * Porque el caso real existe: se abre un expediente de una agencia nueva un lunes
 * a las ocho y quien registra no tiene el libro abierto ni permisos para editarlo
 * a mano. El valor se envía a `documentacion.auxiliares.agregar`, que lo escribe
 * al final de la columna —**nunca quita nada**—. Si la escritura falla, el valor
 * se usa igual en este expediente y se avisa: es mejor un expediente con el cargo
 * correcto y un catálogo por completar que un expediente sin cargo.
 *
 * ── Búsqueda y teclado ─────────────────────────────────────────────────────
 * Se escribe y se filtra ignorando acentos y mayúsculas; las flechas mueven,
 * Enter elige, Escape cierra y devuelve el foco al campo. La opción activa se
 * anuncia con `aria-activedescendant`, que es lo que hace que un lector de
 * pantalla lea la opción sobre la que se está sin perder el cursor del texto.
 *
 * ── Listas largas ──────────────────────────────────────────────────────────
 * Con trescientos cargos, pintar los trescientos `<li>` cuesta más que la propia
 * búsqueda. La lista está VENTANEADA: se pintan como máximo `VENTANA` opciones
 * alrededor de la activa y el recuento dice cuántas hay en total («12 de 187
 * coincidencias»), para que nadie crea que la lista se cortó.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { docApi, type ColumnaAuxiliar } from "../api/acciones";
import { refrescarCatalogo } from "../state/consola";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";

/** Cuántas opciones se pintan a la vez. El resto existe, pero no cuesta layout. */
const VENTANA = 60;

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

/** Nombre humano de la columna, para los mensajes. */
const ETIQUETA_COLUMNA: Record<ColumnaAuxiliar, string> = {
  agencia_bdp: "agencias",
  gerencia_bdp: "gerencias",
  cargo_bdp: "cargos",
};

/** En singular, para nombrar el disparador del desplegable. */
const NOMBRE_COLUMNA: Record<ColumnaAuxiliar, string> = {
  agencia_bdp: "Agencia",
  gerencia_bdp: "Gerencia",
  cargo_bdp: "Cargo",
};

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
  const idListado = useId();
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

  /* Ventana alrededor de la opción activa: la lista puede tener cientos de
     valores y pintarlos todos es lo que hace que el desplegable «pese». */
  const ventana = useMemo(() => {
    if (filtradas.length <= VENTANA) return { desde: 0, visibles: filtradas };
    const desde = Math.max(0, Math.min(indice - Math.floor(VENTANA / 2), filtradas.length - VENTANA));
    return { desde, visibles: filtradas.slice(desde, desde + VENTANA) };
  }, [filtradas, indice]);

  const existeExacta = filtradas.some((o) => llave(o) === llave(consulta));
  const puedeAgregar = permitirAlta && consulta.trim().length >= 2 && !existeExacta;

  /* La opción activa nunca puede quedar fuera del rango: al escribir, la lista se
     acorta y un índice heredado apuntaría a nada (Enter no elegiría nada). */
  useEffect(() => {
    setIndice((i) => (i >= filtradas.length ? 0 : i));
  }, [filtradas.length]);

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

  /** Deja visible la opción activa cuando se llega a ella con el teclado. */
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>('[data-activa="si"]')?.scrollIntoView({ block: "nearest" });
  }, [abierto, indice]);

  const elegir = useCallback(
    (opcion: string) => {
      onChange(opcion);
      setAbierto(false);
      setConsulta("");
      ancla.current?.focus();
    },
    [onChange],
  );

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
      onAviso?.("exito", `«${limpio}» se añadió al catálogo de ${ETIQUETA_COLUMNA[columna]}.`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      onAviso?.(
        "aviso",
        `El valor se usará en este expediente, pero no se pudo añadir al catálogo: ${fallo.message ?? ""}`,
        fallo.pista ?? `Añádelo a mano en la columna ${columna} de la hoja Auxiliar cuando puedas.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <button
        ref={ancla}
        id={id}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idListado : undefined}
        // Nombre propio y explícito. Sin esto el nombre lo decide el `<label>`
        // que `Campo` pone alrededor —un botón es un control etiquetable—, y lo
        // que se anunciaba era la etiqueta con TODO su texto de ayuda, sin decir
        // nunca qué está elegido. Con esto se oye «Cargo: OFICIAL DE NEGOCIOS».
        aria-label={`${NOMBRE_COLUMNA[columna]}: ${valor || "sin elegir"}`}
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
                  aria-controls={idListado}
                  aria-autocomplete="list"
                  aria-activedescendant={filtradas[indice] ? `${idListado}-${indice}` : undefined}
                  aria-label={`Buscar entre las ${ETIQUETA_COLUMNA[columna]} del catálogo`}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setIndice(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setIndice((i) => Math.min(i + 1, Math.max(0, filtradas.length - 1)));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setIndice((i) => Math.max(0, i - 1));
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      setIndice(0);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      setIndice(Math.max(0, filtradas.length - 1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (filtradas[indice]) elegir(filtradas[indice]);
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

              {/* Recuento honesto: dice cuántas se ven y cuántas hay. */}
              <p className="border-b border-[color:var(--doc-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--doc-text-faint)]" aria-live="polite">
                {todas.length === 0
                  ? "Catálogo vacío"
                  : consulta.trim()
                    ? `${Math.min(ventana.visibles.length, filtradas.length)} de ${filtradas.length} coincidencia${filtradas.length === 1 ? "" : "s"}`
                    : `${ventana.visibles.length} de ${todas.length} ${ETIQUETA_COLUMNA[columna]}`}
              </p>

              <ul ref={lista} id={idListado} role="listbox" aria-label={`Opciones de ${ETIQUETA_COLUMNA[columna]}`} className="max-h-56 overflow-y-auto py-1">
                {filtradas.length === 0 && !puedeAgregar && (
                  <li className="px-3 py-3 text-xs text-[color:var(--doc-text-muted)]">
                    {todas.length === 0
                      ? "El catálogo llegó vacío. Escribe el valor y añádelo."
                      : "Ningún valor coincide."}
                  </li>
                )}
                {ventana.visibles.map((o, posicion) => {
                  const i = ventana.desde + posicion;
                  const elegido = llave(o) === llave(valor);
                  const activa = i === indice;
                  return (
                    <li key={o}>
                      <button
                        id={`${idListado}-${i}`}
                        type="button"
                        role="option"
                        aria-selected={elegido}
                        data-activa={activa ? "si" : undefined}
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
