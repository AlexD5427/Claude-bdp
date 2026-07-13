import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { SPRING_SNAPPY } from "../motion";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Unique id so the sliding pill's layoutId never collides across instances. */
  idBase: string;
  size?: "sm" | "md";
}

/**
 * A glass segmented control with a spring "liquid pill" that glides to the
 * selected option. Fully keyboard-navigable (arrow keys move focus/selection),
 * used for the view switchers and preview device toggles.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  idBase,
  size = "md",
}: SegmentedProps<T>) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = options.findIndex((o) => o.value === value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(options[(idx + 1) % options.length].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(options[(idx - 1 + options.length) % options.length].value);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="inline-flex items-center gap-0.5 rounded-full fill-soft p-1 ring-1 ring-[color:var(--hairline)]"
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`relative inline-flex items-center gap-1.5 rounded-full font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300 ${pad} ${
              active ? "text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${idBase}`}
                transition={SPRING_SNAPPY}
                className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan ring-1 ring-white/30"
              />
            )}
            {Icon && <Icon className="relative h-4 w-4" />}
            <span className="relative whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
