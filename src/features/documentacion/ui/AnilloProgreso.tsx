/**
 * Anillo de progreso.
 *
 * ── Por qué un anillo y no una barra ────────────────────────────────────────
 * Porque va en la cabecera, junto a la identidad de la persona, y ahí no hay
 * ancho para una barra que se lea. Un anillo de 44 px dice el mismo dato en un
 * cuadrado, deja el número en el centro y no compite con el nombre.
 *
 * ── Cómo se anima, y por qué así ────────────────────────────────────────────
 * Con `stroke-dashoffset`, que el navegador puede interpolar sin recalcular el
 * diseño ni volver a rasterizar el texto de al lado. La alternativa habitual
 * —rotar un semicírculo con `transform`— necesita dos capas, un recorte y un
 * `overflow: hidden`, y en el tema claro deja un borde dentado en las pantallas
 * sin densidad doble.
 *
 * El número del centro NO se anima dígito a dígito a propósito. El anillo ya
 * comunica el movimiento; un contador que sube solo obliga a esperar para leer
 * un dato que ya está, y en una cabecera que se mira de reojo eso molesta.
 *
 * ── Accesibilidad ───────────────────────────────────────────────────────────
 * Es un `progressbar` con su valor y su texto, así que un lector de pantalla
 * anuncia «documentación, 40 %» sin depender de que alguien vea el color. El
 * dibujo entero queda `aria-hidden`: describirlo dos veces es peor que una.
 */

import { useId } from "react";

export function AnilloProgreso({
  valor,
  etiqueta,
  tamano = 46,
  grosor = 4,
  color,
  reducido,
  /** Texto del centro. Por defecto, el porcentaje. */
  centro,
}: {
  /** 0–100. Se acota: un backend que devuelva 120 no debe dibujar dos vueltas. */
  valor: number;
  etiqueta: string;
  tamano?: number;
  grosor?: number;
  color?: string;
  reducido?: boolean;
  centro?: string;
}) {
  const id = useId();
  const pct = Math.max(0, Math.min(100, Math.round(Number.isFinite(valor) ? valor : 0)));
  const radio = (tamano - grosor) / 2;
  const perimetro = 2 * Math.PI * radio;
  const recorrido = (pct / 100) * perimetro;

  return (
    <span
      className="doc-anillo"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${etiqueta}: ${pct} %`}
      style={{ width: tamano, height: tamano }}
    >
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} aria-hidden>
        {/* El degradado da la sensación de avance sin usar dos trazos. */}
        <defs>
          <linearGradient id={`doc-anillo-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color ?? "var(--doc-info)"} />
            <stop offset="100%" stopColor={color ?? "var(--doc-accent)"} />
          </linearGradient>
        </defs>
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke="var(--doc-surface-sunken)"
          strokeWidth={grosor}
        />
        <circle
          className="doc-anillo-arco"
          data-reducido={reducido ? "si" : undefined}
          cx={tamano / 2}
          cy={tamano / 2}
          r={radio}
          fill="none"
          stroke={`url(#doc-anillo-${id})`}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={`${perimetro} ${perimetro}`}
          strokeDashoffset={perimetro - recorrido}
          /* −90° para que el cero esté arriba y no a la derecha. */
          transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}
        />
      </svg>
      <span className="doc-anillo-centro" aria-hidden>
        {centro ?? `${pct}%`}
      </span>
    </span>
  );
}
