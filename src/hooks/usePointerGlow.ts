import { useCallback } from "react";

/**
 * Tracks the pointer *inside* an element and exposes its position as the
 * `--gx` / `--gy` custom properties, which the `.glow` utility turns into a
 * soft radial highlight that chases the cursor across the card. Returns an
 * `onMouseMove` handler to spread onto any element already carrying `.glow`.
 */
export function usePointerGlow(): {
  onMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
} {
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const gx = ((e.clientX - rect.left) / rect.width) * 100;
    const gy = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--gx", `${gx}%`);
    el.style.setProperty("--gy", `${gy}%`);
  }, []);

  return { onMouseMove };
}
