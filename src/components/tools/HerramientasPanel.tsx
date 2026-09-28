import { useEffect, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { bloquearScroll } from "../../lib/scrollLock";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Globe,
  UserPlus,
  Route,
  ScanSearch,
  UsersRound,
  ShieldBan,
  X,
  ArrowUpRight,
} from "lucide-react";
import { useToolsOpen, closeTools } from "../../lib/toolsStore";
import { DrawIcon } from "../DrawIcon";
import { UTILIDADES } from "../../config/google";

interface Tool {
  label: string;
  url: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number | string }>;
  /** Tailwind gradient for the icon tile — an app-grid feel. */
  gradient: string;
  glow: string;
}

/**
 * Apariencia de cada utilidad: icono, degradado y resplandor.
 *
 * Las DIRECCIONES no están aquí. Viven en `src/config/google.ts` con el resto de
 * lo que depende de la cuenta de Google, porque son exactamente el tipo de cosa
 * que una migración de cuenta olvida: son un sitio de Google, dos formularios y
 * tres aplicaciones web que el área ya usaba, y el día que la cuenta antigua se
 * cierre dejan de abrir sin que el panel pueda saberlo. Aquí queda solo lo que
 * es de esta pantalla, emparejado por la clave estable de cada utilidad.
 */
const APARIENCIA: Record<string, Omit<Tool, "label" | "url">> = {
  sitio: {
    icon: Globe,
    gradient: "from-[#00b0d8] to-[#005baa]",
    glow: "shadow-[0_0_28px_rgba(0,176,216,0.55)]",
  },
  "registro-postulantes": {
    icon: UserPlus,
    gradient: "from-emerald-400 to-teal-600",
    glow: "shadow-[0_0_28px_rgba(16,185,129,0.5)]",
  },
  "seguimiento-procesos": {
    icon: Route,
    gradient: "from-indigo-400 to-violet-600",
    glow: "shadow-[0_0_28px_rgba(129,140,248,0.5)]",
  },
  "buscador-perfiles": {
    icon: ScanSearch,
    gradient: "from-fuchsia-400 to-purple-600",
    glow: "shadow-[0_0_28px_rgba(217,70,239,0.45)]",
  },
  "buscador-funcionarios": {
    icon: UsersRound,
    gradient: "from-amber-400 to-orange-600",
    glow: "shadow-[0_0_28px_rgba(251,146,60,0.5)]",
  },
  "lista-negra": {
    icon: ShieldBan,
    gradient: "from-rose-400 to-red-600",
    glow: "shadow-[0_0_28px_rgba(244,63,94,0.5)]",
  },
};

/** Aspecto de una utilidad que el inventario trae y esta pantalla no conoce. */
const APARIENCIA_NEUTRA: Omit<Tool, "label" | "url"> = {
  icon: Globe,
  gradient: "from-slate-400 to-slate-600",
  glow: "shadow-[0_0_28px_rgba(148,163,184,0.45)]",
};

/**
 * Las utilidades externas listas para pintar. Cada una abre en una pestaña nueva
 * y su dirección nunca se muestra como texto: en la interfaz solo aparece el
 * nombre.
 */
const TOOLS: Tool[] = UTILIDADES.map((u) => ({
  label: u.etiqueta,
  url: u.url,
  ...(APARIENCIA[u.clave] ?? APARIENCIA_NEUTRA),
}));

/**
 * "Herramientas" — an iOS-style Quick Settings panel.
 *
 * Mounted once at the app root and toggled from the floating dock. It blurs the
 * page behind a translucent Liquid Glass sheet and reveals every external tool
 * as a luminous app tile: hovering lights the icon (which also re-draws itself)
 * and the label reveals word by word. It sits *below* the dock (z-90) so the
 * dock stays on top with the other shortcuts dimmed, momentarily restricting
 * navigation until the panel is dismissed (backdrop click, close button or Esc).
 */
export function HerramientasPanel() {
  const open = useToolsOpen();
  return createPortal(
    <AnimatePresence>{open && <Panel key="tools-panel" />}</AnimatePresence>,
    document.body,
  );
}

function Panel() {
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTools();
    };
    document.addEventListener("keydown", onKey);
    // Candado con recuento: apilar este panel sobre otra superposición y cerrarlos
    // en cualquier orden ya no puede dejar la página sin scroll.
    const liberarScroll = bloquearScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      liberarScroll();
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Herramientas"
    >
      {/* Backdrop — clicking the blurred void closes the panel. */}
      <motion.div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-2xl"
        onClick={() => closeTools()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      <motion.div
        className="glass-heavy relative z-10 w-full max-w-3xl overflow-hidden rounded-[2.25rem] p-6 sm:p-8"
        initial={{ opacity: 0, y: 28, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        {/* Drifting sheen orbs for depth. */}
        {!reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl"
            animate={{ x: [0, 24, 0], y: [0, 18, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Header */}
        <div className="relative mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 inline-flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-glow-cyan" />
              Accesos rápidos
            </p>
            <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              <RevealText text="Herramientas" per="char" />
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Abre en una nueva pestaña las utilidades del equipo de Reclutamiento y Selección.
            </p>
          </div>
          <button
            type="button"
            onClick={() => closeTools()}
            aria-label="Cerrar herramientas"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full fill-softer text-ink ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:fill-soft hover:rotate-90 active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tool grid */}
        <motion.ul
          className="relative grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
        >
          {TOOLS.map((tool) => (
            <ToolTile key={tool.label} tool={tool} reduce={Boolean(reduce)} />
          ))}
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}

function ToolTile({ tool, reduce }: { tool: Tool; reduce: boolean }) {
  const Icon = tool.icon;
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 18, scale: 0.9 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 24 } },
      }}
    >
      <a
        href={tool.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => closeTools()}
        className="group relative flex h-full flex-col items-center gap-3 rounded-3xl fill-soft p-4 text-center ring-1 ring-[color:var(--hairline)] transition-all duration-500 ease-spring hover:-translate-y-1.5 hover:fill-softer hover:ring-cyan-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <ArrowUpRight className="absolute right-2.5 top-2.5 h-4 w-4 text-ink-faint opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span
          className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${tool.gradient} ring-1 ring-white/30 transition-all duration-500 ease-spring group-hover:scale-110 group-hover:${tool.glow}`}
        >
          <DrawIcon
            icon={Icon}
            active={false}
            redrawOnHover
            className="h-7 w-7 text-white drop-shadow-md"
            strokeWidth={2.2}
          />
        </span>
        <span className="text-[0.78rem] font-bold leading-tight text-ink">
          {reduce ? tool.label : <RevealText text={tool.label} per="word" />}
        </span>
      </a>
    </motion.li>
  );
}

/**
 * A premium, discreet text reveal. Splits the text into words (or characters)
 * and rises each fragment into place with a soft spring stagger.
 */
function RevealText({ text, per = "word" }: { text: string; per?: "word" | "char" }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{text}</>;
  const parts = per === "char" ? [...text] : text.split(/(\s+)/);
  return (
    <span aria-label={text} className="inline-flex flex-wrap">
      {parts.map((p, i) =>
        /^\s+$/.test(p) ? (
          <span key={i}>&nbsp;</span>
        ) : (
          <motion.span
            key={i}
            aria-hidden
            className="inline-block"
            initial={{ opacity: 0, y: "0.5em" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * (per === "char" ? 0.03 : 0.05), type: "spring", stiffness: 320, damping: 26 }}
          >
            {p}
          </motion.span>
        ),
      )}
    </span>
  );
}
