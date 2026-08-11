/**
 * Paso 1 — configuración general.
 *
 * Es lo que el módulo anterior NO tenía: no había forma de cambiar el título, la
 * duración ni el criterio de aprobación, así que una evaluación creada se quedaba
 * llamándose «Nueva evaluación» para siempre. Aquí está todo lo que define la
 * prueba antes de escribir una sola pregunta.
 */

import type { Dispatch } from "react";
import {
  Clock,
  Eye,
  FileText,
  Fingerprint,
  Palette,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";
import { Field, NumberField, Select, Switch, TextArea, TextInput } from "../../../design-system/liquid-glass/fields";
import { RichTextEditor } from "../richtext/RichTextEditor";
import {
  CATEGORIAS,
  CATEGORIA_LABEL,
  CRITERIO_LABEL,
  NAVEGACIONES,
  NAVEGACION_LABEL,
  VISIBILIDADES,
  VISIBILIDAD_LABEL,
  type AcentoTema,
  type CategoriaEvaluacion,
  type CriterioAprobacion,
  type Navegacion,
  type VisibilidadResultado,
} from "../domain/model";
import {
  describirReparto,
  objetivoPuntaje,
  preguntasConPuntaje,
  puntosDeclarados,
  PUNTAJE_TOTAL_POR_OMISION,
} from "../domain/puntaje";
import type { AccionConstructor, Contenido } from "../state/builderStore";
import { BotonSecundario, GlassPanel, Pill, SectionTitle } from "../ui/pieces";

const CAMPOS_DISPONIBLES = [
  { clave: "nombre", etiqueta: "Nombre completo", fijo: true },
  { clave: "documento", etiqueta: "Documento de identidad (CI)", fijo: true },
  { clave: "correo", etiqueta: "Correo electrónico", fijo: false },
  { clave: "telefono", etiqueta: "Teléfono", fijo: false },
  { clave: "cargo", etiqueta: "Cargo al que postula", fijo: false },
  { clave: "proceso", etiqueta: "Proceso", fijo: false },
  { clave: "observaciones", etiqueta: "Observaciones", fijo: false },
];

const ACENTOS: { valor: AcentoTema; nombre: string; color: string }[] = [
  { valor: "cian", nombre: "Cian", color: "#00b0d8" },
  { valor: "azul", nombre: "Azul", color: "#2563eb" },
  { valor: "indigo", nombre: "Índigo", color: "#6366f1" },
  { valor: "esmeralda", nombre: "Esmeralda", color: "#10b981" },
  { valor: "violeta", nombre: "Violeta", color: "#8b5cf6" },
  { valor: "ambar", nombre: "Ámbar", color: "#f59e0b" },
];

export function GeneralStep({
  contenido,
  despachar,
  editable,
  estimados,
}: {
  contenido: Contenido;
  despachar: Dispatch<AccionConstructor>;
  editable: boolean;
  estimados: number;
}) {
  const { evaluacion } = contenido;
  const app = evaluacion.aplicacion;
  const participante = evaluacion.participante;
  const integridad = evaluacion.integridad;

  const editar = (cambios: Partial<typeof evaluacion>) => despachar({ tipo: "editarEvaluacion", cambios });
  const editarApp = (cambios: Partial<typeof app>) => despachar({ tipo: "editarAplicacion", cambios });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Identidad */}
      <GlassPanel>
        <SectionTitle
          titulo="Identidad"
          descripcion="Lo que identifica la evaluación en el sistema y lo primero que ve el candidato."
        />
        <div className="flex flex-col gap-3">
          <Field label="Título" htmlFor="ev-titulo" required hint="Aparece en la portada de la prueba y en el informe.">
            <TextInput
              id="ev-titulo"
              value={evaluacion.titulo}
              disabled={!editable}
              onChange={(e) => editar({ titulo: e.target.value })}
              placeholder="Analista de riesgo crediticio · Conocimientos"
            />
          </Field>
          <Field label="Descripción interna" htmlFor="ev-desc" hint="Para el equipo. No se muestra al candidato.">
            <TextArea
              id="ev-desc"
              rows={2}
              value={evaluacion.descripcion}
              disabled={!editable}
              onChange={(e) => editar({ descripcion: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría" htmlFor="ev-cat">
              <Select
                id="ev-cat"
                value={evaluacion.categoria}
                disabled={!editable}
                onChange={(e) => editar({ categoria: e.target.value as CategoriaEvaluacion })}
              >
                {CATEGORIAS.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {CATEGORIA_LABEL[categoria]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Etiquetas" htmlFor="ev-tags" hint="Separadas por coma.">
              <TextInput
                id="ev-tags"
                value={evaluacion.etiquetas.join(", ")}
                disabled={!editable}
                onChange={(e) =>
                  editar({
                    etiquetas: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, 30),
                  })
                }
                placeholder="riesgo, banca, cartera"
              />
            </Field>
          </div>
          <RichTextEditor
            etiqueta="Instrucciones para el candidato"
            valor={evaluacion.instrucciones}
            onChange={(doc) => editar({ instrucciones: doc })}
            marcador="Lee con atención. Tienes 20 minutos y una sola oportunidad…"
            filasMinimas={3}
          />
          <Field label="Notas internas" htmlFor="ev-notas" hint="Rúbricas, criterios, contexto. Nunca sale al candidato.">
            <TextArea
              id="ev-notas"
              rows={3}
              value={evaluacion.notasInternas}
              disabled={!editable}
              onChange={(e) => editar({ notasInternas: e.target.value })}
            />
          </Field>
        </div>
      </GlassPanel>

      {/* Aplicación */}
      <GlassPanel>
        <SectionTitle
          titulo="Aplicación y calificación"
          descripcion="Tiempo, criterio de aprobación y cómo se recorre la prueba."
        />
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Duración (minutos)"
              htmlFor="ev-dur"
              hint={`Vacío = sin límite. Estimación por contenido: ${estimados} min.`}
            >
              <NumberField
                id="ev-dur"
                min={1}
                max={1440}
                value={app.duracionMinutos}
                disabled={!editable}
                onChange={(valor) => editarApp({ duracionMinutos: valor })}
              />
            </Field>
            <Field label="Intentos permitidos" htmlFor="ev-intentos" hint="Por documento de identidad.">
              <NumberField
                id="ev-intentos"
                min={1}
                max={20}
                value={app.intentosMaximos}
                disabled={!editable}
                onChange={(valor) => editarApp({ intentosMaximos: Math.max(1, valor ?? 1) })}
              />
            </Field>
          </div>

          {app.duracionMinutos !== null && estimados > app.duracionMinutos * 1.4 && (
            <p className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs tone-text-aviso">
              El contenido actual necesita unos <strong>{estimados} min</strong> y el límite es de {app.duracionMinutos}.
              Considera ampliarlo o recortar preguntas.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Criterio de aprobación" htmlFor="ev-crit">
              <Select
                id="ev-crit"
                value={app.criterioAprobacion}
                disabled={!editable}
                onChange={(e) => editarApp({ criterioAprobacion: e.target.value as CriterioAprobacion })}
              >
                {(Object.keys(CRITERIO_LABEL) as CriterioAprobacion[]).map((criterio) => (
                  <option key={criterio} value={criterio}>
                    {CRITERIO_LABEL[criterio]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={app.criterioAprobacion === "puntos" ? "Puntos para aprobar" : "Porcentaje para aprobar"}
              htmlFor="ev-aprob"
              hint="Vacío = sin veredicto de aprobado."
            >
              <NumberField
                id="ev-aprob"
                min={0}
                max={app.criterioAprobacion === "puntos" ? undefined : 100}
                value={app.puntajeAprobacion}
                disabled={!editable}
                onChange={(valor) => editarApp({ puntajeAprobacion: valor })}
              />
            </Field>
          </div>

          <PuntajeTotal contenido={contenido} despachar={despachar} editable={editable} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Abre el" htmlFor="ev-desde" hint="Vacío = disponible desde que se publica.">
              <TextInput
                id="ev-desde"
                type="datetime-local"
                value={paraInput(app.ventanaInicio)}
                disabled={!editable}
                onChange={(e) => editarApp({ ventanaInicio: desdeInput(e.target.value) })}
              />
            </Field>
            <Field label="Cierra el" htmlFor="ev-hasta" hint="Vacío = sin fecha de cierre.">
              <TextInput
                id="ev-hasta"
                type="datetime-local"
                value={paraInput(app.ventanaFin)}
                disabled={!editable}
                onChange={(e) => editarApp({ ventanaFin: desdeInput(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Recorrido de la prueba" htmlFor="ev-nav">
            <Select
              id="ev-nav"
              value={app.navegacion}
              disabled={!editable}
              onChange={(e) => editarApp({ navegacion: e.target.value as Navegacion })}
            >
              {NAVEGACIONES.map((navegacion) => (
                <option key={navegacion} value={navegacion}>
                  {NAVEGACION_LABEL[navegacion]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-2.5 rounded-2xl fill-softer p-3 ring-1 ring-[color:var(--hairline)] sm:grid-cols-2">
            <Switch
              checked={app.permitirRetroceso}
              onChange={(v) => editarApp({ permitirRetroceso: v })}
              label="Permitir volver atrás"
            />
            <Switch
              checked={app.mostrarProgreso}
              onChange={(v) => editarApp({ mostrarProgreso: v })}
              label="Mostrar el progreso"
            />
            <Switch
              checked={app.mezclarPreguntas}
              onChange={(v) => editarApp({ mezclarPreguntas: v })}
              label="Mezclar preguntas"
            />
            <Switch
              checked={app.mezclarOpciones}
              onChange={(v) => editarApp({ mezclarOpciones: v })}
              label="Mezclar opciones"
            />
            <Switch
              checked={app.autoenviarAlExpirar}
              onChange={(v) => editarApp({ autoenviarAlExpirar: v })}
              label="Enviar solo al agotarse el tiempo"
            />
          </div>
          <Field
            label="Autoguardado del candidato (segundos)"
            htmlFor="ev-auto"
            hint="0 desactiva el autoguardado. Con 20 s, una caída de red pierde como mucho 20 s de trabajo."
          >
            <NumberField
              id="ev-auto"
              min={0}
              max={600}
              value={app.guardadoAutomaticoSegundos}
              disabled={!editable}
              onChange={(valor) => editarApp({ guardadoAutomaticoSegundos: valor ?? 0 })}
            />
          </Field>
        </div>
      </GlassPanel>

      {/* Participante */}
      <GlassPanel>
        <SectionTitle
          titulo="Identificación del participante"
          descripcion="Qué se le pide antes de empezar y qué ve al terminar."
        />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
              <UserRound className="h-3.5 w-3.5" /> Campos que se piden
            </span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CAMPOS_DISPONIBLES.map(({ clave, etiqueta, fijo }) => {
                const actual = participante.campos.find((c) => c.clave === clave);
                const activo = fijo || (actual?.activo ?? false);
                return (
                  <label
                    key={clave}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ring-1 transition-colors ${
                      activo ? "bg-cyan-500/10 ring-cyan-400/30" : "fill-softer ring-[color:var(--hairline)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-cyan-500"
                      checked={activo}
                      disabled={fijo || !editable}
                      onChange={(e) => {
                        const otros = participante.campos.filter((c) => c.clave !== clave);
                        const campos = e.target.checked
                          ? [...otros, { clave, etiqueta, obligatorio: false, activo: true }]
                          : otros;
                        despachar({ tipo: "editarParticipante", cambios: { campos } });
                      }}
                    />
                    <span className="flex-1 font-semibold text-ink">{etiqueta}</span>
                    {fijo ? (
                      <Pill tono="neutral" punto={false}>
                        Siempre
                      </Pill>
                    ) : (
                      activo && (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => {
                            const campos = participante.campos.map((c) =>
                              c.clave === clave ? { ...c, obligatorio: !c.obligatorio } : c,
                            );
                            despachar({ tipo: "editarParticipante", cambios: { campos } });
                          }}
                          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ring-1 ${
                            actual?.obligatorio
                              ? "bg-rose-500/20 tone-text-peligro ring-rose-400/30"
                              : "fill-softer text-ink-faint ring-[color:var(--hairline)]"
                          }`}
                        >
                          {actual?.obligatorio ? "Obligatorio" : "Opcional"}
                        </button>
                      )
                    )}
                  </label>
                );
              })}
            </div>
            <p className="text-[0.7rem] text-ink-faint">
              El nombre y el documento son siempre obligatorios: sin ellos un resultado no se puede atribuir a nadie ni
              incluir en el informe en PDF.
            </p>
          </div>

          <Field
            label="Resultado que ve el candidato"
            htmlFor="ev-vis"
            hint="Se aplica en el servidor: lo que aquí se oculta no viaja al navegador."
          >
            <Select
              id="ev-vis"
              value={participante.visibilidadResultado}
              disabled={!editable}
              onChange={(e) =>
                despachar({
                  tipo: "editarParticipante",
                  cambios: { visibilidadResultado: e.target.value as VisibilidadResultado },
                })
              }
            >
              {VISIBILIDADES.map((visibilidad) => (
                <option key={visibilidad} value={visibilidad}>
                  {VISIBILIDAD_LABEL[visibilidad]}
                </option>
              ))}
            </Select>
          </Field>

          <Switch
            checked={participante.requiereConsentimiento}
            onChange={(v) => despachar({ tipo: "editarParticipante", cambios: { requiereConsentimiento: v } })}
            label="Exigir consentimiento informado antes de empezar"
          />
          {participante.requiereConsentimiento && (
            <Field label="Texto del consentimiento" htmlFor="ev-cons" required>
              <TextArea
                id="ev-cons"
                rows={3}
                value={participante.textoConsentimiento}
                disabled={!editable}
                onChange={(e) =>
                  despachar({ tipo: "editarParticipante", cambios: { textoConsentimiento: e.target.value } })
                }
                placeholder="Autorizo el tratamiento de mis datos para este proceso de selección…"
              />
            </Field>
          )}
        </div>
      </GlassPanel>

      {/* Integridad y tema */}
      <div className="flex flex-col gap-4">
        <GlassPanel>
          <SectionTitle
            titulo="Integridad de la prueba"
            descripcion="Qué se registra durante el intento. Todo queda documentado en el informe; nada se bloquea sin decirlo."
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Switch
              checked={integridad.registrarCambioPestana}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { registrarCambioPestana: v } })}
              label="Registrar cambios de pestaña"
            />
            <Switch
              checked={integridad.registrarCopiaPegado}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { registrarCopiaPegado: v } })}
              label="Registrar copiar y pegar"
            />
            <Switch
              checked={integridad.registrarTiempos}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { registrarTiempos: v } })}
              label="Registrar tiempos por pregunta"
            />
            <Switch
              checked={integridad.registrarNavegacion}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { registrarNavegacion: v } })}
              label="Registrar navegación"
            />
            <Switch
              checked={integridad.bloquearPegado}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { bloquearPegado: v } })}
              label="Bloquear pegar texto"
            />
            <Switch
              checked={integridad.bloquearMenuContextual}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { bloquearMenuContextual: v } })}
              label="Bloquear el menú contextual"
            />
            <Switch
              checked={integridad.avisarAlSalir}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { avisarAlSalir: v } })}
              label="Avisar si intenta salir"
            />
            <Switch
              checked={integridad.pantallaCompletaSugerida}
              onChange={(v) => despachar({ tipo: "editarIntegridad", cambios: { pantallaCompletaSugerida: v } })}
              label="Sugerir pantalla completa"
            />
          </div>
          <Field
            label="Alertas para marcar el intento como riesgo alto"
            htmlFor="ev-umbral"
            className="mt-3"
            hint="El riesgo nunca es un veredicto: el informe muestra siempre los eventos concretos."
          >
            <NumberField
              id="ev-umbral"
              min={1}
              max={100}
              value={integridad.umbralRiesgo}
              disabled={!editable}
              onChange={(valor) => despachar({ tipo: "editarIntegridad", cambios: { umbralRiesgo: valor ?? 5 } })}
            />
          </Field>
          {integridad.bloquearPegado && (
            <p className="mt-2 flex items-start gap-1.5 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-accent">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Bloquear el pegado se le explica al candidato antes de empezar. Un impedimento sin explicación se
              interpreta como un fallo de la página.
            </p>
          )}
        </GlassPanel>

        <GlassPanel>
          <SectionTitle titulo="Apariencia de la prueba" descripcion="Cómo se ve la evaluación para el candidato." />
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                <Palette className="h-3.5 w-3.5" /> Color de acento
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ACENTOS.map(({ valor, nombre, color }) => (
                  <button
                    key={valor}
                    type="button"
                    disabled={!editable}
                    onClick={() => despachar({ tipo: "editarTema", cambios: { acento: valor } })}
                    aria-label={nombre}
                    aria-pressed={evaluacion.tema.acento === valor}
                    className={`h-8 w-8 rounded-full ring-2 transition-transform hover:scale-110 ${
                      evaluacion.tema.acento === valor ? "ring-white/70" : "ring-transparent"
                    }`}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Switch
                checked={evaluacion.tema.mostrarNumeracion}
                onChange={(v) => despachar({ tipo: "editarTema", cambios: { mostrarNumeracion: v } })}
                label="Numerar las preguntas"
              />
              <Switch
                checked={evaluacion.tema.animaciones}
                onChange={(v) => despachar({ tipo: "editarTema", cambios: { animaciones: v } })}
                label="Animaciones en la prueba"
              />
              <Switch
                checked={evaluacion.tema.densidad === "compacta"}
                onChange={(v) => despachar({ tipo: "editarTema", cambios: { densidad: v ? "compacta" : "comoda" } })}
                label="Diseño compacto"
              />
            </div>
            <Field label="Logotipo (URL)" htmlFor="ev-logo" hint="Se muestra en la portada de la prueba.">
              <TextInput
                id="ev-logo"
                value={evaluacion.tema.logoUrl}
                disabled={!editable}
                onChange={(e) => despachar({ tipo: "editarTema", cambios: { logoUrl: e.target.value } })}
                placeholder="https://…"
              />
            </Field>
          </div>
        </GlassPanel>

        <GlassPanel padding="p-4">
          <p className="flex items-start gap-2 text-xs text-ink-soft">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              En <strong>Revisión</strong> puedes ver la prueba exactamente como la verá el candidato, con este mismo
              tema y estas mismas reglas.
            </span>
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}

/**
 * Puntaje total de la evaluación.
 *
 * La escala del equipo es sobre 100, y antes cada pregunta valía 1 punto: una
 * prueba de 20 preguntas valía 20 y otra de 33 valía 33, con lo que «necesita 70
 * puntos para aprobar» significaba cosas distintas en cada una. Aquí se declara el
 * total una vez y el módulo lo reparte; el reparto se recalcula solo cada vez que
 * el contenido cambia.
 */
function PuntajeTotal({
  contenido,
  despachar,
  editable,
}: {
  contenido: Contenido;
  despachar: Dispatch<AccionConstructor>;
  editable: boolean;
}) {
  const objetivo = objetivoPuntaje(contenido.evaluacion);
  const declarados = puntosDeclarados(contenido.secciones);
  const cuantas = preguntasConPuntaje(contenido.secciones);
  const cuadra = objetivo === null || Math.abs(declarados - objetivo) < 0.01;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl fill-softer p-3 ring-1 ring-[color:var(--hairline)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
          <Target className="h-3.5 w-3.5" /> Puntaje total de la evaluación
        </span>
        <Switch
          checked={objetivo !== null}
          onChange={(v) =>
            despachar({ tipo: "fijarObjetivoPuntaje", objetivo: v ? PUNTAJE_TOTAL_POR_OMISION : null })
          }
          label="Repartir automáticamente"
        />
      </div>

      {objetivo !== null ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Total" htmlFor="ev-total" className="w-28">
            <NumberField
              id="ev-total"
              min={1}
              max={10000}
              value={objetivo}
              disabled={!editable}
              onChange={(valor) =>
                despachar({ tipo: "fijarObjetivoPuntaje", objetivo: valor && valor > 0 ? valor : PUNTAJE_TOTAL_POR_OMISION })
              }
            />
          </Field>
          <div className="min-w-0 flex-1">
            <p className="text-[0.72rem] text-ink-soft">{describirReparto(contenido.secciones, objetivo)}</p>
            <p className="mt-0.5 text-[0.68rem] text-ink-faint">
              Cada pregunta que puntúa recibe su parte; las centésimas sobrantes se reparten para que la suma sea
              exactamente {objetivo}. El peso de una sección multiplica la parte de sus preguntas.
            </p>
          </div>
          <BotonSecundario
            onClick={() => despachar({ tipo: "repartirPuntaje" })}
            disabled={!editable || cuantas === 0}
            title="Vuelve a repartir el total entre las preguntas que puntúan"
          >
            <Target className="h-4 w-4" /> Repartir ahora
          </BotonSecundario>
        </div>
      ) : (
        <p className="text-[0.72rem] text-ink-soft">
          Reparto manual: los puntos de cada pregunta se ponen a mano en el inspector. Ahora mismo la evaluación reparte{" "}
          <strong className="text-ink">{declarados}</strong> punto(s) entre {cuantas} pregunta(s).
        </p>
      )}

      {!cuadra && (
        <p className="tone-aviso tone-ring rounded-xl px-3 py-2 text-[0.7rem]">
          Los puntos declarados suman {declarados} y el objetivo es {objetivo}. Pulsa «Repartir ahora» para cuadrarlo.
        </p>
      )}
    </div>
  );
}

/** ISO → valor de `datetime-local` (que no admite zona horaria). */
function paraInput(iso: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const fecha = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}

function desdeInput(valor: string): string {
  if (!valor) return "";
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

export { Clock, FileText, Fingerprint, Target };
