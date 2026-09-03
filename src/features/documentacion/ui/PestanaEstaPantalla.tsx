/**
 * «Esta pantalla»: preferencias locales y autodiagnóstico.
 *
 * ── Por qué esta pestaña existe ─────────────────────────────────────────────
 * El resto de la configuración cambia el LIBRO: el catálogo, los plazos, los
 * permisos. Eso lo toca una persona y lo notan todas. Lo que hay aquí es lo
 * contrario: cambia solo este navegador, no se sincroniza y no necesita permiso.
 * Mezclarlo con lo anterior hacía que la gente no se atreviera a tocar nada, por
 * miedo a romperle el módulo al resto.
 *
 * ── El autodiagnóstico y la pregunta que responde ───────────────────────────
 * Cuando algo va mal, la persona que trabaja en una agencia no puede leer una
 * consola de JavaScript ni abrir Apps Script. Lo único que puede hacer es
 * llamar por teléfono y decir «no funciona». Los cinco botones grandes de aquí
 * son las cinco cosas que se le pedirían por teléfono, convertidas en algo que
 * puede pulsar sola:
 *
 *   · **Probar conexión** — ¿el problema es la red, el backend o la pantalla?
 *   · **Volver a sincronizar** — reintenta los cambios que se quedaron en cola.
 *   · **Vaciar caché local** — descarta copias locales sospechosas.
 *   · **Descargar respaldo** — se lleva lo que tiene antes de tocar nada.
 *   · **Recuperar borrador** — vuelve a poner en cola lo que se dio por perdido.
 *
 * ── Los cambios pendientes se ven, con nombre y motivo ──────────────────────
 * La cola de salida es la parte del módulo con más capacidad de asustar: si un
 * cambio no llega al libro y nadie lo dice, alguien da por entregado un
 * documento que no lo está. Aquí cada entrada aparece con su descripción, cuánto
 * lleva esperando, cuántos intentos hizo y el error EXACTO del backend, con dos
 * salidas: reintentar o descartar sabiendo qué se pierde.
 *
 * Descargar el respaldo es una operación local y va a un archivo que la persona
 * elige: no sale nada del navegador hacia ningún tercero.
 */

import { useEffect, useState } from "react";
import {
  Download,
  Eraser,
  Gauge,
  Plug,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { comprobarConexion, ponerDensidad, ponerFiltros, urlBackend, useConsola } from "../state/consola";
import {
  expedientesEnCache,
  suscribirCache,
  tamanoCache,
  vaciarCache,
  VERSION_CACHE,
} from "../state/cacheExpedientes";
import {
  descartarEntrada,
  reintentarEntrada,
  reintentarTodo,
  reponerEntrada,
  useSalida,
  type EntradaSalida,
} from "../state/salida";
import { estadoPrecarga } from "../state/precarga";
import {
  COLUMNAS_LISTA,
  ORDENES_LISTA,
  alternarColumna,
  equipoModesto,
  modoLigeroActivo,
  ponerPreferencia,
  precargaActiva,
  restaurarPreferencias,
  usePreferencias,
  type ColumnaLista,
  type OrdenLista,
} from "../state/preferencias";
import { useThemeOpcional } from "../../../context/ThemeContext";
import { Aviso, Boton, Confirmacion, Interruptor, Panel, Segmento, Vacio, type Notita } from "./piezas";

interface Props {
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}

/** Etiquetas legibles de las columnas ocultables de la lista. */
const NOMBRE_COLUMNA: Record<ColumnaLista, string> = {
  ubicacion: "Cargo y agencia",
  estado: "Estado",
  avance: "Avance",
  faltan: "Faltan",
  observados: "Observados",
  critica: "Próxima fecha crítica",
  responsable: "Responsable",
};

const NOMBRE_ORDEN: Record<OrdenLista, string> = {
  reciente: "Más reciente primero",
  antiguo: "Más antiguo primero",
  actualizado: "Modificado hace menos",
  nombre: "Nombre",
  identificador: "Identificador",
  avance: "Avance",
  pendientes: "Pendientes",
  observados: "Observados",
  ingreso: "Fecha de ingreso",
  critica: "Próxima fecha crítica",
  estado: "Estado",
};

export function PestanaEstaPantalla({ avisar }: Props) {
  return (
    <div className="space-y-3">
      <Autodiagnostico avisar={avisar} />
      <CambiosPendientes avisar={avisar} />
      <Preferencias />
    </div>
  );
}

/* ================================================================== */
/* Autodiagnóstico                                                     */
/* ================================================================== */

/** Clave donde se guarda el último respaldo recuperable de la cola. */
const CLAVE_RESPALDO_COLA = "bdp-documentacion-salida-respaldo";

function Autodiagnostico({ avisar }: Props) {
  const { conexion, estado } = useConsola();
  const salida = useSalida();
  const [probando, setProbando] = useState(false);
  const [vaciando, setVaciando] = useState(false);
  const [confirmarVaciado, setConfirmarVaciado] = useState(false);
  const [ultimaPrueba, setUltimaPrueba] = useState("");

  /* La caché no vive en React, así que hay que suscribirse para que el recuento
     no se quede congelado mientras la precarga la llena. */
  const [enCache, setEnCache] = useState(() => tamanoCache());
  useEffect(() => suscribirCache(() => setEnCache(tamanoCache())), []);

  const cola = estadoPrecarga();
  const sinConfirmar = salida.entradas.filter((e) => e.estado !== "confirmado").length;
  const hayRespaldoDeCola = leerRespaldoDeCola().length > 0;

  async function probar() {
    setProbando(true);
    const inicio = performance.now();
    try {
      const ok = await comprobarConexion();
      const ms = Math.round(performance.now() - inicio);
      setUltimaPrueba(
        ok
          ? `El backend respondió en ${ms} ms. El enlace funciona.`
          : `El backend no respondió (${ms} ms de espera). Revise la URL o vuelva a publicar la implementación.`,
      );
      avisar(ok ? "exito" : "peligro", ok ? "El enlace responde." : "El enlace no responde.");
    } finally {
      setProbando(false);
    }
  }

  function volverASincronizar() {
    if (!sinConfirmar) {
      avisar("info", "No hay cambios en cola.", "Todo lo que hizo ya está en el libro.");
      return;
    }
    /* Antes de reintentar se guarda una copia: si el reintento acaba en
       descartes, «Recuperar borrador» todavía tiene de dónde tirar. */
    guardarRespaldoDeCola(salida.entradas.filter((e) => e.estado !== "confirmado"));
    reintentarTodo();
    avisar("info", `Reintentando ${sinConfirmar} cambio(s).`, "Se avisa aquí mismo cuando el libro los confirme.");
  }

  async function vaciar() {
    setVaciando(true);
    try {
      await vaciarCache();
      setEnCache(tamanoCache());
      avisar("exito", "Caché local vaciada.", "La próxima apertura de cada expediente irá al libro.");
    } finally {
      setVaciando(false);
      setConfirmarVaciado(false);
    }
  }

  /**
   * Respaldo local en un archivo.
   *
   * Lleva la cola de salida y las copias locales de los expedientes. Sirve para
   * dos cosas: llevarse el trabajo antes de vaciar nada, y poder mandar el
   * archivo a quien mantiene el módulo cuando algo no cuadra.
   */
  function descargarRespaldo() {
    const contenido = {
      generadoEn: new Date().toISOString(),
      versionCache: VERSION_CACHE,
      endpoint: urlBackend(),
      esquema: estado?.esquema ?? null,
      colaDeSalida: salida.entradas,
      expedientes: expedientesEnCache(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(contenido, null, 2)], { type: "application/json" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `documentacion-respaldo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    enlace.click();
    URL.revokeObjectURL(url);
    avisar("exito", "Respaldo descargado.", `${salida.entradas.length} cambio(s) y ${enCache} expediente(s).`);
  }

  function recuperarBorrador() {
    const respaldo = leerRespaldoDeCola();
    if (!respaldo.length) {
      avisar("info", "No hay ningún borrador guardado.");
      return;
    }
    let repuestos = 0;
    for (const entrada of respaldo) {
      if (salida.entradas.some((e) => e.solicitudId === entrada.solicitudId)) continue;
      reponerEntrada(entrada);
      repuestos += 1;
    }
    avisar(
      repuestos ? "exito" : "info",
      repuestos ? `Se repusieron ${repuestos} cambio(s) en la cola.` : "Los cambios del borrador ya estaban en la cola.",
      "Su `solicitudId` se conserva, así que reenviarlos no duplica nada.",
    );
  }

  return (
    <Panel
      titulo="Autodiagnóstico"
      descripcion="Cinco cosas que puede probar sola antes de pedir ayuda. Ninguna toca el libro salvo «Volver a sincronizar»."
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <BotonGrande
          icono={<Plug className="h-4 w-4" aria-hidden />}
          titulo="Probar conexión"
          detalle="Pregunta al backend si está ahí y cuánto tarda."
          onClick={probar}
          cargando={probando}
        />
        <BotonGrande
          icono={<RefreshCw className="h-4 w-4" aria-hidden />}
          titulo="Volver a sincronizar"
          detalle={sinConfirmar ? `${sinConfirmar} cambio(s) esperando` : "No hay nada en cola"}
          onClick={volverASincronizar}
        />
        <BotonGrande
          icono={<Eraser className="h-4 w-4" aria-hidden />}
          titulo="Vaciar caché local"
          detalle={`${enCache} expediente(s) guardado(s) en este navegador`}
          onClick={() => setConfirmarVaciado(true)}
          cargando={vaciando}
        />
        <BotonGrande
          icono={<Download className="h-4 w-4" aria-hidden />}
          titulo="Descargar respaldo"
          detalle="Un archivo con la cola y las copias locales."
          onClick={descargarRespaldo}
        />
        <BotonGrande
          icono={<Undo2 className="h-4 w-4" aria-hidden />}
          titulo="Recuperar borrador"
          detalle={hayRespaldoDeCola ? "Hay un borrador guardado" : "Sin borradores guardados"}
          onClick={recuperarBorrador}
        />
      </div>

      {ultimaPrueba && (
        <div className="mt-3">
          <Aviso intencion={/funciona/.test(ultimaPrueba) ? "exito" : "peligro"}>{ultimaPrueba}</Aviso>
        </div>
      )}

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
        <DatoTecnico etiqueta="Conexión" valor={conexion} />
        <DatoTecnico etiqueta="Esquema del libro" valor={estado ? String(estado.esquema) : "—"} />
        <DatoTecnico etiqueta="Versión de la caché" valor={String(VERSION_CACHE)} />
        <DatoTecnico etiqueta="Expedientes en caché" valor={String(enCache)} />
        <DatoTecnico etiqueta="Cambios sin confirmar" valor={String(sinConfirmar)} />
        <DatoTecnico
          etiqueta="Precarga"
          valor={`${cola.pendientes} en cola · ${cola.enVuelo} en vuelo${cola.pausada ? " · en pausa" : ""}`}
        />
      </dl>

      <Confirmacion
        abierta={confirmarVaciado}
        titulo="¿Vaciar la caché local?"
        detalle={`Se borran las copias locales de ${enCache} expediente(s) de ESTE navegador. El libro no se toca y nada se pierde: la próxima vez que abra un expediente se vuelve a traer. Los cambios en cola tampoco se borran.`}
        textoConfirmar="Vaciar"
        trabajando={vaciando}
        onConfirmar={() => void vaciar()}
        onCancelar={() => setConfirmarVaciado(false)}
      />
    </Panel>
  );
}

function BotonGrande({
  icono,
  titulo,
  detalle,
  onClick,
  cargando,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  onClick: () => void;
  cargando?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      aria-busy={cargando || undefined}
      className="doc-tap doc-no-print flex min-h-[4.5rem] items-start gap-2.5 rounded-[var(--doc-radius-sm)] p-3 text-left transition-[background-color,box-shadow] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: "var(--doc-surface-raised)",
        boxShadow: "inset 0 0 0 1px var(--doc-border)",
      }}
    >
      <span className="mt-0.5 shrink-0 text-[color:var(--doc-info)]">{icono}</span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[color:var(--doc-text)]">{titulo}</span>
        <span className="doc-prose mt-0.5 block text-[11px] text-[color:var(--doc-text-muted)]">{detalle}</span>
      </span>
    </button>
  );
}

function DatoTecnico({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-[color:var(--doc-border)] py-1">
      <dt className="text-[color:var(--doc-text-muted)]">{etiqueta}</dt>
      <dd className="font-mono text-[color:var(--doc-text)]">{valor}</dd>
    </div>
  );
}

/* ================================================================== */
/* Cambios pendientes                                                  */
/* ================================================================== */

function CambiosPendientes({ avisar }: Props) {
  const salida = useSalida();
  const [descartando, setDescartando] = useState<EntradaSalida | null>(null);
  const sinConfirmar = salida.entradas.filter((e) => e.estado !== "confirmado");

  if (!sinConfirmar.length) {
    return (
      <Panel titulo="Cambios pendientes" descripcion="Lo que se escribió aquí y todavía no confirmó el libro.">
        <Vacio
          titulo="Nada pendiente"
          detalle={
            salida.ultimaConfirmacion
              ? `Todo lo que hizo está en el libro. Última confirmación: ${new Date(salida.ultimaConfirmacion).toLocaleString("es-BO")}.`
              : "Todo lo que hizo está en el libro."
          }
        />
      </Panel>
    );
  }

  return (
    <Panel
      titulo={`Cambios pendientes (${sinConfirmar.length})`}
      descripcion="Cada uno con el error exacto del backend, si lo hubo. Reintentar es seguro: el identificador de solicitud evita duplicados."
      acciones={
        <Boton variante="suave" onClick={() => reintentarTodo()}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reintentar todo
        </Boton>
      }
    >
      <ul className="space-y-2">
        {sinConfirmar.map((entrada) => (
          <li
            key={entrada.id}
            className="rounded-[var(--doc-radius-sm)] p-2.5"
            style={{ background: "var(--doc-surface)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[color:var(--doc-text)]">{entrada.descripcion}</p>
                <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-muted)]">
                  {entrada.cambios.length} documento(s) · {entrada.estado}
                  {entrada.intentos > 0 && ` · ${entrada.intentos} intento(s)`} · en cola desde{" "}
                  {new Date(entrada.creadoEn).toLocaleString("es-BO")}
                </p>
                {entrada.ultimoError && (
                  <p className="doc-prose mt-1 font-mono text-[11px] text-[color:var(--doc-danger)]">{entrada.ultimoError}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Boton variante="suave" onClick={() => reintentarEntrada(entrada.id)}>
                  Reintentar
                </Boton>
                <Boton variante="fantasma" onClick={() => setDescartando(entrada)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Descartar
                </Boton>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Confirmacion
        abierta={!!descartando}
        titulo="¿Descartar este cambio?"
        detalle={
          descartando
            ? `Se pierden ${descartando.cambios.length} cambio(s) de «${descartando.descripcion}» que NUNCA llegaron al libro. Si el documento se entregó de verdad, habrá que volver a marcarlo a mano.`
            : ""
        }
        textoConfirmar="Descartar"
        peligrosa
        onConfirmar={() => {
          if (descartando) {
            descartarEntrada(descartando.id);
            avisar("aviso", "Cambio descartado.", "No llegó al libro; si hace falta, vuelva a marcarlo.");
          }
          setDescartando(null);
        }}
        onCancelar={() => setDescartando(null)}
      />
    </Panel>
  );
}

/* ================================================================== */
/* Preferencias                                                        */
/* ================================================================== */

function Preferencias() {
  const prefs = usePreferencias();
  /* La densidad vive en `state/consola.ts`, no en las preferencias: ver el
     comentario de cabecera de `state/preferencias.ts`. */
  const { densidad } = useConsola();
  /* Opcional a propósito: ver `useThemeOpcional`. Sin proveedor de tema el
     interruptor no se ofrece y el resto del panel sigue funcionando, que es lo
     que importa cuando alguien llega aquí porque algo se rompió. */
  const tema = useThemeOpcional();
  const ligero = modoLigeroActivo(prefs);

  return (
    <Panel
      titulo="Cómo se ve y se comporta"
      descripcion="Solo afecta a este navegador. No se sincroniza con nadie y no necesita permisos."
      acciones={
        <Boton variante="fantasma" onClick={() => restaurarPreferencias()}>
          Restaurar valores de fábrica
        </Boton>
      }
    >
      <div className="space-y-3">
        {tema && (
          <Ajuste etiqueta="Tema" pista="El mismo tema que el resto de la aplicación.">
            <Segmento
              etiqueta="Tema"
              valor={tema.theme}
              onChange={(v) => tema.setTheme(v)}
              opciones={[
                { valor: "dark" as const, etiqueta: "Oscuro" },
                { valor: "light" as const, etiqueta: "Claro" },
              ]}
            />
          </Ajuste>
        )}

        <Ajuste etiqueta="Densidad" pista="Cuántas filas caben en la pantalla sin desplazarse.">
          <Segmento
            etiqueta="Densidad"
            valor={densidad}
            onChange={(v) => ponerDensidad(v)}
            opciones={[
              { valor: "compacta" as const, etiqueta: "Compacta" },
              { valor: "comoda" as const, etiqueta: "Cómoda" },
              { valor: "amplia" as const, etiqueta: "Amplia" },
            ]}
          />
        </Ajuste>

        <Ajuste etiqueta="Tamaño de la letra" pista="Escala el módulo entero, no solo los títulos.">
          <Segmento
            etiqueta="Tamaño de la letra"
            valor={prefs.letra}
            onChange={(v) => ponerPreferencia("letra", v)}
            opciones={[
              { valor: "pequena" as const, etiqueta: "Pequeña" },
              { valor: "normal" as const, etiqueta: "Normal" },
              { valor: "grande" as const, etiqueta: "Grande" },
            ]}
          />
        </Ajuste>

        <Ajuste
          etiqueta="Modo ligero"
          pista={
            prefs.modoLigero === "auto"
              ? `Automático: ${ligero ? "activo" : "inactivo"} ahora mismo${equipoModesto() ? " (el equipo declara pocos recursos)" : ""}.`
              : "Quita sombras, desenfoques y transiciones. La información no cambia."
          }
        >
          <Segmento
            etiqueta="Modo ligero"
            valor={prefs.modoLigero}
            onChange={(v) => ponerPreferencia("modoLigero", v)}
            opciones={[
              { valor: "auto" as const, etiqueta: "Automático" },
              { valor: "si" as const, etiqueta: "Siempre" },
              { valor: "no" as const, etiqueta: "Nunca" },
            ]}
          />
        </Ajuste>

        <Ajuste etiqueta="Animaciones" pista="Si el sistema ya pide movimiento reducido, esto ya está apagado.">
          <Interruptor
            activo={prefs.animaciones}
            onChange={(v) => ponerPreferencia("animaciones", v)}
            etiqueta={prefs.animaciones ? "Activadas" : "Desactivadas"}
          />
        </Ajuste>

        <Ajuste
          etiqueta="Precarga en segundo plano"
          pista={
            precargaActiva(prefs)
              ? "Trae los expedientes de la lista antes de que los abra. Abrirlos pasa a ser instantáneo."
              : "Apagada. Con el ahorro de datos del sistema activado se apaga sola."
          }
        >
          <Interruptor
            activo={prefs.precarga}
            onChange={(v) => ponerPreferencia("precarga", v)}
            etiqueta={prefs.precarga ? "Activada" : "Desactivada"}
          />
        </Ajuste>

        <Ajuste etiqueta="Orden por defecto de la lista" pista="Con qué orden se abre la lista de expedientes.">
          <select
            value={prefs.orden}
            onChange={(e) => {
              const orden = e.target.value as OrdenLista;
              ponerPreferencia("orden", orden);
              /* Y se aplica ya. Un «orden por defecto» que solo se nota la
                 próxima vez que se limpian los filtros parece que no funciona. */
              ponerFiltros({ orden });
            }}
            aria-label="Orden por defecto de la lista"
            className="doc-tap rounded-[var(--doc-radius-sm)] px-2.5 py-1.5 text-xs text-[color:var(--doc-text)]"
            style={{ background: "var(--doc-surface)", boxShadow: "inset 0 0 0 1px var(--doc-border)" }}
          >
            {ORDENES_LISTA.map((o) => (
              <option key={o} value={o}>
                {NOMBRE_ORDEN[o]}
              </option>
            ))}
          </select>
        </Ajuste>

        <div className="border-t border-[color:var(--doc-border)] pt-3">
          <p className="text-xs font-semibold text-[color:var(--doc-text)]">Columnas visibles en la lista</p>
          <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-muted)]">
            Se aplica al modo operativo. La persona no se puede ocultar —sin ella la fila no identifica a nadie— y el modo
            auditoría mantiene sus columnas fijas a propósito: es la vista que se imprime para demostrar algo.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {COLUMNAS_LISTA.map((columna) => (
              <Interruptor
                key={columna}
                activo={prefs.columnas.includes(columna)}
                onChange={() => alternarColumna(columna)}
                etiqueta={NOMBRE_COLUMNA[columna]}
              />
            ))}
          </div>
        </div>

        <div className="border-t border-[color:var(--doc-border)] pt-3">
          <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--doc-text-faint)]">
            <Gauge className="h-3.5 w-3.5" aria-hidden />
            La URL del backend se cambia en «Conexión y esquema»: afecta a todo el módulo, no solo a esta pantalla.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Ajuste({ etiqueta, pista, children }: { etiqueta: string; pista: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed border-[color:var(--doc-border)] pb-3 last:border-0 last:pb-0">
      <div className="min-w-0 max-w-[28rem]">
        <p className="text-xs font-semibold text-[color:var(--doc-text)]">{etiqueta}</p>
        <p className="doc-prose mt-0.5 text-[11px] text-[color:var(--doc-text-muted)]">{pista}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ================================================================== */
/* Respaldo recuperable de la cola                                     */
/* ================================================================== */

/**
 * El respaldo de la cola vive aparte de la cola.
 *
 * La cola se limpia sola al confirmar, y eso es correcto. Pero significa que un
 * descarte accidental —o una limpieza de la clave— no tiene marcha atrás. Esta
 * copia se escribe justo antes de un reintento masivo y es lo que «Recuperar
 * borrador» lee. Es la red debajo del trapecio, no una segunda cola.
 */
function leerRespaldoDeCola(): EntradaSalida[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_RESPALDO_COLA);
    if (!crudo) return [];
    const datos = JSON.parse(crudo) as { entradas?: EntradaSalida[] };
    return Array.isArray(datos?.entradas) ? datos.entradas.filter((e) => e && Array.isArray(e.cambios)) : [];
  } catch {
    return [];
  }
}

function guardarRespaldoDeCola(entradas: EntradaSalida[]): void {
  if (typeof window === "undefined" || !entradas.length) return;
  try {
    window.localStorage.setItem(CLAVE_RESPALDO_COLA, JSON.stringify({ guardadoEn: new Date().toISOString(), entradas }));
  } catch {
    /* Sin espacio o con el almacenamiento bloqueado: el respaldo es un extra, no
       una dependencia. */
  }
}
