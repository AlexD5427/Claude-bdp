/**
 * Iconos propios del modulo de Documentacion.
 *
 * Van incluidos en el proyecto como SVG en linea: no hay peticiones a imagenes
 * externas, heredan el color con `currentColor` y son decorativos
 * (`aria-hidden`), porque el significado siempre viaja en el texto contiguo.
 * Al no venir de una libreria de iconos no hay riesgo de inyeccion ni peso
 * extra en el bundle.
 */

export interface IconoProps {
  className?: string;
}

const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/* ---------------------------------------------------------------- */
/* Tipos de funcionario                                             */
/* ---------------------------------------------------------------- */

/** Comercial: mostrador con toldo y moneda. */
export function IconoComercial({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 8.5 4.8 4.5h14.4L21 8.5" />
      <path d="M3 8.5h18" />
      <path d="M5 8.5v11h14v-11" />
      <path d="M9.5 19.5v-5h5v5" />
      <circle cx="12" cy="11.75" r="0.9" />
    </svg>
  );
}

/** Auditoria: documento con lupa de revision. */
export function IconoAuditoria({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M14.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7.5Z" />
      <path d="M14.5 3v4.5H19" />
      <circle cx="11" cy="13" r="2.75" />
      <path d="m13.1 15.1 2.15 2.15" />
    </svg>
  );
}

/** Cumplimiento: escudo con verificacion. */
export function IconoCumplimiento({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 3 5 5.75v5.4c0 4.3 2.85 7.7 7 9.85 4.15-2.15 7-5.55 7-9.85v-5.4Z" />
      <path d="m9 12 2.25 2.25L15.5 10" />
    </svg>
  );
}

/** Ejecutivo o Directorio: sede institucional con columnas. */
export function IconoEjecutivo({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3.5 9.5 12 4.5l8.5 5" />
      <path d="M4.5 9.5v10h15v-10" />
      <path d="M8 19.5v-6M12 19.5v-6M16 19.5v-6" />
      <path d="M3 19.5h18" />
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/* Estados documentales                                             */
/* ---------------------------------------------------------------- */

/** ENTREGADO. */
export function IconoCheck({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.25 2.4 2.4 4.6-4.9" />
    </svg>
  );
}

/** PENDIENTE. */
export function IconoReloj({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.75V12l3 1.75" />
    </svg>
  );
}

/** NO ENTREGADO. */
export function IconoEquis({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.25 9.25 5.5 5.5M14.75 9.25l-5.5 5.5" />
    </svg>
  );
}

/** N/A: no aplica. */
export function IconoGuion({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7" />
    </svg>
  );
}

/* ---------------------------------------------------------------- */
/* Utilitarios                                                      */
/* ---------------------------------------------------------------- */

export function IconoAlerta({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 4.5 2.75 20h18.5Z" />
      <path d="M12 10v4.25" />
      <path d="M12 17.25h.01" />
    </svg>
  );
}

export function IconoCalendario({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

export function IconoMas({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

export function IconoPapelera({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4.5 7h15M9.5 7V4.75h5V7" />
      <path d="M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10.5 11v6M13.5 11v6" />
    </svg>
  );
}

export function IconoFlechaIzquierda({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

export function IconoFlechaDerecha({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </svg>
  );
}

export function IconoGuardar({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M5 4.5h11L19.5 8v11.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 5Z" />
      <path d="M8 4.5v5h7" />
      <path d="M8 21v-6h8v6" />
    </svg>
  );
}

export function IconoDescargar({ className }: IconoProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 4v10.5" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}
