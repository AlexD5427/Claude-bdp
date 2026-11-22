import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { GlassCard } from "./GlassCard";

/*
 * Estados de carga, error y vacío.
 *
 * El movimiento es SOLO CSS (`state-rise`, `state-shake`, `state-float`, el
 * orbe líquido): sin hooks ni estilos en línea, el texto está en el DOM y
 * visible desde el primer render, y las animaciones se apagan solas con
 * «Reducir movimiento» y `prefers-reduced-motion` (ver index.css).
 */

/** Orbe de vidrio líquido mientras carga el contenido. */
export function LoadingState({ label = "Cargando datos…" }: { label?: string }) {
  return (
    <GlassCard className="state-rise mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-12 text-center">
      <div className="liquid-loader" aria-hidden>
        <span className="liquid-loader-ring" />
        <span className="liquid-loader-core" />
      </div>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <span className="liquid-loader-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
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
    <GlassCard className="state-rise mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl px-8 py-12 text-center">
      <div className="state-shake grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 shadow-glass ring-1 ring-white/30">
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
        className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-5 py-2.5 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-[transform,box-shadow] duration-500 ease-spring hover:-translate-y-1 hover:shadow-glow-cyan active:scale-95"
      >
        <RefreshCw className="h-4 w-4 transition-transform duration-700 ease-spring group-hover:rotate-180" />
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
    <GlassCard className="state-rise mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl px-8 py-12 text-center">
      <div className="state-float grid h-14 w-14 place-items-center rounded-2xl fill-softer ring-1 ring-[color:var(--hairline)]">
        <Inbox className="h-7 w-7 text-ink-soft" />
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="text-sm text-ink-soft">{message}</p>
    </GlassCard>
  );
}
