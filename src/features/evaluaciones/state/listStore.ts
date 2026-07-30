/**
 * Estado del listado: búsqueda, filtros, orden y vista.
 *
 * Vive en un store persistente porque el reclutador entra y sale del constructor
 * muchas veces al día y perder los filtros en cada vuelta es una fricción tonta.
 * Lo que NO se persiste son los datos: el listado siempre se relee del servidor.
 */

import { createStore } from "../../../shared/store";
import type { EstadoEvaluacion, ResumenEvaluacion } from "../domain/model";

export type VistaListado = "tarjetas" | "tabla";
export type OrdenListado = "recientes" | "antiguos" | "titulo" | "preguntas" | "intentos";

export const ORDEN_LABEL: Record<OrdenListado, string> = {
  recientes: "Actualización reciente",
  antiguos: "Actualización más antigua",
  titulo: "Título (A–Z)",
  preguntas: "Más preguntas",
  intentos: "Más intentos",
};

export interface FiltrosListado {
  estados: EstadoEvaluacion[];
  categorias: string[];
  soloConIntentos: boolean;
  soloPendientesRevision: boolean;
  incluirPapelera: boolean;
}

export interface EstadoListado {
  busqueda: string;
  vista: VistaListado;
  orden: OrdenListado;
  filtros: FiltrosListado;
}

const INICIAL: EstadoListado = {
  busqueda: "",
  vista: "tarjetas",
  orden: "recientes",
  filtros: {
    estados: [],
    categorias: [],
    soloConIntentos: false,
    soloPendientesRevision: false,
    incluirPapelera: false,
  },
};

export const listadoStore = createStore<EstadoListado>(INICIAL, {
  persistKey: "bdp-evaluaciones-listado",
  deserialize: (raw) => {
    try {
      const guardado = JSON.parse(raw) as Partial<EstadoListado>;
      return { ...INICIAL, ...guardado, filtros: { ...INICIAL.filtros, ...(guardado.filtros ?? {}) } };
    } catch {
      return INICIAL;
    }
  },
});

export function filtrosActivos(filtros: FiltrosListado): number {
  return (
    filtros.estados.length +
    filtros.categorias.length +
    (filtros.soloConIntentos ? 1 : 0) +
    (filtros.soloPendientesRevision ? 1 : 0) +
    (filtros.incluirPapelera ? 1 : 0)
  );
}

export function limpiarFiltros(): void {
  listadoStore.set((estado) => ({ ...estado, filtros: INICIAL.filtros }));
}

/**
 * Filtra en el cliente.
 *
 * El servidor ya filtra por estado y texto; esto refina sin una ida y vuelta más,
 * que para menos de un centenar de evaluaciones es lo razonable.
 */
export function aplicarFiltros(items: ResumenEvaluacion[], estado: EstadoListado): ResumenEvaluacion[] {
  const buscar = estado.busqueda.trim().toLowerCase();
  return items.filter((item) => {
    if (!estado.filtros.incluirPapelera && item.estado === "papelera") return false;
    if (estado.filtros.estados.length > 0 && !estado.filtros.estados.includes(item.estado)) return false;
    if (estado.filtros.categorias.length > 0 && !estado.filtros.categorias.includes(item.categoria)) return false;
    if (estado.filtros.soloConIntentos && item.intentos === 0) return false;
    if (buscar) {
      const heno = `${item.titulo} ${item.codigo} ${item.categoria} ${item.descripcion} ${item.etiquetas.join(" ")}`;
      if (!heno.toLowerCase().includes(buscar)) return false;
    }
    return true;
  });
}

export function aplicarOrden(items: ResumenEvaluacion[], orden: OrdenListado): ResumenEvaluacion[] {
  const copia = [...items];
  switch (orden) {
    case "antiguos":
      return copia.sort((a, b) => a.actualizadoEn.localeCompare(b.actualizadoEn));
    case "titulo":
      return copia.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
    case "preguntas":
      return copia.sort((a, b) => b.preguntas - a.preguntas);
    case "intentos":
      return copia.sort((a, b) => b.intentos - a.intentos);
    case "recientes":
    default:
      return copia.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn));
  }
}

export interface EstadisticasListado {
  total: number;
  publicadas: number;
  borradores: number;
  pausadas: number;
  cerradas: number;
  archivadas: number;
  papelera: number;
  intentos: number;
  preguntas: number;
}

export function estadisticas(items: ResumenEvaluacion[]): EstadisticasListado {
  const cuenta = (estado: EstadoEvaluacion) => items.filter((i) => i.estado === estado).length;
  return {
    total: items.filter((i) => i.estado !== "papelera").length,
    publicadas: cuenta("publicada"),
    borradores: cuenta("borrador"),
    pausadas: cuenta("pausada"),
    cerradas: cuenta("cerrada"),
    archivadas: cuenta("archivada"),
    papelera: cuenta("papelera"),
    intentos: items.reduce((suma, i) => suma + i.intentos, 0),
    preguntas: items.reduce((suma, i) => suma + i.preguntas, 0),
  };
}
