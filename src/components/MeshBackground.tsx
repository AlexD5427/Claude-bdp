/**
 * El entorno «aurora» detrás del vidrio.
 *
 * Cuatro manchas de color que derivan muy despacio, una cortina de aurora en
 * diagonal que se mece, una viñeta que calma los bordes y un grano finísimo
 * que evita las bandas de los degradados. Como todo se mueve, las superficies
 * Liquid Glass de encima tienen color cambiante que refractar: es lo que vende
 * la ilusión de vidrio real.
 *
 * Optimización: antes eran círculos sólidos con `blur(120–140px)`, el filtro
 * más caro que puede pedirse a una GPU sobre capas de 700 px en movimiento.
 * Ahora cada mancha es un degradado radial que se funde en transparente —la
 * misma forma suave sin ningún filtro— y solo se anima `transform`, que corre
 * en el compositor. Si el motor WebGL está pintando encima, estas animaciones
 * se congelan (ver `html[data-webgl]` en index.css).
 *
 * Todos los colores salen de variables del tema, así que la misma escena es un
 * «Midnight» profundo en oscuro y un cielo luminoso en claro.
 */
export function MeshBackground() {
  return (
    <div
      aria-hidden
      className="aurora-root pointer-events-none fixed inset-0 -z-10 overflow-hidden no-print"
    >
      <div className="aurora-blob aurora-blob-1" />
      <div className="aurora-blob aurora-blob-2" />
      <div className="aurora-blob aurora-blob-3" />
      <div className="aurora-blob aurora-blob-4" />
      <div className="aurora-ribbon" />
      <div className="aurora-vignette" />
      <div className="aurora-grain" />
    </div>
  );
}
