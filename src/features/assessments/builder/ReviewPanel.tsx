import { AlertTriangle, CheckCircle2, ChevronRight, Info, ServerCrash } from "lucide-react";
import { L, formatDuration } from "../../../content/locale";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import type { ApiIssue } from "../api/contract";
import type { PublishChecklist, PublishFinding } from "../domain/publish";
import type { BuilderMeta } from "./builderState";

interface ReviewPanelProps {
  checklist: PublishChecklist;
  meta: BuilderMeta;
  publicCode: string;
  versionLabel: string;
  lifecycleLabel: string;
  requiredQuestions: number;
  instructions: string;
  /** Hallazgos que devolvió el servidor al rechazar la publicación. */
  serverIssues: ApiIssue[];
  onGoTo: (finding: PublishFinding) => void;
}

const SEVERITY_META = {
  error: { icon: AlertTriangle, tone: "text-rose-300", intent: "danger" as const, title: L.builder.review.blocking },
  warning: { icon: AlertTriangle, tone: "text-amber-300", intent: "warning" as const, title: L.builder.review.warnings },
  info: { icon: Info, tone: "text-cyan-300", intent: "info" as const, title: L.builder.review.info },
};

/**
 * Panel de revisión previa a la publicación.
 *
 * Organiza los hallazgos por severidad y, dentro de cada grupo, por la pregunta
 * afectada. Cada hallazgo lleva al campo exacto que hay que corregir: es la
 * diferencia entre «hay 7 errores» y «arregla esto, aquí».
 */
export function ReviewPanel({
  checklist,
  meta,
  publicCode,
  versionLabel,
  lifecycleLabel,
  requiredQuestions,
  instructions,
  serverIssues,
  onGoTo,
}: ReviewPanelProps) {
  const groups: { severity: keyof typeof SEVERITY_META; items: PublishFinding[] }[] = [
    { severity: "error", items: checklist.errors },
    { severity: "warning", items: checklist.warnings },
    { severity: "info", items: checklist.info },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <header className="glass rounded-3xl p-5">
          <h3 className="text-sm font-black text-ink">{L.builder.review.title}</h3>
          <p className="mt-0.5 text-xs text-ink-faint">{L.builder.review.subtitle}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill intent={checklist.canPublish ? "success" : "danger"}>
              {checklist.canPublish
                ? L.builder.review.allGood
                : `${checklist.errors.length} ${L.builder.status.errors}`}
            </StatusPill>
            {checklist.warnings.length > 0 && (
              <StatusPill intent="warning">
                {checklist.warnings.length} {L.builder.status.warnings}
              </StatusPill>
            )}
          </div>
        </header>

        {serverIssues.length > 0 && (
          <section className="glass rounded-3xl p-5 ring-1 ring-rose-400/30">
            <h4 className="flex items-center gap-2 text-sm font-black text-rose-200">
              <ServerCrash className="h-4 w-4" /> {L.builder.review.serverIssues}
            </h4>
            <ul className="mt-3 flex flex-col gap-2">
              {serverIssues.map((issue, index) => (
                <li
                  key={`${issue.code}-${index}`}
                  className="rounded-2xl fill-soft px-3 py-2 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]"
                >
                  <span className="font-mono text-[0.65rem] text-ink-faint">{issue.code}</span>
                  <p className="mt-0.5 text-ink">{issue.message}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.map(({ severity, items }) => {
          if (items.length === 0) return null;
          const meta2 = SEVERITY_META[severity];
          const Icon = meta2.icon;
          return (
            <section key={severity} className="glass rounded-3xl p-5">
              <h4 className={`flex items-center gap-2 text-sm font-black ${meta2.tone}`}>
                <Icon className="h-4 w-4" /> {meta2.title}
                <span className="rounded-full fill-softer px-2 text-xs font-bold tabular-nums text-ink-soft">
                  {items.length}
                </span>
              </h4>
              <ul className="mt-3 flex flex-col gap-2">
                {items.map((finding) => (
                  <li key={finding.id}>
                    <button
                      type="button"
                      onClick={() => onGoTo(finding)}
                      className="group flex w-full items-start gap-3 rounded-2xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-softer focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta2.tone}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{finding.message}</span>
                        <span className="mt-0.5 block text-xs text-ink-faint">{finding.hint}</span>
                        <span className="mt-1 block font-mono text-[0.6rem] uppercase text-ink-faint">
                          {finding.code}
                        </span>
                      </span>
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-cyan-300">
                        {L.builder.review.goToField}
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {checklist.findings.length === 0 && (
          <section className="glass flex items-center gap-3 rounded-3xl p-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
            <p className="text-sm font-semibold text-ink">{L.builder.review.allGood}</p>
          </section>
        )}
      </div>

      <aside className="glass h-fit rounded-3xl p-5">
        <h4 className="text-sm font-black text-ink">{L.builder.review.summary}</h4>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <Row label={L.builder.settings.name} value={meta.name || L.builder.untitled} />
          <Row label={L.builder.settings.publicCode} value={publicCode} mono />
          <Row label={L.builder.settings.version} value={versionLabel} />
          <Row label={L.assessments.columns.status} value={lifecycleLabel} />
          <Row
            label={L.builder.settings.duration}
            value={meta.durationMinutes > 0 ? formatDuration(meta.durationMinutes) : L.builder.settings.noTimeLimit}
          />
          <Row
            label={L.builder.settings.passingScore}
            value={meta.passingScore === null ? L.builder.settings.noPassingScore : `${meta.passingScore}`}
          />
          <Row label={L.builder.review.questionsTotal} value={String(checklist.questionCount)} />
          <Row label={L.builder.review.questionsValid} value={String(checklist.validQuestions)} />
          <Row label={L.builder.review.questionsIncomplete} value={String(checklist.incompleteQuestions)} />
          <Row label={L.builder.review.requiredQuestions} value={String(requiredQuestions)} />
          <Row label={L.builder.review.questionsAuto} value={String(checklist.autoGradableQuestions)} />
          <Row label={L.builder.review.questionsManual} value={String(checklist.manualReviewQuestions)} />
          <Row
            label={L.builder.settings.instructions}
            value={instructions.trim() ? `${instructions.trim().slice(0, 60)}…` : L.common.none}
          />
        </dl>

        {checklist.typeUsage.length > 0 && (
          <div className="mt-4">
            <h5 className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">
              {L.builder.review.typesUsed}
            </h5>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {checklist.typeUsage.map((item) => (
                <li
                  key={item.type}
                  className="rounded-full fill-softer px-2.5 py-1 text-[0.7rem] font-semibold text-ink-soft ring-1 ring-[color:var(--hairline)]"
                >
                  {item.label} · {item.count}
                </li>
              ))}
            </ul>
          </div>
        )}

        {checklist.manualReviewQuestions > 0 && (
          <p className="mt-4 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-400/20">
            {L.assessments.results.pendingHint}
          </p>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--hairline)] pb-1.5 last:border-0">
      <dt className="shrink-0 text-xs text-ink-faint">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-sm font-semibold text-ink ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
