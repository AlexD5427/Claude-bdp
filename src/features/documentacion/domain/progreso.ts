/**
 * Cálculos de dominio del cliente: progreso, plazos y formato.
 *
 * ── Qué hace aquí y no en el servidor ────────────────────────────────────────
 * Nada que decida. El backend calcula los totales y los guarda; esta capa
 * reordena lo que llega para pintarlo y calcula lo que depende de HOY —días
 * restantes, si algo está por vencer— porque un número de días guardado en una
 * celda miente al día siguiente.
 *
 * Todas las funciones son puras: reciben datos, devuelven datos. Es lo que
 * permite probarlas sin montar un componente ni una conexión.
 */

import {
  ETIQUETA_DOCUMENTO,
  ETIQUETA_EXPEDIENTE,
  SECCIONES_CATALOGO,
  type EstadoDocumento,
  type EstadoExpediente,
} from "./vocabulario";

/* ------------------------------------------------------------------ */
/* Tipos que llegan del backend                                        */
/* ------------------------------------------------------------------ */

export interface TotalesExpediente {
  requisitos: number;
  resueltos: number;
  entregados: number;
  pendientes: number;
  noEntregados: number;
  noAplica: number;
  observados: number;
  prorrogas: number;
  prorrogasVencidas: number;
}

export interface ExpedienteCabecera {
  expedienteId: string;
  identificador: string;
  identificadorNormalizado?: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  fechaIngreso: string;
  diasDesdeIngreso: number | null;
  tipoFuncionario: string;
  tipoFuncionarioEtiqueta: string;
  tipoGarantia: string;
  tipoGarantiaEtiqueta: string;
  responsableId: string;
  estado: EstadoExpediente;
  porcentaje: number;
  totales: TotalesExpediente;
  proximaFechaCritica: string;
  diasParaFechaCritica: number | null;
  version: number;
  estadoOperacion: string;
  creadoEn: string;
  creadoPor: string;
  actualizadoEn: string;
  actualizadoPor: string;
  archivadoEn?: string;
  archivadoPor?: string;
  anio: number;
}

export interface RequisitoVista {
  expedienteDocumentoId: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  seccion: string;
  grupo: string;
  orden: number;
  estado: EstadoDocumento;
  observaciones: string;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  permiteProrroga: boolean;
  estadoRevision: string;
  revisionActualId: string;
  aprobacionActualId: string;
  requiereRevision: boolean;
  requiereAprobacion: boolean;
  version: number;
  archivado: boolean;
  prorrogas: ProrrogaVista[];
  actualizadoEn: string;
  actualizadoPor: string;
}

export interface ProrrogaVista {
  prorrogaId: string;
  expedienteId: string;
  expedienteDocumentoId: string;
  codigo: string;
  nombre: string;
  fechaOriginal: string;
  fechaProrroga: string;
  diasRestantes: number | null;
  situacion: string;
  motivo: string;
  estado: string;
  solicitadaPor: string;
  aprobadaPor: string;
  fechaAprobacion: string;
  creadoEn: string;
  version: number;
  expediente?: { identificador: string; nombre: string; agencia?: string } | null;
}

/* ------------------------------------------------------------------ */
/* Agrupación de requisitos                                            */
/* ------------------------------------------------------------------ */

export interface GrupoRequisitos {
  seccion: string;
  etiqueta: string;
  requisitos: RequisitoVista[];
  total: number;
  resueltos: number;
  porcentaje: number;
}

/**
 * Agrupa los requisitos por sección, en el orden funcional del catálogo.
 *
 * Cada grupo trae su propio avance porque es la pregunta que se hace de verdad al
 * abrir un expediente comercial: «los generales están, ¿y la garantía?».
 */
export function agruparRequisitos(requisitos: RequisitoVista[]): GrupoRequisitos[] {
  const orden = new Map(SECCIONES_CATALOGO.map((s) => [s.codigo, s]));
  const grupos = new Map<string, RequisitoVista[]>();

  for (const requisito of requisitos) {
    if (requisito.archivado) continue;
    const clave = requisito.seccion || "generales";
    const lista = grupos.get(clave) ?? [];
    lista.push(requisito);
    grupos.set(clave, lista);
  }

  return [...grupos.entries()]
    .map(([seccion, lista]) => {
      const ordenados = [...lista].sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo));
      const aplicables = ordenados.filter((r) => r.estado !== "NO_APLICA");
      const entregados = ordenados.filter((r) => r.estado === "ENTREGADO");
      return {
        seccion,
        etiqueta: orden.get(seccion)?.etiqueta ?? seccion,
        requisitos: ordenados,
        total: ordenados.length,
        resueltos: entregados.length + (ordenados.length - aplicables.length),
        porcentaje: aplicables.length ? Math.round((entregados.length / aplicables.length) * 100) : 100,
      };
    })
    .sort((a, b) => (orden.get(a.seccion)?.orden ?? 99) - (orden.get(b.seccion)?.orden ?? 99));
}

/** Requisitos que hay que perseguir, en el orden en que conviene hacerlo. */
export function requisitosPendientes(requisitos: RequisitoVista[]): RequisitoVista[] {
  const observados = requisitos.filter(
    (r) => !r.archivado && (r.estadoRevision === "OBSERVADO" || r.estadoRevision === "REQUIERE_CORRECCION" || r.estadoRevision === "RECHAZADO"),
  );
  const faltantes = requisitos.filter(
    (r) => !r.archivado && (r.estado === "PENDIENTE" || r.estado === "NO_ENTREGADO") && !observados.includes(r),
  );
  return [...observados, ...faltantes];
}

/* ------------------------------------------------------------------ */
/* Progreso                                                           */
/* ------------------------------------------------------------------ */

/**
 * Recalcula los totales a partir de los requisitos.
 *
 * El backend ya los manda materializados; esto existe para la edición rápida: al
 * marcar un requisito la interfaz puede mostrar el avance nuevo en el mismo
 * fotograma, sin esperar la respuesta. Cuando llega, manda la del servidor.
 */
export function totalesDesdeRequisitos(requisitos: RequisitoVista[]): TotalesExpediente {
  const vigentes = requisitos.filter((r) => !r.archivado);
  const entregados = vigentes.filter((r) => r.estado === "ENTREGADO").length;
  const pendientes = vigentes.filter((r) => r.estado === "PENDIENTE").length;
  const noEntregados = vigentes.filter((r) => r.estado === "NO_ENTREGADO").length;
  const noAplica = vigentes.filter((r) => r.estado === "NO_APLICA").length;
  const observados = vigentes.filter(
    (r) => r.estadoRevision === "OBSERVADO" || r.estadoRevision === "REQUIERE_CORRECCION" || r.estadoRevision === "RECHAZADO",
  ).length;
  const prorrogas = vigentes.reduce((suma, r) => suma + r.prorrogas.filter((p) => p.situacion !== "cerrada").length, 0);
  const prorrogasVencidas = vigentes.reduce((suma, r) => suma + r.prorrogas.filter((p) => p.situacion === "vencida").length, 0);

  return {
    requisitos: vigentes.length,
    resueltos: entregados + noAplica,
    entregados,
    pendientes,
    noEntregados,
    noAplica,
    observados,
    prorrogas,
    prorrogasVencidas,
  };
}

/** Porcentaje de avance con la misma regla del backend: los N/A no cuentan. */
export function porcentajeDe(totales: TotalesExpediente): number {
  const denominador = totales.requisitos - totales.noAplica;
  if (denominador <= 0) return totales.requisitos ? 100 : 0;
  return Math.round((totales.entregados / denominador) * 100);
}

/* ------------------------------------------------------------------ */
/* Fechas y plazos                                                     */
/* ------------------------------------------------------------------ */

/** Hoy en `yyyy-mm-dd`, en la zona del navegador. */
export function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fecha `yyyy-mm-dd` a `n` días de hoy. Sirve para proponer plazos. */
export function fechaEnDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Días entre hoy y una fecha. Negativo si ya pasó. `null` si no hay fecha. */
export function diasHasta(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const objetivo = new Date(`${String(fecha).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(objetivo.getTime())) return null;
  const base = new Date(`${hoy()}T00:00:00`);
  return Math.round((objetivo.getTime() - base.getTime()) / 86400000);
}

/** Fecha en formato corto y legible: «15 mar 2026». */
export function fechaCorta(valor: string | null | undefined): string {
  if (!valor) return "—";
  const iso = String(valor).slice(0, 10);
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

/** Marca de tiempo legible: «15 mar 2026, 14:32». */
export function fechaHora(valor: string | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(String(valor));
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString("es-BO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Plazo en lenguaje llano.
 *
 * «Vence hoy» y «vencida hace 3 días» dicen lo mismo que «-3» y se entienden sin
 * pensar. En una lista de plazos eso es la diferencia entre revisar y adivinar.
 */
export function textoPlazo(fecha: string | null | undefined): string {
  const dias = diasHasta(fecha);
  if (dias === null) return "Sin plazo";
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  if (dias > 1) return `Vence en ${dias} días`;
  if (dias === -1) return "Venció ayer";
  return `Venció hace ${Math.abs(dias)} días`;
}

/** Antigüedad en lenguaje llano, para la cabecera del expediente. */
export function textoAntiguedad(dias: number | null): string {
  if (dias === null) return "Sin fecha de ingreso";
  if (dias <= 0) return "Ingresa hoy";
  if (dias === 1) return "1 día desde el ingreso";
  return `${dias} días desde el ingreso`;
}

/* ------------------------------------------------------------------ */
/* Resumen textual del cliente                                        */
/* ------------------------------------------------------------------ */

/**
 * Resumen de una lista de expedientes.
 *
 * El del expediente individual lo genera el backend (es el que puede acabar en un
 * informe). Este es para la franja de resultados de la lista: cuántos hay, cuánto
 * avanzan y qué está en riesgo.
 */
export function resumenDeLista(expedientes: ExpedienteCabecera[]): string {
  if (!expedientes.length) return "Sin expedientes que mostrar con estos filtros.";
  const total = expedientes.length;
  const completos = expedientes.filter((e) => e.porcentaje >= 100).length;
  const observados = expedientes.filter((e) => e.totales.observados > 0).length;
  const vencidas = expedientes.filter((e) => e.totales.prorrogasVencidas > 0).length;
  const avance = Math.round(expedientes.reduce((s, e) => s + e.porcentaje, 0) / total);

  const partes = [`${total} expediente${total === 1 ? "" : "s"}`, `avance promedio ${avance}%`];
  if (completos) partes.push(`${completos} completo${completos === 1 ? "" : "s"}`);
  if (observados) partes.push(`${observados} con observaciones`);
  if (vencidas) partes.push(`${vencidas} con prórrogas vencidas`);
  return `${partes.join(" · ")}.`;
}

/** Etiqueta legible de un estado de expediente, con reserva al código. */
export function etiquetaExpediente(estado: string): string {
  return ETIQUETA_EXPEDIENTE[estado as EstadoExpediente] ?? estado;
}

/** Etiqueta legible de un estado documental, con reserva al código. */
export function etiquetaDocumento(estado: string): string {
  return ETIQUETA_DOCUMENTO[estado as EstadoDocumento] ?? estado;
}

/* ------------------------------------------------------------------ */
/* Filtros                                                            */
/* ------------------------------------------------------------------ */

export interface FiltrosExpedientes {
  texto?: string;
  estado?: string;
  agencia?: string;
  gerencia?: string;
  tipoFuncionario?: string;
  tipoGarantia?: string;
  responsable?: string;
  anio?: number | "";
  progresoMin?: number | "";
  progresoMax?: number | "";
  conPendientes?: boolean;
  conNoEntregados?: boolean;
  conObservados?: boolean;
  conProrrogas?: boolean;
  conProrrogasVencidas?: boolean;
  conSolicitudesVencidas?: boolean;
  conTareasVencidas?: boolean;
  ingresoDesde?: string;
  ingresoHasta?: string;
  creadoDesde?: string;
  creadoHasta?: string;
  incluirArchivados?: boolean;
  orden?: string;
  direccion?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
}

export const FILTROS_VACIOS: FiltrosExpedientes = {
  texto: "",
  estado: "",
  agencia: "",
  gerencia: "",
  tipoFuncionario: "",
  tipoGarantia: "",
  responsable: "",
  anio: "",
  progresoMin: "",
  progresoMax: "",
  conPendientes: false,
  conNoEntregados: false,
  conObservados: false,
  conProrrogas: false,
  conProrrogasVencidas: false,
  conSolicitudesVencidas: false,
  conTareasVencidas: false,
  ingresoDesde: "",
  ingresoHasta: "",
  creadoDesde: "",
  creadoHasta: "",
  incluirArchivados: false,
  orden: "reciente",
  direccion: "desc",
  pagina: 1,
  porPagina: 25,
};

/** Cuántos filtros hay puestos. Alimenta el contador del botón «Filtros». */
export function filtrosActivos(filtros: FiltrosExpedientes): number {
  let total = 0;
  for (const [clave, valor] of Object.entries(filtros)) {
    if (["orden", "direccion", "pagina", "porPagina"].includes(clave)) continue;
    if (valor === undefined || valor === null || valor === "" || valor === false) continue;
    total += 1;
  }
  return total;
}

/**
 * Deja los filtros listos para viajar.
 *
 * Se quitan los vacíos: mandar `agencia: ""` haría que el backend filtrara por
 * una agencia sin nombre y devolvería cero resultados.
 */
export function filtrosParaBackend(filtros: FiltrosExpedientes): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === "" || valor === false) continue;
    salida[clave] = valor;
  }
  return salida;
}
