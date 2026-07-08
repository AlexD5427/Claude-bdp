import { motion } from "framer-motion";
import { Star } from "lucide-react";
import type { ReactNode } from "react";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  FileStack,
  MessageSquareQuote,
  UserMinus,
  Workflow,
} from "lucide-react";
import type { TimelineEvent, TimelineKind, TimelineTone } from "../../lib/profileData";

/** A titled glass panel used throughout the profile tabs. */
export function SectionCard({
  icon,
  title,
  sub,
  action,
  children,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass glow rounded-3xl p-5 print-avoid-break ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl fill-softer text-cyan-400 ring-1 ring-[color:var(--hairline)]">
              {icon}
            </span>
          )}
          <div>
            <h3 className="text-base font-black tracking-tight text-ink">{title}</h3>
            {sub && <p className="text-xs text-ink-soft">{sub}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A compact key/value info row. */
export function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl fill-soft px-3 py-2.5 ring-1 ring-[color:var(--hairline)]">
      <span className="mt-0.5 shrink-0 text-cyan-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">{label}</div>
        <div className="wrap-words text-sm font-semibold text-ink">{value || "N/D"}</div>
      </div>
    </div>
  );
}

/** A five-star rating — read-only, or interactive when `onChange` is given. */
export function StarRating({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const editable = Boolean(onChange);
  return (
    <div className="flex items-center gap-0.5" role={editable ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={!editable}
            onClick={() => onChange?.(n === value ? 0 : n)}
            aria-label={`${n} de 5`}
            className={editable ? "transition-transform hover:scale-110 active:scale-90" : "cursor-default"}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? "fill-amber-400 text-amber-400" : "text-ink-faint"}
            />
          </button>
        );
      })}
    </div>
  );
}

const TONE_DOT: Record<TimelineTone, string> = {
  cyan: "from-[#00b0d8] to-[#005baa]",
  green: "from-emerald-500 to-green-600",
  amber: "from-amber-400 to-orange-500",
  rose: "from-rose-500 to-red-600",
  violet: "from-violet-500 to-indigo-600",
  slate: "from-slate-400 to-slate-500",
};

const KIND_ICON: Record<TimelineKind, ReactNode> = {
  proceso: <Workflow className="h-3.5 w-3.5" />,
  ingreso: <CalendarClock className="h-3.5 w-3.5" />,
  evaluacion: <CheckCircle2 className="h-3.5 w-3.5" />,
  contratado: <Briefcase className="h-3.5 w-3.5" />,
  baja: <UserMinus className="h-3.5 w-3.5" />,
  documentacion: <FileStack className="h-3.5 w-3.5" />,
  referencia: <MessageSquareQuote className="h-3.5 w-3.5" />,
};

/** A vertical, animated milestone timeline. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <p className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-4 py-8 text-center text-sm text-ink-faint">
        Aún no hay hitos registrados para esta persona.
      </p>
    );
  }
  return (
    <ol className="relative ml-3 space-y-4 border-l border-[color:var(--hairline)] pl-6">
      {events.map((e, i) => (
        <motion.li
          key={e.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.06, 0.5), type: "spring", stiffness: 240, damping: 22 }}
          className="relative"
        >
          <span
            className={`absolute -left-[1.97rem] grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br text-white shadow-glass ring-2 ring-[color:var(--app-base)] ${TONE_DOT[e.tone]}`}
          >
            {KIND_ICON[e.kind]}
          </span>
          <div className="glass rounded-2xl px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <span className="text-sm font-bold text-ink">{e.title}</span>
              <span className="text-[0.7rem] font-semibold text-ink-faint">{e.dateLabel}</span>
            </div>
            {e.detail && <p className="mt-0.5 wrap-words text-xs text-ink-soft">{e.detail}</p>}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
