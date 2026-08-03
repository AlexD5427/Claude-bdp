/**
 * Arnés para ejecutar el backend de Evaluaciones dentro de Node.
 *
 * Los archivos `.gs` de `apps-script/evaluaciones/` son JavaScript que corre en el
 * runtime V8 de Apps Script. Este módulo los concatena y los evalúa en un
 * contexto de `node:vm` con implementaciones en memoria de `SpreadsheetApp`,
 * `LockService`, `PropertiesService`, `CacheService`, `Utilities`, `Session`,
 * `ScriptApp` y `ContentService`.
 *
 * Gracias a esto las pruebas del repositorio ejercitan EL MISMO código que se
 * copia a Apps Script: no hay una reimplementación paralela que pueda
 * desincronizarse del backend real.
 *
 * El doble de `SpreadsheetApp` reproduce a propósito dos comportamientos que
 * costaron caros en la versión anterior del módulo:
 *
 *   1. una celda no admite más de 50 000 caracteres, y Sheets aborta la
 *      escritura EN esa celda dejando la fila a medias;
 *   2. `setValues` exige que la matriz tenga exactamente las dimensiones del
 *      rango.
 *
 * Un doble más permisivo que la realidad no prueba nada.
 */

import { createContext, runInContext } from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = join(HERE, "..", "apps-script", "evaluaciones");

/**
 * Orden de carga. Se declara explícitamente (y no leyendo el directorio) para
 * que añadir un archivo sin documentarlo haga fallar la suite.
 */
export const GS_FILES = [
  "00_Manifest.gs",
  "01_Errors.gs",
  "02_Util.gs",
  "03_Log.gs",
  "04_Store.gs",
  "05_Schema.gs",
  "06_Security.gs",
  "07_RichText.gs",
  "08_Types.gs",
  "09_Mapper.gs",
  "10_Validate.gs",
  "11_Assessments.gs",
  "12_Publish.gs",
  "13_Public.gs",
  "14_Scoring.gs",
  "15_Integrity.gs",
  "16_Attempts.gs",
  "17_Results.gs",
  "18_Audit.gs",
  "19_Router.gs",
  "20_Diagnostics.gs",
  "21_Maintenance.gs",
  "22_Tests.gs",
  "Main.gs",
];

/** Archivos `.gs` presentes en disco que no están declarados arriba. */
export function listUndeclaredGsFiles() {
  return readdirSync(BACKEND_DIR)
    .filter((name) => name.endsWith(".gs"))
    .filter((name) => !GS_FILES.includes(name));
}

/** Límite real de Google Sheets. */
export const SHEETS_CELL_CHARACTER_LIMIT = 50000;

function cellTooLongError() {
  return new Error(
    "Your input contains more than the maximum of 50000 characters in a single cell.",
  );
}

/* ------------------------------ Hoja en memoria --------------------------- */

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numColumns; c++) {
        line.push(this.sheet.readCell(this.row + r, this.column + c));
      }
      out.push(line);
    }
    return out;
  }

  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.numRows) {
      throw new Error(
        `setValues: se esperaban ${this.numRows} filas y llegaron ${Array.isArray(values) ? values.length : "no-array"}`,
      );
    }
    for (let r = 0; r < this.numRows; r++) {
      if (!Array.isArray(values[r]) || values[r].length !== this.numColumns) {
        throw new Error(
          `setValues: se esperaban ${this.numColumns} columnas en la fila ${r} y llegaron ${
            Array.isArray(values[r]) ? values[r].length : "no-array"
          }`,
        );
      }
      for (let c = 0; c < this.numColumns; c++) {
        const value = values[r][c];
        if (typeof value === "string" && value.length > SHEETS_CELL_CHARACTER_LIMIT) {
          throw cellTooLongError();
        }
        this.sheet.writeCell(this.row + r, this.column + c, value);
      }
    }
    return this;
  }

  setValue(value) {
    if (typeof value === "string" && value.length > SHEETS_CELL_CHARACTER_LIMIT) {
      throw cellTooLongError();
    }
    this.sheet.writeCell(this.row, this.column, value);
    return this;
  }

  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  setBackground() { return this; }
  setHorizontalAlignment() { return this; }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
    this.frozenRows = 0;
    this.columnWidths = {};
  }

  getName() { return this.name; }

  readCell(row, column) {
    const line = this.grid[row - 1];
    if (!line) return "";
    const value = line[column - 1];
    return value === undefined || value === null ? "" : value;
  }

  writeCell(row, column, value) {
    while (this.grid.length < row) this.grid.push([]);
    const line = this.grid[row - 1];
    while (line.length < column) line.push("");
    line[column - 1] = value === undefined || value === null ? "" : value;
  }

  getLastRow() {
    let last = 0;
    for (let r = 0; r < this.grid.length; r++) {
      const line = this.grid[r] || [];
      if (line.some((cell) => cell !== "" && cell !== null && cell !== undefined)) last = r + 1;
    }
    return last;
  }

  getLastColumn() {
    let last = 0;
    for (const line of this.grid) {
      for (let c = (line || []).length - 1; c >= 0; c--) {
        const cell = line[c];
        if (cell !== "" && cell !== null && cell !== undefined) {
          if (c + 1 > last) last = c + 1;
          break;
        }
      }
    }
    return last;
  }

  getRange(row, column, numRows = 1, numColumns = 1) {
    if (row < 1 || column < 1) throw new Error("getRange: fila y columna deben ser >= 1");
    return new FakeRange(this, row, column, numRows, numColumns);
  }

  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }

  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((value, index) => this.writeCell(row, index + 1, value));
    return this;
  }

  deleteRow(row) {
    this.grid.splice(row - 1, 1);
    return this;
  }

  setFrozenRows(count) { this.frozenRows = count; return this; }
  setColumnWidth(column, width) { this.columnWidths[column] = width; return this; }
}

class FakeSpreadsheet {
  constructor(id = "libro-de-pruebas", name = "Evaluaciones (pruebas)") {
    this.id = id;
    this.name = name;
    this.sheets = [];
  }

  getId() { return this.id; }
  getName() { return this.name; }
  getSpreadsheetTimeZone() { return "America/La_Paz"; }
  getSheetByName(name) { return this.sheets.find((sheet) => sheet.name === name) ?? null; }
  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
  getSheets() { return this.sheets.slice(); }
}

/* --------------------------------- Contexto ------------------------------- */

export const TEST_ADMIN_KEY = "llave-de-pruebas-0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Carga el backend en un contexto nuevo y aislado.
 *
 * @param {{
 *   properties?: Record<string,string>,
 *   adminKey?: string|null,
 *   activeEmail?: string,
 *   lockAvailable?: boolean,
 *   cacheAvailable?: boolean,
 *   now?: number
 * }} options
 */
export function loadBackend(options = {}) {
  const spreadsheet = new FakeSpreadsheet();
  const adminKey = options.adminKey === undefined ? TEST_ADMIN_KEY : options.adminKey;
  const properties = {
    ...(adminKey ? { EV_ADMIN_KEY: adminKey } : {}),
    ...(options.properties ?? {}),
  };
  const cache = new Map();
  const state = {
    spreadsheet,
    properties,
    cache,
    activeEmail: options.activeEmail ?? "reclutador@ejemplo.com",
    lockAvailable: options.lockAvailable !== false,
    cacheAvailable: options.cacheAvailable !== false,
    lockAcquisitions: 0,
    lockReleases: 0,
    lockHeld: false,
    logs: [],
    errors: [],
    warnings: [],
    triggers: [],
    /** Desplazamiento del reloj, en milisegundos. Lo usan las pruebas de tiempo. */
    clockOffsetMs: 0,
  };

  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + state.clockOffsetMs);
      else super(...args);
    }
    static now() { return RealDate.now() + state.clockOffsetMs; }
  }

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: (id) => {
        if (id === "inexistente") throw new Error("Spreadsheet not found: openById");
        return spreadsheet;
      },
      getUi: () => { throw new Error("no ui"); },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (!state.lockAvailable) return false;
          if (state.lockHeld) return false;
          state.lockHeld = true;
          state.lockAcquisitions += 1;
          return true;
        },
        releaseLock: () => {
          state.lockHeld = false;
          state.lockReleases += 1;
        },
        waitLock: () => {
          state.lockHeld = true;
          state.lockAcquisitions += 1;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in properties ? properties[key] : null),
        setProperty: (key, value) => { properties[key] = String(value); },
        deleteProperty: (key) => { delete properties[key]; },
        getProperties: () => ({ ...properties }),
      }),
    },
    CacheService: {
      getScriptCache: () => {
        if (!state.cacheAvailable) throw new Error("cache unavailable");
        return {
          get: (key) => (cache.has(key) ? cache.get(key) : null),
          put: (key, value) => { cache.set(key, String(value)); },
          remove: (key) => { cache.delete(key); },
        };
      },
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => state.activeEmail }),
    },
    ScriptApp: {
      getProjectTriggers: () => state.triggers.slice(),
      newTrigger: (handler) => ({
        timeBased: () => ({
          everyDays: () => ({
            atHour: () => ({
              create: () => {
                state.triggers.push({ getHandlerFunction: () => handler });
              },
            }),
          }),
        }),
      }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      computeDigest: (_algorithm, value) => {
        const digest = createHash("sha256").update(String(value), "utf8").digest();
        return Array.from(digest).map((byte) => (byte > 127 ? byte - 256 : byte));
      },
      computeHmacSha256Signature: (value, key) => {
        const mac = createHmac("sha256", String(key)).update(String(value), "utf8").digest();
        return Array.from(mac).map((byte) => (byte > 127 ? byte - 256 : byte));
      },
      base64Encode: (bytes) =>
        Buffer.from(
          typeof bytes === "string"
            ? Buffer.from(bytes, "utf8")
            : Array.from(bytes).map((byte) => (byte < 0 ? byte + 256 : byte)),
        ).toString("base64"),
      base64Decode: (text) =>
        Array.from(Buffer.from(String(text), "base64")).map((byte) => (byte > 127 ? byte - 256 : byte)),
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      sleep: () => {},
    },
    ContentService: {
      createTextOutput: (text) => ({
        text,
        setMimeType() { return this; },
        getContent() { return text; },
      }),
      MimeType: { JSON: "JSON" },
    },
    console: {
      log: (...args) => state.logs.push(args.map(String).join(" ")),
      info: (...args) => state.logs.push(args.map(String).join(" ")),
      warn: (...args) => state.warnings.push(args.map(String).join(" ")),
      error: (...args) => state.errors.push(args.map(String).join(" ")),
    },
    JSON,
    Math,
    Date: ShiftedDate,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Buffer,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    Error,
    TypeError,
    RegExp,
    Set,
    Map,
    encodeURIComponent,
    decodeURIComponent,
  };
  sandbox.globalThis = sandbox;

  const context = createContext(sandbox);
  const source = GS_FILES.map((name) => {
    const code = readFileSync(join(BACKEND_DIR, name), "utf8");
    return `/* ==== ${name} ==== */\n${code}`;
  }).join("\n");

  // Un solo script para que las declaraciones `var`/`function` de todos los
  // archivos compartan ámbito global, igual que en Apps Script.
  runInContext(source, context, { filename: "evaluaciones-backend.js" });

  /** Invoca una función global del backend. */
  const call = (name, ...args) => {
    context.__args = args;
    return runInContext(`${name}.apply(null, __args)`, context);
  };

  /** Evalúa una expresión en el contexto (p. ej. `EV_SCHEMA`). */
  const read = (expression) => runInContext(expression, context);

  /** Petición administrativa, con llave. */
  const admin = (accion, payload = {}, overrides = {}) =>
    call("evHandle_", {
      accion,
      solicitudId: overrides.solicitudId ?? `req_${randomUUID()}`,
      llaveAdmin: overrides.llaveAdmin ?? adminKey ?? "",
      clientId: overrides.clientId ?? "cliente-pruebas",
      actor: overrides.actor ?? "reclutador@ejemplo.com",
      payload,
    });

  /** Petición pública (candidato), sin llave. */
  const publico = (accion, payload = {}, overrides = {}) =>
    call("evHandle_", {
      accion,
      solicitudId: overrides.solicitudId ?? `req_${randomUUID()}`,
      clientId: overrides.clientId ?? "candidato-pruebas",
      actor: overrides.actor ?? "",
      payload,
    });

  /** Adelanta el reloj del backend. */
  const advanceClock = (ms) => { state.clockOffsetMs += ms; };

  /** Filas de una hoja, tal como están en el libro simulado. */
  const rowsOf = (sheetName) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues().map((line) => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) obj[String(header)] = line[index];
      });
      return obj;
    });
  };

  return { context, call, read, admin, publico, advanceClock, rowsOf, state, spreadsheet, adminKey };
}

/** Atajo: backend con el esquema ya instalado. */
export function loadInstalledBackend(options = {}) {
  const harness = loadBackend(options);
  const response = harness.admin("install");
  if (!response.ok) {
    throw new Error(`No se pudo instalar el backend de pruebas: ${response.error.mensaje}`);
  }
  return harness;
}

/**
 * Documento de evaluación de ejemplo, con contenido suficiente para ejercitar
 * la validación, la publicación y la calificación.
 */
export function sampleDocument(id, seccionId, overrides = {}) {
  return {
    id,
    evaluacion: {
      titulo: "Analista de riesgo crediticio",
      descripcion: "Prueba de conocimientos y criterio.",
      categoria: "conocimientos",
      instrucciones: {
        v: 1,
        b: [{ t: "p", s: [{ x: "Lee con atención. " }, { x: "No uses calculadora.", m: ["b"] }] }],
      },
      notasInternas: "Rúbrica interna: ponderar el criterio por encima del cálculo.",
      aplicacion: {
        duracionMinutos: 20,
        puntajeAprobacion: 70,
        criterioAprobacion: "porcentaje",
        intentosMaximos: 1,
        navegacion: "libre",
        permitirRetroceso: true,
        mostrarProgreso: true,
        autoenviarAlExpirar: true,
        guardadoAutomaticoSegundos: 20,
      },
      participante: { visibilidadResultado: "nota" },
      etiquetas: ["riesgo", "banca"],
      ...(overrides.evaluacion ?? {}),
    },
    secciones: [
      {
        id: seccionId,
        titulo: "Conocimientos",
        preguntas: [
          {
            id: "pr_unica",
            tipo: "opcion_unica",
            enunciado: { v: 1, b: [{ t: "p", s: [{ x: "¿Qué mide la mora?" }] }] },
            obligatoria: true,
            modoPuntaje: "exacto",
            puntos: 2,
            opciones: [
              { id: "op_u1", texto: { v: 1, b: [{ t: "p", s: [{ x: "Atrasos" }] }] }, valor: "a", correcta: true },
              { id: "op_u2", texto: { v: 1, b: [{ t: "p", s: [{ x: "Utilidad" }] }] }, valor: "b" },
            ],
          },
          {
            id: "pr_multiple",
            tipo: "opcion_multiple",
            enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Selecciona los indicadores de liquidez." }] }] },
            modoPuntaje: "parcial",
            puntos: 3,
            opciones: [
              { id: "op_m1", texto: { v: 1, b: [{ t: "p", s: [{ x: "Razón corriente" }] }] }, valor: "a", correcta: true },
              { id: "op_m2", texto: { v: 1, b: [{ t: "p", s: [{ x: "Prueba ácida" }] }] }, valor: "b", correcta: true },
              { id: "op_m3", texto: { v: 1, b: [{ t: "p", s: [{ x: "ROE" }] }] }, valor: "c" },
            ],
          },
          {
            id: "pr_numero",
            tipo: "decimal",
            enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Calcula la cuota mensual." }] }] },
            modoPuntaje: "exacto",
            puntos: 2,
            respuestaEsperada: { valor: 1250.5, tolerancia: 0.5 },
            opciones: [],
          },
          {
            id: "pr_abierta",
            tipo: "texto_largo",
            enunciado: { v: 1, b: [{ t: "p", s: [{ x: "Justifica tu recomendación." }] }] },
            modoPuntaje: "manual",
            puntos: 3,
            opciones: [],
          },
        ],
      },
    ],
    ...(overrides.extra ?? {}),
  };
}
