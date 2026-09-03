/**
 * Expediente operativo, en una ventana central.
 *
 * ── Qué es esta pantalla ────────────────────────────────────────────────────
 * El centro de operación del módulo. Todo lo que se puede hacer con un expediente
 * se hace aquí: marcar requisitos, contar hojas, revisar, aprobar, conceder
 * prórrogas, pedir documentación, abrir tareas, comentar, consultar el historial
 * y exportar.
 *
 * ── Por qué dejó de ser un cajón lateral ────────────────────────────────────
 * Un cajón de 800 píxeles que entra por la derecha convierte 25 requisitos en una
 * columna larguísima que se recorre a ciegas, mientras a la izquierda quedan
 * seiscientos píxeles de lista tapada que no sirven para nada. La ventana central
 * usa el ancho: la identidad completa se lee de un vistazo en la cabecera, los
 * bloques de requisitos van en dos columnas en pantallas grandes y en una sola en
 * móvil, donde ocupa todo —que ahí es lo correcto—.
 *
 * ── Cinco decisiones que se notan al usarla ─────────────────────────────────
 * 1. **Apertura instantánea.** Si el expediente ya estaba precargado se pinta en
 *    el mismo fotograma desde la caché y se revalida en silencio contra el
 *    backend (`state/precarga.ts`). Nunca se presenta lo viejo como fresco: se
 *    dice de cuándo es.
 * 2. **Edición rápida con guardado por bloque.** Marcar seis requisitos son seis
 *    cambios en la pantalla y UNA escritura. Mientras hay cambios sin guardar, la
 *    barra inferior lo dice y ofrece descartarlos.
 * 3. **El guardado no miente.** Si el envío falla por red, el bloque entra en la
 *    cola de salida —que sobrevive a un recargado— y la interfaz dice «pendiente
 *    de sincronizar», nunca «guardado».
 * 4. **Control de versión.** Cada requisito viaja con su versión. Si otra persona
 *    lo cambió mientras esta pantalla estaba abierta, el backend responde
 *    `CONFLICTO_VERSION` y aquí se recarga en lugar de pisar su trabajo.
 * 5. **«Siguiente pendiente».** Lo calcula el backend priorizando lo observado.
 *    Es lo que convierte revisar veinte requisitos en pulsar veinte veces el
 *    mismo botón en lugar de buscar en la lista.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  CloudUpload,
  Download,
  IdCard,
  MessageSquare,
  RefreshCw,
  Send,
  Undo2,
  UserCog,
  X,
} from "lucide-react";

import { docApi, type ExpedienteOperativo } from "../api/acciones";
import {
  ETIQUETA_APROBACION,
  ETIQUETA_EXPEDIENTE,
  ETIQUETA_PRORROGA,
  ETIQUETA_REVISION,
  ETIQUETA_SITUACION,
  ETIQUETA_SOLICITUD,
  ETIQUETA_TAREA,
  INTENCION_APROBACION,
  INTENCION_PRORROGA,
  INTENCION_REVISION,
  INTENCION_SITUACION,
  INTENCION_EXPEDIENTE,
  INTENCION_SOLICITUD,
  INTENCION_TAREA,
  MOTIVOS_REVISION,
  VISIBILIDADES_COMENTARIO,
  type EstadoDocumento,
  type EstadoExpediente,
} from "../domain/vocabulario";
import {
  fechaCorta,
  fechaEnDias,
  fechaHora,
  textoAntiguedad,
  textoPlazo,
  type RequisitoVista,
} from "../domain/progreso";
import { useConsola } from "../state/consola";
import { mensajeDeError } from "../api/client";
import { useExpedienteAbierto } from "../state/precarga";
import { encolarCambios, pendientesDe, useCola, vaciarCola } from "../state/colaSalida";
import { categoriaDe, estiloCategoria } from "../domain/categorias";
import { descargarXlsx, nombreConFecha, unirLotes } from "../export/xlsx";
import {
  Boton,
  Campo,
  ChipEstado,
  Confirmacion,
  Entrada,
  AreaTexto,
  Aviso,
  Panel,
  Selector,
  TONO,
  Ventana,
  type Notita,
} from "./piezas";
import { RequisitosExpediente, type BorradorRequisito } from "./RequisitosExpediente";
import { DocError, DocVacio } from "./DocStates";
import { EsqueletoExpediente } from "./DocSkeletons";
import { IndicadorGuardado, hace, type EstadoEscritura } from "./DocSyncIndicator";
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

export function ExpedienteVentana({ expedienteId, onCerrar, onCambio, avisar }: Props) {
  const { capacidades } = useConsola();
  // La cola se lee para que la ventana se repinte cuando un envío se confirma
  // en segundo plano: sin esta suscripción, «pendiente de sincronizar» se
  // quedaría puesto hasta que algo más provocara un renderizado.
  useCola();
  const [pestana, setPestana] = useState<Pestana>("requisitos");
  /** Cambios de requisito aún sin enviar: `id -> {estado?, observaciones?, hojasFisicas?}`. */
  const [borrador, setBorrador] = useState<Record<string, BorradorRequisito>>({});
  const [guardando, setGuardando] = useState(false);
  const [dialogo, setDialogo] = useState<null | { tipo: "archivar" | "restaurar" | "aprobar" }>(null);
  const [exportando, setExportando] = useState(false);
  /** Último resultado de escritura, para el indicador de guardado. */
  const [ultimaEscritura, setUltimaEscritura] = useState<"ninguna" | "guardado" | "error" | "conflicto" | "encolado">("ninguna");
  /**
   * Requisito en foco. Vive aquí y no dentro de la pestaña porque la cabecera
   * también lo mueve: «ir al requisito» del resumen y el botón «Detalle» de la
   * fila tienen que apuntar al mismo sitio.
   */
  const [foco, setFoco] = useState<string | null>(null);

  /* Apertura instantánea desde la caché + revalidación silenciosa. */
  const expediente = useExpedienteAbierto(expedienteId);

  /**
   * Lo que se pinta.
   *
   * Si el detalle completo ya llegó, se usa. Si no y hay una copia precargada, se
   * arma con ella un expediente utilizable —cabecera, requisitos y prórrogas—
   * para que la pantalla esté viva en el primer fotograma. Las listas que la
   * copia no trae (historial, comentarios, auditoría) van vacías, y sus pestañas
   * muestran su estado de carga: es lo honesto.
   */
  const datos: ExpedienteOperativo | null = useMemo(() => {
    if (expediente.datos) return expediente.datos;
    const previa = expediente.vistaPrevia;
    if (!previa) return null;
    return {
      expediente: previa.expediente,
      requisitos: previa.requisitos,
      prorrogas: previa.prorrogas,
      solicitudes: [],
      revisiones: [],
      aprobaciones: [],
      tareas: [],
      comentarios: [],
      consentimientos: [],
      historial: [],
      auditoria: [],
      resumenTextual: "",
      capacidades,
      siguientePendiente: null,
    };
  }, [expediente.datos, expediente.vistaPrevia, capacidades]);

  const cabecera = datos?.expediente;
  const parcial = !expediente.datos && Boolean(expediente.vistaPrevia);
  const cambiosSinGuardar = Object.keys(borrador).length;
  const enCola = expedienteId ? pendientesDe(expedienteId) : 0;

  /* Al abrir un expediente, el foco arranca en lo que el backend señaló como
     siguiente pendiente: es lo que convierte «revisar» en «pulsar». */
  useEffect(() => {
    setFoco(datos?.siguientePendiente?.expedienteDocumentoId ?? null);
    setUltimaEscritura("ninguna");
  }, [datos?.expediente.expedienteId, datos?.siguientePendiente?.expedienteDocumentoId]);

  /**
   * Estado de la escritura, en palabras que distinguen los casos reales: hay
   * cambios sin escribir, se está escribiendo, el servidor confirmó, o alguien se
   * adelantó y hay conflicto de versión.
   */
  const estadoEscritura: EstadoEscritura = guardando
    ? "guardando"
    : cambiosSinGuardar > 0 || enCola > 0
      ? "pendiente"
      : ultimaEscritura === "conflicto"
        ? "conflicto"
        : ultimaEscritura === "error"
          ? "error"
          : ultimaEscritura === "guardado"
            ? "guardado"
            : "sin_cambios";

  /**
   * Anota un cambio de requisito en el borrador.
   *
   * ── Un cambio que no cambia nada no es un cambio ────────────────────────────
   * Los controles de la fila avisan también al SALIR del campo: el contador de
   * hojas confirma su valor al perder el foco y el área de observación sube su
   * texto al soltarla. Recorrer los requisitos con el tabulador disparaba esos
   * avisos con los valores que ya estaban, el borrador se llenaba de entradas
   * idénticas al libro y la ventana decía «hay 4 cambios sin guardar» y
   * preguntaba, al cerrar, si descartar un trabajo que nadie había hecho.
   *
   * Por eso cada campo del parche se compara con lo que hay en el expediente y
   * se queda solo lo que de verdad difiere. Si no queda nada, la entrada se
   * borra: así el indicador vuelve a «sin cambios» al deshacer a mano lo que se
   * acababa de tocar.
   */
  function ponerBorrador(id: string, patch: Partial<BorradorRequisito>) {
    const requisito = datos?.requisitos.find((r) => r.expedienteDocumentoId === id);
    setBorrador((prev) => {
      const fundido: BorradorRequisito = { ...prev[id], ...patch };
      const limpio: BorradorRequisito = {};
      if (fundido.estado !== undefined && fundido.estado !== requisito?.estado) limpio.estado = fundido.estado;
      if (fundido.observaciones !== undefined && fundido.observaciones !== (requisito?.observaciones ?? "")) {
        limpio.observaciones = fundido.observaciones;
      }
      if (fundido.hojasFisicas !== undefined && fundido.hojasFisicas !== (requisito?.hojasFisicas ?? 0)) {
        limpio.hojasFisicas = fundido.hojasFisicas;
      }
      if (Object.keys(limpio).length === 0) {
        if (!prev[id]) return prev;
        const siguiente = { ...prev };
        delete siguiente[id];
        return siguiente;
      }
      return { ...prev, [id]: limpio };
    });
  }

  function descartar() {
    setBorrador({});
  }

  /**
   * Guarda el bloque de cambios en una sola escritura.
   *
   * ── Por qué la cola de salida, y por qué solo cuando hace falta ─────────────
   * El camino normal es el directo: se envía, el backend confirma y la interfaz
   * dice «guardado». Si el envío falla por RED —no por validación—, el bloque
   * entra en la cola de salida en lugar de perderse: sobrevive a un recargado y
   * se reintenta solo cuando vuelve la conexión. Y mientras esté ahí, la interfaz
   * dice «pendiente de sincronizar». El guardado no miente en ninguno de los dos
   * caminos: la diferencia es que ahora el camino malo no destruye el trabajo.
   */
  async function guardarBloque() {
    if (!datos || !cambiosSinGuardar) return;
    setGuardando(true);
    const cambios = Object.entries(borrador).map(([id, patch]) => {
      const requisito = datos.requisitos.find((r) => r.expedienteDocumentoId === id);
      return { expedienteDocumentoId: id, version: requisito?.version, ...patch };
    });
    try {
      const res = await docApi.guardarRequisitos(datos.expediente.expedienteId, cambios);
      setBorrador({});
      setUltimaEscritura(res.fallidos.length ? "error" : "guardado");
      expediente.recargar();
      onCambio();
      if (res.fallidos.length) {
        avisar("aviso", `${res.aplicados} cambio(s) guardado(s), ${res.fallidos.length} rechazado(s).`, res.fallidos[0]?.motivo);
      } else {
        avisar("exito", `${res.aplicados} cambio(s) guardado(s).`);
      }
    } catch (error) {
      const fallo = error as { message?: string; pista?: string; codigo?: string; red?: boolean };
      if (fallo.codigo === "CONFLICTO_VERSION") {
        // Alguien más tocó el expediente: se recarga en lugar de pisar su trabajo.
        setUltimaEscritura("conflicto");
        expediente.recargar();
        setBorrador({});
        avisar(
          "aviso",
          "Otra persona cambió este expediente mientras lo tenías abierto.",
          "Se ha recargado con la versión del libro para no pisar su trabajo. Vuelve a marcar lo que falte.",
        );
      } else if (fallo.red === true || fallo.codigo === "SIN_RED" || fallo.codigo === "TIMEOUT") {
        encolarCambios(datos.expediente.expedienteId, cambios);
        setBorrador({});
        setUltimaEscritura("encolado");
        avisar(
          "aviso",
          `${cambios.length} cambio(s) quedaron pendientes de sincronizar.`,
          "No se han perdido: se guardaron en este equipo y se enviarán solos cuando vuelva la conexión.",
        );
      } else {
        setUltimaEscritura("error");
        avisar("peligro", fallo.message ?? "No se pudo guardar.", fallo.pista);
      }
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

  /**
   * Pestañas del expediente.
   *
   * Cada una lleva su total y, cuando hay algo que atender, una marca de aviso con
   * su explicación en el `title`. La marca es un punto y no un número: el nombre
   * accesible de la pestaña tiene que ser estable —«Requisitos 18»— y no cambiar
   * de forma cada vez que alguien resuelve una observación.
   */
  const pestanas: {
    id: Pestana;
    etiqueta: string;
    contador?: number;
    visible: boolean;
    aviso?: { intencion: "aviso" | "peligro"; detalle: string };
  }[] = [
    {
      id: "requisitos",
      etiqueta: "Requisitos",
      contador: datos?.requisitos.length,
      visible: true,
      aviso:
        datos && datos.expediente.totales.pendientes + datos.expediente.totales.noEntregados > 0
          ? {
              intencion: datos.expediente.totales.noEntregados > 0 ? "peligro" : "aviso",
              detalle: `${datos.expediente.totales.pendientes} pendiente(s) y ${datos.expediente.totales.noEntregados} no entregado(s)`,
            }
          : undefined,
    },
    {
      id: "solicitudes",
      etiqueta: "Solicitudes",
      contador: datos?.solicitudes.length,
      visible: true,
      aviso: contarAviso(datos?.solicitudes, (s2) => s2.estado === "VENCIDA", "vencida(s)"),
    },
    { id: "revisiones", etiqueta: "Revisiones", contador: datos?.revisiones.length, visible: true },
    {
      id: "aprobaciones",
      etiqueta: "Aprobaciones",
      contador: datos?.aprobaciones.length,
      visible: true,
      aviso: contarAviso(datos?.aprobaciones, (a) => a.estado === "PENDIENTE", "esperando firma", "aviso"),
    },
    {
      id: "prorrogas",
      etiqueta: "Prórrogas",
      contador: datos?.prorrogas.length,
      visible: true,
      aviso: contarAviso(datos?.prorrogas, (pr) => pr.situacion === "vencida", "vencida(s)"),
    },
    {
      id: "tareas",
      etiqueta: "Tareas",
      contador: datos?.tareas.length,
      visible: true,
      aviso: contarAviso(datos?.tareas, (ta) => ta.estado === "VENCIDA", "fuera de plazo"),
    },
    { id: "comentarios", etiqueta: "Comentarios", contador: datos?.comentarios.length, visible: true },
    { id: "historial", etiqueta: "Historial", contador: datos?.historial.length, visible: true },
    { id: "auditoria", etiqueta: "Auditoría", contador: datos?.auditoria.length, visible: capacidades.auditoria === true },
  ];

  return (
    <Ventana
      abierta={!!expedienteId}
      onCerrar={onCerrar}
      titulo={cabecera ? cabecera.nombre : "Expediente"}
      ancho="max-w-6xl"
      bloqueado={guardando}
      confirmarCierre={
        cambiosSinGuardar
          ? `Hay ${cambiosSinGuardar} cambio(s) sin guardar en este expediente. ¿Cerrar y descartarlos?`
          : undefined
      }
      cabecera={
        <CabeceraVentana
          datos={datos}
          parcial={parcial}
          sinRespuesta={Boolean(expediente.error)}
          antiguedad={expediente.antiguedad}
          conflicto={expediente.conflicto}
          estadoEscritura={estadoEscritura}
          enCola={enCola}
          onCerrar={onCerrar}
          onIrAlSiguiente={(id) => {
            setPestana("requisitos");
            setFoco(id);
          }}
        />
      }
      pie={
        cambiosSinGuardar || enCola ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="doc-prose text-xs" style={{ color: TONO.aviso.texto }}>
              {cambiosSinGuardar > 0
                ? `${cambiosSinGuardar} cambio(s) sin guardar. Nada se ha escrito todavía en el libro.`
                : `${enCola} cambio(s) pendientes de sincronizar. Se enviarán solos cuando vuelva la conexión.`}
            </p>
            <div className="flex gap-2">
              {cambiosSinGuardar > 0 ? (
                <>
                  <Boton variante="suave" onClick={descartar}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Descartar
                  </Boton>
                  <Boton variante="primario" onClick={guardarBloque} cargando={guardando}>
                    Guardar {cambiosSinGuardar} cambio(s)
                  </Boton>
                </>
              ) : (
                <Boton
                  variante="primario"
                  onClick={async () => {
                    const res = await vaciarCola();
                    if (res.confirmados) {
                      expediente.recargar();
                      onCambio();
                      avisar("exito", `${res.confirmados} envío(s) confirmado(s) por el libro.`);
                    } else if (res.restantes) {
                      avisar("aviso", `Siguen pendientes ${res.restantes} cambio(s).`, "Comprueba la conexión y vuelve a intentarlo.");
                    }
                  }}
                >
                  <CloudUpload className="h-3.5 w-3.5" aria-hidden /> Sincronizar ahora
                </Boton>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      {Boolean(expediente.error) && !datos && (
        <DocError
          titulo="No se pudo abrir el expediente"
          error={mensajeDeError(expediente.error)}
          onReintentar={expediente.recargar}
          reintentando={expediente.cargando}
        />
      )}
      {Boolean(expediente.error) && datos && parcial && (
        <Aviso intencion="aviso" titulo="Sin conexión con el libro">
          Se está mostrando la última copia guardada en este equipo ({hace(expediente.vistaPrevia?.guardadoEn)}). Se puede
          consultar y exportar, pero no guardar cambios hasta que vuelva la conexión.
        </Aviso>
      )}
      {expediente.cargando && !datos && (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            Abriendo expediente…
          </span>
          <EsqueletoExpediente />
        </>
      )}

      {datos && cabecera && (
        <div className="space-y-4">
          {/* Acciones del expediente: siempre visibles, no escondidas en un menú. */}
          <div className="doc-no-print flex flex-wrap gap-2">
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

          {/* Pestañas */}
          {/*
            Pestañas desplazables, pegadas al borde superior del panel: con nueve
            secciones y un expediente largo, perder la navegación al bajar obliga a
            volver arriba para cambiar de sección.
          */}
          <div
            className="doc-no-print sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-[color:var(--doc-border)] bg-[color:var(--doc-surface)] px-1 pb-1 pt-1 backdrop-blur"
            role="tablist"
            aria-label="Secciones del expediente"
          >
            {pestanas
              .filter((p) => p.visible)
              .map((p) => {
                const activa = pestana === p.id;
                return (
                  <button
                    key={p.id}
                    id={`doc-tab-${p.id}`}
                    role="tab"
                    aria-selected={activa}
                    aria-controls="doc-tabpanel"
                    tabIndex={activa ? 0 : -1}
                    onKeyDown={(evento) => {
                      /* Flechas para moverse entre pestañas, como manda el patrón
                         de `tablist`: con nueve pestañas, tabular por todas para
                         llegar a la última es una carrera de obstáculos. */
                      const visibles = pestanas.filter((x) => x.visible);
                      const actual = visibles.findIndex((x) => x.id === p.id);
                      if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
                      evento.preventDefault();
                      const siguiente =
                        evento.key === "ArrowRight"
                          ? visibles[(actual + 1) % visibles.length]
                          : visibles[(actual - 1 + visibles.length) % visibles.length];
                      setPestana(siguiente.id);
                      document.getElementById(`doc-tab-${siguiente.id}`)?.focus();
                    }}
                    onClick={() => setPestana(p.id)}
                    className="doc-tap shrink-0 rounded-t-[var(--doc-radius-sm)] px-3 py-2 text-xs font-semibold transition-colors"
                    style={
                      activa
                        ? { background: "var(--doc-surface-raised)", color: "var(--doc-text)", boxShadow: "inset 0 -2px 0 var(--doc-info)" }
                        : { color: "var(--doc-text-muted)" }
                    }
                  >
                    {p.etiqueta}
                    {p.contador !== undefined && (
                      <span className="doc-metric ml-1 text-[10px] text-[color:var(--doc-text-faint)]">{p.contador}</span>
                    )}
                    {p.aviso && (
                      <span
                        className="ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: TONO[p.aviso.intencion].punto }}
                        title={p.aviso.detalle}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
          </div>

          <div role="tabpanel" id="doc-tabpanel" aria-labelledby={`doc-tab-${pestana}`}>
            {pestana === "requisitos" && (
              <Requisitos
                datos={datos}
                borrador={borrador}
                foco={foco}
                onFoco={setFoco}
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
    </Ventana>
  );
}

/* ------------------------------------------------------------------ */
/* Cabecera de la ventana                                              */
/* ------------------------------------------------------------------ */

/**
 * Identidad, situación y avance, en una sola franja.
 *
 * ── Cómo se decidió qué va aquí ─────────────────────────────────────────────
 * Se listó lo que el área consulta al abrir un expediente y se ordenó por
 * frecuencia: quién es, en qué rama está, cuánto lleva ingresado, qué avance
 * tiene y cuál es el próximo plazo. Eso es lo que va en la cabecera, siempre
 * visible. El resto —quién tocó qué, la versión del registro— va en su pestaña,
 * porque se consulta cuando alguien audita, no cada vez.
 *
 * La categoría se identifica con SU icono y SU color (de `domain/categorias.tsx`,
 * la fuente única), y además con su etiqueta: el color no comunica solo.
 */
function CabeceraVentana({
  datos,
  parcial,
  sinRespuesta,
  antiguedad,
  conflicto,
  estadoEscritura,
  enCola,
  onCerrar,
  onIrAlSiguiente,
}: {
  datos: ExpedienteOperativo | null;
  parcial: boolean;
  /** La comprobación contra el libro falló: no hay que decir que sigue en marcha. */
  sinRespuesta: boolean;
  antiguedad: number;
  conflicto: boolean;
  estadoEscritura: EstadoEscritura;
  enCola: number;
  onCerrar: () => void;
  onIrAlSiguiente: (id: string) => void;
}) {
  if (!datos) {
    return (
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--doc-border)] px-4 py-3 sm:px-6">
        <h2 className="doc-titulo">Expediente</h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="doc-tap doc-presion rounded-xl p-2 text-[color:var(--doc-text-muted)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>
    );
  }

  const cabecera = datos.expediente;
  const categoria = categoriaDe(cabecera.tipoFuncionario);
  const Icono = categoria.Icono;
  const totales = cabecera.totales;
  const faltan = totales.pendientes + totales.noEntregados;
  const siguiente = datos.siguientePendiente;

  return (
    <header
      className="doc-cat shrink-0 border-b border-[color:var(--doc-border)] px-4 py-3 sm:px-6"
      style={estiloCategoria(cabecera.tipoFuncionario)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
            style={{ background: "var(--cat-tinte-fuerte)", color: "var(--cat-texto)" }}
            title={categoria.etiqueta}
          >
            <Icono className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="doc-titulo doc-wrap-name">{cabecera.nombre || "Sin nombre"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--doc-text-muted)]">
              <span className="inline-flex items-center gap-1">
                <IdCard className="h-3 w-3" aria-hidden /> <span className="doc-metric">{cabecera.identificador}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <UserCog className="h-3 w-3" aria-hidden /> {cabecera.cargo || "Sin cargo"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" aria-hidden />
                {[cabecera.agencia, cabecera.gerencia].filter(Boolean).join(" · ") || "Sin agencia"}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" aria-hidden />
                {cabecera.fechaIngreso ? `${fechaCorta(cabecera.fechaIngreso)} · ${textoAntiguedad(cabecera.diasDesdeIngreso)}` : "Sin fecha de ingreso"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ChipEstado
                estado={cabecera.estado}
                etiqueta={ETIQUETA_EXPEDIENTE[cabecera.estado as EstadoExpediente] ?? cabecera.estado}
                intencion={INTENCION_EXPEDIENTE[cabecera.estado as EstadoExpediente] ?? "neutral"}
              />
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "var(--cat-tinte)", color: "var(--cat-texto)" }}
              >
                {categoria.etiquetaCorta}
                {cabecera.tipoGarantia && cabecera.tipoGarantia !== "NINGUNA" ? ` · ${cabecera.tipoGarantiaEtiqueta}` : ""}
              </span>
              {cabecera.responsableId && (
                <span className="text-[10px] text-[color:var(--doc-text-faint)]">
                  Responsable: {cabecera.responsableId}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="doc-tap doc-presion rounded-xl p-2 text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface)] hover:text-[color:var(--doc-text)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <IndicadorGuardado
            estado={estadoEscritura}
            detalle={enCola ? `${enCola} cambio(s) esperan conexión` : undefined}
          />
        </div>
      </div>

      {/* Cifras: avance, lo que falta, prórrogas y próximo plazo. Cuatro
          columnas que responden «¿cómo va esto?» sin bajar por la lista. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DatoCabecera etiqueta="Avance" valor={`${cabecera.porcentaje}%`} intencion={cabecera.porcentaje >= 100 ? "exito" : "info"}>
          <span className="doc-metric text-[10px] text-[color:var(--doc-text-faint)]">
            {totales.entregados} de {totales.requisitos - totales.noAplica} exigibles
          </span>
        </DatoCabecera>
        <DatoCabecera etiqueta="Faltan" valor={String(faltan)} intencion={faltan > 0 ? "aviso" : "exito"}>
          {siguiente ? (
            <button
              type="button"
              onClick={() => onIrAlSiguiente(siguiente.expedienteDocumentoId)}
              className="doc-tap text-[10px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--doc-info-fg)" }}
            >
              Ir al siguiente ({siguiente.motivo})
            </button>
          ) : (
            <span className="text-[10px] text-[color:var(--doc-text-faint)]">Nada pendiente</span>
          )}
        </DatoCabecera>
        <DatoCabecera
          etiqueta="Observados"
          valor={String(totales.observados)}
          intencion={totales.observados > 0 ? "peligro" : "neutral"}
        >
          <span className="text-[10px] text-[color:var(--doc-text-faint)]">
            {totales.prorrogas} prórroga(s){totales.prorrogasVencidas ? `, ${totales.prorrogasVencidas} vencida(s)` : ""}
          </span>
        </DatoCabecera>
        <DatoCabecera
          etiqueta="Próximo plazo"
          valor={cabecera.proximaFechaCritica ? fechaCorta(cabecera.proximaFechaCritica) : "—"}
          intencion={
            cabecera.diasParaFechaCritica === null
              ? "neutral"
              : cabecera.diasParaFechaCritica < 0
                ? "peligro"
                : cabecera.diasParaFechaCritica <= 3
                  ? "aviso"
                  : "info"
          }
        >
          <span className="text-[10px] text-[color:var(--doc-text-faint)]">
            {cabecera.proximaFechaCritica ? textoPlazo(cabecera.proximaFechaCritica) : "Sin plazos abiertos"}
          </span>
        </DatoCabecera>
      </div>

      {/* Honestidad sobre la frescura del dato. */}
      {(parcial || conflicto) && (
        <p className="mt-2 text-[11px]" style={{ color: conflicto ? TONO.aviso.texto : "var(--doc-text-faint)" }}>
          {conflicto
            ? "Este expediente cambió en el libro mientras estaba abierto: se muestra la versión actualizada."
            : sinRespuesta
              ? `Copia de este equipo, guardada hace ${antiguedad} s. No se pudo comprobar contra el libro: puede haber cambiado.`
              : `Copia de este equipo, guardada hace ${antiguedad} s. Se está comprobando contra el libro…`}
        </p>
      )}
    </header>
  );
}

/** Una de las cuatro cifras de la cabecera. */
function DatoCabecera({
  etiqueta,
  valor,
  intencion,
  children,
}: {
  etiqueta: string;
  valor: string;
  intencion: keyof typeof TONO;
  children?: React.ReactNode;
}) {
  const tono = TONO[intencion];
  return (
    <div
      className="rounded-[var(--doc-radius-sm)] px-2.5 py-2"
      style={{ background: "var(--doc-surface)", boxShadow: `inset 0 0 0 1px var(--doc-border)`, borderLeft: `3px solid ${tono.borde}` }}
    >
      <p className="doc-eyebrow">{etiqueta}</p>
      <p className="doc-cifra mt-0.5 text-lg leading-none" style={{ color: tono.texto }}>
        {valor}
      </p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

/**
 * Cuenta cuántos elementos de una colección cumplen algo y devuelve la marca de
 * aviso de la pestaña. Devuelve `undefined` cuando no hay nada que avisar: una
 * pestaña sin problemas no debe llevar adorno.
 */
function contarAviso<T>(
  coleccion: T[] | undefined,
  cumple: (item: T) => boolean,
  sufijo: string,
  intencion: "aviso" | "peligro" = "peligro",
): { intencion: "aviso" | "peligro"; detalle: string } | undefined {
  if (!coleccion?.length) return undefined;
  const total = coleccion.filter(cumple).length;
  if (!total) return undefined;
  return { intencion, detalle: `${total} ${sufijo}` };
}

/* ------------------------------------------------------------------ */
/* Requisitos                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pestaña de requisitos.
 *
 * El listado vive en `RequisitosExpediente` (buscador, filtros por situación,
 * chips de estado con el color del área y prórrogas con cuenta regresiva). Aquí
 * solo quedan los dos formularios que se abren desde una fila: la decisión de
 * revisión y la prórroga.
 */
function Requisitos({
  datos,
  borrador,
  foco,
  onFoco,
  onBorrador,
  onRecargar,
  avisar,
}: {
  datos: ExpedienteOperativo;
  borrador: Record<string, { estado?: EstadoDocumento; observaciones?: string }>;
  foco: string | null;
  onFoco: (id: string | null) => void;
  onBorrador: (id: string, patch: { estado?: EstadoDocumento; observaciones?: string }) => void;
  onRecargar: () => void;
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const { capacidades } = useConsola();
  const [revisando, setRevisando] = useState<RequisitoVista | null>(null);
  const [prorrogando, setProrrogando] = useState<RequisitoVista | null>(null);

  return (
    <div className="space-y-3">
      <RequisitosExpediente
        datos={datos}
        borrador={borrador}
        foco={foco}
        puedeEditar={capacidades.editar === true}
        puedeRevisar={capacidades.revisar === true}
        onFoco={onFoco}
        onBorrador={onBorrador}
        onRevisar={setRevisando}
        onProrrogar={setProrrogando}
      />

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

      {!datos.solicitudes.length && <DocVacio compacto icono="documento" titulo="Sin solicitudes" detalle="Cuando se pida documentación, aparecerá aquí con su seguimiento." siguientePaso="«Solicitar todo lo pendiente» crea una con los requisitos que faltan." />}

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
                <span style={{ color: item.estado === "CUMPLIDO" ? TONO.exito.texto : "var(--doc-text-faint)" }}>
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
    return <DocVacio compacto icono="historial" titulo="Sin decisiones de revisión" detalle="Cada aprobación u observación queda registrada aquí con su motivo." siguientePaso="Las decisiones se registran desde el botón «Revisar» de cada requisito." />;
  }
  const ordenadas = [...datos.revisiones].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return (
    <Panel titulo="Historial de decisiones" descripcion="Append-only: una decisión no se edita, se sucede.">
      <ol className="space-y-3">
        {ordenadas.map((revision) => (
          <li key={revision.revisionId} className="doc-print-keep border-l-2 border-[color:var(--doc-border)] pl-3">
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

      {!datos.aprobaciones.length && <DocVacio compacto icono="documento" titulo="Sin aprobaciones" detalle="Cuando se pida una firma, aparecerá aquí con su estado y su plazo." />}

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
    return <DocVacio compacto icono="historial" titulo="Sin prórrogas" detalle="Se conceden desde la pestaña de requisitos, en los que la admiten." />;
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

      {!datos.tareas.length && <DocVacio compacto icono="carpeta" titulo="Sin tareas" detalle="Las observaciones abren tareas de corrección automáticamente." />}

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

      {!datos.comentarios.length && <DocVacio compacto icono="documento" titulo="Sin comentarios" detalle="Los seguimientos y las notas del equipo aparecen aquí." />}

      <ol className="space-y-2">
        {datos.comentarios.map((comentario) => (
          <li key={comentario.comentarioId} className="doc-surface doc-print-keep p-3">
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
  if (!datos.historial.length) return <DocVacio compacto icono="historial" titulo="Sin historial" detalle="Cada cambio queda registrado en cuanto ocurra, con su valor anterior y el nuevo." />;
  return (
    <Panel titulo="Qué ha pasado" descripcion="Historial legible: campo, valor anterior y valor nuevo.">
      <ol className="space-y-2">
        {datos.historial.map((entrada) => (
          <li key={entrada.historialId} className="doc-print-keep border-l-2 border-[color:var(--doc-border)] pl-3 text-xs">
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
  if (!datos.auditoria.length) return <DocVacio compacto icono="datos" titulo="Sin eventos" detalle="La auditoría técnica registra cada operación con su identificador de solicitud." />;
  return (
    <Panel titulo="Auditoría técnica" descripcion="Evento, actor, origen y resultado. Con el identificador de solicitud para rastrear.">
      <ol className="space-y-1.5">
        {datos.auditoria.map((evento) => (
          <li key={evento.eventoId} className="doc-sunken p-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{evento.tipo}</span>
              <span style={{ color: evento.resultado === "ok" ? TONO.exito.texto : TONO.aviso.texto }}>{evento.resultado}</span>
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
