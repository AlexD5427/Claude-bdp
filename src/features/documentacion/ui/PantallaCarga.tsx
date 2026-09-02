/**
 * Pantalla de carga del módulo: hojas que se apilan y se hojean.
 *
 * ── Qué tiene que hacer, en orden de importancia ────────────────────────────
 *   1. **no bloquear nunca**. Es una pantalla de espera, no una puerta: si el
 *      backend tarda, a los pocos segundos se entra igual a la consola con sus
 *      esqueletos y su diagnóstico honesto. Una animación bonita que impide
 *      trabajar es peor que ninguna animación;
 *   2. **no parpadear**. Aparecer y desaparecer en 80 ms es un destello molesto y
 *      hace pensar que algo falló. Hay un mínimo perceptible: si la carga es
 *      instantánea —caché local— se muestra brevísimamente y se entra;
 *   3. **ser barata**. Solo `transform`, `opacity` y `filter`, que el compositor
 *      resuelve sin recalcular diseño. Ni un `width`, ni un `top`, ni un `box-shadow`
 *      animado: cualquiera de los tres obliga al hilo principal a recalcular en
 *      cada fotograma y en un equipo modesto eso son los 60 fps que se pierden;
 *   4. **desaparecer sola** con `prefers-reduced-motion` o en modo ligero, donde
 *      se degrada a una versión estática con el mismo texto.
 *
 * ── Por qué SVG y CSS, y no three.js ────────────────────────────────────────
 * `three` ya está en el paquete (lo usa el currículum 3D) pero cargarlo aquí
 * significaría arrastrar el chunk de WebGL para pintar cuatro rectángulos, y
 * dispararía la GPU en el peor momento: justo cuando el navegador está
 * descargando y evaluando el resto del módulo. Cuatro `<rect>` con
 * `animation: transform` cuestan cero.
 *
 * ── El color dinámico ───────────────────────────────────────────────────────
 * El gradiente NO se anima interpolando colores (eso repinta), se anima
 * `rotate` sobre un gradiente ya pintado y `hue-rotate` en el filtro. El ojo ve
 * color en movimiento; el compositor solo ve una transformación.
 */

import { useEffect, useRef, useState } from "react";
import { useMovimientoReducido } from "./DocMotion";

/** Mínimo perceptible. Menos de esto es un destello; más, una espera inventada. */
const MINIMO_MS = 420;

/**
 * Tope duro.
 *
 * Pasado este tiempo se entra a la consola aunque el backend no haya contestado.
 * La consola sabe pintarse con esqueletos y explicar qué está esperando, que es
 * infinitamente más útil que un logotipo girando sin fin.
 */
const TOPE_MS = 3500;

/**
 * Decide si la pantalla de carga debe estar visible.
 *
 * Devuelve `visible` y `agotado`. `agotado` es la señal de que se entró por tope
 * de tiempo y no porque todo estuviera listo: quien lo consume puede avisar de
 * que los datos siguen llegando.
 */
export function usarPantallaCarga(listo: boolean): { visible: boolean; agotado: boolean } {
  const [visible, setVisible] = useState(true);
  const [agotado, setAgotado] = useState(false);
  const nacimiento = useRef(Date.now());

  useEffect(() => {
    const duro = window.setTimeout(() => {
      setAgotado(true);
      setVisible(false);
    }, TOPE_MS);
    return () => window.clearTimeout(duro);
  }, []);

  useEffect(() => {
    if (!listo) return;
    // Se respeta el mínimo perceptible contando desde el montaje, no desde que
    // `listo` cambió: si la caché resolvió en 30 ms, quedan 390 ms de animación,
    // no 420 más.
    const restante = Math.max(0, MINIMO_MS - (Date.now() - nacimiento.current));
    const suave = window.setTimeout(() => setVisible(false), restante);
    return () => window.clearTimeout(suave);
  }, [listo]);

  return { visible, agotado };
}

/**
 * El logotipo animado.
 *
 * `ligero` lo deja estático conservando la composición: en un equipo sin GPU
 * decente, cuatro animaciones simultáneas durante la carga del módulo son
 * precisamente lo que no hay que hacer.
 */
export function PantallaCargaDocumentacion({ ligero = false }: { ligero?: boolean }) {
  const reducido = useMovimientoReducido();
  const quieto = ligero || reducido;

  return (
    <div
      className="doc-console flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16"
      role="status"
      aria-live="polite"
    >
      <div className={quieto ? "doc-logo-hojas" : "doc-logo-hojas doc-logo-hojas--anima"} aria-hidden>
        <svg viewBox="0 0 120 120" width="112" height="112" focusable="false">
          <defs>
            {/* Un solo gradiente, girado por CSS. Interpolar `stop-color` en cada
                fotograma repintaría el degradado entero; girarlo no. */}
            <linearGradient id="doc-carga-tinta" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--doc-info)" />
              <stop offset="50%" stopColor="var(--doc-accent)" />
              <stop offset="100%" stopColor="var(--doc-success)" />
            </linearGradient>
            <clipPath id="doc-carga-recorte">
              <rect x="26" y="18" width="68" height="86" rx="9" />
            </clipPath>
          </defs>

          {/* Las tres hojas del fondo: la pila. Cada una tiene su propio retardo,
              declarado en CSS, para que el apilado se lea como una secuencia. */}
          <g className="doc-logo-pila">
            <rect className="doc-logo-hoja doc-logo-hoja--3" x="26" y="18" width="68" height="86" rx="9" />
            <rect className="doc-logo-hoja doc-logo-hoja--2" x="26" y="18" width="68" height="86" rx="9" />
            <rect className="doc-logo-hoja doc-logo-hoja--1" x="26" y="18" width="68" height="86" rx="9" />
          </g>

          {/* La hoja de delante, con el degradado y sus renglones. */}
          <g className="doc-logo-frente">
            <rect x="26" y="18" width="68" height="86" rx="9" fill="url(#doc-carga-tinta)" opacity="0.22" />
            <rect
              x="26"
              y="18"
              width="68"
              height="86"
              rx="9"
              fill="none"
              stroke="url(#doc-carga-tinta)"
              strokeWidth="2.5"
            />
            <g clipPath="url(#doc-carga-recorte)" stroke="url(#doc-carga-tinta)" strokeWidth="3" strokeLinecap="round">
              <line className="doc-logo-renglon doc-logo-renglon--1" x1="38" y1="40" x2="76" y2="40" />
              <line className="doc-logo-renglon doc-logo-renglon--2" x1="38" y1="55" x2="82" y2="55" />
              <line className="doc-logo-renglon doc-logo-renglon--3" x1="38" y1="70" x2="68" y2="70" />
              <line className="doc-logo-renglon doc-logo-renglon--4" x1="38" y1="85" x2="78" y2="85" />
            </g>
          </g>
        </svg>
      </div>

      <div className="text-center">
        <p className="text-base font-bold tracking-tight text-[color:var(--doc-text)]">Cargando documentación</p>
        <p className="doc-prose mt-1 text-xs italic text-[color:var(--doc-text-muted)]">
          Preparando el catálogo y los expedientes del libro.
        </p>
      </div>
    </div>
  );
}
