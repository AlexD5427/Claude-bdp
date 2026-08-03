/**
 * Panel de resultados — lo que el módulo anterior no tenía en absoluto.
 *
 * Cola de intentos con sus agregados, detalle de cada intento con la pregunta tal
 * como se le presentó al candidato, calificación manual de las abiertas, rastro de
 * integridad con su cronología y descarga del informe en PDF.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  FileDown,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Undo2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "../../../design-system/liquid-glass/toast";
import { NumberField, TextArea, TextInput } from "../../../design-system/liquid-glass/fields";
import { EmptyState, LoadingState } from "../../../components/States";
import { anularIntento, calificarRespuesta, exportarIntento, listarIntentos, obtenerIntento } from "../api/client";
import { RichText } from "../richtext/RichText";
import { tipoSpec } from "../domain/questionTypes";
import { CALIFICACION_LABEL, type ColaIntentos, type DetalleIntento, type Intento, type RespuestaDetalle } from "../domain/model";
import { ConstructorPdf, descargar, nombreArchivo } from "./pdf";
import {
  Anillo,
  Barra,
  BotonPrimario,
  BotonSecundario,
  EstadoIntentoPill,
  GlassOverlay,
  GlassPanel,
  Metrica,
  Pill,
  RiesgoPill,
  formatearDuracion,
  formatearFecha,
} from "../ui/pieces";

export function ResultsPanel({
  evaluacionId,
  titulo,
  codigo,
  actor,
  onClose,
}: {
  evaluacionId: string;
  titulo: string;
  codigo: string;
  actor: string;
  onClose: () => void;
}) {
  const [cola, setCola] = useState<ColaIntentos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloRiesgo, setSoloRiesgo] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [detalle, setDetalle] = useState<DetalleIntento | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    const res = await listarIntentos(evaluacionId, { buscar: busqueda, soloRiesgo });
    setCargando(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setError(null);
    setCola(res.value);
  }, [busqueda, evaluacionId, soloRiesgo]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const abrirDetalle = async (intentoId: string) => {
    setCargandoDetalle(true);
    const res = await obtenerIntento(intentoId);
    setCargandoDetalle(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setDetalle(res.value);
  };

  const intentos = useMemo(() => {
    const lista = cola?.intentos ?? [];
    return soloPendientes ? lista.filter((i) => i.estadoCalificacion === "pendiente_revision") : lista;
  }, [cola, soloPendientes]);

  const resumen = cola?.resumen;

  return (
    <GlassOverlay abierto onClose={onClose} etiqueta={`Resultados de ${titulo}`} ancho="max-w-7xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-cyan-400">Resultados</p>
          <h2 className="truncate text-lg font-black text-ink sm:text-xl">{titulo}</h2>
          <p className="font-mono text-[0.7rem] text-ink-faint">{codigo}</p>
        </div>
        <div className="flex items-center gap-2">
          <BotonSecundario onClick={() => void recargar()} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </BotonSecundario>
          {cola && intentos.length > 0 && (
            <BotonSecundario onClick={() => descargarCsv(cola)}>
              <Download className="h-4 w-4" /> CSV
            </BotonSecundario>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {resumen && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Metrica etiqueta="Intentos" valor={resumen.total} />
          <Metrica etiqueta="Enviados" valor={resumen.enviados} />
          <Metrica etiqueta="En curso" valor={resumen.enCurso} />
          {resumen.expirados > 0 && <Metrica etiqueta="Expirados" valor={resumen.expirados} />}
          {resumen.pendientesRevision > 0 && <Metrica etiqueta="Por revisar" valor={resumen.pendientesRevision} />}
          <Metrica etiqueta="Nota media" valor={resumen.notaPromedio ?? "—"} />
          <Metrica etiqueta="Mediana" valor={resumen.notaMediana ?? "—"} />
          <Metrica
            etiqueta="Aprobación"
            valor={resumen.tasaAprobacion === null ? "—" : resumen.tasaAprobacion}
            sufijo={resumen.tasaAprobacion === null ? "" : "%"}
          />
          {resumen.riesgoAlto > 0 && <Metrica etiqueta="Riesgo alto" valor={resumen.riesgoAlto} />}
          <Metrica etiqueta="Duración media" valor={formatearDuracion(resumen.duracionPromedioSegundos)} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <TextInput
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, documento o correo…"
            className="pl-9"
            aria-label="Buscar participante"
          />
        </div>
        <BotonSecundario activo={soloPendientes} onClick={() => setSoloPendientes((v) => !v)}>
          <AlertTriangle className="h-4 w-4" /> Solo por revisar
        </BotonSecundario>
        <BotonSecundario activo={soloRiesgo} onClick={() => setSoloRiesgo((v) => !v)}>
          <ShieldAlert className="h-4 w-4" /> Solo con señales
        </BotonSecundario>
      </div>

      {cargando && !cola ? (
        <LoadingState />
      ) : error ? (
        <GlassPanel className="border border-rose-400/40 bg-rose-500/5">
          <p className="text-sm text-rose-200">{error}</p>
        </GlassPanel>
      ) : intentos.length === 0 ? (
        <EmptyState
          message={
            (cola?.intentos.length ?? 0) === 0
              ? "Todavía nadie ha abierto esta evaluación. Comparte el enlace público para empezar a recibir intentos."
              : "Ningún intento coincide con los filtros."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl ring-1 ring-[color:var(--hairline)]">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-[color:var(--fill-1)] text-[0.66rem] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-bold">Participante</th>
                <th className="px-3 py-3 font-bold">Estado</th>
                <th className="px-3 py-3 text-right font-bold">Nota</th>
                <th className="px-3 py-3 text-right font-bold">Aciertos</th>
                <th className="px-3 py-3 font-bold">Calificación</th>
                <th className="px-3 py-3 font-bold">Integridad</th>
                <th className="px-3 py-3 text-right font-bold">Duración</th>
                <th className="px-3 py-3 font-bold">Enviado</th>
              </tr>
            </thead>
            <tbody>
              {intentos.map((intento) => (
                <tr
                  key={intento.id}
                  onClick={() => void abrirDetalle(intento.id)}
                  className="cursor-pointer border-t border-[color:var(--hairline)] transition-colors hover:fill-softer"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-ink">{intento.participante.nombre || "Sin nombre"}</p>
                    <p className="font-mono text-[0.68rem] text-ink-faint">
                      CI {intento.participante.documento || "—"}
                      {intento.participante.correo ? ` · ${intento.participante.correo}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <EstadoIntentoPill estado={intento.estado} />
                    {intento.estado === "en_curso" && intento.segundosRestantes != null && (
                      <p className="mt-1 text-[0.65rem] text-cyan-300">
                        {formatearDuracion(intento.segundosRestantes)} restantes
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {intento.nota === null ? (
                      <span className="text-xs text-ink-faint">pendiente</span>
                    ) : (
                      <span
                        className={`font-black tabular-nums ${
                          intento.aprobado === true
                            ? "text-emerald-300"
                            : intento.aprobado === false
                              ? "text-rose-300"
                              : "text-ink"
                        }`}
                      >
                        {intento.nota}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-ink-soft">
                    {intento.correctas}/{intento.correctas + intento.incorrectas + intento.sinResponder}
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill tono={intento.estadoCalificacion === "pendiente_revision" ? "aviso" : "exito"}>
                      {CALIFICACION_LABEL[intento.estadoCalificacion]}
                      {intento.pendientesRevision > 0 ? ` (${intento.pendientesRevision})` : ""}
                    </Pill>
                  </td>
                  <td className="px-3 py-2.5">
                    <RiesgoPill
                      nivel={(intento.resumenIntegridad as { nivel?: string }).nivel ?? "bajo"}
                      riesgo={intento.riesgoIntegridad}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-ink-soft">
                    {formatearDuracion(intento.segundosUsados)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-faint">{formatearFecha(intento.enviadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {(detalle || cargandoDetalle) && (
          <VisorIntento
            detalle={detalle}
            cargando={cargandoDetalle}
            actor={actor}
            onCerrar={() => setDetalle(null)}
            onRecargar={async () => {
              if (detalle) await abrirDetalle(detalle.intento.id);
              await recargar();
            }}
          />
        )}
      </AnimatePresence>
    </GlassOverlay>
  );
}

/* ------------------------------ Visor de intento -------------------------- */

function VisorIntento({
  detalle,
  cargando,
  actor,
  onCerrar,
  onRecargar,
}: {
  detalle: DetalleIntento | null;
  cargando: boolean;
  actor: string;
  onCerrar: () => void;
  onRecargar: () => Promise<void>;
}) {
  const [pestana, setPestana] = useState<"respuestas" | "integridad">("respuestas");
  const [exportando, setExportando] = useState(false);

  const exportar = async () => {
    if (!detalle) return;
    setExportando(true);
    const res = await exportarIntento(detalle.intento.id);
    setExportando(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    const paquete = res.value;
    const pdf = new ConstructorPdf();
    pdf.titulo(paquete.evaluacion?.titulo ?? "Evaluación");
    pdf.parrafo(`Informe individual · generado el ${formatearFecha(paquete.generadoEn)}`, { gris: 0.45 });
    pdf.regla();
    pdf.subtitulo("Participante");
    pdf.campo("Nombre", paquete.identidad.nombre || "—");
    pdf.campo("Documento de identidad (CI)", paquete.identidad.documento || "—");
    pdf.campo("Correo", paquete.identidad.correo || "—");
    pdf.campo("Número identificador del intento", paquete.identidad.identificador);
    pdf.regla();
    pdf.subtitulo("Resultado");
    pdf.campo("Nota", paquete.resultado.nota === null ? "Pendiente de revisión" : `${paquete.resultado.nota} / 100`);
    pdf.campo(
      "Puntos",
      `${paquete.resultado.puntosObtenidos ?? 0} de ${paquete.resultado.puntosPosibles ?? 0}`,
    );
    pdf.campo(
      "Veredicto",
      paquete.resultado.aprobado === null ? "Sin criterio de aprobación" : paquete.resultado.aprobado ? "APROBADO" : "NO APROBADO",
    );
    pdf.campo(
      "Aciertos",
      `${paquete.resultado.correctas} correctas · ${paquete.resultado.incorrectas} incorrectas · ${paquete.resultado.sinResponder} sin responder`,
    );
    pdf.campo("Estado de calificación", CALIFICACION_LABEL[paquete.resultado.estadoCalificacion]);
    pdf.campo("Duración", formatearDuracion(paquete.intento.segundosUsados));
    pdf.campo("Enviado", formatearFecha(paquete.intento.enviadoEn));
    pdf.campo("Versión aplicada", paquete.intento.versionEtiqueta || "—");
    pdf.regla();
    pdf.subtitulo("Integridad del intento");
    pdf.campo("Riesgo", `${paquete.integridad.riesgo} / 100`);
    pdf.campo("Eventos registrados", String(paquete.integridad.eventos));
    pdf.espacio();
    for (const hito of paquete.cronologia) {
      pdf.parrafo(`  ${formatearDuracion(hito.segundos)} — ${hito.texto}`, { tamano: 8.5, gris: 0.35 });
    }
    pdf.saltoDePagina();
    pdf.subtitulo("Respuestas");
    for (const [indice, respuesta] of paquete.respuestas.entries()) {
      pdf.parrafo(`${indice + 1}. ${respuesta.enunciadoTexto || "(sin enunciado)"}`, { fuente: "negrita", tamano: 10 });
      pdf.parrafo(`Respuesta: ${respuesta.valorTexto || "(sin responder)"}`, { tamano: 9 });
      if (respuesta.claveTexto) pdf.parrafo(`Esperado: ${respuesta.claveTexto}`, { tamano: 8.5, gris: 0.4 });
      pdf.parrafo(
        `Puntos: ${respuesta.puntosObtenidos ?? "pendiente"} de ${respuesta.puntosPosibles}` +
          (respuesta.correcta === true ? " · correcta" : respuesta.correcta === false ? " · incorrecta" : ""),
        { tamano: 8.5, gris: 0.4 },
      );
      if (respuesta.comentarioRevisor) {
        pdf.parrafo(`Comentario del revisor: ${respuesta.comentarioRevisor}`, { tamano: 8.5, gris: 0.4 });
      }
      pdf.espacio();
    }
    descargar(
      pdf.construir(),
      nombreArchivo([
        paquete.evaluacion?.codigo,
        paquete.identidad.nombre,
        paquete.identidad.documento,
        paquete.identidad.identificador.slice(-6),
      ]),
    );
    toast.success("Informe descargado.");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle del intento"
    >
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onCerrar} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="glass-heavy relative z-10 my-auto w-full max-w-5xl rounded-3xl p-4 sm:p-6"
      >
        {cargando || !detalle ? (
          <LoadingState />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={onCerrar}
                  className="mt-0.5 grid h-9 w-9 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft"
                  aria-label="Volver a la cola"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div>
                  <p className="flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.2em] text-cyan-400">
                    <UserRound className="h-3 w-3" /> Intento
                  </p>
                  <h3 className="text-lg font-black text-ink">{detalle.intento.participante.nombre || "Sin nombre"}</h3>
                  <p className="font-mono text-[0.7rem] text-ink-faint">
                    CI {detalle.intento.participante.documento || "—"} · {detalle.intento.id}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <EstadoIntentoPill estado={detalle.intento.estado} />
                <BotonSecundario onClick={() => void exportar()} disabled={exportando}>
                  {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Informe PDF
                </BotonSecundario>
                {detalle.intento.estado === "anulado" ? (
                  <BotonSecundario
                    onClick={async () => {
                      const res = await anularIntento(detalle.intento.id, actor, { restablecer: true });
                      if (!res.ok) return toast.error(res.error.message);
                      toast.success("Intento restablecido.");
                      await onRecargar();
                    }}
                  >
                    <Undo2 className="h-4 w-4" /> Restablecer
                  </BotonSecundario>
                ) : (
                  <BotonSecundario
                    onClick={async () => {
                      const motivo = window.prompt("Motivo de la anulación (queda en el registro)");
                      if (motivo === null) return;
                      const res = await anularIntento(detalle.intento.id, actor, { motivo });
                      if (!res.ok) return toast.error(res.error.message);
                      toast.success("Intento anulado: queda fuera de los agregados.");
                      await onRecargar();
                    }}
                  >
                    <Ban className="h-4 w-4" /> Anular
                  </BotonSecundario>
                )}
              </div>
            </div>

            {detalle.advertencias.length > 0 && (
              <div className="mb-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                {detalle.advertencias.includes("SNAPSHOT_ILEGIBLE") &&
                  "No se pudo leer la versión con la que se hizo esta prueba: las respuestas se muestran sin su enunciado original. Vuelve a publicar la evaluación para regenerarla."}
                {detalle.advertencias.includes("VERSION_INEXISTENTE") &&
                  "La versión con la que se hizo esta prueba ya no existe en el libro."}
              </div>
            )}

            {/* Cabecera de resultado */}
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-3xl fill-softer p-4 ring-1 ring-[color:var(--hairline)]">
              <Anillo
                valor={detalle.intento.nota ?? 0}
                etiqueta={detalle.intento.nota === null ? "pend." : "nota"}
                tono={
                  detalle.intento.aprobado === true ? "#10b981" : detalle.intento.aprobado === false ? "#f43f5e" : "#00b0d8"
                }
              />
              <div className="flex flex-1 flex-wrap gap-2">
                <Metrica
                  etiqueta="Puntos"
                  valor={`${detalle.intento.puntosObtenidos ?? 0}/${detalle.intento.puntosPosibles ?? 0}`}
                />
                <Metrica etiqueta="Correctas" valor={detalle.intento.correctas} />
                <Metrica etiqueta="Incorrectas" valor={detalle.intento.incorrectas} />
                <Metrica etiqueta="Sin responder" valor={detalle.intento.sinResponder} />
                <Metrica etiqueta="Duración" valor={formatearDuracion(detalle.intento.segundosUsados)} />
                {detalle.intento.envioAutomatico && <Metrica etiqueta="Envío" valor="Automático" />}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {detalle.intento.aprobado !== null && (
                  <Pill tono={detalle.intento.aprobado ? "exito" : "peligro"}>
                    {detalle.intento.aprobado ? (
                      <>
                        <BadgeCheck className="h-3 w-3" /> Aprobado
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" /> No aprobado
                      </>
                    )}
                  </Pill>
                )}
                <RiesgoPill
                  nivel={(detalle.intento.resumenIntegridad as { nivel?: string }).nivel ?? "bajo"}
                  riesgo={detalle.intento.riesgoIntegridad}
                />
              </div>
            </div>

            {/* Pestañas */}
            <div className="mb-3 flex gap-1.5">
              {(
                [
                  ["respuestas", `Respuestas (${detalle.respuestas.length})`],
                  ["integridad", `Integridad (${detalle.eventos.length})`],
                ] as const
              ).map(([id, etiqueta]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPestana(id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold ring-1 transition-all ${
                    pestana === id
                      ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white ring-white/25"
                      : "fill-softer text-ink-soft ring-[color:var(--hairline)] hover:text-ink"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {pestana === "respuestas" ? (
              <ol className="flex flex-col gap-2.5">
                {detalle.respuestas.map((respuesta, indice) => (
                  <FilaRespuesta
                    key={respuesta.preguntaId}
                    respuesta={respuesta}
                    indice={indice}
                    intentoId={detalle.intento.id}
                    actor={actor}
                    onCalificado={onRecargar}
                  />
                ))}
              </ol>
            ) : (
              <Cronologia detalle={detalle} />
            )}

            {detalle.intento.notasRevision && (
              <div className="mt-3 rounded-2xl fill-softer px-4 py-2.5 text-xs text-ink-soft ring-1 ring-[color:var(--hairline)]">
                <strong className="text-ink">Notas de revisión:</strong> {detalle.intento.notasRevision}
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function FilaRespuesta({
  respuesta,
  indice,
  intentoId,
  actor,
  onCalificado,
}: {
  respuesta: RespuestaDetalle;
  indice: number;
  intentoId: string;
  actor: string;
  onCalificado: () => Promise<void>;
}) {
  const [calificando, setCalificando] = useState(false);
  const [puntos, setPuntos] = useState<number | null>(respuesta.puntosObtenidos ?? 0);
  const [comentario, setComentario] = useState(respuesta.comentarioRevisor);
  const [guardando, setGuardando] = useState(false);
  const spec = tipoSpec(respuesta.tipo);

  const guardar = async () => {
    setGuardando(true);
    const res = await calificarRespuesta(intentoId, respuesta.preguntaId, puntos ?? 0, comentario, actor, {
      forzar: !respuesta.requiereRevision,
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    toast.success("Calificación guardada.");
    setCalificando(false);
    await onCalificado();
  };

  const tono = respuesta.requiereRevision
    ? "border-amber-400/40 bg-amber-500/5"
    : respuesta.correcta === true
      ? "border-emerald-400/30 bg-emerald-500/5"
      : respuesta.correcta === false
        ? "border-rose-400/30 bg-rose-500/5"
        : "border-[color:var(--hairline)]";

  return (
    <li className={`rounded-2xl border px-4 py-3 ${tono}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-wide text-ink-faint">
            {indice + 1}. {spec?.etiqueta ?? respuesta.tipo}
            {respuesta.obligatoria && <span className="text-rose-400">obligatoria</span>}
            {respuesta.competencia && <span className="text-ink-soft">· {respuesta.competencia}</span>}
          </p>
          <div className="mt-1">
            <RichText doc={respuesta.enunciado} compacto />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {respuesta.requiereRevision ? (
            <Pill tono="aviso">Por revisar</Pill>
          ) : respuesta.correcta === true ? (
            <Pill tono="exito">
              <CheckCircle2 className="h-3 w-3" /> Correcta
            </Pill>
          ) : respuesta.correcta === false ? (
            <Pill tono="peligro">
              <XCircle className="h-3 w-3" /> Incorrecta
            </Pill>
          ) : (
            <Pill tono="neutral">Sin puntaje</Pill>
          )}
          <span className="text-sm font-black tabular-nums text-ink">
            {respuesta.puntosObtenidos ?? "—"}
            <span className="text-xs font-bold text-ink-faint">/{respuesta.puntosPosibles}</span>
          </span>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl fill-softer px-3 py-2 ring-1 ring-[color:var(--hairline)]">
          <p className="text-[0.6rem] font-bold uppercase tracking-wide text-ink-faint">Respondió</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
            {respuesta.valorTexto || <em className="text-ink-faint">sin responder</em>}
          </p>
        </div>
        {respuesta.claveTexto && (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-3 py-2">
            <p className="text-[0.6rem] font-bold uppercase tracking-wide text-emerald-300">Esperado</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{respuesta.claveTexto}</p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.65rem] text-ink-faint">
        {respuesta.segundosEnPregunta > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formatearDuracion(respuesta.segundosEnPregunta)}
          </span>
        )}
        {respuesta.visitas > 0 && <span>{respuesta.visitas} visita(s)</span>}
        {respuesta.cambios > 0 && <span>{respuesta.cambios} cambio(s) de respuesta</span>}
        {!calificando && (
          <button
            type="button"
            onClick={() => setCalificando(true)}
            className="ml-auto font-bold text-cyan-300 underline decoration-dotted"
          >
            {respuesta.requiereRevision ? "Calificar" : "Ajustar puntaje"}
          </button>
        )}
      </div>

      {respuesta.comentarioRevisor && !calificando && (
        <p className="mt-2 rounded-xl fill-softer px-3 py-1.5 text-xs italic text-ink-soft">
          «{respuesta.comentarioRevisor}»
        </p>
      )}

      <AnimatePresence>
        {calificando && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink">Puntos (0 – {respuesta.puntosPosibles})</span>
                <NumberField
                  min={0}
                  max={respuesta.puntosPosibles}
                  step={0.5}
                  value={puntos}
                  onChange={setPuntos}
                  className="!w-24 !py-1.5 !text-sm"
                />
                <Barra proporcion={respuesta.puntosPosibles > 0 ? (puntos ?? 0) / respuesta.puntosPosibles : 0} />
              </div>
              <TextArea
                rows={2}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario para el expediente (opcional)"
              />
              <div className="flex justify-end gap-2">
                <BotonSecundario onClick={() => setCalificando(false)}>Cancelar</BotonSecundario>
                <BotonPrimario onClick={() => void guardar()} disabled={guardando}>
                  {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Guardar calificación
                </BotonPrimario>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Cronología del intento: lo que hizo el candidato, en orden. */
function Cronologia({ detalle }: { detalle: DetalleIntento }) {
  const resumen = detalle.intento.resumenIntegridad as {
    porTipo?: Record<string, number>;
    caracteresPegados?: number;
    segundosFueraDeFoco?: number;
    vecesFueraDeFoco?: number;
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Metrica etiqueta="Riesgo" valor={detalle.intento.riesgoIntegridad} sufijo="/100" />
        <Metrica etiqueta="Eventos" valor={detalle.eventos.length} />
        <Metrica etiqueta="Fuera de foco" valor={resumen.vecesFueraDeFoco ?? 0} />
        <Metrica etiqueta="Segundos fuera" valor={resumen.segundosFueraDeFoco ?? 0} />
        <Metrica etiqueta="Caracteres pegados" valor={resumen.caracteresPegados ?? 0} />
      </div>

      {detalle.eventos.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No se registró ningún evento. Puede ser un intento limpio o que el registro estuviera desactivado.
        </p>
      ) : (
        <ol className="relative flex flex-col gap-1.5 border-l border-[color:var(--hairline)] pl-4">
          {detalle.cronologia.map((hito, i) => (
            <li key={i} className="relative">
              <span
                className={`absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full ring-2 ring-[color:var(--glass-bg)] ${
                  hito.severidad === "alerta"
                    ? "bg-rose-400"
                    : hito.severidad === "aviso"
                      ? "bg-amber-400"
                      : "bg-cyan-400"
                }`}
              />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[0.68rem] tabular-nums text-ink-faint">
                  {formatearDuracion(hito.segundos)}
                </span>
                <span
                  className={`text-sm ${
                    hito.severidad === "alerta"
                      ? "font-semibold text-rose-200"
                      : hito.severidad === "aviso"
                        ? "text-amber-200"
                        : "text-ink-soft"
                  }`}
                >
                  {hito.texto}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="flex items-start gap-2 rounded-2xl fill-softer px-3 py-2 text-[0.7rem] text-ink-faint ring-1 ring-[color:var(--hairline)]">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        El riesgo ordena la cola de revisión; no es un veredicto. De un pegado se guarda la longitud, nunca el
        contenido, y no se registra ninguna captura de pantalla.
      </p>
    </div>
  );
}

/** Exportación de la cola a CSV, para análisis externo. */
function descargarCsv(cola: ColaIntentos): void {
  const cabeceras = [
    "nombre", "documento", "correo", "estado", "nota", "puntos_obtenidos", "puntos_posibles",
    "correctas", "incorrectas", "sin_responder", "aprobado", "calificacion",
    "riesgo_integridad", "segundos_usados", "iniciado_en", "enviado_en", "version",
  ];
  const filas = cola.intentos.map((intento: Intento) => [
    intento.participante.nombre,
    intento.participante.documento,
    intento.participante.correo,
    intento.estado,
    intento.nota ?? "",
    intento.puntosObtenidos ?? "",
    intento.puntosPosibles ?? "",
    intento.correctas,
    intento.incorrectas,
    intento.sinResponder,
    intento.aprobado === null ? "" : intento.aprobado ? "sí" : "no",
    intento.estadoCalificacion,
    intento.riesgoIntegridad,
    intento.segundosUsados,
    intento.iniciadoEn,
    intento.enviadoEn,
    intento.versionEtiqueta,
  ]);
  const csv = [cabeceras, ...filas]
    .map((fila) => fila.map((celda) => `"${String(celda ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  // El BOM hace que Excel abra el archivo en UTF-8 y no destroce los acentos.
  descargar(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), nombreArchivo([cola.evaluacion.codigo, "resultados"], "csv"));
}
