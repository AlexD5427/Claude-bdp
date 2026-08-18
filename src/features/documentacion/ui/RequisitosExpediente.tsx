/**
 * Los requisitos de un expediente, tal como se trabajan.
 *
 * ── Qué problema resuelve esta pantalla ─────────────────────────────────────
 * Un expediente comercial de tipo 2 tiene VEINTISIETE requisitos. La versión
 * anterior los pintaba todos, siempre, en una lista plana con botones neutros: para
 * saber qué faltaba había que recorrerla entera, y el botón del estado elegido se
 * teñía de azul —el color de «información»— tanto si el documento estaba entregado
 * como si no había llegado. El color no decía nada.
 *
 * Aquí hay tres cambios deliberados:
 *
 * 1. **Se busca y se filtra.** Una barra con el recuento por estado permite pasar
 *    de veintisiete a los cuatro que importan ahora. Los filtros son acumulables
 *    con el buscador, y cuando no queda nada se dice por qué.
 * 2. **El color significa.** Los chips de estado usan el mismo idioma que el
 *    asistente de alta y que el libro: verde entregado, ámbar pendiente, rojo no
 *    entregado, gris no aplica. En ese orden, siempre.
 * 3. **Cada requisito cuenta su historia.** Prórroga con cuenta regresiva visual,
 *    observación de revisión, sello de quién lo tocó y cuándo, y el detalle se
 *    abre en el sitio sin sacar a nadie de la lista.
 *
 * ── Qué NO se decide aquí ───────────────────────────────────────────────────
 * Las transiciones permitidas las dicta el vocabulario compartido
 * (`TRANSICIONES_DOCUMENTO`), que es el mismo que valida el backend. Esta pantalla
 * solo pinta los destinos posibles; si el backend cambia, cambian solos.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, CheckCheck, FileText, Filter, Search, ShieldCheck, Timer, X } from "lucide-react";
import type { ExpedienteOperativo } from "../api/acciones";
import {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_REVISION,
  ETIQUETA_SITUACION,
  ESTADOS_DOCUMENTO,
  INTENCION_DOCUMENTO,
  INTENCION_REVISION,
  INTENCION_SITUACION,
  puedeTransitar,
  TRANSICIONES_DOCUMENTO,
  type EstadoDocumento,
} from "../domain/vocabulario";
import { agruparRequisitos, fechaCorta, fechaHora, type RequisitoVista } from "../domain/progreso";
import { categoriaDe, estiloCategoria } from "../domain/categorias";
import { diasDesdeHoy, fechaLegible } from "./CampoFecha";
import { AreaTexto, BarraAvance, Boton, Campo, ChipEstado, TONO } from "./piezas";
import { CURVA, DURACION, useMovimientoReducido } from "./DocMotion";
import { hace } from "./DocSyncIndicator";

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

type FiltroId = "todos" | "faltan" | "observados" | "prorroga" | "entregados";

const FILTROS: { id: FiltroId; etiqueta: string; intencion: keyof typeof TONO }[] = [
  { id: "todos", etiqueta: "Todos", intencion: "neutral" },
  { id: "faltan", etiqueta: "Por conseguir", intencion: "aviso" },
  { id: "observados", etiqueta: "Observados", intencion: "peligro" },
  { id: "prorroga", etiqueta: "En prórroga", intencion: "acento" },
  { id: "entregados", etiqueta: "Entregados", intencion: "exito" },
];

/** Estados en el orden que pidió el área: entregado, pendiente, no entregado. */
const ORDEN_ESTADOS: EstadoDocumento[] = ["ENTREGADO", "PENDIENTE", "NO_ENTREGADO", "NO_APLICA"];

function esObservado(r: RequisitoVista): boolean {
  return r.estadoRevision === "OBSERVADO" || r.estadoRevision === "REQUIERE_CORRECCION" || r.estadoRevision === "RECHAZADO";
}

function prorrogaVigente(r: RequisitoVista) {
  return r.prorrogas.find((p) => p.situacion !== "cerrada");
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------------------------------------------------ */
/* Vista                                                               */
/* ------------------------------------------------------------------ */

export function RequisitosExpediente({
  datos,
  borrador,
  foco,
  puedeEditar,
  puedeRevisar,
  onFoco,
  onBorrador,
  onRevisar,
  onProrrogar,
}: {
  datos: ExpedienteOperativo;
  borrador: Record<string, { estado?: EstadoDocumento; observaciones?: string }>;
  foco: string | null;
  puedeEditar: boolean;
  puedeRevisar: boolean;
  onFoco: (id: string | null) => void;
  onBorrador: (id: string, patch: { estado?: EstadoDocumento; observaciones?: string }) => void;
  onRevisar: (requisito: RequisitoVista) => void;
  onProrrogar: (requisito: RequisitoVista) => void;
}) {
  const reducido = useMovimientoReducido();
  const [filtro, setFiltro] = useState<FiltroId>("todos");
  const [consulta, setConsulta] = useState("");
  const [soloObligatorios, setSoloObligatorios] = useState(false);

  const grupos = useMemo(() => agruparRequisitos(datos.requisitos), [datos.requisitos]);
  const categoria = categoriaDe(datos.expediente.tipoFuncionario);

  const estadoDe = (r: RequisitoVista): EstadoDocumento => borrador[r.expedienteDocumentoId]?.estado ?? r.estado;

  /* Recuentos del encabezado: se calculan sobre el estado EFECTIVO (con los
     cambios sin guardar aplicados), porque si no, marcar un documento no movería
     el contador y parecería que el clic no hizo nada. */
  const recuentos = useMemo(() => {
    const activos = datos.requisitos.filter((r) => !r.archivado);
    const conEstado = activos.map((r) => ({ r, estado: estadoDe(r) }));
    return {
      todos: activos.length,
      faltan: conEstado.filter(({ estado }) => estado === "PENDIENTE" || estado === "NO_ENTREGADO").length,
      observados: activos.filter(esObservado).length,
      prorroga: activos.filter((r) => Boolean(prorrogaVigente(r))).length,
      entregados: conEstado.filter(({ estado }) => estado === "ENTREGADO").length,
    } as Record<FiltroId, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.requisitos, borrador]);

  const pasa = (r: RequisitoVista): boolean => {
    if (soloObligatorios && !r.obligatorio) return false;
    if (consulta.trim()) {
      const q = normalizar(consulta);
      if (!normalizar(`${r.nombre} ${r.descripcion ?? ""} ${r.codigo}`).includes(q)) return false;
    }
    const estado = estadoDe(r);
    switch (filtro) {
      case "faltan":
        return estado === "PENDIENTE" || estado === "NO_ENTREGADO";
      case "observados":
        return esObservado(r);
      case "prorroga":
        return Boolean(prorrogaVigente(r));
      case "entregados":
        return estado === "ENTREGADO";
      default:
        return true;
    }
  };

  const gruposVisibles = grupos
    .map((g) => ({ ...g, visibles: g.requisitos.filter(pasa) }))
    .filter((g) => g.visibles.length > 0);
  const nadaCoincide = gruposVisibles.length === 0;

  return (
    <div className="space-y-3" style={estiloCategoria(datos.expediente.tipoFuncionario)}>
      {/* ── Barra de trabajo ─────────────────────────────────────────────
          Se queda pegada justo DEBAJO de la barra de pestañas del panel (que ya
          es `sticky top-0`), con un `z` menor, para que al desplazarse una pase
          por debajo de la otra en lugar de solaparse. */}
      <div className="doc-no-print doc-raised sticky top-[2.4rem] z-[9] space-y-2 rounded-[var(--doc-radius,14px)] p-2.5">
        <div className="flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--doc-radius-sm,10px)] px-2 py-1.5"
            style={{ background: "var(--doc-surface)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--doc-text-faint)" }} aria-hidden />
            <input
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar un documento…"
              aria-label="Buscar un documento del expediente"
              className="w-full min-w-0 bg-transparent text-sm text-[color:var(--doc-text)] outline-none placeholder:text-[color:var(--doc-text-faint)]"
            />
            {consulta && (
              <button
                type="button"
                onClick={() => setConsulta("")}
                aria-label="Limpiar la búsqueda"
                className="doc-tap shrink-0 rounded-md p-0.5 text-[color:var(--doc-text-faint)] hover:text-[color:var(--doc-text)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSoloObligatorios((v) => !v)}
            aria-pressed={soloObligatorios}
            title="Mostrar solo los documentos obligatorios"
            className="doc-tap inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
            style={
              soloObligatorios
                ? { background: "var(--doc-info-bg)", color: "var(--doc-info-fg)", boxShadow: "inset 0 0 0 1px var(--doc-info)" }
                : { color: "var(--doc-text-muted)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }
            }
          >
            <Filter className="h-3 w-3" aria-hidden /> Obligatorios
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situación">
          {FILTROS.map((f) => {
            const activo = filtro === f.id;
            const tono = TONO[f.intencion];
            const n = recuentos[f.id] ?? 0;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                aria-pressed={activo}
                disabled={f.id !== "todos" && n === 0}
                className="doc-tap inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 active:scale-95 disabled:cursor-default disabled:opacity-40"
                style={
                  activo
                    ? { background: tono.fondo, color: tono.texto, boxShadow: `inset 0 0 0 1.5px ${tono.borde}` }
                    : { color: "var(--doc-text-muted)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }
                }
              >
                {f.etiqueta}
                <span
                  className="doc-metric rounded-full px-1.5 text-[10px]"
                  style={{ background: activo ? "transparent" : "var(--doc-surface-sunken)" }}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {nadaCoincide ? (
        <div className="doc-raised p-6 text-center">
          <CheckCheck className="mx-auto h-6 w-6" style={{ color: "var(--doc-success)" }} aria-hidden />
          <p className="mt-2 text-sm font-semibold text-[color:var(--doc-text)]">
            {filtro === "faltan" && !consulta ? "No falta ningún documento" : "Ningún documento coincide"}
          </p>
          <p className="doc-prose mx-auto mt-1 max-w-sm text-xs text-[color:var(--doc-text-muted)]">
            {consulta || soloObligatorios
              ? "Prueba a quitar la búsqueda o el filtro de obligatorios."
              : "Cambia de filtro para ver el resto del expediente."}
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <Boton
              variante="suave"
              onClick={() => {
                setFiltro("todos");
                setConsulta("");
                setSoloObligatorios(false);
              }}
            >
              Ver todos los documentos
            </Boton>
          </div>
        </div>
      ) : (
        gruposVisibles.map((grupo) => (
          <section key={grupo.seccion} className="doc-raised doc-print-keep overflow-hidden rounded-[var(--doc-radius,14px)]">
            <header
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--doc-border)] px-3 py-2.5"
              style={{ background: grupo.seccion === "generales" ? "transparent" : "var(--cat-tinte)" }}
            >
              <div className="min-w-0">
                <h4 className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">{grupo.etiqueta}</h4>
                <p className="text-[11px] text-[color:var(--doc-text-muted)]">
                  {grupo.resueltos} de {grupo.total} resueltos
                  {grupo.visibles.length !== grupo.total ? ` · ${grupo.visibles.length} en pantalla` : ""}
                  {grupo.seccion !== "generales" ? ` · ${categoria.etiquetaCorta}` : ""}
                </p>
              </div>
              <div className="w-28 shrink-0">
                <BarraAvance valor={grupo.porcentaje} etiqueta={`Avance de ${grupo.etiqueta}`} />
              </div>
            </header>

            <ul className="doc-list-long divide-y divide-[color:var(--doc-border)]">
              <AnimatePresence initial={false}>
                {grupo.visibles.map((requisito, i) => (
                  <FilaRequisito
                    key={requisito.expedienteDocumentoId}
                    requisito={requisito}
                    estado={estadoDe(requisito)}
                    sucio={Boolean(borrador[requisito.expedienteDocumentoId])}
                    observacionBorrador={borrador[requisito.expedienteDocumentoId]?.observaciones}
                    enFoco={foco === requisito.expedienteDocumentoId}
                    puedeEditar={puedeEditar}
                    puedeRevisar={puedeRevisar}
                    reducido={reducido}
                    orden={i}
                    onFoco={onFoco}
                    onBorrador={onBorrador}
                    onRevisar={onRevisar}
                    onProrrogar={onProrrogar}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fila                                                               */
/* ------------------------------------------------------------------ */

function FilaRequisito({
  requisito,
  estado,
  sucio,
  observacionBorrador,
  enFoco,
  puedeEditar,
  puedeRevisar,
  reducido,
  orden,
  onFoco,
  onBorrador,
  onRevisar,
  onProrrogar,
}: {
  requisito: RequisitoVista;
  estado: EstadoDocumento;
  sucio: boolean;
  observacionBorrador?: string;
  enFoco: boolean;
  puedeEditar: boolean;
  puedeRevisar: boolean;
  reducido: boolean;
  orden: number;
  onFoco: (id: string | null) => void;
  onBorrador: (id: string, patch: { estado?: EstadoDocumento; observaciones?: string }) => void;
  onRevisar: (r: RequisitoVista) => void;
  onProrrogar: (r: RequisitoVista) => void;
}) {
  const prorroga = prorrogaVigente(requisito);
  const observado = esObservado(requisito);
  const tonoEstado = TONO[INTENCION_DOCUMENTO[estado]];
  const mostrarObs = enFoco || Boolean(requisito.observaciones) || observacionBorrador !== undefined;

  const destinos = ESTADOS_DOCUMENTO.filter(
    (d) => puedeTransitar(TRANSICIONES_DOCUMENTO, requisito.estado, d) && (d !== "NO_APLICA" || requisito.permiteNoAplica),
  ).sort((a, b) => ORDEN_ESTADOS.indexOf(a) - ORDEN_ESTADOS.indexOf(b));

  return (
    <motion.li
      layout={reducido ? false : "position"}
      initial={reducido ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducido ? undefined : { opacity: 0, height: 0, transition: { duration: DURACION.rapida } }}
      transition={
        reducido ? { duration: 0 } : { duration: DURACION.normal, ease: CURVA.salidaExpo, delay: Math.min(orden * 0.015, 0.12) }
      }
      className="doc-print-keep relative overflow-hidden"
    >
      {/* Cinta lateral con el color del estado: da la lectura de la lista completa
          con un barrido de la vista, sin leer una sola etiqueta. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tonoEstado.punto, opacity: estado === "PENDIENTE" ? 0.85 : 1 }} aria-hidden />

      <div
        className="py-2.5 pl-3 pr-0.5 transition-colors"
        style={enFoco ? { background: "var(--doc-surface-raised)" } : undefined}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="doc-prose doc-wrap-name text-sm text-[color:var(--doc-text)]">
              {requisito.nombre}
              {requisito.obligatorio && (
                <span className="ml-1.5 align-super text-[10px]" style={{ color: "var(--doc-danger)" }} title="Documento obligatorio">
                  *
                </span>
              )}
              {sucio && (
                <span className="ml-2 text-[10px] font-semibold uppercase" style={{ color: TONO.aviso.texto }}>
                  sin guardar
                </span>
              )}
            </p>
            {requisito.descripcion && (
              <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-faint)]">{requisito.descripcion}</p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {requisito.estadoRevision !== "SIN_REVISION" && (
                <ChipEstado
                  estado={requisito.estadoRevision}
                  etiqueta={ETIQUETA_REVISION[requisito.estadoRevision as keyof typeof ETIQUETA_REVISION] ?? requisito.estadoRevision}
                  intencion={INTENCION_REVISION[requisito.estadoRevision as keyof typeof INTENCION_REVISION] ?? "neutral"}
                />
              )}
              {prorroga && (
                <ChipEstado
                  estado={prorroga.situacion}
                  etiqueta={`Prórroga ${ETIQUETA_SITUACION[prorroga.situacion]?.toLowerCase() ?? prorroga.situacion}`}
                  intencion={INTENCION_SITUACION[prorroga.situacion] ?? "neutral"}
                  prorroga={prorroga.situacion !== "vencida"}
                  titulo={prorroga.motivo || "Prórroga concedida sobre este requisito"}
                />
              )}
              {!requisito.obligatorio && (
                <span className="text-[10px] uppercase tracking-wide text-[color:var(--doc-text-faint)]">opcional</span>
              )}
            </div>
          </div>

          {/* Estado de un toque, en el orden y con el color que usa el área. */}
          {puedeEditar ? (
            <div className="flex flex-wrap gap-1">
              {destinos.map((destino) => {
                const activo = estado === destino;
                const tono = TONO[INTENCION_DOCUMENTO[destino]];
                return (
                  <button
                    key={destino}
                    type="button"
                    onClick={() => {
                      onBorrador(requisito.expedienteDocumentoId, { estado: destino });
                      onFoco(requisito.expedienteDocumentoId);
                    }}
                    aria-pressed={activo}
                    title={`Marcar como ${ETIQUETA_DOCUMENTO[destino].toLowerCase()}`}
                    className="doc-tap inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150 active:scale-95"
                    style={
                      activo
                        ? { background: tono.fondo, color: tono.texto, boxShadow: `inset 0 0 0 1.5px ${tono.borde}` }
                        : { color: "var(--doc-text-faint)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: activo ? tono.punto : "var(--doc-text-faint)" }}
                      aria-hidden
                    />
                    {ETIQUETA_DOCUMENTO[destino]}
                  </button>
                );
              })}
            </div>
          ) : (
            <ChipEstado estado={estado} etiqueta={ETIQUETA_DOCUMENTO[estado]} intencion={INTENCION_DOCUMENTO[estado]} />
          )}
        </div>

        {/* Prórroga: la cuenta regresiva se ve, no se calcula mentalmente. */}
        {prorroga && <CuentaRegresivaProrroga fecha={prorroga.fechaProrroga} motivo={prorroga.motivo} />}

        <AnimatePresence initial={false}>
          {mostrarObs && (
            <motion.div
              initial={reducido ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reducido ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: reducido ? 0 : DURACION.normal, ease: CURVA.salidaQuint }}
              className="overflow-hidden"
            >
              <div className="mt-2 pr-2">
                <Campo
                  etiqueta="Observaciones"
                  ayuda={observado ? "Hay una observación de revisión abierta: explica aquí cómo se resolvió." : "Queda en el expediente y viaja a los reportes."}
                >
                  <AreaTexto
                    value={observacionBorrador ?? requisito.observaciones}
                    onChange={(e) => onBorrador(requisito.expedienteDocumentoId, { observaciones: e.target.value })}
                    disabled={!puedeEditar}
                    rows={2}
                  />
                </Campo>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 pr-2">
          {puedeRevisar && (
            <Boton variante="fantasma" onClick={() => onRevisar(requisito)}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Revisar
            </Boton>
          )}
          {puedeEditar && requisito.permiteProrroga && (
            <Boton variante="fantasma" onClick={() => onProrrogar(requisito)}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {prorroga ? "Cambiar prórroga" : "Prórroga"}
            </Boton>
          )}
          <Boton variante="fantasma" onClick={() => onFoco(enFoco ? null : requisito.expedienteDocumentoId)}>
            <FileText className="h-3.5 w-3.5" aria-hidden /> {enFoco ? "Cerrar" : "Detalle"}
          </Boton>
          {requisito.actualizadoEn && (
            <span className="ml-auto text-[10px] text-[color:var(--doc-text-faint)]" title={fechaHora(requisito.actualizadoEn)}>
              {hace(requisito.actualizadoEn)}
              {requisito.actualizadoPor ? ` · ${requisito.actualizadoPor}` : ""}
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/**
 * Cuenta regresiva de una prórroga.
 *
 * El dato útil no es la fecha: es cuántos días quedan. La barra se llena al
 * revés —se vacía— para que un plazo que se agota se vea agotarse.
 */
function CuentaRegresivaProrroga({ fecha, motivo }: { fecha: string; motivo?: string }) {
  const dias = diasDesdeHoy(fecha);
  if (dias === null) return null;
  const vencida = dias < 0;
  const apremia = dias >= 0 && dias <= 3;
  const tono = TONO[vencida ? "peligro" : apremia ? "aviso" : "acento"];
  const pct = Math.max(0, Math.min(100, Math.round((dias / 30) * 100)));

  return (
    <div className="mt-2 rounded-[var(--doc-radius-sm,10px)] p-2" style={{ background: tono.fondo, boxShadow: `inset 0 0 0 1px ${tono.borde}` }}>
      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium" style={{ color: tono.texto }}>
        <span className="inline-flex items-center gap-1 capitalize">
          <Timer className="h-3 w-3" aria-hidden /> {fechaLegible(fecha)}
        </span>
        <span>
          {vencida
            ? `Fuera de plazo por ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`
            : dias === 0
              ? "Vence hoy"
              : `${dias} día${dias === 1 ? "" : "s"} restantes`}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--doc-surface-sunken)" }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: tono.borde }} />
      </div>
      {motivo && <p className="doc-prose mt-1 text-[11px]" style={{ color: tono.texto, opacity: 0.85 }}>{motivo}</p>}
      <p className="sr-only">Fecha límite {fechaCorta(fecha)}</p>
    </div>
  );
}
