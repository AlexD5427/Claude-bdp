import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

const CLASSES = ["kbd-nav-current", "kbd-nav-next", "kbd-nav-prev"] as const;

/**
 * "Navegación por teclado asistida".
 *
 * When enabled, this hook paints a discreet coloured outline around three
 * elements inside `rootRef`: a **gold** ring on the field that currently has
 * focus, a **green** ring on the field Tab will move to next, and a **red**
 * ring on the field Shift+Tab would return to. It mirrors the browser's tab
 * order by walking the focusable elements in DOM order (no positive tabindex is
 * used anywhere, so DOM order == tab order), skipping anything hidden or removed
 * from the order with `tabindex="-1"`.
 *
 * It's purely presentational: it never moves focus, so it can't interfere with
 * normal typing or navigation.
 */
export function useAssistedKeyboardGlow(
  rootRef: RefObject<HTMLElement>,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    const clear = () => {
      root
        .querySelectorAll("." + CLASSES.join(", ."))
        .forEach((el) => el.classList.remove(...CLASSES));
    };

    const focusables = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          el.tabIndex !== -1 &&
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true" &&
          // Visible in the layout (offsetParent is null for display:none).
          (el.offsetParent !== null || el === document.activeElement),
      );

    const update = () => {
      clear();
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return;
      const list = focusables();
      const idx = list.indexOf(active);
      if (idx === -1) return;
      active.classList.add("kbd-nav-current");
      list[idx + 1]?.classList.add("kbd-nav-next");
      list[idx - 1]?.classList.add("kbd-nav-prev");
    };

    root.addEventListener("focusin", update);
    // Arrow keys move within a radiogroup without a focusin, so re-check on keyup.
    document.addEventListener("keyup", update);
    update();

    return () => {
      root.removeEventListener("focusin", update);
      document.removeEventListener("keyup", update);
      clear();
    };
  }, [enabled, rootRef]);
}
