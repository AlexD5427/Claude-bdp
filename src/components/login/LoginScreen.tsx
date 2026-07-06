import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Lock, LogIn, MonitorSmartphone, Sparkles } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import { MeshBackground } from "../MeshBackground";
import { useTalentData } from "../../context/TalentDataContext";
import { useConfig, setConfig } from "../../lib/configStore";
import { attemptLogin, useProfiles, type Perfil } from "../../lib/profilesStore";

/**
 * The Netflix-style profile gate. It appears immediately on load — before the
 * data has finished syncing — showing every registered profile with its
 * signature animated avatar. Picking one glides it to centre stage (a shared
 * layout transition) and unfolds a password field; a correct login lets the
 * screen expand away to reveal the app. A live sync indicator reassures the
 * operator that the database is loading in the background, and a static-mode
 * switch disables the idle animations on low-powered devices.
 */
export function LoginScreen() {
  const { profiles } = useProfiles();
  const { syncing, status, candidatos, lastSyncedAt } = useTalentData();
  const { staticAvatars } = useConfig();
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
      <div className="relative flex min-h-screen flex-col items-center px-4 py-10">
        {/* Brand */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-glass ring-1 ring-black/5">
            <img src="/logo-bdp.svg" alt="BDP" className="h-8 w-8 object-contain" />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-black tracking-tight text-ink">Banco de Desarrollo Productivo</div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
              Reclutamiento y Selección
            </div>
          </div>
        </motion.div>

        <div className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center py-8">
          <AnimatePresence mode="wait">
            {focused ? (
              <FocusedProfile
                key="focused"
                profile={focused}
                staticMode={staticAvatars}
                onBack={() => setFocusedId(null)}
              />
            ) : (
              <ProfileGrid
                key="grid"
                profiles={profiles}
                staticMode={staticAvatars}
                onPick={setFocusedId}
              />
            )}
          </AnimatePresence>
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

function ProfileGrid({
  profiles,
  staticMode,
  onPick,
}: {
  profiles: Perfil[];
  staticMode: boolean;
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
      <h1 className="mb-8 text-center text-2xl font-black tracking-tight text-ink sm:text-3xl">
        ¿Quién ingresa?
      </h1>
      <motion.div
        className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
      >
        {profiles.map((p) => (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            variants={{
              hidden: { opacity: 0, y: 24, scale: 0.9 },
              show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 240, damping: 20 } },
            }}
            whileHover={{ y: -6, scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="group flex flex-col items-center gap-3 rounded-3xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <motion.div layoutId={`avatar-${p.id}`} className="grid place-items-center">
              <ProfileAvatar nombre={p.nombre} avatar={p.avatar} size="md" staticMode={staticMode} />
            </motion.div>
            <div className="text-center">
              <div className="text-sm font-black text-ink transition-colors group-hover:text-cyan-400 sm:text-base">
                {p.nombre}
              </div>
              <div className="mt-0.5 text-[0.7rem] leading-tight text-ink-soft">{p.cargo}</div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

function FocusedProfile({
  profile,
  staticMode,
  onBack,
}: {
  profile: Perfil;
  staticMode: boolean;
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
      // A short shake communicates the rejection.
      inputRef.current?.focus();
    }
    // On success the store sets the session; App unmounts this screen with its
    // own expand-away exit animation.
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-full max-w-md flex-col items-center"
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 self-start rounded-full fill-softer px-3.5 py-2 text-sm font-bold text-ink-soft ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" />
        Cambiar de perfil
      </button>

      <motion.div layoutId={`avatar-${profile.id}`} className="grid place-items-center">
        <ProfileAvatar nombre={profile.nombre} avatar={profile.avatar} size="lg" staticMode={staticMode} />
      </motion.div>

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
          "h-2.5 w-2.5 rounded-full",
          synced
            ? "bg-green-500 shadow-glow-green"
            : status === "error"
              ? "bg-rose-500"
              : "animate-[pulse_1s_ease-in-out_infinite] bg-amber-400 shadow-glow-amber",
        ].join(" ")}
      />
      {label}
      {synced && lastSyncedAt && (
        <span className="text-ink-faint">
          · {new Date(lastSyncedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </span>
  );
}
