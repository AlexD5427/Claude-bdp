/**
 * Puntaje total de la evaluación y su reparto entre las preguntas.
 *
 * ── El problema ──────────────────────────────────────────────────────────────
 * Cada pregunta nacía con 1 punto, así que una prueba de 20 preguntas valía 20 y
 * una de 33, 33. La nota se calcula igual —es un porcentaje— pero todo lo que se
 * lee alrededor (los puntos de cada pregunta, el criterio de aprobación en
 * puntos, el informe que firma el analista) hablaba en una escala distinta en
 * cada evaluación. La convención del equipo es sobre 100.
 *
 * ── La decisión ──────────────────────────────────────────────────────────────
 * La evaluación declara un OBJETIVO de puntaje total (100 por omisión) y el
 * módulo reparte ese total entre las preguntas que puntúan. El reparto vive aquí,
 * en el dominio, y no en la interfaz, porque tiene que dar el mismo resultado
 * cuando se aplica al crear, al importar, al añadir una pregunta y al pulsar
 * «Repartir ahora».
 *
 * ── Por qué el reparto es exacto y no «100 / n» ───────────────────────────────
 * 100 entre 3 son 33,333… Si se redondea cada parte por separado, la suma da
 * 99,99 o 100,01 y el criterio de aprobación en puntos deja de cuadrar. Aquí se
 * reparte con RESTO: cada pregunta recibe la parte entera en centésimas y las
 * centésimas sobrantes se entregan de una en una a las primeras preguntas. La
 * suma es exactamente el objetivo, siempre.
 *
 * El objetivo se guarda en `evaluacion.extras.puntajeTotalObjetivo`, que el
 * backend ya persiste como JSON (`extras_json`): no hace falta ninguna columna
 * nueva ni ningún cambio en Apps Script.
 */

import { tipoSpec } from "./questionTypes";
import type { Evaluacion, Seccion } from "./model";

/** Puntaje total de una evaluación nueva, salvo que el autor diga otra cosa. */
export const PUNTAJE_TOTAL_POR_OMISION = 100;

/** Clave dentro de `extras` donde vive el objetivo. */
export const CLAVE_OBJETIVO = "puntajeTotalObjetivo";

/**
 * Objetivo de puntaje declarado, o `null` si el autor lo desactivó.
 *
 * `undefined` (una evaluación creada antes de esta función) se lee como el valor
 * por omisión: es lo que el equipo espera y evita una migración de datos.
 */
export function objetivoPuntaje(evaluacion: Pick<Evaluacion, "extras">): number | null {
  const bruto = (evaluacion.extras ?? {})[CLAVE_OBJETIVO];
  if (bruto === null) return null;
  if (bruto === undefined) return PUNTAJE_TOTAL_POR_OMISION;
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.min(10000, Math.round(numero * 100) / 100);
}

/** Nuevos `extras` con el objetivo puesto (o desactivado con `null`). */
export function conObjetivoPuntaje(
  extras: Record<string, unknown>,
  objetivo: number | null,
): Record<string, unknown> {
  return { ...extras, [CLAVE_OBJETIVO]: objetivo };
}

/** ¿Esta pregunta participa del reparto? */
function participa(pregunta: Seccion["preguntas"][number]): boolean {
  const spec = tipoSpec(pregunta.tipo);
  return spec?.kind === "pregunta" && pregunta.modoPuntaje !== "ninguno";
}

/** Preguntas que reparten puntaje, en orden de aparición. */
export function preguntasConPuntaje(secciones: Seccion[]): number {
  return secciones.reduce((suma, seccion) => suma + seccion.preguntas.filter(participa).length, 0);
}

/** Suma de los puntos declarados hoy. */
export function puntosDeclarados(secciones: Seccion[]): number {
  let total = 0;
  for (const seccion of secciones) {
    for (const pregunta of seccion.preguntas) {
      if (participa(pregunta)) total += Number(pregunta.puntos) || 0;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Reparte `objetivo` puntos entre las preguntas que puntúan.
 *
 * `pesos` permite que una pregunta valga más que otra: es el peso relativo con el
 * que participa en el reparto (por omisión, 1). Cuando una sección declara
 * `peso`, ese peso se aplica a todas sus preguntas, que es la forma en la que el
 * equipo piensa el reparto («la parte de casos vale el doble»).
 *
 * Devuelve secciones nuevas; no modifica las de entrada.
 */
export function repartirPuntaje(secciones: Seccion[], objetivo: number): Seccion[] {
  const participantes: { seccion: number; pregunta: number; peso: number }[] = [];
  secciones.forEach((seccion, s) => {
    const pesoSeccion = Number(seccion.peso) > 0 ? Number(seccion.peso) : 1;
    seccion.preguntas.forEach((pregunta, p) => {
      if (participa(pregunta)) participantes.push({ seccion: s, pregunta: p, peso: pesoSeccion });
    });
  });
  if (participantes.length === 0) return secciones;

  // Todo el reparto se hace en CENTÉSIMAS enteras para que la suma sea exacta.
  const totalCentesimas = Math.round(objetivo * 100);
  const sumaPesos = participantes.reduce((suma, p) => suma + p.peso, 0);

  const partes = participantes.map((p) => Math.floor((totalCentesimas * p.peso) / sumaPesos));
  let resto = totalCentesimas - partes.reduce((suma, parte) => suma + parte, 0);
  for (let i = 0; resto > 0; i = (i + 1) % partes.length) {
    partes[i] += 1;
    resto -= 1;
  }

  const porPregunta = new Map<string, number>();
  participantes.forEach((p, i) => {
    porPregunta.set(`${p.seccion}:${p.pregunta}`, partes[i] / 100);
  });

  return secciones.map((seccion, s) => ({
    ...seccion,
    preguntas: seccion.preguntas.map((pregunta, p) => {
      const puntos = porPregunta.get(`${s}:${p}`);
      if (puntos === undefined || puntos === pregunta.puntos) return pregunta;
      return { ...pregunta, puntos };
    }),
  }));
}

/**
 * Aplica el reparto SOLO si la evaluación tiene objetivo declarado.
 *
 * Es el punto por el que pasa el reductor tras cada cambio de contenido: así
 * añadir la pregunta 21 vuelve a repartir los 100 puntos sin que nadie tenga que
 * acordarse de pulsar nada.
 */
export function repartirSiCorresponde(
  evaluacion: Pick<Evaluacion, "extras">,
  secciones: Seccion[],
): Seccion[] {
  const objetivo = objetivoPuntaje(evaluacion);
  if (objetivo === null) return secciones;
  return repartirPuntaje(secciones, objetivo);
}

/** Texto para la interfaz: «100 puntos repartidos entre 20 preguntas (5 c/u)». */
export function describirReparto(secciones: Seccion[], objetivo: number | null): string {
  const cuantas = preguntasConPuntaje(secciones);
  if (objetivo === null) return "Reparto manual: cada pregunta lleva los puntos que le pongas.";
  if (cuantas === 0) return `${objetivo} puntos en total. Se repartirán al agregar la primera pregunta.`;
  const cada = Math.round((objetivo / cuantas) * 100) / 100;
  return `${objetivo} puntos repartidos entre ${cuantas} pregunta(s): ${cada} cada una.`;
}
