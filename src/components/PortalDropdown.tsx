import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

interface PortalDropdownProps {
  open: boolean;
  /** The element the panel should align to (usually the input wrapper). */
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Max panel height in px; the panel flips above the anchor when cramped. */
  maxHeight?: number;
  /**
   * When true (default) the panel matches the anchor's width — ideal for
   * autocomplete inputs. When false the panel keeps its own (content) width and
   * is aligned to the nearest edge, clamped inside the viewport — used by small
   * triggers (e.g. the dock profile chip) whose panel is far wider than them.
   */
  matchAnchorWidth?: boolean;
  /** Horizontal alignment when `matchAnchorWidth` is false. */
  align?: "left" | "right" | "auto";
}

interface Pos {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  viewport: number;
  placement: "bottom" | "top";
}

/**
 * A dropdown panel rendered in a portal on `document.body` with **fixed**
 * positioning anchored to `anchorRef`.
 *
 * Anchoring in a portal (instead of `position: absolute` inside the trigger)
 * is what lets the menu escape any ancestor with `overflow: hidden/auto` — the
 * scrollable modal body of the intake form, the comparator's stacking contexts,
 * etc. It re-measures on scroll/resize and flips upward when there isn't enough
 * room below, so the list is always fully visible and clickable.
 */
export function PortalDropdown({
  open,
  anchorRef,
  onClose,
  children,
  className = "",
  maxHeight = 288,
  matchAnchorWidth = true,
  align = "auto",
}: PortalDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      // Flip up only when there's clearly more room above than below.
      const placement =
        spaceBelow < Math.min(maxHeight, 240) && spaceAbove > spaceBelow
          ? "top"
          : "bottom";
      setPos({
        top: r.bottom,
        bottom: r.top,
        left: r.left,
        right: r.right,
        width: r.width,
        viewport: window.innerWidth,
        placement,
      });
    }
    update();
    window.addEventListener("resize", update);
    // Capture phase catches scrolls on any ancestor scroll container too.
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, maxHeight]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, anchorRef, onClose]);

  if (!open || !pos) return null;

  const GUTTER = 8;
  const vertical =
    pos.placement === "bottom"
      ? { top: pos.top + GUTTER }
      : { bottom: window.innerHeight - pos.bottom + GUTTER };

  // Horizontal placement. When matching the anchor width we clamp the left edge
  // so the panel never runs off screen. Otherwise we pin the panel to the
  // nearest edge (right when the anchor sits in the right half of the screen),
  // and constrain its width to the viewport so its own content decides the size.
  let horizontal: React.CSSProperties;
  if (matchAnchorWidth) {
    const left = Math.min(
      Math.max(GUTTER, pos.left),
      Math.max(GUTTER, pos.viewport - pos.width - GUTTER),
    );
    horizontal = { left, width: pos.width };
  } else {
    const alignRight =
      align === "right" ||
      (align === "auto" && pos.left + pos.width / 2 > pos.viewport / 2);
    horizontal = alignRight
      ? { right: Math.max(GUTTER, pos.viewport - pos.right) }
      : { left: Math.max(GUTTER, pos.left) };
    horizontal.maxWidth = `calc(100vw - ${GUTTER * 2}px)`;
  }

  return createPortal(
    <motion.div
      ref={panelRef}
      // Entrada corta y con física: el panel «brota» del campo en lugar de
      // aparecer de golpe, que era lo que hacía sentir escueto al buscador.
      initial={{ opacity: 0, y: pos.placement === "bottom" ? -8 : 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.7 }}
      style={{
        position: "fixed",
        maxHeight,
        zIndex: 200,
        transformOrigin: pos.placement === "bottom" ? "top center" : "bottom center",
        ...horizontal,
        ...vertical,
      }}
      className={`overflow-auto ${className}`}
    >
      {children}
    </motion.div>,
    document.body,
  );
}
