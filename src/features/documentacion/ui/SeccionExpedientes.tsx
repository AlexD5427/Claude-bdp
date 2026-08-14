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
 */

import { useMemo, useState } from "react";
import { FolderPlus, Filter, Save, Send, Trash2, X } from "lucide-react";
import { docApi, type ListadoExpedientes } from "../api/acciones";
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
  filtrosActivos,
  filtrosParaBackend,
  resumenDeLista,
  textoPlazo,
  type ExpedienteCabecera,
} from "../domain/progreso";
import { limpiarFiltros, ponerFiltros, useConsola } from "../state/consola";
import {
  Aviso,
  BarraAvance,
  Boton,
  Buscador,
  Campo,
  ChipEstado,
  Confirmacion,
  Entrada,
  Interruptor,
  Lateral,
  Paginacion,
  Panel,
  Selector,
  Tabla,
  usarDebounce,
  type ColumnaTabla,
  type Notita,
} from "./piezas";
import { useDatos } from "./useDatos";

interface Props {
  onAbrir: (expedienteId: string) => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}

export function SeccionExpedientes({ onAbrir, avisar }: Props) {
  const { filtros, catalogo, capacidades, densidad, conexion } = useConsola();
  const [texto, setTexto] = useState(filtros.texto ?? "");
  const textoRetrasado = usarDebounce(texto, 350);
  const [verFiltros, setVerFiltros] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [masivaAbierta, setMasivaAbierta] = useState(false);

  const consulta = useMemo(
    () => filtrosParaBackend({ ...filtros, texto: textoRetrasado }),
    [filtros, textoRetrasado],
  );

  const listado = useDatos<ListadoExpedientes>(() => docApi.listarExpedientes(consulta), [JSON.stringify(consulta)], {
    activo: conexion === "conectado",
  });

  const filtrosGuardados = useDatos(() => docApi.listarFiltros(), [], { activo: conexion === "conectado" });

  const agencias = catalogo?.auxiliares.agencia_bdp ?? [];
  const gerencias = catalogo?.auxiliares.gerencia_bdp ?? [];
  const expedientes = listado.datos?.expedientes ?? [];
  const activos = filtrosActivos({ ...filtros, texto: textoRetrasado });

  const columnas: ColumnaTabla<ExpedienteCabecera>[] = [
    {
      clave: "seleccion",
      encabezado: "",
      render: (fila) => (
        <input
          type="checkbox"
          checked={seleccion.includes(fila.expedienteId)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            setSeleccion((prev) =>
              prev.includes(fila.expedienteId) ? prev.filter((id) => id !== fila.expedienteId) : [...prev, fila.expedienteId],
            );
          }}
          aria-label={`Seleccionar ${fila.nombre}`}
          className="h-4 w-4 rounded border-[color:var(--hairline)]"
        />
      ),
    },
    {
      clave: "persona",
      encabezado: "Persona",
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fila.nombre}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {fila.identificador}
            {fila.cargo ? ` · ${fila.cargo}` : ""}
          </p>
        </div>
      ),
    },
    {
      clave: "ubicacion",
      encabezado: "Agencia / gerencia",
      secundaria: true,
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink">{fila.agencia || "—"}</p>
          <p className="truncate text-[11px] text-ink-faint">{fila.gerencia || "—"}</p>
        </div>
      ),
    },
    {
      clave: "rama",
      encabezado: "Rama",
      secundaria: true,
      render: (fila) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-ink">{fila.tipoFuncionarioEtiqueta}</p>
          {fila.tipoGarantia !== "NINGUNA" && <p className="truncate text-[11px] text-ink-faint">{fila.tipoGarantiaEtiqueta}</p>}
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
        />
      ),
    },
    {
      clave: "avance",
      encabezado: "Avance",
      render: (fila) => <BarraAvance valor={fila.porcentaje} etiqueta={`Avance de ${fila.nombre}`} />,
    },
    {
      clave: "pendientes",
      encabezado: "Pend.",
      numerica: true,
      render: (fila) => (
        <span title={`${fila.totales.pendientes} pendientes, ${fila.totales.noEntregados} no entregados`}>
          {fila.totales.pendientes + fila.totales.noEntregados}
        </span>
      ),
    },
    {
      clave: "observados",
      encabezado: "Obs.",
      numerica: true,
      secundaria: true,
      render: (fila) => <span>{fila.totales.observados}</span>,
    },
    {
      clave: "critica",
      encabezado: "Próxima fecha",
      render: (fila) =>
        fila.proximaFechaCritica ? (
          <span
            className={fila.diasParaFechaCritica !== null && fila.diasParaFechaCritica < 0 ? "text-rose-300" : "text-ink-soft"}
            title={fechaCorta(fila.proximaFechaCritica)}
          >
            {textoPlazo(fila.proximaFechaCritica)}
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Barra de trabajo */}
      <div className="flex flex-wrap items-center gap-2">
        <Buscador
          valor={texto}
          onChange={(v) => {
            setTexto(v);
            ponerFiltros({ texto: v });
          }}
          placeholder="Buscar por nombre, identificador, cargo o agencia…"
        />
        <Boton variante="suave" onClick={() => setVerFiltros((v) => !v)} titulo="Mostrar u ocultar filtros">
          <Filter className="h-3.5 w-3.5" aria-hidden /> Filtros{activos ? ` (${activos})` : ""}
        </Boton>
        {capacidades.editar && (
          <Boton variante="primario" onClick={() => setAltaAbierta(true)}>
            <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Nuevo expediente
          </Boton>
        )}
      </div>

      {verFiltros && (
        <Panel
          titulo="Filtros"
          descripcion="Se combinan entre sí. El servidor aplica todos y devuelve una página."
          acciones={
            <>
              <Boton
                variante="fantasma"
                onClick={() => {
                  limpiarFiltros();
                  setTexto("");
                }}
              >
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
            <Campo etiqueta="Ordenar por">
              <Selector
                valor={filtros.orden ?? "reciente"}
                onChange={(v) => ponerFiltros({ orden: v })}
                opciones={[
                  { valor: "reciente", etiqueta: "Más recientes" },
                  { valor: "actualizado", etiqueta: "Última actualización" },
                  { valor: "nombre", etiqueta: "Nombre" },
                  { valor: "avance", etiqueta: "Avance" },
                  { valor: "pendientes", etiqueta: "Pendientes" },
                  { valor: "critica", etiqueta: "Próxima fecha crítica" },
                  { valor: "ingreso", etiqueta: "Fecha de ingreso" },
                ]}
              />
            </Campo>
            <Campo etiqueta="Dirección">
              <Selector
                valor={filtros.direccion ?? "desc"}
                onChange={(v) => ponerFiltros({ direccion: v === "asc" ? "asc" : "desc" })}
                opciones={[
                  { valor: "desc", etiqueta: "Descendente" },
                  { valor: "asc", etiqueta: "Ascendente" },
                ]}
              />
            </Campo>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <Interruptor activo={filtros.conPendientes === true} onChange={(v) => ponerFiltros({ conPendientes: v })} etiqueta="Con pendientes" />
            <Interruptor activo={filtros.conNoEntregados === true} onChange={(v) => ponerFiltros({ conNoEntregados: v })} etiqueta="Con no entregados" />
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
            <div className="mt-3 border-t border-[color:var(--hairline)] pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-faint">Filtros guardados</p>
              <ul className="flex flex-wrap gap-2">
                {filtrosGuardados.datos.filtros.map((guardado) => (
                  <li key={guardado.filtroId} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        ponerFiltros(guardado.definicion as Record<string, never>);
                        setTexto(String((guardado.definicion as { texto?: string }).texto ?? ""));
                      }}
                      className="rounded-full bg-[color:var(--fill-2)] px-3 py-1 text-xs text-ink hover:bg-[color:var(--fill-3)]"
                      title={guardado.descripcion || `Aplicar «${guardado.nombre}»`}
                    >
                      {guardado.nombre}
                      {guardado.compartido && <span className="ml-1 text-[10px] text-ink-faint">· compartido</span>}
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
                            avisar("peligro", "No se pudo borrar el filtro.", String(error));
                          }
                        }}
                        className="rounded-full p-1 text-ink-faint hover:text-rose-300"
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
      )}

      {listado.error && (
        <Aviso intencion="peligro" titulo="No se pudo cargar la lista" accion={<Boton onClick={listado.recargar}>Reintentar</Boton>}>
          {listado.error.mensaje} {listado.error.pista}
        </Aviso>
      )}

      {/* Resumen de resultados y acciones sobre la selección */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">{resumenDeLista(expedientes)}</p>
        {seleccion.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink">{seleccion.length} seleccionado(s)</span>
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

      <Panel>
        <Tabla
          columnas={columnas}
          filas={expedientes}
          claveFila={(fila) => fila.expedienteId}
          onFila={(fila) => onAbrir(fila.expedienteId)}
          cargando={listado.cargando && !listado.datos}
          densidad={densidad}
          titulo="Expedientes documentales"
          vacio={
            <div className="py-6">
              <p className="text-center text-sm text-ink">Sin expedientes con estos filtros.</p>
              <p className="mt-1 text-center text-xs text-ink-soft">
                {activos ? "Prueba a limpiar algún filtro." : "Crea el primero con «Nuevo expediente»."}
              </p>
            </div>
          }
        />
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

      <AltaExpediente
        abierta={altaAbierta}
        onCerrar={() => setAltaAbierta(false)}
        onCreado={(expedienteId, requisitos) => {
          setAltaAbierta(false);
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
/* Alta de expediente                                                  */
/* ------------------------------------------------------------------ */

function AltaExpediente({
  abierta,
  onCerrar,
  onCreado,
  onError,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onCreado: (expedienteId: string, requisitos: number) => void;
  onError: (mensaje: string, pista?: string) => void;
}) {
  const { catalogo } = useConsola();
  const [form, setForm] = useState({
    identificador: "",
    nombre: "",
    cargo: "",
    agencia: "",
    gerencia: "",
    fechaIngreso: "",
    tipoFuncionario: "GENERAL",
    tipoGarantia: "NINGUNA",
    responsableId: "",
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  /** Clave estable por apertura del formulario: evita el alta doble. */
  const [clave] = useState(() => `alta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

  const rama = catalogo?.aplicabilidad.find(
    (a) => a.tipoFuncionario === form.tipoFuncionario && a.tipoGarantia === (form.tipoFuncionario === "COMERCIAL" ? form.tipoGarantia : "NINGUNA"),
  );
  const comercial = form.tipoFuncionario === "COMERCIAL";
  const tipoElegido = TIPOS_FUNCIONARIO.find((t) => t.codigo === form.tipoFuncionario);

  function poner(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => {
      if (!prev[campo]) return prev;
      const siguiente = { ...prev };
      delete siguiente[campo];
      return siguiente;
    });
  }

  async function enviar() {
    const locales: Record<string, string> = {};
    if (!form.identificador.trim()) locales.identificador = "Escribe el identificador (CI - proceso - año).";
    if (!form.nombre.trim()) locales.nombre = "Escribe el nombre completo.";
    if (comercial && form.tipoGarantia === "NINGUNA") locales.tipo_garantia = "Elige el tipo de garantía comercial.";
    if (Object.keys(locales).length) {
      setErrores(locales);
      return;
    }

    setGuardando(true);
    try {
      const creado = await docApi.crearExpediente({
        ...form,
        tipoGarantia: comercial ? form.tipoGarantia : "NINGUNA",
        idempotencyKey: clave,
      });
      onCreado(creado.expedienteId, creado.requisitos ?? rama?.total ?? 0);
      setForm({
        identificador: "",
        nombre: "",
        cargo: "",
        agencia: "",
        gerencia: "",
        fechaIngreso: "",
        tipoFuncionario: "GENERAL",
        tipoGarantia: "NINGUNA",
        responsableId: "",
      });
    } catch (error) {
      const fallo = error as { message?: string; pista?: string; campos?: Record<string, string> };
      if (fallo.campos && Object.keys(fallo.campos).length) setErrores(fallo.campos);
      onError(fallo.message ?? "No se pudo crear el expediente.", fallo.pista);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Lateral
      abierto={abierta}
      onCerrar={onCerrar}
      titulo="Nuevo expediente documental"
      subtitulo="Los requisitos se crean según la rama que elijas."
      ancho="max-w-2xl"
      pie={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-ink-faint">
            {rama?.habilitada
              ? `Se crearán ${rama.total} requisitos (${rama.obligatorios} obligatorios).`
              : "Elige una rama habilitada para ver los requisitos."}
          </p>
          <div className="flex gap-2">
            <Boton variante="suave" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton variante="primario" onClick={enviar} cargando={guardando} disabled={!rama?.habilitada}>
              Crear expediente
            </Boton>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Panel titulo="Datos generales">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Identificador" requerido error={errores.identificador} ayuda="Formato del área: CI - número de proceso - año.">
              <Entrada
                value={form.identificador}
                onChange={(e) => poner("identificador", e.target.value)}
                placeholder="1234567 - 45 - 2026"
                data-foco-inicial
              />
            </Campo>
            <Campo etiqueta="Nombre completo" requerido error={errores.nombre}>
              <Entrada value={form.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="Nombres y apellidos" />
            </Campo>
            <Campo etiqueta="Cargo">
              <Entrada value={form.cargo} onChange={(e) => poner("cargo", e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de ingreso" error={errores.fecha_ingreso} ayuda="Determina el año del libro y la antigüedad.">
              <Entrada type="date" value={form.fechaIngreso} onChange={(e) => poner("fechaIngreso", e.target.value)} />
            </Campo>
            <Campo etiqueta="Agencia" ayuda="Se toma del catálogo Auxiliar; puedes escribir una nueva.">
              <input
                list="doc-agencias"
                value={form.agencia}
                onChange={(e) => poner("agencia", e.target.value)}
                className="w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--fill-1)] px-3 py-2 text-sm text-ink outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/25"
              />
              <datalist id="doc-agencias">
                {(catalogo?.auxiliares.agencia_bdp ?? []).map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Campo>
            <Campo etiqueta="Gerencia">
              <input
                list="doc-gerencias"
                value={form.gerencia}
                onChange={(e) => poner("gerencia", e.target.value)}
                className="w-full rounded-xl border border-[color:var(--hairline)] bg-[color:var(--fill-1)] px-3 py-2 text-sm text-ink outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/25"
              />
              <datalist id="doc-gerencias">
                {(catalogo?.auxiliares.gerencia_bdp ?? []).map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Campo>
            <Campo etiqueta="Responsable del proceso" ayuda="Quien persigue la documentación.">
              <Entrada value={form.responsableId} onChange={(e) => poner("responsableId", e.target.value)} placeholder="Nombre o correo" />
            </Campo>
          </div>
        </Panel>

        <Panel titulo="Clasificación" descripcion="Determina qué requisitos se le van a exigir.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Tipo de funcionario" requerido error={errores.tipo_funcionario}>
              <Selector
                valor={form.tipoFuncionario}
                onChange={(v) => poner("tipoFuncionario", v)}
                opciones={TIPOS_FUNCIONARIO.map((t) => ({
                  valor: t.codigo,
                  etiqueta: t.activo ? t.etiqueta : `${t.etiqueta} (en construcción)`,
                  deshabilitado: !t.activo,
                }))}
              />
            </Campo>
            {comercial && (
              <Campo etiqueta="Tipo de garantía" requerido error={errores.tipo_garantia}>
                <Selector
                  valor={form.tipoGarantia}
                  onChange={(v) => poner("tipoGarantia", v)}
                  opciones={TIPOS_GARANTIA.filter((t) => t.codigo !== "NINGUNA").map((t) => ({ valor: t.codigo, etiqueta: t.etiqueta }))}
                  placeholder="Elige el tipo"
                />
              </Campo>
            )}
          </div>

          {tipoElegido && <p className="mt-2 text-[11px] text-ink-faint">{tipoElegido.descripcion}</p>}

          {rama?.habilitada ? (
            <div className="mt-3 rounded-2xl bg-[color:var(--fill-1)] p-3">
              <p className="text-xs font-semibold text-ink">
                {rama.total} requisitos aplicables · {rama.obligatorios} obligatorios
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                {rama.codigos
                  .slice(0, 8)
                  .map((codigo) => catalogo?.documentos.find((d) => d.codigo === codigo)?.nombre ?? codigo)
                  .join(" · ")}
                {rama.codigos.length > 8 ? ` y ${rama.codigos.length - 8} más` : ""}
              </p>
            </div>
          ) : (
            <Aviso intencion="aviso" titulo="Rama en construcción">
              {tipoElegido?.descripcion ?? "Esta rama todavía no tiene requisitos definidos."} Registra el expediente con otra rama o espera
              la definición del área.
            </Aviso>
          )}
        </Panel>

        <Panel titulo="Fechas sugeridas" descripcion="Puedes usar estas para agilizar el registro.">
          <div className="flex flex-wrap gap-2">
            {[0, -1, -7, -15].map((dias) => (
              <Boton key={dias} variante="suave" onClick={() => poner("fechaIngreso", fechaEnDias(dias))}>
                {dias === 0 ? "Hoy" : dias === -1 ? "Ayer" : `Hace ${Math.abs(dias)} días`}
              </Boton>
            ))}
          </div>
        </Panel>
      </div>
    </Lateral>
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
        pie={
          <div className="flex items-center justify-between gap-3">
            {progreso ? (
              <p className="text-xs text-ink-soft">
                Procesando {progreso.hechos} de {progreso.total}…
              </p>
            ) : (
              <p className="text-[11px] text-ink-faint">Se procesa en lotes de 50 y se puede reanudar.</p>
            )}
            <div className="flex gap-2">
              <Boton variante="suave" onClick={onCerrar}>
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
              <ul className="space-y-1 text-xs text-ink-soft">
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
