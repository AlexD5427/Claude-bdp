import { motion } from "framer-motion";
import { RefreshCcw, WifiOff } from "lucide-react";
import { useTalentData } from "../context/TalentDataContext";
import { useConfig, type DockPosition } from "../lib/configStore";

/**
 * A floating "actualizar base de datos" button.
 *
 * The app already refreshes passively (a background poll + refresh on focus),
 * but the recruitment team also wanted a way to force a full re-sync on demand.
 * This button does exactly that: one click re-fetches everything, the icon spins
 * while the sync is in flight, and its tooltip shows the last successful sync.
 *
 * It can be hidden from Configuración (`showRefreshButton`) and it re-positions
 * itself to stay clear of the floating dock wherever the dock is anchored.
 */
export function RefreshButton() {
  const { syncing, refetch, lastSyncedAt, status, connection } = useTalentData();
  const { showRefreshButton, dockPosition } = useConfig();

  if (!showRefreshButton) return null;

  const offline = connection === "sin-conexion";
  const lastLabel = lastSyncedAt
    ? `Última sincronización: ${new Date(lastSyncedAt).toLocaleTimeString("es-BO", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "Aún no sincronizado";

  return (
    <motion.button
      type="button"
      onClick={() => refetch()}
      disabled={syncing}
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22, delay: 0.3 }}
      whileHover={{ y: -2, scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      title={
        offline
          ? `Sin conexión con la base de datos. ${lastLabel}. Pulse para reintentar; mientras siga en rojo, lo que registre no se guardará en la hoja.`
          : `Actualizar base de datos · ${lastLabel}`
      }
      aria-label={offline ? "Sin conexión: reintentar" : "Actualizar base de datos"}
      className={[
        "glass-heavy no-print fixed z-[90] inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-bold shadow-glass ring-1 transition-colors disabled:cursor-progress",
        offline
          ? "text-rose-500 ring-rose-400/50"
          : "text-ink ring-[color:var(--hairline)] hover:text-cyan-400",
        POS[dockPosition],
      ].join(" ")}
    >
      {offline ? (
        <WifiOff className="h-4 w-4 text-rose-500" />
      ) : (
        <RefreshCcw className={`h-4 w-4 text-cyan-400 ${syncing ? "animate-spin" : ""}`} />
      )}
      <span className="hidden sm:inline">
        {syncing ? "Actualizando…" : offline ? "Sin conexión" : "Actualizar datos"}
      </span>
      {/* Live status dot */}
      <span
        className={[
          "h-2 w-2 rounded-full",
          syncing
            ? "bg-amber-400 shadow-glow-amber"
            : offline || status === "error"
              ? "bg-rose-500 shadow-glow-rose"
              : "bg-green-500 shadow-glow-green",
        ].join(" ")}
      />
    </motion.button>
  );
}

/** Corner that stays clear of the dock at each of its anchor positions. */
const POS: Record<DockPosition, string> = {
  top: "bottom-4 right-4",
  left: "bottom-4 right-4",
  right: "bottom-4 left-4",
  bottom: "bottom-24 right-4",
};
