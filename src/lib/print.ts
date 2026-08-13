/**
 * Institutional print controller.
 *
 * Browsers can't change `@page { size }` at runtime through the CSSOM in a
 * portable way, so we inject a tiny stylesheet just before printing (and tear
 * it down afterwards). A print-only banner is prepended to the document so
 * every printout carries the BDP heading, the module name and a timestamp.
 */
export type PaperSize = "Letter" | "Legal";
export type PaperOrientation = "portrait" | "landscape";

export interface PrintOptions {
  /**
   * A named print scope. When set, `bdp-scope-<scope>` is toggled on <body>
   * for the duration of the print, so scope-specific print CSS can hide the
   * on-screen chrome (brand header, KPI bar, module title) and keep only the
   * relevant region — e.g. the comparator prints from the profile chips down.
   */
  scope?: string;
}

const STYLE_ID = "bdp-print-page-style";
const HEADER_ID = "bdp-print-header";
/** Marca que acompaña a cualquier clase `bdp-scope-*` mientras se imprime. */
const SCOPED_CLASS = "bdp-print-scoped";

/**
 * Borra los restos de una impresión anterior.
 *
 * La limpieza colgaba **sólo** de `afterprint`, y ese evento no siempre llega:
 * hay navegadores que no lo emiten al cancelar el diálogo, y entornos donde la
 * impresión está intervenida por política. Cuando no llegaba, la clase de ámbito
 * se quedaba pegada al `<body>`. En pantalla no se nota —esas reglas viven dentro
 * de `@media print`—, pero **la impresión siguiente heredaba el ámbito
 * equivocado**: imprimir la Lista de Postulantes después de la comparativa salía
 * sin encabezado institucional y con las reglas de la cuadrícula.
 *
 * Por eso cada impresión empieza por limpiar: no depende de que el navegador
 * avise.
 */
function clearPrintArtifacts(): void {
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(HEADER_ID)?.remove();
  const stale = [...document.body.classList].filter(
    (c) => c === SCOPED_CLASS || c.startsWith("bdp-scope-"),
  );
  if (stale.length) document.body.classList.remove(...stale);
}

export function printModule(
  title: string,
  paper: PaperSize = "Letter",
  orientation: PaperOrientation = "portrait",
  options: PrintOptions = {},
): void {
  if (typeof window === "undefined") return;

  // 0 · Empezar en limpio (ver `clearPrintArtifacts`) y aplicar el ámbito, que
  //     permite a cada módulo recortar lo que sale en papel.
  clearPrintArtifacts();
  const scopeClass = options.scope ? `bdp-scope-${options.scope}` : "";
  if (scopeClass) document.body.classList.add(SCOPED_CLASS, scopeClass);

  // 1 · Paper size + margins.
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `@media print { @page { size: ${paper} ${orientation}; margin: 14mm; } }`;
  document.head.appendChild(style);

  // 2 · Report banner (print-only).
  const header = document.createElement("div");
  header.id = HEADER_ID;
  header.className = "bdp-print-header no-screen";
  const now = new Date().toLocaleString("es-BO", {
    dateStyle: "long",
    timeStyle: "short",
  });
  header.innerHTML = `
    <div class="bdp-print-brand">
      <span class="bdp-print-logo">BDP</span>
      <div>
        <div class="bdp-print-title">${escapeHtml(title)}</div>
        <div class="bdp-print-sub">Banco · Evaluación de Talento — Reporte generado el ${escapeHtml(now)}</div>
      </div>
    </div>`;
  document.body.prepend(header);

  const cleanup = () => {
    clearPrintArtifacts();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Defer so the freshly-injected banner is laid out before the dialog opens.
  window.setTimeout(() => window.print(), 60);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
