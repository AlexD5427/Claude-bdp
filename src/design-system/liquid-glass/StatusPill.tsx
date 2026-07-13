import type { ReactNode } from "react";
import { INTENT, type Intent } from "../tokens";

interface StatusPillProps {
  intent?: Intent;
  children: ReactNode;
  /** Optional leading icon (kept decorative; the label carries meaning). */
  icon?: ReactNode;
  /** Show the semantic dot (helps color-blind users pair tint + label). */
  dot?: boolean;
  className?: string;
  title?: string;
}

/**
 * A compact status/publication indicator. Because state must never be conveyed
 * by color alone, the pill always renders a text label (and optionally a dot),
 * not just a colored swatch.
 */
export function StatusPill({
  intent = "neutral",
  children,
  icon,
  dot = true,
  className = "",
  title,
}: StatusPillProps) {
  const style = INTENT[intent];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.chip} ${className}`}
    >
      {icon}
      {dot && !icon && <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />}
      {children}
    </span>
  );
}
