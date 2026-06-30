import { Modal } from "./Modal";
import { AreaChart, TrendBadge } from "./charts";
import { deltaVsPrev, hasHistory, history } from "../lib/kpiHistory";

interface KpiDetailModalProps {
  open: boolean;
  onClose: () => void;
  kpiKey: string;
  title: string;
  value: string;
  unit?: string;
  raw: number | null;
  help: string;
  goodWhenUp: boolean;
}

/**
 * Drill-down for any KPI: the live figure, its month-over-month delta, an
 * animated 8-month history pulled from the monthly snapshot store, and a plain
 * explanation of how the indicator is calculated.
 */
export function KpiDetailModal({
  open,
  onClose,
  kpiKey,
  title,
  value,
  unit,
  raw,
  help,
  goodWhenUp,
}: KpiDetailModalProps) {
  const series = history(kpiKey, raw, 8);
  const delta = deltaVsPrev(kpiKey, raw);
  const hist = hasHistory(kpiKey);

  return (
    <Modal open={open} onRequestClose={onClose} size="max-w-2xl" ariaLabel={title}>
      <div className="p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-400">
          Indicador
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-ink">{title}</h2>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="text-5xl font-black leading-none text-ink">{value}</div>
          <div className="mb-1">
            <TrendBadge delta={delta} unit={unit} goodWhenUp={goodWhenUp} />
          </div>
        </div>

        <div className="mt-6 glass rounded-2xl p-4">
          <h3 className="mb-1 text-sm font-bold text-ink">Histórico mensual</h3>
          {hist ? (
            <AreaChart data={series} unit={unit} height={200} />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm font-semibold text-ink-soft">
                Aún no hay historial consolidado.
              </p>
              <p className="max-w-sm text-xs text-ink-faint">
                Los valores se congelan automáticamente al cierre de cada mes y se
                guardan en la pestaña «Dashboard y KPIs» de la base de datos. El mes
                en curso ya se está registrando.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl fill-soft p-4 ring-1 ring-[color:var(--hairline)]">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
            Cómo se calcula
          </h3>
          <p className="text-sm text-ink-soft">{help}</p>
        </div>
      </div>
    </Modal>
  );
}
