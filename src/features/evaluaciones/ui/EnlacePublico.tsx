/**
 * El enlace público, tal como se comparte con el postulante.
 *
 * ── Por qué esto es un componente y no una cadena de texto ──────────────────
 * Antes el enlace era `texto` dentro de un botón de copiar, y eso bastaba
 * mientras el enlace funcionara siempre. No funcionaba: un enlace generado en
 * modo demostración —o con una dirección de backend con otra forma— se copia
 * igual y falla en el teléfono de la otra persona, sin que nadie se entere hasta
 * que un postulante lo dice.
 *
 * Este componente hace tres cosas que una cadena no puede hacer:
 *
 *   1. **advierte** cuando el enlace no es portátil, con el motivo y el remedio;
 *   2. **comprueba** el enlace de verdad: lo abre como una visita anónima contra
 *      el despliegue que lleva dentro y dice qué contestó;
 *   3. **muestra** el enlace completo, para poder verlo antes de mandarlo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Link2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { diagnosticoEnlace } from "../api/connection";
import { comprobarEnlacePublico, type ComprobacionEnlace } from "../api/verificarEnlace";
import { BotonCopiar, BotonSecundario } from "./pieces";

/** Franja compacta: el botón de copiar y, si hace falta, el aviso. */
export function EnlacePublicoCompacto({ codigo }: { codigo: string }) {
  const diagnostico = diagnosticoEnlace(codigo);
  return (
    <span className="inline-flex items-center gap-1.5">
      <BotonCopiar texto={diagnostico.enlace} etiqueta="Enlace" />
      {!diagnostico.portatil && (
        <span
          title={`${diagnostico.motivo} ${diagnostico.remedio}`}
          className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[0.65rem] font-bold tone-text-aviso ring-1 ring-amber-400/30"
        >
          <AlertTriangle className="h-3 w-3" />
          Solo en este equipo
        </span>
      )}
    </span>
  );
}

/**
 * Bloque completo: enlace, copiar, comprobar y el estado de la comprobación.
 *
 * `autoComprobar` lo usa el diálogo de publicación: en cuanto se publica, la
 * comprobación corre sola. Es el único momento en el que alguien está mirando y
 * puede corregir el problema antes de enviar el enlace a nadie.
 */
export function EnlacePublico({
  codigo,
  autoComprobar = false,
}: {
  codigo: string;
  autoComprobar?: boolean;
}) {
  const diagnostico = diagnosticoEnlace(codigo);
  const [comprobando, setComprobando] = useState(false);
  const [resultado, setResultado] = useState<ComprobacionEnlace | null>(null);

  const comprobar = useCallback(async () => {
    setComprobando(true);
    const res = await comprobarEnlacePublico(codigo);
    setResultado(res);
    setComprobando(false);
  }, [codigo]);

  // Comprobación automática al publicar. El manejador se lee de una referencia:
  // si el efecto dependiera de `comprobar` —una función nueva en cada
  // renderizado— la comprobación se repetiría en cada pintado.
  const comprobarRef = useRef(comprobar);
  comprobarRef.current = comprobar;
  useEffect(() => {
    if (!autoComprobar) return;
    void comprobarRef.current();
  }, [autoComprobar, codigo]);

  const tono = !resultado
    ? "ring-[color:var(--hairline)] fill-softer"
    : resultado.ok
      ? "ring-emerald-400/30 bg-emerald-500/10"
      : "ring-amber-400/40 bg-amber-500/10";

  return (
    <div className={`flex flex-col gap-2 rounded-2xl px-3 py-2.5 ring-1 ${tono}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">Enlace del postulante</span>
        <code className="min-w-0 flex-1 truncate rounded bg-[color:var(--fill-2)] px-1.5 py-0.5 font-mono text-[0.7rem] text-ink-soft">
          {diagnostico.enlace}
        </code>
        <BotonCopiar texto={diagnostico.enlace} etiqueta="Copiar" />
        <BotonSecundario onClick={() => void comprobar()} disabled={comprobando}>
          {comprobando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Comprobar
        </BotonSecundario>
      </div>

      {!diagnostico.portatil && (
        <p className="flex items-start gap-1.5 text-[0.72rem] tone-text-aviso">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Este enlace no abrirá en otro equipo.</strong> {diagnostico.motivo} {diagnostico.remedio}
          </span>
        </p>
      )}

      <AnimatePresence initial={false}>
        {resultado && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-start gap-1.5 text-[0.72rem] ${resultado.ok ? "tone-text-exito" : "tone-text-aviso"}`}
          >
            {resultado.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {resultado.ok ? "Comprobado como lo verá el postulante. " : "La comprobación falló. "}
              {resultado.mensaje}
              {!resultado.ok && resultado.remedio ? ` ${resultado.remedio}` : ""}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
