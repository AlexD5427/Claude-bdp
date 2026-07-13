import { L } from "../../../content/locale";
import { GlassDrawer } from "../../../design-system/liquid-glass/GlassDrawer";
import { Chip } from "../../../design-system/liquid-glass/Chip";
import { PROCESS_STATUS_META, PROCESS_STATUSES, PUBLICATION_STATUS_META, PUBLICATION_STATUSES } from "../domain/status";
import { WORK_MODE_LABELS, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS, VISIBILITY_LABELS } from "../domain/enums";
import type { ProcessFilters } from "./listState";
import type { ProcessSummary } from "../domain/models";

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: ProcessFilters;
  onChange: (filters: ProcessFilters) => void;
  onClear: () => void;
  /** All summaries, used to derive available area/department/etc. options. */
  items: ProcessSummary[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es-MX"));
}

/** A multi-select facet rendered as toggleable chips. */
function Facet<T extends string>({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o.value} active={selected.includes(o.value)} onClick={() => onToggle(o.value)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/** ProcessOS advanced-filter drawer. */
export function ProcessFilterPanel({ open, onClose, filters, onChange, onClear, items }: FilterPanelProps) {
  const toggle = <K extends keyof ProcessFilters>(key: K, value: string) => {
    const list = filters[key] as string[];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onChange({ ...filters, [key]: next });
  };

  const areas = unique(items.map((i) => i.area)).map((v) => ({ value: v, label: v }));
  const departments = unique(items.map((i) => i.department)).map((v) => ({ value: v, label: v }));
  const businessUnits = unique(items.map((i) => i.businessUnit)).map((v) => ({ value: v, label: v }));
  const locations = unique(items.map((i) => i.location)).map((v) => ({ value: v, label: v }));

  return (
    <GlassDrawer
      open={open}
      onClose={onClose}
      title={L.common.filters}
      ariaLabel={L.common.filters}
      footer={
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full fill-softer px-4 py-2 text-sm font-semibold text-ink ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft"
          >
            {L.common.clearFilters}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30"
          >
            {L.common.apply}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Facet
          label={L.processes.filters.status}
          options={PROCESS_STATUSES.map((s) => ({ value: s, label: PROCESS_STATUS_META[s].label }))}
          selected={filters.processStatus}
          onToggle={(v) => toggle("processStatus", v)}
        />
        <Facet
          label={L.processes.filters.publication}
          options={PUBLICATION_STATUSES.map((s) => ({ value: s, label: PUBLICATION_STATUS_META[s].label }))}
          selected={filters.publicationStatus}
          onToggle={(v) => toggle("publicationStatus", v)}
        />
        <Facet label={L.processes.filters.area} options={areas} selected={filters.area} onToggle={(v) => toggle("area", v)} />
        <Facet label={L.processes.filters.department} options={departments} selected={filters.department} onToggle={(v) => toggle("department", v)} />
        <Facet label={L.processes.filters.businessUnit} options={businessUnits} selected={filters.businessUnit} onToggle={(v) => toggle("businessUnit", v)} />
        <Facet label={L.processes.filters.location} options={locations} selected={filters.location} onToggle={(v) => toggle("location", v)} />
        <Facet
          label={L.processes.filters.workMode}
          options={Object.entries(WORK_MODE_LABELS).map(([value, label]) => ({ value, label }))}
          selected={filters.workMode}
          onToggle={(v) => toggle("workMode", v)}
        />
        <Facet
          label={L.processes.filters.employmentType}
          options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          selected={filters.employmentType}
          onToggle={(v) => toggle("employmentType", v)}
        />
        <Facet
          label={L.processes.filters.experienceLevel}
          options={Object.entries(EXPERIENCE_LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
          selected={filters.experienceLevel}
          onToggle={(v) => toggle("experienceLevel", v)}
        />
        <Facet
          label={L.processes.filters.visibility}
          options={Object.entries(VISIBILITY_LABELS).map(([value, label]) => ({ value, label }))}
          selected={filters.visibility}
          onToggle={(v) => toggle("visibility", v)}
        />

        <fieldset className="border-0 p-0">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
            {L.processes.filters.lifecycle}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(["active", "closed", "archived", "all"] as const).map((v) => (
              <Chip key={v} active={filters.lifecycle === v} onClick={() => onChange({ ...filters, lifecycle: v })}>
                {v === "active" ? "Activos" : v === "closed" ? "Cerrados" : v === "archived" ? "Archivados" : L.common.all}
              </Chip>
            ))}
          </div>
        </fieldset>
      </div>
    </GlassDrawer>
  );
}
