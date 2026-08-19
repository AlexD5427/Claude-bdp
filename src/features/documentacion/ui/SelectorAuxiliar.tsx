/**
 * Desplegable de un catálogo auxiliar (`agencia_bdp`, `gerencia_bdp`).
 *
 * ── De dónde salen las opciones ─────────────────────────────────────────────
 * De la hoja `Auxiliar` del libro. El backend crea esa hoja si no existe, se
 * asegura de que tenga la cabecera que corresponde y devuelve la columna entera
 * como lista. El frontend NO tiene una lista propia: si el área añade una agencia
 * en la hoja, aparece aquí sin tocar código, que es exactamente lo que el área
 * pidió.
 *
 * ── Por qué se puede añadir desde aquí ──────────────────────────────────────
 * Porque el caso real existe: se abre un expediente de una agencia nueva un lunes
 * a las ocho y quien registra no tiene el libro abierto ni permisos para editarlo
 * a mano. El valor se envía a `documentacion.auxiliares.agregar`, que lo escribe al
 * final de la columna —**nunca quita nada**— y lo devuelve normalizado. Si la
 * escritura falla, el valor se usa igual en este expediente y se avisa: es mejor
 * un expediente con la agencia correcta y un catálogo por completar que un
 * expediente sin agencia.
 *
 * ── Búsqueda ────────────────────────────────────────────────────────────────
 * Con veinte agencias, un `<select>` obliga a recorrer la lista. Aquí se escribe y
 * se filtra; con teclado, las flechas mueven y Enter elige.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { docApi } from "../api/acciones";
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
  columna: "agencia_bdp" | "gerencia_bdp";
  placeholder?: string;
  permitirAlta?: boolean;
  onAviso?: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
  id?: string;
}) {
  const reducido = useMovimientoReducido();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);
  const [guardando, setGuardando] = useState(false);
  /** Valores añadidos en esta sesión, para que aparezcan aunque el catálogo no se haya refrescado. */
  const [extra, setExtra] = useState<string[]>([]);
  const ancla = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const buscador = useRef<HTMLInputElement | null>(null);
  const [caja, setCaja] = useState<{ top: number; left: number; ancho: number; arriba: boolean } | null>(null);

  const todas = useMemo(() => {
    const vistas = new Set<string>();
    const lista: string[] = [];
    for (const o of [...opciones, ...extra]) {
      const k = llave(o);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      lista.push(o);
    }
    return lista.sort((a, b) => a.localeCompare(b, "es"));
  }, [opciones, extra]);

  const filtradas = useMemo(() => {
    const k = llave(consulta);
    if (!k) return todas;
    return todas.filter((o) => llave(o).includes(k));
  }, [todas, consulta]);

  const existeExacta = filtradas.some((o) => llave(o) === llave(consulta));
  const puedeAgregar = permitirAlta && consulta.trim().length >= 2 && !existeExacta;

  useEffect(() => {
    if (!abierto) return;
    const calcular = () => {
      const r = ancla.current?.getBoundingClientRect();
      if (!r) return;
      const alto = 300;
      const arriba = r.bottom + alto + 12 > window.innerHeight && r.top > alto;
      setCaja({ top: arriba ? r.top - alto - 6 : r.bottom + 6, left: r.left, ancho: Math.max(220, r.width), arriba });
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
      onAviso?.("exito", `«${limpio}» se añadió al catálogo ${columna}.`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      onAviso?.(
        "aviso",
        `El valor se usará en este expediente, pero no se pudo añadir al catálogo: ${fallo.message ?? ""}`,
        fallo.pista ?? "Añádelo a mano en la hoja Auxiliar cuando puedas.",
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
              role="listbox"
              aria-label={`Opciones de ${columna}`}
            >
              <div className="flex items-center gap-2 border-b border-[color:var(--doc-border)] px-2.5 py-2">
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--doc-text-faint)" }} aria-hidden />
                <input
                  ref={buscador}
                  value={consulta}
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
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (filtradas[indice]) {
                        onChange(filtradas[indice]);
                        setAbierto(false);
                        setConsulta("");
                      } else if (puedeAgregar) {
                        void agregar(consulta);
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setAbierto(false);
                      ancla.current?.focus();
                    }
                  }}
                  placeholder="Buscar o escribir una nueva…"
                  className="w-full bg-transparent text-sm text-[color:var(--doc-text)] outline-none placeholder:text-[color:var(--doc-text-faint)]"
                />
              </div>

              <ul className="max-h-56 overflow-y-auto py-1">
                {filtradas.length === 0 && !puedeAgregar && (
                  <li className="px-3 py-3 text-xs text-[color:var(--doc-text-faint)]">
                    {todas.length === 0
                      ? "El catálogo llegó vacío. Escribe el valor y añádelo."
                      : "Ningún valor coincide."}
                  </li>
                )}
                {filtradas.map((o, i) => {
                  const elegido = llave(o) === llave(valor);
                  return (
                    <li key={o}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={elegido}
                        onMouseEnter={() => setIndice(i)}
                        onClick={() => {
                          onChange(o);
                          setAbierto(false);
                          setConsulta("");
                        }}
                        className="doc-tap flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors"
                        style={{
                          background: i === indice ? "var(--doc-surface-raised)" : "transparent",
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
