import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Pencil, Send, PauseCircle, XCircle, Archive, Copy } from "lucide-react";
import { L } from "../../../content/locale";
import { Z } from "../../../design-system/tokens";
import type { TalentPermissions } from "../../shared/permissions";

type Action = "publish" | "pause" | "close" | "archive" | "duplicate";

interface MenuProps {
  anchor: HTMLElement;
  permissions: TalentPermissions;
  onClose: () => void;
  onOpen: () => void;
  onAction: (action: Action) => void;
}

/** A small popover menu of row actions, positioned near its anchor. */
export function RowActionMenu({ anchor, permissions, onClose, onOpen, onAction }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 208) });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink transition-colors hover:fill-softer";

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      style={{ top: pos.top, left: pos.left, zIndex: Z.dropdown }}
      className="glass-heavy fixed w-52 rounded-2xl p-1.5"
    >
      <button type="button" role="menuitem" className={item} onClick={onOpen}>
        <Pencil className="h-4 w-4" /> {L.common.edit}
      </button>
      {permissions.publish && (
        <button type="button" role="menuitem" className={item} onClick={() => onAction("publish")}>
          <Send className="h-4 w-4" /> {L.common.publish}
        </button>
      )}
      {permissions.edit && (
        <button type="button" role="menuitem" className={item} onClick={() => onAction("pause")}>
          <PauseCircle className="h-4 w-4" /> {L.common.pause}
        </button>
      )}
      {permissions.close && (
        <button type="button" role="menuitem" className={item} onClick={() => onAction("close")}>
          <XCircle className="h-4 w-4" /> {L.common.close}
        </button>
      )}
      {permissions.create && (
        <button type="button" role="menuitem" className={item} onClick={() => onAction("duplicate")}>
          <Copy className="h-4 w-4" /> {L.common.duplicate}
        </button>
      )}
      {permissions.archive && (
        <button type="button" role="menuitem" className={`${item} text-rose-300`} onClick={() => onAction("archive")}>
          <Archive className="h-4 w-4" /> {L.common.archive}
        </button>
      )}
    </motion.div>,
    document.body,
  );
}
