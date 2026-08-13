import { motion } from "framer-motion";
import { CloudOff, RefreshCcw } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";

/**
 * Aviso de datos sin sincronizar.
 *
 * ## Por qué hacía falta
 *
 * La aplicación guarda una copia de la base en el equipo y la muestra al
 * instante mientras refresca por detrás (*stale-while-revalidate*). Es lo que
 * hace que abra rápido. El problema era el `catch` de ese refresco:
 *
 * ```ts
 * .catch(() => { if (hasData.current) return; …  })   // silencio absoluto
 * ```
 *
 * Con datos en pantalla, **cualquier fallo se descartaba sin decir nada**. Un
 * equipo con el dominio de Google bloqueado por el proxy del banco, o con el
 * despliegue del Apps Script caducado, seguía viendo la comparativa de ayer con
 * el punto verde de «sincronizado» encendido. La persona que lo usaba no estaba
 * mintiendo cuando decía que «no funciona»: estaba trabajando con una foto vieja
 * y sin ninguna pista de que lo fuera.
 *
 * Ahora se dice, con la hora del último dato bueno y un botón para reintentar.
 */
export function StaleBanner() {
  const { stale, syncError, lastSyncedAt, refetch, syncing } = useTalentData();
  if (!stale) return null;

  const desde = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString("es-BO", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "nunca";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      role="alert"
      className="no-print mb-4 flex flex-wrap items-start gap-3 rounded-2xl bg-amber-500/12 px-4 py-3 ring-1 ring-amber-400/40"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-400/20 text-amber-500">
        <CloudOff className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-500">
          Está viendo datos guardados en este equipo, no la hoja en vivo.
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Último dato del servidor: {desde}. {syncError}
        </p>
      </div>
      <button
        type="button"
        onClick={() => refetch()}
        disabled={syncing}
        className="inline-flex shrink-0 items-center gap-2 rounded-full fill-softer px-3.5 py-2 text-xs font-bold text-ink ring-1 ring-[color:var(--hairline)] transition-all hover:fill-soft active:scale-95 disabled:opacity-60"
      >
        <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        Reintentar
      </button>
    </motion.div>
  );
}
