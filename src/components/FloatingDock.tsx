import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { DOCK_ITEMS } from "../constants";
import { useTheme } from "../context/ThemeContext";
import type { ModuleId } from "../types";

interface FloatingDockProps {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  /** DB sync status — drives the glowing status dot. */
  synced: boolean;
}

/**
 * iOS-style floating dock. Icons only; labels appear as tooltips on hover.
 * The active module is marked by a glowing "liquid pill" that springs between
 * items using a shared `layoutId`. A theme switch and the DB-sync dot live on
 * the right.
 */
export function FloatingDock({ active, onSelect, synced }: FloatingDockProps) {
  const { theme, toggle } = useTheme();

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 22, delay: 0.1 }}
      className="glass-heavy no-print fixed left-1/2 top-6 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4"
    >
      {/* Left — corporate logo */}
      <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#00b0d8] via-[#005baa] to-[#004a8f] shadow-glow-cyan ring-1 ring-white/40">
        <img src="/logo.svg" alt="BDP" className="h-6 w-6" />
      </div>

      <span className="mx-1 hidden h-7 w-px bg-[color:var(--hairline)] sm:block" />

      {/* Center — icon-only navigation */}
      <ul className="flex items-center gap-1 sm:gap-1.5">
        {DOCK_ITEMS.map((item) => {
          const isActive = item.id === active;
          const Icon = item.icon;
          return (
            <li key={item.id} className="group relative">
              <button
                type="button"
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(item.id)}
                className="relative grid h-11 w-11 transform-gpu place-items-center rounded-full outline-none transition-all duration-500 ease-spring hover:-translate-y-1 hover:scale-[1.06] focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-95"
              >
                {isActive && (
                  <motion.span
                    layoutId="dock-active-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 26 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glow-cyan ring-1 ring-white/50"
                  />
                )}
                <Icon
                  className={[
                    "relative z-10 h-5 w-5 transition-colors duration-300",
                    isActive ? "text-white drop-shadow-md" : "text-ink-soft group-hover:text-ink",
                  ].join(" ")}
                  strokeWidth={isActive ? 2.4 : 2}
                />
              </button>

              {/* Tooltip */}
              <span className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-full bg-slate-900/85 px-3 py-1 text-xs font-semibold text-white opacity-0 shadow-glass ring-1 ring-white/10 backdrop-blur-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>

      <span className="mx-1 hidden h-7 w-px bg-[color:var(--hairline)] sm:block" />

      {/* Theme toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
        title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        className="group relative grid h-10 w-10 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:-translate-y-0.5 hover:fill-soft active:scale-95"
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
      <div className="grid h-10 w-9 place-items-center">
        {synced ? (
          <div
            title="Sincronizado"
            className="h-3 w-3 rounded-full bg-green-500 shadow-glow-green animate-[pulse_2s_ease-in-out_infinite]"
          />
        ) : (
          <div
            title="Sincronizando…"
            className="h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,1)] animate-[pulse_1s_ease-in-out_infinite]"
          />
        )}
      </div>
    </motion.nav>
  );
}
