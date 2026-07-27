import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { L, formatDateTime, formatNumber } from "../../../content/locale";
import { GlassDrawer } from "../../../design-system/liquid-glass/GlassDrawer";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { useAsyncResult } from "../../../shared/useAsyncResult";
import { getAttemptDetail, listAssessmentResults } from "../application/assessmentService";
import { GRADING_STATUS_META, type Attempt, type GradingStatus } from "../domain/attempts";

interface ResultsPanelProps {
  assessmentId: string;
  assessmentName: string;
  open: boolean;
  onClose: () => void;
}

function score(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value)}`;
}

/**
 * Panel de resultados de una evaluación.
 *
 * Solo lectura: las notas las calcula el servidor y este panel las muestra. Los
 * agregados que no se pueden calcular (promedio sin intentos calificados, tasa de
 * aprobación sin nota mínima) se muestran como «—», nunca como cero.
 */
export function ResultsPanel({ assessmentId, assessmentName, open, onClose }: ResultsPanelProps) {
  const { data, loading, error, reload } = useAsyncResult(
    () => listAssessmentResults(assessmentId),
    [assessmentId, open],
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <GlassDrawer
      open={open}
      onClose={onClose}
      title={
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-lg font-black text-ink">{L.assessments.results.title}</span>
          <span className="truncate text-xs font-normal text-ink-faint">{assessmentName}</span>
        </span>
      }
      widthClass="max-w-2xl"
      ariaLabel={`${L.assessments.results.title}: ${assessmentName}`}
    >
      {loading && !data ? (
        <p className="flex items-center gap-2 py-8 text-sm text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> {L.common.loading}
        </p>
      ) : error ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            {error}
          </p>
          <button
            type="button"
            onClick={reload}
            className="rounded-full fill-softer px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] hover:fill-soft"
          >
            {L.common.retry}
          </button>
        </div>
      ) : !data || data.attempts.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-2xl fill-soft px-4 py-3 text-sm text-ink-soft ring-1 ring-[color:var(--hairline)]">
            {L.assessments.results.empty}
          </p>
          <p className="text-xs text-ink-faint">{L.assessments.results.needsBackend}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label={L.assessments.results.summary.total} value={String(data.summary.total)} />
            <Tile label={L.assessments.results.summary.graded} value={String(data.summary.graded)} />
            <Tile
              label={L.assessments.results.summary.pending}
              value={String(data.summary.pendingManualReview)}
            />
            <Tile label={L.assessments.results.summary.average} value={score(data.summary.averageScore)} />
            <Tile
              label={L.assessments.results.summary.passRate}
              value={data.summary.passRate === null ? "—" : `${formatNumber(data.summary.passRate)} %`}
            />
          </dl>

          {data.summary.pendingManualReview > 0 && (
            <p className="rounded-2xl bg-amber-500/10 px-4 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20">
              {L.assessments.results.pendingHint}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {data.attempts.map((attempt) => (
              <AttemptRow
                key={attempt.id}
                attempt={attempt}
                expanded={expanded === attempt.id}
                onToggle={() => setExpanded(expanded === attempt.id ? null : attempt.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </GlassDrawer>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
      <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-lg font-black tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function AttemptRow({
  attempt,
  expanded,
  onToggle,
}: {
  attempt: Attempt;
  expanded: boolean;
  onToggle: () => void;
}) {
  const grading = GRADING_STATUS_META[attempt.gradingStatus as GradingStatus];
  return (
    <li className="rounded-2xl fill-soft ring-1 ring-[color:var(--hairline)]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {attempt.participantName || attempt.participantEmail || "Participante anónimo"}
          </span>
          <span className="block text-xs text-ink-faint">
            {L.assessments.results.columns.submitted}: {formatDateTime(attempt.submittedAt)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-black tabular-nums text-ink">{score(attempt.score)}</span>
          <span className="block text-[0.65rem] text-ink-faint">
            {attempt.correctAnswers}/{attempt.gradableQuestions}
          </span>
        </span>
        <StatusPill intent={grading.intent}>{grading.label}</StatusPill>
        {attempt.passed !== null && (
          <StatusPill intent={attempt.passed ? "success" : "danger"}>
            {attempt.passed ? "Aprobado" : "No aprobado"}
          </StatusPill>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <AttemptAnswers attemptId={attempt.id} />}
    </li>
  );
}

function AttemptAnswers({ attemptId }: { attemptId: string }) {
  const { data, loading, error } = useAsyncResult(() => getAttemptDetail(attemptId), [attemptId]);
  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 border-t border-[color:var(--hairline)] px-4 py-3 text-xs text-ink-soft">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {L.common.loading}
      </p>
    );
  }
  if (error || !data) {
    return (
      <p className="border-t border-[color:var(--hairline)] px-4 py-3 text-xs text-ink-faint">
        {error ?? L.common.genericError}
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1.5 border-t border-[color:var(--hairline)] px-4 py-3">
      {data.answers.map((answer) => (
        <li key={answer.id} className="flex flex-wrap items-baseline gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-ink-soft">{answer.questionText || answer.questionId}</span>
          <span className="text-ink">{answer.selectedOptionText || String(answer.value ?? "—")}</span>
          {answer.requiresManualReview ? (
            <StatusPill intent="warning">Revisión</StatusPill>
          ) : (
            <StatusPill intent={answer.isCorrect ? "success" : "danger"}>
              {answer.isCorrect ? "Correcta" : "Incorrecta"}
            </StatusPill>
          )}
        </li>
      ))}
    </ol>
  );
}
