/**
 * DocSyncIndicator.tsx — estado de la conexión con el libro.
 *
 * Responde a una pregunta que antes no tenía respuesta en pantalla: lo que acabo
 * de escribir, ¿dónde está? Distingue tres situaciones que la versión anterior
 * confundía en un mismo silencio:
 *
 *   · guardado en el libro,
 *   · guardado solo en este equipo,
 *   · en cola porque no hay conexión.
 *
 * La tercera es la peligrosa: parece que todo va bien hasta que alguien abre el
 * libro desde otro sitio y no encuentra nada.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  Wifi,
} from "lucide-react";
import {
  comprobarConexion,
  sincronizarTodo,
  useDocStore,
  useDocSync,
} from "../../lib/docStore";
import { ProgressBar, useDocMotion } from "./DocMotion";

function haceCuanto(iso: string): string {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "hace un momento";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "hace un momento";
  if (min === 1) return "hace 1 minuto";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h === 1) return "hace 1 hora";
  if (h < 24) return `hace ${h} horas`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export default function DocSyncIndicator({
  compacto = false,
  onAbrirMantenimiento,
}: {
  compacto?: boolean;
  onAbrirMantenimiento?: () => void;
}) {
  const sync = useDocSync();
  const { settings } = useDocStore();
  const m = useDocMotion();
  const [ahora, setAhora] = useState(Date.now());
  const yaComprobado = useRef(false);

  // Primera comprobación al montar y reintento periódico.
  useEffect(() => {
    if (yaComprobado.current) return;
    yaComprobado.current = true;
    void comprobarConexion();
  }, []);

  useEffect(() => {
    if (!settings.syncEnabled) return;
    const minutos = Math.max(1, settings.syncIntervalMin);
    const id = setInterval(() => {
      void comprobarConexion();
      setAhora(Date.now());
    }, minutos * 60000);
    return () => clearInterval(id);
  }, [settings.syncEnabled, settings.syncIntervalMin]);

  // Refresco del texto «hace X minutos» sin volver a pedir nada al servidor.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const ocupado = sync.ocupado || sync.estado === "guardando";
  const hayPendientes = sync.pendientes > 0 || sync.sucios.length > 0;

  let tono = "text-ink-soft";
  let icono = <Cloud size={14} />;
  let texto = "Solo en este equipo";

  if (ocupado) {
    tono = "text-[#00b0d8]";
    icono = <Loader2 size={14} className="animate-spin" />;
    texto = sync.tarea || "Guardando…";
  } else if (sync.conexion === "conectado" && !hayPendientes) {
    tono = "text-emerald-500";
    icono = <Check size={14} />;
    texto = `Sincronizado · ${haceCuanto(sync.ultimaSync)}`;
  } else if (hayPendientes) {
    tono = "text-amber-500";
    icono = <CloudOff size={14} />;
    const n = sync.pendientes || sync.sucios.length;
    texto = `${n} cambio${n === 1 ? "" : "s"} sin enviar`;
  } else if (sync.conexion === "sin_conexion") {
    tono = "text-amber-500";
    icono = <CloudOff size={14} />;
    texto = "Sin conexión";
  } else if (sync.conexion === "error") {
    tono = "text-rose-500";
    icono = <AlertTriangle size={14} />;
    texto = "Error de conexión";
  } else if (sync.conexion === "sin_instalar") {
    tono = "text-amber-500";
    icono = <AlertTriangle size={14} />;
    texto = "Libro sin instalar";
  } else if (sync.conexion === "comprobando") {
    icono = <Loader2 size={14} className="animate-spin" />;
    texto = "Conectando…";
  }

  void ahora;

  if (compacto) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs ${tono}`}
        title={sync.ultimoError || texto}
      >
        {icono}
        <span className="hidden sm:inline">{texto}</span>
      </span>
    );
  }

  return (
    <div className="glass rounded-2xl px-3 py-2 ring-1 ring-[color:var(--hairline)] no-print">
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-2 text-xs font-medium ${tono}`}>
          {icono}
          <span>{texto}</span>
        </span>

        <div className="ml-auto flex items-center gap-1">
          <motion.button
            type="button"
            onClick={() => void sincronizarTodo()}
            disabled={ocupado || !settings.syncEnabled}
            title="Sincronizar ahora"
            className="grid h-7 w-7 place-items-center rounded-lg fill-soft text-ink-soft transition hover:text-ink disabled:opacity-40"
            whileHover={m.activo && !ocupado ? { scale: 1.08 } : undefined}
            whileTap={m.activo && !ocupado ? { scale: 0.92 } : undefined}
          >
            <RefreshCw size={13} className={ocupado ? "animate-spin" : ""} />
          </motion.button>

          {(sync.conexion === "error" || sync.conexion === "sin_instalar") &&
            onAbrirMantenimiento && (
              <button
                type="button"
                onClick={onAbrirMantenimiento}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-[#00b0d8] transition hover:bg-white/5"
              >
                Reparar
              </button>
            )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {ocupado && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={m.suave}
          >
            <ProgressBar
              value={sync.progreso}
              indeterminado={!sync.progreso || sync.progreso >= 100}
            />
          </motion.div>
        )}

        {!ocupado && sync.ultimoError && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={m.suave}
            className="rounded-xl fill-soft px-2.5 py-2"
          >
            <p className="text-[11px] leading-relaxed text-ink-soft wrap-words">
              {sync.ultimoError}
            </p>
            {sync.ultimaPista && (
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint wrap-words">
                {sync.ultimaPista}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Aviso flotante cuando se lleva mucho rato sin contactar con el libro.
 *
 * Aparece a los quince minutos y solo si hay algo sin enviar. Un aviso que salta
 * sin motivo se aprende a ignorar, y entonces deja de servir cuando importa.
 */
export function DocSyncAviso() {
  const sync = useDocSync();
  const { settings } = useDocStore();
  const m = useDocMotion();
  const [visible, setVisible] = useState(false);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    if (!settings.syncEnabled || descartado) {
      setVisible(false);
      return;
    }

    const revisar = () => {
      const hayCola = sync.pendientes > 0 || sync.sucios.length > 0;
      if (!hayCola) {
        setVisible(false);
        return;
      }
      const desde = sync.ultimaSync ? new Date(sync.ultimaSync).getTime() : 0;
      const minutos = desde ? (Date.now() - desde) / 60000 : 999;
      setVisible(minutos >= 15);
    };

    revisar();
    const id = setInterval(revisar, 60000);
    return () => clearInterval(id);
  }, [sync.pendientes, sync.sucios.length, sync.ultimaSync, settings.syncEnabled, descartado]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={m.spring}
          className="glass-heavy fixed bottom-6 right-6 z-40 max-w-xs rounded-2xl p-3 shadow-glass ring-1 ring-[color:var(--hairline)] no-print"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-amber-500">
              <Wifi size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">Cambios sin subir</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft wrap-words">
                Hay {sync.pendientes || sync.sucios.length} cambio(s) guardados solo en este
                equipo. Se subirán al reconectar.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void sincronizarTodo()}
                  className="rounded-lg bg-gradient-to-r from-[#00b0d8] to-[#005baa] px-2.5 py-1 text-[11px] font-medium text-white"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => setDescartado(true)}
                  className="rounded-lg px-2 py-1 text-[11px] text-ink-faint transition hover:text-ink"
                >
                  Ocultar
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
