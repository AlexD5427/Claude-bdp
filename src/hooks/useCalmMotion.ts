import { useReducedMotion } from "framer-motion";
import { useConfig } from "../lib/configStore";

/**
 * «Movimiento sereno»: verdadero cuando el sistema operativo pide menos
 * movimiento o cuando se activó «Reducir movimiento» en Configuración.
 *
 * Los efectos de la capa Liquid Glass Aurora (título por letras, magnificación
 * del dock, barrido entre módulos, inclinación de los KPI, luz que sigue al
 * puntero…) lo consultan para no montar siquiera sus escuchas: con movimiento
 * reducido no queda trabajo de fondo, no solo animaciones más cortas.
 */
export function useCalmMotion(): boolean {
  const prefersReduced = useReducedMotion();
  const { reduceMotion } = useConfig();
  return Boolean(prefersReduced) || reduceMotion;
}
