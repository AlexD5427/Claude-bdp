import { motion } from "framer-motion";
import { Crown, Medal } from "lucide-react";
import { rankLabel } from "../lib/candidateDisplay";

/**
 * The CAP-ranking insignia.
 *
 *   · **1st place** gets a lavish gold plate: a metallic gradient, a sweeping
 *     specular shimmer, a breathing golden aura and a crown — deliberately the
 *     most eye-catching element on screen.
 *   · **Everyone else** gets a clean silver plate with their ordinal position.
 *
 * Two shapes share the styling: {@link RankBadge} (a vertical plate for the
 * profile card) and {@link RankChip} (a compact horizontal pill for the
 * dedicated ranking row and the sticky strip).
 */

const GOLD =
  "from-amber-200 via-yellow-300 to-amber-500 text-[#4a3200] ring-amber-100/80";
const SILVER =
  "from-slate-50 via-slate-200 to-slate-400 text-slate-700 ring-white/80";

/** A sweeping specular highlight — only for the gold (1st place) insignia. */
function GoldSheen() {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <motion.span
        aria-hidden
        className="absolute -inset-y-2 -left-1/2 w-1/2 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/80 to-transparent"
        animate={{ left: ["-60%", "160%"] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.1 }}
      />
    </span>
  );
}

/** A soft, breathing aura behind the gold plate. */
function GoldAura() {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -inset-1 rounded-[inherit] bg-amber-300/50 blur-md"
      animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.96, 1.06, 0.96] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function RankBadge({ rank, cap }: { rank: number; cap: number | null }) {
  const first = rank === 1;
  const Icon = first ? Crown : Medal;
  return (
    <div className="relative">
      {first && <GoldAura />}
      <div
        className={[
          "relative flex w-[3.7rem] shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl bg-gradient-to-br px-1.5 py-2 text-center ring-1",
          first ? `${GOLD} shadow-[0_0_22px_rgba(251,191,36,0.7)]` : `${SILVER} shadow-[0_3px_12px_rgba(148,163,184,0.55)]`,
        ].join(" ")}
        title={`${rankLabel(rank)}${cap !== null ? ` · Nota CAP ${cap}%` : ""}`}
        aria-label={`${rankLabel(rank)}${cap !== null ? `, Nota CAP ${cap} por ciento` : ""}`}
      >
        {first && <GoldSheen />}
        <Icon className={`relative h-4 w-4 ${first ? "drop-shadow" : ""}`} />
        <span className="relative text-sm font-black leading-none">{rank}.º</span>
        <span className="relative text-[0.5rem] font-bold uppercase leading-none opacity-80">
          lugar
        </span>
        {cap !== null && (
          <span className="relative mt-0.5 rounded-full bg-black/15 px-1.5 py-0.5 text-[0.6rem] font-black leading-none">
            CAP {cap}%
          </span>
        )}
      </div>
    </div>
  );
}

export function RankChip({
  rank,
  cap,
  className = "",
}: {
  rank: number;
  cap: number | null;
  className?: string;
}) {
  const first = rank === 1;
  const Icon = first ? Crown : Medal;
  return (
    <span
      className={[
        "relative inline-flex items-center gap-1 overflow-hidden rounded-full bg-gradient-to-br px-2 py-0.5 text-[0.65rem] font-black ring-1",
        first ? `${GOLD} shadow-[0_0_14px_rgba(251,191,36,0.7)]` : `${SILVER} shadow-[0_2px_8px_rgba(148,163,184,0.5)]`,
        className,
      ].join(" ")}
      title={`${rankLabel(rank)}${cap !== null ? ` · CAP ${cap}%` : ""}`}
    >
      {first && <GoldSheen />}
      <Icon className="relative h-3 w-3" />
      <span className="relative">{rank}.º</span>
      {cap !== null && <span className="relative opacity-75">· {cap}%</span>}
    </span>
  );
}
