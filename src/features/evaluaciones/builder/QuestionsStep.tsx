/**
 * Paso 2 — preguntas y contenido.
 *
 * Tres columnas: índice navegable, lienzo y inspector. El índice existe porque una
 * evaluación de cuarenta preguntas en una lista plana es inmanejable —el editor
 * anterior no tenía ninguna forma de saltar a una pregunta concreta—.
 *
 * El lienzo muestra cada bloque con su editor de texto enriquecido y sus opciones;
 * el inspector, todo lo que no es contenido (puntaje, clave, validación, ayuda).
 */

import { useMemo, useRef, useState, type Dispatch } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as Iconos from "lucide-react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Field, NumberField, Select, Switch, TextArea, TextInput } from "../../../design-system/liquid-glass/fields";
import { RichTextEditor } from "../richtext/RichTextEditor";
import { RichText } from "../richtext/RichText";
import { richToPlain } from "../domain/richText";
import {
  esPregunta,
  MODO_PUNTAJE_LABEL,
  modosPuntajeDe,
  tipoSpec,
  tiposPorGrupo,
  type ModoPuntaje,
} from "../domain/questionTypes";
import type { Pregunta, Seccion } from "../domain/model";
import type { HallazgoRevision } from "../domain/validation";
import type { AccionConstructor, EstadoConstructor } from "../state/builderStore";
import { BotonSecundario, GlassPanel, Pill, SectionTitle } from "../ui/pieces";

/** Icono de `lucide-react` por nombre, con respaldo. */
function Icono({ nombre, className = "h-4 w-4" }: { nombre: string; className?: string }) {
  const Componente = (Iconos as unknown as Record<string, typeof AlertCircle>)[nombre] ?? Iconos.Circle;
  return <Componente className={className} />;
}

export function QuestionsStep({
  estado,
  despachar,
  editable,
  hallazgos,
}: {
  estado: EstadoConstructor;
  despachar: Dispatch<AccionConstructor>;
  editable: boolean;
  hallazgos: HallazgoRevision[];
}) {
  const contenido = estado.actual;
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [busquedaIndice, setBusquedaIndice] = useState("");
  const seleccion = estado.seleccion;
  const seccionActiva = contenido.secciones.find((s) => s.id === seleccion?.seccionId) ?? contenido.secciones[0];
  const preguntaActiva = seccionActiva?.preguntas.find((p) => p.id === seleccion?.preguntaId) ?? null;

  const erroresPorPregunta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const hallazgo of hallazgos) {
      if (hallazgo.severidad !== "error" || !hallazgo.preguntaId) continue;
      mapa.set(hallazgo.preguntaId, (mapa.get(hallazgo.preguntaId) ?? 0) + 1);
    }
    return mapa;
  }, [hallazgos]);

  return (
    <div className="grid gap-3 xl:grid-cols-[16rem_minmax(0,1fr)_20rem]">
      {/* Índice */}
      <GlassPanel padding="p-3" className="h-fit xl:sticky xl:top-20">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-ink">Índice</h3>
          {editable && (
            <button
              type="button"
              onClick={() => despachar({ tipo: "agregarSeccion" })}
              className="grid h-6 w-6 place-items-center rounded-full fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)] hover:fill-soft hover:text-ink"
              title="Agregar sección"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={busquedaIndice}
            onChange={(e) => setBusquedaIndice(e.target.value)}
            placeholder="Buscar pregunta…"
            aria-label="Buscar en el índice"
            className="w-full rounded-xl fill-soft py-1.5 pl-8 pr-2 text-xs text-ink outline-none ring-1 ring-[color:var(--hairline)] placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
        </div>
        <ol className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
          {contenido.secciones.map((seccion, indiceSeccion) => {
            const coincidencias = seccion.preguntas.filter((pregunta) =>
              busquedaIndice
                ? richToPlain(pregunta.enunciado).toLowerCase().includes(busquedaIndice.toLowerCase())
                : true,
            );
            if (busquedaIndice && coincidencias.length === 0) return null;
            return (
              <li key={seccion.id}>
                <button
                  type="button"
                  onClick={() => despachar({ tipo: "seleccionar", seccionId: seccion.id, preguntaId: null })}
                  className={`mb-1 w-full truncate rounded-xl px-2 py-1.5 text-left text-xs font-bold transition-colors ${
                    seccionActiva?.id === seccion.id && !seleccion?.preguntaId
                      ? "bg-cyan-500/20 text-cyan-100"
                      : "text-ink-soft hover:fill-soft hover:text-ink"
                  }`}
                >
                  {indiceSeccion + 1}. {seccion.titulo}
                </button>
                <ol className="ml-2 flex flex-col gap-0.5 border-l border-[color:var(--hairline)] pl-2">
                  {coincidencias.map((pregunta) => {
                    const errores = erroresPorPregunta.get(pregunta.id) ?? 0;
                    const activa = seleccion?.preguntaId === pregunta.id;
                    const texto = richToPlain(pregunta.enunciado).trim();
                    return (
                      <li key={pregunta.id}>
                        <button
                          type="button"
                          onClick={() =>
                            despachar({ tipo: "seleccionar", seccionId: seccion.id, preguntaId: pregunta.id })
                          }
                          className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[0.7rem] transition-colors ${
                            activa ? "bg-cyan-500/15 text-cyan-100" : "text-ink-soft hover:fill-soft hover:text-ink"
                          }`}
                        >
                          <Icono nombre={tipoSpec(pregunta.tipo)?.icono ?? "Circle"} className="h-3 w-3 shrink-0 opacity-70" />
                          <span className="min-w-0 flex-1 truncate">
                            {texto || <em className="opacity-60">sin enunciado</em>}
                          </span>
                          {errores > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ol>
      </GlassPanel>

      {/* Lienzo */}
      <div className="flex flex-col gap-3">
        {seccionActiva && (
          <GlassPanel padding="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <TextInput
                  value={seccionActiva.titulo}
                  disabled={!editable}
                  onChange={(e) =>
                    despachar({ tipo: "editarSeccion", seccionId: seccionActiva.id, cambios: { titulo: e.target.value } })
                  }
                  className="!bg-transparent !px-0 !py-0 !text-base !font-black !ring-0 focus-visible:!ring-0"
                  aria-label="Título de la sección"
                />
                <p className="text-[0.7rem] text-ink-faint">
                  {seccionActiva.preguntas.length} bloque(s) ·{" "}
                  {seccionActiva.preguntas.filter((p) => esPregunta(p.tipo)).length} pregunta(s)
                </p>
              </div>
              {editable && (
                <div className="flex items-center gap-1">
                  <BotonSecundario
                    onClick={() => despachar({ tipo: "moverSeccion", seccionId: seccionActiva.id, delta: -1 })}
                    title="Subir sección"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </BotonSecundario>
                  <BotonSecundario
                    onClick={() => despachar({ tipo: "moverSeccion", seccionId: seccionActiva.id, delta: 1 })}
                    title="Bajar sección"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </BotonSecundario>
                  <BotonSecundario
                    onClick={() => despachar({ tipo: "duplicarSeccion", seccionId: seccionActiva.id })}
                    title="Duplicar sección"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </BotonSecundario>
                  <BotonSecundario
                    onClick={() => despachar({ tipo: "eliminarSeccion", seccionId: seccionActiva.id })}
                    title="Eliminar sección"
                    disabled={contenido.secciones.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </BotonSecundario>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Límite de la sección (segundos)" hint="Vacío = sin límite propio.">
                <NumberField
                  min={0}
                  value={seccionActiva.limiteSegundos}
                  disabled={!editable}
                  onChange={(valor) =>
                    despachar({ tipo: "editarSeccion", seccionId: seccionActiva.id, cambios: { limiteSegundos: valor } })
                  }
                />
              </Field>
              <Field label="Servir solo N preguntas" hint="Banco de preguntas: cada candidato recibe un subconjunto estable.">
                <NumberField
                  min={1}
                  value={seccionActiva.tomarN}
                  disabled={!editable}
                  onChange={(valor) =>
                    despachar({ tipo: "editarSeccion", seccionId: seccionActiva.id, cambios: { tomarN: valor } })
                  }
                />
              </Field>
              <div className="flex items-end">
                <Switch
                  checked={seccionActiva.mezclar}
                  onChange={(v) =>
                    despachar({ tipo: "editarSeccion", seccionId: seccionActiva.id, cambios: { mezclar: v } })
                  }
                  label="Mezclar esta sección"
                />
              </div>
            </div>
          </GlassPanel>
        )}

        {seccionActiva?.preguntas.length === 0 ? (
          <GlassPanel className="border border-dashed border-[color:var(--hairline)] text-center">
            <p className="text-sm text-ink-soft">Esta sección está vacía.</p>
            {editable && (
              <BotonSecundario onClick={() => setPaletaAbierta(true)} className="mt-3">
                <Plus className="h-4 w-4" /> Agregar el primer bloque
              </BotonSecundario>
            )}
          </GlassPanel>
        ) : (
          <ol className="flex flex-col gap-3">
            {seccionActiva?.preguntas.map((pregunta, indice) => (
              <BloqueEditor
                key={pregunta.id}
                pregunta={pregunta}
                indice={indice}
                total={seccionActiva.preguntas.length}
                seleccionada={seleccion?.preguntaId === pregunta.id}
                editable={editable}
                errores={erroresPorPregunta.get(pregunta.id) ?? 0}
                numerar={contenido.evaluacion.tema.mostrarNumeracion}
                despachar={despachar}
                onSeleccionar={() =>
                  despachar({ tipo: "seleccionar", seccionId: seccionActiva.id, preguntaId: pregunta.id })
                }
                secciones={contenido.secciones}
              />
            ))}
          </ol>
        )}

        {editable && seccionActiva && (
          <button
            type="button"
            onClick={() => setPaletaAbierta(true)}
            className="group flex items-center justify-center gap-2 rounded-3xl border border-dashed border-[color:var(--hairline)] py-4 text-sm font-bold text-ink-soft transition-all duration-300 hover:border-cyan-400/50 hover:bg-cyan-500/5 hover:text-cyan-200"
          >
            <Plus className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
            Agregar bloque
          </button>
        )}
      </div>

      {/* Inspector */}
      <div className="h-fit xl:sticky xl:top-20">
        {preguntaActiva ? (
          <Inspector pregunta={preguntaActiva} editable={editable} despachar={despachar} />
        ) : (
          <GlassPanel padding="p-4">
            <p className="text-xs text-ink-soft">
              Selecciona un bloque en el lienzo para editar su puntaje, su clave de respuesta y sus reglas.
            </p>
          </GlassPanel>
        )}
      </div>

      {/* Paleta de tipos */}
      <AnimatePresence>
        {paletaAbierta && seccionActiva && (
          <Paleta
            onClose={() => setPaletaAbierta(false)}
            onElegir={(tipo) => {
              despachar({
                tipo: "agregarPregunta",
                seccionId: seccionActiva.id,
                tipoPregunta: tipo,
                despuesDe: seleccion?.preguntaId ?? undefined,
              });
              setPaletaAbierta(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ Bloque del lienzo ------------------------- */

function BloqueEditor({
  pregunta,
  indice,
  total,
  seleccionada,
  editable,
  errores,
  numerar,
  despachar,
  onSeleccionar,
  secciones,
}: {
  pregunta: Pregunta;
  indice: number;
  total: number;
  seleccionada: boolean;
  editable: boolean;
  errores: number;
  numerar: boolean;
  despachar: Dispatch<AccionConstructor>;
  onSeleccionar: () => void;
  secciones: Seccion[];
}) {
  const spec = tipoSpec(pregunta.tipo);
  const contenidoPuro = spec?.kind === "contenido";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSeleccionar}
      className={`glass relative rounded-3xl p-4 transition-all duration-300 ${
        seleccionada ? "ring-2 ring-cyan-400/60" : errores > 0 ? "ring-1 ring-rose-400/40" : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-xl fill-softer text-ink-soft ring-1 ring-[color:var(--hairline)]">
            <Icono nombre={spec?.icono ?? "Circle"} className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-bold text-ink">
            {numerar && !contenidoPuro ? `${indice + 1}. ` : ""}
            {spec?.etiqueta ?? pregunta.tipo}
          </span>
          {pregunta.obligatoria && (
            <Pill tono="peligro" punto={false}>
              Obligatoria
            </Pill>
          )}
          {!contenidoPuro && pregunta.modoPuntaje !== "ninguno" && (
            <Pill tono="acento" punto={false}>
              {pregunta.puntos} pt{pregunta.puntos === 1 ? "" : "s"}
            </Pill>
          )}
          {errores > 0 && (
            <Pill tono="peligro">
              <AlertCircle className="h-3 w-3" /> {errores}
            </Pill>
          )}
        </div>
        {editable && (
          <div className="flex items-center gap-0.5">
            <IconoBoton
              onClick={() => despachar({ tipo: "moverPregunta", preguntaId: pregunta.id, delta: -1 })}
              disabled={indice === 0}
              titulo="Subir"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </IconoBoton>
            <IconoBoton
              onClick={() => despachar({ tipo: "moverPregunta", preguntaId: pregunta.id, delta: 1 })}
              disabled={indice === total - 1}
              titulo="Bajar"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </IconoBoton>
            <IconoBoton
              onClick={() => despachar({ tipo: "duplicarPregunta", preguntaId: pregunta.id })}
              titulo="Duplicar"
            >
              <Copy className="h-3.5 w-3.5" />
            </IconoBoton>
            {secciones.length > 1 && (
              <select
                value=""
                onChange={(e) =>
                  e.target.value &&
                  despachar({ tipo: "moverPreguntaASeccion", preguntaId: pregunta.id, seccionId: e.target.value })
                }
                aria-label="Mover a otra sección"
                title="Mover a otra sección"
                className="rounded-lg fill-softer px-1.5 py-1 text-[0.65rem] text-ink-soft ring-1 ring-[color:var(--hairline)]"
              >
                <option value="">Mover a…</option>
                {secciones
                  .filter((s) => s.id !== pregunta.seccionId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.titulo}
                    </option>
                  ))}
              </select>
            )}
            <IconoBoton
              onClick={() => despachar({ tipo: "eliminarPregunta", preguntaId: pregunta.id })}
              titulo="Eliminar"
              destructivo
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconoBoton>
          </div>
        )}
      </div>

      {pregunta.tipo === "contenido_separador" ? (
        <div className="my-2 h-px bg-[color:var(--hairline)]" />
      ) : (
        <RichTextEditor
          valor={pregunta.enunciado}
          onChange={(doc) => despachar({ tipo: "editarPregunta", preguntaId: pregunta.id, cambios: { enunciado: doc } })}
          marcador={contenidoPuro ? "Escribe el contenido…" : "Escribe el enunciado…"}
          sinVistaPrevia
          filasMinimas={contenidoPuro ? 3 : 2}
        />
      )}

      {spec?.options !== "ninguna" && spec?.kind === "pregunta" && (
        <EditorOpciones pregunta={pregunta} editable={editable} despachar={despachar} />
      )}

      {pregunta.tipo === "rellenar_huecos" && (
        <EditorHuecos pregunta={pregunta} editable={editable} despachar={despachar} />
      )}
    </motion.li>
  );
}

function IconoBoton({
  children,
  onClick,
  titulo,
  disabled,
  destructivo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  titulo: string;
  disabled?: boolean;
  destructivo?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-7 w-7 place-items-center rounded-lg transition-colors disabled:opacity-30 ${
        destructivo ? "text-rose-300 hover:bg-rose-500/15" : "text-ink-soft hover:fill-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Editor de opciones ------------------------ */

function EditorOpciones({
  pregunta,
  editable,
  despachar,
}: {
  pregunta: Pregunta;
  editable: boolean;
  despachar: Dispatch<AccionConstructor>;
}) {
  const spec = tipoSpec(pregunta.tipo);
  const esMatriz = spec?.expects === "matriz";
  const conClave = spec?.expects === "emparejamiento" || spec?.expects === "clasificacion" || esMatriz;
  const unica = spec?.expects === "opcion";
  const conCorrectas = spec?.expects === "opcion" || spec?.expects === "opciones";
  const columnas = (pregunta.configuracion.columnasMatriz as string[] | undefined) ?? [];
  const grupos = (pregunta.configuracion.grupos as string[] | undefined) ?? [];

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-2xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.68rem] font-bold uppercase tracking-wide text-ink-faint">
          {esMatriz ? "Filas de la cuadrícula" : spec?.expects === "orden" ? "Elementos a ordenar" : "Opciones"}
        </span>
        {conCorrectas && (
          <span className="text-[0.65rem] text-ink-faint">
            {unica ? "Marca la única correcta" : "Marca todas las correctas"}
          </span>
        )}
      </div>

      {esMatriz && (
        <Field label="Columnas" hint="Separadas por coma. Son las respuestas posibles de cada fila.">
          <TextInput
            value={columnas.join(", ")}
            disabled={!editable}
            onChange={(e) =>
              despachar({
                tipo: "editarPregunta",
                preguntaId: pregunta.id,
                cambios: {
                  configuracion: {
                    ...pregunta.configuracion,
                    columnasMatriz: e.target.value.split(",").map((c) => c.trim()).filter(Boolean),
                  },
                },
              })
            }
            placeholder="Bajo, Medio, Alto"
          />
        </Field>
      )}

      {spec?.expects === "clasificacion" && (
        <Field label="Grupos" hint="Separados por coma. El candidato arrastra cada elemento a un grupo.">
          <TextInput
            value={grupos.join(", ")}
            disabled={!editable}
            onChange={(e) =>
              despachar({
                tipo: "editarPregunta",
                preguntaId: pregunta.id,
                cambios: {
                  configuracion: {
                    ...pregunta.configuracion,
                    grupos: e.target.value.split(",").map((c) => c.trim()).filter(Boolean),
                  },
                },
              })
            }
            placeholder="Activo, Pasivo"
          />
        </Field>
      )}

      <ol className="flex flex-col gap-1.5">
        {pregunta.opciones.map((opcion, indice) => (
          <li key={opcion.id} className="flex items-start gap-2">
            {conCorrectas && (
              <button
                type="button"
                disabled={!editable}
                onClick={() =>
                  despachar({
                    tipo: "marcarCorrecta",
                    preguntaId: pregunta.id,
                    opcionId: opcion.id,
                    correcta: !opcion.correcta,
                  })
                }
                aria-label={opcion.correcta ? "Quitar como correcta" : "Marcar como correcta"}
                aria-pressed={opcion.correcta}
                title={unica ? "Solo una puede ser correcta" : "Marcar como correcta"}
                className={`mt-2 grid h-5 w-5 shrink-0 place-items-center transition-all duration-200 ${
                  unica ? "rounded-full" : "rounded-md"
                } ${
                  opcion.correcta
                    ? "bg-emerald-500 text-white ring-2 ring-emerald-300/50"
                    : "fill-soft text-transparent ring-1 ring-[color:var(--hairline)] hover:ring-emerald-400/50"
                }`}
              >
                <Iconos.Check className="h-3 w-3" />
              </button>
            )}
            {!conCorrectas && <GripVertical className="mt-2 h-4 w-4 shrink-0 text-ink-faint" />}

            <div className="min-w-0 flex-1">
              <RichTextEditor
                valor={opcion.texto}
                onChange={(doc) =>
                  despachar({ tipo: "editarOpcion", preguntaId: pregunta.id, opcionId: opcion.id, cambios: { texto: doc } })
                }
                unaLinea
                sinVistaPrevia
                marcador={`${esMatriz ? "Fila" : "Opción"} ${indice + 1}`}
                filasMinimas={1}
              />
              {conClave && (
                <div className="mt-1">
                  {esMatriz && columnas.length > 0 ? (
                    <Select
                      value={opcion.claveEmparejamiento}
                      disabled={!editable}
                      onChange={(e) =>
                        despachar({
                          tipo: "editarOpcion",
                          preguntaId: pregunta.id,
                          opcionId: opcion.id,
                          cambios: { claveEmparejamiento: e.target.value },
                        })
                      }
                      className="!py-1.5 !text-xs"
                    >
                      <option value="">Sin clave (no se califica esta fila)</option>
                      {columnas.map((columna) => (
                        <option key={columna} value={columna}>
                          Correcta: {columna}
                        </option>
                      ))}
                      {spec?.multiple && columnas.length > 1 && (
                        <option value={columnas.join(",")}>Correctas: todas</option>
                      )}
                    </Select>
                  ) : (
                    <TextInput
                      value={opcion.claveEmparejamiento}
                      disabled={!editable}
                      onChange={(e) =>
                        despachar({
                          tipo: "editarOpcion",
                          preguntaId: pregunta.id,
                          opcionId: opcion.id,
                          cambios: { claveEmparejamiento: e.target.value },
                        })
                      }
                      placeholder={
                        spec?.expects === "clasificacion" ? "Grupo correcto" : "Pareja correcta"
                      }
                      className="!py-1.5 !text-xs"
                    />
                  )}
                </div>
              )}
              {pregunta.modoPuntaje === "por_opcion" && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[0.65rem] text-ink-faint">Puntos</span>
                  <NumberField
                    value={opcion.puntos}
                    disabled={!editable}
                    onChange={(valor) =>
                      despachar({
                        tipo: "editarOpcion",
                        preguntaId: pregunta.id,
                        opcionId: opcion.id,
                        cambios: { puntos: valor ?? 0 },
                      })
                    }
                    className="!w-20 !py-1 !text-xs"
                  />
                </div>
              )}
              {pregunta.tipo === "opcion_imagen" && (
                <TextInput
                  value={opcion.imagenUrl}
                  disabled={!editable}
                  onChange={(e) =>
                    despachar({
                      tipo: "editarOpcion",
                      preguntaId: pregunta.id,
                      opcionId: opcion.id,
                      cambios: { imagenUrl: e.target.value },
                    })
                  }
                  placeholder="URL de la imagen"
                  className="mt-1 !py-1.5 !text-xs"
                />
              )}
            </div>

            {editable && (
              <div className="mt-1 flex shrink-0 flex-col gap-0.5">
                <IconoBoton
                  onClick={() =>
                    despachar({ tipo: "moverOpcion", preguntaId: pregunta.id, opcionId: opcion.id, delta: -1 })
                  }
                  disabled={indice === 0}
                  titulo="Subir opción"
                >
                  <ChevronUp className="h-3 w-3" />
                </IconoBoton>
                <IconoBoton
                  onClick={() => despachar({ tipo: "eliminarOpcion", preguntaId: pregunta.id, opcionId: opcion.id })}
                  titulo="Eliminar opción"
                  destructivo
                >
                  <X className="h-3 w-3" />
                </IconoBoton>
              </div>
            )}
          </li>
        ))}
      </ol>

      {editable && (
        <button
          type="button"
          onClick={() => despachar({ tipo: "agregarOpcion", preguntaId: pregunta.id })}
          className="self-start text-xs font-bold text-cyan-300 underline decoration-dotted hover:text-cyan-200"
        >
          + Agregar {esMatriz ? "fila" : "opción"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Rellenar huecos --------------------------- */

function EditorHuecos({
  pregunta,
  editable,
  despachar,
}: {
  pregunta: Pregunta;
  editable: boolean;
  despachar: Dispatch<AccionConstructor>;
}) {
  const huecos = pregunta.respuestaEsperada?.huecos ?? [];
  const actualizar = (siguientes: typeof huecos) =>
    despachar({
      tipo: "editarPregunta",
      preguntaId: pregunta.id,
      cambios: { respuestaEsperada: { ...(pregunta.respuestaEsperada ?? {}), huecos: siguientes } },
    });

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-2xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-ink-faint">Huecos y respuestas válidas</p>
      <p className="text-[0.7rem] text-ink-faint">
        Escribe <code className="rounded bg-[color:var(--fill-2)] px-1">___</code> en el enunciado por cada hueco y
        define aquí sus respuestas equivalentes.
      </p>
      <ol className="flex flex-col gap-1.5">
        {huecos.map((hueco, indice) => (
          <li key={hueco.clave || indice} className="flex items-start gap-2">
            <span className="mt-2 w-6 shrink-0 text-center text-xs font-black text-ink-soft">{indice + 1}</span>
            <TextInput
              value={hueco.respuestas.join(" / ")}
              disabled={!editable}
              onChange={(e) =>
                actualizar(
                  huecos.map((h, i) =>
                    i === indice
                      ? { ...h, respuestas: e.target.value.split("/").map((r) => r.trim()).filter(Boolean) }
                      : h,
                  ),
                )
              }
              placeholder="respuesta / alternativa equivalente"
              className="!py-1.5 !text-xs"
            />
            {editable && (
              <IconoBoton
                onClick={() => actualizar(huecos.filter((_, i) => i !== indice))}
                titulo="Eliminar hueco"
                destructivo
              >
                <X className="h-3 w-3" />
              </IconoBoton>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <button
          type="button"
          onClick={() =>
            actualizar([
              ...huecos,
              { clave: `h${huecos.length + 1}`, respuestas: [], ignorarMayusculas: true, ignorarAcentos: true },
            ])
          }
          className="self-start text-xs font-bold text-cyan-300 underline decoration-dotted hover:text-cyan-200"
        >
          + Agregar hueco
        </button>
      )}
    </div>
  );
}

/* --------------------------------- Inspector ------------------------------ */

function Inspector({
  pregunta,
  editable,
  despachar,
}: {
  pregunta: Pregunta;
  editable: boolean;
  despachar: Dispatch<AccionConstructor>;
}) {
  const spec = tipoSpec(pregunta.tipo);
  const modos = modosPuntajeDe(pregunta.tipo);
  const editar = (cambios: Partial<Pregunta>) => despachar({ tipo: "editarPregunta", preguntaId: pregunta.id, cambios });
  const sinOpciones = spec?.options === "ninguna";
  const esperado = pregunta.respuestaEsperada ?? {};

  return (
    <GlassPanel padding="p-4">
      <SectionTitle titulo={spec?.etiqueta ?? pregunta.tipo} descripcion={spec?.descripcion} />
      <div className="flex flex-col gap-3">
        {spec?.kind === "pregunta" && (
          <>
            <Switch
              checked={pregunta.obligatoria}
              onChange={(v) => editar({ obligatoria: v })}
              label="Respuesta obligatoria"
            />
            <Field label="Modo de puntaje">
              <Select
                value={pregunta.modoPuntaje}
                disabled={!editable}
                onChange={(e) => editar({ modoPuntaje: e.target.value as ModoPuntaje })}
              >
                {modos.map((modo) => (
                  <option key={modo} value={modo}>
                    {MODO_PUNTAJE_LABEL[modo]}
                  </option>
                ))}
              </Select>
            </Field>
            {pregunta.modoPuntaje !== "ninguno" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Puntos">
                  <NumberField
                    min={0}
                    step={0.5}
                    value={pregunta.puntos}
                    disabled={!editable}
                    onChange={(valor) => editar({ puntos: valor ?? 0 })}
                  />
                </Field>
                <Field label="Penalización" hint="Resta si falla.">
                  <NumberField
                    min={0}
                    step={0.5}
                    value={pregunta.penalizacion}
                    disabled={!editable}
                    onChange={(valor) => editar({ penalizacion: valor ?? 0 })}
                  />
                </Field>
              </div>
            )}

            {/* Clave para tipos sin opciones */}
            {sinOpciones && pregunta.modoPuntaje !== "ninguno" && pregunta.modoPuntaje !== "manual" && spec.auto && (
              <div className="flex flex-col gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-3">
                <span className="text-[0.68rem] font-bold uppercase tracking-wide text-emerald-300">
                  Respuesta correcta
                </span>
                {spec.expects === "numero" || spec.expects === "escala" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Valor">
                      <NumberField
                        value={typeof esperado.valor === "number" ? esperado.valor : null}
                        disabled={!editable}
                        onChange={(valor) =>
                          editar({ respuestaEsperada: { ...esperado, valor: valor ?? undefined } })
                        }
                      />
                    </Field>
                    <Field label="Tolerancia" hint="± admitido.">
                      <NumberField
                        min={0}
                        step={0.01}
                        value={esperado.tolerancia ?? 0}
                        disabled={!editable}
                        onChange={(valor) => editar({ respuestaEsperada: { ...esperado, tolerancia: valor ?? 0 } })}
                      />
                    </Field>
                  </div>
                ) : (
                  <>
                    <TextInput
                      value={typeof esperado.valor === "string" ? esperado.valor : ""}
                      disabled={!editable}
                      onChange={(e) => editar({ respuestaEsperada: { ...esperado, valor: e.target.value } })}
                      placeholder="Respuesta esperada"
                    />
                    <TextArea
                      rows={2}
                      value={(esperado.alternativas ?? []).join("\n")}
                      disabled={!editable}
                      onChange={(e) =>
                        editar({
                          respuestaEsperada: {
                            ...esperado,
                            alternativas: e.target.value.split("\n").map((a) => a.trim()).filter(Boolean),
                          },
                        })
                      }
                      placeholder="Alternativas equivalentes, una por línea"
                    />
                    <div className="flex flex-col gap-1.5">
                      <Switch
                        checked={esperado.ignorarMayusculas !== false}
                        onChange={(v) => editar({ respuestaEsperada: { ...esperado, ignorarMayusculas: v } })}
                        label="Ignorar mayúsculas"
                      />
                      <Switch
                        checked={esperado.ignorarAcentos !== false}
                        onChange={(v) => editar({ respuestaEsperada: { ...esperado, ignorarAcentos: v } })}
                        label="Ignorar acentos"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <RichTextEditor
          etiqueta="Texto de ayuda"
          valor={pregunta.ayuda}
          onChange={(doc) => editar({ ayuda: doc })}
          marcador="Aclaración que se muestra bajo el enunciado"
          sinVistaPrevia
          filasMinimas={2}
        />

        {/* Configuración por tipo */}
        <ConfiguracionPorTipo pregunta={pregunta} editable={editable} onCambio={(cfg) => editar({ configuracion: cfg })} />

        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-ink-soft">
            Retroalimentación y metadatos
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <Field label="Si acierta">
              <TextArea
                rows={2}
                value={pregunta.retroalimentacion.correcta ?? ""}
                disabled={!editable}
                onChange={(e) =>
                  editar({ retroalimentacion: { ...pregunta.retroalimentacion, correcta: e.target.value } })
                }
              />
            </Field>
            <Field label="Si falla">
              <TextArea
                rows={2}
                value={pregunta.retroalimentacion.incorrecta ?? ""}
                disabled={!editable}
                onChange={(e) =>
                  editar({ retroalimentacion: { ...pregunta.retroalimentacion, incorrecta: e.target.value } })
                }
              />
            </Field>
            <Field label="Competencia evaluada" hint="Para agrupar resultados por competencia.">
              <TextInput
                value={pregunta.competencia}
                disabled={!editable}
                onChange={(e) => editar({ competencia: e.target.value })}
              />
            </Field>
            <Field label="Código interno">
              <TextInput
                value={pregunta.codigo}
                disabled={!editable}
                onChange={(e) => editar({ codigo: e.target.value })}
              />
            </Field>
            <Field label="Etiqueta para lectores de pantalla">
              <TextInput
                value={pregunta.accesibilidad.etiquetaAria ?? ""}
                disabled={!editable}
                onChange={(e) => editar({ accesibilidad: { ...pregunta.accesibilidad, etiquetaAria: e.target.value } })}
              />
            </Field>
          </div>
        </details>
      </div>
    </GlassPanel>
  );
}

/** Campos de configuración específicos del tipo. */
function ConfiguracionPorTipo({
  pregunta,
  editable,
  onCambio,
}: {
  pregunta: Pregunta;
  editable: boolean;
  onCambio: (configuracion: Record<string, unknown>) => void;
}) {
  const spec = tipoSpec(pregunta.tipo);
  const cfg = pregunta.configuracion;
  const set = (clave: string, valor: unknown) => onCambio({ ...cfg, [clave]: valor });

  if (!spec) return null;

  if (spec.expects === "texto") {
    return (
      <div className="grid gap-2">
        <Field label="Texto de marcador">
          <TextInput
            value={String(cfg.marcador ?? "")}
            disabled={!editable}
            onChange={(e) => set("marcador", e.target.value)}
          />
        </Field>
        {pregunta.tipo === "texto_largo" && (
          <Field label="Líneas visibles">
            <NumberField
              min={2}
              max={30}
              value={Number(cfg.lineas ?? 5)}
              disabled={!editable}
              onChange={(valor) => set("lineas", valor ?? 5)}
            />
          </Field>
        )}
        {pregunta.tipo === "codigo" && (
          <Field label="Lenguaje">
            <TextInput
              value={String(cfg.lenguaje ?? "")}
              disabled={!editable}
              onChange={(e) => set("lenguaje", e.target.value)}
              placeholder="sql, javascript, python…"
            />
          </Field>
        )}
      </div>
    );
  }

  if (spec.expects === "numero" || spec.expects === "escala") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mínimo">
          <NumberField
            value={cfg.minimo === undefined ? null : Number(cfg.minimo)}
            disabled={!editable}
            onChange={(valor) => set("minimo", valor)}
          />
        </Field>
        <Field label="Máximo">
          <NumberField
            value={cfg.maximo === undefined ? null : Number(cfg.maximo)}
            disabled={!editable}
            onChange={(valor) => set("maximo", valor)}
          />
        </Field>
        {spec.expects === "escala" && (
          <>
            <Field label="Etiqueta del mínimo">
              <TextInput
                value={String(cfg.etiquetaMinimo ?? "")}
                disabled={!editable}
                onChange={(e) => set("etiquetaMinimo", e.target.value)}
              />
            </Field>
            <Field label="Etiqueta del máximo">
              <TextInput
                value={String(cfg.etiquetaMaximo ?? "")}
                disabled={!editable}
                onChange={(e) => set("etiquetaMaximo", e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    );
  }

  if (spec.kind === "contenido") {
    const claveUrl =
      pregunta.tipo === "contenido_imagen" ? "imagenUrl" : pregunta.tipo === "contenido_video" ? "videoUrl" : "enlaceUrl";
    if (pregunta.tipo === "contenido_separador" || pregunta.tipo === "contenido_titulo") return null;
    return (
      <div className="grid gap-2">
        {(pregunta.tipo === "contenido_imagen" ||
          pregunta.tipo === "contenido_video" ||
          pregunta.tipo === "contenido_recurso") && (
          <Field label="Dirección (URL)" hint="Solo http, https o mailto.">
            <TextInput
              value={String(cfg[claveUrl] ?? "")}
              disabled={!editable}
              onChange={(e) => set(claveUrl, e.target.value)}
              placeholder="https://…"
            />
          </Field>
        )}
        {pregunta.tipo === "contenido_aviso" && (
          <Field label="Tono del aviso">
            <Select value={String(cfg.tonoAviso ?? "info")} disabled={!editable} onChange={(e) => set("tonoAviso", e.target.value)}>
              <option value="info">Informativo</option>
              <option value="aviso">Advertencia</option>
              <option value="critico">Crítico</option>
            </Select>
          </Field>
        )}
      </div>
    );
  }

  if (spec.expects === "opciones") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mínimo de selecciones">
          <NumberField
            min={0}
            value={cfg.minimoSelecciones === undefined ? null : Number(cfg.minimoSelecciones)}
            disabled={!editable}
            onChange={(valor) => set("minimoSelecciones", valor)}
          />
        </Field>
        <Field label="Máximo de selecciones">
          <NumberField
            min={0}
            value={cfg.maximoSelecciones === undefined ? null : Number(cfg.maximoSelecciones)}
            disabled={!editable}
            onChange={(valor) => set("maximoSelecciones", valor)}
          />
        </Field>
      </div>
    );
  }

  return null;
}

/* ---------------------------------- Paleta -------------------------------- */

function Paleta({ onClose, onElegir }: { onClose: () => void; onElegir: (tipo: string) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const grupos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return tiposPorGrupo()
      .map((grupo) => ({
        ...grupo,
        tipos: grupo.tipos.filter(
          ({ id, spec }) =>
            !texto ||
            spec.etiqueta.toLowerCase().includes(texto) ||
            spec.descripcion.toLowerCase().includes(texto) ||
            id.includes(texto) ||
            (spec.googleForms ?? "").toLowerCase().includes(texto),
        ),
      }))
      .filter((grupo) => grupo.tipos.length > 0);
  }, [busqueda]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[135] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir tipo de bloque"
    >
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="glass-heavy relative z-10 my-auto w-full max-w-4xl rounded-3xl p-5"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={entrada}
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar tipo de pregunta o de contenido…"
              className="w-full rounded-2xl fill-soft py-2.5 pl-9 pr-3 text-sm text-ink outline-none ring-1 ring-[color:var(--hairline)] placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-cyan-300"
            />
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

        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
          {grupos.map((grupo) => (
            <div key={grupo.grupo}>
              <h4 className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-ink-faint">
                {grupo.etiqueta}
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {grupo.tipos.map(({ id, spec }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onElegir(id)}
                    className="group flex items-start gap-2.5 rounded-2xl fill-softer p-3 text-left ring-1 ring-[color:var(--hairline)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-cyan-500/10 hover:ring-cyan-400/40"
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#00b0d8]/20 to-[#005baa]/20 text-cyan-300 ring-1 ring-cyan-400/20">
                      <Icono nombre={spec.icono} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink">{spec.etiqueta}</span>
                      <span className="block text-[0.7rem] leading-snug text-ink-soft">{spec.descripcion}</span>
                      {spec.googleForms && (
                        <span className="mt-1 inline-block text-[0.6rem] text-ink-faint">
                          Equivale a «{spec.googleForms}» de Google Forms
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grupos.length === 0 && <p className="text-sm text-ink-soft">Ningún tipo coincide con la búsqueda.</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}

export { RichText };
