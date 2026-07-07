import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun, ChevronRight, ChevronLeft, ChevronDown, ChevronUp } from "lucide-react";
import { DOCK_ITEMS } from "../constants";
import { useTheme } from "../context/ThemeContext";
import { useConfig, setConfig, type DockPosition, type DockSize } from "../lib/configStore";
import { useDockOverride } from "../lib/dockOverrideStore";
import { DrawIcon } from "./DrawIcon";
import { DockProfileChip } from "./DockProfileChip";
import type { ModuleId } from "../types";

interface FloatingDockProps {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  /** DB sync status — drives the glowing status dot. */
  synced: boolean;
}

/** Per-size scale tokens so the whole dock grows/shrinks coherently. */
const SIZE: Record<
  DockSize,
  { plate: string; logo: string; btn: string; icon: string; label: string }
> = {
  sm: { plate: "h-9 w-9", logo: "h-6 w-6", btn: "w-[3rem] sm:w-[3.4rem]", icon: "h-4 w-4", label: "text-[0.55rem]" },
  md: { plate: "h-10 w-10", logo: "h-7 w-7", btn: "w-[3.6rem] sm:w-[4.25rem]", icon: "h-5 w-5", label: "text-[0.6rem]" },
  lg: { plate: "h-12 w-12", logo: "h-8 w-8", btn: "w-[4.4rem] sm:w-[5rem]", icon: "h-6 w-6", label: "text-[0.7rem]" },
};

/**
 * Fixed-position anchor per dock placement. Centering uses auto-margins (not a
 * CSS transform) on purpose: Framer Motion drives `transform` for the entrance
 * animation, so a `-translate-x-1/2` here would be overridden and the dock would
 * drift off-centre. `w-max` / `h-max` size it to its content, capped so it never
 * runs off a small screen (it scrolls within itself instead).
 */
const ANCHOR: Record<DockPosition, string> = {
  top: "inset-x-0 top-3 mx-auto w-max max-w-[96vw] sm:top-4",
  bottom: "inset-x-0 bottom-3 mx-auto w-max max-w-[96vw] sm:bottom-4",
  left: "inset-y-0 left-2 my-auto h-max max-h-[calc(100vh-1.5rem)] sm:left-3",
  right: "inset-y-0 right-2 my-auto h-max max-h-[calc(100vh-1.5rem)] sm:right-3",
};

/** Directional enter/exit offset so a position change reads as a glide. */
function slide(position: DockPosition) {
  switch (position) {
    case "top":
      return { x: 0, y: -44 };
    case "bottom":
      return { x: 0, y: 44 };
    case "left":
      return { x: -44, y: 0 };
    case "right":
      return { x: 44, y: 0 };
  }
}

/** Small hook: track the viewport so the dock re-flows on resize/rotation. */
function useViewport() {
  const [vp, setVp] = useState({
    w: typeof window === "undefined" ? 1024 : window.innerWidth,
    h: typeof window === "undefined" ? 768 : window.innerHeight,
  });
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp({ w: window.innerWidth, h: window.innerHeight }));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return vp;
}

/**
 * iOS-style floating dock — fully adjustable, collapsible and context-aware.
 *
 * The recruitment team can dock it to any edge (top / bottom / left / right)
 * and pick a size from Configuración; those live in the config store, so the
 * choice persists. A chevron collapses the dock into a single logo pill and
 * expands it again. It listens to viewport changes so it always re-centres.
 *
 * On top of the user's choice it honours a transient **position override** (see
 * {@link ../lib/dockOverrideStore}): when the Comparador scrolls into its audit
 * grid it asks the dock to glide to the left edge, clearing the top for the
 * sticky candidate strip. The move is animated as a directional cross-fade, and
 * unique `layoutId`s per position keep the active pill/orb from tearing during
 * the hand-off.
 *
 * The active module is marked by a spring "liquid pill" + glowing orb that glide
 * between items via shared `layoutId`s, and the picked icon redraws itself.
 */
export function FloatingDock({ active, onSelect, synced }: FloatingDockProps) {
  const { theme, toggle } = useTheme();
  const { dockPosition, dockSize, dockCollapsed } = useConfig();
  const override = useDockOverride();
  const vp = useViewport();

  // The override only takes effect if it differs from the user's own choice.
  const position: DockPosition = override ?? dockPosition;
  const vertical = position === "left" || position === "right";
  const sz = SIZE[dockSize];
  const showLabels = !vertical && vp.w >= 640;

  const setCollapsed = (v: boolean) => setConfig({ dockCollapsed: v });

  const CollapseIcon = vertical
    ? dockCollapsed
      ? position === "left"
        ? ChevronRight
        : ChevronLeft
      : position === "left"
        ? ChevronLeft
        : ChevronRight
    : dockCollapsed
      ? ChevronDown
      : ChevronUp;

  const off = slide(position);
  // Unique per position so two navs (old exiting + new entering) never share a
  // layoutId during the position hand-off.
  const pillId = `dock-active-pill-${position}`;
  const orbId = `dock-active-orb-${position}`;

  const navMotion = {
    initial: { opacity: 0, ...off, scale: 0.94 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    exit: { opacity: 0, ...off, scale: 0.94 },
    transition: { type: "spring" as const, stiffness: 240, damping: 24 },
  };

  return (
    <AnimatePresence mode="sync">
      {dockCollapsed ? (
        <motion.nav
          key={`collapsed-${position}`}
          {...navMotion}
          className={[
            "glass-heavy no-print fixed z-[100] flex items-center gap-1.5 rounded-[1.5rem] p-2",
            vertical ? "flex-col" : "flex-row",
            ANCHOR[position],
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expandir accesos directos"
            title="Expandir"
            className="flex items-center gap-1.5"
          >
            <span className={`grid ${sz.plate} shrink-0 place-items-center rounded-2xl bg-white shadow-glass ring-1 ring-black/5`}>
              <img src="/logo-bdp.svg" alt="BDP" className={`${sz.logo} object-contain`} />
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)]">
              <CollapseIcon className="h-4 w-4" />
            </span>
          </button>
        </motion.nav>
      ) : (
        <motion.nav
          key={`expanded-${position}`}
          {...navMotion}
          className={[
            "glass-heavy no-print fixed z-[100] flex items-center rounded-[1.75rem]",
            vertical ? "flex-col gap-1.5 overflow-y-auto px-2 py-2.5" : "flex-row gap-1.5 overflow-x-auto px-2.5 py-2 sm:gap-2 sm:px-3",
            ANCHOR[position],
          ].join(" ")}
        >
          {/* Logo plate */}
          <div className={`grid ${sz.plate} shrink-0 place-items-center rounded-2xl bg-white shadow-glass ring-1 ring-black/5`}>
            <img src="/logo-bdp.svg" alt="BDP" className={`${sz.logo} object-contain`} />
          </div>

          <Divider vertical={vertical} />

          {/* Navigation */}
          <ul className={`flex items-center ${vertical ? "flex-col gap-0.5" : "gap-0.5 sm:gap-1"}`}>
            {DOCK_ITEMS.map((item) => {
              const isActive = item.id === active;
              const Icon = item.icon;
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    aria-label={item.label}
                    title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(item.id)}
                    className={[
                      "relative flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 outline-none transition-transform duration-300 ease-spring hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-95",
                      vertical ? "w-[3rem]" : sz.btn,
                    ].join(" ")}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={pillId}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute inset-0 rounded-2xl bg-[color:var(--fill-2)] ring-1 ring-[color:var(--hairline)]"
                      />
                    )}
                    <span className={`relative grid place-items-center ${sz.plate}`}>
                      {isActive && (
                        <>
                          <motion.span
                            layoutId={orbId}
                            transition={{ type: "spring", stiffness: 360, damping: 28 }}
                            className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan ring-1 ring-white/50"
                          />
                          <motion.span
                            key={`burst-${active}`}
                            aria-hidden
                            initial={{ opacity: 0.55, scale: 0.45 }}
                            animate={{ opacity: 0, scale: 1.75 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="pointer-events-none absolute inset-0 rounded-full bg-cyan-300/70 blur-[2px]"
                          />
                        </>
                      )}
                      <DrawIcon
                        icon={Icon}
                        active={isActive}
                        className={[
                          sz.icon,
                          "relative transition-colors duration-300",
                          isActive ? "text-white drop-shadow-md" : "text-ink-soft",
                        ].join(" ")}
                        strokeWidth={isActive ? 2.4 : 2}
                      />
                    </span>
                    {showLabels && (
                      <span
                        className={[
                          "relative max-w-full truncate font-semibold leading-none transition-colors duration-300",
                          sz.label,
                          isActive ? "text-ink" : "text-ink-faint",
                        ].join(" ")}
                      >
                        {item.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <Divider vertical={vertical} />

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            className={`grid ${sz.plate} shrink-0 place-items-center rounded-2xl fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft active:scale-95`}
          >
            <motion.span
              key={theme}
              initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
              className="grid place-items-center"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5 text-amber-300" />
              ) : (
                <Moon className="h-5 w-5 text-[#005baa]" />
              )}
            </motion.span>
          </button>

          {/* DB sync status dot */}
          <div className="grid h-8 w-7 shrink-0 place-items-center" title={synced ? "Sincronizado" : "Sincronizando…"}>
            <span
              className={[
                "h-2.5 w-2.5 rounded-full",
                synced
                  ? "bg-green-500 shadow-glow-green animate-[pulse_2s_ease-in-out_infinite]"
                  : "bg-amber-400 shadow-glow-amber animate-[pulse_1s_ease-in-out_infinite]",
              ].join(" ")}
            />
          </div>

          <Divider vertical={vertical} />

          {/* Profile chip (logged-in person) */}
          <DockProfileChip plate={sz.plate} />

          <Divider vertical={vertical} />

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Contraer accesos directos"
            title="Contraer"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft active:scale-90"
          >
            <CollapseIcon className="h-4 w-4" />
          </button>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

function Divider({ vertical }: { vertical: boolean }) {
  return (
    <span
      className={
        vertical
          ? "my-0.5 hidden h-px w-9 shrink-0 bg-[color:var(--hairline)] sm:block"
          : "mx-0.5 hidden h-9 w-px shrink-0 bg-[color:var(--hairline)] sm:block"
      }
    />
  );
}
