/**
 * Configuración del módulo: catálogo, plazos, permisos, automatizaciones y
 * mantenimiento del libro.
 *
 * ── Qué se puede tocar aquí y qué no ────────────────────────────────────────
 * Se puede: renombrar un requisito, activarlo o desactivarlo, cambiar su
 * obligatoriedad y su prórroga, ajustar los SLA y los umbrales, conceder roles,
 * apagar automatizaciones y ejecutar el mantenimiento.
 *
 * No se puede: cambiar a qué rama pertenece un requisito ni su sección. Eso altera
 * qué requisitos existen en expedientes ya creados, y esa clase de cambio se hace
 * con una versión nueva del catálogo, no desde un formulario.
 *
 * ── El mantenimiento vive aquí, no en Apps Script ───────────────────────────
 * Instalar, simular la migración, migrar, diagnosticar y reparar son botones. Quien
 * usa el sistema no es programador: si algo se rompe, la respuesta correcta es un
 * botón que lo arregla y un informe de qué cambió, no un manual.
 */

import { useState } from "react";
import { AlertTriangle, Database, RefreshCw, ShieldCheck, Stethoscope, Wrench } from "lucide-react";
import { docApi, type CatalogoDocumento, type Diagnostico } from "../api/acciones";
import { comprobarConexion, refrescarCatalogo, urlBackend, useConsola } from "../state/consola";
import {
  Aviso,
  Boton,
  Campo,
  ChipEstado,
  Confirmacion,
  Entrada,
  Interruptor,
  Panel,
  Selector,
  Tabla,
  Vacio,
  type ColumnaTabla,
  type Notita,
} from "./piezas";
import { useDatos } from "./useDatos";
import { DocSettingsModal } from "../../../components/doc/DocSettingsModal";
import { useDocStore } from "../../../lib/docStore";

interface Props {
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}

type Pestana = "estado" | "catalogo" | "plazos" | "permisos" | "automatizaciones" | "mantenimiento" | "local";

export function SeccionConfiguracion({ avisar }: Props) {
  const { conexion, estado, capacidades, catalogo, rol } = useConsola();
  const [pestana, setPestana] = useState<Pestana>("estado");
  const [ajustesLocales, setAjustesLocales] = useState(false);

  const pestanas: { id: Pestana; etiqueta: string; visible: boolean }[] = [
    { id: "estado", etiqueta: "Conexión y esquema", visible: true },
    { id: "catalogo", etiqueta: "Catálogo de documentos", visible: capacidades.catalogos === true },
    { id: "plazos", etiqueta: "Plazos y SLA", visible: capacidades.configurar === true },
    { id: "permisos", etiqueta: "Permisos", visible: capacidades.configurar === true },
    { id: "automatizaciones", etiqueta: "Automatizaciones", visible: capacidades.configurar === true },
    { id: "mantenimiento", etiqueta: "Mantenimiento", visible: capacidades.diagnosticar === true },
    { id: "local", etiqueta: "Ajustes locales", visible: true },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto border-b border-[color:var(--hairline)] pb-1" role="tablist" aria-label="Configuración">
        {pestanas
          .filter((p) => p.visible)
          .map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={`shrink-0 rounded-t-xl px-3 py-2 text-xs font-semibold transition-colors ${
                pestana === p.id ? "bg-[color:var(--fill-2)] text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
      </div>

      {pestana === "estado" && (
        <div className="space-y-3">
          <Panel titulo="Conexión" descripcion="Dónde está el libro y qué versión del módulo responde.">
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <Fila etiqueta="Estado" valor={conexion} />
              <Fila etiqueta="Rol resuelto" valor={rol || "—"} />
              <Fila etiqueta="Libro" valor={estado?.libro || "—"} />
              <Fila etiqueta="Arquitectura" valor={estado ? `${estado.arquitectura} v${estado.version}` : "—"} />
              <Fila etiqueta="Esquema normalizado" valor={estado ? String(estado.esquema) : "—"} />
              <Fila etiqueta="Backend heredado" valor={estado?.backendHeredado || "—"} />
              <Fila etiqueta="Expedientes" valor={estado?.expedientes !== undefined ? String(estado.expedientes) : "—"} />
              <Fila etiqueta="Endpoint" valor={urlBackend()} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Boton variante="suave" onClick={() => void comprobarConexion()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Comprobar conexión
              </Boton>
              {estado?.libroUrl && (
                <a
                  href={estado.libroUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/10"
                >
                  <Database className="h-3.5 w-3.5" aria-hidden /> Abrir el libro
                </a>
              )}
            </div>
          </Panel>

          {estado?.migraciones && (
            <Panel titulo="Migraciones" descripcion="Versiones de esquema aplicadas y pendientes.">
              <ul className="space-y-1 text-xs">
                {estado.migraciones.aplicadas.map((version) => (
                  <li key={version} className="flex items-center gap-2">
                    <ChipEstado estado="aplicada" intencion="exito" /> <span className="text-ink">{version}</span>
                  </li>
                ))}
                {estado.migraciones.pendientes.map((version) => (
                  <li key={version} className="flex items-center gap-2">
                    <ChipEstado estado="pendiente" intencion="aviso" /> <span className="text-ink">{version}</span>
                  </li>
                ))}
              </ul>
              {estado.migraciones.pendientes.length > 0 && (
                <Aviso intencion="aviso" titulo="Hay migraciones sin aplicar">
                  Ejecútalas desde la pestaña Mantenimiento. Antes, saca un respaldo: el botón está en la misma pestaña.
                </Aviso>
              )}
            </Panel>
          )}

          {catalogo && (
            <Panel titulo="Aplicabilidad por rama" descripcion="Cuántos requisitos exige cada combinación de tipo de funcionario y garantía.">
              <ul className="space-y-1 text-xs">
                {catalogo.aplicabilidad.map((rama) => (
                  <li key={`${rama.tipoFuncionario}-${rama.tipoGarantia}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-ink">
                      {rama.etiqueta}
                      {rama.tipoGarantia !== "NINGUNA" ? ` · ${rama.tipoGarantia}` : ""}
                    </span>
                    {rama.habilitada ? (
                      <span className="text-ink-soft">
                        {rama.total} requisitos · {rama.obligatorios} obligatorios
                      </span>
                    ) : (
                      <ChipEstado estado="en construcción" intencion="aviso" titulo={rama.nota} />
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {pestana === "catalogo" && <PestanaCatalogo avisar={avisar} />}
      {pestana === "plazos" && <PestanaPlazos avisar={avisar} />}
      {pestana === "permisos" && <PestanaPermisos avisar={avisar} />}
      {pestana === "automatizaciones" && <PestanaAutomatizaciones avisar={avisar} />}
      {pestana === "mantenimiento" && <PestanaMantenimiento avisar={avisar} />}

      {pestana === "local" && (
        <Panel
          titulo="Ajustes locales del módulo"
          descripcion="Presentación, conexión del almacén local, respaldo espejo y mantenimiento del libro heredado."
        >
          <p className="mb-3 text-xs text-ink-soft">
            Estos ajustes afectan a la vista local y a la sincronización del almacén de este equipo. La configuración del modelo
            normalizado —plazos, permisos, catálogo— está en las otras pestañas.
          </p>
          <Boton variante="suave" onClick={() => setAjustesLocales(true)}>
            Abrir ajustes locales
          </Boton>
          {ajustesLocales && <AjustesLocales onCerrar={() => setAjustesLocales(false)} />}
        </Panel>
      )}
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">{etiqueta}</dt>
      <dd className="truncate text-ink" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

/**
 * Ajustes del almacén local.
 *
 * Reutiliza el modal que ya existía: trae la conexión del almacén local, el
 * respaldo espejo, la importación y el mantenimiento del libro heredado. Volver a
 * escribir todo eso en la consola sería duplicar una pantalla que funciona.
 */
function AjustesLocales({ onCerrar }: { onCerrar: () => void }) {
  const { settings } = useDocStore();
  return <DocSettingsModal open onClose={onCerrar} settings={settings} />;
}

/* ================================================================== */
/* Catálogo                                                            */
/* ================================================================== */

function PestanaCatalogo({ avisar }: Props) {
  const { conexion, densidad } = useConsola();
  const catalogo = useDatos(() => docApi.catalogo(), [], { activo: conexion === "conectado" });
  const [borrador, setBorrador] = useState<Record<string, Partial<CatalogoDocumento>>>({});
  const [guardando, setGuardando] = useState(false);

  const documentos = catalogo.datos?.documentos ?? [];
  const cambios = Object.keys(borrador).length;

  function poner(codigo: string, patch: Partial<CatalogoDocumento>) {
    setBorrador((prev) => ({ ...prev, [codigo]: { ...prev[codigo], ...patch } }));
  }

  const columnas: ColumnaTabla<CatalogoDocumento>[] = [
    {
      clave: "nombre",
      encabezado: "Requisito",
      render: (fila) => (
        <Entrada
          value={(borrador[fila.codigo]?.nombre as string) ?? fila.nombre}
          onChange={(e) => poner(fila.codigo, { nombre: e.target.value })}
          aria-label={`Nombre de ${fila.codigo}`}
        />
      ),
    },
    { clave: "codigo", encabezado: "Código", secundaria: true, render: (fila) => <span className="text-[11px] text-ink-faint">{fila.codigo}</span> },
    { clave: "seccion", encabezado: "Sección", render: (fila) => <span className="text-xs text-ink-soft">{fila.seccion}</span> },
    {
      clave: "obligatorio",
      encabezado: "Obligatorio",
      render: (fila) => (
        <Interruptor
          activo={(borrador[fila.codigo]?.obligatorio as boolean) ?? fila.obligatorio}
          onChange={(v) => poner(fila.codigo, { obligatorio: v })}
          etiqueta=""
        />
      ),
    },
    {
      clave: "prorroga",
      encabezado: "Prórroga",
      render: (fila) => (
        <Interruptor
          activo={(borrador[fila.codigo]?.permiteProrroga as boolean) ?? fila.permiteProrroga}
          onChange={(v) => poner(fila.codigo, { permiteProrroga: v })}
          etiqueta=""
        />
      ),
    },
    {
      clave: "revision",
      encabezado: "Exige revisión",
      secundaria: true,
      render: (fila) => (
        <Interruptor
          activo={(borrador[fila.codigo]?.requiereRevision as boolean) ?? fila.requiereRevision}
          onChange={(v) => poner(fila.codigo, { requiereRevision: v })}
          etiqueta=""
        />
      ),
    },
    {
      clave: "activo",
      encabezado: "Activo",
      render: (fila) => (
        <Interruptor
          activo={(borrador[fila.codigo]?.activo as boolean) ?? fila.activo}
          onChange={(v) => poner(fila.codigo, { activo: v })}
          etiqueta=""
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <Aviso intencion="info" titulo="Una sola fuente">
        Este catálogo alimenta el formulario, la validación, la vista del expediente, los reportes y las exportaciones. Desactivar un
        requisito deja de exigirlo en los expedientes nuevos y en el recálculo de los existentes; lo ya registrado se conserva.
      </Aviso>

      <Panel
        titulo="Requisitos"
        descripcion={`${documentos.length} documentos. La sección y la rama son estructura del proceso y no se editan aquí.`}
        acciones={
          <>
            {cambios > 0 && (
              <Boton variante="fantasma" onClick={() => setBorrador({})}>
                Descartar
              </Boton>
            )}
            <Boton
              variante="primario"
              disabled={!cambios}
              cargando={guardando}
              onClick={async () => {
                setGuardando(true);
                try {
                  const lista = Object.entries(borrador).map(([codigo, patch]) => ({
                    codigo_documento: codigo,
                    nombre_visible: patch.nombre,
                    obligatorio: patch.obligatorio,
                    permite_prorroga: patch.permiteProrroga,
                    requiere_revision: patch.requiereRevision,
                    activo: patch.activo,
                  }));
                  const res = await docApi.guardarCatalogo(lista);
                  setBorrador({});
                  catalogo.recargar();
                  void refrescarCatalogo();
                  avisar("exito", `${res.guardados} requisito(s) actualizado(s).`);
                } catch (error) {
                  const fallo = error as { message?: string; pista?: string };
                  avisar("peligro", fallo.message ?? "No se pudo guardar el catálogo.", fallo.pista);
                } finally {
                  setGuardando(false);
                }
              }}
            >
              Guardar {cambios || ""} cambio(s)
            </Boton>
          </>
        }
      >
        <Tabla
          columnas={columnas}
          filas={documentos}
          claveFila={(fila) => fila.codigo}
          cargando={catalogo.cargando && !catalogo.datos}
          densidad={densidad}
          titulo="Catálogo de documentos"
        />
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Plazos y SLA                                                        */
/* ================================================================== */

function PestanaPlazos({ avisar }: Props) {
  const { conexion } = useConsola();
  const config = useDatos(() => docApi.configuracion(), [], { activo: conexion === "conectado" });
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const claves = [
    { clave: "sla_revision_horas", etiqueta: "SLA de revisión (horas)", ayuda: "Plazo para decidir sobre un requisito entregado." },
    { clave: "sla_aprobacion_horas", etiqueta: "SLA de aprobación (horas)", ayuda: "Plazo para firmar una aprobación." },
    { clave: "sla_correccion_horas", etiqueta: "SLA de corrección (horas)", ayuda: "Plazo de la tarea que abre una observación." },
    { clave: "sla_seguimiento_horas", etiqueta: "SLA de seguimiento (horas)", ayuda: "Plazo por defecto de una tarea de seguimiento." },
    { clave: "sla_solicitud_horas", etiqueta: "SLA de solicitud (horas)", ayuda: "Plazo por defecto de una solicitud documental." },
    { clave: "prorroga_aviso_dias", etiqueta: "Aviso de prórroga (días)", ayuda: "Cuántos días antes se considera «por vencer»." },
    { clave: "prorroga_maxima_dias", etiqueta: "Prórroga máxima (días)", ayuda: "Tope de plazo que se puede conceder." },
    { clave: "solicitud_aviso_dias", etiqueta: "Recordatorio de solicitud (días)", ayuda: "Cada cuánto se sugiere insistir." },
    { clave: "retencion_dias", etiqueta: "Retención documental (días)", ayuda: "Tras este plazo, un expediente archivado se marca pendiente de eliminación." },
  ];

  return (
    <div className="space-y-3">
      <Panel titulo="Plazos" descripcion="Cambian el comportamiento del proceso diario, de las tareas y de las prórrogas.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {claves.map((item) => (
            <Campo key={item.clave} etiqueta={item.etiqueta} ayuda={item.ayuda}>
              <Entrada
                type="number"
                min={0}
                value={valores[item.clave] ?? config.datos?.configuracion[item.clave] ?? ""}
                onChange={(e) => setValores((prev) => ({ ...prev, [item.clave]: e.target.value }))}
              />
            </Campo>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Interruptor
            activo={String(config.datos?.configuracion.correo_habilitado ?? "FALSE").toUpperCase() === "TRUE"}
            onChange={async (v) => {
              try {
                await docApi.guardarConfiguracion({ correo_habilitado: v });
                config.recargar();
                avisar("exito", v ? "Correo habilitado." : "Correo deshabilitado.");
              } catch (error) {
                const fallo = error as { message?: string };
                avisar("peligro", fallo.message ?? "No se pudo cambiar.");
              }
            }}
            etiqueta="Enviar notificaciones por correo"
          />
          <Interruptor
            activo={String(config.datos?.configuracion.espejo_libro_anual ?? "TRUE").toUpperCase() === "TRUE"}
            onChange={async (v) => {
              try {
                await docApi.guardarConfiguracion({ espejo_libro_anual: v });
                config.recargar();
                avisar("exito", v ? "Espejo del libro anual activo." : "Espejo del libro anual desactivado.");
              } catch (error) {
                const fallo = error as { message?: string };
                avisar("peligro", fallo.message ?? "No se pudo cambiar.");
              }
            }}
            etiqueta="Reflejar en el libro anual (CONTROL INGRESOS)"
          />
          <Interruptor
            activo={String(config.datos?.configuracion.exigir_llave_admin ?? "FALSE").toUpperCase() === "TRUE"}
            onChange={async (v) => {
              try {
                await docApi.guardarConfiguracion({ exigir_llave_admin: v });
                config.recargar();
                avisar(
                  "exito",
                  v ? "Migrar, reparar y configurar exigen la llave de administración." : "Llave de administración no exigida.",
                );
              } catch (error) {
                const fallo = error as { message?: string };
                avisar("peligro", fallo.message ?? "No se pudo cambiar.");
              }
            }}
            etiqueta="Exigir llave de administración en operaciones sensibles"
          />
        </div>

        <div className="mt-3">
          <Boton
            variante="primario"
            cargando={guardando}
            disabled={!Object.keys(valores).length}
            onClick={async () => {
              setGuardando(true);
              try {
                const res = await docApi.guardarConfiguracion(valores);
                setValores({});
                config.recargar();
                if (res.rechazadas.length) {
                  avisar("aviso", `${res.guardadas.length} guardada(s), ${res.rechazadas.length} rechazada(s).`, res.rechazadas[0]?.motivo);
                } else {
                  avisar("exito", `${res.guardadas.length} clave(s) guardada(s).`);
                }
              } catch (error) {
                const fallo = error as { message?: string; pista?: string };
                avisar("peligro", fallo.message ?? "No se pudo guardar.", fallo.pista);
              } finally {
                setGuardando(false);
              }
            }}
          >
            Guardar plazos
          </Boton>
        </div>
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Permisos                                                            */
/* ================================================================== */

function PestanaPermisos({ avisar }: Props) {
  const { conexion } = useConsola();
  const permisos = useDatos(() => docApi.permisos(), [], { activo: conexion === "conectado" });
  const config = useDatos(() => docApi.configuracion(), [], { activo: conexion === "conectado" });
  const [nuevoActor, setNuevoActor] = useState("");
  const [nuevoRol, setNuevoRol] = useState("analista");

  const mapa = (() => {
    const crudo = config.datos?.configuracion.roles_por_actor;
    if (!crudo) return {} as Record<string, string>;
    try {
      return JSON.parse(String(crudo)) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  })();

  async function guardar(siguiente: Record<string, string>) {
    try {
      const res = await docApi.guardarPermisos(siguiente);
      config.recargar();
      permisos.recargar();
      if (res.rechazados.length) avisar("aviso", "Algunos roles no se reconocieron.", JSON.stringify(res.rechazados[0]));
      else avisar("exito", "Permisos actualizados.");
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      avisar("peligro", fallo.message ?? "No se pudieron guardar los permisos.", fallo.pista);
    }
  }

  return (
    <div className="space-y-3">
      <Aviso intencion="info" titulo="El backend comprueba cada acción">
        Ocultar un botón no es seguridad: la comprobación ocurre en el servidor, con el rol que el servidor resuelve. Este mapa es lo
        que decide ese rol.
      </Aviso>

      <Panel titulo="Personas y roles" descripcion="Se identifican por el perfil de la aplicación o por su correo de Google.">
        <ul className="space-y-2">
          {Object.entries(mapa).map(([actor, rol]) => (
            <li key={actor} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[180px] flex-1 truncate text-xs text-ink" title={actor}>
                {actor}
              </span>
              <div className="min-w-[150px]">
                <Selector
                  valor={rol}
                  onChange={(v) => void guardar({ ...mapa, [actor]: v })}
                  opciones={(permisos.datos?.roles ?? []).map((r) => ({ valor: r, etiqueta: r }))}
                />
              </div>
              <Boton
                variante="fantasma"
                onClick={() => {
                  const siguiente = { ...mapa };
                  delete siguiente[actor];
                  void guardar(siguiente);
                }}
              >
                Quitar
              </Boton>
            </li>
          ))}
          {!Object.keys(mapa).length && <Vacio titulo="Sin roles asignados" detalle="Quien no esté en la lista recibe el rol por defecto." />}
        </ul>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[color:var(--hairline)] pt-3">
          <div className="min-w-[200px] flex-1">
            <Campo etiqueta="Perfil o correo">
              <Entrada value={nuevoActor} onChange={(e) => setNuevoActor(e.target.value)} placeholder="nombre@bdp.com" />
            </Campo>
          </div>
          <div className="min-w-[150px]">
            <Campo etiqueta="Rol">
              <Selector valor={nuevoRol} onChange={setNuevoRol} opciones={(permisos.datos?.roles ?? []).map((r) => ({ valor: r, etiqueta: r }))} />
            </Campo>
          </div>
          <Boton
            variante="primario"
            disabled={!nuevoActor.trim()}
            onClick={() => {
              void guardar({ ...mapa, [nuevoActor.trim()]: nuevoRol });
              setNuevoActor("");
            }}
          >
            Conceder
          </Boton>
        </div>
      </Panel>

      {permisos.datos && (
        <Panel titulo="Qué puede cada rol" descripcion="Matriz vigente en el backend.">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="pb-2 pr-3 text-[10px] uppercase tracking-wide text-ink-faint">
                    Rol
                  </th>
                  <th scope="col" className="pb-2 text-[10px] uppercase tracking-wide text-ink-faint">
                    Capacidades
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(permisos.datos.matriz).map(([rolFila, capacidades]) => (
                  <tr key={rolFila} className="border-t border-[color:var(--hairline)]/60">
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium text-ink">
                      {rolFila}
                    </th>
                    <td className="py-1.5 text-ink-soft">{(capacidades as string[]).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ================================================================== */
/* Automatizaciones                                                    */
/* ================================================================== */

function PestanaAutomatizaciones({ avisar }: Props) {
  const { conexion } = useConsola();
  const config = useDatos(() => docApi.configuracion(), [], { activo: conexion === "conectado" });
  const desactivadas = config.datos?.desactivadas ?? [];

  return (
    <div className="space-y-3">
      <Aviso intencion="info" titulo="Lista blanca, no un intérprete">
        Cada automatización une un evento con una acción que el backend sabe ejecutar. Se pueden apagar, pero no se puede añadir lógica
        nueva desde la configuración: un motor que ejecuta lo que diga una hoja de cálculo es una puerta abierta.
      </Aviso>

      <Panel titulo="Reglas" descripcion="Al apagar una regla, su efecto deja de ocurrir; lo ya hecho se conserva.">
        <ul className="space-y-2">
          {(config.datos?.automatizaciones ?? []).map((regla) => {
            const activa = !desactivadas.includes(regla.codigo);
            return (
              <li key={regla.codigo} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl bg-[color:var(--fill-1)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink">{regla.codigo}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">{regla.descripcion}</p>
                  <p className="mt-0.5 text-[10px] text-ink-faint">
                    {regla.evento} → {regla.accion}
                  </p>
                </div>
                <Interruptor
                  activo={activa}
                  etiqueta={activa ? "Activa" : "Apagada"}
                  onChange={async (v) => {
                    const siguiente = v ? desactivadas.filter((c) => c !== regla.codigo) : [...desactivadas, regla.codigo];
                    try {
                      await docApi.guardarConfiguracion({ automatizaciones_desactivadas: siguiente });
                      config.recargar();
                      avisar("exito", v ? "Automatización activada." : "Automatización apagada.");
                    } catch (error) {
                      const fallo = error as { message?: string };
                      avisar("peligro", fallo.message ?? "No se pudo cambiar.");
                    }
                  }}
                />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* Mantenimiento                                                       */
/* ================================================================== */

function PestanaMantenimiento({ avisar }: Props) {
  const { capacidades } = useConsola();
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [informe, setInforme] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState<null | "migrar" | "reparar">(null);

  async function ejecutar(nombre: string, fn: () => Promise<string[]>) {
    setTrabajando(nombre);
    try {
      const lineas = await fn();
      setInforme(lineas);
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      avisar("peligro", fallo.message ?? `Falló ${nombre}.`, fallo.pista);
    } finally {
      setTrabajando(null);
      setConfirmando(null);
    }
  }

  const severidades: Record<string, "info" | "aviso" | "peligro"> = {
    INFO: "info",
    ADVERTENCIA: "aviso",
    IMPORTANTE: "aviso",
    CRITICO: "peligro",
  };

  return (
    <div className="space-y-3">
      <Panel titulo="Orden recomendado" descripcion="Respaldar, simular, migrar, diagnosticar y solo entonces reparar.">
        <div className="flex flex-wrap gap-2">
          <Boton
            variante="suave"
            cargando={trabajando === "respaldo"}
            onClick={() =>
              ejecutar("respaldo", async () => {
                const res = await docApi.respaldo();
                if (!res.ok) return [`No se pudo respaldar: ${res.error ?? ""}`, res.recomendacion ?? ""];
                return [`Respaldo ${res.respaldoId} con ${res.expedientes} expediente(s).`];
              })
            }
          >
            <Database className="h-3.5 w-3.5" aria-hidden /> Respaldar
          </Boton>

          <Boton
            variante="suave"
            cargando={trabajando === "simular"}
            onClick={() =>
              ejecutar("simular", async () => {
                const res = await docApi.migrar({ simular: true });
                return [
                  "Simulación: nada se escribió en el libro.",
                  ...res.ejecutadas.map((e) => `${e.version}: ${e.ok ? e.resumen : `ERROR ${e.error}`}`),
                  res.recomendacionRespaldo,
                ];
              })
            }
          >
            <Stethoscope className="h-3.5 w-3.5" aria-hidden /> Simular migración
          </Boton>

          {capacidades.migrar && (
            <Boton variante="primario" onClick={() => setConfirmando("migrar")}>
              <Wrench className="h-3.5 w-3.5" aria-hidden /> Instalar o migrar
            </Boton>
          )}

          <Boton
            variante="suave"
            cargando={trabajando === "diagnostico"}
            onClick={() =>
              ejecutar("diagnostico", async () => {
                const res = await docApi.diagnostico();
                setDiagnostico(res);
                return [
                  `Críticos ${res.conteos.CRITICO} · importantes ${res.conteos.IMPORTANTE} · advertencias ${res.conteos.ADVERTENCIA} · info ${res.conteos.INFO}`,
                  res.reparablesAutomaticamente.length ? `Reparables solos: ${res.reparablesAutomaticamente.join(", ")}` : "Nada reparable automáticamente.",
                ];
              })
            }
          >
            <Stethoscope className="h-3.5 w-3.5" aria-hidden /> Diagnosticar
          </Boton>

          {capacidades.reparar && (
            <Boton variante="suave" onClick={() => setConfirmando("reparar")}>
              <Wrench className="h-3.5 w-3.5" aria-hidden /> Reparar
            </Boton>
          )}

          {capacidades.reparar && (
            <Boton
              variante="suave"
              cargando={trabajando === "diario"}
              onClick={() =>
                ejecutar("diario", async () => {
                  const res = (await docApi.procesoDiario()) as Record<string, number | string | string[]>;
                  return [
                    `Prórrogas vencidas: ${res.prorrogasVencidas} · avisadas: ${res.prorrogasAvisadas}`,
                    `Solicitudes vencidas: ${res.solicitudesVencidas} · tareas vencidas: ${res.tareasVencidas}`,
                    `Aprobaciones vencidas: ${res.aprobacionesVencidas}`,
                  ];
                })
              }
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Ejecutar proceso diario
            </Boton>
          )}
        </div>

        {!!informe.length && (
          <div className="mt-3 rounded-2xl bg-[color:var(--fill-1)] p-3">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-ink-faint">Resultado</p>
            <ul className="space-y-1 text-xs text-ink-soft">
              {informe.filter(Boolean).map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {diagnostico && (
        <Panel
          titulo="Hallazgos"
          descripcion={`${diagnostico.hallazgos.length} hallazgo(s) · ${diagnostico.ms} ms. El diagnóstico solo lee: no cambia nada.`}
        >
          {diagnostico.hallazgos.length ? (
            <ul className="space-y-2">
              {diagnostico.hallazgos.map((hallazgo) => (
                <li key={hallazgo.codigo} className="rounded-2xl bg-[color:var(--fill-1)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChipEstado estado={hallazgo.severidad} intencion={severidades[hallazgo.severidad] ?? "info"} />
                    <span className="text-xs font-semibold text-ink">{hallazgo.titulo}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-soft">{hallazgo.detalle}</p>
                  {hallazgo.accion && (
                    <p className="mt-1 text-[11px] text-cyan-200">
                      Se corrige con «{hallazgo.accion}»
                      {hallazgo.reparable === "automatica" ? " (automático)" : hallazgo.reparable === "confirmacion" ? " (requiere confirmación)" : ""}
                    </p>
                  )}
                  {!hallazgo.reparable && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-200">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> Requiere revisión manual.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Vacio titulo="Sin hallazgos" detalle="La estructura y los datos están coherentes." />
          )}
        </Panel>
      )}

      <Confirmacion
        abierta={confirmando === "migrar"}
        titulo="Instalar o migrar el modelo normalizado"
        detalle="Crea las hojas que falten, siembra los catálogos e importa los expedientes del libro anual. Es idempotente: se puede repetir sin duplicar nada."
        impacto="Antes de continuar conviene tener un respaldo. Si la migración se corta por tiempo, se reanuda ejecutándola otra vez."
        textoConfirmar="Ejecutar"
        trabajando={trabajando === "migrar"}
        onCancelar={() => setConfirmando(null)}
        onConfirmar={() =>
          ejecutar("migrar", async () => {
            const res = (await docApi.instalar({ conRespaldo: true })) as Record<string, unknown>;
            const migracion = res.migracion as { ejecutadas: { version: string; ok: boolean; resumen?: string; error?: string }[]; estado: { pendientes: string[] } };
            await comprobarConexion();
            return [
              ...migracion.ejecutadas.map((e) => `${e.version}: ${e.ok ? e.resumen : `ERROR ${e.error}`}`),
              migracion.estado.pendientes.length ? `Pendientes: ${migracion.estado.pendientes.join(", ")}. Vuelve a ejecutar.` : "Migración completa.",
            ];
          })
        }
      />

      <Confirmacion
        abierta={confirmando === "reparar"}
        titulo="Reparar el modelo"
        detalle="Aplica las reparaciones seguras: crear hojas, añadir columnas, generar identificadores que falten, normalizar alias conocidos y reconstruir resúmenes."
        impacto="No borra ningún registro de negocio. Lo que necesita criterio humano queda listado como pendiente manual."
        textoConfirmar="Reparar"
        trabajando={trabajando === "reparar"}
        onCancelar={() => setConfirmando(null)}
        onConfirmar={() =>
          ejecutar("reparar", async () => {
            const res = await docApi.reparar({});
            return [
              ...res.aplicadas.map((a) => `${a.accion}: ${a.cambios} cambio(s)`),
              `Críticos antes ${res.antes.conteos.CRITICO} → después ${res.despues.conteos.CRITICO}`,
              ...res.omitidas.map((o) => `Omitida ${o.accion}: ${o.motivo}`),
              ...res.pendientesManuales.map((p) => `Manual · ${p.titulo}: ${p.queHacer}`),
            ];
          })
        }
      />
    </div>
  );
}
