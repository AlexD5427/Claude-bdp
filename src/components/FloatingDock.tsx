import { Fragment, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Moon, Sun, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DOCK_ITEMS } from "../constants";
import { useTheme } from "../context/ThemeContext";
import { setConfig, useConfig } from "../lib/configStore";
import { useDockOverride } from "../lib/dockOverrideStore";
import { toggleTools, useToolsOpen } from "../lib/toolsStore";
import { HerramientasIcon } from "./icons/CustomIcons";
import { DrawIcon } from "./DrawIcon";
import { DockProfileChip } from "./DockProfileChip";
import type { ModuleId } from "../types";

interface FloatingDockProps {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  synced: boolean;
  offline: boolean;
}

export function FloatingDock({ active, onSelect, synced, offline }: FloatingDockProps) {
  const { theme, toggle } = useTheme();
  const { dockPosition, dockSize, dockCollapsed, reduceMotion } = useConfig();
  const systemReduced = useReducedMotion();
  const calm = reduceMotion || systemReduced;
  const override = useDockOverride();
  const toolsOpen = useToolsOpen();
  const position = override ?? dockPosition;
  const vertical = position === "left" || position === "right";
  const railRef = useRef<HTMLUListElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  const syncTitle = offline
    ? "Sin conexión con la base de datos. Se muestra una copia local."
    : synced ? "Sincronizado" : "Sincronizando datos";
  const themeLabel = theme === "dark" ? "Activar modo claro" : "Activar modo oscuro";
  const CollapseIcon = {
    top: dockCollapsed ? ChevronDown : ChevronUp,
    bottom: dockCollapsed ? ChevronUp : ChevronDown,
    left: dockCollapsed ? ChevronRight : ChevronLeft,
    right: dockCollapsed ? ChevronLeft : ChevronRight,
  }[position];

  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    toggleRef.current?.focus({ preventScroll: true });
  }, [dockCollapsed]);

  useEffect(() => {
    // Revela el destino solo dentro del carril, sin desplazar el módulo abierto.
    const rail = railRef.current;
    const selected = rail?.querySelector('[aria-current="page"]');
    if (!rail || !selected) return;
    const viewport = rail.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    if (vertical) {
      const dy = tab.top < viewport.top ? tab.top - viewport.top - 3 : tab.bottom > viewport.bottom ? tab.bottom - viewport.bottom + 3 : 0;
      if (dy) rail.scrollBy?.({ top: dy, behavior: "instant" });
    } else {
      const dx = tab.left < viewport.left ? tab.left - viewport.left - 3 : tab.right > viewport.right ? tab.right - viewport.right + 3 : 0;
      if (dx) rail.scrollBy?.({ left: dx, behavior: "instant" });
    }
  }, [active, dockCollapsed, dockSize, position, vertical]);

  function toggleCollapsed() {
    restoreFocus.current = true;
    setConfig({ dockCollapsed: !dockCollapsed });
  }

  const logo = (
    <span className="bdp-dock__logo" aria-hidden="true"><img src="/logo-bdp.svg" alt="" /></span>
  );

  return (
    <nav key={position} className="bdp-dock no-print" aria-label="Navegación de módulos" data-position={position} data-size={dockSize} data-axis={vertical ? "y" : "x"}>
      {dockCollapsed ? (
        <button ref={toggleRef} type="button" className={`bdp-dock__expand ${vertical ? "flex-col !pr-0 !pb-1" : ""}`} aria-label="Expandir accesos directos" title="Expandir accesos directos" aria-expanded={false} onClick={toggleCollapsed}>
          {logo}<CollapseIcon aria-hidden="true" />
        </button>
      ) : (
        <>
          {logo}
          <ul className="bdp-dock__rail" ref={railRef}>
            {DOCK_ITEMS.map(({ id, icon, label }) => {
              const selected = id === active;
              return (
                <Fragment key={id}>
                  {id === "configuracion" && (
                    <li>
                      <button type="button" className="bdp-dock__button" aria-label="Herramientas" title="Herramientas" aria-haspopup="dialog" aria-expanded={toolsOpen} onClick={() => toggleTools()}>
                        <DrawIcon icon={HerramientasIcon} active={toolsOpen && !calm} redrawOnHover={!calm} className="bdp-dock__glyph" strokeWidth={2} />
                        <span className="bdp-dock__label">Herramientas</span>
                      </button>
                    </li>
                  )}
                  <li>
                    <button type="button" className="bdp-dock__button" aria-label={label} title={label} aria-current={selected ? "page" : undefined} onClick={() => onSelect(id)} disabled={toolsOpen}>
                      {selected && (calm ? (
                        <span className="bdp-dock__pill" aria-hidden="true" />
                      ) : (
                        <motion.span layoutId={`bdp-dock-selection-${position}`} transition={{ type: "spring", stiffness: 430, damping: 34 }} className="bdp-dock__pill" aria-hidden="true" />
                      ))}
                      <DrawIcon icon={icon} active={selected && !calm} className="bdp-dock__glyph" strokeWidth={selected ? 2.45 : 1.9} />
                      <span className="bdp-dock__label">{label}</span>
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
          <div className="bdp-dock__cluster">
            <span className="bdp-dock__status" data-state={offline ? "offline" : synced ? "online" : "busy"} title={syncTitle}>
              <span className="sr-only">{syncTitle}</span>
            </span>
            <button type="button" className="bdp-dock__control" aria-label={themeLabel} title={themeLabel} onClick={toggle}>
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <DockProfileChip plate="bdp-dock__control" />
            <button ref={toggleRef} type="button" className="bdp-dock__control" aria-label="Contraer accesos directos" title="Contraer accesos directos" aria-expanded={true} onClick={toggleCollapsed}>
              <CollapseIcon aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
