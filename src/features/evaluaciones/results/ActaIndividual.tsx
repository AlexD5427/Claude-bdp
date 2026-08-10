/**
 * Acta individual de una evaluación.
 *
 * ── Para qué existe ──────────────────────────────────────────────────────────
 * Es el respaldo de lo que hizo una persona: sus datos, la prueba tal como se le
 * presentó, lo que respondió en cada pregunta, la clave, sus puntos y el veredicto.
 * Se imprime o se guarda en PDF y se archiva en el expediente del proceso; ante
 * una reclamación es el documento que se enseña.
 *
 * ── Una plantilla, dos salidas ───────────────────────────────────────────────
 * El mismo componente se ve en pantalla y se imprime: la hoja se dibuja en tamaño
 * carta y el CSS de impresión oculta todo lo demás (ver `@media print` con el
 * ámbito `acta` en `src/index.css`). Y hay además una descarga en PDF generada a
 * mano, sin depender del cuadro de diálogo del navegador.
 *
 * ── De dónde salen los datos ──────────────────────────────────────────────────
 * De `exportAttempt`, que devuelve el paquete completo del intento: la pregunta
 * viene del SNAPSHOT de la versión con la que se hizo la prueba, no del borrador
 * actual. Es la diferencia entre un acta y una reconstrucción aproximada: si la
 * evaluación se editó después, el acta sigue mostrando lo que la persona vio.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { BadgeCheck, FileDown, Loader2, Printer, X, XCircle } from "lucide-react";
import { printModule } from "../../../lib/print";
import { toast } from "../../../design-system/liquid-glass/toast";
import { RichText } from "../richtext/RichText";
import { tipoSpec } from "../domain/questionTypes";
import { CALIFICACION_LABEL, type PaqueteExportacion, type RespuestaDetalle } from "../domain/model";
import { ConstructorPdf, descargar, nombreArchivo } from "./pdf";
import { formatearDuracion, formatearFecha } from "../ui/pieces";

function letra(indice: number): string {
  return String.fromCharCode(65 + (indice % 26));
}

/** Nota sobre 100 con una decimal, o el texto de pendiente. */
function notaLegible(nota: number | null): string {
  return nota === null ? "Pendiente de revisión" : `${Math.round(nota * 10) / 10} / 100`;
}

export function ActaIndividual({
  paquete,
  onCerrar,
}: {
  paquete: PaqueteExportacion;
  onCerrar: () => void;
}) {
  const [descargando, setDescargando] = useState(false);
  const { identidad, resultado, intento, evaluacion } = paquete;

  // El ámbito de impresión se activa mientras el acta está abierta: así una
  // impresión desde el menú del navegador también sale bien.
  useEffect(() => {
    document.body.classList.add("bdp-acta-abierta");
    return () => document.body.classList.remove("bdp-acta-abierta");
  }, []);

  const preguntas = useMemo(
    () => paquete.respuestas.filter((respuesta) => tipoSpec(respuesta.tipo)?.kind === "pregunta"),
    [paquete.respuestas],
  );

  const imprimir = () => {
    printModule(`Acta de evaluación · ${identidad.nombre || "participante"}`, "Letter", "portrait", {
      scope: "acta",
    });
  };

  const descargarPdf = () => {
    setDescargando(true);
    try {
      descargar(construirActaPdf(paquete), nombreArchivo([
        "acta",
        evaluacion?.codigo,
        identidad.nombre,
        identidad.documento,
      ]));
      toast.success("Acta descargada en PDF.");
    } finally {
      setDescargando(false);
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="acta-portal fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Acta individual"
    >
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md no-print" onClick={onCerrar} aria-hidden />

      <div className="relative z-10 my-auto w-full max-w-[860px]">
        {/* Barra de acciones: no se imprime. */}
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/90 drop-shadow">
            Acta individual · respaldo para el expediente
          </p>
          {/* Estos botones viven sobre la capa oscura, así que llevan su propio
              contraste: con los estilos del tema quedaban tinta oscura sobre fondo
              oscuro y no se leían. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={imprimir}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/25"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button
              type="button"
              onClick={descargarPdf}
              disabled={descargando}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#00b0d8] to-[#005baa] px-4 py-2 text-sm font-bold text-white shadow-glass ring-1 ring-white/30 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
            >
              {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/25"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* La hoja. */}
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className="acta-hoja mx-auto w-full rounded-2xl bg-white px-8 py-9 text-[#12263f] shadow-2xl sm:px-12"
        >
          {/* Encabezado institucional */}
          <header className="flex items-start justify-between gap-4 border-b-2 border-[#004a8f] pb-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#00b0d8] to-[#004a8f] text-sm font-black text-white">
                BDP
              </span>
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-[#5b748f]">
                  Banco de Desarrollo Productivo · Reclutamiento y Selección
                </p>
                <h1 className="text-lg font-black leading-tight">Acta individual de evaluación</h1>
              </div>
            </div>
            <div className="text-right text-[0.68rem] text-[#5b748f]">
              <p className="font-mono">{evaluacion?.codigo ?? "—"}</p>
              <p>Versión {intento.versionEtiqueta || "—"}</p>
              <p>Generada el {formatearFecha(paquete.generadoEn)}</p>
            </div>
          </header>

          {/* Identidad y resultado */}
          <section className="mt-5 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="mb-2 text-[0.7rem] font-black uppercase tracking-[0.16em] text-[#5b748f]">
                Participante
              </h2>
              <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-[0.82rem]">
                <Dato termino="Nombre completo" valor={identidad.nombre || "—"} fuerte />
                <Dato termino="Documento (CI)" valor={identidad.documento || "—"} />
                <Dato termino="Correo" valor={identidad.correo || "—"} />
                <Dato termino="N.º de intento" valor={identidad.identificador} mono />
                {Object.entries(identidad.extra ?? {}).map(([clave, valor]) => (
                  <Dato key={clave} termino={clave} valor={String(valor)} />
                ))}
              </dl>
              <h2 className="mb-2 mt-4 text-[0.7rem] font-black uppercase tracking-[0.16em] text-[#5b748f]">
                Evaluación
              </h2>
              <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-[0.82rem]">
                <Dato termino="Título" valor={evaluacion?.titulo ?? "—"} fuerte />
                <Dato termino="Inicio" valor={formatearFecha(intento.iniciadoEn)} />
                <Dato termino="Envío" valor={formatearFecha(intento.enviadoEn)} />
                <Dato
                  termino="Duración usada"
                  valor={`${formatearDuracion(intento.segundosUsados)}${
                    intento.envioAutomatico ? " · envío automático al expirar" : ""
                  }`}
                />
              </dl>
            </div>

            <div className="rounded-xl border border-[#d3deeb] bg-[#f6f9fd] p-4">
              <h2 className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-[#5b748f]">Resultado</h2>
              <p className="mt-1 text-4xl font-black tabular-nums leading-none">
                {resultado.nota === null ? "—" : Math.round(resultado.nota * 10) / 10}
                <span className="ml-1 text-base font-bold text-[#5b748f]">/ 100</span>
              </p>
              {resultado.aprobado !== null && (
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.72rem] font-black uppercase tracking-wide ${
                    resultado.aprobado ? "bg-[#046c50] text-white" : "bg-[#a3123f] text-white"
                  }`}
                >
                  {resultado.aprobado ? <BadgeCheck className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  {resultado.aprobado ? "Aprobado" : "No aprobado"}
                </p>
              )}
              <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1 text-[0.78rem]">
                <Dato
                  termino="Puntos"
                  valor={`${resultado.puntosObtenidos ?? 0} de ${resultado.puntosPosibles ?? 0}`}
                />
                <Dato termino="Correctas" valor={String(resultado.correctas)} />
                <Dato termino="Incorrectas" valor={String(resultado.incorrectas)} />
                <Dato termino="Sin responder" valor={String(resultado.sinResponder)} />
                <Dato termino="Calificación" valor={CALIFICACION_LABEL[resultado.estadoCalificacion]} />
                <Dato termino="Integridad" valor={`riesgo ${paquete.integridad.riesgo} / 100`} />
              </dl>
            </div>
          </section>

          {/* Desarrollo de la prueba */}
          <section className="mt-6">
            <h2 className="mb-3 border-b border-[#d3deeb] pb-1 text-[0.7rem] font-black uppercase tracking-[0.16em] text-[#5b748f]">
              Desarrollo de la prueba · {preguntas.length} pregunta(s)
            </h2>
            <ol className="flex flex-col gap-4">
              {preguntas.map((respuesta, indice) => (
                <BloqueRespuesta key={respuesta.preguntaId} respuesta={respuesta} indice={indice} />
              ))}
            </ol>
          </section>

          {/* Firmas */}
          <section className="mt-8 grid grid-cols-2 gap-8 text-[0.72rem] text-[#5b748f]">
            <div className="border-t border-[#5b748f] pt-1.5">
              Firma del analista responsable
              {intento.calificadoPor ? ` · ${intento.calificadoPor}` : ""}
            </div>
            <div className="border-t border-[#5b748f] pt-1.5">Sello de Reclutamiento y Selección</div>
          </section>

          {paquete.advertencias.length > 0 && (
            <p className="mt-4 rounded-lg border border-[#d97706] bg-[#fff7ed] px-3 py-2 text-[0.7rem] text-[#92400e]">
              Advertencias del sistema: {paquete.advertencias.join(", ")}.
            </p>
          )}

          <footer className="mt-6 border-t border-[#d3deeb] pt-2 text-[0.65rem] text-[#5b748f]">
            Documento generado automáticamente por el módulo de Evaluaciones. Las respuestas provienen del registro
            del intento y de la versión {intento.versionEtiqueta || "vigente"} de la evaluación, tal como se le
            presentó al participante.
          </footer>
        </motion.article>
      </div>
    </motion.div>,
    document.body,
  );
}

function Dato({
  termino,
  valor,
  fuerte = false,
  mono = false,
}: {
  termino: string;
  valor: string;
  fuerte?: boolean;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-[#5b748f]">{termino}</dt>
      <dd className={`${fuerte ? "font-bold" : ""} ${mono ? "font-mono text-[0.75rem]" : ""}`}>{valor}</dd>
    </>
  );
}

/** Una pregunta con lo que respondió la persona. */
function BloqueRespuesta({ respuesta, indice }: { respuesta: RespuestaDetalle; indice: number }) {
  const conOpciones = respuesta.opciones.length > 0;
  const acertada = respuesta.correcta === true;
  const fallada = respuesta.correcta === false;

  return (
    <li className="print-avoid-break">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e7eef8] text-[0.66rem] font-black tabular-nums">
            {indice + 1}
          </span>
          <div className="min-w-0">
            <div className="text-[0.85rem] font-semibold leading-snug">
              <RichText doc={respuesta.enunciado} compacto />
            </div>
            {respuesta.competencia && (
              <p className="mt-0.5 text-[0.66rem] uppercase tracking-wide text-[#5b748f]">
                Competencia: {respuesta.competencia}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.8rem] font-black tabular-nums">
            {respuesta.puntosObtenidos ?? "—"}
            <span className="text-[0.68rem] font-bold text-[#5b748f]">/{respuesta.puntosPosibles}</span>
          </p>
          <p
            className={`text-[0.62rem] font-black uppercase tracking-wide ${
              acertada ? "text-[#046c50]" : fallada ? "text-[#a3123f]" : "text-[#92400e]"
            }`}
          >
            {acertada ? "Correcta" : fallada ? "Incorrecta" : respuesta.requiereRevision ? "Revisada a mano" : "Sin puntaje"}
          </p>
        </div>
      </div>

      {conOpciones ? (
        <ul className="mt-1.5 ml-7 flex flex-col gap-0.5">
          {respuesta.opciones.map((opcion, i) => (
            <li
              key={opcion.id}
              className={`flex items-start gap-2 rounded px-1.5 py-0.5 text-[0.78rem] ${
                opcion.correcta ? "bg-[#eaf7f1]" : opcion.elegida ? "bg-[#fdeef2]" : ""
              }`}
            >
              <span
                className={`mt-[0.15rem] grid h-4 w-4 shrink-0 place-items-center rounded-sm border text-[0.6rem] font-black ${
                  opcion.elegida ? "border-[#12263f] bg-[#12263f] text-white" : "border-[#9fb2c8] text-[#9fb2c8]"
                }`}
              >
                {letra(i)}
              </span>
              <span className={opcion.correcta ? "font-semibold" : ""}>{opcion.texto}</span>
              {opcion.correcta && (
                <span className="ml-auto shrink-0 text-[0.62rem] font-black uppercase text-[#046c50]">correcta</span>
              )}
              {opcion.elegida && !opcion.correcta && (
                <span className="ml-auto shrink-0 text-[0.62rem] font-black uppercase text-[#a3123f]">
                  su respuesta
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1.5 ml-7">
          <p className="text-[0.66rem] font-black uppercase tracking-wide text-[#5b748f]">Su respuesta</p>
          <p className="whitespace-pre-wrap rounded border border-[#d3deeb] bg-[#f6f9fd] px-2 py-1.5 text-[0.8rem]">
            {respuesta.valorTexto || "(sin responder)"}
          </p>
          {respuesta.claveTexto && (
            <p className="mt-1 text-[0.72rem] text-[#5b748f]">
              <strong>Referencia esperada:</strong> {respuesta.claveTexto}
            </p>
          )}
        </div>
      )}

      {respuesta.comentarioRevisor && (
        <p className="mt-1 ml-7 rounded border-l-2 border-[#00b0d8] bg-[#f1f8fb] px-2 py-1 text-[0.74rem] italic">
          Comentario del revisor: {respuesta.comentarioRevisor}
        </p>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*                          La misma acta, en PDF                              */
/* -------------------------------------------------------------------------- */

/**
 * Acta en PDF.
 *
 * Se genera con el constructor propio (sin dependencias) y sigue el MISMO orden
 * que la hoja de pantalla: encabezado, participante, resultado, desarrollo con
 * cada opción marcada, y firmas. Que las dos salidas coincidan importa: el acta
 * que se archiva y la que se revisa en pantalla tienen que ser el mismo documento.
 */
export function construirActaPdf(paquete: PaqueteExportacion): Blob {
  const { identidad, resultado, intento, evaluacion } = paquete;
  const pdf = new ConstructorPdf();

  pdf.encabezado(
    `Acta individual de evaluación · ${evaluacion?.titulo ?? "Evaluación"}`,
    `BDP · Reclutamiento y Selección — ${evaluacion?.codigo ?? ""} · versión ${intento.versionEtiqueta || "—"}`,
  );
  pdf.pieDePagina(
    `${identidad.nombre || "participante"} · CI ${identidad.documento || "—"} · intento ${identidad.identificador}`,
  );

  pdf.banda("Participante");
  pdf.campo("Nombre completo", identidad.nombre || "—");
  pdf.campo("Documento de identidad (CI)", identidad.documento || "—");
  pdf.campo("Correo", identidad.correo || "—");
  pdf.campo("Número identificador del intento", identidad.identificador);
  for (const [clave, valor] of Object.entries(identidad.extra ?? {})) pdf.campo(clave, String(valor));

  pdf.banda("Resultado");
  pdf.campo("Nota", notaLegible(resultado.nota));
  pdf.campo("Puntos", `${resultado.puntosObtenidos ?? 0} de ${resultado.puntosPosibles ?? 0}`);
  pdf.campo(
    "Veredicto",
    resultado.aprobado === null ? "Sin criterio de aprobación" : resultado.aprobado ? "APROBADO" : "NO APROBADO",
  );
  pdf.campo(
    "Aciertos",
    `${resultado.correctas} correctas · ${resultado.incorrectas} incorrectas · ${resultado.sinResponder} sin responder`,
  );
  pdf.campo("Estado de calificación", CALIFICACION_LABEL[resultado.estadoCalificacion]);
  pdf.campo("Inicio", formatearFecha(intento.iniciadoEn));
  pdf.campo("Envío", formatearFecha(intento.enviadoEn) + (intento.envioAutomatico ? " (automático al expirar)" : ""));
  pdf.campo("Duración usada", formatearDuracion(intento.segundosUsados));
  pdf.campo("Riesgo de integridad", `${paquete.integridad.riesgo} / 100 · ${paquete.integridad.eventos} evento(s)`);

  pdf.banda("Desarrollo de la prueba");
  const preguntas = paquete.respuestas.filter((respuesta) => tipoSpec(respuesta.tipo)?.kind === "pregunta");
  preguntas.forEach((respuesta, indice) => {
    pdf.parrafo(`${indice + 1}. ${respuesta.enunciadoTexto || "(sin enunciado)"}`, {
      fuente: "negrita",
      tamano: 10,
    });
    if (respuesta.ayudaTexto) pdf.parrafo(respuesta.ayudaTexto, { tamano: 8.5, gris: 0.42, sangria: 14 });
    if (respuesta.opciones.length > 0) {
      respuesta.opciones.forEach((opcion, i) => {
        pdf.opcion(letra(i), opcion.texto, { elegida: opcion.elegida, correcta: opcion.correcta });
      });
    } else {
      pdf.parrafo(`Su respuesta: ${respuesta.valorTexto || "(sin responder)"}`, { tamano: 9, sangria: 14 });
      if (respuesta.claveTexto) {
        pdf.parrafo(`Referencia esperada: ${respuesta.claveTexto}`, { tamano: 8.5, gris: 0.4, sangria: 14 });
      }
    }
    const veredicto =
      respuesta.correcta === true ? "correcta" : respuesta.correcta === false ? "incorrecta" : "sin veredicto automático";
    pdf.parrafo(
      `Puntos: ${respuesta.puntosObtenidos ?? "pendiente"} de ${respuesta.puntosPosibles} · ${veredicto}` +
        (respuesta.segundosEnPregunta > 0 ? ` · ${formatearDuracion(respuesta.segundosEnPregunta)}` : ""),
      { tamano: 8.5, gris: 0.4, sangria: 14 },
    );
    if (respuesta.comentarioRevisor) {
      pdf.parrafo(`Comentario del revisor: ${respuesta.comentarioRevisor}`, {
        tamano: 8.5,
        gris: 0.3,
        sangria: 14,
      });
    }
    pdf.espacio();
  });

  if (paquete.cronologia.length > 0) {
    pdf.banda("Cronología del intento");
    for (const hito of paquete.cronologia) {
      // Los tipos de evento crudos («ventana_redimensionada») se leen mal en un
      // documento que se archiva: se convierten en algo que una persona entiende.
      const texto = hito.texto.includes("_") ? hito.texto.replace(/_/g, " ") : hito.texto;
      pdf.parrafo(`${formatearDuracion(hito.segundos)} — ${texto}`, { tamano: 8.5, gris: 0.35, sangria: 8 });
    }
  }

  pdf.banda("Firmas");
  pdf.espacio();
  pdf.espacio();
  // Monoespaciado: es la única forma de que los dos espacios de separación entre
  // las firmas sobrevivan al reparto de líneas.
  pdf.parrafo("______________________________     ______________________________", {
    tamano: 9,
    fuente: "mono",
  });
  pdf.parrafo("Analista responsable               Reclutamiento y Seleccion", {
    tamano: 8,
    fuente: "mono",
    gris: 0.4,
  });

  return pdf.construir();
}
