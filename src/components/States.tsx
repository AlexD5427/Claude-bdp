import { AlertTriangle, Loader2, Inbox, RefreshCw } from "lucide-react";
import { GlassCard } from "./GlassCard";

/** Centred glass spinner used while the payload loads. */
export function LoadingState({ label = "Cargando datos…" }: { label?: string }) {
  return (
    <GlassCard className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-12 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-cyan-300" />
      <p className="text-sm font-semibold text-ink">{label}</p>
    </GlassCard>
  );
}

/** Error surface with a retry action. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <GlassCard className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-glass ring-1 ring-white/30">
        <AlertTriangle className="h-7 w-7 text-white drop-shadow-md" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-ink">
          No se pudieron cargar los datos
        </h3>
        <p className="mt-1 text-sm text-ink-soft">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.03] active:scale-95"
      >
        <RefreshCw className="h-4 w-4" />
        Reintentar
      </button>
    </GlassCard>
  );
}

/** Empty-data placeholder. */
export function EmptyState({
  title = "Sin resultados",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <GlassCard className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl px-8 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl fill-softer ring-1 ring-[color:var(--hairline)]">
        <Inbox className="h-7 w-7 text-ink-soft" />
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="text-sm text-ink-soft">{message}</p>
    </GlassCard>
  );
}
