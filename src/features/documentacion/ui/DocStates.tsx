/**
 * Estados honestos.
 *
 * ── La regla del módulo ─────────────────────────────────────────────────────
 * La pantalla no finge. Si no hay datos, se dice que no hay; si el backend
 * falló, se dice qué falló y qué hacer; si lo que se ve viene de una caché, se
 * dice de cuándo es. Nunca se rellena con datos de ejemplo para que la interfaz
 * parezca completa: en un expediente de personal, un dato inventado es un error
 * de auditoría.
 *
 * ── Por qué no un único «estado vacío» genérico ──────────────────────────────
 * «Sin resultados» tras una búsqueda y «todavía no hay nada registrado» exigen
 * acciones opuestas: en el primero hay que quitar un filtro, en el segundo hay
 * que crear el primer expediente. Un componente para los dos casos acaba
 * diciendo algo tan vago que no ayuda en ninguno.
 *
 * ── Accesibilidad ───────────────────────────────────────────────────────────
 * Los errores se anuncian con `role="alert"` —interrumpen, porque hay algo roto—
 * y el resto con `role="status"`, que espera un hueco en la lectura.
 */

import type { ReactNode } from "react";
import {
  AlertTriangle,
  CloudOff,
  DatabaseZap,
  FileSearch,
  FolderOpen,
  History,
  Lock,
  RefreshCw,
  SearchX,
  Wrench,
} from "lucide-react";
import { Boton } from "./piezas";

/* ------------------------------------------------------------------ */
/* Vacíos                                                              */
/* ------------------------------------------------------------------ */

/**
 * Estado vacío que enseña.
 *
 * Además del título trae `siguientePaso`: la frase que dice qué hacer ahora. Un
 * vacío que solo dice «sin datos» deja a la persona mirando la pantalla.
 */
export function DocVacio({
  titulo,
  detalle,
  siguientePaso,
  icono = "carpeta",
  acciones,
  compacto,
}: {
  titulo: string;
  detalle?: string;
  siguientePaso?: string;
  icono?: "carpeta" | "busqueda" | "historial" | "datos" | "documento";
  acciones?: ReactNode;
  compacto?: boolean;
}) {
  const Icono =
    icono === "busqueda" ? SearchX : icono === "historial" ? History : icono === "datos" ? DatabaseZap : icono === "documento" ? FileSearch : FolderOpen;

  return (
    <div
      role="status"
      className={`doc-surface doc-muted flex flex-col items-center gap-2 border-dashed px-4 text-center ${compacto ? "py-6" : "py-10"}`}
    >
      <Icono className="h-6 w-6 text-[color:var(--doc-text-faint)]" aria-hidden />
      <p className="doc-balance text-sm font-semibold text-[color:var(--doc-text)]">{titulo}</p>
      {detalle && <p className="doc-prose max-w-md text-xs text-[color:var(--doc-text-muted)]">{detalle}</p>}
      {siguientePaso && (
        <p className="doc-prose max-w-md text-xs font-medium text-[color:var(--doc-info-fg)]">{siguientePaso}</p>
      )}
      {acciones && <div className="mt-1 flex flex-wrap justify-center gap-2">{acciones}</div>}
    </div>
  );
}

/**
 * Búsqueda o filtro sin resultados.
 *
 * Se distingue del vacío real porque aquí sí hay datos: lo que no hay es
 * coincidencias. Por eso la salida es quitar filtros, y se dice cuántos hay
 * puestos.
 */
export function DocSinResultados({
  consulta,
  filtrosActivos = 0,
  onLimpiar,
}: {
  consulta?: string;
  filtrosActivos?: number;
  onLimpiar?: () => void;
}) {
  const porTexto = !!consulta?.trim();
  return (
    <DocVacio
      icono="busqueda"
      compacto
      titulo={porTexto ? `Sin coincidencias para «${consulta?.trim()}»` : "Ningún expediente cumple estos filtros"}
      detalle={
        filtrosActivos > 0
          ? `Hay ${filtrosActivos} filtro${filtrosActivos === 1 ? "" : "s"} aplicado${filtrosActivos === 1 ? "" : "s"} además de la búsqueda.`
          : "La búsqueda funciona por nombre, identificador, cargo y agencia."
      }
      siguientePaso={filtrosActivos > 0 ? "Quita un filtro para ampliar el resultado." : "Prueba con menos palabras o parte del identificador."}
      acciones={
        onLimpiar && filtrosActivos > 0 ? (
          <Boton variante="suave" onClick={onLimpiar}>
            Limpiar filtros
          </Boton>
        ) : undefined
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Errores                                                             */
/* ------------------------------------------------------------------ */

export interface ErrorNormalizado {
  mensaje: string;
  pista: string;
  codigo: string;
}

/**
 * Error accionable.
 *
 * El backend devuelve `codigo`, `mensaje` y `pista`; los tres se muestran. El
 * código es lo que permite buscar el caso en la auditoría, y la pista es lo que
 * el servidor ya sabe que hay que hacer. Esconderlos obliga a abrir un ticket
 * para averiguar algo que el sistema acaba de decir.
 */
export function DocError({
  titulo = "No se pudo completar la operación",
  error,
  onReintentar,
  reintentando,
  acciones,
}: {
  titulo?: string;
  error?: ErrorNormalizado | null;
  onReintentar?: () => void;
  reintentando?: boolean;
  acciones?: ReactNode;
}) {
  const conflicto = error?.codigo === "CONFLICTO_VERSION";
  const permiso = error?.codigo === "SIN_PERMISO" || error?.codigo === "NO_AUTORIZADO";

  return (
    <div
      role="alert"
      className="doc-surface flex items-start gap-3 p-4"
      style={{ borderColor: "var(--doc-danger)", background: "var(--doc-danger-bg)" }}
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--doc-danger)" }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--doc-danger-fg)" }}>
          {titulo}
        </p>
        {error && (
          <p className="doc-prose mt-1 text-xs leading-relaxed text-[color:var(--doc-text-muted)]">
            {error.mensaje}
            {error.pista ? ` ${error.pista}` : ""}
          </p>
        )}
        {conflicto && (
          <p className="doc-prose mt-1 text-xs text-[color:var(--doc-text-muted)]">
            Otra persona modificó este expediente mientras lo tenías abierto. Al recargar verás su versión; tus cambios sin guardar no se
            han escrito.
          </p>
        )}
        {permiso && (
          <p className="doc-prose mt-1 text-xs text-[color:var(--doc-text-muted)]">
            Tu rol no incluye esta operación. Puedes pedir el permiso al administrador del módulo.
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {onReintentar && (
            <Boton variante="suave" onClick={onReintentar} cargando={reintentando}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reintentar
            </Boton>
          )}
          {acciones}
          {error?.codigo && (
            <span className="doc-metric text-[11px] text-[color:var(--doc-text-faint)]" title="Código del error, útil para la auditoría">
              {error.codigo}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Falta de permiso, como estado de pantalla y no como error. */
export function DocSinPermiso({ que = "esta sección" }: { que?: string }) {
  return (
    <div role="status" className="doc-surface flex items-start gap-3 p-4">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--doc-text-faint)]" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-[color:var(--doc-text)]">Tu rol no tiene acceso a {que}</p>
        <p className="doc-prose mt-1 text-xs text-[color:var(--doc-text-muted)]">
          El permiso lo concede el administrador del módulo desde Configuración › Permisos. Mientras tanto, el resto del módulo sigue
          disponible.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conexión y frescura del dato                                        */
/* ------------------------------------------------------------------ */

/**
 * Aviso de dato no fresco.
 *
 * Se usa cuando lo que se muestra viene de una caché del backend o de una carga
 * anterior. Lleva la fecha: «desde caché» sin fecha no dice si el dato es de
 * hace un minuto o de ayer.
 */
export function DocDatoNoFresco({
  desde,
  onActualizar,
  motivo = "cache",
}: {
  desde?: string;
  onActualizar?: () => void;
  motivo?: "cache" | "offline" | "sin_refrescar";
}) {
  const texto =
    motivo === "offline"
      ? "Sin conexión: se muestra la última copia recibida"
      : motivo === "sin_refrescar"
        ? "Estos datos no se han vuelto a pedir"
        : "Datos servidos desde la caché del backend";

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-[var(--doc-radius-sm)] px-3 py-2 text-xs"
      style={{ background: "var(--doc-offline-bg)", color: "var(--doc-offline-fg)" }}
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {texto}
        {desde ? ` · ${desde}` : ""}
      </span>
      {onActualizar && (
        <Boton variante="fantasma" onClick={onActualizar}>
          Actualizar ahora
        </Boton>
      )}
    </div>
  );
}

/** Modo degradado: el módulo funciona, pero con menos de lo habitual. */
export function DocModoDegradado({ detalle, acciones }: { detalle: string; acciones?: ReactNode }) {
  return (
    <div
      role="status"
      className="doc-surface flex items-start gap-3 p-3.5"
      style={{ borderColor: "var(--doc-warning)", background: "var(--doc-warning-bg)" }}
    >
      <Wrench className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--doc-warning)" }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold" style={{ color: "var(--doc-warning-fg)" }}>
          El módulo trabaja en modo degradado
        </p>
        <p className="doc-prose mt-0.5 text-xs text-[color:var(--doc-text-muted)]">{detalle}</p>
        {acciones && <div className="mt-2 flex flex-wrap gap-2">{acciones}</div>}
      </div>
    </div>
  );
}
