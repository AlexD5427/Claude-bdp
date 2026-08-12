/**
 * Exportacion de expedientes a Excel.
 *
 * Escribe el .xlsx a mano (OOXML dentro de un ZIP con entradas almacenadas, sin
 * compresion) en lugar de anadir una libreria de hojas de calculo. Motivos:
 *
 * 1. No suma peso al paquete del navegador ni una dependencia mas que auditar.
 * 2. Un ZIP «stored» es plenamente valido: Excel, LibreOffice y Google Sheets
 *    abren el archivo sin reparos.
 * 3. Todo el texto se escribe como `inlineStr`. Una celda de texto en OOXML
 *    nunca se evalua como formula, asi que la exportacion no puede convertirse
 *    en un vector de inyeccion. Para CSV, que si es vulnerable, se neutraliza
 *    explicitamente con `neutralizarFormula`.
 *
 * No se sube ningun archivo a ningun sitio: el libro se arma en memoria y se
 * entrega al navegador como descarga, de modo que no quedan URLs permanentes ni
 * copias temporales en Drive.
 */

import {
  DOC_ESTADO_GENERAL_LABEL,
  DOC_ESTADO_LABEL,
  diasRestantes,
  estadoProrroga,
  requisitoPorCodigo,
  tipoFuncionarioDef,
  tipoGarantiaDef,
  type DocEstadoGeneral,
} from "./docCatalog";
import {
  estadoGeneral,
  fechaLegible,
  requisitosDelBorrador,
  resumenDe,
  valorDe,
  type BorradorExpediente,
} from "./docBorrador";

/* ================================================================== */
/* Tipos publicos                                                     */
/* ================================================================== */

export interface EventoExportable {
  fecha: string;
  usuario: string;
  accion: string;
  requisito?: string;
  valorAnterior?: string;
  valorNuevo?: string;
  origen?: string;
  resultado?: string;
}

/** Un expediente listo para exportar: el borrador mas su metadato de servidor. */
export interface ExpedienteExportable extends BorradorExpediente {
  expedienteId?: string;
  creadoEn?: string;
  actualizadoPor?: string;
  estadoGeneral?: DocEstadoGeneral;
  historial?: EventoExportable[];
}

export type Celda = string | number | null;

export interface HojaLibro {
  nombre: string;
  filas: Celda[][];
  /** Anchos de columna en caracteres. */
  anchos?: number[];
}

export interface ArchivoExportado {
  nombre: string;
  tipo: string;
  datos: Uint8Array;
}

/**
 * Por encima de este numero de expedientes la exportacion se hace pesada en el
 * navegador. `exportarLote` lo respeta salvo que se pida lo contrario.
 */
export const LIMITE_LOTE = 500;

const TIPO_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* ================================================================== */
/* ZIP con entradas almacenadas                                       */
/* ================================================================== */

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i += 1) {
    c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function aBytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

/** Fecha y hora en el formato MS-DOS que exige la cabecera del ZIP. */
function selloDos(fecha: Date): { hora: number; dia: number } {
  const hora =
    (fecha.getHours() << 11) |
    (fecha.getMinutes() << 5) |
    Math.floor(fecha.getSeconds() / 2);
  const dia =
    ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  return { hora, dia };
}

interface EntradaZip {
  nombre: string;
  datos: Uint8Array;
}

function empaquetar(entradas: EntradaZip[], fecha: Date): Uint8Array {
  const { hora, dia } = selloDos(fecha);
  const locales: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    const nombre = aBytes(entrada.nombre);
    const suma = crc32(entrada.datos);
    const tam = entrada.datos.length;

    const cabecera = new Uint8Array(30 + nombre.length);
    const vista = new DataView(cabecera.buffer);
    vista.setUint32(0, 0x04034b50, true);
    vista.setUint16(4, 20, true); // version necesaria
    vista.setUint16(6, 0x0800, true); // nombres en UTF-8
    vista.setUint16(8, 0, true); // metodo: almacenado
    vista.setUint16(10, hora, true);
    vista.setUint16(12, dia, true);
    vista.setUint32(14, suma, true);
    vista.setUint32(18, tam, true);
    vista.setUint32(22, tam, true);
    vista.setUint16(26, nombre.length, true);
    vista.setUint16(28, 0, true);
    cabecera.set(nombre, 30);

    locales.push(cabecera, entrada.datos);

    const dir = new Uint8Array(46 + nombre.length);
    const vistaDir = new DataView(dir.buffer);
    vistaDir.setUint32(0, 0x02014b50, true);
    vistaDir.setUint16(4, 20, true);
    vistaDir.setUint16(6, 20, true);
    vistaDir.setUint16(8, 0x0800, true);
    vistaDir.setUint16(10, 0, true);
    vistaDir.setUint16(12, hora, true);
    vistaDir.setUint16(14, dia, true);
    vistaDir.setUint32(16, suma, true);
    vistaDir.setUint32(20, tam, true);
    vistaDir.setUint32(24, tam, true);
    vistaDir.setUint16(28, nombre.length, true);
    vistaDir.setUint32(42, desplazamiento, true);
    dir.set(nombre, 46);
    central.push(dir);

    desplazamiento += cabecera.length + tam;
  }

  const tamCentral = central.reduce((total, parte) => total + parte.length, 0);
  const fin = new Uint8Array(22);
  const vistaFin = new DataView(fin.buffer);
  vistaFin.setUint32(0, 0x06054b50, true);
  vistaFin.setUint16(8, entradas.length, true);
  vistaFin.setUint16(10, entradas.length, true);
  vistaFin.setUint32(12, tamCentral, true);
  vistaFin.setUint32(16, desplazamiento, true);

  const partes = [...locales, ...central, fin];
  const total = partes.reduce((suma, parte) => suma + parte.length, 0);
  const salida = new Uint8Array(total);
  let cursor = 0;
  for (const parte of partes) {
    salida.set(parte, cursor);
    cursor += parte.length;
  }
  return salida;
}

/* ================================================================== */
/* OOXML                                                              */
/* ================================================================== */

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Los controles que OOXML no admite romperian el archivo al abrirlo.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function letraColumna(indice: number): string {
  let n = indice + 1;
  let texto = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    texto = String.fromCharCode(65 + resto) + texto;
    n = Math.floor((n - 1) / 26);
  }
  return texto;
}

/** Excel rechaza estos caracteres en el nombre de una pestania y corta en 31. */
export function nombreHojaSeguro(nombre: string, usados: string[] = []): string {
  let limpio = nombre.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31);
  if (!limpio) limpio = "Hoja";
  let candidato = limpio;
  let n = 2;
  while (usados.includes(candidato)) {
    const sufijo = ` (${n})`;
    candidato = limpio.slice(0, 31 - sufijo.length) + sufijo;
    n += 1;
  }
  return candidato;
}

function hojaXml(hoja: HojaLibro): string {
  const filas = hoja.filas
    .map((fila, indiceFila) => {
      const celdas = fila
        .map((valor, indiceCelda) => {
          if (valor === null || valor === "") return "";
          const ref = `${letraColumna(indiceCelda)}${indiceFila + 1}`;
          const estilo = indiceFila === 0 ? ' s="1"' : ' s="2"';
          if (typeof valor === "number" && Number.isFinite(valor)) {
            return `<c r="${ref}"${estilo}><v>${valor}</v></c>`;
          }
          return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(
            String(valor),
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${indiceFila + 1}">${celdas}</row>`;
    })
    .join("");

  const anchos = hoja.anchos
    ? `<cols>${hoja.anchos
        .map(
          (ancho, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${anchos}<sheetData>${filas}</sheetData></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF005BAA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Arma el .xlsx completo en memoria. */
export function construirLibro(hojas: HojaLibro[], fecha: Date = new Date()): Uint8Array {
  if (hojas.length === 0) {
    throw new Error("No hay hojas que exportar.");
  }

  const usados: string[] = [];
  const seguras = hojas.map((hoja) => {
    const nombre = nombreHojaSeguro(hoja.nombre, usados);
    usados.push(nombre);
    return { ...hoja, nombre };
  });

  const idEstilos = `rId${seguras.length + 1}`;

  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${seguras
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}</Types>`;

  const raiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${seguras
    .map(
      (hoja, i) =>
        `<sheet name="${escaparXml(hoja.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;

  const relaciones = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${seguras
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join(
      "",
    )}<Relationship Id="${idEstilos}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const entradas: EntradaZip[] = [
    { nombre: "[Content_Types].xml", datos: aBytes(tipos) },
    { nombre: "_rels/.rels", datos: aBytes(raiz) },
    { nombre: "xl/workbook.xml", datos: aBytes(libro) },
    { nombre: "xl/_rels/workbook.xml.rels", datos: aBytes(relaciones) },
    { nombre: "xl/styles.xml", datos: aBytes(ESTILOS) },
    ...seguras.map((hoja, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: aBytes(hojaXml(hoja)),
    })),
  ];

  return empaquetar(entradas, fecha);
}

/* ================================================================== */
/* Contenido de las hojas                                             */
/* ================================================================== */

function texto(valor: string | null | undefined): string {
  return (valor ?? "").trim();
}

function etiquetaTipo(exp: ExpedienteExportable): string {
  if (!exp.tipoFuncionario) return "";
  return tipoFuncionarioDef(exp.tipoFuncionario)?.etiqueta ?? exp.tipoFuncionario;
}

function etiquetaGarantia(exp: ExpedienteExportable): string {
  if (!exp.tipoGarantia) return "";
  return tipoGarantiaDef(exp.tipoGarantia)?.titulo ?? exp.tipoGarantia;
}

function estadoDelExpediente(exp: ExpedienteExportable, hoy: Date): DocEstadoGeneral {
  return exp.estadoGeneral ?? estadoGeneral(exp, {}, hoy);
}

/** Cabecera comun a las hojas de requisitos, para que casen entre exportaciones. */
const CABECERA_REQUISITOS = [
  "Identificador",
  "Codigo",
  "Requisito",
  "Seccion",
  "Contexto",
  "Estado",
  "Observacion",
  "Fecha de prorroga",
  "Dias restantes",
  "Situacion de la prorroga",
  "Motivo de la prorroga",
];

const SITUACION: Record<string, string> = {
  sin_prorroga: "",
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  invalida: "Fecha no valida",
};

function filasRequisitos(exp: ExpedienteExportable, hoy: Date): Celda[][] {
  return requisitosDelBorrador(exp).map((req) => {
    const valor = valorDe(exp, req.codigo);
    const situacion = estadoProrroga(valor.prorroga ?? undefined, hoy);
    const dias = valor.prorroga ? diasRestantes(valor.prorroga, hoy) : null;
    return [
      exp.identificador,
      req.codigo,
      req.etiqueta,
      req.seccion === "DOCUMENTOS_GENERALES" ? "Documentos generales" : "Requisitos especiales",
      texto(req.contexto),
      DOC_ESTADO_LABEL[valor.estado],
      texto(valor.observacion),
      valor.prorroga ? fechaLegible(valor.prorroga) : "",
      dias === null ? "" : dias,
      SITUACION[situacion] ?? "",
      texto(valor.prorrogaMotivo),
    ];
  });
}

function hojaDatosGenerales(exp: ExpedienteExportable, hoy: Date): HojaLibro {
  const resumen = resumenDe(exp, hoy);
  return {
    nombre: "Datos generales",
    anchos: [34, 62],
    filas: [
      ["Campo", "Valor"],
      ["Identificador", exp.identificador],
      ["Nombre", exp.nombre],
      ["Cargo", exp.cargo],
      ["Agencia", exp.agencia],
      ["Gerencia", exp.gerencia],
      ["Fecha de ingreso", exp.fechaIngreso ? fechaLegible(exp.fechaIngreso) : ""],
      ["Tipo de funcionario", etiquetaTipo(exp)],
      ["Tipo de garantia", etiquetaGarantia(exp)],
      ["Estado general", DOC_ESTADO_GENERAL_LABEL[estadoDelExpediente(exp, hoy)]],
      ["Avance resuelto", `${resumen.porcentajeResuelto}%`],
      ["Requisitos aplicables", resumen.totalAplicable],
      ["Entregados", resumen.entregados],
      ["Pendientes", resumen.pendientes],
      ["No entregados", resumen.noEntregados],
      ["No aplica", resumen.noAplica],
      ["Con prorroga", resumen.conProrroga],
      ["Prorrogas vencidas", resumen.prorrogasVencidas],
      ["Identificador tecnico", texto(exp.expedienteId)],
      ["Creado", texto(exp.creadoEn)],
      ["Ultima actualizacion", texto(exp.actualizadoEn)],
      ["Actualizado por", texto(exp.actualizadoPor)],
      ["Exportado", hoy.toISOString()],
    ],
  };
}

function hojaHistorial(exp: ExpedienteExportable): HojaLibro {
  const eventos = exp.historial ?? [];
  return {
    nombre: "Historial",
    anchos: [22, 24, 26, 30, 28, 28, 14, 14],
    filas: [
      [
        "Fecha",
        "Usuario",
        "Accion",
        "Requisito",
        "Valor anterior",
        "Valor nuevo",
        "Origen",
        "Resultado",
      ],
      ...eventos.map((evento) => [
        evento.fecha,
        evento.usuario,
        evento.accion,
        texto(evento.requisito),
        texto(evento.valorAnterior),
        texto(evento.valorNuevo),
        texto(evento.origen),
        texto(evento.resultado),
      ]),
    ],
  };
}

/** Nombre de archivo sin caracteres que incomoden al sistema de archivos. */
export function nombreArchivoSeguro(base: string, fecha: Date = new Date()): string {
  const limpio = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const dia = fecha.toISOString().slice(0, 10);
  return `${limpio || "expedientes"}-${dia}.xlsx`;
}

/* ================================================================== */
/* Exportaciones                                                      */
/* ================================================================== */

/** Un expediente con todo su detalle: generales, requisitos, prorrogas e historial. */
export function exportarExpediente(
  exp: ExpedienteExportable,
  hoy: Date = new Date(),
): ArchivoExportado {
  const requisitos = filasRequisitos(exp, hoy);
  const conProrroga = requisitos.filter((fila) => texto(String(fila[7] ?? "")) !== "");

  const hojas: HojaLibro[] = [
    hojaDatosGenerales(exp, hoy),
    {
      nombre: "Requisitos",
      anchos: [20, 34, 46, 22, 30, 16, 46, 18, 14, 20, 40],
      filas: [CABECERA_REQUISITOS, ...requisitos],
    },
    {
      nombre: "Prorrogas",
      anchos: [20, 34, 46, 18, 14, 20, 40],
      filas: [
        [
          "Identificador",
          "Codigo",
          "Requisito",
          "Fecha de prorroga",
          "Dias restantes",
          "Situacion",
          "Motivo",
        ],
        ...conProrroga.map((fila) => [
          fila[0] ?? "",
          fila[1] ?? "",
          fila[2] ?? "",
          fila[7] ?? "",
          fila[8] ?? "",
          fila[9] ?? "",
          fila[10] ?? "",
        ]),
      ],
    },
    hojaHistorial(exp),
  ];

  return {
    nombre: nombreArchivoSeguro(`expediente-${exp.identificador || "sin-identificador"}`, hoy),
    tipo: TIPO_XLSX,
    datos: construirLibro(hojas, hoy),
  };
}

export interface OpcionesLote {
  /** Aparece en la hoja de resumen para dejar constancia del filtro aplicado. */
  descripcion?: string;
  incluirHistorial?: boolean;
  /** Permite superar `LIMITE_LOTE` de forma explicita. */
  forzar?: boolean;
  nombreBase?: string;
}

/**
 * Varios expedientes: sirve igual para una seleccion manual, para el resultado
 * de un filtro o para la base completa, que solo se diferencian en la lista que
 * se recibe y en la descripcion que se deja registrada.
 */
export function exportarLote(
  expedientes: ExpedienteExportable[],
  opciones: OpcionesLote = {},
  hoy: Date = new Date(),
): ArchivoExportado {
  if (expedientes.length === 0) {
    throw new Error("No hay expedientes que exportar con los criterios actuales.");
  }
  if (expedientes.length > LIMITE_LOTE && !opciones.forzar) {
    throw new Error(
      `La seleccion tiene ${expedientes.length} expedientes y el limite seguro es ${LIMITE_LOTE}. ` +
        "Afine el filtro o confirme la exportacion completa.",
    );
  }

  const filasExpedientes: Celda[][] = [];
  const filasRequisitosTodos: Celda[][] = [];
  const filasProrrogas: Celda[][] = [];
  const filasHistorial: Celda[][] = [];

  let entregados = 0;
  let pendientes = 0;
  let noEntregados = 0;
  let noAplica = 0;
  let aplicables = 0;
  let vencidas = 0;

  for (const exp of expedientes) {
    const resumen = resumenDe(exp, hoy);
    aplicables += resumen.totalAplicable;
    entregados += resumen.entregados;
    pendientes += resumen.pendientes;
    noEntregados += resumen.noEntregados;
    noAplica += resumen.noAplica;
    vencidas += resumen.prorrogasVencidas;

    filasExpedientes.push([
      exp.identificador,
      exp.nombre,
      exp.cargo,
      exp.agencia,
      exp.gerencia,
      exp.fechaIngreso ? fechaLegible(exp.fechaIngreso) : "",
      etiquetaTipo(exp),
      etiquetaGarantia(exp),
      DOC_ESTADO_GENERAL_LABEL[estadoDelExpediente(exp, hoy)],
      resumen.porcentajeResuelto,
      resumen.totalAplicable,
      resumen.entregados,
      resumen.pendientes,
      resumen.noEntregados,
      resumen.noAplica,
      resumen.conProrroga,
      resumen.prorrogasVencidas,
      texto(exp.actualizadoEn),
      texto(exp.actualizadoPor),
    ]);

    for (const fila of filasRequisitos(exp, hoy)) {
      filasRequisitosTodos.push(fila);
      if (texto(String(fila[7] ?? "")) !== "") {
        filasProrrogas.push([
          fila[0] ?? "",
          exp.nombre,
          fila[1] ?? "",
          fila[2] ?? "",
          fila[7] ?? "",
          fila[8] ?? "",
          fila[9] ?? "",
          fila[10] ?? "",
        ]);
      }
    }

    if (opciones.incluirHistorial) {
      for (const evento of exp.historial ?? []) {
        filasHistorial.push([
          exp.identificador,
          evento.fecha,
          evento.usuario,
          evento.accion,
          texto(evento.requisito),
          texto(evento.valorAnterior),
          texto(evento.valorNuevo),
          texto(evento.origen),
          texto(evento.resultado),
        ]);
      }
    }
  }

  const porcentaje =
    aplicables === 0 ? 0 : Math.round(((entregados + noAplica) / aplicables) * 100);

  const hojas: HojaLibro[] = [
    {
      nombre: "Resumen",
      anchos: [34, 26],
      filas: [
        ["Concepto", "Valor"],
        ["Expedientes exportados", expedientes.length],
        ["Criterio", texto(opciones.descripcion) || "Seleccion manual"],
        ["Requisitos aplicables", aplicables],
        ["Entregados", entregados],
        ["Pendientes", pendientes],
        ["No entregados", noEntregados],
        ["No aplica", noAplica],
        ["Avance resuelto", `${porcentaje}%`],
        ["Prorrogas vencidas", vencidas],
        ["Generado", hoy.toISOString()],
      ],
    },
    {
      nombre: "Expedientes",
      anchos: [20, 32, 30, 22, 26, 16, 28, 26, 18, 10, 12, 12, 12, 14, 10, 12, 14, 22, 22],
      filas: [
        [
          "Identificador",
          "Nombre",
          "Cargo",
          "Agencia",
          "Gerencia",
          "Fecha de ingreso",
          "Tipo de funcionario",
          "Tipo de garantia",
          "Estado general",
          "% resuelto",
          "Aplicables",
          "Entregados",
          "Pendientes",
          "No entregados",
          "N/A",
          "Con prorroga",
          "Prorrogas vencidas",
          "Ultima actualizacion",
          "Actualizado por",
        ],
        ...filasExpedientes,
      ],
    },
    {
      nombre: "Requisitos",
      anchos: [20, 34, 46, 22, 30, 16, 46, 18, 14, 20, 40],
      filas: [CABECERA_REQUISITOS, ...filasRequisitosTodos],
    },
    {
      nombre: "Prorrogas",
      anchos: [20, 32, 34, 46, 18, 14, 20, 40],
      filas: [
        [
          "Identificador",
          "Nombre",
          "Codigo",
          "Requisito",
          "Fecha de prorroga",
          "Dias restantes",
          "Situacion",
          "Motivo",
        ],
        ...filasProrrogas,
      ],
    },
  ];

  if (opciones.incluirHistorial) {
    hojas.push({
      nombre: "Auditoria",
      anchos: [20, 22, 24, 26, 30, 28, 28, 14, 14],
      filas: [
        [
          "Identificador",
          "Fecha",
          "Usuario",
          "Accion",
          "Requisito",
          "Valor anterior",
          "Valor nuevo",
          "Origen",
          "Resultado",
        ],
        ...filasHistorial,
      ],
    });
  }

  return {
    nombre: nombreArchivoSeguro(opciones.nombreBase ?? "expedientes-documentacion", hoy),
    tipo: TIPO_XLSX,
    datos: construirLibro(hojas, hoy),
  };
}

/* ================================================================== */
/* CSV y descarga                                                     */
/* ================================================================== */

/**
 * Antepone un apostrofo a los valores que una hoja de calculo interpretaria
 * como formula al abrir un CSV. Solo hace falta en CSV: el .xlsx que genera
 * este modulo escribe texto como `inlineStr`, que nunca se evalua.
 */
export function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

export function aCsv(filas: Celda[][]): string {
  return filas
    .map((fila) =>
      fila
        .map((celda) => {
          if (celda === null) return "";
          if (typeof celda === "number") return String(celda);
          const seguro = neutralizarFormula(celda);
          return `"${seguro.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Entrega el archivo al navegador y libera el objeto URL en cuanto termina. */
export function descargarArchivo(archivo: ArchivoExportado): void {
  if (typeof document === "undefined") return;
  const copia = new Uint8Array(archivo.datos);
  const blob = new Blob([copia], { type: archivo.tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = archivo.nombre;
  enlace.rel = "noopener";
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Atajo: construye y descarga en un solo paso. */
export function descargarExpediente(
  exp: ExpedienteExportable,
  hoy: Date = new Date(),
): ArchivoExportado {
  const archivo = exportarExpediente(exp, hoy);
  descargarArchivo(archivo);
  return archivo;
}

export function descargarLote(
  expedientes: ExpedienteExportable[],
  opciones: OpcionesLote = {},
  hoy: Date = new Date(),
): ArchivoExportado {
  const archivo = exportarLote(expedientes, opciones, hoy);
  descargarArchivo(archivo);
  return archivo;
}

/** Solo se usa en el titulo de la exportacion; se expone para las pruebas. */
export function etiquetaEstadoGeneral(estado: DocEstadoGeneral): string {
  return DOC_ESTADO_GENERAL_LABEL[estado];
}

export function requisitoLegible(codigo: string): string {
  return requisitoPorCodigo(codigo)?.etiqueta ?? codigo;
}
