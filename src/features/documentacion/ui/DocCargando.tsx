/**
 * Pantalla de carga del módulo: logo de documentos animado.
 *
 * ── Qué es y qué no es ──────────────────────────────────────────────────────
 * Es lo primero que se ve al abrir Documentación, mientras se resuelve la
 * conexión y llega el catálogo. NO es un adorno con un tiempo fijo: tiene un
 * tope duro y nunca bloquea. Cuatro reglas, en orden de importancia:
 *
 * 1. **No bloquea jamás.** Si el backend tarda, a los pocos segundos se entra a
 *    la consola con esqueletos y su diagnóstico honesto. Una pantalla de carga
 *    eterna es peor que un error: no dice nada y no deja hacer nada.
 * 2. **No parpadea.** Con caché local, la carga puede terminar en 40 ms. Mostrar
 *    y esconder una pantalla en 40 ms produce un destello que se percibe como un
 *    fallo, así que hay un mínimo perceptible.
 * 3. **Barata.** Solo `transform`, `opacity` y `filter`, aisladas con `contain`.
 *    Ni un `box-shadow` animado ni un gradiente que se recalcule: son las dos
 *    cosas que tumban a un equipo sin GPU decente.
 * 4. **Se apaga entera.** Con `prefers-reduced-motion`, con el interruptor de la
 *    aplicación o en modo ligero, las hojas se quedan quietas y legibles.
 *
 * ── Por qué SVG y CSS y no una librería ─────────────────────────────────────
 * Porque el módulo no puede añadir dependencias y porque no hace falta: tres
 * rectángulos con `rotateY` escalonado ya leen como un documento que se hojea.
 * `three.js` para esto costaría 700 KB y un contexto WebGL en una pantalla que
 * dura dos segundos.
 */

import { useEffect, useRef, useState } from "react";
import { useMovimientoReducido } from "./DocMotion";

/** Milisegundos que la pantalla se muestra como mínimo, para no destellar. */
const MINIMO_VISIBLE = 420;

/**
 * Logo: tres hojas apiladas que se hojean con color en movimiento.
 *
 * El `key` de las hojas es su índice y el retardo va en CSS (`nth-child`), no en
 * JavaScript: así la animación no depende del hilo principal y sigue fluida
 * mientras React monta el resto del módulo.
 */
export function LogoDocumentos({ quieto = false }: { quieto?: boolean }) {
  return (
    <div
      className={`doc-cargando-logo ${quieto ? "" : "doc-cargando-color"}`}
      style={{ perspective: "620px" }}
      aria-hidden
    >
      {/* Base: el documento de abajo, quieto, para que la pila tenga suelo. */}
      <div
        className="absolute inset-0 rounded-[10px]"
        style={{
          background: "linear-gradient(160deg, var(--doc-surface-raised), var(--doc-surface))",
          boxShadow: "inset 0 0 0 1px var(--doc-border)",
        }}
      />
      {/* Renglones del documento: dan la lectura de «papel con texto». */}
      <div className="absolute inset-x-4 top-5 space-y-2">
        {[100, 78, 92, 64].map((ancho, i) => (
          <span
            key={i}
            className="block h-[3px] rounded-full"
            style={{ width: `${ancho}%`, background: "var(--doc-border-strong)", opacity: 0.55 }}
          />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={quieto ? "absolute inset-0 rounded-[10px]" : "doc-cargando-hoja"}
          style={{
            background:
              i === 0
                ? "linear-gradient(150deg, var(--doc-info), var(--doc-accent))"
                : i === 1
                  ? "linear-gradient(150deg, var(--doc-success), var(--doc-info))"
                  : "linear-gradient(150deg, var(--doc-warning), var(--doc-success))",
            opacity: quieto ? 0.18 + i * 0.12 : undefined,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Pantalla completa de carga.
 *
 * `visible` la controla quien la usa; `onTiempoAgotado` se dispara al llegar al
 * tope duro para que el módulo entre igual con esqueletos.
 */
export function DocCargando({
  visible,
  topeMs = 4500,
  onTiempoAgotado,
  detalle,
}: {
  visible: boolean;
  /** Tope duro. Al llegar, se avisa y el módulo entra con esqueletos. */
  topeMs?: number;
  onTiempoAgotado?: () => void;
  /** Línea extra: «leyendo el catálogo», «conectando con el libro»… */
  detalle?: string;
}) {
  const reducido = useMovimientoReducido();
  const agotadoRef = useRef(onTiempoAgotado);
  agotadoRef.current = onTiempoAgotado;

  useEffect(() => {
    if (!visible) return;
    // El tope vive en un efecto que solo depende de `visible` y de `topeMs`: si
    // dependiera del manejador se remontaría en cada renderizado del padre y el
    // temporizador no llegaría a cumplirse nunca.
    const t = setTimeout(() => agotadoRef.current?.(), topeMs);
    return () => clearTimeout(t);
  }, [visible, topeMs]);

  if (!visible) return null;

  return (
    <div
      className="doc-console flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 py-16"
      role="status"
      aria-live="polite"
    >
      <LogoDocumentos quieto={reducido} />
      <div className="text-center">
        <p className="text-base font-semibold tracking-tight text-[color:var(--doc-text)]">Cargando documentación</p>
        {detalle && <p className="doc-prose mt-1 text-xs text-[color:var(--doc-text-muted)]">{detalle}</p>}
      </div>
      <div className="doc-cargando-barra" aria-hidden>
        <span />
      </div>
    </div>
  );
}

/**
 * Decide cuánto tiempo se muestra la pantalla de carga.
 *
 * Devuelve `true` mientras haya que mostrarla. Aplica el mínimo perceptible
 * (regla 2) y el tope duro (regla 1), y por eso vive aquí y no repartido entre
 * el armazón y la consola: son dos temporizadores que tienen que ponerse de
 * acuerdo, y separados se contradicen.
 */
export function useCortinaDeCarga(cargando: boolean, topeMs = 4500): boolean {
  const [visible, setVisible] = useState(cargando);
  const desde = useRef<number>(Date.now());

  useEffect(() => {
    if (cargando) {
      desde.current = Date.now();
      setVisible(true);
      const duro = setTimeout(() => setVisible(false), topeMs);
      return () => clearTimeout(duro);
    }
    const transcurrido = Date.now() - desde.current;
    const restante = Math.max(0, MINIMO_VISIBLE - transcurrido);
    if (!restante) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(false), restante);
    return () => clearTimeout(t);
  }, [cargando, topeMs]);

  return visible;
}
