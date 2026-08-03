/**
 * Panel de importación.
 *
 * Un solo flujo: se suelta el archivo, se ve lo que se detectó, se corrige el
 * mapeo si hace falta y se crea el borrador. El asistente anterior tenía cinco
 * pasos y un mapeo manual obligatorio que además no funcionaba; aquí la detección
 * automática es el camino normal y el mapeo manual es el respaldo.
 *
 * Importante: importar NUNCA publica. Siempre crea un borrador para revisar.
 */

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "../../../design-system/liquid-glass/toast";
import { Field, Select } from "../../../design-system/liquid-glass/fields";
import { crearEvaluacion, guardarEvaluacion } from "../api/client";
import type { DocumentoEvaluacion } from "../domain/model";
import { richToPlain } from "../domain/richText";
import { tipoSpec } from "../domain/questionTypes";
import {
  convertirLineas,
  convertirTabla,
  detectarArchivo,
  detectarMapeo,
  type Deteccion,
  type ResultadoConversion,
} from "./parse";
import { BotonPrimario, BotonSecundario, GlassOverlay, Metrica, Pill } from "../ui/pieces";

const CAMPOS = [
  ["enunciado", "Enunciado de la pregunta"],
  ["tipo", "Tipo de pregunta"],
  ["seccion", "Sección"],
  ["puntos", "Puntos"],
  ["obligatoria", "¿Obligatoria?"],
  ["ayuda", "Texto de ayuda"],
  ["competencia", "Competencia"],
  ["correcta", "Respuesta correcta"],
  ["opcion1", "Opción 1"],
  ["opcion2", "Opción 2"],
  ["opcion3", "Opción 3"],
  ["opcion4", "Opción 4"],
  ["opcion5", "Opción 5"],
  ["opcion6", "Opción 6"],
] as const;

export function ImportPanel({
  actor,
  onClose,
  onCreado,
}: {
  actor: string;
  onClose: () => void;
  onCreado: (documento: DocumentoEvaluacion) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [deteccion, setDeteccion] = useState<Deteccion | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [leyendo, setLeyendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const procesar = useCallback(async (entrada: File) => {
    setLeyendo(true);
    setArchivo(entrada);
    const resultado = await detectarArchivo(entrada);
    setDeteccion(resultado);
    setMapeo(detectarMapeo(resultado.columnas));
    setLeyendo(false);
    if (resultado.aviso) toast.warning(resultado.aviso);
  }, []);

  const conversion: ResultadoConversion | null = deteccion
    ? deteccion.filas.length > 0
      ? convertirTabla(deteccion.filas, mapeo)
      : deteccion.lineas.length > 0
        ? convertirLineas(deteccion.lineas)
        : null
    : null;

  const crear = async () => {
    if (!conversion || conversion.preguntas === 0) return;
    setCreando(true);
    const creada = await crearEvaluacion(
      archivo?.name.replace(/\.[^.]+$/, "") || "Evaluación importada",
      "conocimientos",
      actor,
    );
    if (!creada.ok) {
      setCreando(false);
      toast.error(creada.error.message);
      return;
    }
    const guardada = await guardarEvaluacion(
      {
        evaluacion: {
          ...creada.value.evaluacion,
          descripcion: `Importada de ${archivo?.name ?? "un archivo"}.`,
        },
        secciones: conversion.secciones,
      },
      { revisionBase: creada.value.evaluacion.revision, actor },
    );
    setCreando(false);
    if (!guardada.ok) {
      toast.error(guardada.error.message);
      return;
    }
    toast.success(
      `Borrador creado con ${conversion.preguntas} pregunta(s). Revísalo antes de publicar.`,
    );
    onCreado(guardada.value);
  };

  return (
    <GlassOverlay abierto onClose={onClose} etiqueta="Importar evaluación" ancho="max-w-4xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink">Importar una evaluación</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Excel, CSV, Word o PDF. El archivo se procesa en este navegador y no se envía a ningún sitio.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!deteccion && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            const entrada = e.dataTransfer.files[0];
            if (entrada) void procesar(entrada);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300 ${
            arrastrando
              ? "border-cyan-400 bg-cyan-500/10"
              : "border-[color:var(--hairline)] hover:border-cyan-400/50 hover:bg-cyan-500/5"
          }`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-[#00b0d8]/20 to-[#005baa]/20 text-cyan-300 ring-1 ring-cyan-400/20">
            {leyendo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
          </span>
          <span className="text-sm font-bold text-ink">
            {leyendo ? "Leyendo el archivo…" : "Arrastra un archivo o haz clic para elegirlo"}
          </span>
          <span className="text-xs text-ink-faint">.xlsx · .csv · .tsv · .docx · .pdf</span>
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,.docx,.pdf"
            className="sr-only"
            onChange={(e) => {
              const entrada = e.target.files?.[0];
              if (entrada) void procesar(entrada);
            }}
          />
        </label>
      )}

      <AnimatePresence>
        {deteccion && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tono="info" punto={false}>
                {deteccion.formato === "xlsx" ? (
                  <FileSpreadsheet className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {archivo?.name}
              </Pill>
              {deteccion.filas.length > 0 && <Metrica etiqueta="Filas" valor={deteccion.filas.length} />}
              {deteccion.lineas.length > 0 && deteccion.filas.length === 0 && (
                <Metrica etiqueta="Líneas" valor={deteccion.lineas.length} />
              )}
              {conversion && <Metrica etiqueta="Preguntas detectadas" valor={conversion.preguntas} />}
              {conversion && <Metrica etiqueta="Secciones" valor={conversion.secciones.length} />}
              <BotonSecundario
                onClick={() => {
                  setDeteccion(null);
                  setArchivo(null);
                }}
              >
                Elegir otro archivo
              </BotonSecundario>
            </div>

            {deteccion.aviso && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {deteccion.aviso}
              </div>
            )}

            {deteccion.columnas.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Mapeo de columnas
                  <span className="ml-2 font-normal normal-case text-ink-faint">
                    detectado automáticamente; corrígelo si hace falta
                  </span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CAMPOS.map(([campo, etiqueta]) => (
                    <Field key={campo} label={etiqueta}>
                      <Select
                        value={mapeo[campo] ?? ""}
                        onChange={(e) => setMapeo((previo) => ({ ...previo, [campo]: e.target.value }))}
                        className="!py-1.5 !text-xs"
                      >
                        <option value="">— sin asignar —</option>
                        {deteccion.columnas.map((columna) => (
                          <option key={columna} value={columna}>
                            {columna}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {conversion && conversion.avisos.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                {conversion.avisos.slice(0, 8).map((aviso, i) => (
                  <li key={i}>· {aviso}</li>
                ))}
                {conversion.avisos.length > 8 && <li>… y {conversion.avisos.length - 8} más.</li>}
              </ul>
            )}

            {conversion && conversion.preguntas > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Vista previa de lo que se creará
                </p>
                <div className="max-h-64 overflow-y-auto rounded-2xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
                  {conversion.secciones.map((seccion) => (
                    <div key={seccion.id} className="mb-3">
                      <p className="text-xs font-black uppercase tracking-wide text-cyan-300">{seccion.titulo}</p>
                      <ol className="mt-1 flex flex-col gap-1">
                        {seccion.preguntas.slice(0, 12).map((pregunta, i) => (
                          <li key={pregunta.id} className="text-xs text-ink-soft">
                            <span className="font-semibold text-ink">{i + 1}.</span>{" "}
                            {richToPlain(pregunta.enunciado).slice(0, 120) || "(vacío)"}
                            <span className="ml-1 text-[0.65rem] text-ink-faint">
                              [{tipoSpec(pregunta.tipo)?.etiqueta ?? pregunta.tipo}
                              {pregunta.opciones.length > 0 ? ` · ${pregunta.opciones.length} opciones` : ""}
                              {pregunta.opciones.some((o) => o.correcta) ? " · con clave" : ""}]
                            </span>
                          </li>
                        ))}
                        {seccion.preguntas.length > 12 && (
                          <li className="text-xs text-ink-faint">… y {seccion.preguntas.length - 12} más.</li>
                        )}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--hairline)] pt-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                La importación nunca publica: crea un borrador para que lo revises.
              </p>
              <BotonPrimario onClick={() => void crear()} disabled={!conversion || conversion.preguntas === 0 || creando}>
                {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Crear borrador con {conversion?.preguntas ?? 0} pregunta(s)
              </BotonPrimario>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassOverlay>
  );
}
