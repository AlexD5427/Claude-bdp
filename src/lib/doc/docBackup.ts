/**
 * docBackup.ts — espejo local y transferencia de datos.
 *
 * El módulo vivió un tiempo sin backend, así que hay trabajo real guardado solo
 * en el navegador de una persona. Ese dato no tiene copia en ningún sitio: si se
 * limpia el almacenamiento del navegador, desaparece. Sacarlo de ahí es la
 * función más importante de este archivo.
 *
 * Por eso la importación acepta tres formatos distintos y ninguno es
 * negociable:
 *
 *   1. El espejo nuevo, `{ formato: "bdp-documentacion", dossiers: [...] }`.
 *   2. El volcado crudo de `localStorage`, `{ dossiers: { id: {...} } }`. Es lo
 *      que se obtiene copiando la clave `bdp-documentacion` desde las
 *      herramientas del navegador, y es exactamente lo que la persona tiene
 *      ahora mismo.
 *   3. Un array suelto de expedientes, por si alguien recorta el archivo.
 *
 * Nada se importa a ciegas: primero se analiza y se informa de qué va a pasar.
 */

import {
  dossierYear,
  normalizeDossier,
  sheetValuesFor,
  DOC_BASE_COLUMNS,
  type Dossier,
} from "./docSchema";
import {
  importarDossiers,
  snapshotEstado,
  type DocState,
  type ModoImportacion,
} from "../docStore";
import { dossierReport } from "../docReport";

export const FORMATO = "bdp-documentacion";
export const VERSION_ESPEJO = 2;

export interface ArchivoEspejo {
  formato: string;
  version: number;
  generado: string;
  origen: string;
  total: number;
  settings?: DocState["settings"];
  dossiers: Dossier[];
}

/* ------------------------------------------------------------------ */
/* Descarga                                                            */
/* ------------------------------------------------------------------ */

function descargar(nombre: string, contenido: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Sin esto el blob queda retenido en memoria mientras viva la pestaña.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function marcaTiempo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Construye el espejo sin descargarlo (útil para previsualizar o probar). */
export function construirEspejo(incluirAjustes = true): ArchivoEspejo {
  const estado = snapshotEstado();
  const dossiers = Object.values(estado.dossiers);
  return {
    formato: FORMATO,
    version: VERSION_ESPEJO,
    generado: new Date().toISOString(),
    origen: "web",
    total: dossiers.length,
    settings: incluirAjustes ? estado.settings : undefined,
    dossiers,
  };
}

/** Descarga la base local completa como copia exacta. */
export function exportarEspejo(incluirAjustes = true): { total: number; nombre: string } {
  const espejo = construirEspejo(incluirAjustes);
  const nombre = `documentacion-espejo-${marcaTiempo()}.json`;
  descargar(nombre, JSON.stringify(espejo, null, 2), "application/json;charset=utf-8");
  return { total: espejo.total, nombre };
}

function escaparCsv(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Exporta a CSV con las mismas columnas del libro.
 *
 * Separador `;` y BOM al inicio: es lo que Excel en español espera. Con coma y
 * sin BOM, el archivo se abre en una sola columna y con los acentos rotos.
 */
export function exportarCsv(intervalDays = 3): { total: number; nombre: string } {
  const estado = snapshotEstado();
  const dossiers = Object.values(estado.dossiers);

  const columnasDoc = DOC_BASE_COLUMNS.filter((c) => c.grupo === "documento");
  const cabeceras = [
    "Nombre",
    "Cargo",
    "Oficina",
    "Gerencia",
    "Correo",
    "Fecha Ingreso",
    "Año",
    "Avance %",
    "Presentados",
    "Pendientes",
    "Observados",
    "Páginas",
    "Estado",
    ...columnasDoc.map((c) => c.encabezado.replace(/\n/g, " ")),
    "ID Expediente",
  ];

  const filas = dossiers.map((d) => {
    const r = dossierReport(d, intervalDays);
    const valores = sheetValuesFor(d);
    return [
      d.nombre,
      d.cargo,
      d.agencia,
      d.gerencia,
      d.correo,
      d.fechaIngreso,
      dossierYear(d),
      r.completionPct,
      r.presentados,
      r.pendientes,
      r.observados,
      r.totalPages,
      r.healthLabel,
      ...columnasDoc.map((c) => valores[c.clave] ?? ""),
      d.identificador,
    ];
  });

  const csv = [cabeceras, ...filas].map((f) => f.map(escaparCsv).join(";")).join("\r\n");
  const nombre = `documentacion-${marcaTiempo()}.csv`;
  descargar(nombre, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  return { total: dossiers.length, nombre };
}

/* ------------------------------------------------------------------ */
/* Lectura de archivos                                                 */
/* ------------------------------------------------------------------ */

export interface AnalisisImportacion {
  ok: boolean;
  error?: string;
  formatoDetectado: "espejo" | "localStorage" | "array" | "desconocido";
  generado?: string;
  total: number;
  validos: Dossier[];
  descartados: { motivo: string; muestra: string }[];
  nuevos: string[];
  existentes: string[];
  traeAjustes: boolean;
  anios: number[];
}

function muestraDe(valor: unknown): string {
  try {
    const s = JSON.stringify(valor);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return String(valor);
  }
}

/**
 * Interpreta el contenido de un archivo y dice qué pasaría al importarlo.
 *
 * No modifica nada. La confirmación es un paso aparte a propósito: importar
 * puede sobrescribir expedientes y conviene ver el recuento antes.
 */
export function analizarContenido(texto: string): AnalisisImportacion {
  const vacio: AnalisisImportacion = {
    ok: false,
    formatoDetectado: "desconocido",
    total: 0,
    validos: [],
    descartados: [],
    nuevos: [],
    existentes: [],
    traeAjustes: false,
    anios: [],
  };

  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ...vacio, error: "El archivo no es JSON válido. ¿Se abrió y guardó con otro programa?" };
  }

  let crudos: unknown[] = [];
  let formatoDetectado: AnalisisImportacion["formatoDetectado"] = "desconocido";
  let generado: string | undefined;
  let traeAjustes = false;

  if (Array.isArray(json)) {
    crudos = json;
    formatoDetectado = "array";
  } else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;

    if (Array.isArray(o.dossiers)) {
      crudos = o.dossiers;
      formatoDetectado = o.formato === FORMATO ? "espejo" : "array";
      generado = typeof o.generado === "string" ? o.generado : undefined;
      traeAjustes = !!o.settings;
    } else if (o.dossiers && typeof o.dossiers === "object") {
      // El volcado crudo de localStorage: un objeto indexado por identificador.
      crudos = Object.values(o.dossiers as Record<string, unknown>);
      formatoDetectado = "localStorage";
      traeAjustes = !!o.settings;
    } else if (o.identificador || o.nombre) {
      crudos = [o];
      formatoDetectado = "array";
    }
  }

  if (!crudos.length) {
    return {
      ...vacio,
      formatoDetectado,
      error:
        "No se encontraron expedientes dentro del archivo. Se admite el espejo descargado, la copia de la clave «bdp-documentacion» o una lista de expedientes.",
    };
  }

  const validos: Dossier[] = [];
  const descartados: { motivo: string; muestra: string }[] = [];
  const vistos = new Set<string>();

  for (const crudo of crudos) {
    const d = normalizeDossier(crudo);
    if (!d) {
      descartados.push({ motivo: "Sin identificador ni nombre", muestra: muestraDe(crudo) });
      continue;
    }
    if (vistos.has(d.identificador)) {
      descartados.push({ motivo: "Repetido dentro del archivo", muestra: d.nombre });
      continue;
    }
    vistos.add(d.identificador);
    validos.push(d);
  }

  const actuales = snapshotEstado().dossiers;
  const nuevos: string[] = [];
  const existentes: string[] = [];
  const anios = new Set<number>();

  for (const d of validos) {
    anios.add(dossierYear(d));
    if (actuales[d.identificador]) existentes.push(d.nombre);
    else nuevos.push(d.nombre);
  }

  return {
    ok: validos.length > 0,
    formatoDetectado,
    generado,
    total: crudos.length,
    validos,
    descartados,
    nuevos,
    existentes,
    traeAjustes,
    anios: Array.from(anios).sort((a, b) => b - a),
    error: validos.length ? undefined : "Ningún expediente del archivo se pudo leer.",
  };
}

/** Lee un archivo elegido en el navegador y lo analiza. */
export function analizarArchivo(file: File): Promise<AnalisisImportacion> {
  return new Promise((resolve) => {
    const lector = new FileReader();
    lector.onload = () => resolve(analizarContenido(String(lector.result ?? "")));
    lector.onerror = () =>
      resolve({
        ok: false,
        error: "No se pudo leer el archivo.",
        formatoDetectado: "desconocido",
        total: 0,
        validos: [],
        descartados: [],
        nuevos: [],
        existentes: [],
        traeAjustes: false,
        anios: [],
      });
    lector.readAsText(file, "utf-8");
  });
}

/** Aplica una importación ya analizada. */
export async function aplicarImportacion(
  analisis: AnalisisImportacion,
  modo: ModoImportacion = "fusionar",
  subirAlBackend = true,
) {
  if (!analisis.ok || !analisis.validos.length) {
    return { leidos: 0, aplicados: 0, omitidos: 0, subidos: 0, error: "No hay nada que importar." };
  }
  return importarDossiers(analisis.validos, modo, subirAlBackend);
}

/**
 * Recupera los datos directamente de `localStorage`.
 *
 * Atajo para el caso habitual: la persona sigue en el mismo navegador donde
 * trabajó, así que no hace falta que exporte y vuelva a subir un archivo. Lee
 * también claves antiguas por si una versión previa usó otro nombre.
 */
export function rescatarDeLocalStorage(): AnalisisImportacion | null {
  if (typeof window === "undefined") return null;
  const claves = ["bdp-documentacion", "documentacion", "bdp_documentacion"];
  for (const clave of claves) {
    try {
      const crudo = window.localStorage.getItem(clave);
      if (!crudo) continue;
      const analisis = analizarContenido(crudo);
      if (analisis.ok) return analisis;
    } catch {
      /* clave ilegible: se prueba la siguiente */
    }
  }
  return null;
}
