/**
 * MÓDULO — Documentación.
 *
 * Punto de entrada del módulo. Toda la implementación vive en
 * `src/features/documentacion/`, siguiendo la organización por características que
 * el repositorio ya usa para Procesos y Evaluaciones: dominio, api, estado y
 * pantallas separados.
 *
 * Este archivo se queda en `modules/` porque es lo que `App.tsx` monta cuando se
 * navega al módulo, y mover esa referencia no aportaría nada.
 */

export { DocumentacionConsola as Documentacion } from "../features/documentacion";
