/**
 * Tipos del arnés de Node que ejecuta el backend de Documentación.
 *
 * El arnés es JavaScript plano a propósito —`node:vm` lo carga sin compilar—, así
 * que sus tipos se declaran aquí para que las pruebas en TypeScript lo consuman
 * con seguridad y `tsc` siga verificando la suite.
 */

/**
 * Sobre uniforme de respuesta.
 *
 * `data` y `error` se declaran no nulos a propósito: las pruebas los leen después
 * de comprobar `ok`, y anotar cada acceso con `!` añadiría ruido a cientos de
 * aserciones sin aportar seguridad.
 */
export interface DocEnvelope<T = any> {
  ok: boolean;
  accion: string;
  solicitudId: string;
  data: T;
  datos: T;
  error: {
    code: string;
    codigo: string;
    message: string;
    mensaje: string;
    hint: string;
    pista: string;
    fields: Record<string, string>;
    detalle: Record<string, any>;
  };
  avisos: string[];
  meta: {
    requestId: string;
    timestamp: string;
    version: string;
    esquemaNormalizado: number;
    traza: string;
    milisegundos: number;
    backend: string;
    esquema: number;
    instalado: boolean;
    contadores: Record<string, number>;
  };
}

export interface DocHarnessOverrides {
  solicitudId?: string;
  actor?: string;
  rol?: string;
  llaveAdmin?: string;
}

export interface DocContexto {
  requestId: string;
  accion: string;
  actor: string;
  actorId: string;
  actorDisplay: string;
  rol: string;
  capacidades: string[];
  porLlave: boolean;
  origen: string;
  metodo: string;
  ahora: string;
}

export interface DocHarnessState {
  activeEmail: string;
  lockAvailable: boolean;
  cacheAvailable: boolean;
  mailAvailable: boolean;
  lockAcquisitions: number;
  lockReleases: number;
  lockHeld: boolean;
  logs: string[];
  errors: string[];
  warnings: string[];
  triggers: { getHandlerFunction(): string }[];
  mails: { to: string; subject: string; body: string }[];
  clockOffsetMs: number;
  properties: Record<string, string>;
}

export interface FakeRangeLike {
  getValues(): any[][];
  getValue(): any;
  setValues(values: any[][]): FakeRangeLike;
  setValue(value: any): FakeRangeLike;
  setBackground(color: string): FakeRangeLike;
  getBackground(): string;
}

export interface FakeSheetLike {
  getName(): string;
  getRange(row: number, column: number, numRows?: number, numColumns?: number): FakeRangeLike;
  getDataRange(): FakeRangeLike;
  getLastRow(): number;
  getLastColumn(): number;
  getMaxRows(): number;
  getMaxColumns(): number;
  hidden: boolean;
  frozenRows: number;
  columnWidths: Map<number, number>;
  conditionalFormatRules: unknown[];
}

export interface FakeSpreadsheetLike {
  getId(): string;
  getName(): string;
  getUrl(): string;
  getSheetByName(name: string): FakeSheetLike | null;
  getSheets(): FakeSheetLike[];
  insertSheet(name: string): FakeSheetLike;
}

export interface DocHarness {
  context: Record<string, any>;
  /** Invoca una función global del backend por su nombre. */
  call<T = any>(name: string, ...args: any[]): T;
  /** Evalúa una expresión dentro del contexto del backend. */
  read<T = any>(expression: string): T;
  /** Petición a través de `doPost`, como la haría el frontend. */
  pedir<T = any>(accion: string, params?: Record<string, unknown>, overrides?: DocHarnessOverrides): DocEnvelope<T>;
  /** Igual que `pedir`, pero lanza si la respuesta no es `ok`. */
  ok<T = any>(accion: string, params?: Record<string, unknown>, overrides?: DocHarnessOverrides): T;
  /** Contexto de servicio, para llamar a los servicios sin pasar por el enrutador. */
  ctx(overrides?: Partial<DocContexto>): DocContexto;
  advanceClock(ms: number): void;
  rowsOf(sheetName: string): Record<string, any>[];
  state: DocHarnessState;
  spreadsheet: FakeSpreadsheetLike;
  adminKey: string | null;
}

export interface DocLoadOptions {
  properties?: Record<string, string>;
  adminKey?: string | null;
  activeEmail?: string;
  lockAvailable?: boolean;
  cacheAvailable?: boolean;
  mailAvailable?: boolean;
}

export declare const BACKEND_DIR: string;
export declare const GS_FILES: string[];
export declare const SHEETS_CELL_CHARACTER_LIMIT: number;
export declare const TEST_ADMIN_KEY: string;

export declare function listUndeclaredGsFiles(): string[];
export declare function loadBackend(options?: DocLoadOptions): DocHarness;
export declare function loadInstalledBackend(options?: DocLoadOptions): DocHarness;

export declare function seedLegacyBook(
  harness: DocHarness,
  anio?: number,
): { anio: number; filas: number; detalle: Record<string, any> };

export declare function crearExpediente(
  harness: DocHarness,
  overrides?: {
    identificador?: string;
    nombre?: string;
    cargo?: string;
    agencia?: string;
    gerencia?: string;
    fechaIngreso?: string;
    tipoFuncionario?: string;
    tipoGarantia?: string;
    responsableId?: string;
  },
): {
  expedienteId: string;
  creado: boolean;
  requisitos: any[];
  expediente: Record<string, any>;
  entrada: Record<string, string>;
};
