/**
 * Constructor de evaluaciones — el armazón.
 *
 * Cuatro pasos navegables (General · Preguntas · Revisión · Resultados), un
 * reductor con deshacer y rehacer, y una sola función de guardado.
 *
 * ── El guardado, que es donde fallaba el módulo anterior ──────────────────────
 *  1. Se envía `revisionBase` (la revisión con la que se abrió el documento).
 *  2. La respuesta del servidor SUSTITUYE el estado local, así que el editor nunca
 *     se queda con una revisión vieja en la mano. Ese desajuste era el origen del
 *     «otro usuario actualizó este registro» que impedía guardar borradores.
 *  3. Si de verdad escribió otra sesión, el conflicto se explica y se ofrece
 *     recargar o sobrescribir; no es un callejón sin salida.
 *  4. El borrador se copia además en `localStorage` en cada cambio, de modo que un
 *     cierre accidental del navegador no se lleva el trabajo por delante.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Cloud,
  CloudOff,
  Eye,
  History,
  Link2,
  Loader2,
  Redo2,
  Save,
  Send,
  Settings2,
  Undo2,
} from "lucide-react";
import { toast } from "../../../design-system/liquid-glass/toast";
import { GlassDialog } from "../../../design-system/liquid-glass/GlassDialog";
import { TextArea } from "../../../design-system/liquid-glass/fields";
import type { TalentPermissions } from "../../shared/permissions";
import { logAudit } from "../../shared/auditTrail";
import { guardarEvaluacion, publicarEvaluacion, nuevaSolicitudId, revertirVersion } from "../api/client";
import { enlacePublico } from "../api/connection";
import { contarContenido, estimarMinutos } from "../domain/factory";
import { objetivoPuntaje } from "../domain/puntaje";
import { puedePublicar, revisarDocumento, soloAvisos, soloErrores } from "../domain/validation";
import type { DocumentoEvaluacion } from "../domain/model";
import {
  documentoParaGuardar,
  estadoInicial,
  puedeDeshacer,
  puedeRehacer,
  reducirConstructor,
  tieneCambios,
} from "../state/builderStore";
import { GeneralStep } from "./GeneralStep";
import { QuestionsStep } from "./QuestionsStep";
import { ReviewStep } from "./ReviewStep";
import {
  BotonCopiar,
  BotonPrimario,
  BotonSecundario,
  EstadoPill,
  GlassOverlay,
  GlassPanel,
  Metrica,
  Pill,
  formatearFecha,
  hace,
} from "../ui/pieces";

type Paso = "general" | "preguntas" | "revision" | "resultados";

const PASOS: { id: Paso; etiqueta: string; corto: string; icono: typeof Settings2 }[] = [
  { id: "general", etiqueta: "Configuración general", corto: "General", icono: Settings2 },
  { id: "preguntas", etiqueta: "Preguntas y contenido", corto: "Preguntas", icono: ClipboardList },
  { id: "revision", etiqueta: "Revisión y publicación", corto: "Revisión", icono: CheckCircle2 },
  { id: "resultados", etiqueta: "Resultados", corto: "Resultados", icono: BarChart3 },
];

type EstadoGuardado = "limpio" | "sucio" | "guardando" | "guardado" | "error" | "conflicto";

const CLAVE_BORRADOR = "bdp-evaluaciones-borrador";

interface Props {
  documento: DocumentoEvaluacion;
  permisos: TalentPermissions;
  actor: string;
  onSalir: () => void;
  onDocumento: (documento: DocumentoEvaluacion) => void;
  onVerResultados: (evaluacionId: string, titulo: string, codigo: string) => void;
}

export function Builder({ documento, permisos, actor, onSalir, onDocumento, onVerResultados }: Props) {
  const [estado, despachar] = useReducer(
    reducirConstructor,
    { evaluacion: documento.evaluacion, secciones: documento.secciones },
    estadoInicial,
  );
  const [paso, setPaso] = useState<Paso>("general");
  const [guardado, setGuardado] = useState<EstadoGuardado>("limpio");
  const [ultimoGuardado, setUltimoGuardado] = useState<string>(documento.evaluacion.actualizadoEn);
  const [conflicto, setConflicto] = useState<{ mensaje: string; detalle: Record<string, unknown> } | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [notasPublicacion, setNotasPublicacion] = useState("");
  const [dialogoPublicar, setDialogoPublicar] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [versiones, setVersiones] = useState(documento.versiones);
  const [recuperable, setRecuperable] = useState<{ titulo: string; guardadoEn: string } | null>(null);
  /** Versión recién publicada, para el acuse visible. */
  const [celebrar, setCelebrar] = useState<string | null>(null);
  /**
   * Petición de foco para el paso de preguntas.
   *
   * El contador cambia en cada petición: es lo que permite volver a saltar a la
   * MISMA pregunta desde el panel de revisión (sin él, el segundo clic sobre el
   * mismo bloqueo no movería nada).
   */
  const [foco, setFoco] = useState<{ preguntaId: string | null; nonce: number }>({
    preguntaId: null,
    nonce: 0,
  });

  const solicitudGuardado = useRef<string>(nuevaSolicitudId());
  const sucio = tieneCambios(estado);
  const contenido = estado.actual;
  const conteos = useMemo(() => contarContenido(contenido.secciones), [contenido.secciones]);
  const objetivo = objetivoPuntaje(contenido.evaluacion);
  const estimados = useMemo(() => estimarMinutos(contenido.secciones), [contenido.secciones]);
  const hallazgos = useMemo(
    () => revisarDocumento(contenido.evaluacion, contenido.secciones),
    [contenido.evaluacion, contenido.secciones],
  );
  const errores = useMemo(() => soloErrores(hallazgos), [hallazgos]);
  const avisos = useMemo(() => soloAvisos(hallazgos), [hallazgos]);

  useEffect(() => {
    setGuardado((previo) => (sucio ? (previo === "conflicto" ? previo : "sucio") : "limpio"));
  }, [sucio]);

  /* ------------------------- Copia local de seguridad ---------------------- */

  useEffect(() => {
    if (!sucio) return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          `${CLAVE_BORRADOR}:${contenido.evaluacion.id}`,
          JSON.stringify({ contenido, guardadoEn: new Date().toISOString() }),
        );
      } catch {
        /* sin espacio: el guardado explícito sigue disponible */
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [contenido, sucio]);

  // Al abrir, se comprueba si quedó una copia local más nueva que lo que devolvió
  // el servidor. No se aplica sola: se ofrece, porque sobrescribir sin preguntar
  // es exactamente cómo se pierde trabajo.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${CLAVE_BORRADOR}:${documento.evaluacion.id}`);
      if (!raw) return;
      const copia = JSON.parse(raw) as { contenido: typeof contenido; guardadoEn: string };
      if (!copia?.contenido || !copia.guardadoEn) return;
      if (Date.parse(copia.guardadoEn) <= Date.parse(documento.evaluacion.actualizadoEn)) {
        window.localStorage.removeItem(`${CLAVE_BORRADOR}:${documento.evaluacion.id}`);
        return;
      }
      setRecuperable({ titulo: copia.contenido.evaluacion.titulo, guardadoEn: copia.guardadoEn });
    } catch {
      /* copia corrupta: se ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recuperarBorrador = () => {
    try {
      const raw = window.localStorage.getItem(`${CLAVE_BORRADOR}:${documento.evaluacion.id}`);
      if (!raw) return;
      const copia = JSON.parse(raw) as { contenido: typeof contenido };
      despachar({ tipo: "reemplazar", contenido: copia.contenido });
      toast.success("Se recuperó el borrador local. Revísalo y guárdalo.");
    } finally {
      setRecuperable(null);
    }
  };

  const descartarBorrador = () => {
    window.localStorage.removeItem(`${CLAVE_BORRADOR}:${documento.evaluacion.id}`);
    setRecuperable(null);
  };

  /* -------------------------------- Guardado ------------------------------- */

  const guardar = useCallback(
    async (opciones: { forzar?: boolean; silencioso?: boolean } = {}): Promise<boolean> => {
      setGuardado("guardando");
      const res = await guardarEvaluacion(documentoParaGuardar(estado.actual), {
        revisionBase: estado.guardado.evaluacion.revision,
        forzar: opciones.forzar,
        actor,
        solicitudId: solicitudGuardado.current,
      });
      if (!res.ok) {
        if (res.error.code === "conflict" && res.error.detalle?.puedeForzar === true) {
          setGuardado("conflicto");
          setConflicto({ mensaje: res.error.message, detalle: res.error.detalle ?? {} });
          return false;
        }
        setGuardado("error");
        toast.error(res.error.message);
        if (res.error.pista) toast.info(res.error.pista);
        return false;
      }
      // Se adopta la versión canónica del servidor: incluye la revisión nueva y
      // cualquier saneamiento que haya aplicado.
      despachar({ tipo: "confirmarGuardado", contenido: { evaluacion: res.value.evaluacion, secciones: res.value.secciones } });
      setVersiones(res.value.versiones);
      setUltimoGuardado(res.value.evaluacion.actualizadoEn);
      setGuardado("guardado");
      setConflicto(null);
      onDocumento(res.value);
      window.localStorage.removeItem(`${CLAVE_BORRADOR}:${res.value.evaluacion.id}`);
      // Un identificador nuevo para la siguiente intención del usuario.
      solicitudGuardado.current = nuevaSolicitudId();
      if (!opciones.silencioso) toast.success("Borrador guardado.");
      return true;
    },
    [actor, estado.actual, estado.guardado.evaluacion.revision, onDocumento],
  );

  /* Atajos de teclado: Ctrl+S guarda, Ctrl+Z / Ctrl+Shift+Z deshacen y rehacen. */
  useEffect(() => {
    const alTeclado = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey)) return;
      const tecla = evento.key.toLowerCase();
      if (tecla === "s") {
        evento.preventDefault();
        if (sucio) void guardar();
        return;
      }
      // Deshacer no debe robarle el atajo a un campo de texto enfocado.
      const objetivo = evento.target as HTMLElement | null;
      const enCampo = objetivo?.tagName === "INPUT" || objetivo?.tagName === "TEXTAREA";
      if (tecla === "z" && !enCampo) {
        evento.preventDefault();
        despachar({ tipo: evento.shiftKey ? "rehacer" : "deshacer" });
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [guardar, sucio]);

  /* Aviso del navegador al cerrar con cambios sin guardar. */
  useEffect(() => {
    if (!sucio) return;
    const alSalir = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sucio]);

  /* ------------------------------- Publicación ----------------------------- */

  const publicar = async () => {
    setPublicando(true);
    // Se guarda primero: publicar lo que está en pantalla y no lo que hay en el
    // servidor es lo único que tiene sentido para el autor.
    const guardadoOk = await guardar({ silencioso: true });
    if (!guardadoOk) {
      setPublicando(false);
      return;
    }
    const res = await publicarEvaluacion(estado.actual.evaluacion.id, actor, notasPublicacion);
    setPublicando(false);
    setDialogoPublicar(false);
    if (!res.ok) {
      toast.error(res.error.message);
      if ((res.error.issues ?? []).length > 0) setPaso("revision");
      else if (res.error.pista) toast.info(res.error.pista);
      return;
    }
    despachar({
      tipo: "confirmarGuardado",
      contenido: { evaluacion: res.value.documento.evaluacion, secciones: res.value.documento.secciones },
    });
    setVersiones(res.value.documento.versiones);
    onDocumento(res.value.documento);
    logAudit(
      "assessment",
      estado.actual.evaluacion.id,
      "publish",
      actor,
      `Publicó ${res.value.version.etiqueta} (${res.value.version.tipoCambio})`,
      { version: res.value.version.etiqueta },
    );
    setNotasPublicacion("");
    // Publicar es la acción con más consecuencias del módulo: el enlace del
    // candidato empieza a servir otra versión. Un acuse que se ve —y que dice qué
    // versión— evita la duda de «¿se publicó o no?» y el segundo clic.
    setCelebrar(res.value.version.etiqueta);
    setTimeout(() => setCelebrar(null), 2600);
    toast.success(
      `Publicada como ${res.value.version.etiqueta}. El enlace público ya sirve esta versión.`,
    );
    if (res.value.advertencias.length > 0) {
      toast.warning(`${res.value.advertencias.length} advertencia(s) que conviene revisar.`);
      setPaso("revision");
    }
  };

  const revertir = async (versionId: string) => {
    const res = await revertirVersion(estado.actual.evaluacion.id, versionId, actor);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    despachar({ tipo: "confirmarGuardado", contenido: { evaluacion: res.value.evaluacion, secciones: res.value.secciones } });
    setVersiones(res.value.versiones);
    onDocumento(res.value);
    setHistorialAbierto(false);
    toast.success("Se sirve de nuevo la versión anterior. Los intentos ya iniciados no cambian.");
  };

  const salir = () => {
    if (sucio) {
      setConfirmarSalida(true);
      return;
    }
    onSalir();
  };

  const evaluacion = contenido.evaluacion;
  const publicada = evaluacion.estado === "publicada" || evaluacion.estado === "pausada";
  const editable = evaluacion.estado !== "archivada" && evaluacion.estado !== "papelera" && permisos.edit;

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <GlassPanel padding="p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button
              type="button"
              onClick={salir}
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft hover:text-ink"
              aria-label="Volver al listado"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <EstadoPill estado={evaluacion.estado} />
                <Pill tono="neutral" punto={false}>
                  {evaluacion.codigo}
                </Pill>
                {versiones.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistorialAbierto(true)}
                    className="inline-flex items-center gap-1 rounded-full tone-acento tone-ring px-2.5 py-1 text-[0.7rem] font-semibold transition-colors hover:bg-indigo-500/25"
                  >
                    <History className="h-3 w-3" />
                    {evaluacion.versionEtiqueta} · {versiones.length} versión{versiones.length === 1 ? "" : "es"}
                  </button>
                )}
              </div>
              <h2 className="truncate text-lg font-black tracking-tight text-ink sm:text-xl">
                {evaluacion.titulo || "Evaluación sin título"}
              </h2>
              <IndicadorGuardado estado={guardado} ultimo={ultimoGuardado} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BotonSecundario
              onClick={() => despachar({ tipo: "deshacer" })}
              disabled={!puedeDeshacer(estado)}
              title="Deshacer (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </BotonSecundario>
            <BotonSecundario
              onClick={() => despachar({ tipo: "rehacer" })}
              disabled={!puedeRehacer(estado)}
              title="Rehacer (Ctrl+Mayús+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </BotonSecundario>
            {publicada && <BotonCopiar texto={enlacePublico(evaluacion.codigo)} etiqueta="Enlace público" />}
            {editable && (
              <BotonSecundario onClick={() => void guardar()} disabled={!sucio || guardado === "guardando"}>
                {guardado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar borrador
              </BotonSecundario>
            )}
            {permisos.publish && editable && (
              <BotonPrimario onClick={() => setDialogoPublicar(true)} disabled={publicando}>
                {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {versiones.length > 0 ? "Publicar versión" : "Publicar"}
              </BotonPrimario>
            )}
          </div>
        </div>

        {/* Métricas vivas */}
        <motion.div
          initial="oculto"
          animate="mostrar"
          variants={{ oculto: {}, mostrar: { transition: { staggerChildren: 0.04 } } }}
          className="mt-3 flex flex-wrap gap-2 border-t border-[color:var(--hairline)] pt-3"
        >
          <Metrica etiqueta="Preguntas" valor={conteos.preguntas} />
          <Metrica etiqueta="Calificables" valor={conteos.calificables} />
          {conteos.manuales > 0 && <Metrica etiqueta="Con revisión" valor={conteos.manuales} />}
          <Metrica
            etiqueta="Puntos"
            valor={conteos.puntos}
            title={objetivo !== null ? `Repartidos automáticamente sobre un total de ${objetivo}` : "Reparto manual"}
          />
          <Metrica
            etiqueta="Duración fijada"
            valor={evaluacion.aplicacion.duracionMinutos ?? "libre"}
            sufijo={evaluacion.aplicacion.duracionMinutos ? "min" : ""}
          />
          <Metrica etiqueta="Duración estimada" valor={estimados} sufijo="min" />
          {errores.length > 0 && (
            <Metrica
              etiqueta="Bloqueos"
              valor={errores.length}
              destacada
              tono="peligro"
              onClick={() => setPaso("revision")}
              title="Ver los puntos que impiden publicar"
            />
          )}
          {avisos.length > 0 && (
            <Metrica etiqueta="Advertencias" valor={avisos.length} destacada tono="aviso" />
          )}
        </motion.div>
      </GlassPanel>

      {/* Recuperación de borrador */}
      <AnimatePresence>
        {recuperable && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-xs text-accent"
          >
            <span>
              Hay una copia local sin guardar de <strong>{recuperable.titulo}</strong>, de{" "}
              {formatearFecha(recuperable.guardadoEn)}. ¿La recuperamos?
            </span>
            <span className="flex gap-2">
              <BotonSecundario onClick={recuperarBorrador}>Recuperar</BotonSecundario>
              <BotonSecundario onClick={descartarBorrador}>Descartar</BotonSecundario>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conflicto */}
      <AnimatePresence>
        {conflicto && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs tone-text-aviso"
          >
            <p className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {conflicto.mensaje}
            </p>
            <p className="mt-1 pl-6 opacity-90">
              Última escritura: {String(conflicto.detalle.actualizadoPor ?? "otra sesión")} ·{" "}
              {hace(String(conflicto.detalle.actualizadoEn ?? ""))}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 pl-6">
              <BotonSecundario onClick={onSalir}>Volver y recargar</BotonSecundario>
              <BotonSecundario onClick={() => void guardar({ forzar: true })}>
                Sobrescribir con mis cambios
              </BotonSecundario>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navegación de pasos.
          El realce del paso activo se DESPLAZA de una pestaña a otra con un
          `layoutId`: el ojo sigue el movimiento y entiende que cambió de sitio, en
          lugar de tener que volver a buscar dónde está. */}
      <nav aria-label="Pasos del constructor" className="flex flex-wrap gap-1.5">
        {PASOS.map(({ id, etiqueta, corto, icono: Icono }) => {
          const activo = paso === id;
          const bloqueos = id === "revision" ? errores.length : 0;
          return (
            <motion.button
              key={id}
              type="button"
              onClick={() => setPaso(id)}
              aria-current={activo ? "step" : undefined}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              className={`relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors duration-300 ${
                activo
                  ? "text-white ring-white/25"
                  : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:fill-soft hover:text-ink"
              }`}
            >
              {activo && (
                <motion.span
                  layoutId="paso-activo"
                  transition={{ type: "spring", stiffness: 340, damping: 30 }}
                  className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] shadow-glass"
                />
              )}
              <Icono className="h-4 w-4" />
              <span className="hidden sm:inline">{etiqueta}</span>
              <span className="sm:hidden">{corto}</span>
              {bloqueos > 0 && (
                <motion.span
                  key={bloqueos}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 18 }}
                  className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[0.6rem] font-black text-white"
                >
                  {bloqueos}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Paso activo */}
      <motion.div key={paso} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {paso === "general" && (
          <GeneralStep contenido={contenido} despachar={despachar} editable={editable} estimados={estimados} />
        )}
        {paso === "preguntas" && (
          <QuestionsStep
            estado={estado}
            despachar={despachar}
            editable={editable}
            hallazgos={hallazgos}
            foco={foco}
          />
        )}
        {paso === "revision" && (
          <ReviewStep
            contenido={contenido}
            hallazgos={hallazgos}
            versiones={versiones}
            onIrA={(seccionId, preguntaId) => {
              despachar({ tipo: "seleccionar", seccionId, preguntaId });
              if (preguntaId) setFoco((previo) => ({ preguntaId, nonce: previo.nonce + 1 }));
              setPaso(preguntaId ? "preguntas" : "general");
            }}
            onPublicar={permisos.publish && editable ? () => setDialogoPublicar(true) : undefined}
            onRevertir={permisos.publish ? (versionId) => void revertir(versionId) : undefined}
          />
        )}
        {paso === "resultados" && (
          <GlassPanel>
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-ink-soft">
                Los resultados se abren en su propio panel, con la cola de intentos, el detalle de cada respuesta, el
                rastro de integridad y la exportación a PDF.
              </p>
              <BotonPrimario onClick={() => onVerResultados(evaluacion.id, evaluacion.titulo, evaluacion.codigo)}>
                <BarChart3 className="h-4 w-4" /> Abrir resultados
              </BotonPrimario>
              {publicada && (
                <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <Link2 className="h-3.5 w-3.5" /> Enlace del candidato:{" "}
                  <code className="rounded bg-[color:var(--fill-2)] px-1.5 py-0.5 font-mono text-[0.7rem]">
                    {enlacePublico(evaluacion.codigo)}
                  </code>
                </p>
              )}
            </div>
          </GlassPanel>
        )}
      </motion.div>

      {/* Diálogo de publicación */}
      <GlassOverlay
        abierto={dialogoPublicar}
        onClose={() => setDialogoPublicar(false)}
        etiqueta="Publicar evaluación"
        ancho="max-w-xl"
      >
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-black text-ink">
            {versiones.length > 0 ? "Publicar una versión nueva" : "Publicar la evaluación"}
          </h3>
          {errores.length > 0 ? (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm tone-text-peligro">
              <p className="font-bold">
                Hay {errores.length} punto(s) que impiden publicar. La revisión los enumera con un enlace a cada campo.
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              Se congela el contenido actual en una versión inmutable. Los intentos que ya empezaron siguen con la
              versión con la que se abrieron; los nuevos usarán esta.
            </p>
          )}
          {avisos.length > 0 && errores.length === 0 && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-xs tone-text-aviso">
              {avisos.length} advertencia(s) no bloqueante(s). Se pueden publicar y revisar después.
            </div>
          )}
          <TextArea
            value={notasPublicacion}
            onChange={(e) => setNotasPublicacion(e.target.value)}
            rows={3}
            placeholder="Notas de la versión (opcional): qué cambió y por qué."
            aria-label="Notas de la versión"
          />
          <div className="flex justify-end gap-2">
            <BotonSecundario onClick={() => setDialogoPublicar(false)}>Cancelar</BotonSecundario>
            <BotonPrimario onClick={() => void publicar()} disabled={!puedePublicar(hallazgos) || publicando}>
              {publicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publicar
            </BotonPrimario>
          </div>
          {errores.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDialogoPublicar(false);
                setPaso("revision");
              }}
              className="self-end text-xs font-semibold text-accent underline decoration-dotted"
            >
              Ver los {errores.length} punto(s) pendientes
            </button>
          )}
        </div>
      </GlassOverlay>

      {/* Historial de versiones */}
      <GlassOverlay
        abierto={historialAbierto}
        onClose={() => setHistorialAbierto(false)}
        etiqueta="Historial de versiones"
        ancho="max-w-2xl"
      >
        <h3 className="mb-3 text-lg font-black text-ink">Historial de versiones</h3>
        <ul className="flex flex-col gap-2">
          {[...versiones].reverse().map((version) => (
            <li
              key={version.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 ring-1 ${
                version.estado === "vigente"
                  ? "bg-emerald-500/10 ring-emerald-400/30"
                  : "fill-softer ring-[color:var(--hairline)]"
              }`}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  {version.etiqueta}
                  {version.estado === "vigente" && (
                    <Pill tono="exito">
                      <Check className="h-3 w-3" /> Vigente
                    </Pill>
                  )}
                </p>
                <p className="text-xs text-ink-soft">
                  {version.preguntas} preguntas · {version.puntosTotales} puntos ·{" "}
                  {formatearFecha(version.publicadoEn)}
                  {version.publicadoPor ? ` · ${version.publicadoPor}` : ""}
                </p>
                {version.notas && <p className="mt-1 text-xs italic text-ink-faint">«{version.notas}»</p>}
              </div>
              {version.estado !== "vigente" && permisos.publish && (
                <BotonSecundario onClick={() => void revertir(version.id)}>Servir esta versión</BotonSecundario>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">
          Revertir no borra versiones ni altera intentos. Solo cambia qué versión reciben los candidatos nuevos.
        </p>
      </GlassOverlay>

      {/* Acuse de publicación */}
      <AnimatePresence>
        {celebrar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[160] grid place-items-center"
            role="status"
            aria-live="polite"
          >
            <motion.div
              initial={{ scale: 0.7, y: 18 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="glass-heavy flex flex-col items-center gap-2 rounded-3xl px-8 py-6 text-center"
            >
              <motion.span
                initial={{ scale: 0.4, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.08 }}
                className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-glass"
              >
                <CheckCircle2 className="h-7 w-7" />
              </motion.span>
              <p className="text-lg font-black text-ink">Publicada como {celebrar}</p>
              <p className="max-w-xs text-xs text-ink-soft">
                El enlace del candidato ya sirve esta versión. Los intentos que ya empezaron siguen con la suya.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <GlassDialog
        open={confirmarSalida}
        onCancel={() => setConfirmarSalida(false)}
        onConfirm={() => {
          setConfirmarSalida(false);
          onSalir();
        }}
        title="¿Salir sin guardar?"
        description="Tienes cambios sin guardar. Se conserva una copia local en este navegador, pero no estarán en el libro de cálculo."
        confirmLabel="Salir sin guardar"
        cancelLabel="Seguir editando"
        destructive
      />
    </div>
  );
}

/** Indicador honesto del estado de guardado. */
function IndicadorGuardado({ estado, ultimo }: { estado: EstadoGuardado; ultimo: string }) {
  const config: Record<EstadoGuardado, { icono: typeof Cloud; texto: string; clase: string }> = {
    limpio: { icono: Cloud, texto: `Guardado ${hace(ultimo)}`, clase: "text-ink-faint" },
    sucio: { icono: CloudOff, texto: "Cambios sin guardar", clase: "tone-text-aviso" },
    guardando: { icono: Loader2, texto: "Guardando…", clase: "text-accent" },
    guardado: { icono: CheckCircle2, texto: "Guardado", clase: "tone-text-exito" },
    error: { icono: AlertTriangle, texto: "No se pudo guardar", clase: "tone-text-peligro" },
    conflicto: { icono: AlertTriangle, texto: "Conflicto con otra sesión", clase: "tone-text-aviso" },
  };
  const { icono: Icono, texto, clase } = config[estado];
  return (
    <p className={`mt-0.5 flex items-center gap-1.5 text-[0.7rem] font-semibold ${clase}`}>
      <Icono className={`h-3 w-3 ${estado === "guardando" ? "animate-spin" : ""}`} />
      {texto}
      {estado === "sucio" && <span className="font-normal text-ink-faint">· Ctrl+S para guardar</span>}
    </p>
  );
}

/** Reexportado para que el paso de revisión pueda mostrar la vista previa. */
export { Eye };
