/**
 * DocMaintenancePanel.tsx — mantenimiento del libro sin salir de la web.
 *
 * La idea es que nadie tenga que abrir el editor de Apps Script para arreglar
 * la base de datos. El diagnóstico del backend devuelve, con cada hallazgo, el
 * código de la acción que lo corrige; aquí eso se convierte en un botón al lado
 * del problema. Es la diferencia entre leer «faltan columnas en 2024» y poder
 * resolverlo.
 *
 * Las operaciones que pueden perder datos —restaurar una copia y fusionar
 * duplicados— exigen confirmación explícita. Buscar duplicados, por su parte,
 * solo informa: fusionar es siempre un segundo paso deliberado, porque dos
 * personas pueden llamarse igual y no ser la misma.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Info,
  Loader2,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Wrench,
} from "lucide-react";
import {
  DocApiFallo,
  docApi,
  hayBackendConfigurado,
  type DocDiagnostico,
  type DocHallazgo,
  type DocRespaldoInfo,
} from "../../lib/doc/docApi";
import { comprobarConexion, traerDelBackend, useDocSync } from "../../lib/docStore";
import { ProgressBar, useDocMotion } from "./DocMotion";

type Registro = {
  id: string;
  momento: string;
  titulo: string;
  detalle: string;
  tono: "ok" | "error" | "info";
};

/**
 * Estilo por severidad.
 *
 * Se tipa el icono como `ReactNode` y no como `JSX.Element`: el namespace global
 * `JSX` existe con @types/react 18 pero desapareció en React 19, y dejarlo
 * convertiría una futura actualización en un fallo de compilación sin motivo.
 */
const SEVERIDAD_ESTILO: Record<string, { color: string; icono: ReactNode }> = {
  critico: {
    color: "text-rose-400",
    icono: <AlertTriangle size={13} />,
  },
  aviso: {
    color: "text-amber-400",
    icono: <AlertTriangle size={13} />,
  },
  info: {
    color: "text-sky-400",
    icono: <Info size={13} />,
  },
};

export default function DocMaintenancePanel() {
  const sync = useDocSync();
  const m = useDocMotion();

  const [diag, setDiag] = useState<DocDiagnostico | null>(null);
  const [respaldos, setRespaldos] = useState<DocRespaldoInfo[]>([]);
  const [tarea, setTarea] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [verRespaldos, setVerRespaldos] = useState(false);
  const [confirmar, setConfirmar] = useState<{ tipo: string; dato?: string } | null>(null);

  const ocupado = tarea !== "";
  const configurado = hayBackendConfigurado();

  const anotar = useCallback((titulo: string, detalle: string, tono: Registro["tono"]) => {
    setRegistros((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          momento: new Date().toLocaleTimeString("es-BO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          titulo,
          detalle,
          tono,
        },
        ...prev,
      ].slice(0, 12),
    );
  }, []);

  /**
   * Envoltorio común de toda operación de mantenimiento.
   *
   * Centraliza el bloqueo de la interfaz, el registro del resultado y el
   * tratamiento del error. Sin esto, cada botón repetiría el mismo try/catch y
   * alguno acabaría olvidándose de desbloquear al fallar.
   */
  const ejecutar = useCallback(
    async (
      etiqueta: string,
      fn: () => Promise<unknown>,
      resumen?: (datos: unknown) => string,
    ) => {
      setTarea(etiqueta);
      try {
        const datos = await fn();
        anotar(etiqueta, resumen ? resumen(datos) : "Completado.", "ok");
        return datos;
      } catch (e) {
        const fallo = e as DocApiFallo;
        anotar(
          etiqueta,
          `${fallo?.message || "Fall\u00f3."}${fallo?.pista ? ` ${fallo.pista}` : ""}`,
          "error",
        );
        return null;
      } finally {
        setTarea("");
      }
    },
    [anotar],
  );

  const diagnosticar = useCallback(async () => {
    const datos = (await ejecutar("Diagnóstico", () => docApi.diagnostico(), (d) => {
      const r = d as DocDiagnostico;
      if (!r) return "Sin respuesta.";
      return r.criticos
        ? `${r.criticos} problema(s) crítico(s) y ${r.hallazgos.length - r.criticos} aviso(s).`
        : r.hallazgos.length
          ? `Sin problemas críticos. ${r.hallazgos.length} observación(es).`
          : "Todo correcto.";
    })) as DocDiagnostico | null;

    if (datos) setDiag(datos);
    void comprobarConexion();
  }, [ejecutar]);

  // Diagnóstico automático la primera vez que se abre el panel.
  useEffect(() => {
    if (configurado && !diag) void diagnosticar();
    // Solo al montar: repetirlo en cada cambio gastaría cuota sin motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarRespaldos = useCallback(async () => {
    const datos = (await ejecutar(
      "Lista de copias",
      () => docApi.respaldos(),
      (d) => `${(d as { respaldos?: unknown[] })?.respaldos?.length ?? 0} copia(s).`,
    )) as { respaldos?: DocRespaldoInfo[] } | null;
    if (datos?.respaldos) setRespaldos(datos.respaldos);
  }, [ejecutar]);

  /** Traduce el código de acción de un hallazgo en la llamada correspondiente. */
  const resolverHallazgo = useCallback(
    async (h: DocHallazgo) => {
      const anio = Number(h.datos?.anio ?? 0) || undefined;

      switch (h.accion) {
        case "instalar":
        case "reparar":
          await ejecutar("Reparar estructura", () => docApi.reparar());
          break;
        case "crear-anio":
          await ejecutar(`Crear pestaña ${anio ?? ""}`.trim(), () =>
            docApi.instalar(anio ? [anio] : []),
          );
          break;
        case "mantenimiento.autoreparar":
          await ejecutar("Reparación automática", () => docApi.autoreparar());
          break;
        case "mantenimiento.recalcular":
          await ejecutar("Recalcular avances", () => docApi.recalcular());
          break;
        case "mantenimiento.recolorear":
          await ejecutar("Repintar filas", () => docApi.recolorear());
          break;
        case "mantenimiento.respaldar":
          await ejecutar("Crear copia", () => docApi.respaldar("diagnostico"));
          break;
        case "mantenimiento.compactar":
          await ejecutar("Compactar bitácoras", () => docApi.compactar());
          break;
        case "mantenimiento.deduplicar":
          await ejecutar(
            "Buscar duplicados",
            () => docApi.duplicados(false),
            (d) =>
              `${(d as { grupos?: unknown[] })?.grupos?.length ?? 0} grupo(s). Revísalos antes de fusionar.`,
          );
          break;
        default:
          anotar(h.titulo, "Este hallazgo se corrige a mano en el libro.", "info");
          return;
      }

      await diagnosticar();
    },
    [ejecutar, diagnosticar, anotar],
  );

  if (!configurado) {
    return (
      <div className="rounded-2xl fill-soft p-4 text-center ring-1 ring-[color:var(--hairline)]">
        <Database size={22} className="mx-auto text-ink-faint" />
        <p className="mt-2 text-sm font-medium text-ink">Sin backend configurado</p>
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-soft">
          Pega la URL de la aplicación web de Apps Script en la pestaña{" "}
          <strong className="text-ink">Conexión</strong> para habilitar el mantenimiento.
        </p>
      </div>
    );
  }

  const resumen = diag?.resumen;

  return (
    <div className="space-y-4">
      {/* Estado del libro --------------------------------------------- */}
      <section className="rounded-2xl fill-soft p-3 ring-1 ring-[color:var(--hairline)]">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-[#00b0d8]" />
          <p className="text-xs font-semibold text-ink">Estado del libro</p>
          {sync.libroUrl && (
            <a
              href={sync.libroUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#00b0d8] hover:underline"
            >
              Abrir <ExternalLink size={11} />
            </a>
          )}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { etiqueta: "Expedientes", valor: resumen?.expedientes ?? "—" },
            { etiqueta: "Años", valor: resumen?.anios?.length ?? "—" },
            { etiqueta: "Auditoría", valor: resumen?.auditoria ?? "—" },
            { etiqueta: "Copias", valor: resumen?.respaldos ?? "—" },
          ].map((x) => (
            <div key={x.etiqueta} className="rounded-xl fill-softer px-2 py-2 text-center">
              <p className="text-base font-semibold text-ink">{x.valor}</p>
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">{x.etiqueta}</p>
            </div>
          ))}
        </div>

        {resumen?.ultimoRespaldo && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Clock size={11} /> Última copia: {resumen.ultimoRespaldo}
          </p>
        )}
      </section>

      {ocupado && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-ink-soft">
            <Loader2 size={12} className="animate-spin" /> {tarea}…
          </p>
          <ProgressBar indeterminado />
        </div>
      )}

      {/* Diagnóstico --------------------------------------------------- */}
      <section>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Diagnóstico
          </h4>
          <button
            type="button"
            onClick={() => void diagnosticar()}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[#00b0d8] transition hover:bg-white/5 disabled:opacity-40"
          >
            <RefreshCw size={11} className={tarea === "Diagnóstico" ? "animate-spin" : ""} />
            Revisar
          </button>
        </div>

        <div className="mt-2 space-y-1.5">
          {diag && diag.hallazgos.length === 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400">
              <Check size={13} /> Sin problemas detectados.
            </p>
          )}

          <AnimatePresence initial={false}>
            {diag?.hallazgos.map((h, i) => {
              const estilo = SEVERIDAD_ESTILO[h.severidad] ?? SEVERIDAD_ESTILO.info;
              return (
                <motion.div
                  key={`${h.codigo}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ ...m.suave, delay: m.activo ? i * 0.03 : 0 }}
                  className="rounded-xl fill-soft px-3 py-2.5 ring-1 ring-[color:var(--hairline)]"
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 ${estilo.color}`}>{estilo.icono}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink wrap-words">{h.titulo}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft wrap-words">
                        {h.detalle}
                      </p>
                    </div>
                    {h.accion && (
                      <button
                        type="button"
                        onClick={() => void resolverHallazgo(h)}
                        disabled={ocupado}
                        className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-[11px] font-medium text-[#00b0d8] transition hover:bg-white/10 disabled:opacity-40"
                      >
                        Corregir
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {!diag && !ocupado && (
            <p className="rounded-xl fill-soft px-3 py-2.5 text-xs text-ink-soft">
              Pulsa <strong className="text-ink">Revisar</strong> para analizar el libro.
            </p>
          )}
        </div>
      </section>

      {/* Acciones ------------------------------------------------------ */}
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Herramientas
        </h4>

        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {[
            {
              id: "reparar",
              icono: <Wrench size={14} className="text-[#00b0d8]" />,
              titulo: "Instalar o reparar",
              detalle: "Crea hojas y columnas que falten.",
              fn: () => ejecutar("Instalar o reparar", () => docApi.reparar()),
            },
            {
              id: "auto",
              icono: <Wrench size={14} className="text-emerald-500" />,
              titulo: "Reparación automática",
              detalle: "Corrige todo lo que pueda resolverse solo.",
              fn: () => ejecutar("Reparación automática", () => docApi.autoreparar()),
            },
            {
              id: "respaldar",
              icono: <Save size={14} className="text-[#00b0d8]" />,
              titulo: "Crear copia",
              detalle: "Guarda una copia completa dentro del libro.",
              fn: () =>
                ejecutar(
                  "Crear copia",
                  () => docApi.respaldar("manual"),
                  (d) =>
                    `Copia ${(d as { id?: string })?.id ?? ""} con ${
                      (d as { expedientes?: number })?.expedientes ?? 0
                    } expediente(s).`,
                ),
            },
            {
              id: "recalcular",
              icono: <RefreshCw size={14} className="text-emerald-500" />,
              titulo: "Recalcular avances",
              detalle: "Rehace porcentajes y recuentos.",
              fn: () => ejecutar("Recalcular avances", () => docApi.recalcular()),
            },
            {
              id: "recolorear",
              icono: <Paintbrush size={14} className="text-amber-500" />,
              titulo: "Repintar filas",
              detalle: "Reaplica los colores según el estado.",
              fn: () => ejecutar("Repintar filas", () => docApi.recolorear()),
            },
            {
              id: "duplicados",
              icono: <Copy size={14} className="text-amber-500" />,
              titulo: "Buscar duplicados",
              detalle: "Solo informa; no fusiona nada.",
              fn: () =>
                ejecutar(
                  "Buscar duplicados",
                  () => docApi.duplicados(false),
                  (d) => {
                    const n = (d as { grupos?: unknown[] })?.grupos?.length ?? 0;
                    return n
                      ? `${n} grupo(s) con posible duplicado.`
                      : "No hay duplicados.";
                  },
                ),
            },
            {
              id: "compactar",
              icono: <Database size={14} className="text-ink-soft" />,
              titulo: "Compactar bitácoras",
              detalle: "Recorta auditoría y registros antiguos.",
              fn: () => ejecutar("Compactar bitácoras", () => docApi.compactar()),
            },
            {
              id: "descargar",
              icono: <RotateCcw size={14} className="text-[#00b0d8]" />,
              titulo: "Recargar desde el libro",
              detalle: "Trae los expedientes tal como están allí.",
              fn: () =>
                ejecutar(
                  "Recargar desde el libro",
                  () => traerDelBackend(),
                  (d) => {
                    const r = d as { recibidos: number; fusionados: number };
                    return `${r?.recibidos ?? 0} recibido(s), ${r?.fusionados ?? 0} actualizado(s).`;
                  },
                ),
            },
          ].map((accion) => (
            <motion.button
              key={accion.id}
              type="button"
              onClick={() => void accion.fn()}
              disabled={ocupado}
              whileHover={m.activo && !ocupado ? { scale: 1.01 } : undefined}
              whileTap={m.activo && !ocupado ? { scale: 0.985 } : undefined}
              className="flex items-start gap-2.5 rounded-xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition hover:fill-softer disabled:opacity-40"
            >
              <span className="mt-0.5 shrink-0">{accion.icono}</span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-ink">{accion.titulo}</span>
                <span className="block text-[11px] leading-relaxed text-ink-faint wrap-words">
                  {accion.detalle}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Copias -------------------------------------------------------- */}
      <section>
        <button
          type="button"
          onClick={() => {
            const abrir = !verRespaldos;
            setVerRespaldos(abrir);
            if (abrir && !respaldos.length) void cargarRespaldos();
          }}
          className="flex w-full items-center gap-2 rounded-xl fill-soft px-3 py-2.5 text-left ring-1 ring-[color:var(--hairline)] transition hover:fill-softer"
        >
          <RotateCcw size={14} className="text-ink-soft" />
          <span className="text-xs font-medium text-ink">Copias guardadas</span>
          <motion.span
            className="ml-auto text-ink-faint"
            animate={{ rotate: verRespaldos ? 180 : 0 }}
            transition={m.suave}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {verRespaldos && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={m.suave}
              className="overflow-hidden"
            >
              <div className="mt-1.5 space-y-1.5">
                {!respaldos.length && (
                  <p className="px-3 py-2 text-[11px] text-ink-faint">
                    No hay copias guardadas todavía.
                  </p>
                )}

                {respaldos.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl fill-soft px-3 py-2 ring-1 ring-[color:var(--hairline)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-ink">{r.momento}</p>
                      <p className="truncate text-[10px] text-ink-faint">
                        {r.expedientes} expediente(s) · {r.motivo}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmar({ tipo: "restaurar", dato: r.id })}
                      disabled={ocupado}
                      className="shrink-0 rounded-lg bg-white/5 px-2 py-1 text-[10px] font-medium text-amber-400 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Confirmación -------------------------------------------------- */}
      <AnimatePresence>
        {confirmar?.tipo === "restaurar" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={m.suave}
            className="rounded-2xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30"
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <AlertTriangle size={13} /> Restaurar esta copia
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              Se reemplazarán los expedientes del libro por los de la copia. Antes se guardará
              automáticamente una copia del estado actual, así que la operación es reversible.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = confirmar.dato;
                  setConfirmar(null);
                  if (!id) return;
                  void ejecutar("Restaurar copia", () => docApi.restaurar(id)).then(() => {
                    void traerDelBackend();
                    void diagnosticar();
                  });
                }}
                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-medium text-white"
              >
                Sí, restaurar
              </button>
              <button
                type="button"
                onClick={() => setConfirmar(null)}
                className="rounded-xl px-3 py-1.5 text-xs text-ink-soft transition hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registro ------------------------------------------------------ */}
      {registros.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Actividad reciente
          </h4>
          <div className="mt-2 space-y-1">
            <AnimatePresence initial={false}>
              {registros.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={m.suave}
                  className="flex items-start gap-2 px-1 py-1"
                >
                  <span
                    className={`mt-0.5 shrink-0 ${
                      r.tono === "ok"
                        ? "text-emerald-500"
                        : r.tono === "error"
                          ? "text-rose-400"
                          : "text-sky-400"
                    }`}
                  >
                    {r.tono === "ok" ? (
                      <Check size={12} />
                    ) : r.tono === "error" ? (
                      <AlertTriangle size={12} />
                    ) : (
                      <Info size={12} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-ink">
                      {r.titulo}{" "}
                      <span className="font-normal text-ink-faint">{r.momento}</span>
                    </p>
                    <p className="text-[11px] leading-relaxed text-ink-soft wrap-words">
                      {r.detalle}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Search size={11} className="mt-0.5 shrink-0" />
        Todas estas operaciones también están disponibles desde el menú
        «Documentación» dentro del propio libro de Google.
      </p>
    </div>
  );
}
