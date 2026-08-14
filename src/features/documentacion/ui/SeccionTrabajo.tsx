/**
 * Secciones de trabajo: solicitudes, revisión, aprobaciones, prórrogas y tareas.
 *
 * ── Por qué en un solo archivo ──────────────────────────────────────────────
 * Las cinco son la misma pantalla con otros datos: filtros arriba, tabla en el
 * centro, paginación abajo y una acción por fila. Separarlas en cinco archivos
 * significaría copiar cinco veces la misma estructura; agruparlas mantiene una
 * sola forma de hacer las cosas y hace evidente en qué se diferencian.
 *
 * Cada una es una cola de trabajo real: se entra, se ve qué hay que atender, se
 * atiende y se sale. Nada de listados que solo informan.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { docApi } from "../api/acciones";
import {
  ETIQUETA_APROBACION,
  ETIQUETA_PRORROGA,
  ETIQUETA_REVISION,
  ETIQUETA_SITUACION,
  ETIQUETA_SOLICITUD,
  ETIQUETA_TAREA,
  ESTADOS_SOLICITUD,
  ESTADOS_TAREA,
  INTENCION_APROBACION,
  INTENCION_PRORROGA,
  INTENCION_REVISION,
  INTENCION_SITUACION,
  INTENCION_SOLICITUD,
  INTENCION_TAREA,
  INTENCION_PRIORIDAD,
  MOTIVOS_REVISION,
  type Prioridad,
} from "../domain/vocabulario";
import { fechaCorta, fechaHora, textoPlazo } from "../domain/progreso";
import { useConsola } from "../state/consola";
import {
  Aviso,
  Boton,
  Buscador,
  Campo,
  ChipEstado,
  Confirmacion,
  AreaTexto,
  Interruptor,
  Paginacion,
  Panel,
  Selector,
  Tabla,
  usarDebounce,
  type ColumnaTabla,
  type Notita,
} from "./piezas";
import { useDatos } from "./useDatos";

interface PropsSeccion {
  onAbrirExpediente: (expedienteId: string) => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}

/* ================================================================== */
/* Solicitudes                                                         */
/* ================================================================== */

export function SeccionSolicitudes({ onAbrirExpediente, avisar }: PropsSeccion) {
  const { conexion, densidad, capacidades } = useConsola();
  const [texto, setTexto] = useState("");
  const buscado = usarDebounce(texto, 350);
  const [estado, setEstado] = useState("");
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [pagina, setPagina] = useState(1);

  const filtros = useMemo(
    () => ({ texto: buscado || undefined, estado: estado || undefined, soloVencidas: soloVencidas || undefined, pagina, porPagina: 25, orden: "limite", direccion: "asc" }),
    [buscado, estado, soloVencidas, pagina],
  );
  const lista = useDatos(() => docApi.listarSolicitudes(filtros), [JSON.stringify(filtros)], { activo: conexion === "conectado" });

  const columnas: ColumnaTabla<NonNullable<typeof lista.datos>["solicitudes"][number]>[] = [
    {
      clave: "persona",
      encabezado: "Expediente",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fila.expediente?.nombre ?? "—"}</p>
          <p className="truncate text-[11px] text-ink-faint">{fila.expediente?.identificador ?? fila.expedienteId}</p>
        </div>
      ),
    },
    { clave: "titulo", encabezado: "Solicitud", render: (fila) => <span className="text-xs text-ink">{fila.titulo}</span> },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (fila) => (
        <ChipEstado
          estado={fila.estado}
          etiqueta={ETIQUETA_SOLICITUD[fila.estado as keyof typeof ETIQUETA_SOLICITUD] ?? fila.estado}
          intencion={INTENCION_SOLICITUD[fila.estado as keyof typeof INTENCION_SOLICITUD] ?? "neutral"}
        />
      ),
    },
    {
      clave: "avance",
      encabezado: "Cumplidos",
      numerica: true,
      render: (fila) => (
        <span>
          {fila.cumplidos}/{fila.total}
        </span>
      ),
    },
    {
      clave: "plazo",
      encabezado: "Plazo",
      render: (fila) => <span className={fila.vencida ? "text-rose-300" : "text-ink-soft"}>{textoPlazo(fila.fechaLimite)}</span>,
    },
    {
      clave: "prioridad",
      encabezado: "Prioridad",
      secundaria: true,
      render: (fila) => (
        <ChipEstado estado={fila.prioridad} intencion={INTENCION_PRIORIDAD[fila.prioridad as Prioridad] ?? "neutral"} />
      ),
    },
    {
      clave: "recordatorios",
      encabezado: "Seguimientos",
      numerica: true,
      secundaria: true,
      render: (fila) => <span>{fila.recordatorios}</span>,
    },
    {
      clave: "acciones",
      encabezado: "",
      render: (fila) =>
        capacidades.solicitar && fila.estado !== "COMPLETADA" && fila.estado !== "CANCELADA" ? (
          <Boton
            variante="suave"
            onClick={async () => {
              try {
                await docApi.cambiarEstadoSolicitud(fila.solicitudId, "EN_SEGUIMIENTO");
                lista.recargar();
                avisar("exito", "Marcada en seguimiento.");
              } catch (error) {
                const fallo = error as { message?: string; pista?: string };
                avisar("peligro", fallo.message ?? "No se pudo actualizar.", fallo.pista);
              }
            }}
          >
            Seguir
          </Boton>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar por persona o título…" />
        <div className="min-w-[160px]">
          <Selector
            valor={estado}
            onChange={(v) => {
              setEstado(v);
              setPagina(1);
            }}
            placeholder="Todos los estados"
            opciones={ESTADOS_SOLICITUD.map((e) => ({ valor: e, etiqueta: ETIQUETA_SOLICITUD[e] }))}
          />
        </div>
        <Interruptor
          activo={soloVencidas}
          onChange={(v) => {
            setSoloVencidas(v);
            setPagina(1);
          }}
          etiqueta="Solo vencidas"
        />
        <Boton variante="suave" onClick={lista.recargar} cargando={lista.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {lista.error && (
        <Aviso intencion="peligro" titulo="No se pudieron cargar las solicitudes" accion={<Boton onClick={lista.recargar}>Reintentar</Boton>}>
          {lista.error.mensaje} {lista.error.pista}
        </Aviso>
      )}

      <Panel descripcion="Las solicitudes se crean desde el expediente o en bloque desde la lista de expedientes.">
        <Tabla
          columnas={columnas}
          filas={lista.datos?.solicitudes ?? []}
          claveFila={(fila) => fila.solicitudId}
          onFila={(fila) => onAbrirExpediente(fila.expedienteId)}
          cargando={lista.cargando && !lista.datos}
          densidad={densidad}
          titulo="Solicitudes documentales"
        />
        {lista.datos && (
          <Paginacion
            pagina={lista.datos.pagina}
            paginas={lista.datos.paginas}
            total={lista.datos.total}
            porPagina={lista.datos.porPagina}
            onPagina={setPagina}
          />
        )}
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Revisión                                                            */
/* ================================================================== */

/**
 * Cola de revisión.
 *
 * Muestra lo entregado sin revisar y lo observado, con lo observado primero. Se
 * decide desde la propia fila: quien revisa no debería tener que abrir el
 * expediente completo para aprobar un documento que está viendo.
 */
export function SeccionRevision({ onAbrirExpediente, avisar }: PropsSeccion) {
  const { conexion, densidad, capacidades } = useConsola();
  const [texto, setTexto] = useState("");
  const buscado = usarDebounce(texto, 350);
  const [soloExigen, setSoloExigen] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [decidiendo, setDecidiendo] = useState<null | { id: string; nombre: string }>(null);
  const [estado, setEstado] = useState("APROBADO");
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const filtros = useMemo(
    () => ({ texto: buscado || undefined, soloRequierenRevision: soloExigen || undefined, pagina, porPagina: 25 }),
    [buscado, soloExigen, pagina],
  );
  const cola = useDatos(() => docApi.colaRevision(filtros), [JSON.stringify(filtros)], { activo: conexion === "conectado" });
  const exigeMotivo = ["OBSERVADO", "RECHAZADO", "REQUIERE_CORRECCION", "APROBADO_CON_OBSERVACION"].includes(estado);

  const columnas: ColumnaTabla<NonNullable<typeof cola.datos>["requisitos"][number]>[] = [
    {
      clave: "persona",
      encabezado: "Persona",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fila.persona}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {fila.identificador} · {fila.agencia || "—"}
          </p>
        </div>
      ),
    },
    {
      clave: "requisito",
      encabezado: "Requisito",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink">{fila.nombre}</p>
          {fila.observaciones && <p className="truncate text-[11px] text-amber-200">{fila.observaciones}</p>}
        </div>
      ),
    },
    {
      clave: "revision",
      encabezado: "Revisión",
      render: (fila) => (
        <ChipEstado
          estado={fila.estadoRevision}
          etiqueta={ETIQUETA_REVISION[fila.estadoRevision as keyof typeof ETIQUETA_REVISION] ?? fila.estadoRevision}
          intencion={INTENCION_REVISION[fila.estadoRevision as keyof typeof INTENCION_REVISION] ?? "neutral"}
        />
      ),
    },
    {
      clave: "actualizado",
      encabezado: "Entregado",
      secundaria: true,
      render: (fila) => <span className="text-[11px] text-ink-soft">{fechaHora(fila.actualizadoEn)}</span>,
    },
    {
      clave: "acciones",
      encabezado: "",
      render: (fila) =>
        capacidades.revisar ? (
          <Boton
            variante="primario"
            onClick={() => {
              setDecidiendo({ id: fila.expedienteDocumentoId, nombre: fila.nombre });
              setEstado("APROBADO");
              setMotivo("");
              setComentario("");
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Decidir
          </Boton>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar por persona o requisito…" />
        <Interruptor activo={soloExigen} onChange={setSoloExigen} etiqueta="Solo los que exigen revisión" />
        <Boton variante="suave" onClick={cola.recargar} cargando={cola.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {cola.error && (
        <Aviso intencion="peligro" titulo="No se pudo cargar la cola" accion={<Boton onClick={cola.recargar}>Reintentar</Boton>}>
          {cola.error.mensaje} {cola.error.pista}
        </Aviso>
      )}

      <Panel descripcion="Requisitos entregados pendientes de decisión y requisitos observados esperando corrección.">
        <Tabla
          columnas={columnas}
          filas={cola.datos?.requisitos ?? []}
          claveFila={(fila) => fila.expedienteDocumentoId}
          onFila={(fila) => onAbrirExpediente(fila.expedienteId)}
          cargando={cola.cargando && !cola.datos}
          densidad={densidad}
          titulo="Cola de revisión"
          vacio={
            <div className="py-6 text-center">
              <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-300" aria-hidden />
              <p className="mt-2 text-sm text-ink">No queda nada por revisar.</p>
            </div>
          }
        />
        {cola.datos && (
          <Paginacion
            pagina={cola.datos.pagina}
            paginas={cola.datos.paginas}
            total={cola.datos.total}
            porPagina={cola.datos.porPagina}
            onPagina={setPagina}
          />
        )}
      </Panel>

      <Confirmacion
        abierta={!!decidiendo}
        titulo={`Revisar «${decidiendo?.nombre ?? ""}»`}
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
                  opciones={(cola.datos?.motivos ?? MOTIVOS_REVISION).map((m) => ({ valor: m.codigo, etiqueta: m.etiqueta }))}
                />
              </Campo>
            )}
            <Campo etiqueta="Comentario" requerido={estado === "OBSERVADO"}>
              <AreaTexto value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} />
            </Campo>
          </div>
        }
        textoConfirmar="Registrar"
        trabajando={enviando}
        onCancelar={() => setDecidiendo(null)}
        onConfirmar={async () => {
          if (!decidiendo) return;
          setEnviando(true);
          try {
            await docApi.decidirRevision({ expedienteDocumentoId: decidiendo.id, estado, motivo, comentario });
            avisar("exito", "Decisión registrada.");
            setDecidiendo(null);
            cola.recargar();
          } catch (error) {
            const fallo = error as { message?: string; pista?: string };
            avisar("peligro", fallo.message ?? "No se pudo registrar.", fallo.pista);
          } finally {
            setEnviando(false);
          }
        }}
      />
    </div>
  );
}

/* ================================================================== */
/* Aprobaciones                                                        */
/* ================================================================== */

export function SeccionAprobaciones({ onAbrirExpediente, avisar }: PropsSeccion) {
  const { conexion, densidad, capacidades } = useConsola();
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [pagina, setPagina] = useState(1);

  const filtros = useMemo(
    () => ({ soloPendientes: soloPendientes || undefined, pagina, porPagina: 25, orden: "limite", direccion: "asc" }),
    [soloPendientes, pagina],
  );
  const lista = useDatos(() => docApi.listarAprobaciones(filtros), [JSON.stringify(filtros)], { activo: conexion === "conectado" });

  const columnas: ColumnaTabla<NonNullable<typeof lista.datos>["aprobaciones"][number]>[] = [
    {
      clave: "persona",
      encabezado: "Expediente",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fila.expediente?.nombre ?? "—"}</p>
          <p className="truncate text-[11px] text-ink-faint">{fila.expediente?.identificador ?? fila.expedienteId}</p>
        </div>
      ),
    },
    { clave: "flujo", encabezado: "Flujo", secundaria: true, render: (fila) => <span className="text-xs text-ink-soft">{fila.flujo} · nivel {fila.nivel}</span> },
    { clave: "aprobador", encabezado: "Aprobador", render: (fila) => <span className="text-xs text-ink">{fila.aprobador}</span> },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (fila) => (
        <ChipEstado
          estado={fila.estado}
          etiqueta={ETIQUETA_APROBACION[fila.estado as keyof typeof ETIQUETA_APROBACION] ?? fila.estado}
          intencion={INTENCION_APROBACION[fila.estado as keyof typeof INTENCION_APROBACION] ?? "neutral"}
        />
      ),
    },
    {
      clave: "plazo",
      encabezado: "Plazo",
      render: (fila) => <span className={fila.vencida ? "text-rose-300" : "text-ink-soft"}>{fila.fechaLimite ? textoPlazo(fila.fechaLimite) : "—"}</span>,
    },
    {
      clave: "acciones",
      encabezado: "",
      render: (fila) =>
        capacidades.aprobar && fila.estado === "PENDIENTE" ? (
          <Boton
            variante="primario"
            onClick={async () => {
              try {
                await docApi.resolverAprobacion(fila.aprobacionId, "APROBADA");
                avisar("exito", "Aprobación registrada.");
                lista.recargar();
              } catch (error) {
                const fallo = error as { message?: string; pista?: string };
                avisar("peligro", fallo.message ?? "No se pudo aprobar.", fallo.pista);
              }
            }}
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Aprobar
          </Boton>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Interruptor activo={soloPendientes} onChange={setSoloPendientes} etiqueta="Solo pendientes" />
        <Boton variante="suave" onClick={lista.recargar} cargando={lista.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {lista.error && (
        <Aviso intencion="peligro" titulo="No se pudieron cargar las aprobaciones" accion={<Boton onClick={lista.recargar}>Reintentar</Boton>}>
          {lista.error.mensaje} {lista.error.pista}
        </Aviso>
      )}

      <Panel descripcion="Para rechazar hace falta explicar el motivo: se hace desde el expediente.">
        <Tabla
          columnas={columnas}
          filas={lista.datos?.aprobaciones ?? []}
          claveFila={(fila) => fila.aprobacionId}
          onFila={(fila) => onAbrirExpediente(fila.expedienteId)}
          cargando={lista.cargando && !lista.datos}
          densidad={densidad}
          titulo="Aprobaciones"
          vacio={<div className="py-6 text-center text-sm text-ink">No hay aprobaciones pendientes.</div>}
        />
        {lista.datos && (
          <Paginacion
            pagina={lista.datos.pagina}
            paginas={lista.datos.paginas}
            total={lista.datos.total}
            porPagina={lista.datos.porPagina}
            onPagina={setPagina}
          />
        )}
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Prórrogas                                                           */
/* ================================================================== */

export function SeccionProrrogas({ onAbrirExpediente, avisar }: PropsSeccion) {
  const { conexion, densidad, capacidades } = useConsola();
  const [texto, setTexto] = useState("");
  const buscado = usarDebounce(texto, 350);
  const [situacion, setSituacion] = useState("todas");
  const [pagina, setPagina] = useState(1);

  const filtros = useMemo(
    () => ({ texto: buscado || undefined, situacion, pagina, porPagina: 25, orden: "fecha", direccion: "asc" }),
    [buscado, situacion, pagina],
  );
  const lista = useDatos(() => docApi.listarProrrogas(filtros), [JSON.stringify(filtros)], { activo: conexion === "conectado" });

  const columnas: ColumnaTabla<NonNullable<typeof lista.datos>["prorrogas"][number]>[] = [
    {
      clave: "persona",
      encabezado: "Expediente",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fila.expediente?.nombre ?? "—"}</p>
          <p className="truncate text-[11px] text-ink-faint">{fila.expediente?.identificador ?? fila.expedienteId}</p>
        </div>
      ),
    },
    { clave: "requisito", encabezado: "Requisito", render: (fila) => <span className="text-xs text-ink">{fila.nombre}</span> },
    {
      clave: "situacion",
      encabezado: "Situación",
      render: (fila) => (
        <ChipEstado
          estado={fila.situacion}
          etiqueta={ETIQUETA_SITUACION[fila.situacion] ?? fila.situacion}
          intencion={INTENCION_SITUACION[fila.situacion] ?? "neutral"}
        />
      ),
    },
    {
      clave: "estado",
      encabezado: "Estado",
      secundaria: true,
      render: (fila) => (
        <ChipEstado
          estado={fila.estado}
          etiqueta={ETIQUETA_PRORROGA[fila.estado as keyof typeof ETIQUETA_PRORROGA] ?? fila.estado}
          intencion={INTENCION_PRORROGA[fila.estado as keyof typeof INTENCION_PRORROGA] ?? "neutral"}
        />
      ),
    },
    {
      clave: "fecha",
      encabezado: "Vence",
      render: (fila) => (
        <span className={fila.situacion === "vencida" ? "text-rose-300" : "text-ink-soft"} title={fechaCorta(fila.fechaProrroga)}>
          {textoPlazo(fila.fechaProrroga)}
        </span>
      ),
    },
    { clave: "motivo", encabezado: "Motivo", secundaria: true, render: (fila) => <span className="text-[11px] text-ink-soft">{fila.motivo}</span> },
    {
      clave: "acciones",
      encabezado: "",
      render: (fila) =>
        capacidades.editar && (fila.estado === "VIGENTE" || fila.estado === "SOLICITADA" || fila.estado === "VENCIDA") ? (
          <Boton
            variante="suave"
            onClick={async () => {
              try {
                await docApi.cambiarEstadoProrroga(fila.prorrogaId, "CUMPLIDA");
                avisar("exito", "Prórroga marcada como cumplida.");
                lista.recargar();
              } catch (error) {
                const fallo = error as { message?: string; pista?: string };
                avisar("peligro", fallo.message ?? "No se pudo actualizar.", fallo.pista);
              }
            }}
          >
            Cumplida
          </Boton>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar por persona, requisito o motivo…" />
        <div className="min-w-[170px]">
          <Selector
            valor={situacion}
            onChange={(v) => {
              setSituacion(v);
              setPagina(1);
            }}
            opciones={[
              { valor: "todas", etiqueta: "Todas las situaciones" },
              { valor: "vigente", etiqueta: "Vigentes" },
              { valor: "por_vencer", etiqueta: "Por vencer" },
              { valor: "vencida", etiqueta: "Vencidas" },
              { valor: "cerrada", etiqueta: "Cerradas" },
            ]}
          />
        </div>
        <Boton variante="suave" onClick={lista.recargar} cargando={lista.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {lista.error && (
        <Aviso intencion="peligro" titulo="No se pudieron cargar las prórrogas" accion={<Boton onClick={lista.recargar}>Reintentar</Boton>}>
          {lista.error.mensaje} {lista.error.pista}
        </Aviso>
      )}

      <Panel descripcion="Los días restantes se calculan al consultar. El proceso diario marca las vencidas y avisa una vez al día.">
        <Tabla
          columnas={columnas}
          filas={lista.datos?.prorrogas ?? []}
          claveFila={(fila) => fila.prorrogaId}
          onFila={(fila) => onAbrirExpediente(fila.expedienteId)}
          cargando={lista.cargando && !lista.datos}
          densidad={densidad}
          titulo="Prórrogas"
        />
        {lista.datos && (
          <Paginacion
            pagina={lista.datos.pagina}
            paginas={lista.datos.paginas}
            total={lista.datos.total}
            porPagina={lista.datos.porPagina}
            onPagina={setPagina}
          />
        )}
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Tareas                                                              */
/* ================================================================== */

export function SeccionTareas({ onAbrirExpediente, avisar }: PropsSeccion) {
  const { conexion, densidad, capacidades, actor } = useConsola();
  const [texto, setTexto] = useState("");
  const buscado = usarDebounce(texto, 350);
  const [estado, setEstado] = useState("");
  const [soloMias, setSoloMias] = useState(false);
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [pagina, setPagina] = useState(1);

  const filtros = useMemo(
    () => ({
      texto: buscado || undefined,
      estado: estado || undefined,
      responsable: soloMias ? actor : undefined,
      soloVencidas: soloVencidas || undefined,
      soloAbiertas: !estado && !soloVencidas ? true : undefined,
      pagina,
      porPagina: 25,
      orden: "limite",
      direccion: "asc",
    }),
    [buscado, estado, soloMias, soloVencidas, actor, pagina],
  );
  const lista = useDatos(() => docApi.listarTareas(filtros), [JSON.stringify(filtros)], { activo: conexion === "conectado" });

  const columnas: ColumnaTabla<NonNullable<typeof lista.datos>["tareas"][number]>[] = [
    {
      clave: "tarea",
      encabezado: "Tarea",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink">{fila.titulo}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {fila.expediente?.nombre ?? fila.expedienteId} · {fila.tipo}
          </p>
        </div>
      ),
    },
    { clave: "responsable", encabezado: "Responsable", secundaria: true, render: (fila) => <span className="text-xs text-ink-soft">{fila.responsableId || "—"}</span> },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (fila) => (
        <ChipEstado
          estado={fila.estado}
          etiqueta={ETIQUETA_TAREA[fila.estado as keyof typeof ETIQUETA_TAREA] ?? fila.estado}
          intencion={INTENCION_TAREA[fila.estado as keyof typeof INTENCION_TAREA] ?? "neutral"}
        />
      ),
    },
    {
      clave: "prioridad",
      encabezado: "Prioridad",
      secundaria: true,
      render: (fila) => <ChipEstado estado={fila.prioridad} intencion={INTENCION_PRIORIDAD[fila.prioridad as Prioridad] ?? "neutral"} />,
    },
    {
      clave: "plazo",
      encabezado: "Plazo",
      render: (fila) => <span className={fila.vencida ? "text-rose-300" : "text-ink-soft"}>{fila.fechaLimite ? textoPlazo(fila.fechaLimite) : "—"}</span>,
    },
    {
      clave: "acciones",
      encabezado: "",
      render: (fila) =>
        capacidades.tareas && fila.estado !== "COMPLETADA" && fila.estado !== "CANCELADA" ? (
          <Boton
            variante="primario"
            onClick={async () => {
              try {
                await docApi.cambiarEstadoTarea(fila.tareaId, "COMPLETADA");
                avisar("exito", "Tarea completada.");
                lista.recargar();
              } catch (error) {
                const fallo = error as { message?: string; pista?: string };
                avisar("peligro", fallo.message ?? "No se pudo completar.", fallo.pista);
              }
            }}
          >
            Completar
          </Boton>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar por título o descripción…" />
        <div className="min-w-[160px]">
          <Selector
            valor={estado}
            onChange={(v) => {
              setEstado(v);
              setPagina(1);
            }}
            placeholder="Abiertas"
            opciones={ESTADOS_TAREA.map((e) => ({ valor: e, etiqueta: ETIQUETA_TAREA[e] }))}
          />
        </div>
        <Interruptor activo={soloMias} onChange={setSoloMias} etiqueta="Solo mías" />
        <Interruptor activo={soloVencidas} onChange={setSoloVencidas} etiqueta="Solo vencidas" />
        <Boton variante="suave" onClick={lista.recargar} cargando={lista.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {lista.error && (
        <Aviso intencion="peligro" titulo="No se pudieron cargar las tareas" accion={<Boton onClick={lista.recargar}>Reintentar</Boton>}>
          {lista.error.mensaje} {lista.error.pista}
        </Aviso>
      )}

      <Panel descripcion="Las tareas nacen a mano o de una observación. Al resolverse su causa, se cierran solas.">
        <Tabla
          columnas={columnas}
          filas={lista.datos?.tareas ?? []}
          claveFila={(fila) => fila.tareaId}
          onFila={(fila) => onAbrirExpediente(fila.expedienteId)}
          cargando={lista.cargando && !lista.datos}
          densidad={densidad}
          titulo="Tareas documentales"
          vacio={<div className="py-6 text-center text-sm text-ink">Sin tareas abiertas.</div>}
        />
        {lista.datos && (
          <Paginacion
            pagina={lista.datos.pagina}
            paginas={lista.datos.paginas}
            total={lista.datos.total}
            porPagina={lista.datos.porPagina}
            onPagina={setPagina}
          />
        )}
      </Panel>
    </div>
  );
}
