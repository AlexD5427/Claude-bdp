/**
 * Desplegable de un catálogo auxiliar (`agencia_bdp`, `gerencia_bdp`, `cargo_bdp`).
 *
 * ── De dónde salen las opciones ─────────────────────────────────────────────
 * De la hoja `Auxiliar` del libro. El backend crea esa hoja si no existe, localiza
 * la columna POR SU CABECERA —normalizada, así que «Cargo_BDP» o «cargo bdp»
 * valen igual— y devuelve la columna entera. El frontend NO tiene una lista
 * propia: si el área añade un cargo en la hoja, aparece aquí sin tocar código,
 * que es exactamente lo que el área pidió.
 *
 * ── Por qué se puede añadir desde aquí ─────────────────────────────────────
 * Porque el caso real existe: se abre un expediente de una agencia nueva un lunes
 * a las ocho y quien registra no tiene el libro abierto ni permisos para editarlo
 * a mano. El valor se envía a `documentacion.auxiliares.agregar`, que lo escribe al
 * final de la columna —**nunca quita nada**— y lo devuelve normalizado. Si la
 * escritura falla, el valor se usa igual en este expediente y se avisa: es mejor
 * un expediente con la agencia correcta y un catálogo por completar que un
 * expediente sin agencia.
 *
 * ── Por qué la lista está ventaneada ───────────────────────────────────────
 * `cargo_bdp` son los cargos del banco: pueden ser trescientos. Pintar
 * trescientos botones —cada uno con su `onMouseEnter` y su estado— en un panel de
 * 224 píxeles de alto cuesta un fotograma entero en un equipo modesto, y
 * doscientos ochenta de ellos no se ven nunca. Aquí se pintan solo los visibles
 * más un margen, y se muestra el recuento («12 de 187 coincidencias») para que
 * nadie tenga que adivinar si la lista está recortada.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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

/** Etiqueta legible de la columna, para los textos de la interfaz. */
const ETIQUETA_COLUMNA: Record<ColumnaAuxiliar, string> = {
  agencia_bdp: "agencia",
  gerencia_bdp: "gerencia",
  cargo_bdp: "cargo",
};

/* Geometría del panel. Se declara aquí porque el ventaneo y el cálculo de
   posición tienen que usar los MISMOS números: si se separan, la lista salta. */
const ALTO_FILA = 32;
const ALTO_LISTA = 224;
const MARGEN_VENTANA = 4;

/**
 * Resalta en negrita la parte del texto que coincide con la búsqueda.
 *
 * Se compara sobre el texto normalizado pero se corta el ORIGINAL por índices: la
 * normalización no cambia la longitud (quitar un acento deja la letra), así que
 * los índices siguen siendo válidos y «Chávez» se resalta escribiendo «chav».
 */
function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  const k = llave(consulta);
  if (!k) return <>{texto}</>;
  const posicion = llave(texto).indexOf(k);
  if (posicion < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, posicion)}
      <strong className="font-bold" style={{ color: "var(--doc-info-fg)" }}>
        {texto.slice(posicion, posicion + k.length)}
      </strong>
      {texto.slice(posicion + k.length)}
    </>
  );
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
  const [desplazamiento, setDesplazamiento] = useState(0);
  /** Valores añadidos en esta sesión, para que aparezcan aunque el catálogo no se haya refrescado. */
  const [extra, setExtra] = useState<string[]>([]);
  const ancla = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const buscador = useRef<HTMLInputElement | null>(null);
  const lista = useRef<HTMLUListElement | null>(null);
  const [caja, setCaja] = useState<{ top: number; left: number; ancho: number; arriba: boolean } | null>(null);

  const etiqueta = ETIQUETA_COLUMNA[columna];

  const todas = useMemo(() => {
    const vistas = new Set<string>();
    const acumulado: string[] = [];
    for (const o of [...opciones, ...extra]) {
      const k = llave(o);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      acumulado.push(o);
    }
    return acumulado.sort((a, b) => a.localeCompare(b, "es"));
  }, [opciones, extra]);

  const filtradas = useMemo(() => {
    const k = llave(consulta);
    if (!k) return todas;
    return todas.filter((o) => llave(o).includes(k));
  }, [todas, consulta]);

  const existeExacta = filtradas.some((o) => llave(o) === llave(consulta));
  const puedeAgregar = permitirAlta && consulta.trim().length >= 2 && !existeExacta;

  /* Ventana visible de la lista. `Math.max(0, …)` evita un índice negativo al
     principio, y el margen a los dos lados hace que un desplazamiento rápido no
     deje huecos en blanco. */
  const primero = Math.max(0, Math.floor(desplazamiento / ALTO_FILA) - MARGEN_VENTANA);
  const ultimo = Math.min(filtradas.length, Math.ceil((desplazamiento + ALTO_LISTA) / ALTO_FILA) + MARGEN_VENTANA);
  const visibles = filtradas.slice(primero, ultimo);

  /* El índice activo se recorta cuando la lista se acorta al escribir: sin esto,
     Enter elegiría un elemento que ya no existe. */
  const activo = Math.min(indice, Math.max(0, filtradas.length - 1));
  const idOpcionActiva = filtradas[activo] ? `${idBase}-op-${activo}` : undefined;

  /** Deja visible la opción activa al moverse con el teclado. */
  const asegurarVisible = useCallback((posicion: number) => {
    const caja = lista.current;
    if (!caja) return;
    const arribaDe = posicion * ALTO_FILA;
    const abajoDe = arribaDe + ALTO_FILA;
    if (arribaDe < caja.scrollTop) caja.scrollTop = arribaDe;
    else if (abajoDe > caja.scrollTop + caja.clientHeight) caja.scrollTop = abajoDe - caja.clientHeight;
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const calcular = () => {
      const r = ancla.current?.getBoundingClientRect();
      if (!r) return;
      const alto = ALTO_LISTA + 96;
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

  /* Al abrir se vuelve arriba: reabrir un desplegable a media lista deja a la
     persona mirando un trozo del alfabeto sin contexto. */
  useEffect(() => {
    if (!abierto) return;
    setDesplazamiento(0);
    setIndice(0);
    if (lista.current) lista.current.scrollTop = 0;
  }, [abierto]);

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
      onAviso?.("exito", `«${limpio}» se añadió a la lista de ${etiqueta}s del libro.`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      onAviso?.(
        "aviso",
        `El valor se usará en este expediente, pero no se pudo añadir a la lista de ${etiqueta}s: ${fallo.message ?? ""}`,
        fallo.pista ?? `Añádelo a mano en la hoja Auxiliar, columna ${columna}, cuando puedas.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const siguiente = Math.min(activo + 1, Math.max(0, filtradas.length - 1));
      setIndice(siguiente);
      asegurarVisible(siguiente);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const previo = Math.max(0, activo - 1);
      setIndice(previo);
      asegurarVisible(previo);
    } else if (e.key === "Home") {
      e.preventDefault();
      setIndice(0);
      asegurarVisible(0);
    } else if (e.key === "End") {
      e.preventDefault();
      const fin = Math.max(0, filtradas.length - 1);
      setIndice(fin);
      asegurarVisible(fin);
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      // Con trescientos cargos, avanzar de uno en uno es inviable.
      e.preventDefault();
      const salto = Math.floor(ALTO_LISTA / ALTO_FILA);
      const destino =
        e.key === "PageDown"
          ? Math.min(activo + salto, Math.max(0, filtradas.length - 1))
          : Math.max(0, activo - salto);
      setIndice(destino);
      asegurarVisible(destino);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtradas[activo]) elegir(filtradas[activo]);
      else if (puedeAgregar) void agregar(consulta);
    } else if (e.key === "Escape") {
      // Se detiene la propagación: si no, el Escape cerraría también el
      // asistente que contiene este campo, y con él el formulario a medio llenar.
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
      ancla.current?.focus();
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
        aria-controls={abierto ? `${idBase}-lista` : undefined}
        className="doc-tap flex w-full items-center justify-between gap-2 rounded-[var(--doc-radius-sm,10px)] px-2.5 py-2 text-left text-sm transition-shadow"
        style={{
          background: "var(--doc-surface)",
          color: valor ? "var(--doc-text)" : "var(--doc-text-muted)",
          boxShadow: `inset 0 0 0 1px ${abierto ? "var(--doc-focus)" : "var(--doc-border)"}`,
        }}
      >
        <span className="min-w-0 truncate">{valor || placeholder || "Elige una opción"}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: "var(--doc-text-muted)", transform: abierto ? "rotate(180deg)" : "none" }}
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
                <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--doc-text-muted)" }} aria-hidden />
                <input
                  ref={buscador}
                  value={consulta}
                  onChange={(e) => {
                    setConsulta(e.target.value);
                    setIndice(0);
                    setDesplazamiento(0);
                    if (lista.current) lista.current.scrollTop = 0;
                  }}
                  onKeyDown={alTeclear}
                  role="combobox"
                  aria-expanded
                  aria-autocomplete="list"
                  aria-controls={`${idBase}-lista`}
                  aria-activedescendant={idOpcionActiva}
                  aria-label={`Buscar ${etiqueta}`}
                  placeholder={`Buscar ${etiqueta} o escribir una nueva…`}
                  className="w-full bg-transparent text-sm font-medium text-[color:var(--doc-text)] outline-none placeholder:font-normal placeholder:text-[color:var(--doc-text-muted)]"
                />
              </div>

              {/* Recuento: dice si la lista está filtrada y cuánto hay detrás. Sin
                  esto, ver doce cargos de trescientos parece un catálogo vacío. */}
              {todas.length > 0 && (
                <p
                  className="border-b border-[color:var(--doc-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--doc-text-muted)" }}
                  aria-live="polite"
                >
                  {consulta.trim()
                    ? `${filtradas.length} de ${todas.length} coincidencia${filtradas.length === 1 ? "" : "s"}`
                    : `${todas.length} ${etiqueta}${todas.length === 1 ? "" : "s"} en el libro`}
                </p>
              )}

              <ul
                ref={lista}
                id={`${idBase}-lista`}
                role="listbox"
                aria-label={`Lista de ${etiqueta}s`}
                className="overflow-y-auto py-1"
                style={{ maxHeight: ALTO_LISTA }}
                onScroll={(e) => setDesplazamiento(e.currentTarget.scrollTop)}
              >
                {filtradas.length === 0 && !puedeAgregar && (
                  <li className="px-3 py-3 text-xs text-[color:var(--doc-text-muted)]">
                    {todas.length === 0
                      ? `La columna ${columna} de la hoja Auxiliar llegó vacía. Escribe el valor y añádelo.`
                      : "Ningún valor coincide."}
                  </li>
                )}
                {/* Espaciadores: sostienen la barra de desplazamiento sin pintar
                    las filas que no se ven. */}
                {primero > 0 && <li aria-hidden style={{ height: primero * ALTO_FILA }} />}
                {visibles.map((o, i) => {
                  const posicion = primero + i;
                  const elegido = llave(o) === llave(valor);
                  const resaltada = posicion === activo;
                  return (
                    /* `role="option"` y el `id` van en el BOTÓN, no en el `<li>`.
                       Es lo que exige ARIA (la opción es lo seleccionable) y
                       además lo que hace que `aria-activedescendant` apunte al
                       elemento que de verdad responde al clic y al Enter. El
                       `<li>` queda como presentación pura. */
                    <li key={o} role="presentation">
                      <button
                        type="button"
                        id={`${idBase}-op-${posicion}`}
                        role="option"
                        aria-selected={elegido}
                        tabIndex={-1}
                        onMouseEnter={() => setIndice(posicion)}
                        onClick={() => elegir(o)}
                        className="doc-tap flex w-full items-center justify-between gap-2 px-3 text-left text-sm transition-colors"
                        style={{
                          height: ALTO_FILA,
                          background: resaltada ? "var(--doc-surface-raised)" : "transparent",
                          color: elegido ? "var(--doc-info-fg)" : "var(--doc-text)",
                          fontWeight: elegido ? 600 : 400,
                        }}
                      >
                        <span className="min-w-0 truncate">
                          <Resaltado texto={o} consulta={consulta} />
                        </span>
                        {elegido && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
                {ultimo < filtradas.length && <li aria-hidden style={{ height: (filtradas.length - ultimo) * ALTO_FILA }} />}
              </ul>

              {puedeAgregar && (
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void agregar(consulta)}
                  className="doc-tap flex w-full items-center gap-2 border-t border-[color:var(--doc-border)] px-3 py-2 text-left text-xs font-bold transition-colors disabled:opacity-60"
                  style={{ color: "var(--doc-success-fg)", background: "var(--doc-success-bg)" }}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Añadir «{consulta.trim().toUpperCase()}» a la lista de {etiqueta}s
                </button>
              )}
            </motion.div>
          </EnPortal>
        )}
      </AnimatePresence>
    </>
  );
}
