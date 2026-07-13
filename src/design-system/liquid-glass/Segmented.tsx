import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useId } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}

/**
 * A glass segmented control (view switcher, density). Keyboard accessible via
 * native radios; the active pill glides with a shared layout animation.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "md",
}: SegmentedProps<T>) {
  const groupId = useId();
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-full fill-soft p-0.5 ring-1 ring-[color:var(--hairline)]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`relative inline-flex items-center gap-1.5 rounded-full font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300 ${pad} ${
              active ? "text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass"
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
              />
            )}
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
