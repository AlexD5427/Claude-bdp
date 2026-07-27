import { useId } from "react";
import { Clock, Hash, Info, Percent, Wand2 } from "lucide-react";
import { L, formatDate, formatDuration } from "../../../content/locale";
import { Field, NumberField, Select, TextArea, TextInput } from "../../../design-system/liquid-glass/fields";
import { Chip } from "../../../design-system/liquid-glass/Chip";
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_META } from "../domain/categories";
import type { AssessmentCategory } from "../domain/categories";
import type { AssessmentDefinition } from "../domain/assessment";
import type { BuilderMeta } from "./builderState";
import type { PublishFinding } from "../domain/publish";

interface PanelProps {
  assessment: AssessmentDefinition;
  meta: BuilderMeta;
  onMeta: (patch: Partial<BuilderMeta>) => void;
  instructions: string;
  onInstructions: (value: string) => void;
  internalInstructions: string;
  onInternalInstructions: (value: string) => void;
  /** Hallazgos que apuntan a esta zona, para marcar el campo afectado. */
  findings: PublishFinding[];
  /** Campo que debe recibir el foco al llegar desde la revisión. */
  focusField: string | null;
}

function errorFor(findings: PublishFinding[], field: string): string | null {
  const match = findings.find(
    (item) => item.severity === "error" && item.target.field === field,
  );
  return match ? match.message : null;
}

/** Recuadro informativo reutilizado por los dos paneles. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl fill-soft px-3 py-2 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
      <span>{children}</span>
    </p>
  );
}

function focusRing(active: boolean): string {
  return active ? "ring-2 ring-cyan-300" : "";
}

/**
 * Paso «Configuración general»: identidad de la evaluación.
 *
 * Antes de este cambio NADA de esto era editable: una evaluación creada se
 * quedaba con el nombre por omisión para siempre.
 */
export function AssessmentGeneralPanel({
  assessment,
  meta,
  onMeta,
  instructions,
  onInstructions,
  internalInstructions,
  onInternalInstructions,
  findings,
  focusField,
}: PanelProps) {
  const nameId = useId();
  const instructionsId = useId();
  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-3xl p-5">
        <h3 className="text-sm font-black text-ink">{L.builder.settings.identityTitle}</h3>
        <p className="mt-0.5 text-xs text-ink-faint">{L.builder.settings.identityHint}</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field
            label={L.builder.settings.name}
            htmlFor={nameId}
            required
            hint={L.builder.settings.nameHint}
            error={errorFor(findings, "name")}
            className="lg:col-span-2"
          >
            <TextInput
              id={nameId}
              value={meta.name}
              onChange={(event) => onMeta({ name: event.target.value })}
              autoFocus={focusField === "name"}
              className={focusRing(focusField === "name")}
              maxLength={200}
            />
          </Field>

          <Field label={L.builder.settings.description} hint={L.builder.settings.descriptionHint}>
            <TextArea
              rows={3}
              value={meta.description}
              onChange={(event) => onMeta({ description: event.target.value })}
              maxLength={8000}
            />
          </Field>

          <Field label={L.builder.settings.purpose}>
            <TextArea
              rows={3}
              value={meta.purpose}
              onChange={(event) => onMeta({ purpose: event.target.value })}
              maxLength={2000}
            />
          </Field>

          <Field
            label={L.builder.settings.instructions}
            htmlFor={instructionsId}
            hint={L.builder.settings.instructionsHint}
            className="lg:col-span-2"
          >
            <TextArea
              id={instructionsId}
              rows={3}
              value={instructions}
              onChange={(event) => onInstructions(event.target.value)}
              maxLength={8000}
            />
          </Field>

          <Field
            label={L.builder.settings.internalInstructions}
            hint={L.builder.settings.internalInstructionsHint}
            className="lg:col-span-2"
          >
            <TextArea
              rows={2}
              value={internalInstructions}
              onChange={(event) => onInternalInstructions(event.target.value)}
              maxLength={8000}
            />
          </Field>

          <Field label={L.builder.settings.category}>
            <Select
              value={meta.category}
              onChange={(event) => onMeta({ category: event.target.value as AssessmentCategory })}
            >
              {ASSESSMENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {ASSESSMENT_CATEGORY_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <TagsField meta={meta} onMeta={onMeta} />
        </div>
      </section>

      <MetadataCard assessment={assessment} />
    </div>
  );
}

function TagsField({ meta, onMeta }: { meta: BuilderMeta; onMeta: (patch: Partial<BuilderMeta>) => void }) {
  const inputId = useId();
  return (
    <Field label={L.builder.settings.tags} htmlFor={inputId}>
      <div className="flex flex-col gap-2">
        <TextInput
          id={inputId}
          placeholder="Escribe y presiona Enter"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const value = event.currentTarget.value.trim();
            if (!value || meta.tags.includes(value) || meta.tags.length >= 50) return;
            onMeta({ tags: [...meta.tags, value.slice(0, 60)] });
            event.currentTarget.value = "";
          }}
        />
        {meta.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {meta.tags.map((tag) => (
              <Chip
                key={tag}
                onRemove={() => onMeta({ tags: meta.tags.filter((item) => item !== tag) })}
                removeLabel={`Quitar etiqueta ${tag}`}
              >
                {tag}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}

function MetadataCard({ assessment }: { assessment: AssessmentDefinition }) {
  const rows: { label: string; value: string }[] = [
    { label: L.builder.settings.publicCode, value: assessment.code },
    {
      label: L.builder.settings.version,
      value: `v${assessment.draftVersion.major}.${assessment.draftVersion.minor}`,
    },
    { label: L.builder.settings.accessType, value: L.builder.settings.accessPublic },
    { label: L.common.createdBy, value: assessment.createdBy || L.common.unknownUser },
    { label: L.common.createdAt, value: formatDate(assessment.createdAt) },
    { label: L.common.updatedBy, value: assessment.updatedBy || L.common.unknownUser },
    { label: L.common.updatedAt, value: formatDate(assessment.updatedAt) },
    {
      label: L.versioning.published,
      value: assessment.publishedAt ? formatDate(assessment.publishedAt) : L.common.none,
    },
  ];
  return (
    <section className="glass rounded-3xl p-5">
      <h3 className="text-sm font-black text-ink">{L.builder.settings.metadata}</h3>
      <p className="mt-0.5 text-xs text-ink-faint">{L.builder.settings.publicCodeHint}</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">
              {row.label}
            </dt>
            <dd className="truncate text-sm font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface DeliveryProps extends PanelProps {
  /** Estimación calculada a partir de los tipos de pregunta. */
  estimatedMinutes: number;
}

/** Paso «Configuración de evaluación»: duración, nota mínima y acceso. */
export function AssessmentDeliveryPanel({
  meta,
  onMeta,
  findings,
  focusField,
  estimatedMinutes,
}: DeliveryProps) {
  const durationId = useId();
  const passingId = useId();
  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-3xl p-5">
        <h3 className="text-sm font-black text-ink">{L.builder.settings.deliveryTitle}</h3>
        <p className="mt-0.5 text-xs text-ink-faint">{L.builder.settings.deliveryHint}</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {L.builder.settings.duration}
              </span>
            }
            htmlFor={durationId}
            hint={L.builder.settings.durationHint}
            error={errorFor(findings, "durationMinutes")}
          >
            <div className="flex items-center gap-2">
              <NumberField
                id={durationId}
                min={1}
                max={1440}
                value={meta.durationMinutes > 0 ? meta.durationMinutes : null}
                onChange={(value) => onMeta({ durationMinutes: value === null ? 0 : Math.max(0, value) })}
                autoFocus={focusField === "durationMinutes"}
                className={focusRing(focusField === "durationMinutes")}
              />
              <button
                type="button"
                onClick={() => onMeta({ durationMinutes: estimatedMinutes })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full fill-softer px-3 py-2 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Wand2 className="h-3.5 w-3.5" /> {L.builder.settings.useEstimate}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              {L.builder.settings.durationEstimate}: {formatDuration(estimatedMinutes)}
              {meta.durationMinutes === 0 && ` · ${L.builder.settings.noTimeLimit}`}
            </p>
          </Field>

          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5" /> {L.builder.settings.passingScore}
              </span>
            }
            htmlFor={passingId}
            hint={L.builder.settings.passingScoreHint}
            error={errorFor(findings, "passingScore")}
          >
            <NumberField
              id={passingId}
              min={0}
              max={100}
              step={0.01}
              value={meta.passingScore}
              onChange={(value) =>
                onMeta({ passingScore: value === null ? null : Math.min(100, Math.max(0, value)) })
              }
              autoFocus={focusField === "passingScore"}
              className={focusRing(focusField === "passingScore")}
            />
            {meta.passingScore === null && (
              <p className="mt-1 text-xs text-ink-faint">{L.builder.settings.noPassingScore}</p>
            )}
          </Field>

          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" /> {L.builder.settings.accessType}
              </span>
            }
          >
            <Select value="public" disabled>
              <option value="public">{L.builder.settings.accessPublic}</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Note>
            La nota oficial la calcula exclusivamente el servidor a partir de las
            preguntas con criterio objetivo:{" "}
            <strong>respuestas correctas ÷ preguntas calificables × 100</strong>. Si
            la evaluación contiene preguntas abiertas, el resultado queda pendiente
            de revisión humana en lugar de otorgar cero.
          </Note>
          <Note>
            El acceso público funciona por <strong>código público</strong>: el portal
            de candidatos solo puede leer evaluaciones publicadas y nunca recibe las
            respuestas correctas.
          </Note>
        </div>
      </section>
    </div>
  );
}
