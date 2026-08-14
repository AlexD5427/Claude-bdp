/**
 * Panel operativo.
 *
 * ── Qué se responde aquí ────────────────────────────────────────────────────
 * Tres preguntas, en este orden: ¿qué está en riesgo hoy?, ¿cómo va el proceso en
 * conjunto?, ¿dónde se está atascando? Las tarjetas responden la primera, los
 * agregados por agencia y gerencia la segunda, y el embudo con los rankings de
 * requisitos la tercera.
 *
 * Todos los números vienen agregados del backend. Ninguno se calcula aquí, y
 * ninguno es decorativo: cada tarjeta es un filtro. Al pulsarla se abre la lista de
 * expedientes ya filtrada, que es lo que convierte un panel en una herramienta.
 */

import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { docApi, type PanelDatos } from "../api/acciones";
import { ETIQUETA_EXPEDIENTE, type EstadoExpediente } from "../domain/vocabulario";
import { fechaHora } from "../domain/progreso";
import { irASeccion, ponerFiltros, useConsola } from "../state/consola";
import { Aviso, Boton, Panel, Tarjeta, usarMovimientoReducido, Cargando, Vacio } from "./piezas";
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
  if (!datos.length) return <Vacio titulo="Sin datos todavía" detalle="Cuando haya expedientes registrados, aquí aparece el desglose." />;
  const maximo = Math.max(...datos.map((d) => d.expedientes), 1);

  return (
    <ul className="space-y-2">
      {datos.map((item) => (
        <li key={item.clave}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink" title={item.clave}>
              {item.clave}
            </span>
            <span className="shrink-0 tabular-nums text-ink-soft">{etiquetaValor(item)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--fill-2)]">
            <motion.div
              className="h-full rounded-full bg-cyan-400/80"
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
    { etiqueta: "Requisitos exigidos", valor: embudo.total - embudo.noAplica },
    { etiqueta: "Entregados", valor: embudo.entregados },
    { etiqueta: "En revisión", valor: embudo.enRevision },
    { etiqueta: "Aprobados", valor: embudo.aprobados },
  ];
  const base = Math.max(pasos[0].valor, 1);
  return (
    <ol className="space-y-2">
      {pasos.map((paso) => {
        const porcentaje = Math.round((paso.valor / base) * 100);
        return (
          <li key={paso.etiqueta}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink">{paso.etiqueta}</span>
              <span className="tabular-nums text-ink-soft">
                {paso.valor} · {porcentaje}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[color:var(--fill-2)]">
              <div className="h-full rounded-full bg-indigo-400/70 transition-[width] duration-500" style={{ width: `${porcentaje}%` }} />
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-[11px] text-ink-faint">
        {embudo.observados} observado(s) · {embudo.noEntregados} no entregado(s) · {embudo.pendientes} pendiente(s) ·{" "}
        {embudo.noAplica} no aplica
      </li>
    </ol>
  );
}

export function SeccionPanel() {
  const { conexion } = useConsola();
  const { datos, cargando, error, recargar } = useDatos<PanelDatos>(() => docApi.panel(), [], {
    activo: conexion === "conectado",
  });

  /** Abre la lista de expedientes con el filtro que representa la tarjeta. */
  function verConFiltro(filtros: Record<string, unknown>) {
    ponerFiltros({ ...filtros, pagina: 1 });
    irASeccion("expedientes");
  }

  if (error) {
    return (
      <Aviso intencion="peligro" titulo="No se pudo cargar el panel" accion={<Boton onClick={recargar}>Reintentar</Boton>}>
        {error.mensaje} {error.pista}
      </Aviso>
    );
  }
  if (cargando && !datos) return <Cargando texto="Calculando indicadores…" />;
  if (!datos) return null;

  const t = datos.tarjetas;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          {datos.expedientes} expediente(s) · avance promedio {datos.avancePromedio}% · generado {fechaHora(datos.generado)}
          {datos.desdeCache && " · desde caché"}
        </p>
        <Boton variante="suave" onClick={recargar} cargando={cargando} titulo="Recalcular indicadores">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
      </div>

      {/* Lo urgente primero: lo que alguien tiene que atender hoy. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Tarjeta
          etiqueta="Prórrogas vencidas"
          valor={t.prorrogasVencidas}
          intencion={t.prorrogasVencidas ? "peligro" : "neutral"}
          detalle="Plazo agotado"
          onClick={() => verConFiltro({ conProrrogasVencidas: true })}
        />
        <Tarjeta
          etiqueta="Solicitudes vencidas"
          valor={t.solicitudesVencidas}
          intencion={t.solicitudesVencidas ? "peligro" : "neutral"}
          detalle="Sin respuesta a tiempo"
          onClick={() => verConFiltro({ conSolicitudesVencidas: true })}
        />
        <Tarjeta
          etiqueta="Tareas fuera de plazo"
          valor={t.tareasFueraSla}
          intencion={t.tareasFueraSla ? "peligro" : "neutral"}
          detalle="Trabajo atrasado"
          onClick={() => irASeccion("tareas")}
        />
        <Tarjeta
          etiqueta="Aprobaciones pendientes"
          valor={t.aprobacionesPendientes}
          intencion={t.aprobacionesPendientes ? "aviso" : "neutral"}
          detalle="Esperan firma"
          onClick={() => irASeccion("aprobaciones")}
        />
        <Tarjeta
          etiqueta="Observados"
          valor={t.observados}
          intencion={t.observados ? "aviso" : "neutral"}
          detalle="Con observación abierta"
          onClick={() => verConFiltro({ conObservados: true })}
        />
        <Tarjeta
          etiqueta="No entregados"
          valor={t.noEntregados}
          intencion={t.noEntregados ? "aviso" : "neutral"}
          detalle="Requisitos rechazados o ausentes"
          onClick={() => verConFiltro({ conNoEntregados: true })}
        />
        <Tarjeta
          etiqueta="Pendientes"
          valor={t.pendientes}
          intencion="info"
          detalle="Requisitos por recibir"
          onClick={() => verConFiltro({ conPendientes: true })}
        />
        <Tarjeta
          etiqueta="Prórrogas vigentes"
          valor={t.prorrogasVigentes}
          intencion="info"
          detalle="Con plazo concedido"
          onClick={() => verConFiltro({ conProrrogas: true })}
        />
      </div>

      {/* El estado del conjunto. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta etiqueta="Expedientes activos" valor={t.activos} intencion="neutral" onClick={() => verConFiltro({})} />
        <Tarjeta etiqueta="Completos" valor={t.completos} intencion="exito" onClick={() => verConFiltro({ estado: "COMPLETO" })} />
        <Tarjeta etiqueta="Aprobados" valor={t.aprobados} intencion="exito" onClick={() => verConFiltro({ estado: "APROBADO" })} />
        <Tarjeta etiqueta="Incompletos" valor={t.incompletos} intencion="aviso" onClick={() => verConFiltro({ estado: "INCOMPLETO" })} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel titulo="Completitud por agencia" descripcion="Expedientes y avance promedio de cada oficina.">
          <Barras
            datos={datos.completitudPorAgencia}
            etiquetaValor={(item) => `${item.expedientes} · ${item.avancePromedio}%`}
          />
        </Panel>
        <Panel titulo="Completitud por gerencia" descripcion="Mismo cálculo, agrupado por gerencia.">
          <Barras
            datos={datos.completitudPorGerencia}
            etiquetaValor={(item) => `${item.expedientes} · ${item.avancePromedio}%`}
          />
        </Panel>
        <Panel titulo="Embudo documental" descripcion="De lo exigido, cuánto llegó, se revisó y se aprobó.">
          <Embudo embudo={datos.embudo} />
          {datos.tiempoRevisionHoras !== null && (
            <p className="mt-3 text-[11px] text-ink-faint">
              Tiempo medio hasta la decisión de revisión: {datos.tiempoRevisionHoras} h ({datos.revisionesMedidas} medidas).
            </p>
          )}
        </Panel>
        <Panel titulo="Distribución por estado" descripcion="Cuántos expedientes hay en cada punto del ciclo.">
          <ul className="space-y-1.5">
            {datos.distribucionEstados.map((item) => (
              <li key={item.clave} className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="text-ink underline-offset-2 hover:underline"
                  onClick={() => verConFiltro({ estado: item.clave })}
                >
                  {ETIQUETA_EXPEDIENTE[item.clave as EstadoExpediente] ?? item.clave}
                </button>
                <span className="tabular-nums text-ink-soft">{item.total}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel titulo="Requisitos con más «no entregado»" descripcion="Dónde se atasca el proceso, por documento.">
          {datos.requisitosNoEntregados.length ? (
            <ol className="space-y-1.5">
              {datos.requisitosNoEntregados.map((item) => (
                <li key={item.codigo} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink" title={item.nombre}>
                    {item.nombre}
                  </span>
                  <span className="shrink-0 tabular-nums text-rose-300">{item.total}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Vacio titulo="Ninguno" detalle="No hay requisitos marcados como no entregados." />
          )}
        </Panel>
        <Panel titulo="Requisitos con más observaciones" descripcion="Qué documentos vuelven una y otra vez.">
          {datos.requisitosObservados.length ? (
            <ol className="space-y-1.5">
              {datos.requisitosObservados.map((item) => (
                <li key={item.codigo} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink" title={item.nombre}>
                    {item.nombre}
                  </span>
                  <span className="shrink-0 tabular-nums text-amber-300">{item.total}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Vacio titulo="Ninguno" detalle="No hay observaciones abiertas." />
          )}
        </Panel>
        <Panel
          titulo="Evolución mensual"
          descripcion="Ingresos registrados por mes y cuántos quedaron completos."
          className="lg:col-span-2"
        >
          {datos.evolucionMensual.length ? (
            <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
              {datos.evolucionMensual.map((mes) => {
                const maximo = Math.max(...datos.evolucionMensual.map((m) => m.expedientes), 1);
                const alto = Math.max(4, Math.round((mes.expedientes / maximo) * 96));
                const altoCompletos = Math.round((mes.completos / maximo) * 96);
                return (
                  <div key={mes.mes} className="flex w-10 shrink-0 flex-col items-center gap-1">
                    <div className="relative h-24 w-6 overflow-hidden rounded-md bg-[color:var(--fill-2)]" title={`${mes.expedientes} expediente(s), ${mes.completos} completo(s)`}>
                      <div className="absolute bottom-0 w-full bg-cyan-400/50" style={{ height: `${alto}px` }} />
                      <div className="absolute bottom-0 w-full bg-emerald-400/70" style={{ height: `${altoCompletos}px` }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-ink-faint">{mes.mes.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Vacio titulo="Sin histórico" detalle="Aún no hay ingresos con fecha para dibujar la evolución." />
          )}
        </Panel>
      </div>
    </div>
  );
}
