/**
 * Reportes, exportaciones, notificaciones y auditoría.
 *
 * ── El criterio de esta pantalla ────────────────────────────────────────────
 * Un reporte que no se puede llevar a ningún sitio sirve a medias. Aquí cada
 * reporte se ve en pantalla Y se descarga como `.xlsx` real, generado en el
 * navegador a partir de los datos que el backend ya devolvió. Y cada exportación
 * grande se hace por lotes con progreso de verdad: cada lote es una petición y el
 * backend dice desde dónde seguir.
 */

import { useMemo, useState } from "react";
import { Bell, BellOff, CalendarRange, Download, FileSpreadsheet, FileText, Printer, RefreshCw, Search } from "lucide-react";
import { docApi, type ExpedienteOperativo, type ReporteDatos } from "../api/acciones";
import { fechaHora, filtrosParaBackend } from "../domain/progreso";
import { refrescarNotificaciones, useConsola } from "../state/consola";
import { descargarXlsx, nombreConFecha, unirLotes } from "../export/xlsx";
import {
  construirInforme,
  descargarWord,
  enElMes,
  etiquetaMes,
  imprimirInforme,
  informeALibro,
  type InformeMensual,
} from "../export/informeMensual";
import {
  Aviso,
  Boton,
  Buscador,
  Campo,
  ChipEstado,
  Entrada,
  Interruptor,
  Paginacion,
  Panel,
  Selector,
  Tabla,
  usarDebounce,
  Vacio,
  type ColumnaTabla,
  type Notita,
} from "./piezas";
import { DocError } from "./DocStates";
import { useDatos } from "./useDatos";

interface Props {
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
  onAbrirExpediente?: (expedienteId: string) => void;
}

/* ================================================================== */
/* Reportes                                                            */
/* ================================================================== */

export function SeccionReportes({ avisar }: Props) {
  const { conexion, filtros, capacidades, densidad } = useConsola();
  const [tipo, setTipo] = useState("resumen");
  const [usarFiltros, setUsarFiltros] = useState(true);

  const disponibles = useDatos(() => docApi.reportesDisponibles(), [], { activo: conexion === "conectado" });
  const consulta = useMemo(() => (usarFiltros ? filtrosParaBackend(filtros) : {}), [usarFiltros, filtros]);
  const reporte = useDatos<ReporteDatos>(() => docApi.reporte(tipo, consulta), [tipo, JSON.stringify(consulta)], {
    activo: conexion === "conectado",
  });

  function descargar() {
    if (!reporte.datos) return;
    const hoja = [reporte.datos.columnas, ...reporte.datos.filas];
    const { nombre } = descargarXlsx({ [reporte.datos.etiqueta.slice(0, 28)]: hoja }, nombreConFecha(`reporte-${tipo}`));
    avisar("exito", `Archivo ${nombre} descargado.`);
  }

  const columnas: ColumnaTabla<(string | number | null)[]>[] = (reporte.datos?.columnas ?? []).map((encabezado, indice) => ({
    clave: `c${indice}`,
    encabezado,
    numerica: indice > 0 && typeof reporte.datos?.filas[0]?.[indice] === "number",
    secundaria: indice > 5,
    render: (fila) => <span className="text-xs text-ink">{fila[indice] === null || fila[indice] === "" ? "—" : String(fila[indice])}</span>,
  }));

  return (
    <div className="space-y-3">
      <PanelInformeMensual avisar={avisar} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px]">
          <Campo etiqueta="Reporte">
            <Selector
              valor={tipo}
              onChange={setTipo}
              opciones={(disponibles.datos?.reportes ?? []).map((r) => ({ valor: r.codigo, etiqueta: r.etiqueta }))}
            />
          </Campo>
        </div>
        <Interruptor activo={usarFiltros} onChange={setUsarFiltros} etiqueta="Aplicar los filtros de Expedientes" />
        <Boton variante="suave" onClick={reporte.recargar} cargando={reporte.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Generar
        </Boton>
        {capacidades.exportar && (
          <Boton variante="primario" onClick={descargar} disabled={!reporte.datos?.filas.length}>
            <Download className="h-3.5 w-3.5" aria-hidden /> Descargar .xlsx
          </Boton>
        )}
      </div>

      {reporte.error && (
        <DocError titulo="No se pudo generar el reporte" error={reporte.error} onReintentar={reporte.recargar} reintentando={reporte.cargando} />
      )}

      <Panel
        titulo={reporte.datos?.etiqueta ?? "Reporte"}
        descripcion={
          reporte.datos
            ? `${reporte.datos.total} fila(s) · generado ${fechaHora(reporte.datos.generado)}${usarFiltros ? " · con los filtros activos" : ""}`
            : undefined
        }
      >
        <Tabla
          columnas={columnas}
          filas={reporte.datos?.filas ?? []}
          claveFila={(fila) => fila.join("|").slice(0, 120)}
          cargando={reporte.cargando && !reporte.datos}
          densidad={densidad}
          titulo={reporte.datos?.etiqueta}
          vacio={<Vacio titulo="Sin datos" detalle="Este reporte no devolvió filas con los filtros actuales." />}
        />
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Informe de avance mensual                                           */
/* ================================================================== */

/** Mes actual en formato `YYYY-MM`. */
function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TOPE_INFORME = 120;

/**
 * Informe de avance mensual.
 *
 * Reúne los expedientes cuyo INGRESO cae en el mes elegido, lee el detalle de
 * cada uno (una lectura por persona, con progreso visible) y arma un informe
 * categorizado → por persona → por documento. Se descarga en Excel, Word o PDF.
 */
function PanelInformeMensual({ avisar }: { avisar: Props["avisar"] }) {
  const { conexion, capacidades } = useConsola();
  const [mes, setMes] = useState(mesActual());
  const [trabajando, setTrabajando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [informe, setInforme] = useState<InformeMensual | null>(null);

  const conectado = conexion === "conectado";

  async function generar() {
    setTrabajando(true);
    setInforme(null);
    setProgreso({ hechos: 0, total: 0 });
    try {
      const [anio, m] = mes.split("-").map((n) => parseInt(n, 10));
      const ultimo = new Date(anio, m, 0).getDate();
      const lista = await docApi.listarExpedientes({
        ingresoDesde: `${mes}-01`,
        ingresoHasta: `${mes}-${String(ultimo).padStart(2, "0")}`,
        incluirArchivados: true,
        porPagina: 200,
        orden: "reciente",
      });
      // Segunda red: se filtra también en el cliente por si el backend no acotó.
      let cabeceras = lista.expedientes.filter((e) => enElMes(e.fechaIngreso, mes));
      if (cabeceras.length > TOPE_INFORME) {
        avisar("aviso", `El mes tiene ${cabeceras.length} ingresos; el informe toma los primeros ${TOPE_INFORME}.`, "Acota el mes o exporta por lotes desde Exportaciones.");
        cabeceras = cabeceras.slice(0, TOPE_INFORME);
      }
      if (!cabeceras.length) {
        setInforme(construirInforme([], mes));
        avisar("info", `No hay ingresos registrados en ${etiquetaMes(mes)}.`);
        return;
      }
      const detalles: ExpedienteOperativo[] = [];
      for (let i = 0; i < cabeceras.length; i++) {
        setProgreso({ hechos: i, total: cabeceras.length });
        const detalle = await docApi.obtenerExpediente(cabeceras[i].expedienteId);
        detalles.push(detalle);
      }
      setProgreso({ hechos: cabeceras.length, total: cabeceras.length });
      setInforme(construirInforme(detalles, mes));
      avisar("exito", `Informe de ${etiquetaMes(mes)} listo: ${detalles.length} persona(s).`);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      avisar("peligro", fallo.message ?? "No se pudo generar el informe.", fallo.pista);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Panel
      titulo="Informe de avance mensual"
      descripcion="Analiza los ingresos del mes, agrupa por categoría y persona, y detalla el cumplimiento y las observaciones de cada documento."
    >
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Mes del informe">
          <Entrada type="month" value={mes} max={mesActual()} onChange={(e) => setMes(e.target.value)} className="w-auto" />
        </Campo>
        <Boton variante="primario" onClick={generar} cargando={trabajando} disabled={!conectado}>
          <CalendarRange className="h-3.5 w-3.5" aria-hidden /> Generar informe
        </Boton>
        {!conectado && <span className="text-[11px] text-[color:var(--doc-text-faint)]">Conéctate al backend para generar el informe.</span>}
      </div>

      {trabajando && progreso && progreso.total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-[color:var(--doc-text-muted)]">
            <span>Leyendo expedientes…</span>
            <span>
              {progreso.hechos} / {progreso.total}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--doc-surface-sunken)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{ width: `${Math.round((progreso.hechos / progreso.total) * 100)}%`, background: "var(--doc-info)" }}
            />
          </div>
        </div>
      )}

      {informe && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ResumenCifra etiqueta="Personas" valor={informe.totalPersonas} />
            <ResumenCifra etiqueta="Avance promedio" valor={`${informe.avancePromedio}%`} />
            <ResumenCifra etiqueta="Categorías" valor={informe.categorias.length} />
            <ResumenCifra etiqueta="Mes" valor={informe.etiquetaMes} />
          </div>

          {informe.categorias.length > 0 && (
            <ul className="space-y-1.5">
              {informe.categorias.map((cat) => (
                <li key={cat.codigo} className="doc-sunken flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--doc-text)]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} aria-hidden />
                    {cat.etiqueta}
                  </span>
                  <span className="text-[11px] text-[color:var(--doc-text-muted)]">
                    {cat.personas.length} persona(s) · avance {cat.avancePromedio}%
                  </span>
                </li>
              ))}
            </ul>
          )}

          {capacidades.exportar ? (
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="suave"
                onClick={() => {
                  const { nombre } = descargarXlsx(informeALibro(informe), nombreConFecha(`informe-mensual-${informe.mes}`));
                  avisar("exito", `Descargado ${nombre}.`);
                }}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Excel
              </Boton>
              <Boton
                variante="suave"
                onClick={() => {
                  descargarWord(informe, `informe-mensual-${informe.mes}`);
                  avisar("exito", "Documento de Word descargado.");
                }}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden /> Word
              </Boton>
              <Boton
                variante="suave"
                onClick={() => {
                  imprimirInforme(informe);
                  avisar("info", "Se abrió el diálogo de impresión: elige «Guardar como PDF».");
                }}
              >
                <Printer className="h-3.5 w-3.5" aria-hidden /> PDF
              </Boton>
            </div>
          ) : (
            <Aviso intencion="info" titulo="Solo lectura">
              Tu rol puede ver el informe, pero no descargarlo. Pide la capacidad de exportar a un administrador.
            </Aviso>
          )}
        </div>
      )}
    </Panel>
  );
}

function ResumenCifra({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <div className="doc-raised rounded-[var(--doc-radius,14px)] p-3 text-center">
      <div className="doc-metric text-lg font-bold text-[color:var(--doc-text)]">{valor}</div>
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--doc-text-faint)]">{etiqueta}</div>
    </div>
  );
}

/* ================================================================== */
/* Exportaciones                                                       */
/* ================================================================== */

/**
 * Exportaciones a Excel.
 *
 * Cinco alcances: un expediente (desde su ficha), la selección, el resultado
 * filtrado, toda la base y los reportes. Aquí están los tres últimos; el
 * individual vive en el expediente, que es donde se pide.
 */
export function SeccionExportaciones({ avisar }: Props) {
  const { conexion, filtros, capacidades } = useConsola();
  const [tipo, setTipo] = useState<"filtrado" | "completo">("filtrado");
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);

  const historial = useDatos(() => docApi.exportaciones({ porPagina: 15 }), [], { activo: conexion === "conectado" });

  async function exportar() {
    setProgreso({ hechos: 0, total: 0 });
    try {
      const trabajo = await docApi.iniciarExportacion({
        tipo,
        filtro: tipo === "filtrado" ? filtrosParaBackend(filtros) : {},
      });
      setProgreso({ hechos: 0, total: trabajo.expedientes });

      const lotes: Record<string, (string | number | null)[][]>[] = [];
      let quedan = true;
      let vueltas = 0;
      // Un tope de vueltas evita un bucle infinito si el backend devolviera
      // `quedan` de forma inconsistente: preferimos un archivo incompleto y un
      // aviso a una pestaña colgada.
      while (quedan && vueltas < 200) {
        const lote = await docApi.loteExportacion(trabajo.exportacionId);
        lotes.push(lote.datos);
        setProgreso({ hechos: lote.hasta, total: lote.total });
        quedan = lote.quedan;
        vueltas += 1;
      }

      const libro = unirLotes(lotes);
      if (!Object.keys(libro).length) {
        avisar("aviso", "La exportación no devolvió datos con estos filtros.");
        return;
      }
      const { nombre, bytes } = descargarXlsx(libro, nombreConFecha(`documentacion-${tipo}`));
      avisar("exito", `Archivo ${nombre} descargado (${Math.round(bytes / 1024)} KB).`);
      historial.recargar();
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      avisar("peligro", fallo.message ?? "No se pudo exportar.", fallo.pista);
    } finally {
      setProgreso(null);
    }
  }

  return (
    <div className="space-y-3">
      <Panel
        titulo="Nueva exportación"
        descripcion="Se procesa por lotes y se arma el archivo en tu equipo: no queda ninguna copia en Drive."
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px]">
            <Campo etiqueta="Alcance">
              <Selector
                valor={tipo}
                onChange={(v) => setTipo(v === "completo" ? "completo" : "filtrado")}
                opciones={[
                  { valor: "filtrado", etiqueta: "Resultado de los filtros actuales" },
                  { valor: "completo", etiqueta: "Toda la base (incluye archivados)" },
                ]}
              />
            </Campo>
          </div>
          <Boton variante="primario" onClick={exportar} cargando={!!progreso} disabled={!capacidades.exportar}>
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Exportar a Excel
          </Boton>
          {progreso && (
            <p className="text-xs text-ink-soft" role="status" aria-live="polite">
              {progreso.hechos} de {progreso.total} expedientes procesados…
            </p>
          )}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          El libro incluye Resumen, Expedientes, Requisitos, Prórrogas, Solicitudes, Revisiones, Aprobaciones, Tareas e Historial
          autorizado. Los valores que empiezan por «=» se escriben como texto para que el archivo no ejecute nada al abrirse.
        </p>
      </Panel>

      <Panel titulo="Historial de exportaciones" descripcion="Quién exportó qué y cuándo. Los trabajos a medias se pueden cerrar en el mantenimiento.">
        {historial.datos?.exportaciones.length ? (
          <ul className="space-y-1.5">
            {historial.datos.exportaciones.map((item) => {
              const registro = item as Record<string, string | number | boolean>;
              return (
                <li key={String(registro.exportacionId)} className="doc-sunken flex flex-wrap items-center justify-between gap-2 p-2 text-xs">
                  <span className="text-ink">
                    {String(registro.tipo)} · {String(registro.expedientes)} expediente(s)
                  </span>
                  <span className="text-ink-soft">
                    {String(registro.solicitadaPor)} · {fechaHora(String(registro.creadoEn))}
                  </span>
                  <ChipEstado
                    estado={String(registro.estado)}
                    intencion={
                      registro.estado === "COMPLETADA"
                        ? "exito"
                        : registro.estado === "CANCELADA" || registro.estado === "INTERRUMPIDA"
                          ? "neutral"
                          : registro.estancada
                            ? "aviso"
                            : "info"
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <Vacio titulo="Sin exportaciones" detalle="Aquí quedará constancia de cada descarga." />
        )}
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Notificaciones                                                      */
/* ================================================================== */

export function SeccionNotificaciones({ avisar, onAbrirExpediente }: Props) {
  const { conexion, densidad } = useConsola();
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [pagina, setPagina] = useState(1);

  const filtros = useMemo(() => ({ soloNoLeidas: soloNoLeidas || undefined, pagina, porPagina: 25 }), [soloNoLeidas, pagina]);
  const lista = useDatos(() => docApi.notificaciones(filtros), [JSON.stringify(filtros)], { activo: conexion === "conectado" });

  const columnas: ColumnaTabla<NonNullable<typeof lista.datos>["notificaciones"][number]>[] = [
    {
      clave: "aviso",
      encabezado: "Aviso",
      render: (fila) => (
        <div className="min-w-0">
          <p className={`truncate text-xs ${fila.leida ? "text-ink-soft" : "font-semibold text-ink"}`}>{fila.titulo}</p>
          <p className="truncate text-[11px] text-ink-faint">{fila.mensaje}</p>
        </div>
      ),
    },
    { clave: "tipo", encabezado: "Evento", secundaria: true, render: (fila) => <span className="text-[11px] text-ink-soft">{fila.tipo}</span> },
    { clave: "fecha", encabezado: "Fecha", render: (fila) => <span className="text-[11px] text-ink-soft">{fechaHora(fila.fecha)}</span> },
    {
      clave: "canal",
      encabezado: "Canal",
      secundaria: true,
      render: (fila) => (
        <ChipEstado
          estado={fila.canal}
          intencion={fila.estadoEnvio === "ERROR" ? "peligro" : fila.canal === "CORREO" ? "info" : "neutral"}
          titulo={fila.error || fila.estadoEnvio}
        />
      ),
    },
    {
      clave: "acciones",
      encabezado: "",
      render: (fila) => (
        <div className="flex justify-end gap-1">
          {fila.expedienteId && onAbrirExpediente && (
            <Boton variante="suave" onClick={() => onAbrirExpediente(fila.expedienteId)}>
              Abrir
            </Boton>
          )}
          {!fila.leida && (
            <Boton
              variante="fantasma"
              onClick={async () => {
                try {
                  await docApi.marcarNotificacion(fila.notificacionId);
                  lista.recargar();
                  void refrescarNotificaciones();
                } catch (error) {
                  const fallo = error as { message?: string };
                  avisar("peligro", fallo.message ?? "No se pudo marcar.");
                }
              }}
            >
              Leída
            </Boton>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Interruptor activo={soloNoLeidas} onChange={setSoloNoLeidas} etiqueta="Solo sin leer" />
        <Boton variante="suave" onClick={lista.recargar} cargando={lista.cargando}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
        </Boton>
        <Boton
          variante="suave"
          onClick={async () => {
            try {
              const res = await docApi.marcarTodasLeidas();
              avisar("exito", `${res.marcadas} aviso(s) marcado(s) como leídos.`);
              lista.recargar();
              void refrescarNotificaciones();
            } catch (error) {
              const fallo = error as { message?: string };
              avisar("peligro", fallo.message ?? "No se pudo marcar.");
            }
          }}
        >
          <BellOff className="h-3.5 w-3.5" aria-hidden /> Marcar todas leídas
        </Boton>
        {lista.datos && (
          <span className="text-xs text-ink-soft">
            <Bell className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {lista.datos.noLeidas} sin leer
          </span>
        )}
      </div>

      {lista.error && (
        <DocError titulo="No se pudieron cargar los avisos" error={lista.error} onReintentar={lista.recargar} reintentando={lista.cargando} />
      )}

      <Panel descripcion="Cada aviso sabe a qué entidad pertenece, así que se puede abrir desde aquí. El correo es opcional y viene apagado.">
        <Tabla
          columnas={columnas}
          filas={lista.datos?.notificaciones ?? []}
          claveFila={(fila) => fila.notificacionId}
          cargando={lista.cargando && !lista.datos}
          densidad={densidad}
          titulo="Notificaciones"
          vacio={<Vacio titulo="Sin avisos" detalle="Cuando algo requiera tu atención, aparecerá aquí." />}
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
/* Auditoría                                                           */
/* ================================================================== */

export function SeccionAuditoria({ onAbrirExpediente }: Props) {
  const { conexion, densidad, capacidades } = useConsola();
  const [texto, setTexto] = useState("");
  const buscado = usarDebounce(texto, 350);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [limite, setLimite] = useState(200);

  const filtros = useMemo(
    () => ({ texto: buscado || undefined, desde: desde || undefined, hasta: hasta || undefined, limite }),
    [buscado, desde, hasta, limite],
  );
  const lista = useDatos(() => docApi.auditoria(filtros), [JSON.stringify(filtros)], {
    activo: conexion === "conectado" && capacidades.auditoria === true,
  });

  if (!capacidades.auditoria) {
    return (
      <Aviso intencion="aviso" titulo="Sin acceso a la auditoría">
        Tu rol no incluye la consulta de la bitácora técnica. Pídelo al administrador del módulo si lo necesitas.
      </Aviso>
    );
  }

  const columnas: ColumnaTabla<NonNullable<typeof lista.datos>["eventos"][number]>[] = [
    { clave: "fecha", encabezado: "Fecha", render: (fila) => <span className="text-[11px] text-ink-soft">{fechaHora(fila.fecha)}</span> },
    { clave: "evento", encabezado: "Evento", render: (fila) => <span className="text-xs text-ink">{fila.tipo}</span> },
    { clave: "entidad", encabezado: "Entidad", secundaria: true, render: (fila) => <span className="text-[11px] text-ink-soft">{fila.entidadTipo}</span> },
    { clave: "actor", encabezado: "Actor", render: (fila) => <span className="text-xs text-ink-soft">{fila.actor}</span> },
    { clave: "origen", encabezado: "Origen", secundaria: true, render: (fila) => <span className="text-[11px] text-ink-soft">{fila.origen}</span> },
    {
      clave: "resultado",
      encabezado: "Resultado",
      render: (fila) => (
        <ChipEstado estado={fila.resultado} intencion={fila.resultado === "ok" ? "exito" : fila.resultado === "error" ? "peligro" : "aviso"} />
      ),
    },
    {
      clave: "solicitud",
      encabezado: "Solicitud",
      secundaria: true,
      render: (fila) => (
        <span className="truncate text-[10px] text-ink-faint" title={fila.requestId}>
          {fila.requestId.slice(0, 18)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Buscador valor={texto} onChange={setTexto} placeholder="Buscar por evento, actor u origen…" etiqueta="Buscar en la auditoría" />
        <div className="min-w-[140px]">
          <Campo etiqueta="Desde">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
        </div>
        <div className="min-w-[140px]">
          <Campo etiqueta="Hasta">
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
        </div>
        <div className="min-w-[120px]">
          <Campo etiqueta="Máximo">
            <Selector
              valor={String(limite)}
              onChange={(v) => setLimite(Number(v))}
              opciones={[
                { valor: "100", etiqueta: "100 eventos" },
                { valor: "200", etiqueta: "200 eventos" },
                { valor: "500", etiqueta: "500 eventos" },
                { valor: "1000", etiqueta: "1000 eventos" },
              ]}
            />
          </Campo>
        </div>
        <Boton variante="suave" onClick={lista.recargar} cargando={lista.cargando}>
          <Search className="h-3.5 w-3.5" aria-hidden /> Consultar
        </Boton>
      </div>

      {lista.error && (
        <DocError titulo="No se pudo consultar la auditoría" error={lista.error} onReintentar={lista.recargar} reintentando={lista.cargando} />
      )}

      <Panel
        descripcion={
          lista.datos
            ? `${lista.datos.devueltos} de ${lista.datos.total} eventos. Se recorre de lo más reciente hacia atrás.`
            : "Bitácora técnica: evento, actor, origen, resultado e identificador de solicitud."
        }
      >
        <Tabla
          columnas={columnas}
          filas={lista.datos?.eventos ?? []}
          claveFila={(fila) => fila.eventoId}
          onFila={onAbrirExpediente ? (fila) => fila.expedienteId && onAbrirExpediente(fila.expedienteId) : undefined}
          cargando={lista.cargando && !lista.datos}
          densidad={densidad}
          titulo="Auditoría técnica"
        />
      </Panel>
    </div>
  );
}
