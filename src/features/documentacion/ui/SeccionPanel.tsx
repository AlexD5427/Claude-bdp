/**
 * Panel operativo.
 *
 * ── Qué se responde aquí, y en qué orden ────────────────────────────────────
 * 1. ¿Qué tengo que hacer ahora? → la bandeja de atención, con nombre, plazo y
 *    un botón que abre el expediente.
 * 2. ¿Qué hay en riesgo? → los indicadores de urgencia, cada uno con su
 *    severidad y su filtro.
 * 3. ¿Cómo va el conjunto? → los agregados por agencia y gerencia.
 * 4. ¿Dónde se atasca? → el embudo y los rankings de requisitos.
 * 5. ¿Está el sistema sano? → enlace, libro, migraciones y frescura del dato.
 *
 * El panel anterior empezaba por el punto 2 y no tenía el 1 ni el 5. Con
 * dieciséis cifras del mismo tamaño, «prórrogas vencidas» y «expedientes
 * activos» pesaban igual, y para saber por dónde empezar había que ir a la lista
 * y ordenarla a mano.
 *
 * ── De dónde salen los números ─────────────────────────────────────────────
 * Todos agregados del backend (`documentacion.panel`). Ninguno se calcula aquí y
 * ninguno es decorativo: cada indicador es un filtro, y al pulsarlo se abre la
 * lista ya filtrada. La bandeja usa la misma acción de listado que la sección de
 * expedientes, pedida con orden por fecha crítica.
 */

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { docApi, type ListadoExpedientes, type PanelDatos } from "../api/acciones";
import { ETIQUETA_EXPEDIENTE, type EstadoExpediente } from "../domain/vocabulario";
import { fechaHora } from "../domain/progreso";
import { irASeccion, ponerFiltros, useConsola } from "../state/consola";
import { Boton, Panel, Tarjeta, TONO, usarMovimientoReducido } from "./piezas";
import { DocDatoNoFresco, DocError, DocVacio } from "./DocStates";
import { EsqueletoIndicadores, EsqueletoLineas } from "./DocSkeletons";
import { ActividadReciente, BandejaAtencion, SaludDelSistema } from "./DocAttentionPanel";
import { useDatos } from "./useDatos";

/** Barras horizontales. Con seis agencias, un gráfico de barras es una tabla. */
function Barras({
  datos,
  etiquetaValor,
}: {
  datos: { clave: string; expedientes: number; completos: number; avancePromedio: number }[];
  etiquetaValor: (item: { expedientes: number; completos: number; avancePromedio: number }) => string;
}) {
  const reducido = usarMovimientoReducido();
  if (!datos.length) {
    return (
      <DocVacio
        compacto
        icono="datos"
        titulo="Sin datos todavía"
        detalle="Cuando haya expedientes registrados, aquí aparece el desglose."
      />
    );
  }
  const maximo = Math.max(...datos.map((d) => d.expedientes), 1);

  return (
    <ul className="space-y-2">
      {datos.map((item) => (
        <li key={item.clave}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-[color:var(--doc-text)]" title={item.clave}>
              {item.clave}
            </span>
            <span className="doc-metric shrink-0 text-[color:var(--doc-text-muted)]">{etiquetaValor(item)}</span>
          </div>
          <div className="doc-medidor mt-1">
            <motion.span
              style={{ background: "var(--doc-info)" }}
              initial={reducido ? undefined : { width: 0 }}
              animate={{ width: `${Math.round((item.expedientes / maximo) * 100)}%` }}
              transition={{ duration: reducido ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Embudo documental: de todo lo exigido, cuánto llegó, se revisó y se aprobó. */
function Embudo({ embudo }: { embudo: PanelDatos["embudo"] }) {
  const pasos = [
    { etiqueta: "Requisitos exigidos", valor: embudo.total - embudo.noAplica, color: "var(--doc-text-faint)" },
    { etiqueta: "Entregados", valor: embudo.entregados, color: "var(--doc-info)" },
    { etiqueta: "En revisión", valor: embudo.enRevision, color: "var(--doc-accent)" },
    { etiqueta: "Aprobados", valor: embudo.aprobados, color: "var(--doc-success)" },
  ];
  const base = Math.max(pasos[0].valor, 1);
  return (
    <ol className="space-y-2">
      {pasos.map((paso) => {
        const porcentaje = Math.round((paso.valor / base) * 100);
        return (
          <li key={paso.etiqueta}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-[color:var(--doc-text)]">{paso.etiqueta}</span>
              <span className="doc-metric text-[color:var(--doc-text-muted)]">
                {paso.valor} · {porcentaje}%
              </span>
            </div>
            <div className="doc-medidor mt-1" style={{ height: "0.5rem" }}>
              <span style={{ width: `${porcentaje}%`, background: paso.color }} />
            </div>
          </li>
        );
      })}
      <li className="doc-prose pt-1 text-[11px] text-[color:var(--doc-text-faint)]">
        {embudo.observados} observado(s) · {embudo.noEntregados} no entregado(s) · {embudo.pendientes} pendiente(s) · {embudo.noAplica} no
        aplica
      </li>
    </ol>
  );
}

export function SeccionPanel({ onAbrirExpediente }: { onAbrirExpediente?: (expedienteId: string) => void }) {
  const { conexion, estado, ultimaSincronizacion, capacidades } = useConsola();
  const conectado = conexion === "conectado";

  const { datos, cargando, error, recargar } = useDatos<PanelDatos>(() => docApi.panel(), [], { activo: conectado });

  /**
   * Bandeja de atención.
   *
   * Misma acción que la lista, con el orden por fecha crítica ascendente y una
   * página corta: se piden ocho expedientes, no novecientos.
   */
  const atencion = useDatos<ListadoExpedientes>(
    () => docApi.listarExpedientes({ orden: "critica", direccion: "asc", porPagina: 8, pagina: 1 }),
    [],
    { activo: conectado },
  );

  const actividad = useDatos(() => docApi.notificaciones({ porPagina: 6, pagina: 1 }), [], { activo: conectado });

  /** Abre la lista de expedientes con el filtro que representa la tarjeta. */
  function verConFiltro(filtros: Record<string, unknown>) {
    ponerFiltros({ ...filtros, pagina: 1 });
    irASeccion("expedientes");
  }

  if (error) {
    return (
      <DocError
        titulo="No se pudo cargar el panel"
        error={error}
        onReintentar={recargar}
        reintentando={cargando}
        acciones={
          <Boton variante="fantasma" onClick={() => irASeccion("expedientes")}>
            Ir a la lista de expedientes
          </Boton>
        }
      />
    );
  }

  /* Carga inicial: esqueletos con la forma del panel, no un spinner. Así la
     página no salta cuando llegan las cifras. */
  if (cargando && !datos) {
    return (
      <div className="space-y-4">
        <span className="sr-only" role="status" aria-live="polite">
          Calculando indicadores…
        </span>
        <EsqueletoIndicadores />
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel titulo="Requiere atención">
            <EsqueletoLineas filas={4} alto="h-8" />
          </Panel>
          <Panel titulo="Salud del módulo">
            <EsqueletoLineas filas={5} alto="h-3" />
          </Panel>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  const t = datos.tarjetas;
  const criticos = t.prorrogasVencidas + t.solicitudesVencidas + t.tareasFueraSla;

  return (
    <div className="space-y-4">
      {/* Franja de contexto: cuántos, cuánto avanzan y de cuándo es el cálculo. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="doc-prose doc-metric text-xs text-[color:var(--doc-text-muted)]">
          {datos.expedientes} expediente(s) · avance promedio {datos.avancePromedio}% · calculado {fechaHora(datos.generado)}
        </p>
        <Boton variante="suave" onClick={recargar} cargando={cargando} titulo="Recalcular indicadores">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {datos.desdeCache && <DocDatoNoFresco motivo="cache" desde={fechaHora(datos.generado)} onActualizar={recargar} />}

      {/* ── Nivel 2 · atención operativa ───────────────────────────── */}
      <section aria-labelledby="doc-panel-urgente" className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="doc-panel-urgente" className="text-sm font-semibold text-[color:var(--doc-text)]">
            Requiere atención hoy
          </h3>
          <p className="text-[11px]" style={{ color: criticos ? TONO.peligro.texto : TONO.exito.texto }}>
            {criticos
              ? `${criticos} indicador(es) con plazo agotado`
              : "Ningún plazo agotado: prórrogas, solicitudes y tareas están dentro de fecha"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <Tarjeta
            etiqueta="Prórrogas vencidas"
            valor={t.prorrogasVencidas}
            intencion={t.prorrogasVencidas ? "peligro" : "neutral"}
            detalle="Plazo concedido y agotado"
            periodo="a hoy"
            accion="Ver expedientes"
            pista="Expedientes con al menos una prórroga cuya fecha ya pasó."
            onClick={() => verConFiltro({ conProrrogasVencidas: true })}
          />
          <Tarjeta
            etiqueta="Solicitudes vencidas"
            valor={t.solicitudesVencidas}
            intencion={t.solicitudesVencidas ? "peligro" : "neutral"}
            detalle="Sin respuesta a tiempo"
            periodo="a hoy"
            accion="Ver expedientes"
            onClick={() => verConFiltro({ conSolicitudesVencidas: true })}
          />
          <Tarjeta
            etiqueta="Tareas fuera de plazo"
            valor={t.tareasFueraSla}
            intencion={t.tareasFueraSla ? "peligro" : "neutral"}
            detalle="Trabajo atrasado según el SLA"
            periodo="a hoy"
            accion="Abrir tareas"
            onClick={() => irASeccion("tareas")}
          />
          <Tarjeta
            etiqueta="Aprobaciones pendientes"
            valor={t.aprobacionesPendientes}
            intencion={t.aprobacionesPendientes ? "aviso" : "neutral"}
            detalle="Esperan firma"
            accion="Abrir aprobaciones"
            onClick={() => irASeccion("aprobaciones")}
          />
          <Tarjeta
            etiqueta="Observados"
            valor={t.observados}
            intencion={t.observados ? "aviso" : "neutral"}
            detalle="Con observación abierta"
            accion="Ver expedientes"
            onClick={() => verConFiltro({ conObservados: true })}
          />
          <Tarjeta
            etiqueta="No entregados"
            valor={t.noEntregados}
            intencion={t.noEntregados ? "aviso" : "neutral"}
            detalle="Requisitos rechazados o ausentes"
            accion="Ver expedientes"
            onClick={() => verConFiltro({ conNoEntregados: true })}
          />
          <Tarjeta
            etiqueta="Pendientes"
            valor={t.pendientes}
            intencion="info"
            detalle="Requisitos por recibir"
            accion="Ver expedientes"
            onClick={() => verConFiltro({ conPendientes: true })}
          />
          <Tarjeta
            etiqueta="Prórrogas vigentes"
            valor={t.prorrogasVigentes}
            intencion="info"
            detalle="Con plazo concedido en curso"
            accion="Ver expedientes"
            onClick={() => verConFiltro({ conProrrogas: true })}
          />
        </div>
      </section>

      {/* ── Bandeja priorizada ─────────────────────────────────────── */}
      <BandejaAtencion
        expedientes={atencion.datos?.expedientes ?? []}
        cargando={atencion.cargando && !atencion.datos}
        error={atencion.error}
        onAbrir={(id) => onAbrirExpediente?.(id)}
        onRecargar={atencion.recargar}
        onVerTodo={() => {
          ponerFiltros({ orden: "critica", direccion: "asc", pagina: 1 });
          irASeccion("expedientes");
        }}
      />

      {/* ── Estado del conjunto ────────────────────────────────────── */}
      <section aria-labelledby="doc-panel-conjunto" className="space-y-2">
        <h3 id="doc-panel-conjunto" className="text-sm font-semibold text-[color:var(--doc-text)]">
          Estado del conjunto
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tarjeta
            etiqueta="Expedientes activos"
            valor={t.activos}
            intencion="neutral"
            detalle="Sin archivar"
            accion="Ver todos"
            onClick={() => verConFiltro({})}
          />
          <Tarjeta
            etiqueta="Completos"
            valor={t.completos}
            intencion="exito"
            detalle="Todo lo exigible entregado"
            accion="Filtrar"
            onClick={() => verConFiltro({ estado: "COMPLETO" })}
          />
          <Tarjeta
            etiqueta="Aprobados"
            valor={t.aprobados}
            intencion="exito"
            detalle="Con firma registrada"
            accion="Filtrar"
            onClick={() => verConFiltro({ estado: "APROBADO" })}
          />
          <Tarjeta
            etiqueta="Incompletos"
            valor={t.incompletos}
            intencion="aviso"
            detalle="Faltan requisitos obligatorios"
            accion="Filtrar"
            onClick={() => verConFiltro({ estado: "INCOMPLETO" })}
          />
        </div>
      </section>

      {/* ── Actividad y salud ─────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ActividadReciente
          notificaciones={actividad.datos?.notificaciones ?? []}
          cargando={actividad.cargando && !actividad.datos}
          onAbrirExpediente={(id) => onAbrirExpediente?.(id)}
          onVerTodo={() => irASeccion("notificaciones")}
        />
        <SaludDelSistema
          conexion={conexion}
          estado={estado}
          ultimaSincronizacion={ultimaSincronizacion}
          generado={datos.generado}
          desdeCache={datos.desdeCache}
          onDiagnostico={capacidades.diagnosticar ? () => irASeccion("configuracion") : undefined}
          onConfiguracion={() => irASeccion("configuracion")}
        />
      </div>

      {/* ── Nivel 3 · el conjunto en detalle ──────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel titulo="Completitud por agencia" descripcion="Expedientes y avance promedio de cada oficina.">
          <Barras datos={datos.completitudPorAgencia} etiquetaValor={(item) => `${item.expedientes} · ${item.avancePromedio}%`} />
        </Panel>
        <Panel titulo="Completitud por gerencia" descripcion="Mismo cálculo, agrupado por gerencia.">
          <Barras datos={datos.completitudPorGerencia} etiquetaValor={(item) => `${item.expedientes} · ${item.avancePromedio}%`} />
        </Panel>
        <Panel titulo="Embudo documental" descripcion="De lo exigido, cuánto llegó, se revisó y se aprobó.">
          <Embudo embudo={datos.embudo} />
          {datos.tiempoRevisionHoras !== null && (
            <p className="doc-prose mt-3 text-[11px] text-[color:var(--doc-text-faint)]">
              Tiempo medio hasta la decisión de revisión: {datos.tiempoRevisionHoras} h ({datos.revisionesMedidas} medidas).
            </p>
          )}
        </Panel>
        <Panel titulo="Distribución por estado" descripcion="Cuántos expedientes hay en cada punto del ciclo.">
          {datos.distribucionEstados.length ? (
            <ul className="space-y-1">
              {datos.distribucionEstados.map((item) => (
                <li key={item.clave}>
                  <button
                    type="button"
                    className="doc-tap flex w-full items-center justify-between gap-2 rounded-[var(--doc-radius-sm)] px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--doc-surface)]"
                    onClick={() => verConFiltro({ estado: item.clave })}
                    title={`Filtrar la lista por ${ETIQUETA_EXPEDIENTE[item.clave as EstadoExpediente] ?? item.clave}`}
                  >
                    <span className="text-[color:var(--doc-text)]">
                      {ETIQUETA_EXPEDIENTE[item.clave as EstadoExpediente] ?? item.clave}
                    </span>
                    <span className="doc-metric font-semibold text-[color:var(--doc-text-muted)]">{item.total}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <DocVacio compacto icono="datos" titulo="Sin expedientes registrados" detalle="La distribución aparece con el primer expediente." />
          )}
        </Panel>
        <Panel titulo="Requisitos con más «no entregado»" descripcion="Dónde se atasca el proceso, por documento.">
          {datos.requisitosNoEntregados.length ? (
            <ol className="space-y-1.5">
              {datos.requisitosNoEntregados.map((item) => (
                <li key={item.codigo} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[color:var(--doc-text)]" title={item.nombre}>
                    {item.nombre}
                  </span>
                  <span className="doc-metric shrink-0 font-semibold" style={{ color: TONO.peligro.texto }}>
                    {item.total}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <DocVacio compacto icono="documento" titulo="Ninguno" detalle="No hay requisitos marcados como no entregados." />
          )}
        </Panel>
        <Panel titulo="Requisitos con más observaciones" descripcion="Qué documentos vuelven una y otra vez.">
          {datos.requisitosObservados.length ? (
            <ol className="space-y-1.5">
              {datos.requisitosObservados.map((item) => (
                <li key={item.codigo} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-[color:var(--doc-text)]" title={item.nombre}>
                    {item.nombre}
                  </span>
                  <span className="doc-metric shrink-0 font-semibold" style={{ color: TONO.aviso.texto }}>
                    {item.total}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <DocVacio compacto icono="documento" titulo="Ninguno" detalle="No hay observaciones abiertas." />
          )}
        </Panel>
        <Panel
          titulo="Evolución mensual"
          descripcion="Ingresos registrados por mes y cuántos quedaron completos."
          className="lg:col-span-2"
        >
          {datos.evolucionMensual.length ? (
            <>
              <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
                {datos.evolucionMensual.map((mes) => {
                  const maximo = Math.max(...datos.evolucionMensual.map((m) => m.expedientes), 1);
                  const alto = Math.max(4, Math.round((mes.expedientes / maximo) * 96));
                  const altoCompletos = Math.round((mes.completos / maximo) * 96);
                  return (
                    <div key={mes.mes} className="flex w-10 shrink-0 flex-col items-center gap-1">
                      <div
                        className="relative h-24 w-6 overflow-hidden rounded-md"
                        style={{ background: "var(--doc-surface-sunken)" }}
                        title={`${mes.expedientes} expediente(s), ${mes.completos} completo(s)`}
                      >
                        <div className="absolute bottom-0 w-full" style={{ height: `${alto}px`, background: "var(--doc-info)", opacity: 0.55 }} />
                        <div className="absolute bottom-0 w-full" style={{ height: `${altoCompletos}px`, background: "var(--doc-success)" }} />
                      </div>
                      <span className="doc-metric text-[10px] text-[color:var(--doc-text-faint)]">{mes.mes.slice(2)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Leyenda: dos colores en un gráfico sin leyenda son dos colores. */}
              <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--doc-text-faint)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: "var(--doc-info)", opacity: 0.55 }} aria-hidden /> ingresos del mes
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ background: "var(--doc-success)" }} aria-hidden /> de ellos, completos
                </span>
              </p>
            </>
          ) : (
            <DocVacio
              compacto
              icono="historial"
              titulo="Sin histórico"
              detalle="Aún no hay ingresos con fecha para dibujar la evolución."
              siguientePaso="La fecha de ingreso del expediente es la que alimenta esta serie."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
