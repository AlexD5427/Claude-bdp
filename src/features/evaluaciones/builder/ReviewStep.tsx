/**
 * Paso 3 — revisión y publicación, con vista previa real.
 *
 * El módulo anterior devolvía la validación como una lista de textos sin manera de
 * llegar al campo. Aquí cada hallazgo es un botón que lleva al bloque exacto, los
 * errores se separan de las advertencias, y la vista previa usa el MISMO
 * renderizador que la prueba del candidato: si algo se ve bien aquí, se verá bien
 * allá.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, History, Monitor, Send, Smartphone, Tablet } from "lucide-react";
import { RichText } from "../richtext/RichText";
import { esPregunta, tipoSpec } from "../domain/questionTypes";
import type { HallazgoRevision } from "../domain/validation";
import { soloAvisos, soloErrores } from "../domain/validation";
import type { Contenido } from "../state/builderStore";
import type { VersionPublicada } from "../domain/model";
import { CATEGORIA_LABEL } from "../domain/model";
import { contarContenido, estimarMinutos } from "../domain/factory";
import { BotonPrimario, GlassPanel, Metrica, Pill, SectionTitle, formatearFecha } from "../ui/pieces";

type Dispositivo = "escritorio" | "tableta" | "movil";

const ANCHO: Record<Dispositivo, string> = {
  escritorio: "max-w-3xl",
  tableta: "max-w-xl",
  movil: "max-w-[22rem]",
};

export function ReviewStep({
  contenido,
  hallazgos,
  versiones,
  onIrA,
  onPublicar,
  onRevertir,
}: {
  contenido: Contenido;
  hallazgos: HallazgoRevision[];
  versiones: VersionPublicada[];
  onIrA: (seccionId: string, preguntaId: string | null) => void;
  onPublicar?: () => void;
  onRevertir?: (versionId: string) => void;
}) {
  const [dispositivo, setDispositivo] = useState<Dispositivo>("escritorio");
  const errores = useMemo(() => soloErrores(hallazgos), [hallazgos]);
  const avisos = useMemo(() => soloAvisos(hallazgos), [hallazgos]);
  const conteos = useMemo(() => contarContenido(contenido.secciones), [contenido.secciones]);
  const estimados = useMemo(() => estimarMinutos(contenido.secciones), [contenido.secciones]);
  const { evaluacion } = contenido;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        {/* Resumen */}
        <GlassPanel>
          <SectionTitle titulo="Resumen" />
          <div className="flex flex-wrap gap-2">
            <Metrica etiqueta="Preguntas" valor={conteos.preguntas} />
            <Metrica etiqueta="Calificables" valor={conteos.calificables} />
            <Metrica etiqueta="Con revisión" valor={conteos.manuales} />
            <Metrica etiqueta="Puntos" valor={conteos.puntos} />
            <Metrica etiqueta="Duración" valor={evaluacion.aplicacion.duracionMinutos ?? "libre"} />
            <Metrica etiqueta="Estimada" valor={estimados} sufijo="min" />
          </div>
          <dl className="mt-3 grid gap-1.5 text-xs">
            <Dato termino="Categoría" valor={CATEGORIA_LABEL[evaluacion.categoria] ?? evaluacion.categoria} />
            <Dato
              termino="Aprobación"
              valor={
                evaluacion.aplicacion.puntajeAprobacion === null
                  ? "Sin criterio de aprobación"
                  : evaluacion.aplicacion.criterioAprobacion === "puntos"
                    ? `${evaluacion.aplicacion.puntajeAprobacion} de ${conteos.puntos} puntos`
                    : `${evaluacion.aplicacion.puntajeAprobacion} %`
              }
            />
            <Dato termino="Intentos" valor={`${evaluacion.aplicacion.intentosMaximos} por documento`} />
            <Dato
              termino="Ventana"
              valor={
                evaluacion.aplicacion.ventanaInicio || evaluacion.aplicacion.ventanaFin
                  ? `${formatearFecha(evaluacion.aplicacion.ventanaInicio) } → ${formatearFecha(evaluacion.aplicacion.ventanaFin)}`
                  : "Abierta mientras esté publicada"
              }
            />
            <Dato termino="Código público" valor={evaluacion.codigo} />
          </dl>
        </GlassPanel>

        {/* Bloqueos */}
        <GlassPanel>
          <SectionTitle
            titulo={errores.length === 0 ? "Sin bloqueos" : `${errores.length} bloqueo(s)`}
            descripcion={
              errores.length === 0
                ? "La evaluación cumple todas las reglas de publicación."
                : "Hay que resolverlos antes de publicar. Pulsa uno para ir al campo."
            }
            accion={
              errores.length === 0 ? (
                <Pill tono="exito">
                  <CheckCircle2 className="h-3 w-3" /> Lista
                </Pill>
              ) : (
                <Pill tono="peligro">{errores.length}</Pill>
              )
            }
          />
          {errores.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {errores.map((hallazgo, i) => (
                <ItemHallazgo key={`${hallazgo.codigo}-${i}`} hallazgo={hallazgo} onIrA={onIrA} tono="peligro" />
              ))}
            </ul>
          )}
          {onPublicar && (
            <div className="mt-3">
              <BotonPrimario onClick={onPublicar} disabled={errores.length > 0}>
                <Send className="h-4 w-4" /> Publicar
              </BotonPrimario>
            </div>
          )}
        </GlassPanel>

        {/* Advertencias */}
        {avisos.length > 0 && (
          <GlassPanel>
            <SectionTitle
              titulo={`${avisos.length} advertencia(s)`}
              descripcion="No impiden publicar. Conviene decidir a conciencia."
              accion={<Pill tono="aviso">{avisos.length}</Pill>}
            />
            <ul className="flex flex-col gap-1.5">
              {avisos.map((hallazgo, i) => (
                <ItemHallazgo key={`${hallazgo.codigo}-${i}`} hallazgo={hallazgo} onIrA={onIrA} tono="aviso" />
              ))}
            </ul>
          </GlassPanel>
        )}

        {/* Versiones */}
        {versiones.length > 0 && (
          <GlassPanel>
            <SectionTitle titulo="Versiones publicadas" accion={<History className="h-4 w-4 text-ink-faint" />} />
            <ul className="flex flex-col gap-1.5">
              {[...versiones].reverse().slice(0, 5).map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl fill-softer px-3 py-2 text-xs ring-1 ring-[color:var(--hairline)]"
                >
                  <span className="font-bold text-ink">
                    {version.etiqueta}
                    {version.estado === "vigente" && <span className="ml-2 tone-text-exito">vigente</span>}
                  </span>
                  <span className="text-ink-faint">
                    {version.preguntas} preguntas · {formatearFecha(version.publicadoEn)}
                  </span>
                  {version.estado !== "vigente" && onRevertir && (
                    <button
                      type="button"
                      onClick={() => onRevertir(version.id)}
                      className="text-accent underline decoration-dotted"
                    >
                      Servir esta
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </GlassPanel>
        )}
      </div>

      {/* Vista previa */}
      <GlassPanel>
        <SectionTitle
          titulo="Vista previa del candidato"
          descripcion="Mismo renderizador que la prueba real. No incluye respuestas correctas: esta pantalla usa la misma proyección pública que el servidor."
          accion={
            <div className="flex rounded-full fill-softer p-0.5 ring-1 ring-[color:var(--hairline)]">
              {(
                [
                  ["escritorio", Monitor],
                  ["tableta", Tablet],
                  ["movil", Smartphone],
                ] as const
              ).map(([id, Icono]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDispositivo(id)}
                  aria-pressed={dispositivo === id}
                  title={id}
                  className={`grid h-7 w-7 place-items-center rounded-full transition-all ${
                    dispositivo === id
                      ? "bg-gradient-to-br from-[#00b0d8] to-[#005baa] text-white"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  <Icono className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          }
        />

        <div className="flex justify-center">
          <motion.div
            layout
            className={`w-full ${ANCHO[dispositivo]} rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--fill-1)] p-4 sm:p-6`}
          >
            <p className="text-[0.6rem] font-black uppercase tracking-[0.2em] text-accent">Evaluación</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-ink">
              {evaluacion.titulo || "Evaluación sin título"}
            </h3>
            {evaluacion.aplicacion.duracionMinutos !== null && (
              <p className="mt-1 text-xs text-ink-soft">
                {evaluacion.aplicacion.duracionMinutos} minutos · {conteos.preguntas} preguntas
              </p>
            )}
            <div className="mt-3">
              <RichText doc={evaluacion.instrucciones} />
            </div>

            {contenido.secciones.map((seccion, indiceSeccion) => (
              <section key={seccion.id} className="mt-6">
                <h4 className="text-sm font-black uppercase tracking-[0.14em] text-accent">
                  {indiceSeccion + 1}. {seccion.titulo}
                </h4>
                <div className="mt-1">
                  <RichText doc={seccion.descripcion} compacto />
                </div>
                <ol className="mt-3 flex flex-col gap-4">
                  {seccion.preguntas.map((pregunta, indice) => {
                    const spec = tipoSpec(pregunta.tipo);
                    if (pregunta.tipo === "contenido_separador") {
                      return <li key={pregunta.id} className="h-px bg-[color:var(--hairline)]" />;
                    }
                    return (
                      <li key={pregunta.id} className="flex flex-col gap-1.5">
                        <div className="flex items-start gap-2">
                          {esPregunta(pregunta.tipo) && evaluacion.tema.mostrarNumeracion && (
                            <span className="mt-0.5 shrink-0 text-xs font-black text-ink-faint">{indice + 1}.</span>
                          )}
                          <div className="relative min-w-0 flex-1">
                            <RichText doc={pregunta.enunciado} />
                            {pregunta.obligatoria && (
                              <span className="tone-text-peligro absolute -left-2.5 top-0" title="Obligatoria">
                                *
                              </span>
                            )}
                          </div>
                          {pregunta.modoPuntaje !== "ninguno" && pregunta.puntos > 0 && (
                            <span className="shrink-0 text-[0.65rem] font-bold text-ink-faint">
                              {pregunta.puntos} pt{pregunta.puntos === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                        <div className="pl-5 text-xs text-ink-faint">
                          <RichText doc={pregunta.ayuda} compacto />
                        </div>
                        {spec?.kind === "pregunta" && (
                          <div className="pl-5">
                            <PrevisualizacionRespuesta pregunta={pregunta} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </motion.div>
        </div>
      </GlassPanel>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--hairline)] pb-1">
      <dt className="text-ink-faint">{termino}</dt>
      <dd className="text-right font-semibold text-ink">{valor}</dd>
    </div>
  );
}

function ItemHallazgo({
  hallazgo,
  onIrA,
  tono,
}: {
  hallazgo: HallazgoRevision;
  onIrA: (seccionId: string, preguntaId: string | null) => void;
  tono: "peligro" | "aviso";
}) {
  const navegable = !!hallazgo.seccionId;
  return (
    <li>
      <button
        type="button"
        disabled={!navegable}
        onClick={() => hallazgo.seccionId && onIrA(hallazgo.seccionId, hallazgo.preguntaId ?? null)}
        className={`flex w-full items-start gap-2 rounded-2xl border px-3 py-2 text-left text-xs transition-colors ${
          tono === "peligro"
            ? "border-rose-400/40 bg-rose-500/10 tone-text-peligro hover:bg-rose-500/20"
            : "border-amber-400/30 bg-amber-500/10 tone-text-aviso hover:bg-amber-500/20"
        } ${navegable ? "" : "cursor-default"}`}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {hallazgo.mensaje}
          <span className="mt-0.5 block font-mono text-[0.6rem] opacity-70">{hallazgo.ruta}</span>
        </span>
        {navegable && <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />}
      </button>
    </li>
  );
}

/**
 * Silueta del control que verá el candidato.
 *
 * Es deliberadamente no interactiva: la vista previa muestra la FORMA de la
 * pregunta, y el runner real (`/runner`) es donde se responde. Mezclar las dos
 * cosas invita a confundir una prueba de mentira con una de verdad.
 */
function PrevisualizacionRespuesta({ pregunta }: { pregunta: { tipo: string; opciones: { id: string; texto: unknown }[]; configuracion: Record<string, unknown> } }) {
  const spec = tipoSpec(pregunta.tipo);
  if (!spec) return null;

  if (spec.expects === "opcion" || spec.expects === "opciones") {
    return (
      <ul className="flex flex-col gap-1">
        {pregunta.opciones.map((opcion) => (
          <li key={opcion.id} className="flex items-center gap-2 text-sm text-ink-soft">
            <span
              className={`h-3.5 w-3.5 shrink-0 border border-[color:var(--hairline)] bg-[color:var(--fill-2)] ${
                spec.expects === "opcion" ? "rounded-full" : "rounded"
              }`}
            />
            <RichText doc={opcion.texto} compacto />
          </li>
        ))}
      </ul>
    );
  }
  if (spec.expects === "escala") {
    const min = Number(pregunta.configuracion.minimo ?? 1);
    const max = Number(pregunta.configuracion.maximo ?? 5);
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: Math.max(0, Math.min(12, max - min + 1)) }, (_, i) => (
          <span
            key={i}
            className="grid h-7 w-7 place-items-center rounded-full border border-[color:var(--hairline)] bg-[color:var(--fill-2)] text-[0.7rem] text-ink-soft"
          >
            {min + i}
          </span>
        ))}
      </div>
    );
  }
  if (spec.expects === "matriz") {
    const columnas = (pregunta.configuracion.columnasMatriz as string[] | undefined) ?? [];
    return (
      <div className="overflow-x-auto">
        <table className="text-xs text-ink-soft">
          <thead>
            <tr>
              <th />
              {columnas.map((columna) => (
                <th key={columna} className="px-2 pb-1 font-semibold">
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pregunta.opciones.map((opcion) => (
              <tr key={opcion.id}>
                <td className="pr-3">
                  <RichText doc={opcion.texto} compacto />
                </td>
                {columnas.map((columna) => (
                  <td key={columna} className="px-2 text-center">
                    <span className="inline-block h-3.5 w-3.5 rounded-full border border-[color:var(--hairline)] bg-[color:var(--fill-2)]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (spec.expects === "texto") {
    return (
      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--fill-2)] px-3 py-2 text-xs text-ink-faint">
        {String(pregunta.configuracion.marcador ?? "Respuesta del candidato")}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-[color:var(--hairline)] px-3 py-2 text-xs text-ink-faint">
      {spec.etiqueta}
    </div>
  );
}

export { Eye };
