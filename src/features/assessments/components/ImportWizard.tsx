import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Download, ChevronRight, AlertTriangle, Info, XCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { toast } from "../../../shared/toastStore";
import { toAppError } from "../../../shared/errors";
import { locale } from "../../../content/locale/es-BO";
import { useActor } from "../../access";
import { createAssessment } from "../store";
import {
  detectExtension,
  parseWorkbook,
  type ParsedWorkbook,
  type SupportedExtension,
} from "../imports/parser";
import {
  buildRows,
  detectMapping,
  rowsToSections,
  standardTemplateCsv,
  STANDARD_COLUMNS,
  validateRows,
  type ImportRowData,
  type StandardColumn,
} from "../imports/mapping";

/** Maximum file / row limits (security + performance). */
const MAX_SIZE_MB = 5;
const MAX_ROWS = 2000;

type Step = "select" | "sheet" | "map" | "preview" | "done";

/**
 * The import wizard: select file → choose sheet → map columns → preview +
 * validate → convert to a draft. Nothing is published on import (a draft is
 * always created, to be reviewed and published separately).
 */
export function ImportWizard({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (id: string) => void }) {
  const actor = useActor();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("select");
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<StandardColumn, number>>({} as Record<StandardColumn, number>);
  const [rows, setRows] = useState<ImportRowData[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const sheet = workbook?.sheets[sheetIndex];
  const headers = sheet?.rows[0] ?? [];
  const report = useMemo(() => validateRows(rows), [rows]);

  const reset = () => {
    setStep("select");
    setWorkbook(null);
    setSheetIndex(0);
    setRows([]);
    setFileName("");
  };

  const handleFile = async (file: File) => {
    const ext = detectExtension(file.name);
    if (!ext) {
      toast.error(locale.importer.invalidExtension);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(locale.importer.tooLarge);
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const text = ext === "csv" || ext === "tsv" ? new TextDecoder().decode(buffer) : undefined;
      const wb = parseWorkbook(ext as SupportedExtension, buffer, text);
      if (wb.sheets.length === 0 || wb.sheets.every((s) => s.rows.length === 0)) {
        toast.error(locale.importer.noRows);
        return;
      }
      const totalRows = wb.sheets.reduce((n, s) => n + s.rows.length, 0);
      if (totalRows > MAX_ROWS) {
        toast.error(locale.importer.tooManyRows);
        return;
      }
      setWorkbook(wb);
      setSheetIndex(0);
      setStep(wb.sheets.length > 1 ? "sheet" : "map");
      if (wb.sheets.length === 1) prepareMapping(wb, 0);
    } catch (err) {
      toast.error(toAppError(err, "parse").message);
    } finally {
      setBusy(false);
    }
  };

  const prepareMapping = (wb: ParsedWorkbook, idx: number) => {
    const s = wb.sheets[idx];
    const detected = detectMapping(s.rows[0] ?? []);
    setMapping(detected);
    setRows(buildRows(s.rows.slice(1), detected));
  };

  const goToPreview = () => {
    if (sheet) setRows(buildRows(sheet.rows.slice(1), mapping));
    setStep("preview");
  };

  const convert = async () => {
    setBusy(true);
    try {
      const { name, code, sections } = rowsToSections(rows);
      const created = await createAssessment({ name, code, sections, category: "questionnaire", tags: ["importada"] }, actor);
      toast.success(locale.feedback.importDone);
      setStep("done");
      onImported(created.id);
    } catch (err) {
      toast.error(toAppError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    // CSV injection guard: fields starting with = + - @ are quoted by the
    // generator; here the template is static and safe.
    const blob = new Blob([standardTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_evaluacion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onRequestClose={() => {
        reset();
        onClose();
      }}
      size="max-w-4xl"
      ariaLabel={locale.importer.title}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-ink">{locale.importer.title}</h2>
          <Stepper step={step} />
        </div>

        {step === "select" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[color:var(--hairline)] py-12 text-center transition-colors hover:border-cyan-400/40"
            >
              {busy ? <Loader2 className="h-10 w-10 animate-spin text-cyan-300" /> : <Upload className="h-10 w-10 text-ink-soft" />}
              <span className="text-sm font-semibold text-ink">{locale.importer.dropHint}</span>
              <span className="text-xs text-ink-faint">Máx. {MAX_SIZE_MB} MB · {MAX_ROWS} filas</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.ods,.tsv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-full fill-soft px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
            >
              <Download className="h-4 w-4" /> {locale.importer.downloadTemplate}
            </button>
          </div>
        )}

        {step === "sheet" && workbook && (
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">Selecciona la hoja a importar:</p>
            {workbook.sheets.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setSheetIndex(i);
                  prepareMapping(workbook, i);
                  setStep("map");
                }}
                className="flex w-full items-center gap-3 rounded-2xl fill-soft px-4 py-3 text-left ring-1 ring-[color:var(--hairline)] hover:ring-cyan-400/40"
              >
                <FileSpreadsheet className="h-5 w-5 text-ink-soft" />
                <span className="flex-1 text-sm font-semibold text-ink">{s.name}</span>
                <span className="text-xs text-ink-faint">{Math.max(0, s.rows.length - 1)} filas</span>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </button>
            ))}
          </div>
        )}

        {step === "map" && sheet && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              Confirma la correspondencia de columnas. Detectamos automáticamente los encabezados; puedes ajustarlos.
            </p>
            <div className="max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
              {STANDARD_COLUMNS.map((col) => (
                <div key={col} className="flex items-center gap-3 rounded-xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]">
                  <span className="w-44 shrink-0 font-mono text-xs text-ink-soft">{col}</span>
                  <select
                    value={mapping[col] ?? -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [col]: Number(e.target.value) }))}
                    className="flex-1 rounded-lg fill-softer px-2 py-1.5 text-sm text-ink ring-1 ring-[color:var(--hairline)]"
                  >
                    <option value={-1}>— sin asignar —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Columna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={goToPreview}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white ring-1 ring-white/30"
              >
                {locale.common.next}
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge icon={XCircle} tone="error" label={`${report.errorCount} ${locale.importer.errors}`} />
              <Badge icon={AlertTriangle} tone="warning" label={`${report.warningCount} ${locale.importer.warnings}`} />
              <Badge icon={Info} tone="info" label={`${report.infoCount} ${locale.importer.info}`} />
              <span className="ml-auto text-xs text-ink-faint">
                {rows.filter((r) => !r.excluded).length} / {rows.length} filas activas
              </span>
            </div>

            {report.issues.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
                {report.issues.slice(0, 50).map((issue, i) => (
                  <p key={i} className="text-xs">
                    <span className={issue.severity === "error" ? "text-rose-400" : issue.severity === "warning" ? "text-amber-300" : "text-cyan-300"}>
                      [Fila {issue.row} · {issue.column}]
                    </span>{" "}
                    <span className="text-ink-soft">{issue.problem}</span>
                    {issue.suggestion && <span className="text-ink-faint"> → {issue.suggestion}</span>}
                  </p>
                ))}
              </div>
            )}

            <div className="max-h-[35vh] overflow-auto rounded-2xl ring-1 ring-[color:var(--hairline)]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[color:var(--glass-bg-heavy)] text-ink-soft backdrop-blur-xl">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Incluir</th>
                    <th className="px-2 py-1.5 text-left">Sección</th>
                    <th className="px-2 py-1.5 text-left">Pregunta</th>
                    <th className="px-2 py-1.5 text-left">Tipo</th>
                    <th className="px-2 py-1.5 text-left">Opciones</th>
                    <th className="px-2 py-1.5 text-left">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.index} className={`border-t border-[color:var(--hairline)] ${r.excluded ? "opacity-40" : ""}`}>
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={!r.excluded}
                          onChange={() =>
                            setRows((prev) => prev.map((x) => (x.index === r.index ? { ...x, excluded: !x.excluded } : x)))
                          }
                          className="h-4 w-4 accent-cyan-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-ink-soft">{r.cells.section}</td>
                      <td className="px-2 py-1.5 text-ink">{r.cells.question_text}</td>
                      <td className="px-2 py-1.5 text-ink-soft">{r.cells.question_type}</td>
                      <td className="px-2 py-1.5 text-ink-faint">{r.cells.options}</td>
                      <td className="px-2 py-1.5 text-ink-soft">{r.cells.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[0.7rem] text-ink-faint">{locale.importer.convertHint}</p>
            <div className="flex justify-between">
              <button type="button" onClick={() => setStep("map")} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink">
                {locale.common.previous}
              </button>
              <button
                type="button"
                onClick={convert}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white ring-1 ring-white/30 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Convertir en borrador
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
            <p className="text-sm font-semibold text-ink">{fileName} se importó como borrador.</p>
            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className="rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white ring-1 ring-white/30"
            >
              {locale.common.finish}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Step[] = ["select", "sheet", "map", "preview"];
  const current = steps.indexOf(step === "done" ? "preview" : step);
  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      {steps.map((s, i) => (
        <span key={s} className={`h-1.5 w-6 rounded-full ${i <= current ? "bg-cyan-400" : "bg-[color:var(--fill-2)]"}`} />
      ))}
    </div>
  );
}

function Badge({ icon: Icon, tone, label }: { icon: typeof Info; tone: "error" | "warning" | "info"; label: string }) {
  const cls =
    tone === "error"
      ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
      : tone === "warning"
        ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
        : "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}
