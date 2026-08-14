/**
 * Barril del módulo de Documentación.
 *
 * La aplicación importa desde aquí y no de las carpetas internas: así el módulo
 * puede reorganizarse por dentro sin tocar `App.tsx`. Se exportan la consola, el
 * cliente y el dominio, que es lo que otros módulos podrían necesitar; no se
 * exportan las secciones ni las piezas de interfaz, que son detalle interno.
 */

export { DocumentacionConsola } from "./ui/DocumentacionConsola";
export { VistaLocal } from "./ui/VistaLocal";
export { docApi } from "./api/acciones";
export { DocError, configurarCliente, hayBackendConfigurado } from "./api/client";
export * from "./domain/vocabulario";
export * from "./domain/progreso";
export { construirXlsx, descargarXlsx, unirLotes, nombreConFecha } from "./export/xlsx";
