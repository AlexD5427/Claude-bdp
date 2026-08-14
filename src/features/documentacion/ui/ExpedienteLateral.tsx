/**
 * Expediente operativo.
 *
 * ── Qué es esta pantalla ────────────────────────────────────────────────────
 * El centro de operación del módulo. Todo lo que se puede hacer con un expediente
 * se hace aquí: marcar requisitos, revisar, aprobar, conceder prórrogas, pedir
 * documentación, abrir tareas, comentar, consultar el historial y exportar.
 *
 * ── Tres decisiones que se notan al usarla ──────────────────────────────────
 * 1. **Edición rápida con guardado por bloque.** Marcar seis requisitos son seis
 *    cambios en la pantalla y UNA escritura. Mientras hay cambios sin guardar, la
 *    barra inferior lo dice y ofrece descartarlos.
 * 2. **Control de versión.** Cada requisito viaja con su versión. Si otra persona
 *    lo cambió mientras esta pantalla estaba abierta, el backend rechaza el
 *    guardado con `CONFLICTO_VERSION` y aquí se recarga el expediente en lugar de
 *    pisar su trabajo.
 * 3. **«Siguiente pendiente».** Lo calcula el backend priorizando lo observado.
 *    Es lo que convierte revisar veinte requisitos en pulsar veinte veces el mismo
 *    botón en lugar de buscar en la lista.
 */

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { docApi, type ExpedienteOperativo } from "../api/acciones";
import {
  ETIQUETA_APROBACION,
  ETIQUETA_DOCUMENTO,
  ETIQUETA_EXPEDIENTE,
  ETIQUETA_PRORROGA,
  ETIQUETA_REVISION,
  ETIQUETA_SITUACION,
  ETIQUETA_SOLICITUD,
  ETIQUETA_TAREA,
  ESTADOS_DOCUMENTO,
  INTENCION_APROBACION,
  INTENCION_DOCUMENTO,
  INTENCION_EXPEDIENTE,
  INTENCION_PRORROGA,
  INTENCION_REVISION,
  INTENCION_SITUACION,
  INTENCION_SOLICITUD,
  INTENCION_TAREA,
  MOTIVOS_REVISION,
  VISIBILIDADES_COMENTARIO,
  puedeTransitar,
  TRANSICIONES_DOCUMENTO,
  type EstadoDocumento,
  type EstadoExpediente,
} from "../domain/vocabulario";
import {
  agruparRequisitos,
  fechaCorta,
  fechaEnDias,
  fechaHora,
  textoAntiguedad,
  textoPlazo,
  type RequisitoVista,
} from "../domain/progreso";
import { useConsola } from "../state/consola";
import { descargarXlsx, nombreConFecha, unirLotes } from "../export/xlsx";
import {
  Aviso,
  BarraAvance,
  Boton,
  Campo,
  ChipEstado,
  Confirmacion,
  Entrada,
  AreaTexto,
  Lateral,
  Panel,
  Selector,
  Cargando,
  Vacio,
  type Notita,
} from "./piezas";
import { useDatos } from "./useDatos";

type Pestana =
  | "requisitos"
  | "solicitudes"
  | "revisiones"
  | "aprobaciones"
  | "prorrogas"
  | "tareas"
  | "comentarios"
  | "historial"
  | "auditoria";

interface Props {
  expedienteId: string | null;
  onCerrar: () => void;
  onCambio: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}

export function ExpedienteLateral({ expedienteId, onCerrar, onCambio, avisar }: Props) {
  const { capacidades } = useConsola();
  const [pestana, setPestana] = useState<Pestana>("requisitos");
  /** Cambios de requisito aún sin enviar: `id -> {estado?, observaciones?}`. */
  const [borrador, setBorrador] = useState<Record<string, { estado?: EstadoDocumento; observaciones?: string }>>({});
  const [guardando, setGuardando] = useState(false);
  const [dialogo, setDialogo] = useState<null | { tipo: "archivar" | "restaurar" | "aprobar" }>(null);
  const [exportando, setExportando] = useState(false);

  const expediente = useDatos<ExpedienteOperativo>(
    () => docApi.obtenerExpediente(expedienteId as string, { historial: 80 }),
    [expedienteId],
    { activo: !!expedienteId },
  );

  const datos = expediente.datos;
  const cabecera = datos?.expediente;
  const cambiosPendientes = Object.keys(borrador).length;

  function ponerBorrador(id: string, patch: { estado?: EstadoDocumento; observaciones?: string }) {
    setBorrador((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function descartar() {
    setBorrador({});
  }

  /** Guarda el bloque de cambios en una sola escritura. */
  async function guardarBloque() {
    if (!datos || !cambiosPendientes) return;
    setGuardando(true);
    try {
      const cambios = Object.entries(borrador).map(([id, patch]) => {
        const requisito = datos.requisitos.find((r) => r.expedienteDocumentoId === id);
        return { expedienteDocumentoId: id, version: requisito?.version, ...patch };
      });
      const res = await docApi.guardarRequisitos(datos.expediente.expedienteId, cambios);
      setBorrador({});
      expediente.recargar();
      onCambio();
      if (res.fallidos.length) {
        avisar("aviso", `${res.aplicados} cambio(s) guardado(s), ${res.fallidos.length} rechazado(s).`, res.fallidos[0]?.motivo);
      } else {
        avisar("exito", `${res.aplicados} cambio(s) guardado(s).`);
      }
    } catch (error) {
      const fallo = error as { message?: string; pista?: string; codigo?: string };
      if (fallo.codigo === "CONFLICTO_VERSION") {
        // Alguien más tocó el expediente: se recarga en lugar de pisar su trabajo.
        expediente.recargar();
        setBorrador({});
      }
      avisar("peligro", fallo.message ?? "No se pudo guardar.", fallo.pista);
    } finally {
      setGuardando(false);
    }
  }

  /** Descarga el expediente completo en un libro de Excel. */
  async function exportar() {
    if (!datos) return;
    setExportando(true);
    try {
      const trabajo = await docApi.iniciarExportacion({ tipo: "expediente", expedienteId: datos.expediente.expedienteId });
      const lotes = [];
      let quedan = true;
      let vueltas = 0;
      while (quedan && vueltas < 20) {
        const lote = await docApi.loteExportacion(trabajo.exportacionId);
        lotes.push(lote.datos);
        quedan = lote.quedan;
        vueltas += 1;
      }
      const libro = unirLotes(lotes);
      const { nombre } = descargarXlsx(libro, nombreConFecha(`expediente-${datos.expediente.identificador}`));
      avisar("exito", `Archivo ${nombre} descargado.`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      avisar("peligro", fallo.message ?? "No se pudo exportar.", fallo.pista);
    } finally {
      setExportando(false);
    }
  }

  async function cambiarEstado(estado: string) {
    if (!datos) return;
    try {
      await docApi.cambiarEstadoExpediente(datos.expediente.expedienteId, estado, { version: datos.expediente.version });
      expediente.recargar();
      onCambio();
      avisar("exito", `Expediente ${ETIQUETA_EXPEDIENTE[estado as EstadoExpediente] ?? estado}.`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      avisar("peligro", fallo.message ?? "No se pudo cambiar el estado.", fallo.pista);
    } finally {
      setDialogo(null);
    }
  }

  const pestanas: { id: Pestana; etiqueta: string; contador?: number; visible: boolean }[] = [
    { id: "requisitos", etiqueta: "Requisitos", contador: datos?.requisitos.length, visible: true },
    { id: "solicitudes", etiqueta: "Solicitudes", contador: datos?.solicitudes.length, visible: true },
    { id: "revisiones", etiqueta: "Revisiones", contador: datos?.revisiones.length, visible: true },
    { id: "aprobaciones", etiqueta: "Aprobaciones", contador: datos?.aprobaciones.length, visible: true },
    { id: "prorrogas", etiqueta: "Prórrogas", contador: datos?.prorrogas.length, visible: true },
    { id: "tareas", etiqueta: "Tareas", contador: datos?.tareas.length, visible: true },
    { id: "comentarios", etiqueta: "Comentarios", contador: datos?.comentarios.length, visible: true },
    { id: "historial", etiqueta: "Historial", contador: datos?.historial.length, visible: true },
    { id: "auditoria", etiqueta: "Auditoría", contador: datos?.auditoria.length, visible: capacidades.auditoria === true },
  ];

  return (
    <Lateral
      abierto={!!expedienteId}
      onCerrar={onCerrar}
      titulo={cabecera ? `${cabecera.nombre}` : "Expediente"}
      subtitulo={cabecera ? `${cabecera.identificador} · ${cabecera.cargo || "Sin cargo"}` : undefined}
      ancho="max-w-5xl"
      pie={
        cambiosPendientes ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-200">
              {cambiosPendientes} cambio(s) sin guardar. Nada se ha escrito todavía en el libro.
            </p>
            <div className="flex gap-2">
              <Boton variante="suave" onClick={descartar}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Descartar
              </Boton>
              <Boton variante="primario" onClick={guardarBloque} cargando={guardando}>
                Guardar {cambiosPendientes} cambio(s)
              </Boton>
            </div>
          </div>
        ) : undefined
      }
    >
      {expediente.error && (
        <Aviso intencion="peligro" titulo="No se pudo abrir el expediente" accion={<Boton onClick={expediente.recargar}>Reintentar</Boton>}>
          {expediente.error.mensaje} {expediente.error.pista}
        </Aviso>
      )}
      {expediente.cargando && !datos && <Cargando texto="Abriendo expediente…" />}

      {datos && cabecera && (
        <div className="space-y-4">
          {/* Cabecera */}
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ChipEstado
                    estado={cabecera.estado}
                    etiqueta={ETIQUETA_EXPEDIENTE[cabecera.estado] ?? cabecera.estado}
                    intencion={INTENCION_EXPEDIENTE[cabecera.estado] ?? "neutral"}
                  />
                  <span className="text-xs text-ink-soft">{cabecera.tipoFuncionarioEtiqueta}</span>
                  {cabecera.tipoGarantia !== "NINGUNA" && <span className="text-xs text-ink-soft">· {cabecera.tipoGarantiaEtiqueta}</span>}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                  <Dato etiqueta="Agencia" valor={cabecera.agencia || "—"} />
                  <Dato etiqueta="Gerencia" valor={cabecera.gerencia || "—"} />
                  <Dato etiqueta="Ingreso" valor={fechaCorta(cabecera.fechaIngreso)} />
                  <Dato etiqueta="Antigüedad" valor={textoAntiguedad(cabecera.diasDesdeIngreso)} />
                  <Dato etiqueta="Responsable" valor={cabecera.responsableId || "Sin asignar"} />
                  <Dato
                    etiqueta="Próxima fecha crítica"
                    valor={cabecera.proximaFechaCritica ? `${fechaCorta(cabecera.proximaFechaCritica)} · ${textoPlazo(cabecera.proximaFechaCritica)}` : "—"}
                  />
                  <Dato etiqueta="Última actualización" valor={`${fechaHora(cabecera.actualizadoEn)} · ${cabecera.actualizadoPor}`} />
                </dl>
              </div>
              <div className="w-full max-w-[220px] space-y-2">
                <BarraAvance valor={cabecera.porcentaje} etiqueta="Avance del expediente" />
                <ul className="grid grid-cols-2 gap-1 text-[11px] text-ink-soft">
                  <li>{cabecera.totales.entregados} entregados</li>
                  <li>{cabecera.totales.pendientes} pendientes</li>
                  <li>{cabecera.totales.noEntregados} no entregados</li>
                  <li>{cabecera.totales.noAplica} no aplica</li>
                  <li>{cabecera.totales.observados} observados</li>
                  <li>{cabecera.totales.prorrogas} prórrogas</li>
                </ul>
              </div>
            </div>

            <p className="mt-3 rounded-2xl bg-[color:var(--fill-1)] p-3 text-xs leading-relaxed text-ink-soft">{datos.resumenTextual}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Boton variante="suave" onClick={expediente.recargar} cargando={expediente.cargando}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
              </Boton>
              {capacidades.exportar && (
                <Boton variante="suave" onClick={exportar} cargando={exportando}>
                  <Download className="h-3.5 w-3.5" aria-hidden /> Exportar a Excel
                </Boton>
              )}
              {capacidades.aprobar && cabecera.estado === "COMPLETO" && (
                <Boton variante="primario" onClick={() => setDialogo({ tipo: "aprobar" })}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Aprobar expediente
                </Boton>
              )}
              {capacidades.archivar && cabecera.estado !== "ARCHIVADO" && (
                <Boton variante="suave" onClick={() => setDialogo({ tipo: "archivar" })}>
                  Archivar
                </Boton>
              )}
              {capacidades.restaurar && cabecera.estado === "ARCHIVADO" && (
                <Boton variante="suave" onClick={() => setDialogo({ tipo: "restaurar" })}>
                  Restaurar
                </Boton>
              )}
              {capacidades.editar && (
                <Boton
                  variante="suave"
                  onClick={async () => {
                    try {
                      const res = await docApi.sincronizarRequisitos(cabecera.expedienteId);
                      expediente.recargar();
                      avisar(
                        "exito",
                        `Requisitos al día: ${res.creados} añadido(s), ${res.archivados} archivado(s).`,
                        res.conservados.length ? `${res.conservados.length} se conservaron por tener datos.` : undefined,
                      );
                    } catch (error) {
                      const fallo = error as { message?: string; pista?: string };
                      avisar("peligro", fallo.message ?? "No se pudo sincronizar.", fallo.pista);
                    }
                  }}
                  titulo="Vuelve a calcular qué requisitos aplican según la rama"
                >
                  Recalcular requisitos
                </Boton>
              )}
            </div>
          </Panel>

          {/* Pestañas */}
          <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--hairline)] pb-1" role="tablist" aria-label="Secciones del expediente">
            {pestanas
              .filter((p) => p.visible)
              .map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={pestana === p.id}
                  onClick={() => setPestana(p.id)}
                  className={`shrink-0 rounded-t-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    pestana === p.id ? "bg-[color:var(--fill-2)] text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {p.etiqueta}
                  {p.contador !== undefined && <span className="ml-1 text-[10px] text-ink-faint">{p.contador}</span>}
                </button>
              ))}
          </div>

          <div role="tabpanel">
            {pestana === "requisitos" && (
              <Requisitos
                datos={datos}
                borrador={borrador}
                onBorrador={ponerBorrador}
                onRecargar={() => {
                  expediente.recargar();
                  onCambio();
                }}
                avisar={avisar}
              />
            )}
            {pestana === "solicitudes" && <Solicitudes datos={datos} onRecargar={expediente.recargar} avisar={avisar} />}
            {pestana === "revisiones" && <Revisiones datos={datos} />}
            {pestana === "aprobaciones" && <Aprobaciones datos={datos} onRecargar={expediente.recargar} avisar={avisar} />}
            {pestana === "prorrogas" && <Prorrogas datos={datos} onRecargar={expediente.recargar} avisar={avisar} />}
            {pestana === "tareas" && <Tareas datos={datos} onRecargar={expediente.recargar} avisar={avisar} />}
            {pestana === "comentarios" && <Comentarios datos={datos} onRecargar={expediente.recargar} avisar={avisar} />}
            {pestana === "historial" && <Historial datos={datos} />}
            {pestana === "auditoria" && <Auditoria datos={datos} />}
          </div>
        </div>
      )}

      <Confirmacion
        abierta={!!dialogo}
        titulo={
          dialogo?.tipo === "archivar"
            ? "Archivar expediente"
            : dialogo?.tipo === "restaurar"
              ? "Restaurar expediente"
              : "Aprobar expediente"
        }
        detalle={
          dialogo?.tipo === "archivar"
            ? "El expediente deja de aparecer en las listas y sus tareas abiertas se cancelan. Nada se borra: se puede restaurar."
            : dialogo?.tipo === "restaurar"
              ? "Vuelve a la operación con el estado que le corresponda por su contenido actual."
              : "Solo se puede aprobar si no queda nada pendiente ni observado. Queda registrado quién aprueba y cuándo."
        }
        peligrosa={dialogo?.tipo === "archivar"}
        textoConfirmar={dialogo?.tipo === "archivar" ? "Archivar" : dialogo?.tipo === "restaurar" ? "Restaurar" : "Aprobar"}
        onConfirmar={() => {
          if (!dialogo) return;
          if (dialogo.tipo === "archivar") void cambiarEstado("ARCHIVADO");
          else if (dialogo.tipo === "restaurar") {
            void docApi
              .restaurarExpediente(datos!.expediente.expedienteId)
              .then(() => {
                expediente.recargar();
                onCambio();
                avisar("exito", "Expediente restaurado.");
              })
              .catch((error) => {
                const fallo = error as { message?: string; pista?: string };
                avisar("peligro", fallo.message ?? "No se pudo restaurar.", fallo.pista);
              })
              .finally(() => setDialogo(null));
          } else void cambiarEstado("APROBADO");
        }}
        onCancelar={() => setDialogo(null)}
      />
    </Lateral>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{etiqueta}</dt>
      <dd className="truncate text-ink" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Requisitos                                                          */
/* ------------------------------------------------------------------ */

function Requisitos({
  datos,
  borrador,
  onBorrador,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  borrador: Record<string, { estado?: EstadoDocumento; observaciones?: string }>;
  onBorrador: (id: string, patch: { estado?: EstadoDocumento; observaciones?: string }) => void;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  const [foco, setFoco] = useState<string | null>(datos.siguientePendiente?.expedienteDocumentoId ?? null);
  const [revisando, setRevisando] = useState<RequisitoVista | null>(null);
  const [prorrogando, setProrrogando] = useState<RequisitoVista | null>(null);
  const grupos = useMemo(() => agruparRequisitos(datos.requisitos), [datos.requisitos]);

  function estadoDe(requisito: RequisitoVista): EstadoDocumento {
    return borrador[requisito.expedienteDocumentoId]?.estado ?? requisito.estado;
  }

  return (
    <div className="space-y-3">
      {datos.siguientePendiente && (
        <Aviso intencion="info" titulo="Siguiente por atender">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {datos.requisitos.find((r) => r.expedienteDocumentoId === datos.siguientePendiente?.expedienteDocumentoId)?.nombre}
              {datos.siguientePendiente.motivo === "observado" ? " · tiene una observación abierta" : " · pendiente de entrega"}
            </span>
            <Boton variante="suave" onClick={() => setFoco(datos.siguientePendiente!.expedienteDocumentoId)}>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Ir al requisito
            </Boton>
          </div>
        </Aviso>
      )}

      {grupos.map((grupo) => (
        <Panel
          key={grupo.seccion}
          titulo={grupo.etiqueta}
          descripcion={`${grupo.resueltos} de ${grupo.total} resueltos`}
          acciones={<div className="w-32"><BarraAvance valor={grupo.porcentaje} etiqueta={`Avance de ${grupo.etiqueta}`} /></div>}
        >
          <ul className="divide-y divide-[color:var(--hairline)]/60">
            {grupo.requisitos.map((requisito) => {
              const estado = estadoDe(requisito);
              const sucio = !!borrador[requisito.expedienteDocumentoId];
              const enFoco = foco === requisito.expedienteDocumentoId;
              return (
                <li
                  key={requisito.expedienteDocumentoId}
                  className={`py-2.5 ${enFoco ? "-mx-2 rounded-xl bg-cyan-500/5 px-2 ring-1 ring-cyan-400/30" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">
                        {requisito.nombre}
                        {requisito.obligatorio && <span className="ml-1 text-[10px] uppercase text-ink-faint">obligatorio</span>}
                        {sucio && <span className="ml-2 text-[10px] font-semibold uppercase text-amber-300">sin guardar</span>}
                      </p>
                      {requisito.descripcion && <p className="mt-0.5 text-[11px] text-ink-faint">{requisito.descripcion}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <ChipEstado estado={estado} etiqueta={ETIQUETA_DOCUMENTO[estado]} intencion={INTENCION_DOCUMENTO[estado]} />
                        {requisito.estadoRevision !== "SIN_REVISION" && (
                          <ChipEstado
                            estado={requisito.estadoRevision}
                            etiqueta={ETIQUETA_REVISION[requisito.estadoRevision as keyof typeof ETIQUETA_REVISION] ?? requisito.estadoRevision}
                            intencion={INTENCION_REVISION[requisito.estadoRevision as keyof typeof INTENCION_REVISION] ?? "neutral"}
                          />
                        )}
                        {requisito.prorrogas
                          .filter((p) => p.situacion !== "cerrada")
                          .map((prorroga) => (
                            <ChipEstado
                              key={prorroga.prorrogaId}
                              estado={prorroga.situacion}
                              etiqueta={`${ETIQUETA_SITUACION[prorroga.situacion] ?? prorroga.situacion} · ${fechaCorta(prorroga.fechaProrroga)}`}
                              intencion={INTENCION_SITUACION[prorroga.situacion] ?? "neutral"}
                              titulo={prorroga.motivo}
                            />
                          ))}
                      </div>
                    </div>

                    {/* Cambio de estado: solo los destinos que la máquina permite. */}
                    {capacidades.editar && (
                      <div className="flex flex-wrap gap-1">
                        {ESTADOS_DOCUMENTO.filter(
                          (destino) =>
                            puedeTransitar(TRANSICIONES_DOCUMENTO, requisito.estado, destino) &&
                            (destino !== "NO_APLICA" || requisito.permiteNoAplica),
                        ).map((destino) => (
                          <button
                            key={destino}
                            type="button"
                            onClick={() => {
                              onBorrador(requisito.expedienteDocumentoId, { estado: destino });
                              setFoco(requisito.expedienteDocumentoId);
                            }}
                            aria-pressed={estado === destino}
                            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                              estado === destino
                                ? "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/50"
                                : "fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:text-ink"
                            }`}
                          >
                            {ETIQUETA_DOCUMENTO[destino]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {(enFoco || requisito.observaciones || borrador[requisito.expedienteDocumentoId]?.observaciones !== undefined) && (
                    <div className="mt-2">
                      <Campo etiqueta="Observaciones" ayuda="Queda en el expediente y viaja a los reportes.">
                        <AreaTexto
                          value={borrador[requisito.expedienteDocumentoId]?.observaciones ?? requisito.observaciones}
                          onChange={(e) => onBorrador(requisito.expedienteDocumentoId, { observaciones: e.target.value })}
                          disabled={!capacidades.editar}
                          rows={2}
                        />
                      </Campo>
                    </div>
                  )}

                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {capacidades.revisar && (
                      <Boton variante="fantasma" onClick={() => setRevisando(requisito)}>
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Revisar
                      </Boton>
                    )}
                    {capacidades.editar && requisito.permiteProrroga && (
                      <Boton variante="fantasma" onClick={() => setProrrogando(requisito)}>
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Prórroga
                      </Boton>
                    )}
                    <Boton variante="fantasma" onClick={() => setFoco(enFoco ? null : requisito.expedienteDocumentoId)}>
                      <FileText className="h-3.5 w-3.5" aria-hidden /> {enFoco ? "Cerrar" : "Detalle"}
                    </Boton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}

      <DecisionRevision
        requisito={revisando}
        onCerrar={() => setRevisando(null)}
        onHecho={() => {
          setRevisando(null);
          onRecargar();
        }}
        avisar={avisar}
      />
      <NuevaProrroga
        requisito={prorrogando}
        onCerrar={() => setProrrogando(null)}
        onHecho={() => {
          setProrrogando(null);
          onRecargar();
        }}
        avisar={avisar}
      />
    </div>
  );
}

/** Formulario de decisión de revisión, con los motivos del catálogo. */
function DecisionRevision({
  requisito,
  onCerrar,
  onHecho,
  avisar,
}: {
  requisito: RequisitoVista | null;
  onCerrar: () => void;
  onHecho: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const [estado, setEstado] = useState("APROBADO");
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const exigeMotivo = ["OBSERVADO", "RECHAZADO", "REQUIERE_CORRECCION", "APROBADO_CON_OBSERVACION"].includes(estado);

  return (
    <Confirmacion
      abierta={!!requisito}
      titulo={`Revisar «${requisito?.nombre ?? ""}»`}
      detalle={
        <div className="space-y-3 text-left">
          <Campo etiqueta="Decisión">
            <Selector
              valor={estado}
              onChange={setEstado}
              opciones={[
                { valor: "EN_REVISION", etiqueta: "Marcar en revisión" },
                { valor: "APROBADO", etiqueta: "Aprobar" },
                { valor: "APROBADO_CON_OBSERVACION", etiqueta: "Aprobar con observación" },
                { valor: "OBSERVADO", etiqueta: "Observar" },
                { valor: "REQUIERE_CORRECCION", etiqueta: "Requiere corrección" },
                { valor: "RECHAZADO", etiqueta: "Rechazar" },
              ]}
            />
          </Campo>
          {exigeMotivo && (
            <Campo etiqueta="Motivo" requerido>
              <Selector
                valor={motivo}
                onChange={setMotivo}
                placeholder="Elige el motivo"
                opciones={MOTIVOS_REVISION.map((m) => ({ valor: m.codigo, etiqueta: m.etiqueta }))}
              />
            </Campo>
          )}
          <Campo
            etiqueta="Comentario"
            requerido={estado === "OBSERVADO"}
            ayuda="Describe qué hay que corregir. Es lo que va a leer quien tenga que arreglarlo."
          >
            <AreaTexto value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} />
          </Campo>
        </div>
      }
      textoConfirmar="Registrar decisión"
      trabajando={enviando}
      onCancelar={onCerrar}
      onConfirmar={async () => {
        if (!requisito) return;
        setEnviando(true);
        try {
          await docApi.decidirRevision({
            expedienteDocumentoId: requisito.expedienteDocumentoId,
            estado,
            motivo,
            comentario,
          });
          avisar("exito", "Decisión registrada.");
          onHecho();
        } catch (error) {
          const fallo = error as { message?: string; pista?: string };
          avisar("peligro", fallo.message ?? "No se pudo registrar la decisión.", fallo.pista);
        } finally {
          setEnviando(false);
        }
      }}
    />
  );
}

/** Formulario de prórroga: fecha, motivo y el aviso del máximo configurado. */
function NuevaProrroga({
  requisito,
  onCerrar,
  onHecho,
  avisar,
}: {
  requisito: RequisitoVista | null;
  onCerrar: () => void;
  onHecho: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const [fecha, setFecha] = useState(fechaEnDias(15));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  return (
    <Confirmacion
      abierta={!!requisito}
      titulo={`Prórroga de «${requisito?.nombre ?? ""}»`}
      detalle={
        <div className="space-y-3 text-left">
          <Campo etiqueta="Nueva fecha límite" requerido>
            <Entrada type="date" value={fecha} min={fechaEnDias(1)} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Motivo" requerido ayuda="Es lo que justifica el plazo si alguien lo audita.">
            <AreaTexto value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} />
          </Campo>
          <p className="text-[11px] text-ink-faint">
            Una prórroga nueva sustituye a la vigente. Los días restantes se calculan solos: no se guarda ningún contador.
          </p>
        </div>
      }
      textoConfirmar="Conceder prórroga"
      trabajando={enviando}
      onCancelar={onCerrar}
      onConfirmar={async () => {
        if (!requisito) return;
        setEnviando(true);
        try {
          await docApi.crearProrroga({
            expedienteDocumentoId: requisito.expedienteDocumentoId,
            fechaProrroga: fecha,
            motivo,
          });
          avisar("exito", `Prórroga concedida hasta ${fechaCorta(fecha)}.`);
          onHecho();
        } catch (error) {
          const fallo = error as { message?: string; pista?: string };
          avisar("peligro", fallo.message ?? "No se pudo conceder la prórroga.", fallo.pista);
        } finally {
          setEnviando(false);
        }
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Pestañas de trabajo                                                 */
/* ------------------------------------------------------------------ */

function Solicitudes({
  datos,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  const [creando, setCreando] = useState(false);
  const [nota, setNota] = useState<Record<string, string>>({});

  return (
    <div className="space-y-3">
      {capacidades.solicitar && (
        <Boton
          variante="primario"
          cargando={creando}
          onClick={async () => {
            setCreando(true);
            try {
              const res = await docApi.crearSolicitud({ expedienteId: datos.expediente.expedienteId });
              avisar("exito", `Solicitud creada con ${res.requisitos} requisito(s), límite ${fechaCorta(res.fechaLimite)}.`);
              onRecargar();
            } catch (error) {
              const fallo = error as { message?: string; pista?: string };
              avisar("peligro", fallo.message ?? "No se pudo crear la solicitud.", fallo.pista);
            } finally {
              setCreando(false);
            }
          }}
        >
          <Send className="h-3.5 w-3.5" aria-hidden /> Solicitar todo lo pendiente
        </Boton>
      )}

      {!datos.solicitudes.length && <Vacio titulo="Sin solicitudes" detalle="Cuando se pida documentación, aparecerá aquí con su seguimiento." />}

      {datos.solicitudes.map((solicitud) => (
        <Panel
          key={solicitud.solicitudId}
          titulo={solicitud.titulo}
          descripcion={`${solicitud.cumplidos} de ${solicitud.total} cumplidos · ${textoPlazo(solicitud.fechaLimite)}`}
          acciones={
            <ChipEstado
              estado={solicitud.estado}
              etiqueta={ETIQUETA_SOLICITUD[solicitud.estado as keyof typeof ETIQUETA_SOLICITUD] ?? solicitud.estado}
              intencion={INTENCION_SOLICITUD[solicitud.estado as keyof typeof INTENCION_SOLICITUD] ?? "neutral"}
            />
          }
        >
          {solicitud.descripcion && <p className="mb-2 text-xs text-ink-soft">{solicitud.descripcion}</p>}
          <ul className="mb-3 space-y-1 text-xs">
            {solicitud.items.map((item) => (
              <li key={item.solicitudDocumentoId} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink">{item.nombre}</span>
                <span className={item.estado === "CUMPLIDO" ? "text-emerald-300" : "text-ink-faint"}>
                  {item.estado === "CUMPLIDO" ? `Cumplido ${fechaCorta(item.fechaCumplimiento)}` : "Pendiente"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-faint">
            {solicitud.recordatorios} recordatorio(s) · responsable {solicitud.responsableId || "sin asignar"} · creada{" "}
            {fechaCorta(solicitud.fechaSolicitud)}
          </p>

          {capacidades.solicitar && solicitud.estado !== "COMPLETADA" && solicitud.estado !== "CANCELADA" && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <Campo etiqueta="Registrar seguimiento">
                  <Entrada
                    value={nota[solicitud.solicitudId] ?? ""}
                    onChange={(e) => setNota((prev) => ({ ...prev, [solicitud.solicitudId]: e.target.value }))}
                    placeholder="Llamada, correo o gestión realizada"
                  />
                </Campo>
              </div>
              <Boton
                variante="suave"
                disabled={!(nota[solicitud.solicitudId] ?? "").trim()}
                onClick={async () => {
                  try {
                    await docApi.seguimientoSolicitud(solicitud.solicitudId, nota[solicitud.solicitudId]);
                    setNota((prev) => ({ ...prev, [solicitud.solicitudId]: "" }));
                    avisar("exito", "Seguimiento registrado.");
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo registrar.", fallo.pista);
                  }
                }}
              >
                Registrar
              </Boton>
              <Boton
                variante="fantasma"
                onClick={async () => {
                  try {
                    await docApi.cambiarEstadoSolicitud(solicitud.solicitudId, "CANCELADA", "Cancelada desde el expediente");
                    avisar("exito", "Solicitud cancelada.");
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo cancelar.", fallo.pista);
                  }
                }}
              >
                Cancelar solicitud
              </Boton>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Revisiones({ datos }: { datos: ExpedienteOperativo }) {
  if (!datos.revisiones.length) {
    return <Vacio titulo="Sin decisiones de revisión" detalle="Cada aprobación u observación queda registrada aquí con su motivo." />;
  }
  const ordenadas = [...datos.revisiones].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return (
    <Panel titulo="Historial de decisiones" descripcion="Append-only: una decisión no se edita, se sucede.">
      <ol className="space-y-3">
        {ordenadas.map((revision) => (
          <li key={revision.revisionId} className="border-l-2 border-[color:var(--hairline)] pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <ChipEstado
                estado={revision.estado}
                etiqueta={ETIQUETA_REVISION[revision.estado as keyof typeof ETIQUETA_REVISION] ?? revision.estado}
                intencion={INTENCION_REVISION[revision.estado as keyof typeof INTENCION_REVISION] ?? "neutral"}
              />
              <span className="text-xs text-ink">{revision.nombre}</span>
            </div>
            {revision.motivoEtiqueta && <p className="mt-1 text-[11px] text-ink-soft">Motivo: {revision.motivoEtiqueta}</p>}
            {revision.comentario && <p className="mt-0.5 text-xs text-ink-soft">{revision.comentario}</p>}
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {revision.revisor} · {fechaHora(revision.fecha)} · versión {revision.versionRevisada}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Aprobaciones({
  datos,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  const [aprobador, setAprobador] = useState("");
  const [comentario, setComentario] = useState<Record<string, string>>({});

  return (
    <div className="space-y-3">
      {capacidades.revisar && (
        <Panel titulo="Solicitar aprobación" descripcion="Flujo simple de un nivel. La estructura admite varios sin migrar nada.">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Campo etiqueta="Aprobador" ayuda="Correo o nombre de quien debe firmar.">
                <Entrada value={aprobador} onChange={(e) => setAprobador(e.target.value)} placeholder="supervisora@bdp.com" />
              </Campo>
            </div>
            <Boton
              variante="primario"
              disabled={!aprobador.trim()}
              onClick={async () => {
                try {
                  await docApi.solicitarAprobacion({ expedienteId: datos.expediente.expedienteId, aprobadores: [aprobador.trim()] });
                  setAprobador("");
                  avisar("exito", "Aprobación solicitada y notificada.");
                  onRecargar();
                } catch (error) {
                  const fallo = error as { message?: string; pista?: string };
                  avisar("peligro", fallo.message ?? "No se pudo solicitar.", fallo.pista);
                }
              }}
            >
              Solicitar
            </Boton>
          </div>
        </Panel>
      )}

      {!datos.aprobaciones.length && <Vacio titulo="Sin aprobaciones" detalle="Cuando se pida una firma, aparecerá aquí." />}

      {datos.aprobaciones.map((aprobacion) => (
        <Panel
          key={aprobacion.aprobacionId}
          titulo={`Nivel ${aprobacion.nivel} · ${aprobacion.aprobador}`}
          descripcion={`Flujo ${aprobacion.flujo} · ${aprobacion.fechaLimite ? textoPlazo(aprobacion.fechaLimite) : "sin plazo"}`}
          acciones={
            <ChipEstado
              estado={aprobacion.estado}
              etiqueta={ETIQUETA_APROBACION[aprobacion.estado as keyof typeof ETIQUETA_APROBACION] ?? aprobacion.estado}
              intencion={INTENCION_APROBACION[aprobacion.estado as keyof typeof INTENCION_APROBACION] ?? "neutral"}
            />
          }
        >
          {aprobacion.comentario && <p className="text-xs text-ink-soft">{aprobacion.comentario}</p>}
          {aprobacion.fechaDecision && <p className="text-[11px] text-ink-faint">Resuelta {fechaHora(aprobacion.fechaDecision)}</p>}

          {capacidades.aprobar && aprobacion.estado === "PENDIENTE" && (
            <div className="mt-2 space-y-2">
              <Campo etiqueta="Comentario" ayuda="Obligatorio si se rechaza.">
                <Entrada
                  value={comentario[aprobacion.aprobacionId] ?? ""}
                  onChange={(e) => setComentario((prev) => ({ ...prev, [aprobacion.aprobacionId]: e.target.value }))}
                />
              </Campo>
              <div className="flex gap-2">
                <Boton
                  variante="primario"
                  onClick={async () => {
                    try {
                      await docApi.resolverAprobacion(aprobacion.aprobacionId, "APROBADA", comentario[aprobacion.aprobacionId]);
                      avisar("exito", "Aprobación registrada.");
                      onRecargar();
                    } catch (error) {
                      const fallo = error as { message?: string; pista?: string };
                      avisar("peligro", fallo.message ?? "No se pudo aprobar.", fallo.pista);
                    }
                  }}
                >
                  Aprobar
                </Boton>
                <Boton
                  variante="peligro"
                  onClick={async () => {
                    try {
                      await docApi.resolverAprobacion(aprobacion.aprobacionId, "RECHAZADA", comentario[aprobacion.aprobacionId]);
                      avisar("exito", "Rechazo registrado.");
                      onRecargar();
                    } catch (error) {
                      const fallo = error as { message?: string; pista?: string };
                      avisar("peligro", fallo.message ?? "No se pudo rechazar.", fallo.pista);
                    }
                  }}
                >
                  Rechazar
                </Boton>
              </div>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Prorrogas({
  datos,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  if (!datos.prorrogas.length) {
    return <Vacio titulo="Sin prórrogas" detalle="Se conceden desde la pestaña de requisitos, en los que la admiten." />;
  }
  return (
    <div className="space-y-2">
      {datos.prorrogas.map((prorroga) => (
        <Panel
          key={prorroga.prorrogaId}
          titulo={prorroga.nombre}
          descripcion={`Hasta ${fechaCorta(prorroga.fechaProrroga)} · ${textoPlazo(prorroga.fechaProrroga)}`}
          acciones={
            <div className="flex items-center gap-1.5">
              <ChipEstado
                estado={prorroga.situacion}
                etiqueta={ETIQUETA_SITUACION[prorroga.situacion] ?? prorroga.situacion}
                intencion={INTENCION_SITUACION[prorroga.situacion] ?? "neutral"}
              />
              <ChipEstado
                estado={prorroga.estado}
                etiqueta={ETIQUETA_PRORROGA[prorroga.estado as keyof typeof ETIQUETA_PRORROGA] ?? prorroga.estado}
                intencion={INTENCION_PRORROGA[prorroga.estado as keyof typeof INTENCION_PRORROGA] ?? "neutral"}
              />
            </div>
          }
        >
          <p className="text-xs text-ink-soft">{prorroga.motivo}</p>
          <p className="mt-1 text-[11px] text-ink-faint">
            Solicitada por {prorroga.solicitadaPor || "—"}
            {prorroga.aprobadaPor ? ` · aprobada por ${prorroga.aprobadaPor}` : ""}
            {prorroga.fechaOriginal ? ` · fecha original ${fechaCorta(prorroga.fechaOriginal)}` : ""}
          </p>
          {capacidades.editar && (prorroga.estado === "VIGENTE" || prorroga.estado === "SOLICITADA") && (
            <div className="mt-2 flex gap-2">
              <Boton
                variante="suave"
                onClick={async () => {
                  try {
                    await docApi.cambiarEstadoProrroga(prorroga.prorrogaId, "CUMPLIDA");
                    avisar("exito", "Prórroga marcada como cumplida.");
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo actualizar.", fallo.pista);
                  }
                }}
              >
                Marcar cumplida
              </Boton>
              <Boton
                variante="fantasma"
                onClick={async () => {
                  try {
                    await docApi.cambiarEstadoProrroga(prorroga.prorrogaId, "CANCELADA", "Cancelada desde el expediente");
                    avisar("exito", "Prórroga cancelada.");
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo cancelar.", fallo.pista);
                  }
                }}
              >
                Cancelar
              </Boton>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Tareas({
  datos,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  const [titulo, setTitulo] = useState("");
  const [responsable, setResponsable] = useState("");

  return (
    <div className="space-y-3">
      {capacidades.tareas && (
        <Panel titulo="Nueva tarea" descripcion="El plazo se calcula con el SLA configurado si no se indica otro.">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Campo etiqueta="Qué hay que hacer" requerido>
                <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Llamar para pedir el REJAP" />
              </Campo>
            </div>
            <div className="min-w-[160px]">
              <Campo etiqueta="Responsable">
                <Entrada value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Correo o nombre" />
              </Campo>
            </div>
            <Boton
              variante="primario"
              disabled={!titulo.trim()}
              onClick={async () => {
                try {
                  await docApi.crearTarea({
                    expedienteId: datos.expediente.expedienteId,
                    titulo: titulo.trim(),
                    responsableId: responsable.trim(),
                  });
                  setTitulo("");
                  setResponsable("");
                  avisar("exito", "Tarea creada y notificada.");
                  onRecargar();
                } catch (error) {
                  const fallo = error as { message?: string; pista?: string };
                  avisar("peligro", fallo.message ?? "No se pudo crear la tarea.", fallo.pista);
                }
              }}
            >
              Crear tarea
            </Boton>
          </div>
        </Panel>
      )}

      {!datos.tareas.length && <Vacio titulo="Sin tareas" detalle="Las observaciones abren tareas de corrección automáticamente." />}

      {datos.tareas.map((tarea) => (
        <Panel
          key={tarea.tareaId}
          titulo={tarea.titulo}
          descripcion={`${tarea.tipo} · ${tarea.fechaLimite ? textoPlazo(tarea.fechaLimite) : "sin plazo"} · ${tarea.responsableId || "sin responsable"}`}
          acciones={
            <ChipEstado
              estado={tarea.estado}
              etiqueta={ETIQUETA_TAREA[tarea.estado as keyof typeof ETIQUETA_TAREA] ?? tarea.estado}
              intencion={INTENCION_TAREA[tarea.estado as keyof typeof INTENCION_TAREA] ?? "neutral"}
            />
          }
        >
          {tarea.descripcion && <p className="text-xs text-ink-soft">{tarea.descripcion}</p>}
          {tarea.origenTipo && <p className="mt-1 text-[11px] text-ink-faint">Origen: {tarea.origenTipo}</p>}
          {capacidades.tareas && tarea.estado !== "COMPLETADA" && tarea.estado !== "CANCELADA" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Boton
                variante="primario"
                onClick={async () => {
                  try {
                    await docApi.cambiarEstadoTarea(tarea.tareaId, "COMPLETADA");
                    avisar("exito", "Tarea completada.");
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo completar.", fallo.pista);
                  }
                }}
              >
                Completar
              </Boton>
              {tarea.estado === "PENDIENTE" && (
                <Boton
                  variante="suave"
                  onClick={async () => {
                    try {
                      await docApi.cambiarEstadoTarea(tarea.tareaId, "EN_PROGRESO");
                      onRecargar();
                    } catch (error) {
                      const fallo = error as { message?: string; pista?: string };
                      avisar("peligro", fallo.message ?? "No se pudo actualizar.", fallo.pista);
                    }
                  }}
                >
                  Empezar
                </Boton>
              )}
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

function Comentarios({
  datos,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  const [texto, setTexto] = useState("");
  const [visibilidad, setVisibilidad] = useState("OPERATIVA");

  return (
    <div className="space-y-3">
      {capacidades.comentar && (
        <Panel titulo="Nuevo comentario">
          <div className="space-y-2">
            <Campo etiqueta="Comentario">
              <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
            </Campo>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px]">
                <Campo
                  etiqueta="Visibilidad"
                  ayuda={VISIBILIDADES_COMENTARIO.find((v) => v.codigo === visibilidad)?.descripcion}
                >
                  <Selector
                    valor={visibilidad}
                    onChange={setVisibilidad}
                    opciones={VISIBILIDADES_COMENTARIO.map((v) => ({ valor: v.codigo, etiqueta: v.etiqueta }))}
                  />
                </Campo>
              </div>
              <Boton
                variante="primario"
                disabled={!texto.trim()}
                onClick={async () => {
                  try {
                    await docApi.crearComentario({
                      expedienteId: datos.expediente.expedienteId,
                      contenido: texto.trim(),
                      visibilidad,
                    });
                    setTexto("");
                    avisar("exito", "Comentario guardado.");
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo guardar.", fallo.pista);
                  }
                }}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Comentar
              </Boton>
            </div>
          </div>
        </Panel>
      )}

      {!datos.comentarios.length && <Vacio titulo="Sin comentarios" detalle="Los seguimientos y las notas del equipo aparecen aquí." />}

      <ol className="space-y-2">
        {datos.comentarios.map((comentario) => (
          <li key={comentario.comentarioId} className="glass rounded-2xl p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {comentario.visibilidad} · {comentario.tipo}
              </span>
              <span className="text-[11px] text-ink-faint">
                {comentario.creadoPor} · {fechaHora(comentario.creadoEn)}
                {comentario.editadoEn && " · editado"}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-ink">{comentario.contenido}</p>
            {capacidades.comentar && (
              <Boton
                variante="fantasma"
                onClick={async () => {
                  try {
                    await docApi.resolverComentario(comentario.comentarioId, !comentario.resuelto);
                    onRecargar();
                  } catch (error) {
                    const fallo = error as { message?: string; pista?: string };
                    avisar("peligro", fallo.message ?? "No se pudo actualizar.", fallo.pista);
                  }
                }}
              >
                {comentario.resuelto ? "Reabrir" : "Marcar resuelto"}
              </Boton>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Historial({ datos }: { datos: ExpedienteOperativo }) {
  if (!datos.historial.length) return <Vacio titulo="Sin historial" detalle="Cada cambio queda registrado en cuanto ocurra." />;
  return (
    <Panel titulo="Qué ha pasado" descripcion="Historial legible: campo, valor anterior y valor nuevo.">
      <ol className="space-y-2">
        {datos.historial.map((entrada) => (
          <li key={entrada.historialId} className="border-l-2 border-[color:var(--hairline)] pl-3 text-xs">
            <p className="text-ink">{entrada.texto}</p>
            <p className="text-[11px] text-ink-faint">
              {entrada.actor} · {fechaHora(entrada.fecha)}
              {entrada.motivo ? ` · ${entrada.motivo}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Auditoria({ datos }: { datos: ExpedienteOperativo }) {
  if (!datos.auditoria.length) return <Vacio titulo="Sin eventos" detalle="La auditoría técnica registra cada operación con su solicitud." />;
  return (
    <Panel titulo="Auditoría técnica" descripcion="Evento, actor, origen y resultado. Con el identificador de solicitud para rastrear.">
      <ol className="space-y-1.5">
        {datos.auditoria.map((evento) => (
          <li key={evento.eventoId} className="rounded-xl bg-[color:var(--fill-1)] p-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{evento.tipo}</span>
              <span className={evento.resultado === "ok" ? "text-emerald-300" : "text-amber-300"}>{evento.resultado}</span>
            </div>
            <p className="text-ink-soft">
              {evento.actor} · {evento.origen} · {fechaHora(evento.fecha)}
            </p>
            <p className="truncate text-ink-faint" title={evento.requestId}>
              solicitud {evento.requestId}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
