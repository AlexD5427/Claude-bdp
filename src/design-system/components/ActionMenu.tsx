import { useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { PortalDropdown } from "../../components/PortalDropdown";

export interface ActionItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Render a divider above this item. */
  divider?: boolean;
}

/**
 * A compact "⋯" action menu rendered through the portal dropdown, so it escapes
 * table/row `overflow` and is keyboard reachable. Used for row and card actions.
 */
export function ActionMenu({ items, label = "Acciones" }: { items: ActionItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition-colors hover:bg-[color:var(--fill-2)] hover:text-ink"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <PortalDropdown
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        matchAnchorWidth={false}
        align="right"
      >
        <ul role="menu" className="glass-heavy min-w-[12rem] rounded-2xl p-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key} role="none">
                {item.divider && <div className="my-1 h-px bg-[color:var(--hairline)]" />}
                <button
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-40 ${
                    item.tone === "danger"
                      ? "text-rose-400 hover:bg-rose-500/15"
                      : "text-ink hover:bg-[color:var(--fill-2)]"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </PortalDropdown>
    </>
  );
}
