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

const STYLE_ID = "bdp-print-page-style";
const HEADER_ID = "bdp-print-header";

export function printModule(
  title: string,
  paper: PaperSize = "Letter",
  orientation: PaperOrientation = "portrait",
): void {
  if (typeof window === "undefined") return;

  // 1 · Paper size + margins.
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `@media print { @page { size: ${paper} ${orientation}; margin: 14mm; } }`;
  document.head.appendChild(style);

  // 2 · Report banner (print-only).
  document.getElementById(HEADER_ID)?.remove();
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
    style.remove();
    header.remove();
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
