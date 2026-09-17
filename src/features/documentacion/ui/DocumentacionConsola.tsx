/**
 * MÓDULO — Documentación.
 *
 * Consola de operación del proceso documental de incorporación, sobre el libro de
 * Google Sheets del área.
 *
 * ── Cómo está montada ───────────────────────────────────────────────────────
 * Un armazón (`DocShell`) con navegación agrupada y trece secciones. El armazón se
 * ocupa de cuatro cosas y nada más: resolver la conexión y los permisos al
 * entrar, decidir qué secciones puede ver este rol, ofrecer la acción principal
 * del módulo, y mantener abierto el panel del expediente por encima de la sección
 * que sea. Cada sección se ocupa de sus datos.
 *
 * ── Qué pasa si el backend no está ──────────────────────────────────────────
 * El módulo no finge. Si no hay backend configurado, o está sin instalar, o no
 * responde, se dice con claridad y se ofrece qué hacer: configurar la conexión,
 * instalar el modelo o abrir la vista local, que trabaja contra el almacén de este
 * equipo y es lo que había antes. Ninguna pantalla muestra datos inventados.
 *
 * ── Identidad visual ────────────────────────────────────────────────────────
 * Liquid Glass para el armazón y el panel lateral; dentro, superficies planas con
 * los tokens del módulo (`--doc-*`), porque el contenido denso se lee mejor sobre
 * una superficie que sobre un cristal. Las animaciones se apagan enteras con
 * `prefers-reduced-motion` o con el interruptor de la aplicación, las tablas se
 * convierten en tarjetas en el móvil y todo estado lleva etiqueta e icono además
 * de color.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CircleSlash, Database, FolderPlus, RefreshCw, Wrench } from "lucide-react";
import { docApi } from "../api/acciones";
import { seccionesPermitidas, type SeccionId } from "../domain/vocabulario";
import { diagnosticarCompatibilidad, intencionDeSeveridad } from "../domain/compatibilidad";
import { comprobarConexion, irASeccion, refrescarNotificaciones, useConsola } from "../state/consola";
import { hidratarCache, vaciarCache } from "../state/cacheExpedientes";
import { cancelarPrecarga } from "../state/precarga";
import { bombearSalida, vigilarConexion } from "../state/salida";
import { medirFluidez, modoLigeroActivo, usePreferencias } from "../state/preferencias";
import { DocCargando, useCortinaDeCarga } from "./DocCargando";
import { useProfiles } from "../../../lib/profilesStore";
import { useDocStore } from "../../../lib/docStore";
import { Aviso, Boton, Notitas, useNotitas } from "./piezas";
import { propsSeccion, useMovimientoReducido } from "./DocMotion";
import { conTransicionDeVista } from "./DocViewTransitions";
import { DocShell, type ContadorSeccion } from "./DocShell";
import { DocModoDegradado } from "./DocStates";
import { SeccionPanel } from "./SeccionPanel";
import { SeccionExpedientes } from "./SeccionExpedientes";
import { ExpedienteVentana } from "./ExpedienteVentana";
import { SeccionAprobaciones, SeccionProrrogas, SeccionRevision, SeccionSolicitudes, SeccionTareas } from "./SeccionTrabajo";
import { SeccionAuditoria, SeccionExportaciones, SeccionNotificaciones, SeccionReportes } from "./SeccionReportes";
import { SeccionConfiguracion } from "./SeccionConfiguracion";
import { VistaLocal } from "./VistaLocal";

export function DocumentacionConsola() {
  const consola = useConsola();
  const preferencias = usePreferencias();
  const { current } = useProfiles();
  const { settings } = useDocStore();
  const backendUrl = settings.scriptUrl;
  const { notitas, avisar, quitar } = useNotitas();
  const reducido = useMovimientoReducido();
  const [expedienteAbierto, setExpedienteAbierto] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [refresco, setRefresco] = useState(0);
  /** ¿Terminó el primer arranque (conexión + catálogo + caché)? */
  const [arrancado, setArrancado] = useState(false);

  /**
   * Modo ligero.
   *
   * Se resuelve en cada renderizado porque depende de dos cosas que pueden
   * cambiar: la preferencia de la persona y la medición de fluidez, que ocurre
   * una vez tras el arranque. Se aplica con un atributo en la raíz del módulo, no
   * con clases en cada componente: así apagar las transparencias y las sombras es
   * una regla de CSS y no cien condicionales repartidos.
   */
  const ligero = modoLigeroActivo(preferencias);

  /**
   * Cortina de carga con el logo de documentos.
   *
   * `useCortinaDeCarga` aplica el mínimo perceptible —para que no destelle en una
   * carga instantánea desde caché— y el tope duro, para que un backend lento no
   * deje a nadie mirando una animación. Al agotarse el tope se entra igual: la
   * consola muestra sus esqueletos y su diagnóstico.
   */
  const cargando = !arrancado && (consola.conexion === "comprobando" || consola.conexion === "sin_configurar");
  const cortina = useCortinaDeCarga(cargando);

  /**
   * Al entrar —y cuando cambia el perfil o la URL del backend— se resuelve la
   * identidad contra el backend de Documentación. La URL viene de los ajustes
   * locales del módulo: es SU aplicación web, no la del resto del sistema. Sin
   * este dato la consola hablaba con el backend equivocado y «no se conectaba».
   */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      /* La caché se hidrata en paralelo con la conexión: son independientes y
         encadenarlas retrasaría la apertura instantánea sin ganar nada. */
      void hidratarCache();
      await comprobarConexion({ actor: current?.nombre ?? "", rol: current?.role ?? "", url: backendUrl || undefined });
      if (!vivo) return;
      setArrancado(true);
      // Y la cola de salida se vacía en cuanto hay conexión: puede haber cambios
      // de la sesión anterior esperando desde antes de cerrar la pestaña.
      void bombearSalida();
      // La medición de fluidez va después del arranque, cuando ya hay algo
      // pintado: medir mientras se monta el módulo daría siempre «equipo lento».
      medirFluidez();
    })();
    return () => {
      vivo = false;
    };
  }, [current?.nombre, current?.role, backendUrl]);

  /**
   * Al cambiar de perfil se vacía la caché de expedientes.
   *
   * Son datos personales: dejarlos guardados después de que otra persona inicie
   * sesión en el mismo equipo sería una fuga, aunque el módulo no los muestre.
   */
  const perfilAnterior = useRef(current?.id ?? "");
  useEffect(() => {
    const actual = current?.id ?? "";
    if (perfilAnterior.current && perfilAnterior.current !== actual) {
      cancelarPrecarga();
      void vaciarCache();
    }
    perfilAnterior.current = actual;
  }, [current?.id]);

  /** Vigilancia de la conexión: al volver la red, la cola se sincroniza sola. */
  useEffect(() => vigilarConexion(), []);

  useEffect(() => {
    if (consola.conexion !== "conectado") return;
    void refrescarNotificaciones();
  }, [consola.conexion, consola.seccion]);

  const secciones = useMemo(() => seccionesPermitidas(consola.capacidades), [consola.capacidades]);
  const seccionActiva: SeccionId = secciones.some((s) => s.id === consola.seccion) ? consola.seccion : "panel";
  const definicion = secciones.find((s) => s.id === seccionActiva);

  const conectado = consola.conexion === "conectado";

  /**
   * Contadores de la navegación.
   *
   * Solo se pinta el que ya se conoce sin pedir nada más: las notificaciones sin
   * leer, que el propio `estado` del módulo devuelve. Poner un contador en cada
   * sección exigiría una consulta agregada por sección en cada carga del módulo,
   * y un número que cuesta cinco peticiones no vale lo que cuesta.
   */
  const contadores: Partial<Record<SeccionId, ContadorSeccion>> = useMemo(() => {
    if (!conectado || consola.notificacionesNoLeidas <= 0) return {};
    return {
      notificaciones: {
        valor: consola.notificacionesNoLeidas,
        intencion: "aviso",
        descripcion: `${consola.notificacionesNoLeidas} sin leer`,
      },
    };
  }, [conectado, consola.notificacionesNoLeidas]);

  /** Cambio de sección con continuidad visual donde el navegador la soporta. */
  function cambiarSeccion(seccion: SeccionId) {
    conTransicionDeVista(() => irASeccion(seccion));
  }

  /**
   * Abrir un expediente.
   *
   * `useCallback` no es adorno: es lo que permite memoizar el árbol de secciones
   * más abajo. Con una función nueva en cada renderizado, la sección se
   * recalcularía siempre y el `useMemo` no serviría de nada.
   */
  const abrirExpediente = useCallback((expedienteId: string) => {
    setExpedienteAbierto(expedienteId);
  }, []);

  const cerrarExpediente = useCallback(() => setExpedienteAbierto(null), []);
  const marcarCambio = useCallback(() => setRefresco((n) => n + 1), []);
  const cerrarAlta = useCallback(() => setAltaAbierta(false), []);

  /**
   * Aviso global: el módulo funciona, pero hay algo que conviene saber.
   *
   * ── Qué cambió aquí y por qué ─────────────────────────────────────────────
   * Antes esto solo avisaba de las migraciones pendientes. Le faltaba el caso
   * que más tiempo cuesta en la práctica: el backend desplegado es de una
   * versión anterior a la pantalla —casi siempre porque se pegaron los `.gs` y
   * no se publicó una versión nueva de la implementación—. Ese caso no rompe
   * nada visible: rompe justo lo nuevo, en una pantalla cualquiera, con un
   * mensaje que no menciona el despliegue. Ahora se detecta al arrancar y se
   * dice arriba, con el paso exacto que lo arregla.
   */
  const compatibilidad = useMemo(() => diagnosticarCompatibilidad(consola.estado), [consola.estado]);
  const avisoGlobal =
    conectado && (consola.estado?.problema || compatibilidad.hallazgos.length > 0) ? (
      <DocModoDegradado
        intencion={consola.estado?.problema ? "peligro" : intencionDeSeveridad(compatibilidad.severidad)}
        detalle={
          consola.estado?.problema
            ? consola.estado.problema
            : compatibilidad.hallazgos.map((h) => `${h.titulo}. ${h.queHacer}`).join(" · ")
        }
        acciones={
          consola.capacidades.migrar ? (
            <Boton variante="suave" onClick={() => cambiarSeccion("configuracion")}>
              <Wrench className="h-3.5 w-3.5" aria-hidden /> Ir a mantenimiento
            </Boton>
          ) : undefined
        }
      />
    ) : undefined;

  /**
   * El árbol de la sección activa, memoizado.
   *
   * ── El fallo que esto corrige, medido ─────────────────────────────────────
   * `expedienteAbierto` vive en este componente, así que abrir un expediente
   * provocaba un renderizado de TODO: el armazón, la navegación y la sección
   * entera —que en «Expedientes» es una tabla de veinticinco filas con sus chips
   * y sus barras de avance—. Con la CPU estrangulada 4x, la sonda de rendimiento
   * midió 1.2 s desde el clic hasta que la ventana aparecía, y una tarea de
   * 400 ms bloqueando el hilo. La caché de expedientes no arreglaba nada de eso:
   * el dato ya estaba, lo que costaba era volver a pintar la lista.
   *
   * Con el árbol memoizado, abrir o cerrar la ventana no toca la sección: solo
   * monta el diálogo. Las dependencias son exactamente lo que la sección
   * necesita, y los manejadores son estables (`useCallback`) para que la
   * memoización no se invalide en cada renderizado.
   */
  const contenido = useMemo(() => {
    if (!conectado && seccionActiva !== "local" && seccionActiva !== "configuracion") {
      return (
        <SinConexion onIrALocal={() => irASeccion("local")} onIrAConfiguracion={() => irASeccion("configuracion")} avisar={avisar} />
      );
    }
    return (
      /* Sección con clave, NO envuelta en `<AnimatePresence mode="wait">`.
         El apretón de manos «primero sale la anterior, luego entra la nueva» se
         bloquea si la saliente no reporta que terminó —algo que ocurre en cuanto
         dentro hay una animación viva, un `layout` o un `layoutId`—, y entonces
         la sección nueva no se monta nunca: la pantalla se queda en blanco y hay
         que recargar. `App.tsx` ya aprendió esta lección a nivel de módulo (ver
         su comentario) y aquí aplica igual. Cambiar la clave de un `motion.div`
         intercambia la sección en el mismo fotograma y aun así la anima al
         entrar. */
      <motion.div key={seccionActiva} {...propsSeccion(reducido)}>
        {seccionActiva === "panel" && <SeccionPanel onAbrirExpediente={abrirExpediente} />}
        {seccionActiva === "expedientes" && (
          <SeccionExpedientes onAbrir={abrirExpediente} avisar={avisar} altaAbierta={altaAbierta} onCerrarAlta={cerrarAlta} />
        )}
        {seccionActiva === "solicitudes" && <SeccionSolicitudes onAbrirExpediente={abrirExpediente} avisar={avisar} />}
        {seccionActiva === "revision" && <SeccionRevision onAbrirExpediente={abrirExpediente} avisar={avisar} />}
        {seccionActiva === "aprobaciones" && <SeccionAprobaciones onAbrirExpediente={abrirExpediente} avisar={avisar} />}
        {seccionActiva === "prorrogas" && <SeccionProrrogas onAbrirExpediente={abrirExpediente} avisar={avisar} />}
        {seccionActiva === "tareas" && <SeccionTareas onAbrirExpediente={abrirExpediente} avisar={avisar} />}
        {seccionActiva === "reportes" && <SeccionReportes avisar={avisar} />}
        {seccionActiva === "exportaciones" && <SeccionExportaciones avisar={avisar} />}
        {seccionActiva === "notificaciones" && <SeccionNotificaciones avisar={avisar} onAbrirExpediente={abrirExpediente} />}
        {seccionActiva === "auditoria" && <SeccionAuditoria avisar={avisar} onAbrirExpediente={abrirExpediente} />}
        {seccionActiva === "configuracion" && <SeccionConfiguracion avisar={avisar} />}
        {seccionActiva === "local" && <VistaLocal />}
      </motion.div>
    );
  }, [conectado, seccionActiva, reducido, altaAbierta, abrirExpediente, avisar, cerrarAlta]);

  if (cortina) {
    return (
      <div data-doc-ligero={ligero ? "si" : "no"}>
        <DocCargando
          visible
          detalle={
            consola.conexion === "sin_configurar"
              ? "Comprobando la conexión con el libro…"
              : "Leyendo el catálogo de requisitos…"
          }
          onTiempoAgotado={() => setArrancado(true)}
        />
      </div>
    );
  }

  return (
    <div data-doc-ligero={ligero ? "si" : "no"} data-letra={preferencias.letra}>
      <DocShell
        secciones={secciones}
        seccionActiva={seccionActiva}
        definicion={definicion}
        onSeccion={cambiarSeccion}
        contadores={contadores}
        conexion={consola.conexion}
        libro={consola.estado?.libro}
        rol={consola.rol}
        ultimaSincronizacion={consola.ultimaSincronizacion}
        operaciones={consola.cargando}
        onReconectar={() => void comprobarConexion({ actor: current?.nombre ?? "", rol: current?.role ?? "", url: backendUrl || undefined })}
        avisoGlobal={avisoGlobal}
        accionPrincipal={
          conectado && consola.capacidades.editar ? (
            <Boton
              variante="primario"
              onClick={() => {
                irASeccion("expedientes");
                setAltaAbierta(true);
              }}
              titulo="Abrir un expediente documental nuevo"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Nuevo expediente
            </Boton>
          ) : undefined
        }
      >
        {contenido}
      </DocShell>

      <ExpedienteVentana
        expedienteId={expedienteAbierto}
        onCerrar={cerrarExpediente}
        onCambio={marcarCambio}
        avisar={avisar}
      />

      <Notitas notitas={notitas} onQuitar={quitar} />

      {/* `refresco` sirve para que las secciones que escuchan cambios del
          expediente puedan recargarse; se expone como dato oculto para no forzar
          una recarga completa del módulo. */}
      <span className="hidden" data-refresco={refresco} aria-hidden />
    </div>
  );
}

/**
 * Pantalla de conexión.
 *
 * Dice qué falta y ofrece las tres salidas reales: configurar, instalar o trabajar
 * en local. Un módulo que solo dice «error» deja a la persona sin nada que hacer.
 */
function SinConexion({
  onIrALocal,
  onIrAConfiguracion,
  avisar,
}: {
  onIrALocal: () => void;
  onIrAConfiguracion: () => void;
  avisar: (intencion: "info" | "exito" | "aviso" | "peligro", texto: string, pista?: string) => void;
}) {
  const { conexion, ultimoError, capacidades } = useConsola();
  const [instalando, setInstalando] = useState(false);

  return (
    <div className="space-y-3">
      <div className="doc-raised p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CircleSlash className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--doc-warning)" }} aria-hidden />
          <div className="min-w-0">
            <h3 className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">
              {conexion === "sin_configurar"
                ? "El módulo no tiene un backend configurado"
                : conexion === "sin_instalar"
                  ? "El libro todavía no tiene el modelo de Documentación"
                  : "No se puede hablar con el backend"}
            </h3>
            <p className="doc-prose mt-1 max-w-prose text-xs leading-relaxed text-[color:var(--doc-text-muted)]">
              {conexion === "sin_configurar" &&
                "La consola trabaja contra el libro de Google Sheets a través de una aplicación web de Apps Script. Pega su URL en los ajustes locales del módulo (Configuración › Ajustes locales › Conexión)."}
              {conexion === "sin_instalar" &&
                "El backend responde, pero le faltan las hojas del modelo normalizado. Se pueden crear desde aquí: la operación es idempotente y no borra nada de lo que ya haya en el libro."}
              {(conexion === "sin_conexion" || conexion === "error") &&
                "Puede ser la red, la implementación sin publicar o el acceso de la aplicación web. Mientras tanto puedes trabajar en la vista local: lo que registres se queda en este equipo y se sincroniza cuando vuelva la conexión."}
            </p>
            {ultimoError && (
              <div className="mt-3">
                <Aviso intencion="peligro" titulo={ultimoError.codigo}>
                  {ultimoError.mensaje} {ultimoError.pista}
                </Aviso>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Boton variante="suave" onClick={onIrAConfiguracion}>
                <Database className="h-3.5 w-3.5" aria-hidden /> Abrir configuración
              </Boton>
              {conexion === "sin_instalar" && capacidades.migrar && (
                <Boton
                  variante="primario"
                  cargando={instalando}
                  onClick={async () => {
                    setInstalando(true);
                    try {
                      /* Antes esto era un `import()` dinámico para no arrastrar el
                         cliente al paquete inicial. Ya no hace falta: el módulo
                         entero se carga aparte, así que la carga diferida aquí solo
                         partía el mismo trozo en dos. */
                      await docApi.instalar({ conRespaldo: true });
                      await comprobarConexion();
                      avisar("exito", "Modelo instalado. Ya se puede operar.");
                    } catch (error) {
                      const fallo = error as { message?: string; pista?: string };
                      avisar("peligro", fallo.message ?? "No se pudo instalar.", fallo.pista);
                    } finally {
                      setInstalando(false);
                    }
                  }}
                >
                  <Wrench className="h-3.5 w-3.5" aria-hidden /> Instalar el modelo
                </Boton>
              )}
              <Boton variante="suave" onClick={onIrALocal}>
                Abrir la vista local
              </Boton>
              <Boton variante="fantasma" onClick={() => void comprobarConexion()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reintentar
              </Boton>
            </div>
          </div>
        </div>
      </div>

      <Aviso intencion="info" titulo="Qué es la vista local">
        Es el módulo tal como funcionaba antes: guarda los expedientes en este equipo y los sube al libro cuando hay conexión. Sigue
        disponible siempre, y es la forma de trabajar mientras el backend no esté desplegado.
      </Aviso>
    </div>
  );
}
