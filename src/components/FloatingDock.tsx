import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { DOCK_ITEMS } from "../constants";
import { useTheme } from "../context/ThemeContext";
import { DrawIcon } from "./DrawIcon";
import type { ModuleId } from "../types";

interface FloatingDockProps {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  /** DB sync status — drives the glowing status dot. */
  synced: boolean;
}

/**
 * iOS-style floating dock. Each module shows its icon with a short label
 * underneath. The active module is marked by a glowing "liquid pill" plate plus
 * a filled blue "orb" behind its icon — both spring between items via shared
 * `layoutId`s, so the spotlight glides to whatever module is selected (it is no
 * longer pinned to Dashboard). When a module is picked its icon re-draws itself
 * in a contrasting white stroke, and a quick cyan burst flags the change. A
 * theme switch and the DB-sync dot live on the right.
 */
export function FloatingDock({ active, onSelect, synced }: FloatingDockProps) {
  const { theme, toggle } = useTheme();

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.1 }}
      className="glass-heavy no-print fixed left-1/2 top-4 z-[100] flex max-w-[96vw] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-[1.75rem] px-2.5 py-2 sm:gap-2 sm:px-3"
    >
      {/* Left — corporate logo plate */}
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white shadow-glass ring-1 ring-black/5">
        <img src="/logo-bdp.svg" alt="BDP" className="h-7 w-7 object-contain" />
      </div>

      <span className="mx-0.5 hidden h-9 w-px shrink-0 bg-[color:var(--hairline)] sm:block" />

      {/* Center — navigation */}
      <ul className="flex items-center gap-0.5 sm:gap-1">
        {DOCK_ITEMS.map((item) => {
          const isActive = item.id === active;
          const Icon = item.icon;
          return (
            <li key={item.id} className="relative">
              <button
                type="button"
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(item.id)}
                className="relative flex w-[3.6rem] flex-col items-center gap-1 rounded-2xl px-1 py-1.5 outline-none transition-transform duration-300 ease-spring hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-95 sm:w-[4.25rem]"
              >
                {isActive && (
                  <motion.span
                    layoutId="dock-active-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 rounded-2xl bg-[color:var(--fill-2)] ring-1 ring-[color:var(--hairline)]"
                  />
                )}
                <span className="relative grid h-9 w-9 place-items-center">
                  {isActive && (
                    <>
                      {/* The glowing orb — springs between items so the circle
                          + glow follows the selection instead of staying on
                          Dashboard. */}
                      <motion.span
                        layoutId="dock-active-orb"
                        transition={{ type: "spring", stiffness: 360, damping: 28 }}
                        className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan ring-1 ring-white/50"
                      />
                      {/* One-shot burst that replays on every selection. */}
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
                      "relative h-5 w-5 transition-colors duration-300",
                      isActive ? "text-white drop-shadow-md" : "text-ink-soft",
                    ].join(" ")}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                </span>
                <span
                  className={[
                    "relative max-w-full truncate text-[0.6rem] font-semibold leading-none transition-colors duration-300",
                    isActive ? "text-ink" : "text-ink-faint",
                  ].join(" ")}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <span className="mx-0.5 hidden h-9 w-px shrink-0 bg-[color:var(--hairline)] sm:block" />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
        title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:-translate-y-0.5 hover:fill-soft active:scale-95"
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
      <div className="grid h-10 w-7 shrink-0 place-items-center" title={synced ? "Sincronizado" : "Sincronizando…"}>
        <span
          className={[
            "h-2.5 w-2.5 rounded-full",
            synced
              ? "bg-green-500 shadow-glow-green animate-[pulse_2s_ease-in-out_infinite]"
              : "bg-amber-400 shadow-glow-amber animate-[pulse_1s_ease-in-out_infinite]",
          ].join(" ")}
        />
      </div>
    </motion.nav>
  );
}
