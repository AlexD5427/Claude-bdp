/**
 * Panel de importación.
 *
 * ── Los tres pasos ───────────────────────────────────────────────────────────
 *  1. ORIGEN — se suelta el archivo (Word, PDF, Excel, CSV) o se pega el texto.
 *  2. REVISIÓN — se ve lo que se detectó, pregunta por pregunta, y se completa lo
 *     que el documento no decía: sobre todo la RESPUESTA CORRECTA.
 *  3. BORRADOR — se crea la evaluación y se abre el editor.
 *
 * El paso 2 es el que cambia respecto de la versión anterior, y es el que importa.
 * Antes se creaba el borrador a ciegas y el analista descubría en el editor que
 * faltaban cuarenta claves; el trabajo de marcarlas era el mismo que escribir la
 * prueba de cero. Ahora la revisión es una cuadrícula de letras: un clic por
 * pregunta, con el teclado si se prefiere, y el panel dice cuántas quedan.
 *
 * De los `.docx` del equipo la clave se detecta sola (subrayado o resaltado), así
 * que en el caso normal este paso es solo una confirmación.
 *
 * Importar NUNCA publica: siempre crea un borrador.
 */

import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  Highlighter,
  Loader2,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "../../../design-system/liquid-glass/toast";
import { Field, Select, TextArea, TextInput } from "../../../design-system/liquid-glass/fields";
import { crearEvaluacion, guardarEvaluacion } from "../api/client";
import type { DocumentoEvaluacion, Seccion } from "../domain/model";
import { richFromPlain, richToPlain } from "../domain/richText";
import { tipoSpec } from "../domain/questionTypes";
import { objetivoPuntaje, PUNTAJE_TOTAL_POR_OMISION, repartirPuntaje } from "../domain/puntaje";
import { contarContenido } from "../domain/factory";
import {
  convertirDocumento,
  convertirTabla,
  detectarArchivo,
  detectarMapeo,
  detectarTextoPegado,
  marcaImportacion,
  type Deteccion,
} from "./parse";
import type { InformePregunta, OrigenClave } from "./questionParser";
import { BarraCarga, BotonPrimario, BotonSecundario, GlassOverlay, Metrica, Pill } from "../ui/pieces";

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

const ETIQUETA_ORIGEN: Record<OrigenClave, { texto: string; tono: "exito" | "info" | "aviso" }> = {
  formato: { texto: "Clave leída del subrayado", tono: "exito" },
  marcador: { texto: "Clave leída del marcador", tono: "exito" },
  tabla: { texto: "Clave leída de la tabla final", tono: "info" },
  ninguna: { texto: "Falta marcar la correcta", tono: "aviso" },
};

function letra(indice: number): string {
  return String.fromCharCode(65 + (indice % 26));
}

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
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [informe, setInforme] = useState<InformePregunta[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [pegando, setPegando] = useState(false);
  const [textoPegado, setTextoPegado] = useState("");
  const [titulo, setTitulo] = useState("");

  const esTabla = (deteccion?.filas.length ?? 0) > 0;

  /** Analiza una detección y deja el resultado listo para revisar. */
  const analizar = useCallback((entrada: Deteccion, mapeoActual: Record<string, string>) => {
    if (entrada.filas.length > 0) {
      const resultado = convertirTabla(entrada.filas, mapeoActual);
      setSecciones(resultado.secciones);
      setInforme(
        resultado.secciones.flatMap((seccion) =>
          seccion.preguntas.map((pregunta) => ({
            preguntaId: pregunta.id,
            seccionId: seccion.id,
            numero: null,
            enunciado: richToPlain(pregunta.enunciado),
            opciones: pregunta.opciones.map((opcion) => richToPlain(opcion.texto)),
            correcta: pregunta.opciones.findIndex((opcion) => opcion.correcta),
            origenClave: pregunta.opciones.some((opcion) => opcion.correcta)
              ? ("tabla" as OrigenClave)
              : ("ninguna" as OrigenClave),
            tipo: pregunta.tipo,
            avisos: [],
          })),
        ),
      );
      setAvisos(resultado.avisos);
      return;
    }
    const resultado = convertirDocumento(entrada);
    setSecciones(resultado.secciones);
    setInforme(resultado.informe);
    setAvisos(resultado.avisos);
  }, []);

  const procesar = useCallback(
    async (entrada: File) => {
      setLeyendo(true);
      setArchivo(entrada);
      setTitulo(entrada.name.replace(/\.[^.]+$/, ""));
      const resultado = await detectarArchivo(entrada);
      const mapeoDetectado = detectarMapeo(resultado.columnas);
      setDeteccion(resultado);
      setMapeo(mapeoDetectado);
      analizar(resultado, mapeoDetectado);
      setLeyendo(false);
      if (resultado.aviso) toast.warning(resultado.aviso);
    },
    [analizar],
  );

  const procesarTexto = useCallback(() => {
    const resultado = detectarTextoPegado(textoPegado);
    setArchivo(null);
    setTitulo("Evaluación pegada");
    setDeteccion(resultado);
    setMapeo({});
    analizar(resultado, {});
    setPegando(false);
  }, [analizar, textoPegado]);

  /* ------------------------------- Ediciones ------------------------------- */

  const cambiarMapeo = (campo: string, columna: string) => {
    const siguiente = { ...mapeo, [campo]: columna };
    setMapeo(siguiente);
    if (deteccion) analizar(deteccion, siguiente);
  };

  const marcarCorrecta = (preguntaId: string, indice: number) => {
    setSecciones((previas) =>
      previas.map((seccion) => ({
        ...seccion,
        preguntas: seccion.preguntas.map((pregunta) =>
          pregunta.id === preguntaId
            ? {
                ...pregunta,
                opciones: pregunta.opciones.map((opcion, i) => ({ ...opcion, correcta: i === indice })),
              }
            : pregunta,
        ),
      })),
    );
    setInforme((previo) =>
      previo.map((entrada) =>
        entrada.preguntaId === preguntaId ? { ...entrada, correcta: indice, origenClave: "marcador" } : entrada,
      ),
    );
  };

  const editarEnunciado = (preguntaId: string, texto: string) => {
    setSecciones((previas) =>
      previas.map((seccion) => ({
        ...seccion,
        preguntas: seccion.preguntas.map((pregunta) =>
          pregunta.id === preguntaId ? { ...pregunta, enunciado: richFromPlain(texto) } : pregunta,
        ),
      })),
    );
    setInforme((previo) =>
      previo.map((entrada) => (entrada.preguntaId === preguntaId ? { ...entrada, enunciado: texto } : entrada)),
    );
  };

  const eliminarPregunta = (preguntaId: string) => {
    setSecciones((previas) =>
      previas
        .map((seccion) => ({
          ...seccion,
          preguntas: seccion.preguntas.filter((pregunta) => pregunta.id !== preguntaId),
        }))
        .filter((seccion) => seccion.preguntas.length > 0),
    );
    setInforme((previo) => previo.filter((entrada) => entrada.preguntaId !== preguntaId));
  };

  const marcarManual = (preguntaId: string) => {
    setSecciones((previas) =>
      previas.map((seccion) => ({
        ...seccion,
        preguntas: seccion.preguntas.map((pregunta) =>
          pregunta.id === preguntaId ? { ...pregunta, modoPuntaje: "manual" as const } : pregunta,
        ),
      })),
    );
    setInforme((previo) =>
      previo.map((entrada) => (entrada.preguntaId === preguntaId ? { ...entrada, origenClave: "marcador" } : entrada)),
    );
  };

  /* -------------------------------- Resumen -------------------------------- */

  const conteos = useMemo(() => contarContenido(secciones), [secciones]);
  const sinClave = useMemo(
    () =>
      informe.filter(
        (entrada) =>
          entrada.opciones.length > 0 &&
          entrada.correcta < 0 &&
          buscarPregunta(secciones, entrada.preguntaId)?.modoPuntaje !== "manual",
      ).length,
    [informe, secciones],
  );
  const total = informe.length;

  const crear = async () => {
    if (total === 0) return;
    setCreando(true);
    const creada = await crearEvaluacion(titulo || "Evaluación importada", "conocimientos", actor);
    if (!creada.ok) {
      setCreando(false);
      toast.error(creada.error.message);
      return;
    }
    // El puntaje se reparte al importar, con la misma regla que en el editor: la
    // prueba vale 100 puntos y cada pregunta recibe su parte.
    const objetivo = objetivoPuntaje(creada.value.evaluacion) ?? PUNTAJE_TOTAL_POR_OMISION;
    const guardada = await guardarEvaluacion(
      {
        evaluacion: {
          ...creada.value.evaluacion,
          titulo: titulo || creada.value.evaluacion.titulo,
          descripcion: archivo ? `Importada de ${archivo.name}.` : "Importada de un texto pegado.",
          extras: { ...creada.value.evaluacion.extras, ...marcaImportacion(archivo?.name ?? "texto pegado") },
        },
        secciones: repartirPuntaje(secciones, objetivo),
      },
      { revisionBase: creada.value.evaluacion.revision, actor },
    );
    setCreando(false);
    if (!guardada.ok) {
      toast.error(guardada.error.message);
      return;
    }
    toast.success(`Borrador creado con ${total} pregunta(s) y ${objetivo} puntos repartidos.`);
    onCreado(guardada.value);
  };

  /* --------------------------------- Render -------------------------------- */

  return (
    <GlassOverlay abierto onClose={onClose} etiqueta="Importar evaluación" ancho="max-w-5xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {deteccion && (
            <button
              type="button"
              onClick={() => {
                setDeteccion(null);
                setArchivo(null);
                setSecciones([]);
                setInforme([]);
                setAvisos([]);
              }}
              className="mt-0.5 grid h-9 w-9 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft"
              aria-label="Elegir otro origen"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h2 className="text-lg font-black text-ink">Importar una evaluación</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Word, PDF, Excel, CSV o texto pegado. Todo se procesa en este navegador: el archivo no se envía a
              ningún sitio.
            </p>
          </div>
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

      {/* Paso 1 · origen */}
      {!deteccion && !pegando && (
        <div className="flex flex-col gap-3">
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
            <motion.span
              animate={arrastrando ? { scale: 1.08, rotate: -3 } : { scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-[#00b0d8]/20 to-[#005baa]/20 text-accent ring-1 ring-cyan-400/20"
            >
              {leyendo ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            </motion.span>
            <span className="text-sm font-bold text-ink">
              {leyendo ? "Leyendo el archivo…" : "Arrastra un archivo o haz clic para elegirlo"}
            </span>
            <span className="text-xs text-ink-faint">.docx · .pdf · .xlsx · .csv · .tsv · .txt</span>
            {leyendo && <BarraCarga progreso={0.6} className="w-56" />}
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv,.tsv,.txt,.md,.docx,.pdf"
              className="sr-only"
              onChange={(e) => {
                const entrada = e.target.files?.[0];
                if (entrada) void procesar(entrada);
              }}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="tone-exito tone-ring flex items-start gap-2 rounded-2xl px-3 py-2.5 text-xs">
              <Highlighter className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Word es el mejor origen.</strong> Si en el documento la respuesta correcta va{" "}
                <u>subrayada</u> o resaltada, se detecta sola y no hay que marcar nada.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPegando(true)}
              className="flex items-start gap-2 rounded-2xl fill-softer px-3 py-2.5 text-left text-xs text-ink-soft ring-1 ring-[color:var(--hairline)] transition-colors hover:fill-soft hover:text-ink"
            >
              <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="text-ink">Pegar el texto</strong> · útil cuando la prueba llega en el cuerpo de un
                correo o en un chat.
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Paso 1b · pegar texto */}
      {!deteccion && pegando && (
        <div className="flex flex-col gap-3">
          <Field
            label="Pega aquí la prueba"
            hint="Una pregunta por número («1.», «2.»…) y las opciones con su letra («A)», «B)»…). Puedes marcar la correcta con un asterisco al final."
          >
            <TextArea
              rows={12}
              autoFocus
              value={textoPegado}
              onChange={(e) => setTextoPegado(e.target.value)}
              placeholder={"1. ¿Cuál es el principio del auditor interno?\nA) Rentabilidad.\nB) Independencia y objetividad. *\nC) Productividad."}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <BotonSecundario onClick={() => setPegando(false)}>Volver</BotonSecundario>
            <BotonPrimario onClick={procesarTexto} disabled={textoPegado.trim().length < 10}>
              <Sparkles className="h-4 w-4" /> Analizar el texto
            </BotonPrimario>
          </div>
        </div>
      )}

      {/* Paso 2 · revisión */}
      <AnimatePresence>
        {deteccion && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tono="info" punto={false}>
                {deteccion.formato === "xlsx" ? (
                  <FileSpreadsheet className="h-3 w-3" />
                ) : deteccion.formato === "csv" ? (
                  <Table2 className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                {archivo?.name ?? "texto pegado"}
              </Pill>
              <Metrica etiqueta="Preguntas" valor={total} />
              <Metrica etiqueta="Secciones" valor={secciones.length} />
              <Metrica etiqueta="Con clave" valor={total - sinClave} destacada tono="exito" />
              {sinClave > 0 && <Metrica etiqueta="Sin clave" valor={sinClave} destacada tono="aviso" />}
              <Metrica etiqueta="Puntos" valor={PUNTAJE_TOTAL_POR_OMISION} />
            </div>

            <Field label="Título de la evaluación">
              <TextInput value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Field>

            {deteccion.aviso && (
              <div className="tone-aviso tone-ring flex items-start gap-2 rounded-2xl px-4 py-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {deteccion.aviso}
              </div>
            )}

            {avisos.length > 0 && (
              <ul className="tone-aviso tone-ring flex flex-col gap-1 rounded-2xl p-3 text-xs">
                {avisos.slice(0, 6).map((aviso, i) => (
                  <li key={i}>· {aviso}</li>
                ))}
                {avisos.length > 6 && <li>… y {avisos.length - 6} más.</li>}
              </ul>
            )}

            {/* Mapeo de columnas: solo para orígenes tabulares. */}
            {esTabla && deteccion.columnas.length > 0 && (
              <details className="rounded-2xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Mapeo de columnas · detectado automáticamente
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CAMPOS.map(([campo, etiqueta]) => (
                    <Field key={campo} label={etiqueta}>
                      <Select
                        value={mapeo[campo] ?? ""}
                        onChange={(e) => cambiarMapeo(campo, e.target.value)}
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
              </details>
            )}

            {/* Revisión pregunta por pregunta */}
            {total > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                    Revisión · {total} pregunta(s)
                  </p>
                  {sinClave > 0 && (
                    <p className="tone-text-aviso text-xs font-semibold">
                      Faltan {sinClave} respuesta(s) correcta(s). Pulsa la letra de la correcta en cada pregunta.
                    </p>
                  )}
                </div>
                <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
                  {secciones.map((seccion) => (
                    <div key={seccion.id} className="flex flex-col gap-2">
                      <p className="text-accent sticky top-0 z-10 bg-[color:var(--glass-bg-heavy)] py-1 text-[0.7rem] font-black uppercase tracking-[0.16em] backdrop-blur">
                        {seccion.titulo}
                      </p>
                      {seccion.preguntas.map((pregunta, indice) => {
                        const entrada = informe.find((i) => i.preguntaId === pregunta.id);
                        const manual = pregunta.modoPuntaje === "manual";
                        const falta = pregunta.opciones.length > 0 && !pregunta.opciones.some((o) => o.correcta) && !manual;
                        const origen = entrada?.origenClave ?? "ninguna";
                        return (
                          <motion.div
                            key={pregunta.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            className={`rounded-2xl p-3 ring-1 ${
                              falta ? "tone-aviso tone-ring" : "fill-softer ring-[color:var(--hairline)]"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="mt-1.5 w-6 shrink-0 text-center text-[0.7rem] font-black tabular-nums text-ink-faint">
                                {indice + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <TextInput
                                  value={richToPlain(pregunta.enunciado)}
                                  onChange={(e) => editarEnunciado(pregunta.id, e.target.value)}
                                  className="!bg-transparent !px-0 !py-0 !text-sm !font-semibold !ring-0 focus-visible:!ring-0"
                                  aria-label={`Enunciado de la pregunta ${indice + 1}`}
                                />
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <Pill tono="neutral" punto={false}>
                                    {tipoSpec(pregunta.tipo)?.etiqueta ?? pregunta.tipo}
                                  </Pill>
                                  {pregunta.opciones.length > 0 && (
                                    <Pill tono={falta ? "aviso" : "exito"} punto={false}>
                                      {ETIQUETA_ORIGEN[falta ? "ninguna" : origen].texto}
                                    </Pill>
                                  )}
                                  {manual && (
                                    <Pill tono="info" punto={false}>
                                      La califica una persona
                                    </Pill>
                                  )}
                                  {(entrada?.avisos ?? []).map((aviso, i) => (
                                    <Pill key={i} tono="aviso" punto={false} title={aviso}>
                                      {aviso.length > 46 ? `${aviso.slice(0, 46)}…` : aviso}
                                    </Pill>
                                  ))}
                                </div>

                                {pregunta.opciones.length > 0 && (
                                  <ul className="mt-2 flex flex-col gap-1">
                                    {pregunta.opciones.map((opcion, i) => (
                                      <li key={opcion.id} className="flex items-start gap-2">
                                        <button
                                          type="button"
                                          onClick={() => marcarCorrecta(pregunta.id, i)}
                                          title={`Marcar ${letra(i)} como correcta`}
                                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-black transition-all ${
                                            opcion.correcta
                                              ? "bg-emerald-600 text-white ring-2 ring-emerald-400/60"
                                              : "fill-soft text-ink-faint ring-1 ring-[color:var(--hairline)] hover:ring-2 hover:ring-emerald-500/60"
                                          }`}
                                        >
                                          {letra(i)}
                                        </button>
                                        <span className={`min-w-0 flex-1 text-xs ${opcion.correcta ? "font-semibold text-ink" : "text-ink-soft"}`}>
                                          {richToPlain(opcion.texto)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => eliminarPregunta(pregunta.id)}
                                  title="Quitar esta pregunta de la importación"
                                  className="tone-text-peligro grid h-7 w-7 place-items-center rounded-lg transition-colors hover:fill-soft"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                {falta && (
                                  <button
                                    type="button"
                                    onClick={() => marcarManual(pregunta.id)}
                                    title="La calificará una persona, sin clave automática"
                                    className="inline-flex items-center gap-1 rounded-full bg-[color:var(--fill-2)] px-2 py-1 text-[0.62rem] font-bold text-ink-soft ring-1 ring-[color:var(--hairline)]"
                                  >
                                    <Wand2 className="h-3 w-3" /> Manual
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--hairline)] pt-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                <CheckCircle2 className="tone-text-exito h-3.5 w-3.5" />
                Importar nunca publica: crea un borrador con {conteos.preguntas} pregunta(s) para que lo revises.
              </p>
              <BotonPrimario onClick={() => void crear()} disabled={total === 0 || creando}>
                {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Crear borrador con {total} pregunta(s)
              </BotonPrimario>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassOverlay>
  );
}

function buscarPregunta(secciones: Seccion[], preguntaId: string) {
  for (const seccion of secciones) {
    const encontrada = seccion.preguntas.find((pregunta) => pregunta.id === preguntaId);
    if (encontrada) return encontrada;
  }
  return null;
}
