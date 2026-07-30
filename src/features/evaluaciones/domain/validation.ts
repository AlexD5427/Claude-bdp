/**
 * Revisión previa a la publicación, en el cliente.
 *
 * ── Quién manda ──────────────────────────────────────────────────────────────
 * El servidor es la ÚNICA autoridad: `publishEvaluation` vuelve a validar todo y
 * su veredicto es el que cuenta. Lo que hace este archivo es adelantarle el
 * trabajo al autor: mostrarle, mientras edita y antes de pulsar «Publicar», qué
 * le falta y dónde. Las reglas replican `10_Validate.gs` y hay pruebas que
 * comparan las dos listas de códigos, para que no se separen.
 *
 * Cada hallazgo lleva la RUTA del campo (`preguntas.pr_x.opciones`), y el panel de
 * revisión la usa para llevar al autor exactamente ahí. Ese salto es la diferencia
 * entre un panel útil y una lista de reproches.
 */

import { isRichEmpty, richToPlain } from "./richText";
import { esAutoCalificable, requiereRevisionManual, tipoSpec } from "./questionTypes";
import type { Evaluacion, Seccion } from "./model";

export type SeveridadHallazgo = "error" | "aviso";

export interface HallazgoRevision {
  codigo: string;
  mensaje: string;
  /** Ruta al campo: `evaluacion.titulo`, `preguntas.<id>.opciones`… */
  ruta: string;
  severidad: SeveridadHallazgo;
  /** Identificadores para poder navegar hasta el bloque. */
  seccionId?: string;
  preguntaId?: string;
  datos?: Record<string, unknown>;
}

function error(
  codigo: string,
  mensaje: string,
  ruta: string,
  extra: Partial<HallazgoRevision> = {},
): HallazgoRevision {
  return { codigo, mensaje, ruta, severidad: "error", ...extra };
}

function aviso(
  codigo: string,
  mensaje: string,
  ruta: string,
  extra: Partial<HallazgoRevision> = {},
): HallazgoRevision {
  return { codigo, mensaje, ruta, severidad: "aviso", ...extra };
}

/**
 * Revisa el documento completo.
 *
 * Devuelve errores (bloquean la publicación) y avisos (no la bloquean pero
 * conviene verlos). Separarlos importa: si todo bloquea, la gente aprende a
 * ignorar el panel.
 */
export function revisarDocumento(evaluacion: Evaluacion, secciones: Seccion[]): HallazgoRevision[] {
  const hallazgos: HallazgoRevision[] = [];
  const app = evaluacion.aplicacion;

  /* --- Identidad --- */
  if (!evaluacion.titulo.trim()) {
    hallazgos.push(error("SIN_TITULO", "La evaluación necesita un título.", "evaluacion.titulo"));
  } else if (evaluacion.titulo.trim().toLowerCase() === "evaluación sin título") {
    hallazgos.push(
      error(
        "TITULO_POR_OMISION",
        "El título sigue siendo el de por omisión, y es lo primero que ve el candidato.",
        "evaluacion.titulo",
      ),
    );
  }

  /* --- Contenido --- */
  const preguntas = secciones.flatMap((s) => s.preguntas.filter((p) => tipoSpec(p.tipo)?.kind === "pregunta"));
  if (secciones.length === 0) {
    hallazgos.push(error("SIN_SECCIONES", "La evaluación no tiene secciones.", "secciones"));
  }
  if (preguntas.length === 0) {
    hallazgos.push(
      error("SIN_PREGUNTAS", "No hay ninguna pregunta que recoja respuesta.", "preguntas"),
    );
  }

  /* --- Tiempo --- */
  if (app.duracionMinutos !== null && app.duracionMinutos <= 0) {
    hallazgos.push(
      error(
        "DURACION_INVALIDA",
        "La duración debe ser mayor que cero, o quedar vacía para no limitar el tiempo.",
        "evaluacion.aplicacion.duracionMinutos",
      ),
    );
  }
  if (
    app.duracionMinutos !== null &&
    preguntas.length > 0 &&
    app.duracionMinutos < Math.ceil(preguntas.length / 20)
  ) {
    hallazgos.push(
      error(
        "DURACION_MUY_CORTA",
        `Son ${app.duracionMinutos} min para ${preguntas.length} preguntas: menos de tres segundos por pregunta.`,
        "evaluacion.aplicacion.duracionMinutos",
        { datos: { minutos: app.duracionMinutos, preguntas: preguntas.length } },
      ),
    );
  }
  if (app.ventanaInicio && app.ventanaFin && Date.parse(app.ventanaFin) <= Date.parse(app.ventanaInicio)) {
    hallazgos.push(
      error(
        "VENTANA_INVERTIDA",
        "La ventana de aplicación termina antes de empezar.",
        "evaluacion.aplicacion.ventanaFin",
      ),
    );
  }
  if (app.duracionMinutos === null) {
    hallazgos.push(
      aviso(
        "SIN_DURACION",
        "Sin límite de tiempo no se muestra el temporizador.",
        "evaluacion.aplicacion.duracionMinutos",
      ),
    );
  }

  /* --- Preguntas --- */
  let totalPuntos = 0;
  let calificables = 0;
  let manuales = 0;

  for (const seccion of secciones) {
    for (const pregunta of seccion.preguntas) {
      const spec = tipoSpec(pregunta.tipo);
      if (!spec) {
        hallazgos.push(
          error(
            "TIPO_DESCONOCIDO",
            `El bloque usa el tipo «${pregunta.tipo}», que este backend no conoce.`,
            `preguntas.${pregunta.id}`,
            { seccionId: seccion.id, preguntaId: pregunta.id },
          ),
        );
        continue;
      }
      if (spec.kind !== "pregunta") {
        if (pregunta.tipo !== "contenido_separador" && isRichEmpty(pregunta.enunciado)) {
          hallazgos.push(
            aviso("CONTENIDO_VACIO", "Hay un bloque de contenido sin texto.", `preguntas.${pregunta.id}.enunciado`, {
              seccionId: seccion.id,
              preguntaId: pregunta.id,
            }),
          );
        }
        continue;
      }

      const ruta = `preguntas.${pregunta.id}`;
      const contexto = { seccionId: seccion.id, preguntaId: pregunta.id };

      if (isRichEmpty(pregunta.enunciado)) {
        hallazgos.push(error("ENUNCIADO_VACIO", "Hay una pregunta sin enunciado.", `${ruta}.enunciado`, contexto));
      }

      if (spec.options === "requeridas") {
        const minimo = 2;
        if (pregunta.opciones.length < minimo) {
          hallazgos.push(
            error(
              "OPCIONES_INSUFICIENTES",
              `«${spec.etiqueta}» necesita al menos ${minimo} opciones y tiene ${pregunta.opciones.length}.`,
              `${ruta}.opciones`,
              contexto,
            ),
          );
        }
        const vistos = new Set<string>();
        for (const opcion of pregunta.opciones) {
          if (isRichEmpty(opcion.texto) && !opcion.imagenUrl) {
            hallazgos.push(
              error("OPCION_VACIA", "Hay una opción sin texto ni imagen.", `${ruta}.opciones.${opcion.id}`, contexto),
            );
          }
          const plano = richToPlain(opcion.texto).trim().toLowerCase();
          if (plano && vistos.has(plano)) {
            hallazgos.push(
              error(
                "OPCION_DUPLICADA",
                `La opción «${plano.slice(0, 60)}» está repetida.`,
                `${ruta}.opciones.${opcion.id}`,
                contexto,
              ),
            );
          }
          if (plano) vistos.add(plano);
        }
      }

      if (pregunta.modoPuntaje !== "ninguno") {
        totalPuntos += pregunta.puntos;
        if (pregunta.puntos <= 0) {
          hallazgos.push(
            error("PUNTOS_CERO", "La pregunta puntúa pero tiene cero puntos.", `${ruta}.puntos`, contexto),
          );
        }
      }

      const auto = esAutoCalificable(
        pregunta.tipo,
        pregunta.modoPuntaje,
        pregunta.respuestaEsperada,
        pregunta.opciones,
      );
      if (auto) {
        calificables += 1;
        if (spec.expects === "opcion" && spec.multiple === false) {
          const correctas = pregunta.opciones.filter((o) => o.correcta).length;
          if (correctas > 1) {
            hallazgos.push(
              error(
                "VARIAS_CORRECTAS",
                `Es de respuesta única y tiene ${correctas} opciones marcadas como correctas.`,
                `${ruta}.opciones`,
                { ...contexto, datos: { correctas } },
              ),
            );
          }
        }
      } else if (
        pregunta.modoPuntaje !== "ninguno" &&
        pregunta.modoPuntaje !== "manual" &&
        pregunta.puntos > 0
      ) {
        hallazgos.push(
          error(
            "SIN_CLAVE",
            "Puntúa automáticamente pero no tiene respuesta correcta definida. Márcala como manual o define la clave.",
            `${ruta}.respuestaEsperada`,
            contexto,
          ),
        );
      }

      if (
        requiereRevisionManual(
          pregunta.tipo,
          pregunta.modoPuntaje,
          pregunta.puntos,
          pregunta.respuestaEsperada,
          pregunta.opciones,
        )
      ) {
        manuales += 1;
      }
    }
  }

  /* --- Aprobación --- */
  if (app.puntajeAprobacion !== null) {
    if (app.criterioAprobacion === "puntos") {
      if (totalPuntos > 0 && app.puntajeAprobacion > totalPuntos) {
        hallazgos.push(
          error(
            "APROBACION_IMPOSIBLE",
            `Se exigen ${app.puntajeAprobacion} puntos y la evaluación reparte ${totalPuntos}.`,
            "evaluacion.aplicacion.puntajeAprobacion",
            { datos: { exigido: app.puntajeAprobacion, disponible: totalPuntos } },
          ),
        );
      }
    } else if (app.puntajeAprobacion < 0 || app.puntajeAprobacion > 100) {
      hallazgos.push(
        error(
          "APROBACION_FUERA_DE_RANGO",
          "El porcentaje de aprobación debe estar entre 0 y 100.",
          "evaluacion.aplicacion.puntajeAprobacion",
        ),
      );
    }
    if (calificables === 0 && app.puntajeAprobacion > 0) {
      hallazgos.push(
        error(
          "APROBACION_SIN_CALIFICABLES",
          "Hay puntaje de aprobación pero ninguna pregunta se califica automáticamente: todos los resultados quedarían pendientes.",
          "evaluacion.aplicacion.puntajeAprobacion",
        ),
      );
    }
  } else if (preguntas.length > 0) {
    hallazgos.push(
      aviso(
        "SIN_APROBACION",
        "Sin criterio de aprobación se mostrará la nota, pero no «aprobado / no aprobado».",
        "evaluacion.aplicacion.puntajeAprobacion",
      ),
    );
  }

  /* --- Participante y presentación --- */
  if (evaluacion.participante.requiereConsentimiento && !evaluacion.participante.textoConsentimiento.trim()) {
    hallazgos.push(
      error(
        "CONSENTIMIENTO_VACIO",
        "Se exige consentimiento pero el texto está vacío.",
        "evaluacion.participante.textoConsentimiento",
      ),
    );
  }
  if (isRichEmpty(evaluacion.instrucciones)) {
    hallazgos.push(
      aviso("SIN_INSTRUCCIONES", "No hay instrucciones para el candidato.", "evaluacion.instrucciones"),
    );
  }
  if (preguntas.length > 0 && preguntas.every((p) => !p.obligatoria)) {
    hallazgos.push(
      aviso("NINGUNA_OBLIGATORIA", "Ninguna pregunta es obligatoria: se puede enviar en blanco.", "preguntas"),
    );
  }
  if (manuales > 0) {
    hallazgos.push(
      aviso(
        "REVISION_MANUAL",
        `${manuales} pregunta(s) exigen revisión humana: la nota final quedará pendiente hasta revisarlas.`,
        "preguntas",
        { datos: { manuales } },
      ),
    );
  }

  /* --- Reglas de lógica --- */
  const idsPregunta = new Set(secciones.flatMap((s) => s.preguntas.map((p) => p.id)));
  const idsSeccion = new Set(secciones.map((s) => s.id));
  for (const regla of evaluacion.reglas) {
    if (regla.preguntaId && !idsPregunta.has(regla.preguntaId)) {
      hallazgos.push(
        error("REGLA_HUERFANA", "Una regla depende de una pregunta que ya no existe.", `reglas.${regla.id}`),
      );
    }
    if (regla.destinoSeccionId && !idsSeccion.has(regla.destinoSeccionId)) {
      hallazgos.push(
        error(
          "REGLA_DESTINO_INEXISTENTE",
          "Una regla salta a una sección que ya no existe.",
          `reglas.${regla.id}`,
        ),
      );
    }
  }

  return hallazgos;
}

export function soloErrores(hallazgos: HallazgoRevision[]): HallazgoRevision[] {
  return hallazgos.filter((h) => h.severidad === "error");
}

export function soloAvisos(hallazgos: HallazgoRevision[]): HallazgoRevision[] {
  return hallazgos.filter((h) => h.severidad === "aviso");
}

/** ¿Se puede intentar publicar? */
export function puedePublicar(hallazgos: HallazgoRevision[]): boolean {
  return soloErrores(hallazgos).length === 0;
}
