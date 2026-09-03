/**
 * Pantalla de carga del módulo: el logo de documentos animado.
 *
 * ── Qué es y por qué existe ─────────────────────────────────────────────────
 * Al abrir Documentación hay que resolver la conexión, los permisos y el
 * catálogo antes de poder pintar algo con sentido. Eso son entre medio segundo y
 * cuatro, según el humor de Apps Script. Un esqueleto gris durante cuatro
 * segundos parece un módulo roto; unas hojas que se apilan y se hojean dicen «se
 * está preparando tu expediente» sin escribir una palabra de más.
 *
 * ── Reglas que se cumplen sin excepción ─────────────────────────────────────
 *   1. **SVG y CSS puro.** Ni three.js ni una dependencia nueva. Todo el
 *      movimiento son `transform` y `opacity` sobre seis elementos: no provoca
 *      ni un recálculo de diseño y va a 60 fps en un equipo sin GPU;
 *   2. **no bloquea NUNCA.** Hay un tope duro (`TOPE_MS`): pasado ese tiempo se
 *      entra a la consola con esqueletos y su diagnóstico honesto, aunque el
 *      backend siga pensando. Una pantalla de carga eterna es un módulo caído;
 *   3. **no parpadea.** Con caché local o una respuesta instantánea, la pantalla
 *      se mantiene un mínimo perceptible (`MINIMO_MS`) y sale con una transición
 *      suave. Aparecer y desaparecer en 80 ms se ve como un defecto;
 *   4. **se degrada.** Con `prefers-reduced-motion` o en modo ligero, las hojas
 *      quedan quietas y los colores dejan de moverse: se ve el logo, estático,
 *      con su texto.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import "./pantalla-carga.css";

/** Mínimo perceptible: por debajo, la pantalla se ve como un parpadeo. */
export const MINIMO_MS = 420;

/** Tope duro: pasado esto se entra igual, con esqueletos. */
export const TOPE_MS = 3200;

/**
 * Decide si la pantalla de carga debe seguir visible.
 *
 * Función pura para poder probarla sin montar nada: recibe si los datos están
 * listos y cuánto tiempo lleva abierta, y devuelve la decisión. Las tres reglas
 * —mínimo, tope y «listo»— caben en dos líneas y así se pueden verificar.
 */
export function debeSeguirVisible(listo: boolean, transcurridoMs: number): boolean {
  if (transcurridoMs >= TOPE_MS) return false;
  if (!listo) return true;
  return transcurridoMs < MINIMO_MS;
}

/**
 * Controla la pantalla de carga.
 *
 * Devuelve si hay que mostrarla y si se entró por el tope de tiempo, que es lo
 * que la consola necesita para decidir si pinta datos o esqueletos con
 * diagnóstico.
 */
export function usePantallaCarga(listo: boolean): { visible: boolean; porTiempo: boolean } {
  const inicio = useRef(Date.now());
  const [visible, setVisible] = useState(true);
  const [porTiempo, setPorTiempo] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const transcurrido = Date.now() - inicio.current;
    if (!debeSeguirVisible(listo, transcurrido)) {
      setVisible(false);
      return;
    }
    // Se despierta en el momento exacto en que la decisión puede cambiar: al
    // cumplirse el mínimo (si ya está listo) o al llegar al tope.
    const proximo = listo ? MINIMO_MS - transcurrido : TOPE_MS - transcurrido;
    const temporizador = setTimeout(() => {
      const ahora = Date.now() - inicio.current;
      if (ahora >= TOPE_MS && !listo) setPorTiempo(true);
      setVisible(debeSeguirVisible(listo, ahora));
    }, Math.max(16, proximo));
    return () => clearTimeout(temporizador);
  }, [listo, visible]);

  return { visible, porTiempo };
}

/* ------------------------------------------------------------------ */
/* El logo                                                             */
/* ------------------------------------------------------------------ */

/**
 * Hojas que se apilan y se hojean.
 *
 * Son cinco rectángulos redondeados con su desfase de animación. El color no se
 * pinta con un gradiente animado —eso repinta el área entera en cada
 * fotograma— sino con un `filter: hue-rotate` sobre el grupo, que la GPU resuelve
 * como una capa compuesta y cuesta lo mismo con cinco hojas que con cincuenta.
 */
function HojasAnimadas({ quieto }: { quieto: boolean }) {
  const hojas = useMemo(() => [0, 1, 2, 3, 4], []);
  return (
    <svg
      viewBox="0 0 120 120"
      className={`doc-carga-logo ${quieto ? "doc-carga-quieto" : ""}`}
      role="img"
      aria-label="Documentos apilándose"
    >
      <defs>
        <linearGradient id="doc-carga-tinta" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--doc-carga-1)" />
          <stop offset="55%" stopColor="var(--doc-carga-2)" />
          <stop offset="100%" stopColor="var(--doc-carga-3)" />
        </linearGradient>
      </defs>

      {/* Carpeta: el elemento quieto que da referencia al movimiento. */}
      <path
        className="doc-carga-carpeta"
        d="M18 40c0-4.4 3.6-8 8-8h18l7 8h27c4.4 0 8 3.6 8 8v42c0 4.4-3.6 8-8 8H26c-4.4 0-8-3.6-8-8V40Z"
        fill="url(#doc-carga-tinta)"
        opacity="0.22"
      />

      <g className="doc-carga-grupo">
        {hojas.map((i) => (
          <g key={i} className="doc-carga-hoja" style={{ animationDelay: `${i * 0.22}s` }}>
            <rect x="34" y="26" width="52" height="66" rx="6" fill="url(#doc-carga-tinta)" opacity={0.92 - i * 0.08} />
            {/* Renglones: dan la lectura de «documento» sin dibujar texto. */}
            <rect x="42" y="38" width="36" height="3.4" rx="1.7" fill="var(--doc-carga-linea)" opacity="0.55" />
            <rect x="42" y="48" width="28" height="3.4" rx="1.7" fill="var(--doc-carga-linea)" opacity="0.42" />
            <rect x="42" y="58" width="32" height="3.4" rx="1.7" fill="var(--doc-carga-linea)" opacity="0.34" />
          </g>
        ))}
      </g>

      {/* Sello: el visto bueno que aparece al final de cada ciclo. */}
      <g className="doc-carga-sello">
        <circle cx="86" cy="86" r="16" fill="var(--doc-carga-sello-bg)" />
        <path
          d="m78.5 86.5 5 5 10-11"
          fill="none"
          stroke="var(--doc-carga-sello-fg)"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * La pantalla completa.
 *
 * `aria-busy` y `role="status"` hacen que un lector de pantalla anuncie
 * «Cargando documentación» una vez, sin repetirlo en cada fotograma.
 */
export function PantallaCarga({
  quieto = false,
  detalle,
}: {
  /** Sin movimiento: `prefers-reduced-motion` o modo ligero. */
  quieto?: boolean;
  /** Línea honesta de qué se está haciendo, si hace falta decirlo. */
  detalle?: string;
}) {
  return (
    <div className="doc-carga" role="status" aria-busy="true" data-quieto={quieto ? "si" : undefined}>
      <div className="doc-carga-centro">
        <HojasAnimadas quieto={quieto} />
        <p className="doc-carga-texto">Cargando documentación</p>
        {detalle ? <p className="doc-carga-detalle">{detalle}</p> : null}
        {/* Barra indeterminada: solo `transform`, ni un píxel de layout. */}
        <span className={`doc-carga-barra ${quieto ? "doc-carga-quieto" : ""}`} aria-hidden>
          <span />
        </span>
      </div>
    </div>
  );
}
