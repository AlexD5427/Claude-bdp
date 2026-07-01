import type { Candidate } from "../types";
import { asText } from "./candidates";
import { getRecord } from "./hiringStore";

/**
 * Derive the auto-fillable dossier fields for a candidate. The Google Sheet may
 * not carry every column (agencia/gerencia/correo), so we read them defensively
 * and leave blanks the operator can complete. The join date is taken from the
 * hiring store's `contratadoAt` when the person was marked "Contratado".
 */
export interface DossierAutofill {
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  correo: string;
  fechaIngreso: string; // yyyy-mm-dd
}

function firstText(c: Candidate, keys: string[]): string {
  for (const k of keys) {
    const v = asText((c as Record<string, unknown>)[k]);
    if (v) return v;
  }
  return "";
}

function toDateInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function autofillFromCandidate(c: Candidate): DossierAutofill {
  const rec = getRecord(c.id);
  const ingreso = toDateInput(rec?.contratadoAt) || toDateInput(rec?.firstSeenAt);
  return {
    identificador: c.identificador || c.id,
    nombre: c.fullName,
    cargo: c.cargo_bdp || "",
    agencia: firstText(c, ["agencia", "sucursal", "oficina"]),
    gerencia: firstText(c, ["gerencia", "area", "área", "departamento"]),
    correo: firstText(c, ["correo", "email", "correo_electronico", "e_mail", "mail"]),
    fechaIngreso: ingreso,
  };
}
