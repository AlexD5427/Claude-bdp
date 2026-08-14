/**
 * MÓDULO — Documentación.
 *
 * Consola de operación del proceso documental de incorporación, sobre el libro de
 * Google Sheets del área.
 *
 * ── Cómo está montada ───────────────────────────────────────────────────────
 * Un armazón con menú lateral y trece secciones. El armazón se ocupa de tres cosas
 * y nada más: resolver la conexión y los permisos al entrar, decidir qué secciones
 * puede ver este rol, y mantener abierto el panel del expediente por encima de la
 * sección que sea. Cada sección se ocupa de sus datos.
 *
 * ── Qué pasa si el backend no está ──────────────────────────────────────────
 * El módulo no finge. Si no hay backend configurado, o está sin instalar, o no
 * responde, se dice con claridad y se ofrece qué hacer: configurar la conexión,
 * instalar el modelo o abrir la vista local, que trabaja contra el almacén de este
 * equipo y es lo que había antes. Ninguna pantalla muestra datos inventados.
 *
 * ── Identidad visual ────────────────────────────────────────────────────────
 * Liquid Glass, con las superficies y los tokens que el resto de la aplicación ya
 * usa. Las animaciones se apagan enteras con `prefers-reduced-motion`, las tablas
 * se convierten en tarjetas en el móvil y todo estado lleva etiqueta además de
 * color.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CircleSlash,
  Cloud,
  CloudOff,
  Database,
  Loader2,
  Menu,
  PlugZap,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { seccionesPermitidas, type SeccionId } from "../domain/vocabulario";
import { comprobarConexion, irASeccion, refrescarNotificaciones, useConsola } from "../state/consola";
import { useProfiles } from "../../../lib/profilesStore";
import { Aviso, Boton, Notitas, useNotitas, usarMovimientoReducido } from "./piezas";
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
  const { notitas, avisar, quitar } = useNotitas();
  const reducido = usarMovimientoReducido();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [expedienteAbierto, setExpedienteAbierto] = useState<string | null>(null);
  const [refresco, setRefresco] = useState(0);

  /**
   * Al entrar —y cuando cambia el perfil— se resuelve la identidad contra el
   * backend. El perfil viaja como actor: es lo que el backend usa para resolver el
   * rol y para auditar quién hizo cada cosa.
   */
  useEffect(() => {
    void comprobarConexion({ actor: current?.nombre ?? "", rol: current?.role ?? "" });
  }, [current?.nombre, current?.role]);

  useEffect(() => {
    if (consola.conexion !== "conectado") return;
    void refrescarNotificaciones();
  }, [consola.conexion, consola.seccion]);

  const secciones = useMemo(() => seccionesPermitidas(consola.capacidades), [consola.capacidades]);
  const seccionActiva: SeccionId = secciones.some((s) => s.id === consola.seccion) ? consola.seccion : "panel";
  const definicion = secciones.find((s) => s.id === seccionActiva);

  const conectado = consola.conexion === "conectado";

  function abrirExpediente(expedienteId: string) {
    setExpedienteAbierto(expedienteId);
  }

  return (
    <div className="space-y-4">
      {/* Cabecera del módulo: estado de la conexión, rol y avisos. */}
      <header className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="rounded-xl p-2 text-ink-soft hover:bg-[color:var(--fill-2)] lg:hidden"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Abrir el menú del módulo"
            aria-expanded={menuAbierto}
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{definicion?.etiqueta ?? "Documentación"}</h2>
            <p className="truncate text-[11px] text-ink-soft">{definicion?.descripcion}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <IndicadorConexion />
          {consola.rol && (
            <span className="rounded-full bg-[color:var(--fill-2)] px-2.5 py-1 text-[11px] text-ink-soft" title="Rol resuelto por el backend">
              {consola.rol}
            </span>
          )}
          {conectado && consola.notificacionesNoLeidas > 0 && (
            <button
              type="button"
              onClick={() => irASeccion("notificaciones")}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/30"
            >
              <Bell className="h-3 w-3" aria-hidden /> {consola.notificacionesNoLeidas} sin leer
            </button>
          )}
          {consola.cargando > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint" role="status" aria-live="polite">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> trabajando
            </span>
          )}
          <Boton variante="suave" onClick={() => void comprobarConexion({ actor: current?.nombre ?? "", rol: current?.role ?? "" })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reconectar
          </Boton>
        </div>
      </header>

      <div className="flex gap-4">
        {/* Menú. En pantallas estrechas es un desplegable. */}
        <nav
          className={`${menuAbierto ? "block" : "hidden"} w-full shrink-0 lg:block lg:w-52`}
          aria-label="Secciones del módulo de Documentación"
        >
          <ul className="glass space-y-0.5 rounded-3xl p-2">
            {secciones.map((seccion) => {
              const activa = seccion.id === seccionActiva;
              return (
                <li key={seccion.id}>
                  <button
                    type="button"
                    onClick={() => {
                      irASeccion(seccion.id);
                      setMenuAbierto(false);
                    }}
                    aria-current={activa ? "page" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                      activa ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30" : "text-ink-soft hover:bg-[color:var(--fill-1)] hover:text-ink"
                    }`}
                  >
                    <span className="truncate">{seccion.etiqueta}</span>
                    {seccion.id === "notificaciones" && consola.notificacionesNoLeidas > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[10px] text-amber-200">
                        {consola.notificacionesNoLeidas}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Contenido */}
        <div className={`min-w-0 flex-1 ${menuAbierto ? "hidden lg:block" : "block"}`}>
          {!conectado && seccionActiva !== "local" && seccionActiva !== "configuracion" ? (
            <SinConexion onIrALocal={() => irASeccion("local")} onIrAConfiguracion={() => irASeccion("configuracion")} avisar={avisar} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={seccionActiva}
                initial={reducido ? undefined : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducido ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reducido ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                {seccionActiva === "panel" && <SeccionPanel />}
                {seccionActiva === "expedientes" && <SeccionExpedientes onAbrir={abrirExpediente} avisar={avisar} />}
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
        </div>
      </div>

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
    </div>
  );
}

/** Indicador de conexión, con etiqueta además de color. */
function IndicadorConexion() {
  const { conexion, estado } = useConsola();
  const mapa: Record<string, { texto: string; clase: string; icono: JSX.Element }> = {
    sin_configurar: {
      texto: "Sin backend",
      clase: "bg-[color:var(--fill-2)] text-ink-soft",
      icono: <PlugZap className="h-3 w-3" aria-hidden />,
    },
    comprobando: {
      texto: "Conectando…",
      clase: "bg-cyan-500/15 text-cyan-200",
      icono: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
    },
    conectado: {
      texto: estado?.libro ? `Conectado · ${estado.libro}` : "Conectado",
      clase: "bg-emerald-500/15 text-emerald-200",
      icono: <Cloud className="h-3 w-3" aria-hidden />,
    },
    sin_instalar: {
      texto: "Libro sin instalar",
      clase: "bg-amber-500/15 text-amber-200",
      icono: <Wrench className="h-3 w-3" aria-hidden />,
    },
    sin_conexion: {
      texto: "Sin conexión",
      clase: "bg-rose-500/15 text-rose-200",
      icono: <CloudOff className="h-3 w-3" aria-hidden />,
    },
    error: {
      texto: "Error de conexión",
      clase: "bg-rose-500/15 text-rose-200",
      icono: <ShieldAlert className="h-3 w-3" aria-hidden />,
    },
  };
  const item = mapa[conexion] ?? mapa.error;
  return (
    <span className={`inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.clase}`}>
      {item.icono}
      <span className="truncate">{item.texto}</span>
    </span>
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
      <div className="glass rounded-3xl p-6">
        <div className="flex items-start gap-3">
          <CircleSlash className="mt-0.5 h-5 w-5 text-amber-300" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">
              {conexion === "sin_configurar"
                ? "El módulo no tiene un backend configurado"
                : conexion === "sin_instalar"
                  ? "El libro todavía no tiene el modelo de Documentación"
                  : "No se puede hablar con el backend"}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              {conexion === "sin_configurar" &&
                "La consola trabaja contra el libro de Google Sheets a través de una aplicación web de Apps Script. Pega su URL en los ajustes locales del módulo (Configuración › Ajustes locales › Conexión)."}
              {conexion === "sin_instalar" &&
                "El backend responde, pero le faltan las hojas del modelo normalizado. Se pueden crear desde aquí: la operación es idempotente y no borra nada de lo que ya haya en el libro."}
              {(conexion === "sin_conexion" || conexion === "error") &&
                "Puede ser la red, la implementación sin publicar o el acceso de la aplicación web. Mientras tanto puedes trabajar en la vista local: lo que registres se queda en este equipo y se sincroniza cuando vuelva la conexión."}
            </p>
            {ultimoError && (
              <Aviso intencion="peligro" titulo={ultimoError.codigo}>
                {ultimoError.mensaje} {ultimoError.pista}
              </Aviso>
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
                      const { docApi } = await import("../api/acciones");
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
