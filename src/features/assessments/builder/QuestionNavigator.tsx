import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, PanelLeftClose, Plus, Search, UserCheck } from "lucide-react";
import { L, fmt } from "../../../content/locale";
import { Segmented, type SegmentedOption } from "../../../design-system/liquid-glass/Segmented";
import { capabilitiesOf, getPlugin, requiresManualReview } from "../question-types";
import { pluginIcon } from "./pluginIcons";
import type { AssessmentContent } from "../domain/assessment";
import type { PublishChecklist } from "../domain/publish";
import { questionHasErrors } from "../domain/publish";
import { flattenBlocks } from "./builderState";

type NavigatorFilter = "all" | "incomplete" | "required" | "manual";

const FILTERS: SegmentedOption<NavigatorFilter>[] = [
  { value: "all", label: L.builder.navigator.filterAll },
  { value: "incomplete", label: L.builder.navigator.filterIncomplete },
  { value: "required", label: L.builder.navigator.filterRequired },
  { value: "manual", label: L.builder.navigator.filterManual },
];

interface NavigatorProps {
  content: AssessmentContent;
  checklist: PublishChecklist;
  selectedBlockId: string | null;
  onSelect: (blockId: string, sectionId: string) => void;
  onMove: (blockId: string, dir: -1 | 1) => void;
  onAdd: (sectionId: string) => void;
  onCollapse: () => void;
}

/**
 * Índice de preguntas.
 *
 * Es la pieza que hace manejable una evaluación de cien preguntas: número,
 * resumen del enunciado, tipo, si está completa, si es obligatoria, acceso
 * directo y reordenamiento accesible con botones (no depende de arrastrar y
 * soltar). El filtro solo aparece cuando hay volumen suficiente para que sea útil.
 */
export function QuestionNavigator({
  content,
  checklist,
  selectedBlockId,
  onSelect,
  onMove,
  onAdd,
  onCollapse,
}: NavigatorProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NavigatorFilter>("all");

  const flat = useMemo(() => flattenBlocks(content), [content]);
  const showFilters = flat.length >= 8;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return flat.filter(({ block }) => {
      if (needle) {
        const haystack = `${block.label} ${block.code} ${getPlugin(block.type)?.label ?? block.type}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      if (filter === "incomplete") return questionHasErrors(checklist, block.id);
      if (filter === "required") return block.required;
      if (filter === "manual") return requiresManualReview(block);
      return true;
    });
  }, [flat, query, filter, checklist]);

  const bySection = useMemo(() => {
    const groups = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = groups.get(item.section.id) ?? [];
      list.push(item);
      groups.set(item.section.id, list);
    }
    return groups;
  }, [visible]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2.5">
        <h3 className="flex-1 truncate text-xs font-bold uppercase tracking-wide text-ink-soft">
          {L.builder.navigator.title}
        </h3>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={L.builder.navigator.collapse}
          title={L.builder.navigator.collapse}
          className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-colors hover:fill-softer hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={L.builder.navigator.search}
            aria-label={L.builder.navigator.search}
            className="w-full rounded-full fill-soft py-1.5 pl-9 pr-3 text-xs text-ink outline-none ring-1 ring-[color:var(--hairline)] placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </div>
        {showFilters && (
          <Segmented
            ariaLabel={L.common.filters}
            value={filter}
            options={FILTERS}
            onChange={setFilter}
            size="sm"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {flat.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-faint">{L.builder.navigator.empty}</p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-faint">{L.builder.navigator.noMatches}</p>
        ) : (
          content.sections.map((section) => {
            const items = bySection.get(section.id) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={section.id} className="mb-3">
                <header className="flex items-baseline justify-between gap-2 px-2 py-1">
                  <h4 className="min-w-0 flex-1 truncate text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">
                    {section.title || L.builder.canvas}
                  </h4>
                  <span className="shrink-0 text-[0.65rem] text-ink-faint">
                    {fmt(L.builder.navigator.sectionCount, { n: items.length })}
                  </span>
                </header>
                <ul className="flex flex-col gap-1">
                  {items.map(({ block, number }, index) => {
                    const plugin = getPlugin(block.type);
                    const Icon = pluginIcon(plugin?.icon ?? "AlertTriangle");
                    const invalid = questionHasErrors(checklist, block.id);
                    const isContent = capabilitiesOf(block.type).control === "content";
                    const selected = block.id === selectedBlockId;
                    return (
                      <li key={block.id} className="group flex items-stretch gap-1">
                        <button
                          type="button"
                          aria-current={selected ? "true" : undefined}
                          onClick={() => onSelect(block.id, section.id)}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                            selected
                              ? "fill-softer ring-1 ring-cyan-400/70"
                              : "hover:fill-soft ring-1 ring-transparent"
                          }`}
                        >
                          <span
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[0.65rem] font-bold tabular-nums ${
                              isContent
                                ? "fill-softer text-ink-faint"
                                : "bg-gradient-to-br from-[#00b0d8]/80 to-[#005baa]/80 text-white"
                            }`}
                          >
                            {number ?? <Icon className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-ink">
                              {block.label.trim() ||
                                (isContent ? L.builder.navigator.contentBlock : L.builder.editor.questionText)}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-[0.65rem] text-ink-faint">
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="truncate">{plugin?.label ?? block.type}</span>
                              {block.required && (
                                <span className="shrink-0 rounded bg-cyan-500/15 px-1 font-bold text-cyan-200">
                                  {L.builder.navigator.requiredShort}
                                </span>
                              )}
                            </span>
                          </span>
                          {!isContent && (
                            <span className="shrink-0" title={invalid ? L.builder.navigator.incomplete : L.builder.navigator.valid}>
                              {invalid ? (
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" aria-label={L.builder.navigator.incomplete} />
                              ) : requiresManualReview(block) ? (
                                <UserCheck className="h-3.5 w-3.5 text-amber-300" aria-label={L.builder.editor.manualGraded} />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-label={L.builder.navigator.valid} />
                              )}
                            </span>
                          )}
                        </button>
                        <span className="flex shrink-0 flex-col justify-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label={`${L.builder.moveUp}: ${block.label || block.type}`}
                            disabled={index === 0}
                            onClick={() => onMove(block.id, -1)}
                            className="grid h-4 w-5 place-items-center rounded text-ink-faint transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-25"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`${L.builder.moveDown}: ${block.label || block.type}`}
                            disabled={index === items.length - 1}
                            onClick={() => onMove(block.id, 1)}
                            className="grid h-4 w-5 place-items-center rounded text-ink-faint transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-25"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => onAdd(section.id)}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[color:var(--hairline)] py-1.5 text-[0.7rem] font-semibold text-ink-soft transition-colors hover:fill-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <Plus className="h-3.5 w-3.5" /> {L.builder.navigator.addQuestion}
                </button>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
