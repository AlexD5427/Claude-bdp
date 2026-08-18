/**
 * Cabecera del expediente.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 * La cabecera anterior era una rejilla de siete datos con el mismo peso: agencia,
 * gerencia, ingreso, antigüedad, responsable, próxima fecha crítica y última
 * actualización, todos en `text-xs`. Ninguno destacaba, y el dato que de verdad
 * decide qué hacer —qué falta para cerrar este expediente— no estaba: había que
 * deducirlo de seis contadores en la esquina.
 *
 * Aquí la cabecera tiene tres franjas con una jerarquía deliberada:
 *
 * 1. **Identidad**: nombre completo (sin recortar), identificador, rama y estado.
 * 2. **Situación**: avance, qué falta, qué plazo hay y qué desbloquea el
 *    expediente. Es la franja que se lee de un vistazo.
 * 3. **Trazabilidad y acciones**: quién lo tocó por última vez y cuándo, si hay
 *    cambios sin guardar, y los botones que el rol permite.
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 * No calcula estados de negocio: el avance, los totales y el resumen textual
 * vienen del backend. Lo único que se decide aquí es cómo se ordenan y qué frase
 * los acompaña.
 */

import type { ReactNode } from "react";
import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, User } from "lucide-react";
import type { ExpedienteOperativo } from "../api/acciones";
import { fechaCorta, fechaHora, textoAntiguedad, textoPlazo } from "../domain/progreso";
import { ETIQUETA_EXPEDIENTE, INTENCION_EXPEDIENTE } from "../domain/vocabulario";
import { categoriaDe, estiloCategoria } from "../domain/categorias";
import { BarraAvance, ChipEstado, TONO } from "./piezas";
import { Cifra } from "./DocTexto";
import { IndicadorGuardado, hace, type EstadoEscritura } from "./DocSyncIndicator";

export function DocExpedienteHeader({
  datos,
  cambiosPendientes,
  estadoEscritura,
  acciones,
  onIrAlSiguiente,
}: {
  datos: ExpedienteOperativo;
  cambiosPendientes: number;
  estadoEscritura: EstadoEscritura;
  acciones?: ReactNode;
  onIrAlSiguiente?: (expedienteDocumentoId: string) => void;
}) {
  const cabecera = datos.expediente;
  const t = cabecera.totales;
  const faltan = t.pendientes + t.noEntregados;
  const dias = cabecera.diasParaFechaCritica;
  const siguiente = datos.siguientePendiente
    ? datos.requisitos.find((r) => r.expedienteDocumentoId === datos.siguientePendiente?.expedienteDocumentoId)
    : null;

  const alertas: { intencion: "peligro" | "aviso"; texto: string }[] = [];
  if (t.prorrogasVencidas > 0) {
    alertas.push({ intencion: "peligro", texto: `${t.prorrogasVencidas} prórroga(s) vencida(s)` });
  }
  if (dias !== null && dias < 0) alertas.push({ intencion: "peligro", texto: `Plazo vencido hace ${Math.abs(dias)} día(s)` });
  if (t.observados > 0) alertas.push({ intencion: "aviso", texto: `${t.observados} requisito(s) observado(s)` });
  if (t.noEntregados > 0) alertas.push({ intencion: "aviso", texto: `${t.noEntregados} requisito(s) no entregado(s)` });

  const categoria = categoriaDe(cabecera.tipoFuncionario);
  const IconoCategoria = categoria.Icono;

  return (
    <section className="doc-raised doc-print-keep overflow-hidden" style={estiloCategoria(cabecera.tipoFuncionario)}>
      {/* Franja de color de la categoría: identifica el expediente de un vistazo. */}
      <div className="h-1.5 w-full" style={{ background: "var(--cat-color)" }} aria-hidden />

      {/* ── 1 · Identidad ───────────────────────────────────────────── */}
      <div className="border-b border-[color:var(--doc-border)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="doc-eyebrow">Situación del expediente</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* Distintivo de categoría: ícono SVG + color propio de la rama. */}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--cat-tinte)", color: "var(--cat-color)", boxShadow: "inset 0 0 0 1px var(--cat-borde)" }}
                title={categoria.descripcion}
              >
                <IconoCategoria className="h-3.5 w-3.5" />
                {categoria.etiquetaCorta}
              </span>
              <ChipEstado
                estado={cabecera.estado}
                etiqueta={ETIQUETA_EXPEDIENTE[cabecera.estado] ?? cabecera.estado}
                intencion={INTENCION_EXPEDIENTE[cabecera.estado] ?? "neutral"}
                prorroga={cabecera.estado === "CON_PRORROGA"}
                titulo="Estado del expediente, calculado por el backend a partir de sus requisitos"
              />
              {cabecera.tipoGarantia !== "NINGUNA" && (
                <span className="text-[11px] text-[color:var(--doc-text-muted)]">· {cabecera.tipoGarantiaEtiqueta}</span>
              )}
            </div>
          </div>

          <div className="w-full max-w-[15rem] shrink-0">
            <BarraAvance valor={cabecera.porcentaje} etiqueta={`Avance del expediente de ${cabecera.nombre}`} />
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <Par etiqueta="Entregados" valor={t.entregados} />
              <Par etiqueta="Pendientes" valor={t.pendientes} intencion={t.pendientes ? "aviso" : undefined} />
              <Par etiqueta="No entregados" valor={t.noEntregados} intencion={t.noEntregados ? "peligro" : undefined} />
              <Par etiqueta="No aplica" valor={t.noAplica} />
              <Par etiqueta="Observados" valor={t.observados} intencion={t.observados ? "aviso" : undefined} />
              <Par etiqueta="Prórrogas" valor={t.prorrogas} />
            </dl>
          </div>
        </div>
      </div>

      {/* ── 2 · Situación ───────────────────────────────────────────── */}
      <div className="grid gap-3 border-b border-[color:var(--doc-border)] p-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <p className="doc-eyebrow">Qué desbloquea este expediente</p>
          {siguiente ? (
            <div className="doc-sunken flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="min-w-0">
                {/* Nombre y motivo van en una sola línea: son una sola idea —«este
                    documento, por esto»— y separarlos en dos párrafos obliga a
                    leer dos veces. */}
                <p className="doc-prose doc-wrap-name text-xs font-semibold text-[color:var(--doc-text)]">
                  {siguiente.nombre} ·{" "}
                  <span className="font-normal text-[color:var(--doc-text-muted)]">
                    {datos.siguientePendiente?.motivo === "observado"
                      ? "tiene una observación abierta que hay que corregir"
                      : "pendiente de entrega"}
                  </span>
                </p>
              </div>
              {onIrAlSiguiente && (
                <button
                  type="button"
                  onClick={() => onIrAlSiguiente(siguiente.expedienteDocumentoId)}
                  className="doc-tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: "var(--doc-info-bg)", color: "var(--doc-info-fg)" }}
                >
                  Ir al requisito
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
          ) : (
            <p className="doc-prose text-xs" style={{ color: TONO.exito.texto }}>
              {faltan === 0 && t.observados === 0
                ? "No queda nada pendiente ni observado: el expediente está listo para su revisión final."
                : "El backend no señaló un siguiente requisito."}
            </p>
          )}

          {alertas.length > 0 && (
            <ul className="space-y-1">
              {alertas.map((alerta) => (
                <li key={alerta.texto} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: TONO[alerta.intencion].texto }}>
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  {alerta.texto}
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Dato
            etiqueta="Cargo"
            valor={cabecera.cargo || "No registrado"}
            icono={<Briefcase className="h-3 w-3" aria-hidden />}
          />
          <Dato etiqueta="Agencia" valor={cabecera.agencia || "No registrada"} />
          <Dato etiqueta="Gerencia" valor={cabecera.gerencia || "No registrada"} />
          <Dato etiqueta="Ingreso" valor={fechaCorta(cabecera.fechaIngreso)} pista={textoAntiguedad(cabecera.diasDesdeIngreso)} icono={<CalendarClock className="h-3 w-3" aria-hidden />} />
          <Dato
            etiqueta="Próximo plazo"
            valor={cabecera.proximaFechaCritica ? fechaCorta(cabecera.proximaFechaCritica) : "Sin plazo"}
            pista={cabecera.proximaFechaCritica ? textoPlazo(cabecera.proximaFechaCritica) : "Ningún requisito tiene fecha límite registrada"}
            intencion={dias !== null && dias < 0 ? "peligro" : dias !== null && dias <= 3 ? "aviso" : undefined}
            icono={<CalendarClock className="h-3 w-3" aria-hidden />}
          />
          <Dato
            etiqueta="Responsable"
            valor={cabecera.responsableId || "Sin asignar"}
            icono={<User className="h-3 w-3" aria-hidden />}
          />
        </dl>
      </div>

      {/* ── 3 · Trazabilidad y acciones ────────────────────────────── */}
      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[color:var(--doc-text-faint)]">
          <span>
            Última modificación {hace(cabecera.actualizadoEn)} · {fechaHora(cabecera.actualizadoEn)}
            {cabecera.actualizadoPor ? ` por ${cabecera.actualizadoPor}` : ""}
          </span>
          <span className="doc-metric" title="Versión del registro: el backend la usa para detectar escrituras simultáneas">
            versión {cabecera.version}
          </span>
          {/* El detalle dice «por escribir» y no «sin guardar»: el pie del panel
              ya usa esa frase con el botón de guardar, y repetir el mismo texto en
              dos sitios hace dudar de si son dos avisos distintos. */}
          <IndicadorGuardado
            estado={estadoEscritura}
            detalle={cambiosPendientes ? `${cambiosPendientes} cambio(s) por escribir en el libro` : undefined}
          />
        </div>

        <p className="doc-prose doc-sunken p-3 text-xs leading-relaxed text-[color:var(--doc-text-muted)]">{datos.resumenTextual}</p>

        {acciones && <div className="doc-no-print flex flex-wrap gap-2">{acciones}</div>}
      </div>
    </section>
  );
}

function Par({ etiqueta, valor, intencion }: { etiqueta: string; valor: number; intencion?: "aviso" | "peligro" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-[color:var(--doc-text-faint)]">{etiqueta}</dt>
      <dd className="doc-metric font-semibold" style={{ color: intencion ? TONO[intencion].texto : "var(--doc-text-muted)" }}>
        {/* El valor se interpola en lugar de saltar: al marcar un requisito se ve
            de dónde a dónde se movió el contador. */}
        <Cifra valor={valor} />
      </dd>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  pista,
  intencion,
  icono,
}: {
  etiqueta: string;
  valor: string;
  pista?: string;
  intencion?: "aviso" | "peligro";
  icono?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="doc-eyebrow flex items-center gap-1">
        {icono}
        {etiqueta}
      </dt>
      <dd className="doc-prose font-medium" style={{ color: intencion ? TONO[intencion].texto : "var(--doc-text)" }} title={pista ?? valor}>
        {valor}
        {pista && <span className="block text-[11px] font-normal text-[color:var(--doc-text-faint)]">{pista}</span>}
      </dd>
    </div>
  );
}
