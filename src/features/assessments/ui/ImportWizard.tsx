import { useState } from "react";
import { UploadCloud, FileWarning, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { L } from "../../../content/locale";
import { Modal } from "../../../components/Modal";
import { toast } from "../../../design-system/liquid-glass/toast";
import { Select } from "../../../design-system/liquid-glass/fields";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { parseWorkbook, type ParsedWorkbook, type ParsedWorksheet, ImportError } from "../imports/parse";
import { autoMapColumns, convertRows, STANDARD_COLUMNS, type MappedRow, type StandardColumn } from "../imports/convert";
import type { AssessmentDefinition } from "../domain/assessment";
import type { ImportIssue } from "../domain/entities";

interface WizardProps {
  onClose: () => void;
  onDraftReady: (draft: AssessmentDefinition) => void;
  by: string;
}

type Step = "select" | "worksheet" | "map" | "review";

/** The spreadsheet import wizard (.xlsx/.csv/.ods → reviewable draft). */
export function ImportWizard({ onClose, onDraftReady, by }: WizardProps) {
  const [step, setStep] = useState<Step>("select");
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [worksheet, setWorksheet] = useState<ParsedWorksheet | null>(null);
  const [mapping, setMapping] = useState<Record<number, StandardColumn | null>>({});
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState<AssessmentDefinition | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = worksheet?.rows[0] ?? [];
  const bodyRows = worksheet?.rows.slice(1) ?? [];

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const wb = await parseWorkbook(file.name, bytes);
      setWorkbook(wb);
      if (wb.worksheets.length === 1) {
        selectWorksheet(wb.worksheets[0]);
      } else {
        setStep("worksheet");
      }
    } catch (e) {
      toast.error(e instanceof ImportError ? e.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const selectWorksheet = (ws: ParsedWorksheet) => {
    setWorksheet(ws);
    setMapping(autoMapColumns(ws.rows[0] ?? []));
    setStep("map");
  };

  const buildRows = (): MappedRow[] =>
    bodyRows.map((cells, r) => {
      const values: MappedRow["values"] = {};
      cells.forEach((c, i) => {
        const col = mapping[i];
        if (col) values[col] = c;
      });
      return { index: r + 2, values };
    });

  const validate = () => {
    const result = convertRows(buildRows(), by, excluded);
    setIssues(result.issues);
    setDraft(result.draft);
    setStep("review");
  };

  const toggleExclude = (row: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
    // Re-run conversion with the updated exclusion set.
    const nextExcluded = new Set(excluded);
    if (nextExcluded.has(row)) nextExcluded.delete(row);
    else nextExcluded.add(row);
    const result = convertRows(buildRows(), by, nextExcluded);
    setIssues(result.issues);
    setDraft(result.draft);
  };

  const createDraft = () => {
    if (!draft) {
      toast.warning("No hay filas válidas para crear la evaluación.");
      return;
    }
    onDraftReady(draft);
  };

  return (
    <Modal open onRequestClose={onClose} size="max-w-3xl" ariaLabel={L.import.title}>
      <div className="p-6">
        <h2 className="text-xl font-black text-ink">{L.import.title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{L.import.subtitle}</p>

        {/* Stepper */}
        <ol className="mt-4 flex flex-wrap gap-2 text-xs">
          {(["select", "worksheet", "map", "review"] as Step[]).map((s, i) => (
            <li key={s} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${step === s ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/40" : "fill-soft text-ink-faint"}`}>
              <span className="grid h-4 w-4 place-items-center rounded-full bg-white/10 text-[0.6rem]">{i + 1}</span>
              {s === "select" ? L.import.steps.select : s === "worksheet" ? L.import.steps.worksheet : s === "map" ? L.import.steps.map : L.import.steps.review}
            </li>
          ))}
        </ol>

        <div className="mt-5">
          {step === "select" && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-[color:var(--hairline)] py-12 text-center transition-colors hover:border-cyan-400/50">
              <UploadCloud className="h-10 w-10 text-cyan-300" />
              <span className="text-sm font-semibold text-ink">{L.import.dropzone}</span>
              <span className="text-xs text-ink-faint">{L.import.accepted}</span>
              <input
                type="file"
                accept=".xlsx,.csv,.ods"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              {busy && <span className="text-xs text-ink-faint">{L.common.loading}</span>}
            </label>
          )}

          {step === "worksheet" && workbook && (
            <div>
              <p className="mb-2 text-sm text-ink-soft">{L.import.selectWorksheet}</p>
              <ul className="flex flex-col gap-2">
                {workbook.worksheets.map((ws) => (
                  <li key={ws.name}>
                    <button type="button" onClick={() => selectWorksheet(ws)} className="flex w-full items-center justify-between rounded-2xl fill-soft px-4 py-3 text-left text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-softer">
                      {ws.name}
                      <span className="text-xs text-ink-faint">{Math.max(0, ws.rows.length - 1)} filas</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === "map" && worksheet && (
            <div>
              <p className="mb-3 text-sm text-ink-soft">{L.import.mapColumns}</p>
              <div className="max-h-72 overflow-y-auto rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
                <ul className="flex flex-col gap-2">
                  {headers.map((h, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-sm font-semibold text-ink" title={h}>{h || `Columna ${i + 1}`}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                      <Select
                        value={mapping[i] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [i]: (e.target.value || null) as StandardColumn | null }))}
                        className="flex-1"
                      >
                        <option value="">— {L.common.none} —</option>
                        {STANDARD_COLUMNS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </li>
                  ))}
                </ul>
              </div>
              <PreviewTable headers={headers} rows={bodyRows.slice(0, 5)} />
            </div>
          )}

          {step === "review" && (
            <div>
              {issues.length === 0 ? (
                <p className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                  <CheckCircle2 className="h-4 w-4" /> {L.import.noIssues}
                </p>
              ) : (
                <div>
                  <p className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-ink">
                    <FileWarning className="h-4 w-4 text-amber-300" /> {L.import.issuesTitle} ({issues.length})
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-2xl fill-soft ring-1 ring-[color:var(--hairline)]">
                    <table className="w-full text-left text-xs">
                      <thead className="text-ink-faint">
                        <tr>
                          <th className="px-3 py-2">{L.import.columns.severity}</th>
                          <th className="px-3 py-2">{L.import.columns.row}</th>
                          <th className="px-3 py-2">{L.import.columns.column}</th>
                          <th className="px-3 py-2">{L.import.columns.problem}</th>
                          <th className="px-3 py-2">{L.import.columns.suggestion}</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {issues.map((iss) => (
                          <tr key={iss.id} className="border-t border-[color:var(--hairline)]">
                            <td className="px-3 py-2">
                              <StatusPill intent={iss.severity === "error" ? "danger" : iss.severity === "warning" ? "warning" : "info"}>
                                {L.import.issueSeverity[iss.severity]}
                              </StatusPill>
                            </td>
                            <td className="px-3 py-2 tabular-nums text-ink-soft">{iss.row ?? "—"}</td>
                            <td className="px-3 py-2 text-ink-soft">{iss.column}</td>
                            <td className="px-3 py-2 text-ink">{iss.problem}</td>
                            <td className="px-3 py-2 text-ink-faint">{iss.suggestion || "—"}</td>
                            <td className="px-3 py-2">
                              {iss.row != null && (
                                <button
                                  type="button"
                                  onClick={() => toggleExclude(iss.row!)}
                                  className="rounded-full fill-softer px-2.5 py-1 text-[0.65rem] font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft"
                                >
                                  {excluded.has(iss.row) ? L.import.includeRow : L.import.excludeRow}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs text-ink-faint">{L.import.convertHint}</p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="rounded-full fill-softer px-4 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
            {L.common.cancel}
          </button>
          <div className="flex items-center gap-2">
            {step === "review" && (
              <button type="button" onClick={() => setStep("map")} className="inline-flex items-center gap-1.5 rounded-full fill-softer px-4 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft">
                <ArrowLeft className="h-4 w-4" /> {L.common.previous}
              </button>
            )}
            {step === "map" && (
              <button type="button" onClick={validate} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30">
                {L.common.next} <ArrowRight className="h-4 w-4" />
              </button>
            )}
            {step === "review" && (
              <button type="button" onClick={createDraft} disabled={!draft} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 disabled:opacity-50">
                {L.import.convertToDraft}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{L.import.previewRows}</p>
      <div className="overflow-x-auto rounded-2xl fill-soft ring-1 ring-[color:var(--hairline)]">
        <table className="w-full text-left text-xs">
          <thead className="text-ink-faint">
            <tr>{headers.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2">{h || `Col ${i + 1}`}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-[color:var(--hairline)]">
                {headers.map((_, ci) => <td key={ci} className="whitespace-nowrap px-3 py-2 text-ink-soft">{r[ci] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
