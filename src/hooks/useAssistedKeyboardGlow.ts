import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** Extra room the glow ring leaves around a field, in px. */
const PAD = 5;

interface Slot {
  el: HTMLDivElement;
  target: HTMLElement | null;
}

/**
 * "Navegación por teclado asistida" — reimagined.
 *
 * When enabled, this hook paints a single **bright light-blue** glow with a
 * conic gradient that rotates around the edges of the field that currently has
 * focus, marking it as "the part being edited". The field Tab will move to next
 * and the one Shift+Tab returns to get the *same* effect at ~50 % intensity, so
 * they're a subtle hint rather than a distraction.
 *
 * The glow is drawn as free-floating overlay elements on `document.body` (not as
 * pseudo-elements on the fields themselves): inputs can't reliably host
 * `::before`/`::after`, and glass surfaces clip them with `overflow: hidden`.
 * Positioning overlays with `fixed` coordinates sidesteps both problems and lets
 * a single GPU-composited layer per role follow its field smoothly.
 *
 * It also gently **auto-scrolls the focused field to the centre** of the view,
 * so keyboard-only operators never lose the field they are on as they descend a
 * long form. It never moves focus itself, so it can't interfere with typing.
 */
export function useAssistedKeyboardGlow(
  rootRef: RefObject<HTMLElement>,
  enabled: boolean,
): void {
  // Keep the last field we auto-scrolled to, so we only recentre on real moves.
  const lastCentered = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) {
      lastCentered.current = null;
      return;
    }

    // --- overlay pool: current (full), next & prev (dimmed) ---------------
    const make = (roleClass: string): Slot => {
      const el = document.createElement("div");
      el.className = `kbd-glow ${roleClass}`;
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      return { el, target: null };
    };
    const slots: Record<"current" | "next" | "prev", Slot> = {
      current: make("kbd-glow-current"),
      next: make("kbd-glow-side"),
      prev: make("kbd-glow-side"),
    };

    const focusables = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          el.tabIndex !== -1 &&
          !el.hasAttribute("disabled") &&
          el.getAttribute("aria-hidden") !== "true" &&
          (el.offsetParent !== null || el === document.activeElement),
      );

    const place = (slot: Slot, target: HTMLElement | null) => {
      slot.target = target;
      if (!target) {
        slot.el.classList.remove("is-on");
        return;
      }
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        slot.el.classList.remove("is-on");
        return;
      }
      // Mirror the field's own corner radius for a snug ring.
      const radius = getComputedStyle(target).borderRadius || "0.75rem";
      slot.el.style.borderRadius = `calc(${radius} + ${PAD}px)`;
      slot.el.style.width = `${r.width + PAD * 2}px`;
      slot.el.style.height = `${r.height + PAD * 2}px`;
      slot.el.style.transform = `translate3d(${r.left - PAD}px, ${r.top - PAD}px, 0)`;
      slot.el.classList.add("is-on");
    };

    const reposition = () => {
      place(slots.current, slots.current.target);
      place(slots.next, slots.next.target);
      place(slots.prev, slots.prev.target);
    };

    const recompute = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) {
        place(slots.current, null);
        place(slots.next, null);
        place(slots.prev, null);
        return;
      }
      const list = focusables();
      const idx = list.indexOf(active);
      place(slots.current, active);
      place(slots.next, idx >= 0 ? list[idx + 1] ?? null : null);
      place(slots.prev, idx >= 0 ? list[idx - 1] ?? null : null);
    };

    // Smoothly centre the focused field (only when it actually changed), so the
    // form follows the operator down the page.
    const centerActive = () => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) return;
      if (lastCentered.current === active) return;
      lastCentered.current = active;
      active.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    };

    // rAF-throttled follow so overlays stay glued during smooth scroll / layout.
    let raf = 0;
    const scheduleReposition = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        reposition();
      });
    };

    const onFocusIn = () => {
      recompute();
      centerActive();
      // Keep following for a few frames while the smooth scroll settles.
      let frames = 0;
      const settle = () => {
        reposition();
        if (frames++ < 40) requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    };

    // Arrow keys move within a radiogroup without a focusin, so re-check on keyup.
    const onKeyUp = () => recompute();

    root.addEventListener("focusin", onFocusIn);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("scroll", scheduleReposition, true);
    window.addEventListener("resize", scheduleReposition);
    const ro = new ResizeObserver(scheduleReposition);
    ro.observe(root);

    recompute();
    // If a field is already focused when the mode turns on, centre it too.
    centerActive();

    return () => {
      root.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("scroll", scheduleReposition, true);
      window.removeEventListener("resize", scheduleReposition);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      slots.current.el.remove();
      slots.next.el.remove();
      slots.prev.el.remove();
      lastCentered.current = null;
    };
  }, [enabled, rootRef]);
}
