/**
 * Autodiagnóstico y preferencias del módulo.
 *
 * ── Para quién es esta pantalla ─────────────────────────────────────────────
 * Para un reclutador, no para quien mantiene el código. Cuando algo va mal —el
 * libro no responde, un guardado quedó a medias, la lista se ve rara— la salida
 * habitual era «llama a sistemas y espera». Aquí hay cinco botones grandes con
 * nombres que dicen qué hacen y un resultado explicado en una frase. Ninguno
 * pide entender qué es IndexedDB ni qué es una cola de salida.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 * Ninguna acción de esta pantalla puede perder trabajo sin avisar. «Vaciar la
 * copia local» y «Descartar los cambios pendientes» piden confirmación y dicen
 * exactamente qué se va a perder; el resto son operaciones de lectura o de
 * reintento.
 */

import { useEffect, useState } from "react";
import {
  Activity,
  DatabaseBackup,
  Eraser,
  FileDown,
  Gauge,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { docApi } from "../api/acciones";
import { comprobarConexion, refrescarCatalogo, urlBackend, useConsola } from "../state/consola";
import { resumenCache, vaciarCache } from "../state/cacheExpedientes";
import { descartarCola, reintentarFallidos, useCola, vaciarCola } from "../state/colaSalida";
import {
  ponerPreferenciaLigero,
  senalesDeEquipoModesto,
  useEstadoLigero,
  volverAMedirFluidez,
  type PreferenciaLigero,
} from "../state/rendimiento";
import { descargarXlsx, nombreConFecha, unirLotes } from "../export/xlsx";
import { hace } from "./DocSyncIndicator";
import { Aviso, Boton, Confirmacion, Panel, Segmento, TONO, type Notita } from "./piezas";

/* ------------------------------------------------------------------ */
/* Resultado de una comprobación                                       */
/* ------------------------------------------------------------------ */

interface Resultado {
  intencion: "exito" | "aviso" | "peligro" | "info";
  titulo: string;
  detalle: string;
}

/**
 * Traduce el estado de la conexión a lenguaje llano.
 *
 * Los cinco casos que de verdad ocurren, cada uno con su solución escrita. Un
 * «error de conexión» genérico obliga a adivinar cuál de los cinco es.
 */
function diagnosticoDeConexion(
  conexion: string,
  url: string,
  libro: string | undefined,
  esquemaCliente: number,
  esquemaServidor: number | undefined,
): Resultado {
  if (!url || !/^https:\/\/script\.google\.com\//.test(url)) {
    return {
      intencion: "peligro",
      titulo: "No hay URL del backend",
      detalle:
        "Pega la URL de la aplicación web de Apps Script (la que termina en /exec) en Configuración › Conexión y esquema, y pulsa «Guardar y probar».",
    };
  }
  if (conexion === "sin_instalar") {
    return {
      intencion: "aviso",
      titulo: "Conectado, pero el libro no tiene el modelo instalado",
      detalle:
        "El backend responde y las hojas del módulo no existen todavía. En el libro: menú Documentación › Instalar o actualizar modelo.",
    };
  }
  if (conexion === "sin_conexion") {
    return {
      intencion: "peligro",
      titulo: "El backend no responde",
      detalle:
        "Puede ser la red, o que la implementación de Apps Script no esté publicada como versión nueva. Los cambios que hagas quedan guardados en este equipo y se enviarán solos.",
    };
  }
  if (conexion === "error") {
    return {
      intencion: "peligro",
      titulo: "Responde algo que no es este backend",
      detalle:
        "La URL apunta a otro proyecto de Apps Script (por ejemplo, al del talento o al de Evaluaciones). Comprueba que sea la del proyecto de Documentación.",
    };
  }
  if (conexion !== "conectado") {
    return { intencion: "info", titulo: "Comprobando…", detalle: "Resolviendo identidad y permisos contra el libro." };
  }
  if (esquemaServidor !== undefined && esquemaServidor !== esquemaCliente) {
    return {
      intencion: "aviso",
      titulo: "Conectado, pero con versiones distintas",
      detalle: `Esta pantalla espera la versión ${esquemaCliente} del modelo y el libro tiene la ${esquemaServidor}. Pega los archivos .gs actualizados y publica una versión nueva de la implementación.`,
    };
  }
  return {
    intencion: "exito",
    titulo: "Conectado y al día",
    detalle: libro ? `Escribiendo en «${libro}».` : "El módulo escribe en el libro del área.",
  };
}

/* ------------------------------------------------------------------ */
/* Panel                                                              */
/* ------------------------------------------------------------------ */

export function DocAutodiagnostico({
  avisar,
}: {
  avisar: (intencion: Notita["intencion"], texto: string, pista?: string) => void;
}) {
  const consola = useConsola();
  const cola = useCola();
  const ligero = useEstadoLigero();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [trabajando, setTrabajando] = useState<string>("");
  const [pidiendo, setPidiendo] = useState<null | "cache" | "cola">(null);
  const [cache, setCache] = useState(() => resumenCache());

  /* El resumen de la caché se refresca al abrir y cuando cambia la cola: son los
     dos momentos en que el número puede haber cambiado. */
  useEffect(() => {
    setCache(resumenCache());
  }, [cola.ultimaConfirmacion, cola.elementos.length]);

  const senales = senalesDeEquipoModesto();
  const pendientes = cola.elementos.reduce((suma, e) => suma + e.cambios.length, 0);
  const fallidos = cola.elementos.filter((e) => e.estado === "fallido");

  async function conTrabajo(nombre: string, tarea: () => Promise<Resultado>) {
    setTrabajando(nombre);
    try {
      setResultado(await tarea());
    } catch (error) {
      const fallo = error as { message?: string; pista?: string };
      setResultado({
        intencion: "peligro",
        titulo: "La comprobación no se pudo completar",
        detalle: `${fallo.message ?? "Error desconocido"}${fallo.pista ? ` · ${fallo.pista}` : ""}`,
      });
    } finally {
      setTrabajando("");
    }
  }

  return (
    <div className="space-y-3">
      <Panel
        titulo="¿Algo va mal? Prueba aquí"
        descripcion="Cinco comprobaciones que puedes ejecutar tú, sin ayuda de nadie. Ninguna borra trabajo sin avisar."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <BotonGrande
            icono={<PlugZap className="h-5 w-5" aria-hidden />}
            titulo="Probar la conexión"
            detalle="Comprueba que el libro responde y que es el correcto."
            cargando={trabajando === "conexion"}
            onClick={() =>
              conTrabajo("conexion", async () => {
                const conexion = await comprobarConexion({ url: urlBackend() });
                const estado = consola.estado;
                return diagnosticoDeConexion(conexion, urlBackend(), estado?.libro, 5, estado?.esquema);
              })
            }
          />

          <BotonGrande
            icono={<RefreshCw className="h-5 w-5" aria-hidden />}
            titulo="Volver a sincronizar"
            detalle={pendientes ? `${pendientes} cambio(s) esperan turno.` : "No hay nada pendiente de enviar."}
            resaltado={pendientes > 0}
            cargando={trabajando === "cola"}
            onClick={() =>
              conTrabajo("cola", async () => {
                reintentarFallidos();
                const res = await vaciarCola();
                if (!res.enviados) {
                  return { intencion: "exito", titulo: "No había nada que enviar", detalle: "Todo lo que has marcado está en el libro." };
                }
                if (res.restantes) {
                  return {
                    intencion: "aviso",
                    titulo: `${res.confirmados} confirmado(s), ${res.restantes} pendiente(s)`,
                    detalle: "Lo que queda se volverá a intentar solo. No se pierde: está guardado en este equipo.",
                  };
                }
                return {
                  intencion: "exito",
                  titulo: `${res.confirmados} envío(s) confirmado(s) por el libro`,
                  detalle: "Ya no queda nada pendiente de sincronizar.",
                };
              })
            }
          />

          <BotonGrande
            icono={<Eraser className="h-5 w-5" aria-hidden />}
            titulo="Vaciar la copia local"
            detalle={
              cache.entradas
                ? `${cache.entradas} expediente(s) guardados en este equipo, el más antiguo ${hace(cache.masAntiguo)}.`
                : "No hay ninguna copia guardada."
            }
            onClick={() => setPidiendo("cache")}
          />

          <BotonGrande
            icono={<FileDown className="h-5 w-5" aria-hidden />}
            titulo="Descargar respaldo"
            detalle="Un Excel con todo lo que hay en el libro, para guardarlo aparte."
            cargando={trabajando === "respaldo"}
            onClick={() =>
              conTrabajo("respaldo", async () => {
                const trabajo = await docApi.iniciarExportacion({ tipo: "completo" });
                const lotes = [];
                let quedan = true;
                let vueltas = 0;
                while (quedan && vueltas < 60) {
                  const lote = await docApi.loteExportacion(trabajo.exportacionId);
                  lotes.push(lote.datos);
                  quedan = lote.quedan;
                  vueltas += 1;
                }
                const { nombre } = descargarXlsx(unirLotes(lotes), nombreConFecha("respaldo-documentacion"));
                return {
                  intencion: "exito",
                  titulo: "Respaldo descargado",
                  detalle: `Archivo ${nombre}, con ${trabajo.expedientes} expediente(s). Guárdalo fuera de este equipo.`,
                };
              })
            }
          />

          <BotonGrande
            icono={<DatabaseBackup className="h-5 w-5" aria-hidden />}
            titulo="Comprobar el catálogo"
            detalle="Vuelve a pedir la lista de documentos exigidos y las agencias, gerencias y cargos."
            cargando={trabajando === "catalogo"}
            onClick={() =>
              conTrabajo("catalogo", async () => {
                await refrescarCatalogo(true);
                const cat = consola.catalogo;
                const aux = cat?.auxiliares;
                const faltan: string[] = [];
                if (!aux?.agencia_bdp.length) faltan.push("agencias");
                if (!aux?.gerencia_bdp.length) faltan.push("gerencias");
                if (!aux?.cargo_bdp.length) faltan.push("cargos");
                if (faltan.length) {
                  return {
                    intencion: "aviso",
                    titulo: `El catálogo llegó, pero faltan ${faltan.join(", ")}`,
                    detalle:
                      "En el libro, hoja «Auxiliar»: comprueba que existan las columnas agencia_bdp, gerencia_bdp y cargo_bdp, y pega los valores del banco debajo de cada cabecera.",
                  };
                }
                return {
                  intencion: "exito",
                  titulo: "Catálogo al día",
                  detalle: `${cat?.documentos.length ?? 0} documentos, ${aux?.agencia_bdp.length} agencias, ${aux?.gerencia_bdp.length} gerencias y ${aux?.cargo_bdp.length} cargos.`,
                };
              })
            }
          />

          <BotonGrande
            icono={<Gauge className="h-5 w-5" aria-hidden />}
            titulo="Medir la fluidez"
            detalle="Cuenta los fotogramas de un segundo para saber si conviene el modo ligero."
            cargando={trabajando === "fluidez"}
            onClick={() =>
              conTrabajo("fluidez", async () => {
                const medicion = await volverAMedirFluidez();
                const bien = medicion.fps >= 40 && medicion.saltos < 6;
                return {
                  intencion: bien ? "exito" : "aviso",
                  titulo: bien ? `${medicion.fps} fotogramas por segundo: va bien` : `${medicion.fps} fotogramas por segundo`,
                  detalle: bien
                    ? "Este equipo mueve el módulo con soltura. No hace falta el modo ligero."
                    : `Se perdieron ${medicion.saltos} fotograma(s). Se ha activado el modo ligero: quita transparencias y sombras para que todo responda antes.`,
                };
              })
            }
          />
        </div>

        {resultado && (
          <div className="mt-3">
            <Aviso intencion={resultado.intencion} titulo={resultado.titulo} onCerrar={() => setResultado(null)}>
              {resultado.detalle}
            </Aviso>
          </div>
        )}
      </Panel>

      {/* Cambios pendientes: la lista simple que pide el área. */}
      {cola.elementos.length > 0 && (
        <Panel
          titulo={`Cambios pendientes de enviar (${pendientes})`}
          descripcion="Están guardados en este equipo. Se enviarán solos cuando vuelva la conexión; nada se ha perdido."
          acciones={
            <>
              <Boton variante="primario" onClick={() => void vaciarCola()}>
                Reintentar ahora
              </Boton>
              <Boton variante="fantasma" onClick={() => setPidiendo("cola")}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Descartar
              </Boton>
            </>
          }
        >
          <ul className="space-y-1.5">
            {cola.elementos.map((elemento) => (
              <li key={elemento.id} className="doc-surface flex flex-wrap items-baseline justify-between gap-2 p-2.5 text-xs">
                <span className="min-w-0">
                  <span className="font-semibold text-[color:var(--doc-text)]">
                    {elemento.cambios.length} cambio(s)
                  </span>
                  <span className="doc-metric ml-2 text-[11px] text-[color:var(--doc-text-faint)]">
                    {hace(elemento.creadoEn)} · {elemento.intentos} intento(s)
                  </span>
                </span>
                <span
                  className="shrink-0 text-[11px] font-semibold"
                  style={{
                    color:
                      elemento.estado === "fallido"
                        ? TONO.peligro.texto
                        : elemento.estado === "enviando"
                          ? TONO.info.texto
                          : TONO.aviso.texto,
                  }}
                >
                  {elemento.estado === "fallido" ? "No se pudo enviar" : elemento.estado === "enviando" ? "Enviando…" : "En espera"}
                </span>
                {elemento.error && (
                  <span className="doc-prose w-full text-[11px] text-[color:var(--doc-text-muted)]">
                    {elemento.error}
                    {elemento.pista ? ` · ${elemento.pista}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {fallidos.length > 0 && (
            <div className="mt-2">
              <Boton variante="suave" onClick={reintentarFallidos}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Volver a poner en cola los {fallidos.length} fallido(s)
              </Boton>
            </div>
          )}
        </Panel>
      )}

      {/* Rendimiento: el interruptor visible que pidió el área. */}
      <Panel
        titulo="Fluidez del módulo"
        descripcion="El modo ligero quita transparencias, desenfoques y sombras. La información es exactamente la misma; solo cuesta menos pintarla."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmento<PreferenciaLigero>
            etiqueta="Modo ligero"
            valor={ligero.preferencia}
            onChange={ponerPreferenciaLigero}
            opciones={[
              { valor: "auto", etiqueta: "Automático", titulo: "Lo decide el módulo según el equipo" },
              { valor: "si", etiqueta: "Siempre", titulo: "Mejora la fluidez en equipos con menos recursos" },
              { valor: "no", etiqueta: "Nunca", titulo: "Mantiene todos los efectos visuales" },
            ]}
          />
          <p className="doc-prose min-w-[220px] flex-1 text-[11px] text-[color:var(--doc-text-muted)]">
            <Activity className="mr-1 inline h-3 w-3" aria-hidden />
            {ligero.preferencia === "auto"
              ? senales.motivos.length
                ? `Automático: este equipo declara ${senales.motivos.join(", ")}.`
                : "Automático: este equipo no declara limitaciones. Se medirá la fluidez en la primera interacción."
              : ligero.preferencia === "si"
                ? "Activado a mano. Se mantiene así en este equipo."
                : "Desactivado a mano. Se mantiene así aunque el equipo vaya justo."}
          </p>
        </div>
      </Panel>

      <Confirmacion
        abierta={pidiendo === "cache"}
        titulo="Vaciar la copia local de expedientes"
        detalle="Se borra lo que este equipo guardó para poder abrir expedientes al instante y consultarlos sin conexión. No se toca nada del libro: los expedientes siguen ahí y se volverán a descargar cuando los abras."
        textoConfirmar="Vaciar"
        onConfirmar={async () => {
          await vaciarCache();
          setCache(resumenCache());
          setPidiendo(null);
          avisar("exito", "Copia local vaciada. Los expedientes se volverán a pedir al libro.");
        }}
        onCancelar={() => setPidiendo(null)}
      />

      <Confirmacion
        abierta={pidiendo === "cola"}
        titulo="Descartar los cambios pendientes"
        detalle={`Se van a perder ${pendientes} cambio(s) que todavía NO están en el libro. Esto no se puede deshacer: habría que volver a marcarlos a mano.`}
        impacto="Antes de descartar, prueba «Reintentar ahora»: casi siempre el problema es la conexión y se resuelve solo."
        textoConfirmar="Descartar y perder los cambios"
        peligrosa
        onConfirmar={() => {
          descartarCola();
          setPidiendo(null);
          avisar("aviso", "Los cambios pendientes se descartaron.");
        }}
        onCancelar={() => setPidiendo(null)}
      />
    </div>
  );
}

/**
 * Botón grande de acción.
 *
 * Grande a propósito: 44 píxeles largos de sobra, con su icono, su nombre en
 * negrita y una frase que explica qué hace. Un icono suelto con un `title`
 * obliga a pasar el ratón por encima para saber qué se va a pulsar, y en táctil
 * no hay dónde pasar el ratón.
 */
function BotonGrande({
  icono,
  titulo,
  detalle,
  onClick,
  cargando,
  resaltado,
}: {
  icono: JSX.Element;
  titulo: string;
  detalle: string;
  onClick: () => void;
  cargando?: boolean;
  resaltado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      className="doc-tap doc-presion flex items-start gap-3 rounded-[18px] p-3.5 text-left transition-colors disabled:opacity-60"
      style={{
        background: resaltado ? "var(--doc-warning-bg)" : "var(--doc-surface)",
        boxShadow: `inset 0 0 0 1px ${resaltado ? "var(--doc-warning)" : "var(--doc-border)"}`,
      }}
    >
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px]"
        style={{
          background: resaltado ? "var(--doc-warning-bg)" : "var(--doc-surface-raised)",
          color: resaltado ? "var(--doc-warning-fg)" : "var(--doc-info-fg)",
        }}
      >
        {cargando ? <RefreshCw className="h-5 w-5 animate-spin" aria-hidden /> : icono}
      </span>
      <span className="min-w-0">
        <span className="doc-subtitulo block">{titulo}</span>
        <span className="doc-prose mt-0.5 block text-[11px] leading-snug text-[color:var(--doc-text-muted)]">{detalle}</span>
      </span>
    </button>
  );
}
