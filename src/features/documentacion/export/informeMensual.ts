/**
 * Informe de avance mensual.
 *
 * ── Qué produce ─────────────────────────────────────────────────────────────
 * Toma los expedientes de un mes (por su fecha de ingreso), los agrupa por
 * CATEGORÍA de funcionario, dentro de cada categoría por PERSONA, y por persona
 * el detalle de CADA documento con su estado y su observación. Sobre esa
 * estructura genera tres entregables: Excel (.xlsx), Word (.doc) y PDF (a través
 * de la impresión del navegador).
 *
 * ── Por qué se arma en el cliente ───────────────────────────────────────────
 * Los datos ya vienen del backend (una lectura por expediente); armar el archivo
 * aquí evita dejar copias con datos personales en Drive y permite probar la
 * agregación sin un navegador: son funciones puras que reciben expedientes y
 * devuelven la estructura y los archivos.
 */

import type { ExpedienteOperativo } from "../api/acciones";
import { categoriaDe } from "../domain/categorias";
import { etiquetaDocumento } from "../domain/progreso";
import type { Celda, Libro } from "./xlsx";

/* ------------------------------------------------------------------ */
/* Estructura del informe                                              */
/* ------------------------------------------------------------------ */

export interface DocInforme {
  codigo: string;
  nombre: string;
  seccion: string;
  estado: string;
  estadoEtiqueta: string;
  observaciones: string;
  prorroga: string;
}

export interface PersonaInforme {
  expedienteId: string;
  identificador: string;
  nombre: string;
  cargo: string;
  agencia: string;
  gerencia: string;
  fechaIngreso: string;
  estado: string;
  porcentaje: number;
  entregados: number;
  pendientes: number;
  noEntregados: number;
  noAplica: number;
  observados: number;
  documentos: DocInforme[];
}

export interface CategoriaInforme {
  codigo: string;
  etiqueta: string;
  color: string;
  personas: PersonaInforme[];
  avancePromedio: number;
}

export interface InformeMensual {
  mes: string; // YYYY-MM
  etiquetaMes: string;
  generado: string;
  totalPersonas: number;
  avancePromedio: number;
  categorias: CategoriaInforme[];
}

const SECCION_ETIQUETA: Record<string, string> = {
  generales: "Documentos generales",
  garantia: "Garantía comercial",
  cumplimiento: "Cumplimiento y UIF",
};

/** Etiqueta legible «agosto de 2026» a partir de `YYYY-MM`. */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-").map((n) => parseInt(n, 10));
  if (!a || !m) return mes;
  const d = new Date(a, m - 1, 1);
  const texto = d.toLocaleDateString("es-BO", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** ¿Cae la fecha de ingreso (YYYY-MM-DD) dentro del mes YYYY-MM? */
export function enElMes(fechaIngreso: string | undefined, mes: string): boolean {
  if (!fechaIngreso) return false;
  return String(fechaIngreso).slice(0, 7) === mes;
}

/* ------------------------------------------------------------------ */
/* Agregación                                                          */
/* ------------------------------------------------------------------ */

/**
 * Construye el informe a partir de los expedientes ya cargados con su detalle.
 *
 * Se ordena de forma estable: las categorías por su orden institucional
 * (comercial, auditoría, cumplimiento, general…) y las personas por nombre, para
 * que dos ejecuciones del mismo mes den el mismo documento.
 */
export function construirInforme(expedientes: ExpedienteOperativo[], mes: string): InformeMensual {
  const porCategoria = new Map<string, PersonaInforme[]>();

  for (const exp of expedientes) {
    const cab = exp.expediente;
    const cat = categoriaDe(cab.tipoFuncionario);
    const documentos: DocInforme[] = exp.requisitos
      .filter((r) => !r.archivado)
      .map((r) => {
        const prorrogaVigente = r.prorrogas.find((p) => p.situacion !== "cerrada");
        return {
          codigo: r.codigo,
          nombre: r.nombre,
          seccion: SECCION_ETIQUETA[r.seccion] ?? r.seccion,
          estado: r.estado,
          estadoEtiqueta: etiquetaDocumento(r.estado),
          observaciones: r.observaciones ?? "",
          prorroga: prorrogaVigente ? `${prorrogaVigente.fechaProrroga} (${prorrogaVigente.situacion})` : "",
        };
      });

    const persona: PersonaInforme = {
      expedienteId: cab.expedienteId,
      identificador: cab.identificador,
      nombre: cab.nombre,
      cargo: cab.cargo,
      agencia: cab.agencia,
      gerencia: cab.gerencia,
      fechaIngreso: cab.fechaIngreso,
      estado: cab.estado,
      porcentaje: cab.porcentaje,
      entregados: cab.totales.entregados,
      pendientes: cab.totales.pendientes,
      noEntregados: cab.totales.noEntregados,
      noAplica: cab.totales.noAplica,
      observados: cab.totales.observados,
      documentos,
    };

    const clave = cat.codigo;
    const lista = porCategoria.get(clave) ?? [];
    lista.push(persona);
    porCategoria.set(clave, lista);
  }

  // Orden de categorías: el del catálogo de identidad, con «general» al final.
  const ordenCat = ["COMERCIAL", "AUDITORIA", "CUMPLIMIENTO", "EJECUTIVO", "DIRECTORIO", "GENERAL"];
  const categorias: CategoriaInforme[] = [...porCategoria.entries()]
    .map(([codigo, personas]) => {
      const cat = categoriaDe(codigo);
      personas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      const avance = personas.length ? Math.round(personas.reduce((s, p) => s + p.porcentaje, 0) / personas.length) : 0;
      return { codigo, etiqueta: cat.etiqueta, color: cat.color, personas, avancePromedio: avance };
    })
    .sort((a, b) => {
      const ia = ordenCat.indexOf(a.codigo);
      const ib = ordenCat.indexOf(b.codigo);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  const totalPersonas = expedientes.length;
  const avancePromedio = totalPersonas
    ? Math.round(expedientes.reduce((s, e) => s + e.expediente.porcentaje, 0) / totalPersonas)
    : 0;

  return {
    mes,
    etiquetaMes: etiquetaMes(mes),
    generado: new Date().toISOString(),
    totalPersonas,
    avancePromedio,
    categorias,
  };
}

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

/** Construye el libro de Excel con tres hojas: Resumen, Detalle y Observaciones. */
export function informeALibro(informe: InformeMensual): Libro {
  const resumen: Celda[][] = [
    ["Informe de avance mensual"],
    ["Mes", informe.etiquetaMes],
    ["Generado", new Date(informe.generado).toLocaleString("es-BO")],
    ["Personas del mes", informe.totalPersonas],
    ["Avance promedio", `${informe.avancePromedio}%`],
    [],
    ["Categoría", "Personas", "Avance promedio"],
    ...informe.categorias.map((c) => [c.etiqueta, c.personas.length, `${c.avancePromedio}%`] as Celda[]),
  ];

  const detalle: Celda[][] = [
    ["Categoría", "Identificador", "Nombre", "Cargo", "Agencia", "Gerencia", "Fecha ingreso", "Sección", "Documento", "Estado", "Observación", "Prórroga"],
  ];
  const observaciones: Celda[][] = [["Categoría", "Nombre", "Documento", "Estado", "Observación"]];

  for (const cat of informe.categorias) {
    for (const p of cat.personas) {
      for (const d of p.documentos) {
        detalle.push([cat.etiqueta, p.identificador, p.nombre, p.cargo, p.agencia, p.gerencia, p.fechaIngreso, d.seccion, d.nombre, d.estadoEtiqueta, d.observaciones, d.prorroga]);
        if (d.observaciones.trim()) observaciones.push([cat.etiqueta, p.nombre, d.nombre, d.estadoEtiqueta, d.observaciones]);
      }
    }
  }

  return { Resumen: resumen, Detalle: detalle, Observaciones: observaciones };
}

/* ------------------------------------------------------------------ */
/* HTML (para PDF y Word)                                              */
/* ------------------------------------------------------------------ */

function esc(v: string): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function chipEstadoHtml(estado: string, etiqueta: string): string {
  const color =
    estado === "ENTREGADO" ? "#15803d;background:#dcfce7" : estado === "PENDIENTE" ? "#92400e;background:#fef3c7" : estado === "NO_ENTREGADO" ? "#b91c1c;background:#fee2e2" : "#475569;background:#e2e8f0";
  return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;color:${color}">${esc(etiqueta)}</span>`;
}

/**
 * Documento HTML autocontenido del informe.
 *
 * Sirve tanto para imprimir a PDF como para abrir en Word: es HTML con estilos
 * en línea, sin dependencias externas ni scripts.
 */
export function informeAHtml(informe: InformeMensual): string {
  const secciones = informe.categorias
    .map((cat) => {
      const personas = cat.personas
        .map((p) => {
          const filas = p.documentos
            .map(
              (d) => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px">${esc(d.seccion)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px">${esc(d.nombre)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${chipEstadoHtml(d.estado, d.estadoEtiqueta)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:12px;color:#475569">${esc(d.observaciones || "—")}</td>
        </tr>`,
            )
            .join("");
          return `
      <div style="margin:14px 0;break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ${cat.color};padding-bottom:4px">
          <div>
            <strong style="font-size:14px">${esc(p.nombre)}</strong>
            <span style="color:#64748b;font-size:12px"> · ${esc(p.identificador)}${p.cargo ? ` · ${esc(p.cargo)}` : ""}</span>
          </div>
          <div style="font-size:12px;color:#334155">${p.porcentaje}% · ${esc(p.agencia || "Sin agencia")}</div>
        </div>
        <div style="font-size:11px;color:#64748b;margin:3px 0">
          Ingreso: ${esc(p.fechaIngreso || "—")} · Entregados ${p.entregados} · Pendientes ${p.pendientes} · No entregados ${p.noEntregados} · Observados ${p.observados}
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:4px">
          <thead>
            <tr style="text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase">
              <th style="padding:4px 8px">Sección</th><th style="padding:4px 8px">Documento</th><th style="padding:4px 8px;text-align:center">Estado</th><th style="padding:4px 8px">Observación</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
        })
        .join("");
      return `
    <section style="margin-top:22px;break-inside:avoid">
      <h2 style="font-size:16px;margin:0 0 2px;color:${cat.color}">${esc(cat.etiqueta)}</h2>
      <div style="font-size:12px;color:#64748b;margin-bottom:6px">${cat.personas.length} persona(s) · avance promedio ${cat.avancePromedio}%</div>
      ${personas}
    </section>`;
    })
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe mensual · ${esc(informe.etiquetaMes)}</title>
<style>
  @page { margin: 18mm 14mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#0f172a; margin:0; padding:24px; }
  h1 { font-size:22px; margin:0; }
  table { border-collapse: collapse; }
</style></head>
<body>
  <header style="border-bottom:3px solid #0ea5e9;padding-bottom:10px;margin-bottom:8px">
    <h1>Informe de avance documental</h1>
    <div style="font-size:13px;color:#334155">Banco de Desarrollo Productivo S.A.M. · ${esc(informe.etiquetaMes)}</div>
    <div style="font-size:12px;color:#64748b;margin-top:6px">
      ${informe.totalPersonas} persona(s) · avance promedio ${informe.avancePromedio}% · generado ${new Date(informe.generado).toLocaleString("es-BO")}
    </div>
  </header>
  ${informe.totalPersonas === 0 ? '<p style="color:#64748b">No hay ingresos registrados en este mes.</p>' : secciones}
  <footer style="margin-top:26px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px">
    Generado por el módulo de Documentación · los datos provienen del libro de Google Sheets del área.
  </footer>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* Descargas                                                           */
/* ------------------------------------------------------------------ */

function descargarBlob(blob: Blob, nombre: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga el informe como documento de Word (.doc), a partir del HTML. */
export function descargarWord(informe: InformeMensual, base: string): void {
  const html = informeAHtml(informe);
  const conCabecera = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">${html.slice(html.indexOf("<head>"))}`;
  const blob = new Blob(["\ufeff", conCabecera], { type: "application/msword" });
  descargarBlob(blob, `${base}.doc`);
}

/**
 * Envía el informe a la impresión del navegador (para guardarlo como PDF).
 *
 * Usa un `iframe` oculto en lugar de una ventana nueva para no chocar con los
 * bloqueadores de ventanas emergentes. El `iframe` se retira cuando la impresión
 * termina.
 */
export function imprimirInforme(informe: InformeMensual): void {
  if (typeof document === "undefined") return;
  const html = informeAHtml(informe);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const ventana = iframe.contentWindow!;
  const imprimir = () => {
    ventana.focus();
    ventana.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };
  // Espera a que el iframe cargue su contenido antes de imprimir.
  if (doc.readyState === "complete") setTimeout(imprimir, 200);
  else iframe.onload = () => setTimeout(imprimir, 200);
}
