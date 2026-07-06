import { motion, type Transition } from "framer-motion";
import { avatarGradient, initials } from "../../lib/candidates";
import type { AvatarKind } from "../../lib/profilesStore";

type Size = "sm" | "md" | "lg";

interface ProfileAvatarProps {
  nombre: string;
  avatar: AvatarKind;
  size?: Size;
  /** When true, render decorations at rest (no looping idle animation). */
  staticMode?: boolean;
  className?: string;
}

const CIRCLE: Record<Size, string> = {
  sm: "h-10 w-10 text-xs",
  md: "h-24 w-24 text-2xl",
  lg: "h-32 w-32 text-4xl",
};

/** Scale factor so decorations grow with the avatar. */
const SCALE: Record<Size, number> = { sm: 0.42, md: 1, lg: 1.34 };

/**
 * A profile "photo" — a corporate-gradient circle with initials — wrapped in a
 * signature decorative animation per person (a crown, a cat, a stadium ball,
 * rising money, twinkling stars…). Each decoration has an entrance flourish and
 * a gentle looping idle. Passing `staticMode` freezes the idle loops for
 * low-powered devices while keeping the composition intact.
 *
 * Everything is pure SVG + transforms/opacity (no per-avatar WebGL), so it is
 * cheap and can't crash the page even with several avatars on screen.
 */
export function ProfileAvatar({
  nombre,
  avatar,
  size = "md",
  staticMode = false,
  className = "",
}: ProfileAvatarProps) {
  return (
    <div className={`relative grid place-items-center ${className}`}>
      <Decoration kind={avatar} size={size} staticMode={staticMode} />
      <div
        className={[
          "relative z-10 grid shrink-0 place-items-center rounded-full bg-gradient-to-br ring-2 ring-white/50 shadow-glass",
          avatarGradient(nombre),
          CIRCLE[size],
        ].join(" ")}
      >
        <span className="pointer-events-none absolute left-[15%] top-[15%] h-1/3 w-1/3 rounded-full bg-white/40 blur-[4px]" />
        <span className="select-none font-black leading-none text-white drop-shadow-md">
          {initials(nombre)}
        </span>
      </div>
    </div>
  );
}

/** Idle transition helper — infinite loop unless static. */
function idle(base: Transition, staticMode: boolean): Transition {
  return staticMode ? { duration: 0 } : base;
}

function Decoration({
  kind,
  size,
  staticMode,
}: {
  kind: AvatarKind;
  size: Size;
  staticMode: boolean;
}) {
  const s = SCALE[size];
  switch (kind) {
    case "corona":
      return <Corona s={s} staticMode={staticMode} />;
    case "gatito":
      return <Gatito s={s} staticMode={staticMode} />;
    case "balon":
      return <Balon s={s} staticMode={staticMode} />;
    case "billetes":
      return <Billetes s={s} staticMode={staticMode} />;
    case "estrellas":
      return <Estrellas s={s} staticMode={staticMode} />;
    case "pasante":
      return <Pasante s={s} staticMode={staticMode} />;
    case "admin":
      return <Admin s={s} staticMode={staticMode} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Alejandra — corona sobre pedestal                                   */
/* ------------------------------------------------------------------ */
function Corona({ s, staticMode }: { s: number; staticMode: boolean }) {
  return (
    <>
      {/* Pedestal glow under the avatar */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 rounded-full"
        style={{ width: 150 * s, height: 150 * s, background: "radial-gradient(circle, rgba(251,191,36,0.35), transparent 68%)" }}
        animate={staticMode ? {} : { opacity: [0.55, 0.9, 0.55], scale: [1, 1.06, 1] }}
        transition={idle({ duration: 4, repeat: Infinity, ease: "easeInOut" }, staticMode)}
      />
      {/* Crown */}
      <motion.svg
        aria-hidden
        viewBox="0 0 64 40"
        className="pointer-events-none absolute z-20"
        style={{ width: 56 * s, top: -30 * s, filter: "drop-shadow(0 3px 4px rgba(180,120,0,0.5))" }}
        initial={{ y: -26 * s, rotate: -24, opacity: 0, scale: 0.5 }}
        animate={
          staticMode
            ? { y: 0, rotate: 0, opacity: 1, scale: 1 }
            : { y: [0, -3 * s, 0], rotate: [-5, 5, -5], opacity: 1, scale: 1 }
        }
        transition={
          staticMode
            ? { duration: 0.6 }
            : { y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 4.5, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.6 }, scale: { type: "spring", stiffness: 200, damping: 12 } }
        }
      >
        <defs>
          <linearGradient id="crown-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M6 34 L4 12 L20 24 L32 6 L44 24 L60 12 L58 34 Z" fill="url(#crown-g)" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="4" cy="12" r="3" fill="#fbbf24" />
        <circle cx="32" cy="6" r="3.4" fill="#fbbf24" />
        <circle cx="60" cy="12" r="3" fill="#fbbf24" />
        <circle cx="20" cy="30" r="2" fill="#fff7ed" />
        <circle cx="44" cy="30" r="2" fill="#fff7ed" />
      </motion.svg>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rocío — gatito blanco                                               */
/* ------------------------------------------------------------------ */
function Gatito({ s, staticMode }: { s: number; staticMode: boolean }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 60 60"
      className="pointer-events-none absolute z-20"
      style={{ width: 46 * s, bottom: -16 * s, right: -12 * s, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))" }}
      initial={{ y: 24 * s, opacity: 0, scale: 0.4 }}
      animate={staticMode ? { y: 0, opacity: 1, scale: 1, rotate: 0 } : { y: 0, opacity: 1, scale: 1, rotate: [0, -7, 0, 6, 0] }}
      transition={staticMode ? { duration: 0.5 } : { y: { type: "spring", stiffness: 180, damping: 12 }, opacity: { duration: 0.5 }, scale: { type: "spring", stiffness: 180, damping: 12 }, rotate: { duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.6 } }}
    >
      {/* ears */}
      <path d="M14 16 L10 3 L24 12 Z" fill="#fff" stroke="#e2e8f0" strokeWidth="1" />
      <path d="M46 16 L50 3 L36 12 Z" fill="#fff" stroke="#e2e8f0" strokeWidth="1" />
      <path d="M14 14 L12 6 L20 11 Z" fill="#fbcfe8" />
      <path d="M46 14 L48 6 L40 11 Z" fill="#fbcfe8" />
      {/* head */}
      <circle cx="30" cy="34" r="20" fill="#fff" stroke="#e2e8f0" strokeWidth="1.2" />
      {/* eyes */}
      <motion.g
        animate={staticMode ? {} : { scaleY: [1, 1, 0.1, 1] }}
        transition={idle({ duration: 4.5, repeat: Infinity, times: [0, 0.85, 0.9, 1], ease: "easeInOut" }, staticMode)}
        style={{ transformOrigin: "30px 32px" }}
      >
        <circle cx="23" cy="32" r="2.6" fill="#0f172a" />
        <circle cx="37" cy="32" r="2.6" fill="#0f172a" />
      </motion.g>
      {/* nose + mouth */}
      <path d="M30 37 l-2.5 -2 h5 Z" fill="#f9a8d4" />
      <path d="M30 39 q-4 4 -8 1 M30 39 q4 4 8 1" stroke="#cbd5e1" strokeWidth="1" fill="none" />
      {/* whiskers */}
      <path d="M12 34 h10 M12 39 h10 M48 34 h-10 M48 39 h-10" stroke="#e2e8f0" strokeWidth="0.8" />
    </motion.svg>
  );
}

/* ------------------------------------------------------------------ */
/* Mayra — luces de estadio + balón (Mundial 2026)                     */
/* ------------------------------------------------------------------ */
function Balon({ s, staticMode }: { s: number; staticMode: boolean }) {
  return (
    <>
      {/* Stadium light beams */}
      {[-1, 1].map((dir) => (
        <motion.span
          key={dir}
          aria-hidden
          className="pointer-events-none absolute -z-0"
          style={{
            top: -34 * s,
            left: "50%",
            width: 30 * s,
            height: 120 * s,
            background: "linear-gradient(to bottom, rgba(56,189,248,0.5), transparent 75%)",
            transformOrigin: "top center",
            borderRadius: 8,
          }}
          initial={{ opacity: 0 }}
          animate={staticMode ? { opacity: 0.5, rotate: dir * 18, x: dir * 8 * s } : { opacity: [0.25, 0.6, 0.25], rotate: [dir * 12, dir * 24, dir * 12], x: dir * 8 * s }}
          transition={idle({ duration: 4, repeat: Infinity, ease: "easeInOut", delay: dir === 1 ? 0.4 : 0 }, staticMode)}
        />
      ))}
      {/* Ball */}
      <motion.svg
        aria-hidden
        viewBox="0 0 48 48"
        className="pointer-events-none absolute z-20"
        style={{ width: 40 * s, bottom: -18 * s, right: -14 * s, filter: "drop-shadow(0 3px 3px rgba(0,0,0,0.3))" }}
        initial={{ y: -30 * s, opacity: 0, rotate: -90 }}
        animate={staticMode ? { y: 0, opacity: 1, rotate: 0 } : { y: [0, -10 * s, 0], opacity: 1, rotate: [0, 18, 0] }}
        transition={staticMode ? { duration: 0.5 } : { y: { duration: 1.1, repeat: Infinity, ease: [0.4, 0, 0.5, 1] }, rotate: { duration: 2.2, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.5 } }}
      >
        <circle cx="24" cy="24" r="22" fill="#fff" stroke="#0ea5e9" strokeWidth="1.5" />
        <path d="M24 8 l9 7 -3.5 11 h-11 L15 15 Z" fill="#0f172a" />
        <path d="M24 8 l9 7" stroke="#22d3ee" strokeWidth="2" />
        <path d="M15 15 l-8 6" stroke="#f43f5e" strokeWidth="2" />
        <path d="M33 15 l8 6" stroke="#22c55e" strokeWidth="2" />
        <circle cx="24" cy="24" r="22" fill="none" stroke="#0284c7" strokeWidth="1.5" />
      </motion.svg>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Alexander — billetes + flechas hacia arriba                         */
/* ------------------------------------------------------------------ */
function Billetes({ s, staticMode }: { s: number; staticMode: boolean }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`arrow-${i}`}
          aria-hidden
          className="pointer-events-none absolute z-20 font-black text-emerald-400"
          style={{ fontSize: 15 * s, left: `${18 + i * 26}%`, top: -8 * s }}
          initial={{ opacity: 0, y: 0 }}
          animate={staticMode ? { opacity: 0.8, y: -8 * s } : { opacity: [0, 1, 0], y: [6 * s, -22 * s] }}
          transition={idle({ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: i * 0.4 }, staticMode)}
        >
          ▲
        </motion.div>
      ))}
      {[0, 1].map((i) => (
        <motion.div
          key={`bill-${i}`}
          aria-hidden
          className="pointer-events-none absolute z-20 grid place-items-center rounded-[3px] bg-gradient-to-br from-emerald-400 to-green-600 font-black text-white ring-1 ring-emerald-200/60"
          style={{ width: 26 * s, height: 15 * s, fontSize: 10 * s, bottom: (-14 - i * 4) * s, right: (-10 + i * 6) * s, rotate: `${i ? 10 : -8}deg` }}
          initial={{ opacity: 0, scale: 0.4, y: 10 * s }}
          animate={staticMode ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: [1, 1.12, 1], y: [0, -3 * s, 0] }}
          transition={staticMode ? { duration: 0.5 } : { opacity: { duration: 0.5 }, scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }, y: { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 } }}
        >
          $
        </motion.div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ximena — estrellitas y brillos                                      */
/* ------------------------------------------------------------------ */
function Estrellas({ s, staticMode }: { s: number; staticMode: boolean }) {
  const stars = [
    { x: -6, y: -8, d: 0, size: 16 },
    { x: 92, y: 4, d: 0.5, size: 12 },
    { x: 4, y: 84, d: 1, size: 11 },
    { x: 88, y: 82, d: 0.8, size: 14 },
    { x: 50, y: -20, d: 0.3, size: 10 },
  ];
  return (
    <>
      {stars.map((st, i) => (
        <motion.svg
          key={i}
          aria-hidden
          viewBox="0 0 24 24"
          className="pointer-events-none absolute z-20"
          style={{ width: st.size * s, left: `${st.x}%`, top: `${st.y}%`, color: "#fde68a", filter: "drop-shadow(0 0 4px rgba(253,224,71,0.8))" }}
          initial={{ opacity: 0, scale: 0 }}
          animate={staticMode ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: [0.4, 1, 0.4], scale: [0.7, 1.15, 0.7], rotate: [0, 180, 360] }}
          transition={staticMode ? { duration: 0.5 } : { opacity: { duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: st.d }, scale: { duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: st.d }, rotate: { duration: 7, repeat: Infinity, ease: "linear", delay: st.d } }}
        >
          <path fill="currentColor" d="M12 1 l2.9 6.6 L22 8.6 l-5 4.8 1.3 7.1 L12 17.1 5.7 20.5 7 13.4 2 8.6 l7.1 -1 Z" />
        </motion.svg>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pasante / Administrador — decoraciones sobrias                      */
/* ------------------------------------------------------------------ */
function Pasante({ s, staticMode }: { s: number; staticMode: boolean }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 64 40"
      className="pointer-events-none absolute z-20"
      style={{ width: 50 * s, top: -24 * s }}
      initial={{ y: -20 * s, opacity: 0, rotate: -10 }}
      animate={staticMode ? { y: 0, opacity: 1, rotate: 0 } : { y: [0, -3 * s, 0], opacity: 1, rotate: [-3, 3, -3] }}
      transition={staticMode ? { duration: 0.5 } : { y: { duration: 3, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.5 } }}
    >
      <path d="M32 6 L60 16 L32 26 L4 16 Z" fill="#1e293b" stroke="#0ea5e9" strokeWidth="1.5" />
      <path d="M32 26 L32 34" stroke="#0ea5e9" strokeWidth="1.5" />
      <circle cx="32" cy="35" r="2.5" fill="#fbbf24" />
    </motion.svg>
  );
}

function Admin({ s, staticMode }: { s: number; staticMode: boolean }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 40 44"
      className="pointer-events-none absolute z-20"
      style={{ width: 34 * s, top: -22 * s, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))" }}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={staticMode ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 1, opacity: 1, rotate: [-4, 4, -4] }}
      transition={staticMode ? { duration: 0.5 } : { scale: { type: "spring", stiffness: 200, damping: 12 }, opacity: { duration: 0.5 }, rotate: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}
    >
      <path d="M20 2 L36 8 V22 C36 32 28 40 20 42 C12 40 4 32 4 22 V8 Z" fill="#0ea5e9" stroke="#0369a1" strokeWidth="1.5" />
      <path d="M14 21 l4 4 8 -9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}
