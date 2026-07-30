/**
 * Tipos del arnés de Node que ejecuta el backend de Apps Script.
 *
 * El arnés es JavaScript plano a propósito (lo carga `node:vm` sin compilar), así
 * que sus tipos se declaran aquí para que las pruebas en TypeScript lo consuman
 * con seguridad.
 */

/** Envoltorio uniforme de respuesta del backend. */
export interface EvEnvelope<T = any> {
  ok: boolean;
  accion: string;
  solicitudId: string;
  datos: T;
  error: {
    codigo: string;
    mensaje: string;
    pista: string;
    detalle: Record<string, any>;
    traza: string;
  } | null;
  avisos: string[];
  meta: Record<string, any>;
}

export interface EvHarnessOverrides {
  solicitudId?: string;
  llaveAdmin?: string;
  clientId?: string;
  actor?: string;
}

export interface EvHarness {
  context: Record<string, unknown>;
  call: (name: string, ...args: unknown[]) => any;
  read: (expression: string) => any;
  admin: (accion: string, payload?: Record<string, unknown>, overrides?: EvHarnessOverrides) => EvEnvelope;
  publico: (accion: string, payload?: Record<string, unknown>, overrides?: EvHarnessOverrides) => EvEnvelope;
  advanceClock: (ms: number) => void;
  rowsOf: (sheetName: string) => Record<string, unknown>[];
  state: {
    properties: Record<string, string>;
    cache: Map<string, string>;
    logs: string[];
    warnings: string[];
    errors: string[];
    triggers: { getHandlerFunction: () => string }[];
    lockAvailable: boolean;
    cacheAvailable: boolean;
    lockAcquisitions: number;
    lockReleases: number;
    clockOffsetMs: number;
  };
  spreadsheet: any;
  adminKey: string | null;
}

export interface EvLoadOptions {
  properties?: Record<string, string>;
  adminKey?: string | null;
  activeEmail?: string;
  lockAvailable?: boolean;
  cacheAvailable?: boolean;
}

export const BACKEND_DIR: string;
export const GS_FILES: string[];
export const SHEETS_CELL_CHARACTER_LIMIT: number;
export const TEST_ADMIN_KEY: string;

export function listUndeclaredGsFiles(): string[];
export function loadBackend(options?: EvLoadOptions): EvHarness;
export function loadInstalledBackend(options?: EvLoadOptions): EvHarness;
export function sampleDocument(
  id: string,
  seccionId: string,
  overrides?: { evaluacion?: Record<string, unknown>; extra?: Record<string, unknown> },
): Record<string, any>;
