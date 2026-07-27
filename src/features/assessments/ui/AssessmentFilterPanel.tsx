import { X } from "lucide-react";
import { L } from "../../../content/locale";
import { Chip } from "../../../design-system/liquid-glass/Chip";
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_META } from "../domain/categories";
import {
  ASSESSMENT_LIFECYCLE,
  ASSESSMENT_LIFECYCLE_META,
  ASSESSMENT_PUBLICATION,
  ASSESSMENT_PUBLICATION_META,
} from "../domain/lifecycle";
import type { AssessmentCategory } from "../domain/categories";
import type { AssessmentLifecycle, AssessmentPublication } from "../domain/lifecycle";
import { activeAssessmentFilterCount, emptyAssessmentFilters, type AssessmentFilters } from "./listState";

interface FilterPanelProps {
  filters: AssessmentFilters;
  onChange: (filters: AssessmentFilters) => void;
  onClose: () => void;
}

/**
 * Panel de filtros del listado.
 *
 * `AssessmentFilters` ya existía en el estado del módulo pero ningún componente
 * lo escribía: los filtros no eran alcanzables desde la interfaz. Este panel los
 * conecta.
 */
export function AssessmentFilterPanel({ filters, onChange, onClose }: FilterPanelProps) {
  const count = activeAssessmentFilterCount(filters);

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <section className="glass mb-3 rounded-3xl p-4" aria-label={L.common.filters}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-ink">{L.common.filters}</h3>
        <div className="flex items-center gap-1.5">
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange(emptyAssessmentFilters())}
              className="rounded-full fill-softer px-3 py-1 text-xs font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {L.common.clearFilters}
            </button>
          )}
          <button
            type="button"
            aria-label={L.common.close}
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-colors hover:fill-softer hover:text-ink focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Group label={L.assessments.filters.status}>
          {ASSESSMENT_LIFECYCLE.map((value) => (
            <Chip
              key={value}
              active={filters.lifecycle.includes(value)}
              onClick={() =>
                onChange({ ...filters, lifecycle: toggle<AssessmentLifecycle>(filters.lifecycle, value) })
              }
            >
              {ASSESSMENT_LIFECYCLE_META[value].label}
            </Chip>
          ))}
        </Group>

        <Group label={L.assessments.filters.publication}>
          {ASSESSMENT_PUBLICATION.map((value) => (
            <Chip
              key={value}
              active={filters.publication.includes(value)}
              onClick={() =>
                onChange({
                  ...filters,
                  publication: toggle<AssessmentPublication>(filters.publication, value),
                })
              }
            >
              {ASSESSMENT_PUBLICATION_META[value].label}
            </Chip>
          ))}
        </Group>

        <Group label={L.assessments.filters.category}>
          {ASSESSMENT_CATEGORIES.map((value) => (
            <Chip
              key={value}
              active={filters.category.includes(value)}
              onClick={() =>
                onChange({ ...filters, category: toggle<AssessmentCategory>(filters.category, value) })
              }
            >
              {ASSESSMENT_CATEGORY_META[value].label}
            </Chip>
          ))}
        </Group>
      </div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
