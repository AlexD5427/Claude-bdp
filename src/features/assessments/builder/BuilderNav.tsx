import { ClipboardList, ListChecks, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { L } from "../../../content/locale";

/** Pasos del constructor. La navegación es libre: no es un asistente lineal. */
export type BuilderStep = "general" | "questions" | "settings" | "review";

export const BUILDER_STEPS: BuilderStep[] = ["general", "questions", "settings", "review"];

interface BuilderNavProps {
  step: BuilderStep;
  onStep: (step: BuilderStep) => void;
  /** Errores bloqueantes por paso, para mostrarlos donde ocurren. */
  errorsByStep: Record<BuilderStep, number>;
  questionCount: number;
  completeness: number;
}

const META: Record<
  BuilderStep,
  { label: string; short: string; icon: typeof ClipboardList }
> = {
  general: { label: L.builder.nav.general, short: L.builder.nav.shortGeneral, icon: ClipboardList },
  questions: { label: L.builder.nav.questions, short: L.builder.nav.shortQuestions, icon: ListChecks },
  settings: { label: L.builder.nav.settings, short: L.builder.nav.shortSettings, icon: SlidersHorizontal },
  review: { label: L.builder.nav.review, short: L.builder.nav.shortReview, icon: ShieldCheck },
};

/**
 * Navegación estructurada del constructor.
 *
 * Es una barra de pasos siempre visible (no un asistente que obligue a avanzar
 * en orden): el usuario puede ir a cualquier paso, guardar en cualquier momento y
 * volver atrás. Cada paso muestra su propio contador de errores para que nunca
 * haya que adivinar dónde está el problema.
 */
export function BuilderNav({ step, onStep, errorsByStep, questionCount, completeness }: BuilderNavProps) {
  return (
    <nav aria-label={L.builder.nav.label} className="mb-3">
      <ul className="flex flex-wrap items-center gap-1.5">
        {BUILDER_STEPS.map((item) => {
          const meta = META[item];
          const Icon = meta.icon;
          const active = item === step;
          const errors = errorsByStep[item];
          return (
            <li key={item}>
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onStep(item)}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  active
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass ring-1 ring-white/30"
                    : "fill-soft text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{meta.label}</span>
                <span className="sm:hidden">{meta.short}</span>
                {item === "questions" && questionCount > 0 && (
                  <span className={`rounded-full px-1.5 text-[0.7rem] font-bold tabular-nums ${active ? "bg-white/25" : "fill-softer"}`}>
                    {questionCount}
                  </span>
                )}
                {errors > 0 && (
                  <span
                    className="rounded-full bg-rose-500/25 px-1.5 text-[0.7rem] font-bold text-rose-200"
                    aria-label={`${errors} ${L.builder.status.errors}`}
                  >
                    {errors}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li className="ml-auto hidden items-center gap-2 md:flex">
          <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">
            {L.builder.review.completeness}
          </span>
          <span
            role="progressbar"
            aria-valuenow={completeness}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={L.builder.review.completeness}
            className="h-2 w-28 overflow-hidden rounded-full fill-softer"
          >
            <span
              className="block h-full rounded-full bg-gradient-to-r from-[#00b0d8] to-[#005baa] transition-[width] duration-500"
              style={{ width: `${completeness}%` }}
            />
          </span>
          <span className="text-xs font-bold tabular-nums text-ink">{completeness}%</span>
        </li>
      </ul>
    </nav>
  );
}
