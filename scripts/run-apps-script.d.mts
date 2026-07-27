/**
 * Tipos del arnés que ejecuta el backend de Apps Script en Node.
 *
 * El arnés es JavaScript (`.mjs`) porque carga archivos `.gs` con `node:vm`; esta
 * declaración le da tipos a las pruebas para que `tsc --strict` no tenga que
 * recurrir a `any`.
 */

export declare const APPS_SCRIPT_DIR: string;
export declare const GS_FILES: string[];

/** Archivos `.gs` presentes en disco que no están declarados en `GS_FILES`. */
export declare function listUndeclaredGsFiles(): string[];

/** Rango de celdas de la hoja simulada. */
export interface FakeRange {
  getValues(): unknown[][];
  setValues(values: unknown[][]): FakeRange;
  setValue(value: unknown): FakeRange;
  setFontWeight(weight?: string): FakeRange;
  setNumberFormat(format?: string): FakeRange;
}

/** Hoja simulada en memoria. */
export interface FakeSheet {
  getName(): string;
  getLastRow(): number;
  getLastColumn(): number;
  getRange(row: number, column: number, numRows?: number, numColumns?: number): FakeRange;
  getDataRange(): FakeRange;
  appendRow(values: unknown[]): FakeSheet;
  deleteRow(row: number): FakeSheet;
  setFrozenRows(count: number): FakeSheet;
}

/** Hoja de cálculo simulada. */
export interface FakeSpreadsheet {
  getSheetByName(name: string): FakeSheet | null;
  insertSheet(name: string): FakeSheet;
  getSheets(): FakeSheet[];
}

/** Respuesta del enrutador, con la forma del envoltorio del backend. */
export interface AppsScriptEnvelope {
  ok: boolean;
  requestId: string;
  data: unknown;
  error: { code: string; message: string; details: Record<string, unknown> } | null;
  warnings: string[];
}

export interface HarnessState {
  properties: Record<string, string>;
  activeEmail: string;
  lockAvailable: boolean;
  lockAcquisitions: number;
  lockReleases: number;
  lockHeld: boolean;
  errors: string[];
  logs: string[];
}

export interface AppsScriptHarness {
  /** Llama una función global del backend. */
  call: (name: string, ...args: unknown[]) => unknown;
  /** Lee una expresión global (p. ej. `EVAL_HEADERS`). */
  read: (expression: string) => unknown;
  /** Envía una solicitud al enrutador, como haría el Web App. */
  request: (action: string, payload?: Record<string, unknown>, requestId?: string) => AppsScriptEnvelope;
  state: HarnessState;
  spreadsheet: FakeSpreadsheet;
}

export interface LoadOptions {
  properties?: Record<string, string>;
  activeEmail?: string;
  lockAvailable?: boolean;
}

export declare function loadAppsScript(options?: LoadOptions): AppsScriptHarness;
export declare function loadInitializedAppsScript(options?: LoadOptions): AppsScriptHarness;
