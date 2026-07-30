/**
 * Estado del constructor: reductor con deshacer y rehacer.
 *
 * Todo el contenido de una evaluación vive en UN objeto (`evaluacion` +
 * `secciones`) y toda modificación pasa por una acción del reductor. Eso da tres
 * cosas gratis:
 *
 *   1. deshacer y rehacer reales, porque cada acción produce un estado completo
 *      que se puede apilar;
 *   2. un indicador de «cambios sin guardar» fiable, porque se compara el estado
 *      actual con el último guardado y no con una bandera que alguien puede
 *      olvidar de poner;
 *   3. un solo sitio donde se recalculan los órdenes, así que el editor y la
 *      prueba nunca discrepan.
 *
 * El historial guarda 60 pasos. Es suficiente para una sesión de autoría y no
 * llena la memoria con evaluaciones grandes.
 */

import { duplicarPregunta, duplicarSeccion, nuevaPregunta, nuevaSeccion } from "../domain/factory";
import type { Evaluacion, Opcion, Pregunta, Seccion } from "../domain/model";
import type { RichDoc } from "../domain/richText";
import { nuevaOpcion } from "../domain/factory";

const MAX_HISTORIAL = 60;

export interface Contenido {
  evaluacion: Evaluacion;
  secciones: Seccion[];
}

export interface EstadoConstructor {
  actual: Contenido;
  /** Última versión confirmada por el servidor. Base de «cambios sin guardar». */
  guardado: Contenido;
  pasado: Contenido[];
  futuro: Contenido[];
  /** Bloque seleccionado en el lienzo. */
  seleccion: { seccionId: string; preguntaId: string | null } | null;
}

export type AccionConstructor =
  | { tipo: "reemplazar"; contenido: Contenido; comoGuardado?: boolean }
  | { tipo: "confirmarGuardado"; contenido: Contenido }
  | { tipo: "editarEvaluacion"; cambios: Partial<Evaluacion> }
  | { tipo: "editarAplicacion"; cambios: Partial<Evaluacion["aplicacion"]> }
  | { tipo: "editarParticipante"; cambios: Partial<Evaluacion["participante"]> }
  | { tipo: "editarIntegridad"; cambios: Partial<Evaluacion["integridad"]> }
  | { tipo: "editarTema"; cambios: Partial<Evaluacion["tema"]> }
  | { tipo: "agregarSeccion" }
  | { tipo: "editarSeccion"; seccionId: string; cambios: Partial<Seccion> }
  | { tipo: "moverSeccion"; seccionId: string; delta: number }
  | { tipo: "duplicarSeccion"; seccionId: string }
  | { tipo: "eliminarSeccion"; seccionId: string }
  | { tipo: "agregarPregunta"; seccionId: string; tipoPregunta: string; despuesDe?: string }
  | { tipo: "editarPregunta"; preguntaId: string; cambios: Partial<Pregunta> }
  | { tipo: "moverPregunta"; preguntaId: string; delta: number }
  | { tipo: "moverPreguntaASeccion"; preguntaId: string; seccionId: string }
  | { tipo: "duplicarPregunta"; preguntaId: string }
  | { tipo: "eliminarPregunta"; preguntaId: string }
  | { tipo: "agregarOpcion"; preguntaId: string }
  | { tipo: "editarOpcion"; preguntaId: string; opcionId: string; cambios: Partial<Opcion> }
  | { tipo: "moverOpcion"; preguntaId: string; opcionId: string; delta: number }
  | { tipo: "eliminarOpcion"; preguntaId: string; opcionId: string }
  | { tipo: "marcarCorrecta"; preguntaId: string; opcionId: string; correcta: boolean }
  | { tipo: "seleccionar"; seccionId: string; preguntaId: string | null }
  | { tipo: "deshacer" }
  | { tipo: "rehacer" };

export function estadoInicial(contenido: Contenido): EstadoConstructor {
  return {
    actual: contenido,
    guardado: structuredClone(contenido),
    pasado: [],
    futuro: [],
    seleccion: contenido.secciones[0]
      ? { seccionId: contenido.secciones[0].id, preguntaId: contenido.secciones[0].preguntas[0]?.id ?? null }
      : null,
  };
}

/** ¿Hay cambios sin guardar? Comparación estructural, no una bandera. */
export function tieneCambios(estado: EstadoConstructor): boolean {
  return JSON.stringify(estado.actual) !== JSON.stringify(estado.guardado);
}

export function puedeDeshacer(estado: EstadoConstructor): boolean {
  return estado.pasado.length > 0;
}

export function puedeRehacer(estado: EstadoConstructor): boolean {
  return estado.futuro.length > 0;
}

/** Aplica un cambio al contenido, apilando el estado anterior. */
function conHistorial(estado: EstadoConstructor, siguiente: Contenido): EstadoConstructor {
  const pasado = [...estado.pasado, estado.actual];
  return {
    ...estado,
    actual: siguiente,
    pasado: pasado.length > MAX_HISTORIAL ? pasado.slice(pasado.length - MAX_HISTORIAL) : pasado,
    futuro: [],
  };
}

/** Reordena y renumera secciones y preguntas. Se aplica tras cada cambio. */
function normalizar(contenido: Contenido): Contenido {
  const secciones = contenido.secciones.map((seccion, i) => ({
    ...seccion,
    orden: i,
    preguntas: seccion.preguntas.map((pregunta, j) => ({
      ...pregunta,
      orden: j,
      seccionId: seccion.id,
      opciones: pregunta.opciones.map((opcion, k) => ({ ...opcion, orden: k })),
    })),
  }));
  return { ...contenido, secciones };
}

function mapSecciones(contenido: Contenido, fn: (seccion: Seccion) => Seccion): Contenido {
  return { ...contenido, secciones: contenido.secciones.map(fn) };
}

function mapPregunta(contenido: Contenido, preguntaId: string, fn: (pregunta: Pregunta) => Pregunta): Contenido {
  return mapSecciones(contenido, (seccion) => ({
    ...seccion,
    preguntas: seccion.preguntas.map((pregunta) => (pregunta.id === preguntaId ? fn(pregunta) : pregunta)),
  }));
}

function buscarPregunta(contenido: Contenido, preguntaId: string): { seccion: Seccion; pregunta: Pregunta } | null {
  for (const seccion of contenido.secciones) {
    const pregunta = seccion.preguntas.find((p) => p.id === preguntaId);
    if (pregunta) return { seccion, pregunta };
  }
  return null;
}

export function reducirConstructor(estado: EstadoConstructor, accion: AccionConstructor): EstadoConstructor {
  switch (accion.tipo) {
    case "reemplazar":
      return accion.comoGuardado
        ? estadoInicial(accion.contenido)
        : { ...conHistorial(estado, accion.contenido), seleccion: estado.seleccion };

    case "confirmarGuardado":
      // El servidor devuelve la versión canónica (con su revisión nueva). Se
      // adopta como base de comparación SIN tocar el historial: deshacer sigue
      // funcionando después de guardar.
      return { ...estado, actual: accion.contenido, guardado: structuredClone(accion.contenido) };

    case "editarEvaluacion":
      return conHistorial(estado, {
        ...estado.actual,
        evaluacion: { ...estado.actual.evaluacion, ...accion.cambios },
      });

    case "editarAplicacion":
      return conHistorial(estado, {
        ...estado.actual,
        evaluacion: {
          ...estado.actual.evaluacion,
          aplicacion: { ...estado.actual.evaluacion.aplicacion, ...accion.cambios },
        },
      });

    case "editarParticipante":
      return conHistorial(estado, {
        ...estado.actual,
        evaluacion: {
          ...estado.actual.evaluacion,
          participante: { ...estado.actual.evaluacion.participante, ...accion.cambios },
        },
      });

    case "editarIntegridad":
      return conHistorial(estado, {
        ...estado.actual,
        evaluacion: {
          ...estado.actual.evaluacion,
          integridad: { ...estado.actual.evaluacion.integridad, ...accion.cambios },
        },
      });

    case "editarTema":
      return conHistorial(estado, {
        ...estado.actual,
        evaluacion: { ...estado.actual.evaluacion, tema: { ...estado.actual.evaluacion.tema, ...accion.cambios } },
      });

    case "agregarSeccion": {
      const seccion = nuevaSeccion(estado.actual.secciones.length);
      const siguiente = normalizar({ ...estado.actual, secciones: [...estado.actual.secciones, seccion] });
      return { ...conHistorial(estado, siguiente), seleccion: { seccionId: seccion.id, preguntaId: null } };
    }

    case "editarSeccion":
      return conHistorial(
        estado,
        mapSecciones(estado.actual, (seccion) =>
          seccion.id === accion.seccionId ? { ...seccion, ...accion.cambios } : seccion,
        ),
      );

    case "moverSeccion": {
      const indice = estado.actual.secciones.findIndex((s) => s.id === accion.seccionId);
      const destino = indice + accion.delta;
      if (indice < 0 || destino < 0 || destino >= estado.actual.secciones.length) return estado;
      const secciones = [...estado.actual.secciones];
      const [movida] = secciones.splice(indice, 1);
      secciones.splice(destino, 0, movida);
      return conHistorial(estado, normalizar({ ...estado.actual, secciones }));
    }

    case "duplicarSeccion": {
      const indice = estado.actual.secciones.findIndex((s) => s.id === accion.seccionId);
      if (indice < 0) return estado;
      const copia = duplicarSeccion(estado.actual.secciones[indice], indice + 1);
      const secciones = [...estado.actual.secciones];
      secciones.splice(indice + 1, 0, copia);
      return {
        ...conHistorial(estado, normalizar({ ...estado.actual, secciones })),
        seleccion: { seccionId: copia.id, preguntaId: null },
      };
    }

    case "eliminarSeccion": {
      // Nunca se queda sin secciones: una evaluación sin sección no se puede
      // editar, y llegar a ese estado por un clic sería un callejón sin salida.
      if (estado.actual.secciones.length <= 1) return estado;
      const secciones = estado.actual.secciones.filter((s) => s.id !== accion.seccionId);
      const siguiente = normalizar({ ...estado.actual, secciones });
      return {
        ...conHistorial(estado, siguiente),
        seleccion: secciones[0] ? { seccionId: secciones[0].id, preguntaId: null } : null,
      };
    }

    case "agregarPregunta": {
      const seccion = estado.actual.secciones.find((s) => s.id === accion.seccionId);
      if (!seccion) return estado;
      const pregunta = nuevaPregunta(accion.tipoPregunta, seccion.id, seccion.preguntas.length);
      const preguntas = [...seccion.preguntas];
      const posicion = accion.despuesDe ? preguntas.findIndex((p) => p.id === accion.despuesDe) + 1 : preguntas.length;
      preguntas.splice(posicion, 0, pregunta);
      const siguiente = normalizar(
        mapSecciones(estado.actual, (s) => (s.id === seccion.id ? { ...s, preguntas } : s)),
      );
      return {
        ...conHistorial(estado, siguiente),
        seleccion: { seccionId: seccion.id, preguntaId: pregunta.id },
      };
    }

    case "editarPregunta":
      return conHistorial(
        estado,
        mapPregunta(estado.actual, accion.preguntaId, (pregunta) => ({ ...pregunta, ...accion.cambios })),
      );

    case "moverPregunta": {
      const encontrada = buscarPregunta(estado.actual, accion.preguntaId);
      if (!encontrada) return estado;
      const preguntas = [...encontrada.seccion.preguntas];
      const indice = preguntas.findIndex((p) => p.id === accion.preguntaId);
      const destino = indice + accion.delta;
      if (destino < 0 || destino >= preguntas.length) return estado;
      const [movida] = preguntas.splice(indice, 1);
      preguntas.splice(destino, 0, movida);
      return conHistorial(
        estado,
        normalizar(mapSecciones(estado.actual, (s) => (s.id === encontrada.seccion.id ? { ...s, preguntas } : s))),
      );
    }

    case "moverPreguntaASeccion": {
      const encontrada = buscarPregunta(estado.actual, accion.preguntaId);
      if (!encontrada || encontrada.seccion.id === accion.seccionId) return estado;
      const siguiente = mapSecciones(estado.actual, (seccion) => {
        if (seccion.id === encontrada.seccion.id) {
          return { ...seccion, preguntas: seccion.preguntas.filter((p) => p.id !== accion.preguntaId) };
        }
        if (seccion.id === accion.seccionId) {
          return {
            ...seccion,
            preguntas: [...seccion.preguntas, { ...encontrada.pregunta, seccionId: seccion.id }],
          };
        }
        return seccion;
      });
      return {
        ...conHistorial(estado, normalizar(siguiente)),
        seleccion: { seccionId: accion.seccionId, preguntaId: accion.preguntaId },
      };
    }

    case "duplicarPregunta": {
      const encontrada = buscarPregunta(estado.actual, accion.preguntaId);
      if (!encontrada) return estado;
      const preguntas = [...encontrada.seccion.preguntas];
      const indice = preguntas.findIndex((p) => p.id === accion.preguntaId);
      const copia = { ...duplicarPregunta(encontrada.pregunta, indice + 1), seccionId: encontrada.seccion.id };
      preguntas.splice(indice + 1, 0, copia);
      return {
        ...conHistorial(
          estado,
          normalizar(mapSecciones(estado.actual, (s) => (s.id === encontrada.seccion.id ? { ...s, preguntas } : s))),
        ),
        seleccion: { seccionId: encontrada.seccion.id, preguntaId: copia.id },
      };
    }

    case "eliminarPregunta": {
      const encontrada = buscarPregunta(estado.actual, accion.preguntaId);
      if (!encontrada) return estado;
      const siguiente = normalizar(
        mapSecciones(estado.actual, (seccion) => ({
          ...seccion,
          preguntas: seccion.preguntas.filter((p) => p.id !== accion.preguntaId),
        })),
      );
      const restantes = siguiente.secciones.find((s) => s.id === encontrada.seccion.id)?.preguntas ?? [];
      return {
        ...conHistorial(estado, siguiente),
        seleccion: { seccionId: encontrada.seccion.id, preguntaId: restantes[0]?.id ?? null },
      };
    }

    case "agregarOpcion":
      return conHistorial(
        estado,
        normalizar(
          mapPregunta(estado.actual, accion.preguntaId, (pregunta) => ({
            ...pregunta,
            opciones: [...pregunta.opciones, nuevaOpcion(pregunta.opciones.length)],
          })),
        ),
      );

    case "editarOpcion":
      return conHistorial(
        estado,
        mapPregunta(estado.actual, accion.preguntaId, (pregunta) => ({
          ...pregunta,
          opciones: pregunta.opciones.map((opcion) =>
            opcion.id === accion.opcionId ? { ...opcion, ...accion.cambios } : opcion,
          ),
        })),
      );

    case "moverOpcion":
      return conHistorial(
        estado,
        normalizar(
          mapPregunta(estado.actual, accion.preguntaId, (pregunta) => {
            const opciones = [...pregunta.opciones];
            const indice = opciones.findIndex((o) => o.id === accion.opcionId);
            const destino = indice + accion.delta;
            if (indice < 0 || destino < 0 || destino >= opciones.length) return pregunta;
            const [movida] = opciones.splice(indice, 1);
            opciones.splice(destino, 0, movida);
            return { ...pregunta, opciones };
          }),
        ),
      );

    case "eliminarOpcion":
      return conHistorial(
        estado,
        normalizar(
          mapPregunta(estado.actual, accion.preguntaId, (pregunta) => ({
            ...pregunta,
            opciones: pregunta.opciones.filter((o) => o.id !== accion.opcionId),
          })),
        ),
      );

    case "marcarCorrecta":
      /**
       * Marcar la correcta en una pregunta de respuesta ÚNICA desmarca las demás.
       *
       * El editor anterior usaba casillas independientes y permitía dejar dos
       * correctas en una pregunta de una sola respuesta: un estado imposible que el
       * candidato no podía acertar y que solo se descubría al publicar.
       */
      return conHistorial(
        estado,
        mapPregunta(estado.actual, accion.preguntaId, (pregunta) => {
          const unica = esRespuestaUnica(pregunta.tipo);
          return {
            ...pregunta,
            opciones: pregunta.opciones.map((opcion) => {
              if (opcion.id === accion.opcionId) return { ...opcion, correcta: accion.correcta };
              return unica && accion.correcta ? { ...opcion, correcta: false } : opcion;
            }),
          };
        }),
      );

    case "seleccionar":
      return { ...estado, seleccion: { seccionId: accion.seccionId, preguntaId: accion.preguntaId } };

    case "deshacer": {
      if (estado.pasado.length === 0) return estado;
      const anterior = estado.pasado[estado.pasado.length - 1];
      return {
        ...estado,
        actual: anterior,
        pasado: estado.pasado.slice(0, -1),
        futuro: [estado.actual, ...estado.futuro].slice(0, MAX_HISTORIAL),
      };
    }

    case "rehacer": {
      if (estado.futuro.length === 0) return estado;
      const siguiente = estado.futuro[0];
      return {
        ...estado,
        actual: siguiente,
        pasado: [...estado.pasado, estado.actual].slice(-MAX_HISTORIAL),
        futuro: estado.futuro.slice(1),
      };
    }

    default:
      return estado;
  }
}

/** ¿El tipo admite una sola respuesta correcta? */
function esRespuestaUnica(tipo: string): boolean {
  return (
    tipo === "opcion_unica" ||
    tipo === "desplegable" ||
    tipo === "verdadero_falso" ||
    tipo === "si_no_na" ||
    tipo === "opcion_imagen" ||
    tipo === "casilla_aceptacion"
  );
}

/** Todas las preguntas del documento, en orden de aparición. */
export function preguntasEnOrden(contenido: Contenido): { seccion: Seccion; pregunta: Pregunta }[] {
  return contenido.secciones.flatMap((seccion) => seccion.preguntas.map((pregunta) => ({ seccion, pregunta })));
}

/** Documento que se envía al servidor: el contenido tal cual. */
export function documentoParaGuardar(contenido: Contenido): { evaluacion: Evaluacion; secciones: Seccion[] } {
  return { evaluacion: contenido.evaluacion, secciones: contenido.secciones };
}

/** Atajo para editar un campo enriquecido de una pregunta. */
export function accionEnunciado(preguntaId: string, doc: RichDoc): AccionConstructor {
  return { tipo: "editarPregunta", preguntaId, cambios: { enunciado: doc } };
}
