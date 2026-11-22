import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CircleCheck, Loader2, Lock, LogIn, MonitorSmartphone, WifiOff } from "lucide-react";
import { ProfileAvatar } from "./ProfileAvatar";
import { useTalentData } from "../../context/TalentDataContext";
import { useConfig, setConfig } from "../../lib/configStore";
import { attemptLogin, useProfiles, type Perfil } from "../../lib/profilesStore";

export function LoginScreen() {
  const { profiles } = useProfiles();
  const { syncing, status, connection, candidatos, lastSyncedAt } = useTalentData();
  const { staticAvatars, reduceMotion } = useConfig();
  const systemReduced = useReducedMotion();
  const calm = Boolean(reduceMotion || systemReduced);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const lastPicked = useRef<string | null>(null);
  const focused = profiles.find((p) => p.id === focusedId);
  const offline = connection === "sin-conexion" || status === "error";
  const synced = !offline && status === "success" && !syncing;
  const state = offline ? "offline" : synced ? "online" : "busy";
  const SyncIcon = offline ? WifiOff : synced ? CircleCheck : Loader2;
  const time = synced && lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Al volver al selector, el teclado regresa al perfil que lo abrió.
  useEffect(() => {
    if (focused || lastPicked.current === null) return;
    document.getElementById(`bdp-auth-${lastPicked.current}`)?.focus();
    lastPicked.current = null;
  }, [focused]);

  return (
    <motion.div
      className="bdp-login fixed inset-0 z-[300] overflow-y-auto"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: calm ? 0 : .23 }}
    >
      <main className="bdp-login__frame">
        <header className="bdp-login__brand">
          <img src="/logo-bdp.svg" alt="" />
          <span>Banco de Desarrollo Productivo</span>
        </header>

        <div className="bdp-login__layout">
          <section className="bdp-login__story" aria-labelledby="bdp-login-title">
            <div className="bdp-prism" aria-hidden="true"><span /></div>
            <p className="bdp-eyebrow">Espacio interno · BDP</p>
            <h1 id="bdp-login-title">Selección y reclutamiento</h1>
            <p>Accede al banco de talento y da seguimiento a tus procesos de selección.</p>
          </section>

          <section className="bdp-login__panel" aria-labelledby="bdp-profile-title">
            <div className="bdp-login__view" key={focused?.id ?? "profiles"}>
              {focused ? (
                <FocusedProfile profile={focused} staticMode={staticAvatars || calm} onBack={() => setFocusedId(null)} />
              ) : (
                <>
                  <h2 id="bdp-profile-title">¿Quién ingresa?</h2>
                  <p className="mt-1 text-sm text-ink-soft">Selecciona tu perfil para iniciar sesión.</p>
                  {profiles.length === 0 ? (
                    <p className="mt-4 text-sm text-ink-soft">No hay perfiles disponibles por ahora.</p>
                  ) : (
                    <div className="bdp-login__tiles">
                      {profiles.map((profile) => (
                        <button
                          key={profile.id}
                          id={`bdp-auth-${profile.id}`}
                          type="button"
                          className="bdp-login__tile"
                          onClick={() => {
                            lastPicked.current = profile.id;
                            setFocusedId(profile.id);
                          }}
                        >
                          <span aria-hidden="true"><ProfileAvatar nombre={profile.nombre} avatar={profile.avatar} size="lg" staticMode={staticAvatars || calm} /></span>
                          <strong>{profile.nombre}</strong>
                          <small>{profile.cargo}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="bdp-login__footer">
          <span className="bdp-state" data-state={state} role="status">
            <SyncIcon aria-hidden="true" className={!calm && state === "busy" ? "animate-spin" : undefined} />
            {offline ? "Sin conexión con la base" : synced ? `Datos sincronizados · ${candidatos.length} registros${time ? ` · ${time}` : ""}` : "Sincronizando datos"}
          </span>
          <button type="button" role="switch" aria-checked={staticAvatars} className="bdp-login__switch" onClick={() => setConfig({ staticAvatars: !staticAvatars })}>
            <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
            Modo estático
          </button>
        </div>
      </main>
    </motion.div>
  );
}

function FocusedProfile({ profile, staticMode, onBack }: { profile: Perfil; staticMode: boolean; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await attemptLogin(profile.id, password);
      if (!result.ok) {
        setError(result.error ?? "No se pudo iniciar sesión.");
        inputRef.current?.focus();
      }
    } catch {
      setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div onKeyDown={(event) => {
      if (event.key === "Escape" && !submitting) onBack();
    }}>
      <button type="button" className="bdp-login__back" onClick={onBack} disabled={submitting}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Cambiar de perfil
      </button>
      <div className="bdp-login__profile">
        <span aria-hidden="true"><ProfileAvatar nombre={profile.nombre} avatar={profile.avatar} size="sm" staticMode={staticMode} /></span>
        <div className="min-w-0">
          <h2 id="bdp-profile-title">{profile.nombre}</h2>
          <p className="text-sm text-ink-soft">{profile.cargo}</p>
        </div>
      </div>

      <form onSubmit={submit} aria-busy={submitting}>
        <label htmlFor="bdp-login-password" className="text-sm font-semibold text-ink">Contraseña</label>
        <div className="bdp-login__field">
          <Lock className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            id="bdp-login-password"
            name="password"
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            className="text-sm text-ink"
            value={password}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "bdp-login-error" : undefined}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
          />
        </div>
        {error && <p id="bdp-login-error" role="alert" className="tone-text-peligro mt-2 text-sm">{error}</p>}
        <button type="submit" className="bdp-login__submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          {submitting ? "Ingresando…" : "Iniciar sesión"}
        </button>
        {!profile.tienePassword && (
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">La primera contraseña que ingreses quedará guardada en este equipo.</p>
        )}
      </form>
    </div>
  );
}
