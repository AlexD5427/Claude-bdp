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

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleSlash, Database, FolderPlus, RefreshCw, Wrench } from "lucide-react";
import { docApi } from "../api/acciones";
import { seccionesPermitidas, type SeccionId } from "../domain/vocabulario";
import { comprobarConexion, irASeccion, refrescarNotificaciones, useConsola } from "../state/consola";
import { useProfiles } from "../../../lib/profilesStore";
import { useDocStore } from "../../../lib/docStore";
import { Aviso, Boton, Notitas, useNotitas } from "./piezas";
import { propsSeccion, useMovimientoReducido } from "./DocMotion";
import { conTransicionDeVista } from "./DocViewTransitions";
import { DocShell, type ContadorSeccion } from "./DocShell";
import { DocModoDegradado } from "./DocStates";
import { SeccionPanel } from "./SeccionPanel";
import { SeccionExpedientes } from "./SeccionExpedientes";
import { ExpedienteLateral } from "./ExpedienteLateral";
import { SeccionAprobaciones, SeccionProrrogas, SeccionRevision, SeccionSolicitudes, SeccionTareas } from "./SeccionTrabajo";
import { SeccionAuditoria, SeccionExportaciones, SeccionNotificaciones, SeccionReportes } from "./SeccionReportes";
import { SeccionConfiguracion } from "./SeccionConfiguracion";
import { VistaLocal } from "./VistaLocal";

export function DocumentacionConsola() {
  const consola = useConsola();
  const { current } = useProfiles();
  const { settings } = useDocStore();
  const backendUrl = settings.scriptUrl;
  const { notitas, avisar, quitar } = useNotitas();
  const reducido = useMovimientoReducido();
  const [expedienteAbierto, setExpedienteAbierto] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [refresco, setRefresco] = useState(0);

  /**
   * Al entrar —y cuando cambia el perfil o la URL del backend— se resuelve la
   * identidad contra el backend de Documentación. La URL viene de los ajustes
   * locales del módulo: es SU aplicación web, no la del resto del sistema. Sin
   * este dato la consola hablaba con el backend equivocado y «no se conectaba».
   */
  useEffect(() => {
    void comprobarConexion({ actor: current?.nombre ?? "", rol: current?.role ?? "", url: backendUrl });
  }, [current?.nombre, current?.role, backendUrl]);

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

  function abrirExpediente(expedienteId: string) {
    setExpedienteAbierto(expedienteId);
  }

  /* Aviso global: el módulo funciona, pero hay algo que conviene saber. */
  const migracionesPendientes = consola.estado?.migraciones?.pendientes ?? [];
  const avisoGlobal =
    conectado && (consola.estado?.problema || migracionesPendientes.length > 0) ? (
      <DocModoDegradado
        detalle={
          consola.estado?.problema
            ? consola.estado.problema
            : `Hay ${migracionesPendientes.length} migración(es) pendiente(s) del modelo: ${migracionesPendientes.join(", ")}. Los datos son correctos, pero conviene aplicarlas antes de operar en volumen.`
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

  return (
    <>
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
        onReconectar={() => void comprobarConexion({ actor: current?.nombre ?? "", rol: current?.role ?? "", url: backendUrl })}
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
        {!conectado && seccionActiva !== "local" && seccionActiva !== "configuracion" ? (
          <SinConexion onIrALocal={() => irASeccion("local")} onIrAConfiguracion={() => irASeccion("configuracion")} avisar={avisar} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={seccionActiva} {...propsSeccion(reducido)}>
              {seccionActiva === "panel" && <SeccionPanel onAbrirExpediente={abrirExpediente} />}
              {seccionActiva === "expedientes" && (
                <SeccionExpedientes
                  onAbrir={abrirExpediente}
                  avisar={avisar}
                  altaAbierta={altaAbierta}
                  onCerrarAlta={() => setAltaAbierta(false)}
                />
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
          </AnimatePresence>
        )}
      </DocShell>

      <ExpedienteLateral
        expedienteId={expedienteAbierto}
        onCerrar={() => setExpedienteAbierto(null)}
        onCambio={() => setRefresco((n) => n + 1)}
        avisar={avisar}
      />

      <Notitas notitas={notitas} onQuitar={quitar} />

      {/* `refresco` sirve para que las secciones que escuchan cambios del
          expediente puedan recargarse; se expone como dato oculto para no forzar
          una recarga completa del módulo. */}
      <span className="hidden" data-refresco={refresco} aria-hidden />
    </>
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
