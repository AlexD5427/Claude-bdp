import { useId, useMemo, useState } from "react";
import { ChevronDown, Copy, Eye, Trash2 } from "lucide-react";
import { L } from "../../../content/locale";
import { Field, Select, Switch, TextArea, TextInput } from "../../../design-system/liquid-glass/fields";
import { StatusPill } from "../../../design-system/liquid-glass/StatusPill";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { allPlugins, capabilitiesOf, getPlugin, isAutoGradable, requiresManualReview } from "../question-types";
import type { AssessmentBlock, AssessmentSection } from "../domain/questions";
import type { PublishFinding } from "../domain/publish";
import type { BuilderAction } from "./builderState";
import { BlockRenderer } from "./BlockRenderer";
import { OptionEditor } from "./OptionEditor";
import { pluginIcon } from "./pluginIcons";

interface QuestionEditorProps {
  block: AssessmentBlock;
  section: AssessmentSection;
  number: number | null;
  dispatch: (action: BuilderAction) => void;
  findings: PublishFinding[];
  focusField: string | null;
}

function errorFor(findings: PublishFinding[], field: string): string | null {
  const match = findings.find((item) => item.severity === "error" && item.target.field === field);
  return match ? match.message : null;
}

/**
 * Área principal de edición: UNA pregunta activa, claramente enfocada.
 *
 * Montar solo la pregunta seleccionada es lo que mantiene el constructor rápido
 * con evaluaciones de cientos de preguntas: editar una opción no vuelve a
 * renderizar el resto del documento.
 */
export function QuestionEditor({
  block,
  section,
  number,
  dispatch,
  findings,
  focusField,
}: QuestionEditorProps) {
  const labelId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const caps = capabilitiesOf(block.type);
  const plugin = getPlugin(block.type);
  const Icon = pluginIcon(plugin?.icon ?? "AlertTriangle");
  const gradingLabel = isAutoGradable(block)
    ? L.builder.editor.autoGraded
    : requiresManualReview(block)
      ? L.builder.editor.manualGraded
      : L.builder.editor.notGraded;
  const gradingIntent = isAutoGradable(block)
    ? "success"
    : requiresManualReview(block)
      ? "warning"
      : "neutral";

  const typeOptions = useMemo(
    () =>
      allPlugins()
        .filter((item) => item.isQuestion === plugin?.isQuestion)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [plugin?.isQuestion],
  );

  const expectsValue = caps.grading === "auto_if_configured" && caps.expects !== "ordering" && caps.expects !== "matching";
  const expectedValue = block.config.expectedValue;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-sm font-black text-white ring-1 ring-white/30">
            {number ?? <Icon className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-ink">
              {plugin?.label ?? block.type}
            </p>
            <p className="truncate text-[0.7rem] text-ink-faint">
              {section.title || L.builder.canvas}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill intent={gradingIntent}>{gradingLabel}</StatusPill>
          {plugin && plugin.status !== "stable" && (
            <StatusPill intent="warning">
              {plugin.status === "contract" ? "contrato" : "beta"}
            </StatusPill>
          )}
          <button
            type="button"
            aria-label={L.common.duplicate}
            title={L.common.duplicate}
            onClick={() => dispatch({ type: "duplicateBlock", blockId: block.id })}
            className="grid h-8 w-8 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={L.common.delete}
            title={L.common.delete}
            onClick={() => setConfirmDelete(true)}
            className="grid h-8 w-8 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:bg-rose-500/70 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <Field
        label={L.builder.editor.questionText}
        htmlFor={labelId}
        required={caps.control !== "content"}
        error={errorFor(findings, "label")}
      >
        <TextArea
          id={labelId}
          rows={2}
          value={block.label}
          autoFocus={focusField === "label"}
          onChange={(event) => dispatch({ type: "updateBlock", blockId: block.id, patch: { label: event.target.value } })}
          className={focusField === "label" ? "ring-2 ring-cyan-300" : ""}
          maxLength={4000}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={L.builder.editor.questionType} hint={L.builder.editor.changeTypeWarning}>
          <Select
            value={block.type}
            onChange={(event) =>
              dispatch({ type: "changeBlockType", blockId: block.id, blockType: event.target.value })
            }
          >
            {typeOptions.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={L.builder.inspectorFields.helpText}>
          <TextInput
            value={block.helpText}
            onChange={(event) =>
              dispatch({ type: "updateBlock", blockId: block.id, patch: { helpText: event.target.value } })
            }
            maxLength={4000}
          />
        </Field>
      </div>

      {caps.control !== "content" && (
        <Switch
          label={L.builder.editor.required}
          checked={block.required}
          onChange={(value) => dispatch({ type: "updateBlock", blockId: block.id, patch: { required: value } })}
        />
      )}

      <OptionEditor
        block={block}
        dispatch={dispatch}
        highlighted={focusField === "options"}
        error={errorFor(findings, "options")}
      />

      {expectsValue && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L.builder.editor.expectedValue} hint={L.builder.editor.expectedValueHint}>
            <TextInput
              value={expectedValue === undefined || expectedValue === null ? "" : String(expectedValue)}
              onChange={(event) =>
                dispatch({
                  type: "updateBlock",
                  blockId: block.id,
                  patch: {
                    config: {
                      ...block.config,
                      expectedValue: event.target.value === "" ? undefined : event.target.value,
                    },
                  },
                })
              }
            />
          </Field>
          {caps.expects === "number" && (
            <Field label={L.builder.editor.tolerance}>
              <TextInput
                type="number"
                value={String(block.config.tolerance ?? 0)}
                onChange={(event) =>
                  dispatch({
                    type: "updateBlock",
                    blockId: block.id,
                    patch: { config: { ...block.config, tolerance: Number(event.target.value) || 0 } },
                  })
                }
              />
            </Field>
          )}
        </div>
      )}

      <details
        className="rounded-2xl fill-soft ring-1 ring-[color:var(--hairline)]"
        open={showAdvanced}
        onToggle={(event) => setShowAdvanced((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          {L.builder.editor.advanced}
        </summary>
        <div className="flex flex-col gap-3 border-t border-[color:var(--hairline)] p-3">
          <Field label={L.builder.inspectorFields.description}>
            <TextArea
              rows={2}
              value={block.description}
              onChange={(event) =>
                dispatch({ type: "updateBlock", blockId: block.id, patch: { description: event.target.value } })
              }
              maxLength={8000}
            />
          </Field>
          <Field label={L.builder.editor.ariaLabel}>
            <TextInput
              value={block.accessibility.ariaLabel}
              onChange={(event) =>
                dispatch({
                  type: "updateBlock",
                  blockId: block.id,
                  patch: { accessibility: { ...block.accessibility, ariaLabel: event.target.value } },
                })
              }
              maxLength={400}
            />
          </Field>
          <Field label={L.builder.editor.longDescription}>
            <TextArea
              rows={2}
              value={block.accessibility.longDescription}
              onChange={(event) =>
                dispatch({
                  type: "updateBlock",
                  blockId: block.id,
                  patch: {
                    accessibility: { ...block.accessibility, longDescription: event.target.value },
                  },
                })
              }
              maxLength={4000}
            />
          </Field>
          {block.media && (
            <Field
              label={L.builder.editor.mediaAlt}
              error={errorFor(findings, "mediaAlt")}
            >
              <TextInput
                value={block.media.alt}
                autoFocus={focusField === "mediaAlt"}
                onChange={(event) =>
                  dispatch({
                    type: "updateBlock",
                    blockId: block.id,
                    patch: block.media
                      ? { media: { ...block.media, alt: event.target.value } }
                      : {},
                  })
                }
                maxLength={400}
              />
            </Field>
          )}
        </div>
      </details>

      <section className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
        <header className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            {L.common.preview}
          </h4>
          <button
            type="button"
            aria-expanded={showPreview}
            onClick={() => setShowPreview((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-full fill-softer px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <Eye className="h-3.5 w-3.5" />
            {showPreview ? L.common.close : L.common.preview}
          </button>
        </header>
        {showPreview && (
          <div className="rounded-xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
            <BlockRenderer block={block} />
          </div>
        )}
      </section>

      <GlassDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          dispatch({ type: "removeBlock", blockId: block.id });
        }}
        title="¿Eliminar esta pregunta?"
        description="Se quitará del borrador. Las versiones publicadas y los intentos existentes no se modifican."
        confirmLabel={L.common.delete}
        destructive
      />
    </div>
  );
}
