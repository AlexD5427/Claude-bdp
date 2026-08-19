/**
 * Armazón del módulo de Documentación.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 * El módulo tiene trece secciones y las mostraba en una lista plana: «Panel»,
 * «Expedientes», «Solicitudes»… hasta «Vista local». Todas al mismo nivel, con
 * el mismo peso visual. El resultado es que buscar «Exportaciones» y buscar
 * «Revisión» cuestan lo mismo, aunque una se usa cada día y la otra una vez al
 * mes, y que nada indica que «Vista local» es una salida de contingencia y no
 * una pantalla más del proceso.
 *
 * Aquí la navegación se agrupa por lo que la persona está haciendo: operar,
 * trabajar sobre la cola, consultar y controlar, configurar, o trabajar sin
 * backend. El grupo es una etiqueta, no un menú desplegable: en una consola de
 * trabajo, esconder la navegación detrás de un clic cuesta más de lo que ahorra.
 *
 * ── Nivel 1: contexto global ────────────────────────────────────────────────
 * La cabecera responde de un vistazo: en qué módulo estoy, con qué rol, contra
 * qué libro, si hay enlace, de cuándo son los datos, qué avisos hay sin leer y
 * cuál es la acción principal.
 *
 * ── Accesibilidad ──────────────────────────────────────────────────────────
 * La navegación es una lista de botones con `aria-current="page"` en la activa y
 * una barra lateral además del color. El nombre accesible de cada botón es su
 * etiqueta limpia; el contador viaja como descripción (`aria-describedby`), así
 * un lector de pantalla dice «Tareas, 3 atrasadas» sin que el nombre del control
 * cambie cada vez que cambia el número. El cambio de sección se anuncia en una
 * región `aria-live`.
 */

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronRight, FolderKanban, Menu, RefreshCw, X } from "lucide-react";
import type { Intencion, SeccionDef, SeccionId } from "../domain/vocabulario";
import type { EstadoConexion } from "../state/consola";
import { Boton } from "./piezas";
import { IndicadorConexion, IndicadorFrescura } from "./DocSyncIndicator";
import "./documentacion.css";
import "./documentacion-motion.css";
import { TextoRevelado } from "./DocTexto";

/* ------------------------------------------------------------------ */
/* Agrupación de la navegación                                         */
/* ------------------------------------------------------------------ */

type GrupoId = "operacion" | "expedientes" | "trabajo" | "control" | "ajustes" | "contingencia";

const GRUPOS: { id: GrupoId; etiqueta: string; secciones: SeccionId[] }[] = [
  { id: "operacion", etiqueta: "Operación", secciones: ["panel"] },
  { id: "expedientes", etiqueta: "Expedientes", secciones: ["expedientes"] },
  { id: "trabajo", etiqueta: "Trabajo", secciones: ["solicitudes", "revision", "aprobaciones", "prorrogas", "tareas"] },
  { id: "control", etiqueta: "Reportes y control", secciones: ["reportes", "exportaciones", "notificaciones", "auditoria"] },
  { id: "ajustes", etiqueta: "Configuración", secciones: ["configuracion"] },
  { id: "contingencia", etiqueta: "Contingencia", secciones: ["local"] },
];

/** Grupo al que pertenece una sección, para la miga de pan. */
export function grupoDeSeccion(seccion: SeccionId): string {
  return GRUPOS.find((grupo) => grupo.secciones.includes(seccion))?.etiqueta ?? "Módulo";
}

export interface ContadorSeccion {
  valor: number;
  /** Cómo se pinta: `peligro` para lo vencido, `aviso` para lo que espera. */
  intencion: Intencion;
  /** Texto para el lector de pantalla y el tooltip: «3 atrasadas». */
  descripcion: string;
}

const COLOR_CONTADOR: Record<Intencion, { fondo: string; texto: string }> = {
  neutral: { fondo: "var(--doc-surface-raised)", texto: "var(--doc-text-muted)" },
  info: { fondo: "var(--doc-info-bg)", texto: "var(--doc-info-fg)" },
  exito: { fondo: "var(--doc-success-bg)", texto: "var(--doc-success-fg)" },
  aviso: { fondo: "var(--doc-warning-bg)", texto: "var(--doc-warning-fg)" },
  peligro: { fondo: "var(--doc-danger-bg)", texto: "var(--doc-danger-fg)" },
  acento: { fondo: "var(--doc-accent-bg)", texto: "var(--doc-accent-fg)" },
};

/* ------------------------------------------------------------------ */
/* Armazón                                                             */
/* ------------------------------------------------------------------ */

export function DocShell({
  secciones,
  seccionActiva,
  definicion,
  onSeccion,
  contadores = {},
  conexion,
  libro,
  rol,
  ultimaSincronizacion,
  operaciones,
  onReconectar,
  accionPrincipal,
  avisoGlobal,
  panelSecundario,
  children,
}: {
  secciones: SeccionDef[];
  seccionActiva: SeccionId;
  definicion?: SeccionDef;
  onSeccion: (seccion: SeccionId) => void;
  contadores?: Partial<Record<SeccionId, ContadorSeccion>>;
  conexion: EstadoConexion;
  libro?: string;
  rol?: string;
  ultimaSincronizacion?: string;
  operaciones: number;
  onReconectar: () => void;
  accionPrincipal?: ReactNode;
  avisoGlobal?: ReactNode;
  panelSecundario?: ReactNode;
  children: ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const idMenu = useId();

  // El menú de móvil se cierra al cambiar de sección: dejarlo abierto tapa el
  // contenido que la persona acaba de pedir.
  useEffect(() => {
    setMenuAbierto(false);
  }, [seccionActiva]);

  const grupos = GRUPOS.map((grupo) => ({
    ...grupo,
    items: grupo.secciones.map((id) => secciones.find((s) => s.id === id)).filter((s): s is SeccionDef => !!s),
  })).filter((grupo) => grupo.items.length > 0);

  return (
    <div className="doc-console space-y-3">
      {/* ── Nivel 1 · contexto global ──────────────────────────────── */}
      <header className="glass rounded-3xl px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <button
              type="button"
              className="doc-tap doc-no-print rounded-xl p-2 text-[color:var(--doc-text-muted)] transition-colors hover:bg-[color:var(--doc-surface)] hover:text-[color:var(--doc-text)] lg:hidden"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label={menuAbierto ? "Cerrar el menú del módulo" : "Abrir el menú del módulo"}
              aria-expanded={menuAbierto}
              aria-controls={idMenu}
            >
              {menuAbierto ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
            </button>

            <span
              className="hidden h-9 w-9 shrink-0 place-items-center rounded-2xl sm:grid"
              style={{ background: "var(--doc-info-bg)", color: "var(--doc-info)" }}
              aria-hidden
            >
              <FolderKanban className="h-4 w-4" />
            </span>

            <div className="min-w-0">
              {/* Miga de pan: dónde estoy dentro del módulo. */}
              <nav aria-label="Ruta de navegación" className="flex items-center gap-1 text-[11px] text-[color:var(--doc-text-faint)]">
                <span>Documentación</span>
                <ChevronRight className="h-3 w-3" aria-hidden />
                <span>{grupoDeSeccion(seccionActiva)}</span>
                <ChevronRight className="h-3 w-3" aria-hidden />
                <span className="font-semibold text-[color:var(--doc-text-muted)]">{definicion?.etiqueta ?? "Panel"}</span>
              </nav>
              {/* El título se revela palabra a palabra al cambiar de sección: da
                  al ojo un punto de entrada antes de que llegue el contenido. */}
              <TextoRevelado
                como="h2"
                texto={definicion?.etiqueta ?? "Documentación"}
                className="doc-balance mt-0.5 block text-base font-semibold leading-tight text-[color:var(--doc-text)]"
              />
              <TextoRevelado
                como="p"
                texto={definicion?.descripcion ?? ""}
                retardo={0.05}
                className="doc-prose mt-0.5 block max-w-prose text-xs text-[color:var(--doc-text-muted)]"
              />
            </div>
          </div>

          <div className="doc-no-print flex flex-wrap items-center justify-end gap-2">
            <IndicadorConexion conexion={conexion} libro={libro} />

            {rol && (
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "var(--doc-surface-raised)", color: "var(--doc-text-muted)" }}
                title="Rol resuelto por el backend a partir de tu cuenta"
              >
                {rol}
              </span>
            )}

            <IndicadorFrescura ultimaSincronizacion={ultimaSincronizacion} operaciones={operaciones} />

            <Boton variante="suave" onClick={onReconectar} titulo="Volver a resolver conexión, permisos y catálogo">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Reconectar</span>
              <span className="sr-only sm:hidden">Reconectar</span>
            </Boton>

            {accionPrincipal}
          </div>
        </div>

        {avisoGlobal && <div className="mt-3">{avisoGlobal}</div>}
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
        {/* ── Navegación agrupada ─────────────────────────────────── */}
        <nav
          id={idMenu}
          className={`${menuAbierto ? "block" : "hidden"} doc-no-print w-full shrink-0 lg:block lg:w-56`}
          aria-label="Secciones del módulo de Documentación"
        >
          <div className="glass rounded-3xl p-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            {grupos.map((grupo) => (
              <div key={grupo.id} className="mb-1 last:mb-0">
                <p className="doc-nav-group-label" id={`${idMenu}-${grupo.id}`}>
                  {grupo.etiqueta}
                </p>
                <ul aria-labelledby={`${idMenu}-${grupo.id}`} className="space-y-0.5">
                  {grupo.items.map((seccion) => {
                    const activa = seccion.id === seccionActiva;
                    const contador = contadores[seccion.id];
                    const idDescripcion = `${idMenu}-${seccion.id}-desc`;
                    return (
                      <li key={seccion.id}>
                        <button
                          type="button"
                          onClick={() => onSeccion(seccion.id)}
                          aria-current={activa ? "page" : undefined}
                          /* El nombre accesible es la etiqueta y solo la etiqueta:
                             el contador va como descripción para que no cambie el
                             nombre del control cada vez que cambia la cifra. */
                          aria-label={seccion.etiqueta}
                          aria-describedby={contador && contador.valor > 0 ? idDescripcion : undefined}
                          title={seccion.descripcion}
                          className="doc-nav-item doc-tap"
                        >
                          <span className="min-w-0 flex-1 truncate">{seccion.etiqueta}</span>
                          {contador && contador.valor > 0 && (
                            <span
                              id={idDescripcion}
                              className="doc-metric shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                              style={{
                                background: COLOR_CONTADOR[contador.intencion].fondo,
                                color: COLOR_CONTADOR[contador.intencion].texto,
                              }}
                            >
                              {contador.valor}
                              <span className="sr-only"> {contador.descripcion}</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* ── Contenido ───────────────────────────────────────────── */}
        <div className={`min-w-0 flex-1 ${menuAbierto ? "hidden lg:block" : "block"}`}>
          {/* El cambio de sección se anuncia una vez, sin robar el foco. */}
          <p className="sr-only" role="status" aria-live="polite">
            Sección {definicion?.etiqueta ?? "Panel"}
          </p>
          {children}
        </div>

        {/* ── Panel secundario (solo donde hay sitio) ─────────────── */}
        {panelSecundario && <aside className="doc-no-print hidden w-72 shrink-0 xl:block">{panelSecundario}</aside>}
      </div>
    </div>
  );
}
