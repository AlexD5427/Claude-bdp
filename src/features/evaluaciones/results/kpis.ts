/**
 * Indicadores de una convocatoria.
 *
 * ── Qué se mide y por qué ────────────────────────────────────────────────────
 * El panel de resultados mostraba promedio, mediana y tasa de aprobación. Están
 * bien, pero no responden las preguntas que se hacen de verdad al cerrar una
 * convocatoria: ¿la prueba discriminó o todos sacaron lo mismo? ¿hay un grupo
 * claro de finalistas? ¿alguna pregunta la falló casi todo el mundo (mala
 * pregunta) o la acertó todo el mundo (pregunta regalada)? ¿cuánto tiempo usaron
 * de verdad?
 *
 * ── Dos reglas que se respetan en todo el archivo ────────────────────────────
 *  1. Los agregados solo cuentan notas FIRMES. Un intento pendiente de revisión
 *     no tiene nota; meterlo como cero hundiría el promedio y haría que la
 *     decisión se tomara sobre un dato falso.
 *  2. Los intentos ANULADOS no cuentan para nada. Anular existe precisamente para
 *     sacar un intento de las cuentas.
 */

import type { Intento } from "../domain/model";

export interface Tramo {
  desde: number;
  hasta: number;
  cuantos: number;
  etiqueta: string;
}

export interface KpisConvocatoria {
  /** Intentos que cuentan (todos menos los anulados). */
  considerados: number;
  enviados: number;
  enCurso: number;
  expirados: number;
  pendientes: number;
  conNota: number;
  promedio: number | null;
  mediana: number | null;
  minima: number | null;
  maxima: number | null;
  /** Desviación típica: mide si la prueba separó a los candidatos. */
  desviacion: number | null;
  /** Diferencia entre el mejor y el peor: el recorrido de la nota. */
  recorrido: number | null;
  aprobados: number;
  reprobados: number;
  tasaAprobacion: number | null;
  duracionPromedio: number | null;
  duracionMediana: number | null;
  /** Proporción del tiempo disponible que se usó, si la prueba tenía límite. */
  usoDelTiempo: number | null;
  riesgoAlto: number;
  tasaFinalizacion: number | null;
  distribucion: Tramo[];
  mejores: { nombre: string; documento: string; nota: number; intentoId: string }[];
  /** Nota a partir de la cual está el 25 % superior. */
  cuartilSuperior: number | null;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0
    ? redondear((orden[medio - 1] + orden[medio]) / 2)
    : redondear(orden[medio]);
}

function percentil(valores: number[], proporcion: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const posicion = (orden.length - 1) * proporcion;
  const bajo = Math.floor(posicion);
  const alto = Math.ceil(posicion);
  if (bajo === alto) return redondear(orden[bajo]);
  return redondear(orden[bajo] + (orden[alto] - orden[bajo]) * (posicion - bajo));
}

function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}

const TRAMOS: { desde: number; hasta: number; etiqueta: string }[] = [
  { desde: 0, hasta: 20, etiqueta: "0–20" },
  { desde: 20, hasta: 40, etiqueta: "21–40" },
  { desde: 40, hasta: 60, etiqueta: "41–60" },
  { desde: 60, hasta: 80, etiqueta: "61–80" },
  { desde: 80, hasta: 100, etiqueta: "81–100" },
];

export function calcularKpis(
  intentos: Intento[],
  contexto: { duracionMinutos: number | null },
): KpisConvocatoria {
  const considerados = intentos.filter((intento) => intento.estado !== "anulado");
  const notas = considerados
    .map((intento) => intento.nota)
    .filter((nota): nota is number => typeof nota === "number");
  const duraciones = considerados
    .filter((intento) => intento.estado === "enviado" || intento.estado === "expirado")
    .map((intento) => intento.segundosUsados)
    .filter((segundos) => segundos > 0);

  const promedio = notas.length > 0 ? redondear(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
  const desviacion =
    notas.length > 1 && promedio !== null
      ? redondear(
          Math.sqrt(notas.reduce((suma, nota) => suma + (nota - promedio) ** 2, 0) / (notas.length - 1)),
        )
      : null;

  const conVeredicto = considerados.filter((intento) => intento.aprobado !== null);
  const aprobados = conVeredicto.filter((intento) => intento.aprobado === true).length;

  const duracionPromedio =
    duraciones.length > 0 ? Math.round(duraciones.reduce((s, d) => s + d, 0) / duraciones.length) : null;
  const limite = contexto.duracionMinutos ? contexto.duracionMinutos * 60 : null;

  return {
    considerados: considerados.length,
    enviados: considerados.filter((i) => i.estado === "enviado").length,
    enCurso: considerados.filter((i) => i.estado === "en_curso").length,
    expirados: considerados.filter((i) => i.estado === "expirado").length,
    pendientes: considerados.filter((i) => i.estadoCalificacion === "pendiente_revision").length,
    conNota: notas.length,
    promedio,
    mediana: mediana(notas),
    minima: notas.length > 0 ? redondear(Math.min(...notas)) : null,
    maxima: notas.length > 0 ? redondear(Math.max(...notas)) : null,
    desviacion,
    recorrido: notas.length > 1 ? redondear(Math.max(...notas) - Math.min(...notas)) : null,
    aprobados,
    reprobados: conVeredicto.length - aprobados,
    tasaAprobacion: conVeredicto.length > 0 ? Math.round((aprobados / conVeredicto.length) * 100) : null,
    duracionPromedio,
    duracionMediana: duraciones.length > 0 ? Math.round(mediana(duraciones) ?? 0) : null,
    usoDelTiempo: limite && duracionPromedio ? Math.min(100, Math.round((duracionPromedio / limite) * 100)) : null,
    riesgoAlto: considerados.filter((intento) => (intento.resumenIntegridad as { nivel?: string }).nivel === "alto")
      .length,
    tasaFinalizacion:
      considerados.length > 0
        ? Math.round((considerados.filter((i) => i.estado === "enviado" || i.estado === "expirado").length /
            considerados.length) *
            100)
        : null,
    distribucion: TRAMOS.map((tramo) => ({
      ...tramo,
      cuantos: notas.filter((nota) =>
        tramo.hasta === 100 ? nota >= tramo.desde && nota <= 100 : nota >= tramo.desde && nota < tramo.hasta,
      ).length,
    })),
    mejores: considerados
      .filter((intento) => typeof intento.nota === "number")
      .sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))
      .slice(0, 5)
      .map((intento) => ({
        nombre: intento.participante.nombre || "Sin nombre",
        documento: intento.participante.documento,
        nota: intento.nota ?? 0,
        intentoId: intento.id,
      })),
    cuartilSuperior: percentil(notas, 0.75),
  };
}

/**
 * Lectura en una frase de lo que dicen los números.
 *
 * No es adorno: quien mira este panel tiene que decidir a quién entrevista, y una
 * desviación de 4 puntos sobre 30 candidatos significa que la prueba no separó a
 * nadie y que la decisión hay que tomarla con otra evidencia.
 */
export function interpretar(kpis: KpisConvocatoria): string {
  if (kpis.conNota === 0) {
    return kpis.pendientes > 0
      ? `Todavía no hay notas firmes: ${kpis.pendientes} intento(s) esperan revisión humana.`
      : "Todavía no hay notas: comparte el enlace público para empezar a recibir intentos.";
  }
  const partes: string[] = [];
  if (kpis.desviacion !== null) {
    if (kpis.desviacion < 6) {
      partes.push(
        `las notas están muy juntas (±${kpis.desviacion}), así que esta prueba no separó a los candidatos`,
      );
    } else if (kpis.desviacion > 18) {
      partes.push(`hay mucha dispersión (±${kpis.desviacion}): la prueba distingue bien`);
    } else {
      partes.push(`la dispersión es razonable (±${kpis.desviacion})`);
    }
  }
  if (kpis.tasaAprobacion !== null) partes.push(`aprobó el ${kpis.tasaAprobacion} %`);
  if (kpis.cuartilSuperior !== null) partes.push(`el 25 % superior está desde ${kpis.cuartilSuperior} puntos`);
  if (kpis.pendientes > 0) partes.push(`${kpis.pendientes} intento(s) siguen pendientes de revisión`);
  if (kpis.riesgoAlto > 0) partes.push(`${kpis.riesgoAlto} con señales de integridad que conviene mirar`);
  return `${partes.join("; ")}.`;
}
