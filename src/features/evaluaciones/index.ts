/**
 * Superficie pública del módulo de Evaluaciones.
 *
 * El resto de la aplicación importa SOLO desde aquí. Ningún otro módulo conoce las
 * tripas de este: eso es lo que permitió borrar el módulo anterior por completo sin
 * tocar Procesos ni el resto del ATS, y lo que permitirá volver a hacerlo si algún
 * día hace falta.
 */

import { ok, type Result } from "../../shared/result";
import { listarEvaluaciones } from "./api/client";
import type { AppErrorEvaluaciones } from "./api/envelope";

export { EvaluacionesModule } from "./ui/EvaluacionesModule";
export { Runner, codigoDesdeHash } from "./runner/Runner";
export { ConnectionPanel } from "./ui/ConnectionPanel";

/** Evaluación tal como la ve ProcessOS al vincularla a un proceso. */
export interface LinkableAssessment {
  id: string;
  name: string;
  code: string;
  estado: string;
  preguntas: number;
}

/**
 * Catálogo para la sección de vinculación de ProcessOS.
 *
 * Es a propósito una proyección mínima: Procesos no necesita —ni debe— conocer el
 * modelo completo de una evaluación. Si el módulo de Evaluaciones no está
 * configurado, devuelve una lista vacía en lugar de un error: no poder vincular una
 * evaluación no debe impedir editar un proceso.
 */
export async function listLinkableAssessments(): Promise<Result<LinkableAssessment[], AppErrorEvaluaciones>> {
  const res = await listarEvaluaciones({ estados: ["borrador", "publicada", "pausada", "cerrada"] });
  if (!res.ok) return ok([]);
  return ok(
    res.value.items.map((item) => ({
      id: item.id,
      name: item.titulo,
      code: item.codigo,
      estado: item.estado,
      preguntas: item.preguntas,
    })),
  );
}
