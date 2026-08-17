/**
 * Esqueletos de carga.
 *
 * ── Por qué no un spinner ───────────────────────────────────────────────────
 * Un spinner centrado dice «espera» y nada más. Un esqueleto con la forma del
 * contenido dice «va a haber una tabla de seis columnas aquí», y cuando llegan
 * los datos la página no salta: el hueco ya estaba reservado. El salto de layout
 * es la causa del clic que aterriza en el botón equivocado.
 *
 * Todos son decorativos: llevan `aria-hidden` y quien los usa anuncia el estado
 * con un `role="status"` propio. Un lector de pantalla no debe leer catorce
 * rectángulos.
 */

export function EsqueletoLineas({ filas = 3, alto = "h-4" }: { filas?: number; alto?: string }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className={`doc-skeleton ${alto}`} style={{ width: `${100 - i * 8}%` }} />
      ))}
    </div>
  );
}

/** Rejilla de indicadores, con la misma proporción que las tarjetas reales. */
export function EsqueletoIndicadores({ total = 8 }: { total?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="doc-surface p-3.5">
          <div className="doc-skeleton h-3 w-24" />
          <div className="doc-skeleton mt-3 h-7 w-16" />
          <div className="doc-skeleton mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto de tabla: encabezado real y filas fantasma.
 *
 * Se pinta el número de columnas que la tabla va a tener para que el ancho no
 * cambie al llegar los datos.
 */
export function EsqueletoTabla({ filas = 6, columnas = 6 }: { filas?: number; columnas?: number }) {
  return (
    <div aria-hidden>
      <div className="hidden md:block">
        <div className="flex gap-3 border-b border-[color:var(--doc-border)] pb-2">
          {Array.from({ length: columnas }).map((_, i) => (
            <div key={i} className="doc-skeleton h-3 flex-1" />
          ))}
        </div>
        <div className="doc-list-long">
          {Array.from({ length: filas }).map((_, f) => (
            <div key={f} className="flex items-center gap-3 border-b border-[color:var(--doc-border)] py-3">
              {Array.from({ length: columnas }).map((_, c) => (
                <div key={c} className="doc-skeleton h-4 flex-1" style={{ opacity: 1 - f * 0.08 }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* En móvil la tabla es una lista de tarjetas: el esqueleto también. */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: Math.min(filas, 4) }).map((_, f) => (
          <div key={f} className="doc-surface p-3">
            <div className="doc-skeleton h-4 w-2/3" />
            <div className="doc-skeleton mt-2 h-3 w-1/3" />
            <div className="doc-skeleton mt-3 h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Esqueleto del expediente: cabecera, pestañas y dos bloques de requisitos. */
export function EsqueletoExpediente() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="doc-raised p-4">
        <div className="doc-skeleton h-4 w-32" />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="doc-skeleton h-2.5 w-16" />
              <div className="doc-skeleton mt-1.5 h-3.5 w-full" />
            </div>
          ))}
        </div>
        <div className="doc-skeleton mt-4 h-2 w-full" />
      </div>

      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="doc-skeleton h-7 w-24" />
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, bloque) => (
        <div key={bloque} className="doc-surface p-4">
          <div className="doc-skeleton h-3.5 w-40" />
          <div className="mt-3 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="doc-skeleton h-4 flex-1" />
                <div className="doc-skeleton h-6 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de la bandeja de atención: cinco filas priorizadas. */
export function EsqueletoBandeja({ filas = 5 }: { filas?: number }) {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: filas }).map((_, i) => (
        <li key={i} className="doc-surface flex items-center gap-3 p-3">
          <div className="doc-skeleton h-8 w-1" />
          <div className="min-w-0 flex-1">
            <div className="doc-skeleton h-3.5 w-1/2" />
            <div className="doc-skeleton mt-1.5 h-2.5 w-1/3" />
          </div>
          <div className="doc-skeleton h-6 w-20" />
        </li>
      ))}
    </ul>
  );
}
