import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

interface PortalDropdownProps {
  open: boolean;
  /** The element the panel should align to (usually the input wrapper). */
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Max panel height in px; the panel flips above the anchor when cramped. */
  maxHeight?: number;
}

interface Pos {
  top: number;
  bottom: number;
  left: number;
  width: number;
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
        width: r.width,
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

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        maxHeight,
        zIndex: 200,
        ...(pos.placement === "bottom"
          ? { top: pos.top + 8 }
          : { bottom: window.innerHeight - pos.bottom + 8 }),
      }}
      className={`overflow-auto ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
