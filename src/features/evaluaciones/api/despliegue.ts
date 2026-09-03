/**
 * Despliegue de Evaluaciones por omisión — el respaldo para los enlaces viejos.
 *
 * ── Por qué existe este archivo ─────────────────────────────────────────────
 * Desde ahora, cada enlace público lleva dentro la referencia del despliegue al
 * que pertenece, así que abre en cualquier equipo sin configurar nada. Pero los
 * enlaces que se compartieron ANTES de este cambio no la llevan: si el
 * postulante no tiene la configuración del módulo —y no la tiene—, no hay forma
 * de saber a qué libro pertenece esa evaluación.
 *
 * Hay dos maneras de arreglar esos enlaces antiguos:
 *
 *   1. **volver a copiar el enlace** desde el módulo y reenviarlo. El código de
 *      la evaluación NO cambia, así que es literalmente copiar y pegar otra vez.
 *      Es lo que la pantalla de error le dice al postulante que pida;
 *   2. **pegar aquí el identificador del despliegue.** Entonces cualquier enlace
 *      —viejo o nuevo— resuelve contra él cuando no trae referencia propia.
 *
 * La segunda es un cambio de una línea en el repositorio, del mismo tipo que
 * `SCRIPT_URL` en `src/constants.ts`, que ya vive así desde el principio. No
 * hace falta ninguna variable de entorno.
 *
 * ── Qué pegar exactamente ────────────────────────────────────────────────────
 * De la URL del despliegue del Web App:
 *
 *     https://script.google.com/macros/s/AKfycbz…UNA_CADENA_LARGA…/exec
 *                                        └────────── esto ──────────┘
 *
 * Si el despliegue es de un dominio de Workspace
 * (`https://script.google.com/a/macros/MI-DOMINIO/s/AKfycb…/exec`), pega también
 * el dominio en `DOMINIO_POR_OMISION`.
 *
 * Dejarlo vacío es perfectamente válido: el módulo funciona igual y los enlaces
 * nuevos siguen siendo portátiles por sí solos.
 *
 * ── ¿Es un secreto? ─────────────────────────────────────────────────────────
 * No. La URL de un Web App de Apps Script publicado con acceso «cualquier
 * usuario» es pública por definición: es la dirección que abre el postulante. Lo
 * que sí es secreto es la LLAVE de administración, y esa no está aquí ni puede
 * estar: vive en las propiedades del script y en el navegador de quien
 * administra.
 */

/** Identificador del despliegue (`AKfycb…`). Vacío = sin respaldo. */
export const DESPLIEGUE_POR_OMISION = "";

/** Dominio de Workspace, solo para despliegues `/a/macros/<dominio>/…`. */
export const DOMINIO_POR_OMISION = "";
