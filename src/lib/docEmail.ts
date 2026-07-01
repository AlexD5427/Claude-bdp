import type { Dossier, DocSettings } from "./docStore";
import type { DossierReport } from "./docReport";

/**
 * Reminder-email composition.
 *
 * The frontend can't send email on its own, so it does two things: (1) it builds
 * a fully-editable draft (recipient, CC, subject, body) from the configured
 * templates, and (2) it opens the operator's chosen webmail (Gmail/Outlook) with
 * that draft pre-filled, or falls back to a `mailto:` link. The unattended
 * "every 3 days" delivery is handled server-side by the Apps Script trigger
 * (see docs/backend); this keeps the human-in-the-loop panel fully functional.
 */

export interface EmailDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

/** Render the list of still-owed documents as a bulleted block. */
export function faltantesText(report: DossierReport): string {
  if (report.faltantes.length === 0) return "• (Ninguno — documentación completa)";
  return report.faltantes
    .map((i) => {
      const extra = i.status === "observado" ? " (con observación)" : "";
      const pr = i.prorroga
        ? ` [prórroga: ${new Date(i.prorroga).toLocaleDateString("es-BO")}]`
        : "";
      return `• ${i.label}${extra}${pr}`;
    })
    .join("\n");
}

function fill(template: string, dossier: Dossier, report: DossierReport): string {
  const map: Record<string, string> = {
    nombre: dossier.nombre || "postulante",
    cargo: dossier.cargo || "(cargo por definir)",
    agencia: dossier.agencia || "",
    gerencia: dossier.gerencia || "",
    identificador: dossier.identificador,
    faltantes: faltantesText(report),
    dias: report.daysSince === null ? "—" : String(report.daysSince),
    fecha_ingreso: dossier.fechaIngreso
      ? new Date(dossier.fechaIngreso).toLocaleDateString("es-BO")
      : "—",
    total: String(report.applicable),
    presentados: String(report.presentados),
    faltan: String(report.faltantes.length),
    avance: `${report.completionPct}%`,
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in map ? map[key] : `{${key}}`,
  );
}

/** Build the editable draft from settings + dossier + report. */
export function buildEmailDraft(
  dossier: Dossier,
  settings: DocSettings,
  report: DossierReport,
): EmailDraft {
  return {
    to: dossier.correo,
    cc: settings.ccEmail,
    subject: fill(settings.subjectTemplate, dossier, report),
    body: fill(settings.bodyTemplate, dossier, report),
  };
}

/**
 * Build a compose URL for the configured provider, falling back to `mailto:`.
 * Opening this link lets the operator review and send from their own account.
 */
export function composeUrl(settings: DocSettings, draft: EmailDraft): string {
  const to = encodeURIComponent(draft.to);
  const cc = encodeURIComponent(draft.cc);
  const su = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(draft.body);

  if (settings.provider === "gmail") {
    const auth = settings.fromAccount
      ? `&authuser=${encodeURIComponent(settings.fromAccount)}`
      : "";
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&cc=${cc}&su=${su}&body=${body}${auth}`;
  }
  if (settings.provider === "outlook") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${to}&cc=${cc}&subject=${su}&body=${body}`;
  }
  return `mailto:${to}?cc=${cc}&subject=${su}&body=${body}`;
}

/** A universal mailto link (works with any installed desktop client). */
export function mailtoUrl(draft: EmailDraft): string {
  const cc = draft.cc ? `cc=${encodeURIComponent(draft.cc)}&` : "";
  return `mailto:${encodeURIComponent(draft.to)}?${cc}subject=${encodeURIComponent(
    draft.subject,
  )}&body=${encodeURIComponent(draft.body)}`;
}
