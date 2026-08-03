/**
 * Módulo «Evaluaciones» — la pantalla principal.
 *
 * Orquesta el listado, las acciones de ciclo de vida, el panel de conexión, el
 * constructor y el panel de resultados. No hace ninguna llamada HTTP por su
 * cuenta: todo pasa por `api/client`.
 *
 * Decisiones visibles en esta pantalla:
 *  · El estado del backend se muestra SIEMPRE en la barra superior. Nunca hay duda
 *    sobre si lo que se ve es real o de demostración.
 *  · Los menús de fila viven en un portal (`MenuAnclado`), así que ya no aparecen
 *    detrás de otras capas ni fuera de la pantalla.
 *  · Cada acción destructiva pide confirmación con el nombre de lo que va a pasar,
 *    y el borrado permanente exige escribir la palabra.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Copy,
  Filter,
  LayoutGrid,
  Link2,
  ListFilter,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "../../../design-system/liquid-glass/toast";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { EmptyState, ErrorState, LoadingState } from "../../../components/States";
import { TextInput } from "../../../design-system/liquid-glass/fields";
import { useDebouncedValue } from "../../../shared/hooks";
import { useTalentPermissions } from "../../shared/permissions";
import { logAudit } from "../../shared/auditTrail";
import {
  borrarDefinitivamente,
  crearEvaluacion,
  duplicarEvaluacion,
  eliminarEvaluacion,
  listarEvaluaciones,
  obtenerEvaluacion,
  ping,
  publicarEvaluacion,
  relanzarEvaluacion,
  transicionar,
  type Transicion,
} from "../api/client";
import { conexionStore, enlacePublico } from "../api/connection";
import { CATEGORIA_LABEL, ESTADOS, ESTADO_LABEL, type DocumentoEvaluacion, type EstadoBackend, type ResumenEvaluacion } from "../domain/model";
import {
  aplicarFiltros,
  aplicarOrden,
  estadisticas,
  filtrosActivos,
  limpiarFiltros,
  listadoStore,
  ORDEN_LABEL,
  type OrdenListado,
} from "../state/listStore";
import { Builder } from "../builder/Builder";
import { ResultsPanel } from "../results/ResultsPanel";
import { ImportPanel } from "../imports/ImportPanel";
import { ConnectionPanel } from "./ConnectionPanel";
import {
  BotonCopiar,
  BotonPrimario,
  BotonSecundario,
  EstadoPill,
  GlassOverlay,
  GlassPanel,
  ItemMenu,
  MenuAnclado,
  Metrica,
  Pill,
  SeparadorMenu,
  formatearDuracion,
  hace,
} from "./pieces";

type AccionFila =
  | "abrir"
  | "resultados"
  | "publicar"
  | "pausar"
  | "reanudar"
  | "cerrar"
  | "relanzar"
  | "archivar"
  | "restaurar"
  | "duplicar"
  | "eliminar"
  | "borrar"
  | "copiarEnlace";

interface Confirmacion {
  accion: "archivar" | "eliminar" | "borrar" | "duplicar" | "cerrar";
  item: ResumenEvaluacion;
}

export function EvaluacionesModule() {
  const listado = listadoStore.use();
  const conexion = conexionStore.use();
  const { permissions, userName } = useTalentPermissions();

  const [items, setItems] = useState<ResumenEvaluacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; pista: string } | null>(null);
  const [estadoBackend, setEstadoBackend] = useState<EstadoBackend | null>(null);
  const [avisosBackend, setAvisosBackend] = useState<string[]>([]);

  const [editando, setEditando] = useState<DocumentoEvaluacion | null>(null);
  const [resultadosDe, setResultadosDe] = useState<ResumenEvaluacion | null>(null);
  const [conexionAbierta, setConexionAbierta] = useState(false);
  const [importando, setImportando] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [menu, setMenu] = useState<{ item: ResumenEvaluacion; ancla: HTMLElement } | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [textoBorrado, setTextoBorrado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const busqueda = useDebouncedValue(listado.busqueda, 250);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const recargar = useCallback(async () => {
    setCargando(true);
    const [estado, lista] = await Promise.all([
      ping(),
      listarEvaluaciones({ buscar: busqueda, incluirPapelera: listado.filtros.incluirPapelera }),
    ]);
    if (!montado.current) return;
    if (estado.ok) {
      setEstadoBackend(estado.value.datos);
      setAvisosBackend(estado.value.avisos);
    } else {
      setEstadoBackend(null);
    }
    if (lista.ok) {
      setItems(lista.value.items);
      setError(null);
    } else {
      setItems([]);
      setError({ mensaje: lista.error.message, pista: lista.error.pista ?? "" });
    }
    setCargando(false);
  }, [busqueda, listado.filtros.incluirPapelera]);

  useEffect(() => {
    void recargar();
  }, [recargar, conexion.modo, conexion.url, conexion.llave]);

  const visibles = useMemo(
    () => aplicarOrden(aplicarFiltros(items, { ...listado, busqueda }), listado.orden),
    [items, listado, busqueda],
  );
  const stats = useMemo(() => estadisticas(items), [items]);
  const pendientes = useMemo(
    () => items.reduce((suma, item) => suma + (item.intentosEnviados > 0 ? 0 : 0), 0),
    [items],
  );

  /* ------------------------------- Acciones ------------------------------- */

  const abrir = useCallback(async (id: string) => {
    setOcupado(true);
    const res = await obtenerEvaluacion(id);
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setEditando(res.value);
  }, []);

  const crear = async () => {
    setOcupado(true);
    const res = await crearEvaluacion("Evaluación sin título", "conocimientos", userName);
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    logAudit("assessment", res.value.evaluacion.id, "create", userName, `Creó la evaluación ${res.value.evaluacion.codigo}`);
    toast.success("Evaluación creada. Empieza por el título y las instrucciones.");
    setEditando(res.value);
    void recargar();
  };

  const ejecutarTransicion = async (item: ResumenEvaluacion, transicion: Transicion, mensaje: string) => {
    setOcupado(true);
    const res = await transicionar(item.id, transicion, userName);
    setOcupado(false);
    if (!res.ok) {
      toast.error(res.error.message);
      if (res.error.pista) toast.info(res.error.pista);
      return;
    }
    logAudit("assessment", item.id, transicion === "archivar" ? "archive" : "edit", userName, mensaje);
    toast.success(mensaje);
    void recargar();
  };

  const publicarDesdeListado = async (item: ResumenEvaluacion) => {
    setOcupado(true);
    const res = await publicarEvaluacion(item.id, userName);
    setOcupado(false);
    if (res.ok) {
      logAudit("assessment", item.id, "publish", userName, `Publicó ${res.value.version.etiqueta}`);
      toast.success(`Publicada como ${res.value.version.etiqueta}.`);
      void recargar();
      return;
    }
    // Si el rechazo trae hallazgos, se abre el constructor en la revisión: dejar
    // un mensaje sin salida es lo que hacía inútil el panel anterior.
    if ((res.error.issues ?? []).length > 0) {
      toast.warning("Faltan detalles para publicar. Se abrió la revisión.");
      await abrir(item.id);
      return;
    }
    toast.error(res.error.message);
  };

  const ejecutarAccion = async (accion: AccionFila, item: ResumenEvaluacion) => {
    switch (accion) {
      case "abrir":
        await abrir(item.id);
        return;
      case "resultados":
        setResultadosDe(item);
        return;
      case "copiarEnlace":
        await navigator.clipboard?.writeText(enlacePublico(item.codigo));
        toast.success("Enlace público copiado.");
        return;
      case "publicar":
        await publicarDesdeListado(item);
        return;
      case "pausar":
        await ejecutarTransicion(item, "pausar", "Evaluación pausada.");
        return;
      case "reanudar":
        await ejecutarTransicion(item, "reanudar", "Evaluación reanudada.");
        return;
      case "restaurar":
        await ejecutarTransicion(item, "restaurar", "Evaluación restaurada como borrador.");
        return;
      case "relanzar": {
        setOcupado(true);
        const res = await relanzarEvaluacion(item.id, userName);
        setOcupado(false);
        if (!res.ok) {
          toast.error(res.error.message);
          if (res.error.pista) toast.info(res.error.pista);
          return;
        }
        toast.success("Evaluación relanzada: el enlace vuelve a estar activo.");
        void recargar();
        return;
      }
      case "cerrar":
      case "archivar":
      case "duplicar":
      case "eliminar":
      case "borrar":
        setTextoBorrado("");
        setConfirmacion({ accion, item });
        return;
      default:
        return;
    }
  };

  const confirmar = async () => {
    if (!confirmacion) return;
    const { accion, item } = confirmacion;
    setOcupado(true);
    if (accion === "duplicar") {
      const res = await duplicarEvaluacion(item.id, userName);
      setOcupado(false);
      setConfirmacion(null);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Copia creada como borrador.");
      setEditando(res.value);
      void recargar();
      return;
    }
    if (accion === "borrar") {
      const res = await borrarDefinitivamente(item.id, userName);
      setOcupado(false);
      setConfirmacion(null);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      logAudit("assessment", item.id, "delete", userName, `Borró definitivamente ${item.codigo}`);
      toast.success("Evaluación borrada definitivamente.");
      void recargar();
      return;
    }
    if (accion === "eliminar") {
      const res = await eliminarEvaluacion(item.id, userName);
      setOcupado(false);
      setConfirmacion(null);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Evaluación enviada a la papelera. Puedes restaurarla desde el filtro «Papelera».");
      void recargar();
      return;
    }
    const transicion: Transicion = accion === "archivar" ? "archivar" : "cerrar";
    setConfirmacion(null);
    await ejecutarTransicion(
      item,
      transicion,
      accion === "archivar" ? "Evaluación archivada." : "Evaluación cerrada: el enlace deja de aceptar intentos.",
    );
    setOcupado(false);
  };

  /* -------------------------------- Render -------------------------------- */

  if (editando) {
    return (
      <Builder
        documento={editando}
        permisos={permissions}
        actor={userName}
        onSalir={() => {
          setEditando(null);
          void recargar();
        }}
        onDocumento={setEditando}
        onVerResultados={(evaluacionId, titulo, codigo) =>
          setResultadosDe({
            ...(items.find((i) => i.id === evaluacionId) ?? ({} as ResumenEvaluacion)),
            id: evaluacionId,
            titulo,
            codigo,
          })
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BarraSuperior
        estado={estadoBackend}
        avisos={avisosBackend}
        modo={conexion.modo}
        onAbrirConexion={() => setConexionAbierta(true)}
      />

      {/* Barra de herramientas */}
      <GlassPanel padding="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <TextInput
              value={listado.busqueda}
              onChange={(e) => listadoStore.set((s) => ({ ...s, busqueda: e.target.value }))}
              placeholder="Buscar por título, código, categoría o etiqueta…"
              className="pl-9"
              aria-label="Buscar evaluaciones"
            />
          </div>

          <div className="flex rounded-full fill-softer p-0.5 ring-1 ring-[color:var(--hairline)]">
            {(["tarjetas", "tabla"] as const).map((vista) => (
              <button
                key={vista}
                type="button"
                onClick={() => listadoStore.set((s) => ({ ...s, vista }))}
                aria-pressed={listado.vista === vista}
                title={vista === "tarjetas" ? "Vista de tarjetas" : "Vista de tabla"}
                className={`grid h-8 w-8 place-items-center rounded-full transition-all duration-300 ${
                  listado.vista === vista
                    ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white shadow-glass"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {vista === "tarjetas" ? <LayoutGrid className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
              </button>
            ))}
          </div>

          <select
            value={listado.orden}
            onChange={(e) => listadoStore.set((s) => ({ ...s, orden: e.target.value as OrdenListado }))}
            aria-label="Orden del listado"
            className="rounded-full fill-softer px-3 py-2 text-sm font-semibold text-ink outline-none ring-1 ring-[color:var(--hairline)] focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {Object.entries(ORDEN_LABEL).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>

          <BotonSecundario onClick={() => setFiltrosAbiertos((v) => !v)} activo={filtrosAbiertos}>
            <Filter className="h-4 w-4" />
            Filtros
            {filtrosActivos(listado.filtros) > 0 && (
              <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[0.6rem] font-black text-white">
                {filtrosActivos(listado.filtros)}
              </span>
            )}
          </BotonSecundario>

          <BotonSecundario onClick={() => void recargar()} disabled={cargando} title="Actualizar">
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </BotonSecundario>

          <BotonSecundario onClick={() => setConexionAbierta(true)} title="Conexión y diagnóstico">
            <Settings2 className="h-4 w-4" />
          </BotonSecundario>

          {permissions.import && (
            <BotonSecundario onClick={() => setImportando(true)}>
              <Upload className="h-4 w-4" />
              Importar
            </BotonSecundario>
          )}

          {permissions.create && (
            <BotonPrimario onClick={() => void crear()} disabled={ocupado}>
              <Plus className="h-4 w-4" />
              Nueva evaluación
            </BotonPrimario>
          )}
        </div>

        <AnimatePresence initial={false}>
          {filtrosAbiertos && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--hairline)] pt-3">
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-faint">Estado</span>
                {ESTADOS.map((estado) => {
                  const activo = listado.filtros.estados.includes(estado);
                  return (
                    <button
                      key={estado}
                      type="button"
                      onClick={() =>
                        listadoStore.set((s) => ({
                          ...s,
                          filtros: {
                            ...s.filtros,
                            estados: activo
                              ? s.filtros.estados.filter((e) => e !== estado)
                              : [...s.filtros.estados, estado],
                            incluirPapelera: estado === "papelera" ? !activo : s.filtros.incluirPapelera,
                          },
                        }))
                      }
                      className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors ${
                        activo
                          ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/40"
                          : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
                      }`}
                    >
                      {ESTADO_LABEL[estado]}
                    </button>
                  );
                })}
                <span className="mx-1 h-4 w-px bg-[color:var(--hairline)]" />
                <button
                  type="button"
                  onClick={() =>
                    listadoStore.set((s) => ({
                      ...s,
                      filtros: { ...s.filtros, soloConIntentos: !s.filtros.soloConIntentos },
                    }))
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors ${
                    listado.filtros.soloConIntentos
                      ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/40"
                      : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft"
                  }`}
                >
                  <ListFilter className="h-3 w-3" /> Solo con intentos
                </button>
                {filtrosActivos(listado.filtros) > 0 && (
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft underline decoration-dotted hover:text-ink"
                  >
                    <X className="h-3 w-3" /> Limpiar filtros
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassPanel>

      {/* Métricas del listado */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Metrica etiqueta="Evaluaciones" valor={stats.total} icono={<Sparkles className="h-3 w-3" />} />
          <Metrica etiqueta="Publicadas" valor={stats.publicadas} />
          <Metrica etiqueta="Borradores" valor={stats.borradores} />
          <Metrica etiqueta="Preguntas" valor={stats.preguntas} />
          <Metrica etiqueta="Intentos" valor={stats.intentos} icono={<BarChart3 className="h-3 w-3" />} />
          {stats.papelera > 0 && <Metrica etiqueta="En la papelera" valor={stats.papelera} />}
          {pendientes > 0 && <Metrica etiqueta="Por revisar" valor={pendientes} />}
        </div>
      )}

      {/* Contenido */}
      {cargando && items.length === 0 ? (
        <LoadingState />
      ) : error ? (
        <div className="flex flex-col gap-3">
          <ErrorState message={error.mensaje} onRetry={() => void recargar()} />
          {error.pista && (
            <GlassPanel padding="p-4" className="border border-amber-400/30 bg-amber-500/5">
              <p className="text-xs text-amber-200">{error.pista}</p>
              <div className="mt-2">
                <BotonSecundario onClick={() => setConexionAbierta(true)}>
                  <Settings2 className="h-4 w-4" /> Abrir conexión y diagnóstico
                </BotonSecundario>
              </div>
            </GlassPanel>
          )}
        </div>
      ) : visibles.length === 0 ? (
        <EmptyState
          message={
            items.length === 0
              ? "Todavía no hay evaluaciones. Crea la primera o impórtala desde un archivo."
              : "Ninguna evaluación coincide con la búsqueda o los filtros."
          }
        />
      ) : listado.vista === "tarjetas" ? (
        <Tarjetas
          items={visibles}
          onAbrir={(id) => void abrir(id)}
          onMenu={(item, ancla) => setMenu({ item, ancla })}
          onResultados={setResultadosDe}
        />
      ) : (
        <Tabla
          items={visibles}
          onAbrir={(id) => void abrir(id)}
          onMenu={(item, ancla) => setMenu({ item, ancla })}
        />
      )}

      {/* Menú de fila */}
      {menu && (
        <MenuFila
          item={menu.item}
          ancla={menu.ancla}
          permisos={permissions}
          onClose={() => setMenu(null)}
          onAccion={(accion) => {
            const item = menu.item;
            setMenu(null);
            void ejecutarAccion(accion, item);
          }}
        />
      )}

      {/* Paneles superpuestos */}
      <GlassOverlay
        abierto={conexionAbierta}
        onClose={() => {
          setConexionAbierta(false);
          void recargar();
        }}
        etiqueta="Conexión y diagnóstico"
        ancho="max-w-4xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-ink">Conexión y diagnóstico</h2>
          <button
            type="button"
            onClick={() => setConexionAbierta(false)}
            className="grid h-8 w-8 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ConnectionPanel onCambio={() => void recargar()} />
      </GlassOverlay>

      {resultadosDe && (
        <ResultsPanel
          evaluacionId={resultadosDe.id}
          titulo={resultadosDe.titulo}
          codigo={resultadosDe.codigo}
          actor={userName}
          onClose={() => {
            setResultadosDe(null);
            void recargar();
          }}
        />
      )}

      {importando && (
        <ImportPanel
          actor={userName}
          onClose={() => setImportando(false)}
          onCreado={(documento) => {
            setImportando(false);
            setEditando(documento);
            void recargar();
          }}
        />
      )}

      {/* Confirmaciones */}
      <GlassDialog
        open={confirmacion !== null && confirmacion.accion !== "borrar"}
        busy={ocupado}
        onCancel={() => setConfirmacion(null)}
        onConfirm={() => void confirmar()}
        title={tituloConfirmacion(confirmacion)}
        description={descripcionConfirmacion(confirmacion)}
        confirmLabel={etiquetaConfirmacion(confirmacion)}
        destructive={confirmacion?.accion === "archivar" || confirmacion?.accion === "eliminar"}
      />

      <GlassOverlay
        abierto={confirmacion?.accion === "borrar"}
        onClose={() => setConfirmacion(null)}
        etiqueta="Borrado permanente"
        ancho="max-w-lg"
      >
        <div className="flex flex-col gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 ring-1 ring-white/30">
            <XCircle className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-lg font-black text-ink">Borrar «{confirmacion?.item.titulo}» para siempre</h2>
          <p className="text-sm text-ink-soft">
            Esto elimina la evaluación, sus versiones publicadas, <strong>todos los intentos</strong> y todas las
            respuestas de los candidatos. No se puede deshacer.
          </p>
          <p className="text-sm text-ink-soft">
            Escribe <strong className="font-mono text-rose-300">ELIMINAR</strong> para confirmar.
          </p>
          <TextInput
            value={textoBorrado}
            onChange={(e) => setTextoBorrado(e.target.value)}
            placeholder="ELIMINAR"
            aria-label="Confirmación de borrado"
          />
          <div className="mt-1 flex justify-end gap-2">
            <BotonSecundario onClick={() => setConfirmacion(null)}>Cancelar</BotonSecundario>
            <button
              type="button"
              disabled={textoBorrado !== "ELIMINAR" || ocupado}
              onClick={() => void confirmar()}
              className="rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-5 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/25 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0"
            >
              Borrar definitivamente
            </button>
          </div>
        </div>
      </GlassOverlay>
    </div>
  );
}

/* ------------------------------ Barra superior ---------------------------- */

function BarraSuperior({
  estado,
  avisos,
  modo,
  onAbrirConexion,
}: {
  estado: EstadoBackend | null;
  avisos: string[];
  modo: string;
  onAbrirConexion: () => void;
}) {
  const demostracion = modo === "demostracion";
  const sinLlave = avisos.includes("ADMIN_SIN_LLAVE");
  const sinInstalar = estado && !estado.instalado;

  if (!demostracion && !sinLlave && !sinInstalar && estado) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-ink-faint">
        <Pill tono="exito">
          Backend {estado.version} · esquema {estado.esquema}
        </Pill>
        {estado.libro && <span>Libro: {estado.libro.nombre}</span>}
        <button type="button" onClick={onAbrirConexion} className="underline decoration-dotted hover:text-ink">
          Conexión y diagnóstico
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs ${
        demostracion
          ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
          : "border-amber-400/40 bg-amber-500/10 text-amber-200"
      }`}
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {demostracion && (
            <>
              <strong>Modo demostración.</strong> Los datos viven solo en este navegador: no hay libro de cálculo ni
              resultados compartidos con el equipo. Configura el backend cuando lo tengas listo.
            </>
          )}
          {!demostracion && sinInstalar && (
            <>
              <strong>El libro todavía no tiene la estructura.</strong> Pulsa «Instalar o reparar» en el panel de
              conexión: crea las hojas necesarias sin tocar nada de lo que ya exista.
            </>
          )}
          {!demostracion && !sinInstalar && sinLlave && (
            <>
              <strong>La administración está abierta.</strong> Cualquiera con la URL puede crear o publicar
              evaluaciones. Genera la llave desde el libro y pégala en el panel de conexión.
            </>
          )}
        </span>
      </div>
      <BotonSecundario onClick={onAbrirConexion}>
        <Settings2 className="h-4 w-4" /> Abrir conexión
      </BotonSecundario>
    </div>
  );
}

/* --------------------------------- Tarjetas -------------------------------- */

function Tarjetas({
  items,
  onAbrir,
  onMenu,
  onResultados,
}: {
  items: ResumenEvaluacion[];
  onAbrir: (id: string) => void;
  onMenu: (item: ResumenEvaluacion, ancla: HTMLElement) => void;
  onResultados: (item: ResumenEvaluacion) => void;
}) {
  return (
    <motion.div
      initial="oculto"
      animate="mostrar"
      variants={{ oculto: {}, mostrar: { transition: { staggerChildren: 0.035 } } }}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((item) => (
        <motion.article
          key={item.id}
          variants={{ oculto: { opacity: 0, y: 14 }, mostrar: { opacity: 1, y: 0 } }}
          className="glass group relative flex flex-col gap-3 rounded-3xl p-4 transition-transform duration-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <EstadoPill estado={item.estado} />
                <Pill tono="neutral" punto={false}>
                  {CATEGORIA_LABEL[item.categoria] ?? item.categoria}
                </Pill>
                {item.versiones > 0 && (
                  <Pill tono="acento" punto={false}>
                    {item.versionEtiqueta}
                  </Pill>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAbrir(item.id)}
                className="text-left text-base font-black leading-tight text-ink transition-colors hover:text-cyan-300"
              >
                {item.titulo}
              </button>
              <p className="mt-0.5 font-mono text-[0.7rem] text-ink-faint">{item.codigo}</p>
            </div>
            <button
              type="button"
              onClick={(e) => onMenu(item, e.currentTarget)}
              aria-label={`Acciones de ${item.titulo}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft hover:text-ink"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>

          {item.descripcion && <p className="line-clamp-2 text-xs text-ink-soft">{item.descripcion}</p>}

          <dl className="grid grid-cols-3 gap-2 text-center">
            <Dato etiqueta="Preguntas" valor={item.preguntas} />
            <Dato etiqueta="Puntos" valor={item.puntosTotales} />
            <Dato etiqueta="Duración" valor={item.duracionMinutos ? `${item.duracionMinutos}′` : "libre"} />
          </dl>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--hairline)] pt-2.5">
            <span className="text-[0.68rem] text-ink-faint">
              {item.actualizadoPor ? `${item.actualizadoPor} · ` : ""}
              {hace(item.actualizadoEn)}
            </span>
            <div className="flex items-center gap-1.5">
              {item.intentos > 0 && (
                <button
                  type="button"
                  onClick={() => onResultados(item)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.7rem] font-bold text-emerald-200 ring-1 ring-emerald-400/30 transition-colors hover:bg-emerald-500/25"
                >
                  <BarChart3 className="h-3 w-3" />
                  {item.intentos} intento{item.intentos === 1 ? "" : "s"}
                </button>
              )}
              {item.estado === "publicada" && <BotonCopiar texto={enlacePublico(item.codigo)} etiqueta="Enlace" />}
            </div>
          </div>
        </motion.article>
      ))}
    </motion.div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="rounded-2xl fill-softer px-2 py-1.5 ring-1 ring-[color:var(--hairline)]">
      <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">{etiqueta}</dt>
      <dd className="text-sm font-black tabular-nums text-ink">{valor}</dd>
    </div>
  );
}

/* ---------------------------------- Tabla --------------------------------- */

function Tabla({
  items,
  onAbrir,
  onMenu,
}: {
  items: ResumenEvaluacion[];
  onAbrir: (id: string) => void;
  onMenu: (item: ResumenEvaluacion, ancla: HTMLElement) => void;
}) {
  return (
    <GlassPanel padding="p-0" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[color:var(--fill-1)] text-[0.68rem] uppercase tracking-wide text-ink-faint backdrop-blur">
            <tr>
              <th className="px-4 py-3 font-bold">Evaluación</th>
              <th className="px-3 py-3 font-bold">Estado</th>
              <th className="px-3 py-3 font-bold">Versión</th>
              <th className="px-3 py-3 text-right font-bold">Preguntas</th>
              <th className="px-3 py-3 text-right font-bold">Puntos</th>
              <th className="px-3 py-3 text-right font-bold">Duración</th>
              <th className="px-3 py-3 text-right font-bold">Intentos</th>
              <th className="px-3 py-3 font-bold">Actualizada</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[color:var(--hairline)] transition-colors hover:fill-softer">
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onAbrir(item.id)}
                    className="text-left font-semibold text-ink transition-colors hover:text-cyan-300"
                  >
                    {item.titulo}
                  </button>
                  <p className="font-mono text-[0.68rem] text-ink-faint">{item.codigo}</p>
                </td>
                <td className="px-3 py-2.5">
                  <EstadoPill estado={item.estado} />
                </td>
                <td className="px-3 py-2.5 text-xs text-ink-soft">{item.versionEtiqueta}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{item.preguntas}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{item.puntosTotales}</td>
                <td className="px-3 py-2.5 text-right text-xs text-ink-soft">
                  {item.duracionMinutos ? formatearDuracion(item.duracionMinutos * 60) : "Sin límite"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">{item.intentos}</td>
                <td className="px-3 py-2.5 text-xs text-ink-faint">{hace(item.actualizadoEn)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => onMenu(item, e.currentTarget)}
                    aria-label={`Acciones de ${item.titulo}`}
                    className="grid h-8 w-8 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft hover:text-ink"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}

/* -------------------------------- Menú de fila ---------------------------- */

function MenuFila({
  item,
  ancla,
  permisos,
  onClose,
  onAccion,
}: {
  item: ResumenEvaluacion;
  ancla: HTMLElement;
  permisos: ReturnType<typeof useTalentPermissions>["permissions"];
  onClose: () => void;
  onAccion: (accion: AccionFila) => void;
}) {
  const publicada = item.estado === "publicada";
  const pausada = item.estado === "pausada";
  const cerrada = item.estado === "cerrada";
  const enPapelera = item.estado === "papelera";
  const archivada = item.estado === "archivada";
  const editable = !enPapelera && !archivada;

  return (
    <MenuAnclado ancla={ancla} onClose={onClose}>
      <ItemMenu onClick={() => onAccion("abrir")} icono={<Settings2 className="h-4 w-4" />}>
        {editable ? "Abrir y editar" : "Ver contenido"}
      </ItemMenu>
      <ItemMenu onClick={() => onAccion("resultados")} icono={<BarChart3 className="h-4 w-4" />}>
        Resultados{item.intentos > 0 ? ` (${item.intentos})` : ""}
      </ItemMenu>
      {publicada && (
        <ItemMenu onClick={() => onAccion("copiarEnlace")} icono={<Link2 className="h-4 w-4" />}>
          Copiar enlace público
        </ItemMenu>
      )}

      <SeparadorMenu />

      {editable && permisos.publish && !publicada && (
        <ItemMenu onClick={() => onAccion("publicar")} icono={<Send className="h-4 w-4" />}>
          {item.versiones > 0 ? "Publicar versión nueva" : "Publicar"}
        </ItemMenu>
      )}
      {publicada && permisos.edit && (
        <ItemMenu onClick={() => onAccion("pausar")} icono={<Pause className="h-4 w-4" />}>
          Pausar
        </ItemMenu>
      )}
      {pausada && permisos.edit && (
        <ItemMenu onClick={() => onAccion("reanudar")} icono={<Play className="h-4 w-4" />}>
          Reanudar
        </ItemMenu>
      )}
      {(publicada || pausada) && permisos.close && (
        <ItemMenu onClick={() => onAccion("cerrar")} icono={<XCircle className="h-4 w-4" />}>
          Cerrar convocatoria
        </ItemMenu>
      )}
      {cerrada && permisos.publish && (
        <ItemMenu onClick={() => onAccion("relanzar")} icono={<RotateCcw className="h-4 w-4" />}>
          Relanzar
        </ItemMenu>
      )}

      <SeparadorMenu />

      {permisos.create && (
        <ItemMenu onClick={() => onAccion("duplicar")} icono={<Copy className="h-4 w-4" />}>
          Duplicar
        </ItemMenu>
      )}
      {(archivada || enPapelera) && permisos.edit && (
        <ItemMenu onClick={() => onAccion("restaurar")} icono={<ArchiveRestore className="h-4 w-4" />}>
          Restaurar
        </ItemMenu>
      )}
      {editable && permisos.archive && (
        <ItemMenu onClick={() => onAccion("archivar")} icono={<Archive className="h-4 w-4" />}>
          Archivar
        </ItemMenu>
      )}
      {!enPapelera && permisos.archive && (
        <ItemMenu onClick={() => onAccion("eliminar")} icono={<Trash2 className="h-4 w-4" />} destructivo>
          Enviar a la papelera
        </ItemMenu>
      )}
      {enPapelera && permisos.archive && (
        <ItemMenu onClick={() => onAccion("borrar")} icono={<XCircle className="h-4 w-4" />} destructivo>
          Borrar definitivamente
        </ItemMenu>
      )}
    </MenuAnclado>
  );
}

/* ----------------------------- Textos de diálogo -------------------------- */

function tituloConfirmacion(confirmacion: Confirmacion | null): string {
  switch (confirmacion?.accion) {
    case "archivar":
      return "¿Archivar esta evaluación?";
    case "eliminar":
      return "¿Enviarla a la papelera?";
    case "duplicar":
      return "¿Duplicar esta evaluación?";
    case "cerrar":
      return "¿Cerrar la convocatoria?";
    default:
      return "";
  }
}

function descripcionConfirmacion(confirmacion: Confirmacion | null): string {
  switch (confirmacion?.accion) {
    case "archivar":
      return "Deja de aparecer en el listado activo y no se puede editar hasta restaurarla. No se borra ningún dato ni ningún intento.";
    case "eliminar":
      return "Se puede restaurar desde el filtro «Papelera». Los intentos y las respuestas se conservan.";
    case "duplicar":
      return "Se crea una copia en borrador, con identificadores nuevos, sin versiones publicadas y sin intentos.";
    case "cerrar":
      return "El enlace público deja de aceptar intentos nuevos. Los que estén en curso se pueden terminar y siempre podrás relanzarla.";
    default:
      return "";
  }
}

function etiquetaConfirmacion(confirmacion: Confirmacion | null): string {
  switch (confirmacion?.accion) {
    case "archivar":
      return "Archivar";
    case "eliminar":
      return "Enviar a la papelera";
    case "duplicar":
      return "Duplicar";
    case "cerrar":
      return "Cerrar";
    default:
      return "Confirmar";
  }
}
