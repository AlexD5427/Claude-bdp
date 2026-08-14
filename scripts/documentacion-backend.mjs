/**
 * Arnés para ejecutar el backend de Documentación dentro de Node.
 *
 * Los archivos `.gs` de `apps-script/documentacion/` son JavaScript que corre en
 * el runtime V8 de Apps Script. Este módulo los concatena y los evalúa en un
 * contexto de `node:vm` con implementaciones en memoria de `SpreadsheetApp`,
 * `LockService`, `PropertiesService`, `CacheService`, `Session`, `ScriptApp`,
 * `MailApp`, `Utilities` y `ContentService`.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Para que las pruebas del repositorio ejerciten EL MISMO código que se copia a
 * Apps Script. La alternativa —reimplementar la lógica en TypeScript para
 * probarla— produce dos versiones que se desincronizan, y la que se despliega es
 * justamente la que no está probada.
 *
 * Sigue el patrón que ya usaba `scripts/evaluaciones-backend.mjs`, con un doble de
 * hoja bastante más completo porque este backend formatea, valida, filtra,
 * inserta columnas y borra rangos de filas.
 *
 * ── Fidelidad deliberada ────────────────────────────────────────────────────
 * El doble reproduce cuatro comportamientos reales que, si se simplifican,
 * esconden errores que luego aparecen en producción:
 *
 *   1. una celda no admite más de 50 000 caracteres;
 *   2. `setValues` exige que la matriz tenga exactamente las dimensiones del rango;
 *   3. `getLastRow` y `getLastColumn` se calculan sobre el contenido, no sobre la
 *      rejilla reservada;
 *   4. borrar filas desplaza las de abajo.
 */

import { createContext, runInContext } from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = join(HERE, "..", "apps-script", "documentacion");

/**
 * Orden de carga. Se declara explícitamente —y no leyendo el directorio— para
 * que añadir un archivo sin registrarlo aquí haga fallar la suite: en Apps Script
 * el orden de concatenación importa para las constantes de nivel superior.
 */
export const GS_FILES = [
  "00_Manifest.gs",
  "01_Core.gs",
  "02_Store.gs",
  "03_Schema.gs",
  "04_Year.gs",
  "05_Audit.gs",
  "06_Dossiers.gs",
  "07_Maintenance.gs",
  "08_Router.gs",
  "09_Menu.gs",
  "10_Tests.gs",
  "11_Domain.gs",
  "12_Data.gs",
  "13_Catalog.gs",
  "14_Auth.gs",
  "15_Expedientes.gs",
  "16_Workflow.gs",
  "17_Automation.gs",
  "18_Reports.gs",
  "19_Governance.gs",
  "20_Migrations.gs",
  "21_Api.gs",
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

/** Métodos de formato que solo tienen que ser encadenables. */
const CHAINABLE_RANGE_METHODS = [
  "setFontWeight", "setFontStyle", "setFontFamily", "setFontSize", "setFontColor",
  "setNumberFormat", "setHorizontalAlignment", "setVerticalAlignment", "setWrap",
  "setDataValidation", "setBorder", "clearDataValidations", "clearFormat", "merge",
  "setFontLine", "setTextRotation", "setNote",
];

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
    for (const name of CHAINABLE_RANGE_METHODS) {
      this[name] = () => this;
    }
  }

  getRow() { return this.row; }
  getColumn() { return this.column; }
  getNumRows() { return this.numRows; }
  getNumColumns() { return this.numColumns; }
  getA1Notation() { return `R${this.row}C${this.column}:R${this.row + this.numRows - 1}C${this.column + this.numColumns - 1}`; }

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

  getValue() {
    return this.sheet.readCell(this.row, this.column);
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
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numColumns; c++) {
        this.sheet.writeCell(this.row + r, this.column + c, value);
      }
    }
    return this;
  }

  setBackground(color) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numColumns; c++) {
        this.sheet.backgrounds.set(`${this.row + r}:${this.column + c}`, color);
      }
    }
    return this;
  }

  getBackground() {
    return this.sheet.backgrounds.get(`${this.row}:${this.column}`) ?? "#ffffff";
  }

  createFilter() {
    this.sheet.filter = { range: this.getA1Notation(), remove: () => { this.sheet.filter = null; } };
    return this.sheet.filter;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
    this.backgrounds = new Map();
    this.frozenRows = 0;
    this.frozenColumns = 0;
    this.columnWidths = new Map();
    this.rowHeights = new Map();
    this.maxRows = 1000;
    this.maxColumns = 26;
    this.hidden = false;
    this.filter = null;
    this.conditionalFormatRules = [];
  }

  getName() { return this.name; }
  setName(name) { this.name = name; return this; }

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
    if (row > this.maxRows) this.maxRows = row;
    if (column > this.maxColumns) this.maxColumns = column;
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

  getMaxRows() { return Math.max(this.maxRows, this.getLastRow()); }
  getMaxColumns() { return Math.max(this.maxColumns, this.getLastColumn()); }

  insertColumnsAfter(after, howMany) { this.maxColumns = Math.max(this.maxColumns, after + howMany); return this; }
  insertRowsAfter(after, howMany) { this.maxRows = Math.max(this.maxRows, after + howMany); return this; }

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
    this.backgrounds.clear();
    return this;
  }

  deleteRows(row, howMany) {
    this.grid.splice(row - 1, howMany);
    this.backgrounds.clear();
    return this;
  }

  setFrozenRows(count) { this.frozenRows = count; return this; }
  setFrozenColumns(count) { this.frozenColumns = count; return this; }
  setColumnWidth(column, width) { this.columnWidths.set(column, width); return this; }
  setRowHeight(row, height) { this.rowHeights.set(row, height); return this; }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  getFilter() { return this.filter; }
  setConditionalFormatRules(rules) { this.conditionalFormatRules = rules || []; return this; }
  getConditionalFormatRules() { return this.conditionalFormatRules.slice(); }
  clear() { this.grid = []; this.backgrounds.clear(); return this; }
  activate() { return this; }
}

class FakeSpreadsheet {
  constructor(id = "libro-de-pruebas", name = "Documentación (pruebas)") {
    this.id = id;
    this.name = name;
    this.sheets = [];
    this.activeSheet = null;
  }

  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSpreadsheetTimeZone() { return "America/La_Paz"; }
  getSheetByName(name) { return this.sheets.find((sheet) => sheet.name === name) ?? null; }
  insertSheet(name) {
    if (this.getSheetByName(name)) throw new Error(`A sheet with the name "${name}" already exists.`);
    const sheet = new FakeSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
  getSheets() { return this.sheets.slice(); }
  setActiveSheet(sheet) { this.activeSheet = sheet; return sheet; }
  getActiveSheet() { return this.activeSheet ?? this.sheets[0] ?? null; }
  moveActiveSheet(position) {
    if (!this.activeSheet) return;
    const index = this.sheets.indexOf(this.activeSheet);
    if (index < 0) return;
    this.sheets.splice(index, 1);
    this.sheets.splice(Math.max(0, Math.min(position - 1, this.sheets.length)), 0, this.activeSheet);
  }
  deleteSheet(sheet) {
    const index = this.sheets.indexOf(sheet);
    if (index >= 0) this.sheets.splice(index, 1);
  }
}

/** Constructor encadenable para reglas de validación y formato condicional. */
function chainableBuilder(result) {
  const builder = new Proxy(
    { build: () => result },
    {
      get(target, prop) {
        if (prop === "build") return target.build;
        return () => builder;
      },
    },
  );
  return builder;
}

/* --------------------------------- Contexto ------------------------------- */

export const TEST_ADMIN_KEY = "llave-de-documentacion-0123456789abcdef";

/**
 * Carga el backend en un contexto nuevo y aislado.
 *
 * @param {{
 *   properties?: Record<string,string>,
 *   adminKey?: string|null,
 *   activeEmail?: string,
 *   lockAvailable?: boolean,
 *   cacheAvailable?: boolean,
 *   mailAvailable?: boolean,
 * }} options
 */
export function loadBackend(options = {}) {
  const spreadsheet = new FakeSpreadsheet();
  const adminKey = options.adminKey === undefined ? TEST_ADMIN_KEY : options.adminKey;
  const properties = {
    ...(adminKey ? { DOC_ADMIN_KEY: adminKey } : {}),
    ...(options.properties ?? {}),
  };
  const cache = new Map();
  const state = {
    spreadsheet,
    properties,
    cache,
    activeEmail: options.activeEmail === undefined ? "auxiliar@bdp.com" : options.activeEmail,
    lockAvailable: options.lockAvailable !== false,
    cacheAvailable: options.cacheAvailable !== false,
    mailAvailable: options.mailAvailable !== false,
    lockAcquisitions: 0,
    lockReleases: 0,
    lockHeld: false,
    logs: [],
    errors: [],
    warnings: [],
    triggers: [],
    mails: [],
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
      newDataValidation: () => chainableBuilder({ tipo: "validacion" }),
      newConditionalFormatRule: () => chainableBuilder({ tipo: "formato-condicional" }),
      BorderStyle: { SOLID: "SOLID", SOLID_MEDIUM: "SOLID_MEDIUM" },
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
      deleteTrigger: (trigger) => {
        const index = state.triggers.indexOf(trigger);
        if (index >= 0) state.triggers.splice(index, 1);
      },
      getService: () => ({ getUrl: () => "https://script.google.com/macros/s/pruebas/exec" }),
      newTrigger: (handler) => {
        const push = () => {
          const trigger = { getHandlerFunction: () => handler };
          state.triggers.push(trigger);
          return trigger;
        };
        const builder = new Proxy(
          { create: push },
          {
            get(target, prop) {
              if (prop === "create") return target.create;
              return () => builder;
            },
          },
        );
        return builder;
      },
    },
    MailApp: options.mailAvailable === false ? undefined : {
      sendEmail: (payload) => {
        if (!state.mailAvailable) throw new Error("Service invoked too many times: email");
        state.mails.push(payload);
      },
      getRemainingDailyQuota: () => 100,
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
      formatDate: (date, _tz, format) => {
        const d = new RealDate(date);
        const pad = (n) => String(n).padStart(2, "0");
        if (format === "yyyy-MM-dd") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return d.toISOString();
      },
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
    Proxy,
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
  runInContext(source, context, { filename: "documentacion-backend.js" });

  /** Invoca una función global del backend. */
  const call = (name, ...args) => {
    context.__args = args;
    return runInContext(`${name}.apply(null, __args)`, context);
  };

  /** Evalúa una expresión en el contexto (p. ej. `DOC2_SHEET`). */
  const read = (expression) => runInContext(expression, context);

  /**
   * Petición a través del enrutador, como la haría el frontend.
   *
   * Devuelve el sobre completo (`{ok, data, error, meta}`), ya parseado.
   */
  const pedir = (accion, params = {}, overrides = {}) => {
    const cuerpo = {
      accion,
      ...params,
    };
    if (overrides.solicitudId !== undefined) cuerpo.solicitudId = overrides.solicitudId;
    else if (cuerpo.solicitudId === undefined) cuerpo.solicitudId = `req_${randomUUID()}`;
    if (overrides.actor !== undefined) cuerpo.actor = overrides.actor;
    if (overrides.rol !== undefined) cuerpo.rol = overrides.rol;
    if (overrides.llaveAdmin !== undefined) cuerpo.llaveAdmin = overrides.llaveAdmin;

    const salida = call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    return JSON.parse(salida.getContent());
  };

  /** Igual que `pedir`, pero falla la prueba si la respuesta no es `ok`. */
  const ok = (accion, params = {}, overrides = {}) => {
    const respuesta = pedir(accion, params, overrides);
    if (!respuesta.ok) {
      throw new Error(
        `La acción ${accion} falló: [${respuesta.error?.code}] ${respuesta.error?.message}`,
      );
    }
    return respuesta.data;
  };

  /** Contexto de administración para llamar a servicios directamente. */
  const ctx = (overrides = {}) => ({
    requestId: overrides.requestId ?? `req_${randomUUID()}`,
    accion: overrides.accion ?? "prueba",
    actor: overrides.actor ?? "auxiliar@bdp.com",
    actorId: overrides.actorId ?? overrides.actor ?? "auxiliar@bdp.com",
    actorDisplay: overrides.actor ?? "auxiliar@bdp.com",
    rol: overrides.rol ?? "admin",
    capacidades: read(`doc2CapacidadesDe_(${JSON.stringify(overrides.rol ?? "admin")})`),
    porLlave: true,
    origen: overrides.origen ?? "pruebas",
    metodo: "INTERNO",
    ahora: new Date().toISOString(),
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

  return { context, call, read, pedir, ok, ctx, advanceClock, rowsOf, state, spreadsheet, adminKey };
}

/**
 * Backend con el modelo normalizado ya instalado.
 *
 * Ejecuta la instalación completa (estructura + catálogos + migraciones), que es
 * lo que hace el botón del módulo y el paso 6 del tutorial de despliegue.
 */
export function loadInstalledBackend(options = {}) {
  const harness = loadBackend(options);
  const respuesta = harness.pedir("documentacion.instalar", { conRespaldo: false });
  if (!respuesta.ok) {
    throw new Error(`No se pudo instalar el backend de pruebas: ${respuesta.error?.message}`);
  }
  return harness;
}

/**
 * Libro heredado con datos, para probar la migración.
 *
 * Crea la pestaña `CONTROL INGRESOS <año>` con tres filas que reproducen los tres
 * casos reales del libro del área:
 *
 *   1. una fila moderna con `DETALLE JSON` completo;
 *   2. una fila histórica sin identificador ni JSON, solo columnas `TIENE`/`N/A`;
 *   3. una fila comercial con las columnas de garantía llenas.
 */
export function seedLegacyBook(harness, anio = new Date().getFullYear()) {
  const { call, read } = harness;
  call("docEnsureYearSheet_", anio);
  call("docCommit_");

  const columnas = read("docYearColumns_()");
  const indice = {};
  columnas.forEach((columna, i) => {
    indice[columna.clave] = i;
  });

  const detalle = {
    identificador: "CI-1001-2024",
    nombre: "Ana Quiroga Vargas",
    cargo: "Analista de Riesgos",
    agencia: "LA PAZ",
    gerencia: "GERENCIA DE RIESGOS",
    fechaIngreso: `${anio}-02-10`,
    createdAt: `${anio}-02-10T12:00:00.000Z`,
    items: [
      { id: "foto-4x4", label: "Fotografía digital 4x4", group: "personal", status: "presentado", pages: 1 },
      { id: "cv", label: "Currículum Vitae actualizado", group: "personal", status: "presentado", pages: 3 },
      { id: "cert-trabajo", label: "Certificados de trabajo", group: "personal", status: "pendiente", pages: 0, prorroga: `${anio + 1}-12-31`, allowProrroga: true },
      { id: "titulo-legalizado", label: "Fotocopia legalizada del Título académico", group: "personal", status: "observado", pages: 1, observation: "Falta la legalización del ministerio." },
      { id: "rc-iva", label: "Certificado de saldo a favor del dependiente (RC-IVA)", group: "personal", status: "no_aplica", pages: 0 },
    ],
    emailLog: [],
    sheet: {},
  };

  const filas = [
    {
      nombre: "Ana Quiroga Vargas",
      cargo: "Analista de Riesgos",
      oficina: "LA PAZ",
      gerencia: "GERENCIA DE RIESGOS",
      fecha_ingreso: `${anio}-02-10`,
      responsable: "Rocío Casas",
      id: "CI-1001-2024",
      estado: "en_proceso",
      detalle_json: JSON.stringify(detalle),
      creado_en: `${anio}-02-10T12:00:00.000Z`,
      actualizado_en: `${anio}-02-11T12:00:00.000Z`,
      actualizado_por: "rocio@bdp.com",
    },
    {
      // Fila histórica: sin identificador, sin JSON, solo columnas.
      nombre: "Luis Fernando Mamani",
      cargo: "Oficial de Negocios",
      oficina: "EL ALTO",
      gerencia: "GERENCIA DE NEGOCIOS",
      fecha_ingreso: `${anio - 1}-08-01`,
      rejap: "TIENE",
      titulo_legalizado: "TECNICO",
      seguros_alianza: "TIENE",
      crediseguro: "NO TIENE",
      djj_no_codificacion: "N/A",
    },
    {
      // Comercial con garantía real.
      nombre: "Marcela Ríos Peña",
      cargo: "Asesora Comercial",
      oficina: "SANTA CRUZ",
      gerencia: "GERENCIA DE NEGOCIOS",
      fecha_ingreso: `${anio}-05-20`,
      id: "CI-2002-2025",
      contrato_fianza: "TIENE",
      vista_informacion_rapida: "FOLIO REAL",
      rejap: "TIENE",
    },
  ];

  const sheet = harness.spreadsheet.getSheetByName(`CONTROL INGRESOS ${anio}`);
  filas.forEach((datos, offset) => {
    const linea = new Array(columnas.length).fill("");
    Object.keys(datos).forEach((clave) => {
      if (indice[clave] === undefined) throw new Error(`Columna desconocida en la semilla: ${clave}`);
      linea[indice[clave]] = datos[clave];
    });
    sheet.getRange(2 + offset, 1, 1, columnas.length).setValues([linea]);
  });

  return { anio, filas: filas.length, detalle };
}

/**
 * Expediente de prueba ya creado en el modelo normalizado.
 *
 * Devuelve el `expedienteId` y los requisitos, que es lo que casi todas las
 * pruebas necesitan como punto de partida.
 */
export function crearExpediente(harness, overrides = {}) {
  const datos = {
    identificador: overrides.identificador ?? `CI-${Math.floor(Math.random() * 899999 + 100000)}-2026`,
    nombre: overrides.nombre ?? "Persona de prueba",
    cargo: overrides.cargo ?? "Analista",
    agencia: overrides.agencia ?? "LA PAZ",
    gerencia: overrides.gerencia ?? "GERENCIA DE RIESGOS",
    fechaIngreso: overrides.fechaIngreso ?? "2026-01-15",
    tipoFuncionario: overrides.tipoFuncionario ?? "GENERAL",
    tipoGarantia: overrides.tipoGarantia ?? "NINGUNA",
    responsableId: overrides.responsableId ?? "auxiliar@bdp.com",
  };
  const creado = harness.ok("documentacion.expediente.crear", { expediente: datos });
  const detalle = harness.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
  return { ...creado, expediente: detalle.expediente, requisitos: detalle.requisitos, entrada: datos };
}
