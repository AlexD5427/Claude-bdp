/**
 * Conexión, frescura y escritura.
 *
 * ── Por qué un componente para esto ─────────────────────────────────────────
 * En una consola que escribe en un libro compartido, «¿lo que veo es de ahora?»
 * y «¿lo que acabo de marcar está guardado?» son las dos preguntas que más se
 * hacen, y la interfaz las respondía a medias: había una píldora de conexión en
 * la cabecera y nada más. Aquí las tres piezas viven juntas: estado del enlace,
 * antigüedad del dato y resultado de la escritura.
 *
 * ── Honestidad ──────────────────────────────────────────────────────────────
 * Ninguno de estos indicadores adivina. «Guardado» solo se muestra cuando el
 * backend confirmó la escritura; sin conexión se dice sin conexión, y nunca se
 * pinta un visto verde por haber recibido un HTTP 200 vacío.
 */

import { Check, CloudOff, Loader2, PlugZap, RefreshCw, ShieldAlert, TriangleAlert, Wifi, Wrench } from "lucide-react";
import type { EstadoConexion } from "../state/consola";

/* ------------------------------------------------------------------ */
/* Tiempo relativo                                                     */
/* ------------------------------------------------------------------ */

/**
 * «hace 2 min» en lugar de una marca ISO.
 *
 * Se calcula al pintar y no se guarda: un «hace 2 min» almacenado miente en el
 * siguiente render.
 */
export function hace(iso: string | null | undefined): string {
  if (!iso) return "sin registro";
  const cuando = new Date(iso).getTime();
  if (Number.isNaN(cuando)) return "sin registro";
  const segundos = Math.max(0, Math.round((Date.now() - cuando) / 1000));
  if (segundos < 10) return "hace un instante";
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ */
/* Conexión                                                            */
/* ------------------------------------------------------------------ */

interface Presentacion {
  texto: string;
  color: string;
  fondo: string;
  icono: JSX.Element;
  /** Lo que hay que hacer, si hay algo que hacer. */
  detalle: string;
  latido?: boolean;
}

export function presentacionDeConexion(conexion: EstadoConexion, libro?: string): Presentacion {
  switch (conexion) {
    case "conectado":
      return {
        texto: libro ? `Conectado · ${libro}` : "Conectado",
        color: "var(--doc-success-fg)",
        fondo: "var(--doc-success-bg)",
        icono: <Wifi className="h-3.5 w-3.5" aria-hidden />,
        detalle: "El módulo escribe en el libro del área.",
      };
    case "comprobando":
      return {
        texto: "Conectando…",
        color: "var(--doc-info-fg)",
        fondo: "var(--doc-info-bg)",
        icono: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
        detalle: "Resolviendo identidad y permisos.",
        latido: true,
      };
    case "sin_instalar":
      return {
        texto: "Libro sin instalar",
        color: "var(--doc-warning-fg)",
        fondo: "var(--doc-warning-bg)",
        icono: <Wrench className="h-3.5 w-3.5" aria-hidden />,
        detalle: "El backend responde, pero al libro le faltan las hojas del modelo.",
      };
    case "sin_conexion":
      return {
        texto: "Sin conexión",
        color: "var(--doc-offline-fg)",
        fondo: "var(--doc-offline-bg)",
        icono: <CloudOff className="h-3.5 w-3.5" aria-hidden />,
        detalle: "No hay red o la aplicación web no responde. La vista local sigue disponible.",
      };
    case "sin_configurar":
      return {
        texto: "Sin backend",
        color: "var(--doc-text-muted)",
        fondo: "var(--doc-surface)",
        icono: <PlugZap className="h-3.5 w-3.5" aria-hidden />,
        detalle: "Falta la URL de la aplicación web en los ajustes locales.",
      };
    default:
      return {
        texto: "Error de conexión",
        color: "var(--doc-danger-fg)",
        fondo: "var(--doc-danger-bg)",
        icono: <ShieldAlert className="h-3.5 w-3.5" aria-hidden />,
        detalle: "El backend respondió con un error. Revisa la implementación publicada.",
      };
  }
}

/**
 * Píldora de conexión.
 *
 * Lleva icono, etiqueta y color: quien no distingue el verde del rojo lee el
 * estado igual. El `title` explica qué implica, que es la parte que un icono no
 * puede contar.
 */
export function IndicadorConexion({ conexion, libro, compacto }: { conexion: EstadoConexion; libro?: string; compacto?: boolean }) {
  const p = presentacionDeConexion(conexion, libro);
  return (
    <span
      className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.latido ? "doc-latido" : ""}`}
      style={{ background: p.fondo, color: p.color }}
      title={p.detalle}
    >
      {p.icono}
      <span className={compacto ? "sr-only" : "truncate"}>{p.texto}</span>
    </span>
  );
}

/**
 * Frescura del dato: cuándo se resolvió la conexión y si hay trabajo en curso.
 *
 * `operaciones` es el contador de peticiones vivas del estado de la consola. Con
 * él, «trabajando» aparece mientras haya alguna, no solo durante la primera.
 */
export function IndicadorFrescura({
  ultimaSincronizacion,
  operaciones = 0,
  onRefrescar,
}: {
  ultimaSincronizacion?: string;
  operaciones?: number;
  onRefrescar?: () => void;
}) {
  const trabajando = operaciones > 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--doc-text-faint)]" role="status" aria-live="polite">
      {trabajando ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          <span>
            Actualizando{operaciones > 1 ? ` (${operaciones} consultas)` : ""}…
          </span>
        </>
      ) : (
        <span className="doc-metric">Datos de {hace(ultimaSincronizacion)}</span>
      )}
      {onRefrescar && !trabajando && (
        <button
          type="button"
          onClick={onRefrescar}
          className="doc-tap rounded-lg p-1 text-[color:var(--doc-text-faint)] transition-colors hover:text-[color:var(--doc-text)]"
          aria-label="Volver a pedir los datos"
          title="Volver a pedir los datos"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

export type EstadoEscritura =
  | "sin_cambios"
  | "pendiente"
  | "guardando"
  | "guardado"
  | "guardado_local"
  | "sin_conexion"
  | "error"
  | "conflicto";

/**
 * Estado del guardado, con palabras que distinguen los casos que de verdad se
 * dan: hay cambios sin escribir, se está escribiendo, el servidor confirmó, o
 * alguien se adelantó y hay conflicto de versión.
 */
export function IndicadorGuardado({ estado, detalle }: { estado: EstadoEscritura; detalle?: string }) {
  const mapa: Record<EstadoEscritura, { texto: string; color: string; icono: JSX.Element | null }> = {
    sin_cambios: { texto: "Sin cambios", color: "var(--doc-text-faint)", icono: null },
    pendiente: {
      texto: detalle ?? "Cambios sin guardar",
      color: "var(--doc-warning-fg)",
      icono: <TriangleAlert className="h-3.5 w-3.5" aria-hidden />,
    },
    guardando: {
      texto: "Guardando en el libro…",
      color: "var(--doc-info-fg)",
      icono: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
    },
    guardado: { texto: "Guardado en el servidor", color: "var(--doc-success-fg)", icono: <Check className="h-3.5 w-3.5" aria-hidden /> },
    guardado_local: {
      texto: "Guardado en este equipo",
      color: "var(--doc-offline-fg)",
      icono: <CloudOff className="h-3.5 w-3.5" aria-hidden />,
    },
    sin_conexion: {
      texto: "Sin conexión: no se ha escrito nada",
      color: "var(--doc-offline-fg)",
      icono: <CloudOff className="h-3.5 w-3.5" aria-hidden />,
    },
    error: { texto: detalle ?? "No se pudo guardar", color: "var(--doc-danger-fg)", icono: <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> },
    conflicto: {
      texto: "Otra persona cambió el expediente",
      color: "var(--doc-danger-fg)",
      icono: <TriangleAlert className="h-3.5 w-3.5" aria-hidden />,
    },
  };
  const item = mapa[estado];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
      style={{ color: item.color }}
      role="status"
      aria-live="polite"
    >
      {item.icono}
      {item.texto}
    </span>
  );
}
