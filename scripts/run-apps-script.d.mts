/**
 * Tipos del arnés que ejecuta el backend de Apps Script en Node.
 *
 * El arnés es JavaScript (`.mjs`) porque carga archivos `.gs` con `node:vm`; esta
 * declaración le da tipos a las pruebas para que `tsc --strict` no tenga que
 * recurrir a `any`.
 */

export declare const APPS_SCRIPT_DIR: string;
export declare const GS_FILES: string[];

/**
 * Límite duro de Google Sheets: 50 000 caracteres por celda. El doble de prueba
 * lo respeta, igual que la plataforma real.
 */
export declare const SHEETS_CELL_CHARACTER_LIMIT: number;

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

/** Credencial firmada del esquema `hmac-sha256`, tal como la emite el proxy. */
export interface SignedCredential {
  scheme: string;
  timestamp: string;
  nonce: string;
  actor: string;
  signature: string;
}

export interface AppsScriptHarness {
  /** Llama una función global del backend. */
  call: (name: string, ...args: unknown[]) => unknown;
  /** Lee una expresión global (p. ej. `EVAL_HEADERS`). */
  read: (expression: string) => unknown;
  /**
   * Envía una solicitud como la aplicación real: firma las acciones
   * administrativas con el secreto del arnés y deja las públicas sin credencial.
   */
  request: (action: string, payload?: Record<string, unknown>, requestId?: string) => AppsScriptEnvelope;
  /** Envía una solicitud tal cual, con la credencial que se le indique (o ninguna). */
  rawRequest: (
    action: string,
    payload?: Record<string, unknown>,
    requestId?: string,
    auth?: SignedCredential | Record<string, unknown> | null,
  ) => AppsScriptEnvelope;
  /** Firma una credencial con el secreto del arnés, con sustituciones opcionales. */
  sign: (
    action: string,
    requestId: string,
    overrides?: Partial<SignedCredential> & { secret?: string },
  ) => SignedCredential;
  state: HarnessState;
  spreadsheet: FakeSpreadsheet;
}

export interface LoadOptions {
  properties?: Record<string, string>;
  activeEmail?: string;
  lockAvailable?: boolean;
  /** Secreto administrativo del arnés. `null` deja el despliegue sin configurar. */
  adminSecret?: string | null;
  /** Actor que declara la credencial firmada. */
  adminActor?: string;
}

export declare const TEST_ADMIN_SECRET: string;

/** Cadena canónica del esquema `hmac-sha256` v1. */
export declare function canonicalString(parts: {
  action?: string;
  requestId?: string;
  timestamp?: string;
  nonce?: string;
  actor?: string;
}): string;

/** Credencial firmada con el secreto indicado. */
export declare function signCredential(parts: {
  secret: string;
  action: string;
  requestId: string;
  actor: string;
  timestamp?: string;
  nonce?: string;
}): SignedCredential;

export declare function loadAppsScript(options?: LoadOptions): AppsScriptHarness;
export declare function loadInitializedAppsScript(options?: LoadOptions): AppsScriptHarness;
