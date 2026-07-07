import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { ArrowLeft, Loader2, Lock, LogIn, MonitorSmartphone, Sparkles, ShieldCheck } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import { MeshBackground } from "../MeshBackground";
import { ThreeBackground } from "../ThreeBackground";
import { useTalentData } from "../../context/TalentDataContext";
import { useConfig, setConfig } from "../../lib/configStore";
import { attemptLogin, useProfiles, type Perfil } from "../../lib/profilesStore";

/**
 * The Netflix-style profile gate — now a fully immersive Liquid Glass stage.
 *
 * It appears immediately on load, before the data has finished syncing, showing
 * every registered profile with its signature animated avatar. Behind the
 * profiles sit three depth layers: the CSS mesh, the Three.js WebGL "liquid"
 * engine, and a bespoke aurora (rotating conic light + drifting orbs + a subtle
 * parallax grid). Profile tiles tilt in 3D toward the cursor; picking one glides
 * its avatar to centre stage (a shared layout transition) inside a glass console
 * and unfolds a password field wreathed in a rotating halo. A correct login lets
 * the whole screen expand away to reveal the app.
 */
export function LoginScreen() {
  const { profiles } = useProfiles();
  const { syncing, status, candidatos, lastSyncedAt } = useTalentData();
  const { staticAvatars, reduceMotion } = useConfig();
  const prefersReduced = useReducedMotion();
  const calm = Boolean(reduceMotion || prefersReduced);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focused = profiles.find((p) => p.id === focusedId) ?? null;

  return (
    <motion.div
      className="fixed inset-0 z-[300] overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: "blur(6px)" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <MeshBackground />
      <ThreeBackground />
      <LoginAurora calm={calm} />

      <div className="relative flex min-h-screen flex-col items-center px-4 py-10">
        {/* Brand */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-glass ring-1 ring-black/5">
            <img src="/logo-bdp.svg" alt="BDP" className="h-8 w-8 object-contain" />
            {!calm && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-2xl ring-1 ring-cyan-300/40"
                animate={{ opacity: [0.25, 0.7, 0.25], scale: [1, 1.08, 1] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </span>
          <div className="leading-tight">
            <div className="text-lg font-black tracking-tight text-ink">Banco de Desarrollo Productivo</div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Reclutamiento y Selección
            </div>
          </div>
        </motion.div>

        {/* Glass console holding the profiles / focused login */}
        <div className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center py-8">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.08 }}
            className="glass-heavy glow relative w-full overflow-hidden rounded-[2rem] px-5 py-8 sm:px-10 sm:py-10"
          >
            {/* Top specular sweep */}
            <span className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/15 to-transparent" />
            <AnimatePresence mode="wait">
              {focused ? (
                <FocusedProfile
                  key="focused"
                  profile={focused}
                  staticMode={staticAvatars}
                  calm={calm}
                  onBack={() => setFocusedId(null)}
                />
              ) : (
                <ProfileGrid
                  key="grid"
                  profiles={profiles}
                  staticMode={staticAvatars}
                  calm={calm}
                  onPick={setFocusedId}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Footer: sync status + static-mode switch */}
        <div className="flex w-full max-w-5xl flex-wrap items-center justify-center gap-3 pt-4">
          <SyncPill syncing={syncing} status={status} count={candidatos.length} lastSyncedAt={lastSyncedAt} />
          <button
            type="button"
            role="switch"
            aria-checked={staticAvatars}
            onClick={() => setConfig({ staticAvatars: !staticAvatars })}
            className={[
              "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ring-1 transition-all active:scale-95",
              staticAvatars
                ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/30 shadow-glow-cyan"
                : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft",
            ].join(" ")}
            title="Desactiva las animaciones de los avatares para equipos de menor potencia."
          >
            <MonitorSmartphone className="h-4 w-4" />
            {staticAvatars ? "Modo estático activado" : "Modo estático"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Decorative atmosphere — rotating aurora + drifting orbs + grid.     */
/* ------------------------------------------------------------------ */

function LoginAurora({ calm }: { calm: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
      {/* Parallax grid, faint. */}
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--ink)_1px,transparent_1px),linear-gradient(90deg,var(--ink)_1px,transparent_1px)] [background-size:46px_46px]" />

      {/* A giant, slow conic aurora sweep behind everything. */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(0,176,216,0.28), rgba(0,91,170,0.12), rgba(125,211,252,0.24), rgba(0,74,143,0.14), rgba(0,176,216,0.28))",
        }}
        animate={calm ? undefined : { rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />

      {/* Drifting orbs. */}
      {!calm &&
        [
          { c: "#00b0d8", s: 320, x: "12%", y: "18%", d: 0 },
          { c: "#005baa", s: 380, x: "80%", y: "26%", d: -6 },
          { c: "#7dd3fc", s: 300, x: "62%", y: "78%", d: -11 },
        ].map((o, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full blur-[90px]"
            style={{ width: o.s, height: o.s, left: o.x, top: o.y, backgroundColor: o.c, opacity: 0.22 }}
            animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: o.d }}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3D tilt helper                                                      */
/* ------------------------------------------------------------------ */

function useTilt(disabled: boolean) {
  const rx = useSpring(0, { stiffness: 150, damping: 16 });
  const ry = useSpring(0, { stiffness: 150, damping: 16 });
  const onMove = (e: React.MouseEvent) => {
    if (disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 16);
    rx.set(-(py - 0.5) * 16);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };
  return { rx, ry, onMove, reset };
}

/* ------------------------------------------------------------------ */

function ProfileGrid({
  profiles,
  staticMode,
  calm,
  onPick,
}: {
  profiles: Perfil[];
  staticMode: boolean;
  calm: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      <h1 className="mb-1 text-center text-2xl font-black tracking-tight text-ink sm:text-3xl">
        ¿Quién ingresa?
      </h1>
      <p className="mb-8 text-center text-sm text-ink-soft">
        Seleccione su perfil para acceder al sistema de reclutamiento.
      </p>
      <motion.div
        className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
      >
        {profiles.map((p) => (
          <ProfileTile key={p.id} profile={p} staticMode={staticMode} calm={calm} onPick={onPick} />
        ))}
      </motion.div>
    </motion.div>
  );
}

function ProfileTile({
  profile: p,
  staticMode,
  calm,
  onPick,
}: {
  profile: Perfil;
  staticMode: boolean;
  calm: boolean;
  onPick: (id: string) => void;
}) {
  const { rx, ry, onMove, reset } = useTilt(calm);
  return (
    <motion.button
      type="button"
      onClick={() => onPick(p.id)}
      onMouseMove={onMove}
      onMouseLeave={reset}
      variants={{
        hidden: { opacity: 0, y: 24, scale: 0.9 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 240, damping: 20 } },
      }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.97 }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className="group glass glow relative flex flex-col items-center gap-3 rounded-3xl p-4 outline-none transition-shadow duration-300 hover:shadow-glow-cyan focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      <motion.div layoutId={`avatar-${p.id}`} className="grid place-items-center [transform:translateZ(30px)]">
        <ProfileAvatar nombre={p.nombre} avatar={p.avatar} size="md" staticMode={staticMode} />
      </motion.div>
      <div className="text-center [transform:translateZ(18px)]">
        <div className="text-sm font-black text-ink transition-colors group-hover:text-cyan-400 sm:text-base">
          {p.nombre}
        </div>
        <div className="mt-0.5 text-[0.7rem] leading-tight text-ink-soft">{p.cargo}</div>
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */

function FocusedProfile({
  profile,
  staticMode,
  calm,
  onBack,
}: {
  profile: Perfil;
  staticMode: boolean;
  calm: boolean;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await attemptLogin(profile.id, password);
    if (!res.ok) {
      setError(res.error ?? "No se pudo iniciar sesión.");
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-md flex-col items-center"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 self-start rounded-full fill-softer px-3.5 py-2 text-sm font-bold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" />
        Cambiar de perfil
      </button>

      {/* Avatar wreathed in a rotating conic halo. */}
      <div className="relative grid place-items-center">
        {!calm && (
          <span
            aria-hidden
            className="absolute h-40 w-40 rounded-full opacity-70 blur-[6px] animate-spin [animation-duration:7s]"
            style={{
              background:
                "conic-gradient(from 0deg, #22d3ee, #005baa, #7dd3fc, #00b0d8, #22d3ee)",
              maskImage: "radial-gradient(circle, transparent 58%, #000 60%, #000 72%, transparent 74%)",
              WebkitMaskImage:
                "radial-gradient(circle, transparent 58%, #000 60%, #000 72%, transparent 74%)",
            }}
          />
        )}
        <motion.div layoutId={`avatar-${profile.id}`} className="relative grid place-items-center">
          <ProfileAvatar nombre={profile.nombre} avatar={profile.avatar} size="lg" staticMode={staticMode} />
        </motion.div>
      </div>

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-6 text-2xl font-black tracking-tight text-ink"
      >
        {profile.nombre}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="mt-1 text-sm text-ink-soft"
      >
        {profile.cargo}
      </motion.p>

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, type: "spring", stiffness: 220, damping: 22 }}
        className="mt-6 w-full"
      >
        <motion.div
          animate={error ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="glass flex items-center gap-2 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-cyan-400/70"
        >
          <Lock className="h-4 w-4 shrink-0 text-ink-soft" />
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Contraseña"
            autoComplete="current-password"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
          />
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 text-center text-xs font-semibold text-rose-400"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-6 py-3 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all duration-500 ease-spring hover:-translate-y-0.5 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Ingresando…
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Iniciar sesión
            </>
          )}
        </button>
        {!profile.tienePassword && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[0.7rem] text-ink-faint">
            <Sparkles className="h-3 w-3 text-cyan-400" />
            La primera contraseña que ingrese quedará guardada en este equipo.
          </p>
        )}
      </motion.form>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function SyncPill({
  syncing,
  status,
  count,
  lastSyncedAt,
}: {
  syncing: boolean;
  status: string;
  count: number;
  lastSyncedAt: string | null;
}) {
  const synced = status === "success" && !syncing;
  const label = syncing
    ? "Sincronizando datos de la base…"
    : status === "error"
      ? "Sin conexión con la base — reintentando"
      : `Datos sincronizados · ${count} registro(s)`;
  return (
    <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-xs font-semibold text-ink-soft">
      <span
        className={[
          "grid h-4 w-4 place-items-center rounded-full",
          synced ? "text-emerald-400" : status === "error" ? "text-rose-400" : "text-amber-400",
        ].join(" ")}
      >
        {synced ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <span
            className={[
              "h-2.5 w-2.5 rounded-full",
              status === "error"
                ? "bg-rose-500"
                : "animate-[pulse_1s_ease-in-out_infinite] bg-amber-400 shadow-glow-amber",
            ].join(" ")}
          />
        )}
      </span>
      {label}
      {synced && lastSyncedAt && (
        <span className="text-ink-faint">
          · {new Date(lastSyncedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </span>
  );
}
