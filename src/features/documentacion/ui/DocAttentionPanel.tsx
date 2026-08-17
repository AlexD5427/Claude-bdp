/**
 * Bandeja de atención, salud del sistema y actividad.
 *
 * ── Qué pregunta responde esta pieza ────────────────────────────────────────
 * «¿Qué tengo que hacer ahora?». El panel anterior respondía a otra: «¿cuántas
 * cosas hay?». Dieciséis cifras agregadas dicen el tamaño del problema, no por
 * dónde empezar, y para empezar hacía falta ir a la lista, ordenar por fecha
 * crítica y leer.
 *
 * ── De dónde salen los datos ───────────────────────────────────────────────
 * De la misma acción que usa la lista de expedientes (`documentacion.expedientes
 * .listar`), pedida con el orden por fecha crítica y una página corta. No hay
 * ningún endpoint nuevo, ningún cálculo de negocio nuevo y ningún dato que el
 * backend no haya entregado: la severidad se deduce de los totales que el propio
 * expediente trae —prórrogas vencidas, observados, no entregados, días para la
 * fecha crítica— y es una decisión de presentación, no de dominio.
 *
 * ── Honestidad ─────────────────────────────────────────────────────────────
 * Si la consulta falla, se dice. Si no hay nada urgente, se dice que no hay nada
 * urgente —y eso también es información útil—. Nunca se rellena la bandeja con
 * expedientes cualesquiera para que parezca que hay trabajo.
 */

import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, FileWarning, Wrench } from "lucide-react";
import type { EstadoModulo, NotificacionVista } from "../api/acciones";
import type { ExpedienteCabecera } from "../domain/progreso";
import { fechaCorta, fechaHora, textoPlazo } from "../domain/progreso";
import { ETIQUETA_EXPEDIENTE, INTENCION_EXPEDIENTE, type Intencion } from "../domain/vocabulario";
import type { EstadoConexion } from "../state/consola";
import { Boton, ChipEstado, Panel, TextoCompleto, TONO } from "./piezas";
import { DocError, DocVacio, type ErrorNormalizado } from "./DocStates";
import { EsqueletoBandeja, EsqueletoLineas } from "./DocSkeletons";
import { hace, presentacionDeConexion } from "./DocSyncIndicator";

/* ------------------------------------------------------------------ */
/* Severidad                                                           */
/* ------------------------------------------------------------------ */

export interface Incidencia {
  severidad: "critica" | "atencion" | "seguimiento" | "al_dia";
  intencion: Intencion;
  /** Qué le pasa, en una línea: «2 prórrogas vencidas». */
  tipo: string;
  /** Qué desbloquea el expediente. */
  siguientePaso: string;
}

/**
 * Clasifica un expediente por lo que le pasa.
 *
 * El orden de las comprobaciones es el orden de la urgencia real del área: un
 * plazo agotado manda sobre una observación, y una observación manda sobre un
 * requisito que simplemente no ha llegado todavía.
 */
export function incidenciaDe(expediente: ExpedienteCabecera): Incidencia {
  const t = expediente.totales;
  const dias = expediente.diasParaFechaCritica;

  if (t.prorrogasVencidas > 0) {
    return {
      severidad: "critica",
      intencion: "peligro",
      tipo: `${t.prorrogasVencidas} prórroga${t.prorrogasVencidas === 1 ? "" : "s"} vencida${t.prorrogasVencidas === 1 ? "" : "s"}`,
      siguientePaso: "Reclamar el requisito o registrar el incumplimiento.",
    };
  }
  if (dias !== null && dias < 0) {
    return {
      severidad: "critica",
      intencion: "peligro",
      tipo: `Plazo vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`,
      siguientePaso: "Revisar el plazo: conceder prórroga o escalar.",
    };
  }
  if (t.observados > 0) {
    return {
      severidad: "atencion",
      intencion: "aviso",
      tipo: `${t.observados} requisito${t.observados === 1 ? "" : "s"} observado${t.observados === 1 ? "" : "s"}`,
      siguientePaso: "La corrección desbloquea el expediente.",
    };
  }
  if (t.noEntregados > 0) {
    return {
      severidad: "atencion",
      intencion: "aviso",
      tipo: `${t.noEntregados} no entregado${t.noEntregados === 1 ? "" : "s"}`,
      siguientePaso: "Solicitar la documentación que falta.",
    };
  }
  if (dias !== null && dias <= 3) {
    return {
      severidad: "atencion",
      intencion: "aviso",
      tipo: textoPlazo(expediente.proximaFechaCritica),
      siguientePaso: "Confirmar la entrega antes del plazo.",
    };
  }
  if (t.pendientes > 0) {
    return {
      severidad: "seguimiento",
      intencion: "info",
      tipo: `${t.pendientes} pendiente${t.pendientes === 1 ? "" : "s"} de recibir`,
      siguientePaso: "Seguimiento normal: aún hay plazo.",
    };
  }
  return {
    severidad: "al_dia",
    intencion: "exito",
    tipo: "Sin nada pendiente",
    siguientePaso: "Listo para revisión o aprobación.",
  };
}

const PESO: Record<Incidencia["severidad"], number> = { critica: 0, atencion: 1, seguimiento: 2, al_dia: 3 };

/** Ordena por urgencia y, dentro de la misma urgencia, por plazo más cercano. */
export function porUrgencia(a: ExpedienteCabecera, b: ExpedienteCabecera): number {
  const diferencia = PESO[incidenciaDe(a).severidad] - PESO[incidenciaDe(b).severidad];
  if (diferencia !== 0) return diferencia;
  const da = a.diasParaFechaCritica ?? 9999;
  const db = b.diasParaFechaCritica ?? 9999;
  return da - db;
}

/* ------------------------------------------------------------------ */
/* Bandeja                                                             */
/* ------------------------------------------------------------------ */

export function BandejaAtencion({
  expedientes,
  cargando,
  error,
  onAbrir,
  onRecargar,
  onVerTodo,
}: {
  expedientes: ExpedienteCabecera[];
  cargando: boolean;
  error?: ErrorNormalizado | null;
  onAbrir: (expedienteId: string) => void;
  onRecargar: () => void;
  onVerTodo: () => void;
}) {
  const ordenados = [...expedientes].sort(porUrgencia);

  return (
    <Panel
      titulo="Requiere atención"
      descripcion="Lo más urgente primero, con el plazo y quién lo persigue."
      acciones={
        <Boton variante="fantasma" onClick={onVerTodo}>
          Ver la lista completa
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Boton>
      }
    >
      {error ? (
        <DocError titulo="No se pudo calcular la bandeja de atención" error={error} onReintentar={onRecargar} />
      ) : cargando ? (
        <>
          <span className="sr-only" role="status">
            Buscando los expedientes que requieren atención…
          </span>
          <EsqueletoBandeja />
        </>
      ) : !ordenados.length ? (
        <DocVacio
          compacto
          icono="carpeta"
          titulo="No hay expedientes en la ventana de atención"
          detalle="Ningún expediente activo tiene plazos vencidos, observaciones ni requisitos sin entregar."
          siguientePaso="Cuando aparezca uno, se listará aquí ordenado por urgencia."
        />
      ) : (
        <ul className="doc-list-long space-y-2">
          {ordenados.map((expediente) => {
            const incidencia = incidenciaDe(expediente);
            const tono = TONO[incidencia.intencion];
            return (
              <li
                key={expediente.expedienteId}
                className="doc-surface doc-print-keep flex flex-wrap items-start gap-3 p-3"
                style={{ borderLeftWidth: 3, borderLeftColor: tono.borde }}
              >
                <span className="mt-0.5 shrink-0" style={{ color: tono.punto }} aria-hidden>
                  {incidencia.severidad === "critica" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : incidencia.severidad === "atencion" ? (
                    <FileWarning className="h-4 w-4" />
                  ) : incidencia.severidad === "al_dia" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextoCompleto texto={expediente.nombre} className="max-w-[16rem] text-sm font-semibold text-[color:var(--doc-text)]" />
                    <ChipEstado
                      compacto
                      estado={expediente.estado}
                      etiqueta={ETIQUETA_EXPEDIENTE[expediente.estado] ?? expediente.estado}
                      intencion={INTENCION_EXPEDIENTE[expediente.estado] ?? "neutral"}
                    />
                  </div>

                  <p className="doc-metric mt-0.5 text-[11px] text-[color:var(--doc-text-faint)]">
                    {expediente.identificador}
                    {expediente.agencia ? ` · ${expediente.agencia}` : ""}
                    {expediente.gerencia ? ` · ${expediente.gerencia}` : ""}
                  </p>

                  <p className="doc-prose mt-1 text-xs font-semibold" style={{ color: tono.texto }}>
                    {incidencia.tipo}
                  </p>
                  <p className="doc-prose text-[11px] text-[color:var(--doc-text-muted)]">{incidencia.siguientePaso}</p>

                  <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[color:var(--doc-text-faint)]">
                    <div className="flex gap-1">
                      <dt>Avance:</dt>
                      <dd className="doc-metric font-semibold text-[color:var(--doc-text-muted)]">{expediente.porcentaje}%</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Responsable:</dt>
                      <dd className="text-[color:var(--doc-text-muted)]">{expediente.responsableId || "sin asignar"}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Plazo:</dt>
                      <dd className="text-[color:var(--doc-text-muted)]">
                        {expediente.proximaFechaCritica ? fechaCorta(expediente.proximaFechaCritica) : "sin plazo registrado"}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Antigüedad:</dt>
                      <dd className="doc-metric text-[color:var(--doc-text-muted)]">
                        {expediente.diasDesdeIngreso === null ? "sin fecha" : `${expediente.diasDesdeIngreso} d`}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="shrink-0">
                  <Boton variante="suave" onClick={() => onAbrir(expediente.expedienteId)} titulo={`Abrir el expediente de ${expediente.nombre}`}>
                    Atender
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Salud del sistema                                                   */
/* ------------------------------------------------------------------ */

/**
 * Salud del módulo.
 *
 * Reúne lo que estaba repartido entre la píldora de la cabecera y la sección de
 * mantenimiento: enlace, libro, esquema, migraciones pendientes y frescura del
 * dato. Es el sitio donde se mira cuando algo va raro, y por eso dice también
 * cuándo NO hay nada que mirar.
 */
export function SaludDelSistema({
  conexion,
  estado,
  ultimaSincronizacion,
  generado,
  desdeCache,
  onDiagnostico,
  onConfiguracion,
}: {
  conexion: EstadoConexion;
  estado: EstadoModulo | null;
  ultimaSincronizacion?: string;
  generado?: string;
  desdeCache?: boolean;
  onDiagnostico?: () => void;
  onConfiguracion?: () => void;
}) {
  const p = presentacionDeConexion(conexion, estado?.libro);
  const pendientes = estado?.migraciones?.pendientes ?? [];
  const faltantes = estado?.hojasFaltantes ?? [];

  // Se dice «en línea» y no «conectado»: la píldora de la cabecera ya dice
  // «Conectado», y dos veces la misma palabra en la misma pantalla se lee como
  // dos cosas distintas.
  const enlace = conexion === "conectado" ? "En línea" : p.texto;

  return (
    <Panel titulo="Salud del módulo" descripcion="Enlace, libro y trabajos de mantenimiento.">
      <dl className="space-y-2 text-xs">
        <Fila etiqueta="Enlace" valor={enlace} intencion={conexion === "conectado" ? "exito" : conexion === "comprobando" ? "info" : "peligro"} />
        <Fila etiqueta="Libro" valor={estado?.libro || "No informado"} />
        <Fila
          etiqueta="Modelo"
          valor={estado ? `Esquema ${estado.esquema} · versión ${estado.version}` : "Sin datos"}
          intencion={estado?.instalado ? "exito" : "aviso"}
        />
        <Fila
          etiqueta="Migraciones pendientes"
          valor={pendientes.length ? pendientes.join(", ") : "Ninguna"}
          intencion={pendientes.length ? "aviso" : "exito"}
        />
        {faltantes.length > 0 && <Fila etiqueta="Hojas faltantes" valor={faltantes.join(", ")} intencion="peligro" />}
        <Fila etiqueta="Última resolución" valor={hace(ultimaSincronizacion)} />
        {generado && (
          <Fila
            etiqueta="Indicadores calculados"
            valor={`${fechaHora(generado)}${desdeCache ? " · servidos desde caché" : ""}`}
            intencion={desdeCache ? "aviso" : "neutral"}
          />
        )}
        <Fila etiqueta="Hora del servidor" valor={estado?.horaServidor ? fechaHora(estado.horaServidor) : "No informada"} />
      </dl>

      {(onDiagnostico || onConfiguracion) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onDiagnostico && (
            <Boton variante="suave" onClick={onDiagnostico}>
              <Wrench className="h-3.5 w-3.5" aria-hidden /> Abrir mantenimiento
            </Boton>
          )}
          {onConfiguracion && (
            <Boton variante="fantasma" onClick={onConfiguracion}>
              Ver configuración
            </Boton>
          )}
        </div>
      )}
    </Panel>
  );
}

function Fila({ etiqueta, valor, intencion = "neutral" }: { etiqueta: string; valor: string; intencion?: Intencion }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--doc-border)] pb-1.5 last:border-0 last:pb-0">
      <dt className="text-[color:var(--doc-text-faint)]">{etiqueta}</dt>
      <dd
        className="doc-prose min-w-0 max-w-[60%] text-right font-medium"
        style={{ color: intencion === "neutral" ? "var(--doc-text-muted)" : TONO[intencion].texto }}
        title={valor}
      >
        {valor}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Actividad reciente                                                  */
/* ------------------------------------------------------------------ */

/**
 * Actividad reciente, tal como la registra el backend.
 *
 * Se muestran las notificaciones del módulo —que son los eventos que el propio
 * backend consideró dignos de aviso— con su fecha, su expediente y si ya se
 * leyeron. No se inventa un feed de cambios: el «antes y después» campo a campo
 * existe en el historial de cada expediente, y allí es donde se consulta.
 */
export function ActividadReciente({
  notificaciones,
  cargando,
  onAbrirExpediente,
  onVerTodo,
}: {
  notificaciones: NotificacionVista[];
  cargando: boolean;
  onAbrirExpediente: (expedienteId: string) => void;
  onVerTodo: () => void;
}) {
  return (
    <Panel
      titulo="Actividad reciente"
      descripcion="Los avisos que el módulo registró, del más nuevo al más antiguo."
      acciones={
        <Boton variante="fantasma" onClick={onVerTodo}>
          Ver todas
        </Boton>
      }
    >
      {cargando ? (
        <EsqueletoLineas filas={4} />
      ) : !notificaciones.length ? (
        <DocVacio compacto icono="historial" titulo="Sin actividad registrada" detalle="Aquí aparecen los avisos del módulo en cuanto se generen." />
      ) : (
        <ol className="space-y-2">
          {notificaciones.slice(0, 6).map((aviso) => (
            <li key={aviso.notificacionId} className="flex items-start gap-2.5 border-b border-[color:var(--doc-border)] pb-2 last:border-0 last:pb-0">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--doc-text-faint)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="doc-prose text-xs font-medium text-[color:var(--doc-text)]">
                  {aviso.titulo || aviso.tipo}
                  {!aviso.leida && (
                    <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--doc-warning-bg)", color: "var(--doc-warning-fg)" }}>
                      sin leer
                    </span>
                  )}
                </p>
                {aviso.mensaje && <p className="doc-prose text-[11px] text-[color:var(--doc-text-muted)]">{aviso.mensaje}</p>}
                <p className="doc-metric mt-0.5 text-[10px] text-[color:var(--doc-text-faint)]">
                  {hace(aviso.fecha)} · {fechaHora(aviso.fecha)}
                </p>
              </div>
              {aviso.expedienteId && (
                <Boton variante="fantasma" onClick={() => onAbrirExpediente(aviso.expedienteId)} titulo="Abrir el expediente del aviso">
                  Abrir
                </Boton>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
