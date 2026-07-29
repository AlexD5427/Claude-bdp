/**
 * Arnés para ejecutar el backend de Apps Script dentro de Node.
 *
 * Los archivos `.gs` de `apps-script/evaluations/` son JavaScript plano que se
 * ejecuta en el runtime V8 de Apps Script. Este módulo los concatena y los
 * evalúa en un contexto de `node:vm` con implementaciones en memoria de
 * `SpreadsheetApp`, `LockService`, `PropertiesService`, `Utilities`, `Session` y
 * `ContentService`.
 *
 * Gracias a esto las pruebas del repositorio ejercitan EL MISMO código que se
 * copia a Apps Script: no hay una reimplementación paralela que pueda
 * desincronizarse.
 *
 * No forma parte del bundle de la aplicación: solo lo usan las pruebas y el
 * script de verificación.
 */

import { createContext, runInContext } from "node:vm";
import { readFileSync, readdirSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APPS_SCRIPT_DIR = join(HERE, "..", "apps-script", "evaluations");

/**
 * Orden de carga. Coincide con `apps-script/evaluations/README.md`. Se declara
 * explícitamente (en vez de leer el directorio sin orden) para que el arnés
 * falle si alguien añade un archivo y olvida documentarlo.
 */
export const GS_FILES = [
  "Config.gs",
  "Response.gs",
  "IdService.gs",
  "SheetRepository.gs",
  "SnapshotCodec.gs",
  "Sanitize.gs",
  "Validation.gs",
  "Signature.gs",
  "AuthProviders.gs",
  "Auth.gs",
  "RequestService.gs",
  "AuditService.gs",
  "AssessmentService.gs",
  "PublicAssessmentService.gs",
  "AttemptService.gs",
  "ScoringService.gs",
  "Router.gs",
  "Code.gs",
  "Setup.gs",
  "Tests.gs",
];

/** Comprueba que no haya archivos `.gs` sin declarar en `GS_FILES`. */
export function listUndeclaredGsFiles() {
  const onDisk = readdirSync(APPS_SCRIPT_DIR).filter((name) => name.endsWith(".gs"));
  return onDisk.filter((name) => !GS_FILES.includes(name));
}

/* ------------------------------ Hoja en memoria --------------------------- */

/**
 * Google Sheets rechaza cualquier celda con más de 50 000 caracteres.
 *
 * El doble de prueba lo respeta a propósito: hasta julio de 2026 no lo hacía, y
 * por eso la suite quedaba verde mientras `publishAssessment` fallaba en
 * producción con INTERNAL_ERROR al escribir un `snapshot_json` de 51 321
 * caracteres. Un doble más permisivo que la realidad no prueba nada.
 */
export const SHEETS_CELL_CHARACTER_LIMIT = 50000;

/** Mensaje textual de Google, reproducido para que las pruebas lo reconozcan. */
function cellTooLongError() {
  return new Error(
    "Your input contains more than the maximum of 50000 characters in a single cell.",
  );
}

/** Bytes de un `Blob` de Apps Script: acepta texto o bytes con signo. */
function toBuffer(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  return Buffer.from(Array.from(value).map((byte) => (byte < 0 ? byte + 256 : byte)));
}

/** `Blob` mínimo: solo los métodos que usa el módulo. */
function makeBlob(buffer) {
  return {
    getBuffer: () => buffer,
    getBytes: () => Array.from(buffer).map((byte) => (byte > 127 ? byte - 256 : byte)),
    getDataAsString: () => buffer.toString("utf8"),
    setContentType() {
      return this;
    },
    setName() {
      return this;
    },
  };
}

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
      const row = [];
      for (let c = 0; c < this.numColumns; c++) {
        row.push(this.sheet.readCell(this.row + r, this.column + c));
      }
      out.push(row);
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
        // Sheets escribe celda a celda y aborta al llegar a la que se pasa del
        // límite: las anteriores quedan grabadas y las posteriores no. Eso es lo
        // que dejó las filas de `Versions` con las 7 primeras columnas llenas y
        // las 8 últimas vacías. Reproducirlo permite comprobar que la corrección
        // ya no deja filas a medio escribir.
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

  setFontWeight() {
    return this;
  }

  setNumberFormat() {
    return this;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    /** @type {unknown[][]} */
    this.grid = [];
    this.frozenRows = 0;
  }

  getName() {
    return this.name;
  }

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

  setFrozenRows(count) {
    this.frozenRows = count;
    return this;
  }
}

class FakeSpreadsheet {
  constructor() {
    /** @type {FakeSheet[]} */
    this.sheets = [];
  }

  getSheetByName(name) {
    return this.sheets.find((sheet) => sheet.name === name) ?? null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }

  getSheets() {
    return this.sheets.slice();
  }
}

/* ------------------------------ Credenciales ------------------------------ */

/**
 * Secreto de pruebas. Cumple la longitud mínima que exige `Signature.gs` y solo
 * existe en este arnés: no es un secreto real de ningún despliegue.
 */
export const TEST_ADMIN_SECRET = "secreto-de-pruebas-solo-para-el-arnes-0123456789";

/**
 * Cadena canónica del esquema `hmac-sha256` v1.
 *
 * Se reimplementa aquí a propósito, con `node:crypto`, para que las pruebas
 * comprueben que TRES implementaciones independientes coinciden: este arnés, el
 * firmante del backend intermedio (`api/_lib/appsScriptSignature.ts`) y el
 * verificador de Apps Script (`Signature.gs`).
 */
export function canonicalString({ action, requestId, timestamp, nonce, actor }) {
  return ["v1", action ?? "", requestId ?? "", timestamp ?? "", nonce ?? "", actor ?? ""].join("\n");
}

/** Credencial firmada, tal como la emite el backend intermedio. */
export function signCredential({ secret, action, requestId, actor, timestamp, nonce }) {
  const stamp = timestamp ?? new Date().toISOString();
  const uniqueness = nonce ?? `nonce_${randomUUID()}`;
  const signature = createHmac("sha256", secret)
    .update(canonicalString({ action, requestId, timestamp: stamp, nonce: uniqueness, actor }), "utf8")
    .digest("base64");
  return { scheme: "hmac-sha256", timestamp: stamp, nonce: uniqueness, actor, signature };
}

/* --------------------------------- Contexto ------------------------------- */

/**
 * Carga el backend en un contexto nuevo y aislado.
 *
 * Por omisión el arnés se comporta como el despliegue real: modo
 * `server_secret`, con el secreto de pruebas configurado, y `request()` firma las
 * acciones administrativas igual que lo haría el backend intermedio. Para
 * ejercitar la autorización en crudo, usa `rawRequest()`.
 *
 * @param {{ properties?: Record<string,string>, activeEmail?: string, lockAvailable?: boolean, adminSecret?: string|null, adminActor?: string }} options
 */
export function loadAppsScript(options = {}) {
  const spreadsheet = new FakeSpreadsheet();
  const adminSecret = options.adminSecret === undefined ? TEST_ADMIN_SECRET : options.adminSecret;
  const properties = {
    ...(adminSecret ? { EVALUATIONS_ADMIN_SHARED_SECRET: adminSecret } : {}),
    ...(options.properties ?? {}),
  };
  const nonceCache = new Map();
  const state = {
    spreadsheet,
    properties,
    activeEmail: options.activeEmail ?? "reclutador@ejemplo.com",
    lockAvailable: options.lockAvailable !== false,
    lockAcquisitions: 0,
    lockReleases: 0,
    lockHeld: false,
    errors: [],
    logs: [],
  };

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: () => spreadsheet,
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
        setProperty: (key, value) => {
          properties[key] = String(value);
        },
        deleteProperty: (key) => {
          delete properties[key];
        },
        getProperties: () => ({ ...properties }),
      }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => state.activeEmail }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      computeDigest: (_algorithm, value) => {
        const digest = createHash("sha256").update(String(value), "utf8").digest();
        // Apps Script devuelve bytes con signo.
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
      // `newBlob`/`gzip`/`ungzip` con la misma semántica de bytes con signo que
      // usa Apps Script. Los emplea el códec de snapshots (SnapshotCodec.gs).
      newBlob: (value) => makeBlob(toBuffer(value)),
      gzip: (blob) => makeBlob(gzipSync(blob.getBuffer())),
      ungzip: (blob) => makeBlob(gunzipSync(blob.getBuffer())),
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      sleep: () => {},
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => (nonceCache.has(key) ? nonceCache.get(key) : null),
        put: (key, value) => {
          nonceCache.set(key, String(value));
        },
        remove: (key) => {
          nonceCache.delete(key);
        },
      }),
    },
    ContentService: {
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this;
        },
        getContent() {
          return text;
        },
      }),
      MimeType: { JSON: "JSON" },
    },
    console: {
      log: (...args) => state.logs.push(args.join(" ")),
      error: (...args) => state.errors.push(args.join(" ")),
      warn: (...args) => state.logs.push(args.join(" ")),
      info: (...args) => state.logs.push(args.join(" ")),
    },
    JSON,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Object,
    Array,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    Error,
    RegExp,
  };
  sandbox.globalThis = sandbox;

  const context = createContext(sandbox);
  const source = GS_FILES.map((name) => {
    const code = readFileSync(join(APPS_SCRIPT_DIR, name), "utf8");
    return `/* ==== ${name} ==== */\n${code}`;
  }).join("\n");

  // Un único script para que las declaraciones `var`/`function` de todos los
  // archivos compartan ámbito, igual que en Apps Script.
  runInContext(source, context, { filename: "apps-script-evaluations.js" });

  /** Ejecuta una función global del backend. */
  const call = (name, ...args) => {
    context.__args = args;
    return runInContext(`${name}.apply(null, __args)`, context);
  };

  /** Lee una global del backend (p. ej. `EVAL_HEADERS`). */
  const read = (expression) => runInContext(expression, context);

  /** Envía una solicitud al enrutador SIN credencial, tal cual llega del cliente. */
  const rawRequest = (action, payload = {}, requestId = `req_${randomUUID()}`, auth = null) =>
    call("evalHandleRequest_", { action, requestId, payload, auth });

  const adminActions = new Set(read("Object.keys(EVAL_ADMIN_ACTIONS)"));

  /**
   * Envía una solicitud como lo haría la aplicación real: las acciones
   * administrativas van firmadas por el backend intermedio y las públicas no.
   */
  const request = (action, payload = {}, requestId = `req_${randomUUID()}`) => {
    const needsSignature = adminActions.has(action) && Boolean(adminSecret);
    const auth = needsSignature
      ? signCredential({
          secret: adminSecret,
          action,
          requestId,
          actor: options.adminActor ?? "reclutador@ejemplo.com",
        })
      : null;
    return call("evalHandleRequest_", { action, requestId, payload, auth });
  };

  /** Credencial firmada con el secreto del arnés, para pruebas de autorización. */
  const sign = (action, requestId, overrides = {}) =>
    signCredential({
      secret: adminSecret ?? TEST_ADMIN_SECRET,
      action,
      requestId,
      actor: options.adminActor ?? "reclutador@ejemplo.com",
      ...overrides,
    });

  return { context, call, read, request, rawRequest, sign, state, spreadsheet };
}

/** Atajo: backend inicializado con las nueve hojas creadas. */
export function loadInitializedAppsScript(options = {}) {
  const harness = loadAppsScript(options);
  harness.call("configurarEvaluaciones");
  return harness;
}
