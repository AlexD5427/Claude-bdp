import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Loader2 } from "lucide-react";
import { L } from "../../../content/locale";
import { dialogPop } from "../../../design-system/motion";
import { Z } from "../../../design-system/tokens";
import { Field, TextInput } from "../../../design-system/liquid-glass/fields";
import { openAdminSession } from "../api/transport";
import { adminSessionState } from "../api/adminSessionState";

/**
 * Puerta de la administración de evaluaciones.
 *
 * Por qué existe: el panel se despliega en Vercel sin Google Login, así que el
 * navegador no tiene forma de demostrarle nada a Apps Script. Quien firma las
 * operaciones administrativas es el backend intermedio, y este diálogo es cómo el
 * reclutador se identifica ante ÉSE (una frase de acceso que viaja una sola vez y
 * se cambia por una cookie `HttpOnly`).
 *
 * Lo que este componente NO hace: guardar la frase, recordarla en
 * `localStorage`, ni conocer el secreto de firma. Si mañana entra Google Login,
 * este diálogo desaparece y nada más cambia.
 */
export function AdminSessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [actor, setActor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!passphrase) return;
    setBusy(true);
    setError(null);
    const result = await openAdminSession(passphrase, actor);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    // La frase se descarta en cuanto el servidor emite la cookie.
    setPassphrase("");
    adminSessionState.activate(result.value.actor);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: Z.dialog }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={L.assessments.adminSession.title}
        >
          <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onClose} />
          <motion.div
            className="glass-heavy relative z-10 w-full max-w-md rounded-3xl p-6"
            variants={dialogPop}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] ring-1 ring-white/30">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-lg font-black tracking-tight text-ink">
              {L.assessments.adminSession.title}
            </h2>
            <p className="mt-1.5 text-sm text-ink-soft">{L.assessments.adminSession.description}</p>

            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Field label={L.assessments.adminSession.passphraseLabel} htmlFor="admin-passphrase">
                <TextInput
                  id="admin-passphrase"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  placeholder={L.assessments.adminSession.passphrasePlaceholder}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </Field>
              <Field label={L.assessments.adminSession.actorLabel} htmlFor="admin-actor">
                <TextInput
                  id="admin-actor"
                  value={actor}
                  autoComplete="username"
                  onChange={(event) => setActor(event.target.value)}
                />
              </Field>

              {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}

              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-2xl px-4 py-2 text-sm font-bold text-ink-soft ring-1 ring-[color:var(--hairline)]"
                  onClick={onClose}
                >
                  {L.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={busy || passphrase === ""}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white ring-1 ring-white/30 disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {L.assessments.adminSession.submit}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
