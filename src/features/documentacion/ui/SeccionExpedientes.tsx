/**
 * Expedientes: búsqueda, filtros, alta y operaciones masivas.
 *
 * ── Decisiones de esta pantalla ─────────────────────────────────────────────
 * 1. **El filtrado ocurre en el servidor.** Se manda el filtro y se recibe una
 *    página. Con novecientos expedientes, traerlos todos para filtrar en el
 *    navegador son varios megabytes y una tabla que tarda en responder.
 * 2. **La búsqueda espera.** Un retardo de 350 ms convierte «muñoz» en una
 *    petición en lugar de cinco.
 * 3. **La selección múltiple existe para actuar.** Seleccionar sin poder hacer
 *    nada con la selección es una casilla decorativa; aquí abre la solicitud
 *    masiva con su impacto calculado antes de ejecutarla.
 * 4. **El alta pide la rama.** Tipo de funcionario y tipo de garantía determinan
 *    qué requisitos se crean, así que se eligen al crear y se muestra cuántos
 *    requisitos va a tener el expediente antes de guardarlo.
 *
 * ── Qué cambió en el rediseño ───────────────────────────────────────────────
 * · **Los filtros se ven.** Antes había un botón «Filtros (3)» y para saber
 *   cuáles eran había que abrir el panel. Ahora cada filtro aplicado es un chip
 *   con su valor y su aspa.
 * · **Dos lecturas de la misma lista.** El modo operativo prioriza lo que hay que
 *   hacer; el modo auditoría, lo que hay que poder demostrar —identificador,
 *   versión, quién tocó qué y cuándo—. Son las mismas filas con otras columnas.
 * · **Tres densidades y dos disposiciones.** Tabla para comparar, tarjetas para
 *   leer; compacta para ver cuarenta filas, amplia para trabajar despacio.
 * · **El recuento es del servidor.** «312 expedientes» sale del total de la
 *   consulta, no de las veinticinco filas de la página, que era lo que se
 *   resumía antes.
 * · **Continuidad al abrir.** Con View Transitions, la fila se convierte en el
 *   panel del expediente; donde no hay soporte, se abre como siempre.
 */

import { useMemo, useState } from "react";
import {
  Columns3,
  Filter,
  LayoutGrid,
  Rows3,
  Rows4,
  Save,
  Send,
  ShieldCheck,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { docApi, type CatalogoCliente, type ListadoExpedientes } from "../api/acciones";
import {
  ETIQUETA_EXPEDIENTE,
  ESTADOS_EXPEDIENTE,
  INTENCION_EXPEDIENTE,
  TIPOS_FUNCIONARIO,
  TIPOS_GARANTIA,
} from "../domain/vocabulario";
import {
  fechaCorta,
  fechaEnDias,
  fechaHora,
  filtrosActivos,
  filtrosParaBackend,
  textoPlazo,
  type ExpedienteCabecera,
  type FiltrosExpedientes,
} from "../domain/progreso";
import {
  limpiarFiltros,
  ponerDensidad,
  ponerFiltros,
  ponerModoLista,
  ponerVistaLista,
  useConsola,
  type Densidad,
  type ModoLista,
  type VistaLista,
} from "../state/consola";
import {
  Aviso,
  BarraAvance,
  Boton,
  Buscador,
  Campo,
  ChipEstado,
  ChipFiltro,
  Confirmacion,
  Entrada,
  Interruptor,
  Lateral,
  Paginacion,
  Panel,
  Segmento,
  Selector,
  Tabla,
  TextoCompleto,
  usarDebounce,
  usarPantallaEstrecha,
  type ColumnaTabla,
  type Notita,
} from "./piezas";
import { DocError, DocSinResultados, DocVacio } from "./DocStates";
import { EsqueletoTabla } from "./DocSkeletons";
import { conTransicionDeVista, vistaDeExpediente } from "./DocViewTransitions";
import { incidenciaDe } from "./DocAttentionPanel";
import { AltaExpedienteWizard } from "./AltaExpedienteWizard";
import { useDatos, type EstadoDatos } from "./useDatos";

interface Props {
  onAbrir: (expedienteId: string) => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
  /** El alta se lanza desde la acción principal del armazón. */
  altaAbierta?: boolean;
  onCerrarAlta?: () => void;
}

/* ------------------------------------------------------------------ */
/* Chips de filtro                                                     */
/* ------------------------------------------------------------------ */

/**
 * Traduce los filtros aplicados a chips legibles.
 *
 * El valor se muestra tal como lo entendería una persona: `conProrrogasVencidas:
 * true` es «Prórrogas vencidas», no `true`. Quitar un chip devuelve el filtro a
 * su valor vacío, que es lo que `filtrosParaBackend` sabe descartar.
 */
function chipsDeFiltros(filtros: FiltrosExpedientes): { clave: keyof FiltrosExpedientes; etiqueta: string; valor: string; vacio: unknown }[] {
  const chips: { clave: keyof FiltrosExpedientes; etiqueta: string; valor: string; vacio: unknown }[] = [];
  const texto = (clave: keyof FiltrosExpedientes, etiqueta: string) => {
    const valor = filtros[clave];
    if (valor === undefined || valor === null || valor === "") return;
    chips.push({ clave, etiqueta, valor: String(valor), vacio: "" });
  };
  const bandera = (clave: keyof FiltrosExpedientes, etiqueta: string) => {
    if (filtros[clave] !== true) return;
    chips.push({ clave, etiqueta: "Solo", valor: etiqueta, vacio: false });
  };

  if (filtros.estado) {
    chips.push({
      clave: "estado",
      etiqueta: "Estado",
      valor: ETIQUETA_EXPEDIENTE[filtros.estado as keyof typeof ETIQUETA_EXPEDIENTE] ?? filtros.estado,
      vacio: "",
    });
  }
  texto("agencia", "Agencia");
  texto("gerencia", "Gerencia");
  if (filtros.tipoFuncionario) {
    chips.push({
      clave: "tipoFuncionario",
      etiqueta: "Rama",
      valor: TIPOS_FUNCIONARIO.find((t) => t.codigo === filtros.tipoFuncionario)?.etiqueta ?? filtros.tipoFuncionario,
      vacio: "",
    });
  }
  if (filtros.tipoGarantia) {
    chips.push({
      clave: "tipoGarantia",
      etiqueta: "Garantía",
      valor: TIPOS_GARANTIA.find((t) => t.codigo === filtros.tipoGarantia)?.etiqueta ?? filtros.tipoGarantia,
      vacio: "",
    });
  }
  texto("responsable", "Responsable");
  texto("ingresoDesde", "Ingreso desde");
  texto("ingresoHasta", "Ingreso hasta");
  if (filtros.progresoMin !== "" && filtros.progresoMin !== undefined) {
    chips.push({ clave: "progresoMin", etiqueta: "Avance ≥", valor: `${filtros.progresoMin}%`, vacio: "" });
  }
  if (filtros.progresoMax !== "" && filtros.progresoMax !== undefined) {
    chips.push({ clave: "progresoMax", etiqueta: "Avance ≤", valor: `${filtros.progresoMax}%`, vacio: "" });
  }
  bandera("conPendientes", "con pendientes");
  bandera("conNoEntregados", "con no entregados");
  bandera("conObservados", "con observaciones");
  bandera("conProrrogas", "con prórrogas");
  bandera("conProrrogasVencidas", "prórrogas vencidas");
  bandera("conSolicitudesVencidas", "solicitudes vencidas");
  bandera("conTareasVencidas", "tareas vencidas");
  bandera("incluirArchivados", "incluye archivados");
  return chips;
}

const ORDENES = [
  { valor: "reciente", etiqueta: "Más recientes" },
  { valor: "actualizado", etiqueta: "Última actualización" },
  { valor: "nombre", etiqueta: "Nombre" },
  { valor: "avance", etiqueta: "Avance" },
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "critica", etiqueta: "Próxima fecha crítica" },
  { valor: "ingreso", etiqueta: "Fecha de ingreso" },
];

/* ------------------------------------------------------------------ */
/* Sección                                                             */
/* ------------------------------------------------------------------ */

export function SeccionExpedientes({ onAbrir, avisar, altaAbierta = false, onCerrarAlta }: Props) {
  const { filtros, catalogo, capacidades, densidad, vistaLista, modoLista, conexion } = useConsola();
  const [texto, setTexto] = useState(filtros.texto ?? "");
  const textoRetrasado = usarDebounce(texto, 350);
  const [verFiltros, setVerFiltros] = useState(false);
  /* En el móvil los filtros avanzados van en un cajón: diez campos empujando la
     lista fuera de la pantalla no son un filtro, son un formulario. */
  const estrecha = usarPantallaEstrecha();
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [masivaAbierta, setMasivaAbierta] = useState(false);

  const consulta = useMemo(() => filtrosParaBackend({ ...filtros, texto: textoRetrasado }), [filtros, textoRetrasado]);

  const listado = useDatos<ListadoExpedientes>(() => docApi.listarExpedientes(consulta), [JSON.stringify(consulta)], {
    activo: conexion === "conectado",
  });

  const filtrosGuardados = useDatos(() => docApi.listarFiltros(), [], { activo: conexion === "conectado" });

  const expedientes = listado.datos?.expedientes ?? [];
  const resumen = listado.datos?.resumen;
  const activos = filtrosActivos({ ...filtros, texto: textoRetrasado });
  const chips = chipsDeFiltros(filtros);
  const cargandoPrimera = listado.cargando && !listado.datos;

  /** Abre el expediente con continuidad visual desde la fila, si el navegador puede. */
  function abrir(expedienteId: string) {
    conTransicionDeVista(() => onAbrir(expedienteId));
  }

  function alternarSeleccion(expedienteId: string) {
    setSeleccion((prev) => (prev.includes(expedienteId) ? prev.filter((id) => id !== expedienteId) : [...prev, expedienteId]));
  }

  const columnaSeleccion: ColumnaTabla<ExpedienteCabecera> = {
    clave: "seleccion",
    encabezado: "",
    soloTabla: true,
    render: (fila) => (
      <input
        type="checkbox"
        checked={seleccion.includes(fila.expedienteId)}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          alternarSeleccion(fila.expedienteId);
        }}
        aria-label={`Seleccionar ${fila.nombre}`}
        className="h-4 w-4 rounded border-[color:var(--doc-border)]"
      />
    ),
  };

  const columnaPersona: ColumnaTabla<ExpedienteCabecera> = {
    clave: "persona",
    encabezado: "Persona",
    render: (fila) => (
      <div className="min-w-0 max-w-[18rem]">
        <TextoCompleto texto={fila.nombre} className="font-medium text-[color:var(--doc-text)]" />
        <p className="doc-metric truncate text-[11px] text-[color:var(--doc-text-faint)]">
          {fila.identificador}
          {fila.cargo ? ` · ${fila.cargo}` : ""}
        </p>
      </div>
    ),
  };

  /* ── Modo operativo: lo que hay que hacer ────────────────────────── */
  const columnasOperativo: ColumnaTabla<ExpedienteCabecera>[] = [
    columnaSeleccion,
    columnaPersona,
    {
      clave: "ubicacion",
      encabezado: "Agencia / gerencia",
      secundaria: true,
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-[color:var(--doc-text)]">{fila.agencia || "Sin agencia registrada"}</p>
          <p className="truncate text-[11px] text-[color:var(--doc-text-faint)]">{fila.gerencia || "Sin gerencia registrada"}</p>
        </div>
      ),
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (fila) => (
        <ChipEstado
          estado={fila.estado}
          etiqueta={ETIQUETA_EXPEDIENTE[fila.estado] ?? fila.estado}
          intencion={INTENCION_EXPEDIENTE[fila.estado] ?? "neutral"}
          prorroga={fila.estado === "CON_PRORROGA"}
          titulo={`Estado del expediente: ${ETIQUETA_EXPEDIENTE[fila.estado] ?? fila.estado}`}
        />
      ),
    },
    {
      clave: "avance",
      encabezado: "Avance",
      render: (fila) => (
        <div className="min-w-[7rem]">
          <BarraAvance valor={fila.porcentaje} etiqueta={`Avance de ${fila.nombre}`} />
        </div>
      ),
    },
    {
      clave: "faltan",
      encabezado: "Faltan",
      numerica: true,
      render: (fila) => (
        <span title={`${fila.totales.pendientes} pendientes y ${fila.totales.noEntregados} no entregados`}>
          {fila.totales.pendientes + fila.totales.noEntregados}
        </span>
      ),
    },
    {
      clave: "observados",
      encabezado: "Obs.",
      numerica: true,
      secundaria: true,
      render: (fila) => (
        <span
          title={`${fila.totales.observados} requisito(s) con observación abierta`}
          style={{ color: fila.totales.observados ? "var(--doc-warning-fg)" : undefined }}
        >
          {fila.totales.observados}
        </span>
      ),
    },
    {
      clave: "critica",
      encabezado: "Próximo plazo",
      render: (fila) =>
        fila.proximaFechaCritica ? (
          <span
            className="text-xs"
            style={{
              color:
                fila.diasParaFechaCritica !== null && fila.diasParaFechaCritica < 0
                  ? "var(--doc-danger-fg)"
                  : fila.diasParaFechaCritica !== null && fila.diasParaFechaCritica <= 3
                    ? "var(--doc-warning-fg)"
                    : "var(--doc-text-muted)",
            }}
            title={fechaCorta(fila.proximaFechaCritica)}
          >
            {textoPlazo(fila.proximaFechaCritica)}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--doc-text-faint)]">Sin plazo</span>
        ),
    },
    {
      clave: "responsable",
      encabezado: "Responsable",
      secundaria: true,
      render: (fila) => (
        <span className="truncate text-xs text-[color:var(--doc-text-muted)]" title={fila.responsableId || "Sin asignar"}>
          {fila.responsableId || "Sin asignar"}
        </span>
      ),
    },
  ];

  /* ── Modo auditoría: lo que hay que poder demostrar ──────────────── */
  const columnasAuditoria: ColumnaTabla<ExpedienteCabecera>[] = [
    columnaSeleccion,
    {
      clave: "identificador",
      encabezado: "Identificador",
      render: (fila) => (
        <div className="min-w-0">
          <p className="doc-metric truncate text-xs font-semibold text-[color:var(--doc-text)]">{fila.identificador}</p>
          <p className="truncate text-[11px] text-[color:var(--doc-text-faint)]">{fila.nombre}</p>
        </div>
      ),
    },
    {
      clave: "version",
      encabezado: "Versión",
      numerica: true,
      render: (fila) => <span title="Versión del registro; el backend la usa para detectar escrituras simultáneas">v{fila.version}</span>,
    },
    {
      clave: "estado",
      encabezado: "Estado",
      render: (fila) => (
        <ChipEstado
          estado={fila.estado}
          etiqueta={ETIQUETA_EXPEDIENTE[fila.estado] ?? fila.estado}
          intencion={INTENCION_EXPEDIENTE[fila.estado] ?? "neutral"}
        />
      ),
    },
    {
      clave: "actualizado",
      encabezado: "Última modificación",
      render: (fila) => (
        <div className="min-w-0">
          <p className="doc-metric truncate text-xs text-[color:var(--doc-text)]">{fechaHora(fila.actualizadoEn)}</p>
          <p className="truncate text-[11px] text-[color:var(--doc-text-faint)]">{fila.actualizadoPor || "sin registro de autor"}</p>
        </div>
      ),
    },
    {
      clave: "creado",
      encabezado: "Apertura",
      secundaria: true,
      render: (fila) => (
        <div className="min-w-0">
          <p className="doc-metric truncate text-xs text-[color:var(--doc-text)]">{fechaCorta(fila.creadoEn)}</p>
          <p className="truncate text-[11px] text-[color:var(--doc-text-faint)]">{fila.creadoPor || "sin registro de autor"}</p>
        </div>
      ),
    },
    {
      clave: "archivado",
      encabezado: "Cierre",
      secundaria: true,
      render: (fila) =>
        fila.archivadoEn ? (
          <span className="doc-metric text-xs" title={`Archivado por ${fila.archivadoPor || "sin registro"}`}>
            {fechaCorta(fila.archivadoEn)}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--doc-text-faint)]">Abierto</span>
        ),
    },
    {
      clave: "operacion",
      encabezado: "Operación",
      secundaria: true,
      render: (fila) => (
        <span className="doc-metric text-[11px] text-[color:var(--doc-text-muted)]" title="Estado de operación informado por el backend">
          {fila.estadoOperacion || "—"}
        </span>
      ),
    },
    { clave: "anio", encabezado: "Año del libro", numerica: true, secundaria: true, render: (fila) => <span>{fila.anio || "—"}</span> },
  ];

  const columnas = modoLista === "auditoria" ? columnasAuditoria : columnasOperativo;

  const panelFiltros = (
    <PanelFiltros
      filtros={filtros}
      catalogo={catalogo}
      textoRetrasado={textoRetrasado}
      filtrosGuardados={filtrosGuardados}
      onLimpiar={() => {
        limpiarFiltros();
        setTexto("");
      }}
      avisar={avisar}
    />
  );

  return (
    <div className="space-y-3">
      {/* ── Barra de trabajo ──────────────────────────────────────── */}
      <div className="doc-raised doc-no-print space-y-2.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Buscador
            valor={texto}
            onChange={(v) => {
              setTexto(v);
              ponerFiltros({ texto: v });
            }}
            placeholder="Buscar por nombre, identificador, cargo o agencia…"
            etiqueta="Buscar expedientes"
          />
          <Boton
            variante={activos ? "primario" : "suave"}
            onClick={() => setVerFiltros((v) => !v)}
            titulo="Mostrar u ocultar los filtros avanzados"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden /> Filtros{activos ? ` (${activos})` : ""}
          </Boton>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmento<ModoLista>
              etiqueta="Modo de lectura de la lista"
              valor={modoLista}
              onChange={ponerModoLista}
              opciones={[
                { valor: "operativo", etiqueta: "Operativo", icono: <Columns3 className="h-3 w-3" aria-hidden />, titulo: "Estado, avance, faltantes y plazos" },
                {
                  valor: "auditoria",
                  etiqueta: "Auditoría",
                  icono: <ShieldCheck className="h-3 w-3" aria-hidden />,
                  titulo: "Identificador, versión, autoría y fechas",
                },
              ]}
            />
            <Segmento<VistaLista>
              etiqueta="Disposición de la lista"
              valor={vistaLista}
              onChange={ponerVistaLista}
              opciones={[
                { valor: "tabla", etiqueta: "Tabla", icono: <Table2 className="h-3 w-3" aria-hidden />, titulo: "Para comparar filas" },
                { valor: "tarjetas", etiqueta: "Tarjetas", icono: <LayoutGrid className="h-3 w-3" aria-hidden />, titulo: "Para leer una por una" },
              ]}
            />
            <Segmento<Densidad>
              etiqueta="Densidad de la lista"
              valor={densidad}
              onChange={ponerDensidad}
              opciones={[
                { valor: "compacta", etiqueta: "Compacta", icono: <Rows4 className="h-3 w-3" aria-hidden />, titulo: "Más filas en pantalla" },
                { valor: "comoda", etiqueta: "Cómoda", icono: <Rows3 className="h-3 w-3" aria-hidden /> },
                { valor: "amplia", etiqueta: "Amplia", icono: <Rows3 className="h-3 w-3" aria-hidden />, titulo: "Más aire entre filas" },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[color:var(--doc-text-faint)]">
              Ordenar por
              <select
                value={filtros.orden ?? "reciente"}
                onChange={(e) => ponerFiltros({ orden: e.target.value })}
                className="rounded-[var(--doc-radius-sm)] border border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-2 py-1 text-[11px] text-[color:var(--doc-text)]"
              >
                {ORDENES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <Boton
              variante="fantasma"
              onClick={() => ponerFiltros({ direccion: filtros.direccion === "asc" ? "desc" : "asc" })}
              titulo="Invertir el orden"
            >
              {filtros.direccion === "asc" ? "Ascendente" : "Descendente"}
            </Boton>
          </div>
        </div>

        {/* Filtros aplicados, visibles y quitables de uno en uno. */}
        {(chips.length > 0 || textoRetrasado) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--doc-border)] pt-2.5">
            <span className="doc-eyebrow">Filtros aplicados</span>
            {textoRetrasado && (
              <ChipFiltro
                etiqueta="Texto"
                valor={textoRetrasado}
                onQuitar={() => {
                  setTexto("");
                  ponerFiltros({ texto: "" });
                }}
              />
            )}
            {chips.map((chip) => (
              <ChipFiltro
                key={String(chip.clave)}
                etiqueta={chip.etiqueta}
                valor={chip.valor}
                onQuitar={() => ponerFiltros({ [chip.clave]: chip.vacio } as Partial<FiltrosExpedientes>)}
              />
            ))}
            <Boton
              variante="fantasma"
              onClick={() => {
                limpiarFiltros();
                setTexto("");
              }}
            >
              Limpiar todo
            </Boton>
          </div>
        )}
      </div>

      {!estrecha && verFiltros && panelFiltros}

      {estrecha && (
        <Lateral
          abierto={verFiltros}
          onCerrar={() => setVerFiltros(false)}
          titulo="Filtros avanzados"
          subtitulo="Se aplican al cerrar; el resultado se actualiza al momento."
          ancho="max-w-md"
          pie={
            <div className="flex items-center justify-between gap-2">
              <Boton
                variante="fantasma"
                onClick={() => {
                  limpiarFiltros();
                  setTexto("");
                }}
              >
                Limpiar todo
              </Boton>
              <Boton variante="primario" onClick={() => setVerFiltros(false)}>
                Ver resultados
              </Boton>
            </div>
          }
        >
          {panelFiltros}
        </Lateral>
      )}

      {listado.error && (
        <DocError
          titulo="No se pudo cargar la lista"
          error={listado.error}
          onReintentar={listado.recargar}
          reintentando={listado.cargando}
        />
      )}

      {/* ── Recuento y acciones sobre la selección ───────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="doc-prose doc-metric text-xs text-[color:var(--doc-text-muted)]" role="status" aria-live="polite">
          {cargandoPrimera
            ? "Consultando expedientes…"
            : listado.datos
              ? `${listado.datos.total} expediente(s) en la consulta · ${expedientes.length} en esta página` +
                (resumen ? ` · avance promedio ${resumen.avancePromedio}% · ${resumen.completos} completo(s) · ${resumen.observados} con observaciones` : "")
              : "Sin datos"}
        </p>

        {seleccion.length > 0 && (
          <div className="doc-no-print flex items-center gap-2">
            <span className="doc-metric text-xs text-[color:var(--doc-text)]">{seleccion.length} seleccionado(s)</span>
            {capacidades.solicitar && (
              <Boton variante="primario" onClick={() => setMasivaAbierta(true)}>
                <Send className="h-3.5 w-3.5" aria-hidden /> Solicitar documentación
              </Boton>
            )}
            <Boton variante="fantasma" onClick={() => setSeleccion([])}>
              <X className="h-3.5 w-3.5" aria-hidden /> Quitar selección
            </Boton>
          </div>
        )}
      </div>

      {/* ── La lista ─────────────────────────────────────────────── */}
      <Panel denso>
        {cargandoPrimera ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Cargando la lista de expedientes…</span>
            <EsqueletoTabla columnas={columnas.length} />
          </div>
        ) : vistaLista === "tarjetas" ? (
          <ListaTarjetas expedientes={expedientes} onAbrir={abrir} vacio={<VacioDeLista activos={activos} consulta={textoRetrasado} onLimpiar={() => { limpiarFiltros(); setTexto(""); }} />} />
        ) : (
          <Tabla
            columnas={columnas}
            filas={expedientes}
            claveFila={(fila) => fila.expedienteId}
            onFila={(fila) => abrir(fila.expedienteId)}
            etiquetaAbrir={(fila) => `Abrir el expediente de ${fila.nombre}`}
            nombreVista={(fila) => vistaDeExpediente(fila.expedienteId)}
            densidad={densidad}
            titulo={modoLista === "auditoria" ? "Expedientes documentales, vista de auditoría" : "Expedientes documentales"}
            vacio={<VacioDeLista activos={activos} consulta={textoRetrasado} onLimpiar={() => { limpiarFiltros(); setTexto(""); }} />}
          />
        )}

        {listado.datos && (
          <Paginacion
            pagina={listado.datos.pagina}
            paginas={listado.datos.paginas}
            total={listado.datos.total}
            porPagina={listado.datos.porPagina}
            onPagina={(pagina) => ponerFiltros({ pagina })}
          />
        )}
      </Panel>

      <AltaExpedienteWizard
        abierta={altaAbierta}
        onCerrar={() => onCerrarAlta?.()}
        onCreado={(expedienteId, requisitos) => {
          onCerrarAlta?.();
          listado.recargar();
          avisar("exito", `Expediente creado con ${requisitos} requisitos.`);
          onAbrir(expedienteId);
        }}
        onError={(mensaje, pista) => avisar("peligro", mensaje, pista)}
      />

      <SolicitudMasiva
        abierta={masivaAbierta}
        seleccion={seleccion}
        onCerrar={() => setMasivaAbierta(false)}
        onTerminada={(creadas) => {
          setMasivaAbierta(false);
          setSeleccion([]);
          listado.recargar();
          avisar("exito", `${creadas} solicitud(es) creada(s).`);
        }}
        onError={(mensaje, pista) => avisar("peligro", mensaje, pista)}
      />
    </div>
  );
}

/**
 * Vacío de la lista.
 *
 * Distingue los tres casos que de verdad ocurren: no hay expedientes, la
 * búsqueda no encontró nada, o los filtros dejaron la lista sin filas. Cada uno
 * tiene una salida distinta.
 */
function VacioDeLista({ activos, consulta, onLimpiar }: { activos: number; consulta?: string; onLimpiar: () => void }) {
  if (activos > 0 || consulta) {
    return <DocSinResultados consulta={consulta} filtrosActivos={activos} onLimpiar={onLimpiar} />;
  }
  return (
    <DocVacio
      icono="carpeta"
      titulo="Todavía no hay expedientes"
      detalle="Un expediente se abre al incorporar a una persona: la rama que elijas determina qué requisitos se le van a exigir."
      siguientePaso="Crea el primero con «Nuevo expediente», arriba a la derecha."
    />
  );
}

/* ------------------------------------------------------------------ */
/* Vista de tarjetas                                                   */
/* ------------------------------------------------------------------ */

/**
 * La misma lista, en tarjetas.
 *
 * Sirve para dos cosas distintas: leer un expediente a la vez en escritorio, y
 * ser la disposición natural en el móvil. Cada tarjeta lleva lo que hace falta
 * para decidir si hay que abrirla —estado, avance, qué falta, qué plazo— y una
 * frase con lo que la desbloquea.
 */
function ListaTarjetas({
  expedientes,
  onAbrir,
  vacio,
}: {
  expedientes: ExpedienteCabecera[];
  onAbrir: (expedienteId: string) => void;
  vacio: React.ReactNode;
}) {
  if (!expedientes.length) return <>{vacio}</>;
  return (
    <ul className="doc-list-long grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {expedientes.map((expediente) => {
        const incidencia = incidenciaDe(expediente);
        return (
          <li key={expediente.expedienteId}>
            <article className="doc-surface doc-print-keep flex h-full flex-col gap-2 p-3.5" style={nombreDeVistaSeguro(expediente.expedienteId)}>
              <header className="min-w-0">
                <TextoCompleto texto={expediente.nombre} className="text-sm font-semibold text-[color:var(--doc-text)]" />
                <p className="doc-metric mt-0.5 truncate text-[11px] text-[color:var(--doc-text-faint)]">
                  {expediente.identificador}
                  {expediente.cargo ? ` · ${expediente.cargo}` : ""}
                </p>
              </header>

              <div className="flex flex-wrap items-center gap-1.5">
                <ChipEstado
                  compacto
                  estado={expediente.estado}
                  etiqueta={ETIQUETA_EXPEDIENTE[expediente.estado] ?? expediente.estado}
                  intencion={INTENCION_EXPEDIENTE[expediente.estado] ?? "neutral"}
                  prorroga={expediente.estado === "CON_PRORROGA"}
                />
                <ChipEstado compacto estado={incidencia.tipo} etiqueta={incidencia.tipo} intencion={incidencia.intencion} />
              </div>

              <BarraAvance valor={expediente.porcentaje} etiqueta={`Avance de ${expediente.nombre}`} />

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <Dato etiqueta="Faltan" valor={`${expediente.totales.pendientes + expediente.totales.noEntregados}`} />
                <Dato etiqueta="Observados" valor={`${expediente.totales.observados}`} />
                <Dato etiqueta="Plazo" valor={expediente.proximaFechaCritica ? textoPlazo(expediente.proximaFechaCritica) : "Sin plazo"} />
                <Dato etiqueta="Responsable" valor={expediente.responsableId || "Sin asignar"} />
                <Dato etiqueta="Agencia" valor={expediente.agencia || "No registrada"} />
                <Dato etiqueta="Gerencia" valor={expediente.gerencia || "No registrada"} />
              </dl>

              <p className="doc-prose text-[11px] text-[color:var(--doc-text-muted)]">{incidencia.siguientePaso}</p>

              <div className="mt-auto flex justify-end">
                <Boton variante="suave" onClick={() => onAbrir(expediente.expedienteId)} titulo={`Abrir el expediente de ${expediente.nombre}`}>
                  Abrir expediente
                </Boton>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function nombreDeVistaSeguro(expedienteId: string) {
  return { viewTransitionName: vistaDeExpediente(expedienteId) } as React.CSSProperties;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[color:var(--doc-text-faint)]">{etiqueta}</dt>
      <dd className="truncate font-medium text-[color:var(--doc-text-muted)]" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de filtros                                                    */
/* ------------------------------------------------------------------ */

function PanelFiltros({
  filtros,
  catalogo,
  textoRetrasado,
  filtrosGuardados,
  onLimpiar,
  avisar,
}: {
  filtros: FiltrosExpedientes;
  catalogo: CatalogoCliente | null;
  textoRetrasado: string;
  filtrosGuardados: EstadoDatos<Awaited<ReturnType<typeof docApi.listarFiltros>>>;
  onLimpiar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const agencias = catalogo?.auxiliares.agencia_bdp ?? [];
  const gerencias = catalogo?.auxiliares.gerencia_bdp ?? [];

  return (
    <Panel
      titulo="Filtros avanzados"
      descripcion="Se combinan entre sí. El servidor aplica todos y devuelve una página."
      acciones={
        <>
          <Boton variante="fantasma" onClick={onLimpiar}>
            Limpiar
          </Boton>
          <GuardarFiltro
            filtros={{ ...filtros, texto: textoRetrasado }}
            onGuardado={(nombre) => {
              filtrosGuardados.recargar();
              avisar("exito", `Filtro «${nombre}» guardado.`);
            }}
            onError={(mensaje, pista) => avisar("peligro", mensaje, pista)}
          />
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Estado">
          <Selector
            valor={filtros.estado ?? ""}
            onChange={(v) => ponerFiltros({ estado: v })}
            placeholder="Todos"
            opciones={ESTADOS_EXPEDIENTE.map((estado) => ({ valor: estado, etiqueta: ETIQUETA_EXPEDIENTE[estado] }))}
          />
        </Campo>
        <Campo etiqueta="Agencia">
          <Selector
            valor={filtros.agencia ?? ""}
            onChange={(v) => ponerFiltros({ agencia: v })}
            placeholder="Todas"
            opciones={agencias.map((a) => ({ valor: a, etiqueta: a }))}
          />
        </Campo>
        <Campo etiqueta="Gerencia">
          <Selector
            valor={filtros.gerencia ?? ""}
            onChange={(v) => ponerFiltros({ gerencia: v })}
            placeholder="Todas"
            opciones={gerencias.map((g) => ({ valor: g, etiqueta: g }))}
          />
        </Campo>
        <Campo etiqueta="Tipo de funcionario">
          <Selector
            valor={filtros.tipoFuncionario ?? ""}
            onChange={(v) => ponerFiltros({ tipoFuncionario: v })}
            placeholder="Todos"
            opciones={TIPOS_FUNCIONARIO.map((t) => ({ valor: t.codigo, etiqueta: t.etiqueta }))}
          />
        </Campo>
        <Campo etiqueta="Tipo de garantía">
          <Selector
            valor={filtros.tipoGarantia ?? ""}
            onChange={(v) => ponerFiltros({ tipoGarantia: v })}
            placeholder="Todos"
            opciones={TIPOS_GARANTIA.map((t) => ({ valor: t.codigo, etiqueta: t.etiqueta }))}
          />
        </Campo>
        <Campo etiqueta="Responsable">
          <Entrada
            value={filtros.responsable ?? ""}
            onChange={(e) => ponerFiltros({ responsable: e.target.value })}
            placeholder="Nombre o correo"
          />
        </Campo>
        <Campo etiqueta="Ingreso desde">
          <Entrada type="date" value={filtros.ingresoDesde ?? ""} onChange={(e) => ponerFiltros({ ingresoDesde: e.target.value })} />
        </Campo>
        <Campo etiqueta="Ingreso hasta">
          <Entrada type="date" value={filtros.ingresoHasta ?? ""} onChange={(e) => ponerFiltros({ ingresoHasta: e.target.value })} />
        </Campo>
        <Campo etiqueta="Avance mínimo (%)">
          <Entrada
            type="number"
            min={0}
            max={100}
            value={filtros.progresoMin === "" ? "" : filtros.progresoMin}
            onChange={(e) => ponerFiltros({ progresoMin: e.target.value === "" ? "" : Number(e.target.value) })}
          />
        </Campo>
        <Campo etiqueta="Avance máximo (%)">
          <Entrada
            type="number"
            min={0}
            max={100}
            value={filtros.progresoMax === "" ? "" : filtros.progresoMax}
            onChange={(e) => ponerFiltros({ progresoMax: e.target.value === "" ? "" : Number(e.target.value) })}
          />
        </Campo>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-[color:var(--doc-border)] pt-3">
        <Interruptor activo={filtros.conPendientes === true} onChange={(v) => ponerFiltros({ conPendientes: v })} etiqueta="Con pendientes" />
        <Interruptor
          activo={filtros.conNoEntregados === true}
          onChange={(v) => ponerFiltros({ conNoEntregados: v })}
          etiqueta="Con no entregados"
        />
        <Interruptor activo={filtros.conObservados === true} onChange={(v) => ponerFiltros({ conObservados: v })} etiqueta="Con observaciones" />
        <Interruptor activo={filtros.conProrrogas === true} onChange={(v) => ponerFiltros({ conProrrogas: v })} etiqueta="Con prórrogas" />
        <Interruptor
          activo={filtros.conProrrogasVencidas === true}
          onChange={(v) => ponerFiltros({ conProrrogasVencidas: v })}
          etiqueta="Prórrogas vencidas"
        />
        <Interruptor
          activo={filtros.conSolicitudesVencidas === true}
          onChange={(v) => ponerFiltros({ conSolicitudesVencidas: v })}
          etiqueta="Solicitudes vencidas"
        />
        <Interruptor
          activo={filtros.conTareasVencidas === true}
          onChange={(v) => ponerFiltros({ conTareasVencidas: v })}
          etiqueta="Tareas vencidas"
        />
        <Interruptor
          activo={filtros.incluirArchivados === true}
          onChange={(v) => ponerFiltros({ incluirArchivados: v })}
          etiqueta="Incluir archivados"
        />
      </div>

      {!!filtrosGuardados.datos?.filtros.length && (
        <div className="mt-3 border-t border-[color:var(--doc-border)] pt-3">
          <p className="doc-eyebrow mb-2">Filtros guardados</p>
          <ul className="flex flex-wrap gap-2">
            {filtrosGuardados.datos.filtros.map((guardado) => (
              <li key={guardado.filtroId} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    ponerFiltros(guardado.definicion as Record<string, never>);
                  }}
                  className="doc-tap rounded-full px-3 py-1 text-xs text-[color:var(--doc-text)] transition-colors"
                  style={{ background: "var(--doc-surface-raised)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
                  title={guardado.descripcion || `Aplicar «${guardado.nombre}»`}
                >
                  {guardado.nombre}
                  {guardado.compartido && <span className="ml-1 text-[10px] text-[color:var(--doc-text-faint)]">· compartido</span>}
                </button>
                {guardado.propio && (
                  <button
                    type="button"
                    aria-label={`Borrar filtro ${guardado.nombre}`}
                    onClick={async () => {
                      try {
                        await docApi.eliminarFiltro(guardado.filtroId);
                        filtrosGuardados.recargar();
                      } catch (error) {
                        const fallo = error as { message?: string; pista?: string };
                        avisar("peligro", fallo.message ?? "No se pudo borrar el filtro.", fallo.pista);
                      }
                    }}
                    className="doc-tap rounded-full p-1 text-[color:var(--doc-text-faint)] transition-colors hover:text-[color:var(--doc-danger-fg)]"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Guardar filtro                                                      */
/* ------------------------------------------------------------------ */

function GuardarFiltro({
  filtros,
  onGuardado,
  onError,
}: {
  filtros: Record<string, unknown>;
  onGuardado: (nombre: string) => void;
  onError: (mensaje: string, pista?: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [compartido, setCompartido] = useState(false);
  const [guardando, setGuardando] = useState(false);

  if (!abierto) {
    return (
      <Boton variante="suave" onClick={() => setAbierto(true)}>
        <Save className="h-3.5 w-3.5" aria-hidden /> Guardar filtro
      </Boton>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        setGuardando(true);
        try {
          await docApi.guardarFiltro({ nombre: nombre.trim(), definicion: filtrosParaBackend(filtros as never), compartido });
          onGuardado(nombre.trim());
          setNombre("");
          setAbierto(false);
        } catch (error) {
          const e2 = error as { message?: string; pista?: string };
          onError(e2.message ?? "No se pudo guardar el filtro.", e2.pista);
        } finally {
          setGuardando(false);
        }
      }}
    >
      <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del filtro" aria-label="Nombre del filtro" />
      <Interruptor activo={compartido} onChange={setCompartido} etiqueta="Compartir" />
      <Boton tipo="submit" variante="primario" cargando={guardando} disabled={!nombre.trim()}>
        Guardar
      </Boton>
      <Boton variante="fantasma" onClick={() => setAbierto(false)}>
        Cancelar
      </Boton>
    </form>
  );
}


/* ------------------------------------------------------------------ */
/* Solicitud masiva                                                    */
/* ------------------------------------------------------------------ */

/**
 * Solicitud masiva con impacto previo y proceso por lotes.
 *
 * El impacto se calcula ANTES de escribir nada: cuántos expedientes, cuántos sin
 * pendientes (que se omitirán) y cuántos ya tienen una solicitud abierta. Después
 * se procesa en lotes mostrando progreso real, no una barra decorativa: cada lote
 * es una petición y el backend dice desde dónde seguir.
 */
function SolicitudMasiva({
  abierta,
  seleccion,
  onCerrar,
  onTerminada,
  onError,
}: {
  abierta: boolean;
  seleccion: string[];
  onCerrar: () => void;
  onTerminada: (creadas: number) => void;
  onError: (mensaje: string, pista?: string) => void;
}) {
  const [titulo, setTitulo] = useState("Documentación pendiente");
  const [descripcion, setDescripcion] = useState("");
  const [fechaLimite, setFechaLimite] = useState(fechaEnDias(5));
  const [prioridad, setPrioridad] = useState("MEDIA");
  const [permitirDuplicados, setPermitirDuplicados] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const impacto = useDatos(() => docApi.impactoMasivo({ expedienteIds: seleccion }), [seleccion.join(",")], {
    activo: abierta && seleccion.length > 0,
  });

  async function ejecutar() {
    setConfirmando(false);
    setProgreso({ hechos: 0, total: impacto.datos?.expedientes ?? seleccion.length });
    let creadas = 0;
    let desde = 0;
    try {
      // Bucle de lotes: el backend devuelve `siguiente` y `quedan`, así que la
      // interfaz puede reanudar exactamente donde se quedó si algo se corta.
      for (let vuelta = 0; vuelta < 50; vuelta += 1) {
        const res = await docApi.solicitudMasiva({
          seleccion: { expedienteIds: seleccion },
          confirmado: true,
          desde,
          lote: 50,
          titulo,
          descripcion,
          fechaLimite,
          prioridad,
          permitirDuplicados,
        });
        creadas += res.creadas;
        desde = res.siguiente;
        setProgreso({ hechos: res.siguiente, total: res.total });
        if (!res.quedan) break;
      }
      onTerminada(creadas);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      onError(fallo.message ?? "No se pudieron crear las solicitudes.", fallo.pista);
    } finally {
      setProgreso(null);
    }
  }

  return (
    <>
      <Lateral
        abierto={abierta}
        onCerrar={onCerrar}
        titulo="Solicitar documentación en bloque"
        subtitulo={`${seleccion.length} expediente(s) seleccionado(s)`}
        ancho="max-w-xl"
        bloqueado={!!progreso}
        pie={
          <div className="flex flex-wrap items-center justify-between gap-3">
            {progreso ? (
              <div className="min-w-[12rem] flex-1">
                <p className="doc-metric text-xs text-[color:var(--doc-text-muted)]" role="status" aria-live="polite">
                  Procesando {progreso.hechos} de {progreso.total}…
                </p>
                <div className="doc-medidor mt-1">
                  <span
                    style={{
                      width: `${progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0}%`,
                      background: "var(--doc-info)",
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="doc-prose text-[11px] text-[color:var(--doc-text-faint)]">Se procesa en lotes de 50 y se puede reanudar.</p>
            )}
            <div className="flex gap-2">
              <Boton variante="suave" onClick={onCerrar} disabled={!!progreso}>
                Cerrar
              </Boton>
              <Boton variante="primario" onClick={() => setConfirmando(true)} disabled={!seleccion.length || !!progreso}>
                Revisar y crear
              </Boton>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {impacto.datos && (
            <Panel titulo="Impacto" descripcion="Lo que va a ocurrir si confirmas.">
              <ul className="space-y-1 text-xs text-[color:var(--doc-text-muted)]">
                <li>{impacto.datos.expedientes} expediente(s) en la selección.</li>
                <li>{impacto.datos.conPendientes} con requisitos pendientes: recibirán solicitud.</li>
                <li>{impacto.datos.sinPendientes} sin pendientes: se omitirán.</li>
                <li>{impacto.datos.duplicadosPotenciales} ya tienen una solicitud abierta.</li>
              </ul>
              {impacto.datos.advertencias.map((aviso) => (
                <Aviso key={aviso} intencion="aviso">
                  {aviso}
                </Aviso>
              ))}
            </Panel>
          )}

          <Panel titulo="Contenido de la solicitud">
            <div className="space-y-3">
              <Campo etiqueta="Título">
                <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </Campo>
              <Campo etiqueta="Instrucciones" ayuda="Se guardan en la solicitud y se pueden citar después.">
                <Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se pide y cómo entregarlo" />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Fecha límite">
                  <Entrada type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
                </Campo>
                <Campo etiqueta="Prioridad">
                  <Selector
                    valor={prioridad}
                    onChange={setPrioridad}
                    opciones={[
                      { valor: "BAJA", etiqueta: "Baja" },
                      { valor: "MEDIA", etiqueta: "Media" },
                      { valor: "ALTA", etiqueta: "Alta" },
                      { valor: "URGENTE", etiqueta: "Urgente" },
                    ]}
                  />
                </Campo>
              </div>
              <Interruptor
                activo={permitirDuplicados}
                onChange={setPermitirDuplicados}
                etiqueta="Crear también donde ya hay una solicitud abierta"
              />
            </div>
          </Panel>
        </div>
      </Lateral>

      <Confirmacion
        abierta={confirmando}
        titulo="Crear solicitudes"
        detalle="Se creará una solicitud por expediente con requisitos pendientes."
        impacto={
          impacto.datos ? (
            <ul className="space-y-1">
              <li>Se crearán hasta {impacto.datos.conPendientes} solicitud(es).</li>
              <li>Se omitirán {impacto.datos.sinPendientes} sin pendientes.</li>
              {!permitirDuplicados && impacto.datos.duplicadosPotenciales > 0 && (
                <li>Se omitirán {impacto.datos.duplicadosPotenciales} con solicitud abierta.</li>
              )}
              <li>Fecha límite: {fechaCorta(fechaLimite)}.</li>
            </ul>
          ) : null
        }
        textoConfirmar="Crear solicitudes"
        onConfirmar={ejecutar}
        onCancelar={() => setConfirmando(false)}
      />
    </>
  );
}
