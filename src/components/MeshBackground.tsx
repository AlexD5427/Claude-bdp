/**
 * The fluid mesh-gradient environment («aurora»).
 *
 * Several large, heavily-blurred "blobs" drift slowly behind the UI. Because
 * they move, the Liquid Glass surfaces on top have rich, shifting colour to
 * refract — which is what sells the illusion of real glass. Every colour is
 * theme-driven, so the same animation reads as a deep "Midnight" wash in dark
 * mode and a bright, airy sky in light mode.
 *
 * Liquid Glass 2:
 * - Cada mancha deriva con su propio recorrido y ritmo, así el movimiento no
 *   se percibe como un bucle.
 * - Encima va una segunda capa, fija: un abanico de luz desde arriba, una
 *   retícula técnica que se desvanece hacia abajo, un grano fino que quita las
 *   bandas de los degradados grandes y una viñeta suave. Se pinta una sola vez
 *   (no tiene animación) y queda también por encima del fondo WebGL
 *   (`ThreeBackground`, en `z-index: -10`), que si no la taparía casi entera.
 */
export function MeshBackground() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden no-print"
        style={{ backgroundColor: "var(--mesh-base)" }}
      >
        {/* Cyan — top left */}
        <div className="lg-blob lg-blob-1" />
        {/* Core blue — right */}
        <div className="lg-blob lg-blob-2" />
        {/* Deep blue — bottom */}
        <div className="lg-blob lg-blob-3" />
        {/* Neutral light — centre */}
        <div className="lg-blob lg-blob-4" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden no-print"
        style={{ zIndex: -9 }}
      >
        <div className="lg-mesh-beam" />
        <div className="lg-mesh-grid" />
        <div className="lg-mesh-grain" />
        <div className="lg-mesh-vignette" />
      </div>
    </>
  );
}
