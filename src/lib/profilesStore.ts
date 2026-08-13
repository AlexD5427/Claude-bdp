import { useSyncExternalStore } from "react";
import { SCRIPT_URL } from "../constants";
import { almacenLocal, escribirJson, leerJson } from "../shared/storage";
import {
  getConfig,
  setConfig,
  subscribeConfig,
  type AppConfig,
} from "./configStore";
import {
  getLayout,
  importLayout,
  subscribeDashboard,
  type DashWidget,
} from "./dashboardStore";
import type { RawPerfil } from "../types";

/* ------------------------------------------------------------------ */
/* Roles & permissions                                                 */
/* ------------------------------------------------------------------ */

export type Role = "admin" | "supervisor" | "auxiliar" | "analista" | "pasante";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  supervisor: "Supervisión",
  auxiliar: "Auxiliar",
  analista: "Analista",
  pasante: "Pasante",
};

/** Ordinal weight of each role, so permissions scale with seniority. */
export const ROLE_LEVEL: Record<Role, number> = {
  admin: 100,
  supervisor: 80,
  auxiliar: 60,
  analista: 50,
  pasante: 20,
};

export interface Permisos {
  /** Ver el módulo de Configuración. */
  verConfiguracion: boolean;
  /** Editar la configuración global (no sólo la personal). */
  editarConfiguracion: boolean;
  /** Registrar postulantes. */
  registrarPostulante: boolean;
  /** Editar / eliminar registros. */
  editarRegistros: boolean;
  /** Gestionar la documentación de incorporación. */
  gestionarDocumentacion: boolean;
  /** Ver la bitácora de actividad de todos los perfiles. */
  verBitacora: boolean;
  /** Administrar perfiles (crear / eliminar / cambiar roles). */
  gestionarPerfiles: boolean;
}

/** Compute the permission set for a role. Scalable: tweak here to re-tune. */
export function permisosDe(role: Role): Permisos {
  const lvl = ROLE_LEVEL[role];
  return {
    verConfiguracion: true,
    editarConfiguracion: lvl >= 80, // supervisor+
    registrarPostulante: lvl >= 50, // analista+
    editarRegistros: lvl >= 50,
    gestionarDocumentacion: lvl >= 50,
    verBitacora: lvl >= 80,
    gestionarPerfiles: lvl >= 100, // admin
  };
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

/** The decorative idle animation shown on a profile's avatar. */
export type AvatarKind =
  | "corona"
  | "gatito"
  | "balon"
  | "billetes"
  | "estrellas"
  | "pasante"
  | "admin";

export interface Perfil {
  id: string;
  nombre: string;
  cargo: string;
  role: Role;
  avatar: AvatarKind;
  /** Whether the backend record carries a password (governs online login). */
  tienePassword: boolean;
  /** Whether it came from the sheet or is a built-in seed. */
  source: "seed" | "backend";
}

/** The six-plus seed profiles requested by the team. Order is preserved. */
const SEED: Perfil[] = [
  { id: "alejandra-bernal", nombre: "Alejandra Bernal", cargo: "Supervisora de Reclutamiento y Selección", role: "supervisor", avatar: "corona", tienePassword: false, source: "seed" },
  { id: "rocio-casas", nombre: "Rocío Casas", cargo: "Auxiliar de Reclutamiento y Selección", role: "auxiliar", avatar: "gatito", tienePassword: false, source: "seed" },
  { id: "mayra-chavez", nombre: "Mayra Chávez", cargo: "Analista de Reclutamiento y Selección", role: "analista", avatar: "balon", tienePassword: false, source: "seed" },
  { id: "alexander-abuna", nombre: "Alexander Abuna", cargo: "Analista de Reclutamiento y Selección", role: "analista", avatar: "billetes", tienePassword: false, source: "seed" },
  { id: "ximena-gutierrez", nombre: "Ximena Gutiérrez", cargo: "Analista de Reclutamiento y Selección", role: "analista", avatar: "estrellas", tienePassword: false, source: "seed" },
  { id: "pasante", nombre: "Pasante", cargo: "Pasantía · Reclutamiento y Selección", role: "pasante", avatar: "pasante", tienePassword: false, source: "seed" },
  { id: "administrador", nombre: "Administrador", cargo: "Administración del Sistema", role: "admin", avatar: "admin", tienePassword: false, source: "seed" },
];

/* ------------------------------------------------------------------ */
/* Per-profile configuration bundle                                    */
/* ------------------------------------------------------------------ */

export interface ProfileConfigBundle {
  theme?: "dark" | "light";
  appConfig?: Partial<AppConfig>;
  layout?: DashWidget[];
}

export interface ActivityEntry {
  modulo?: string;
  accion: string;
  detalle?: string;
}

interface ProfilesState {
  profiles: Perfil[];
  currentId: string | null;
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */

const SESSION_COOKIE = "bdp_perfil_sesion";
const PASS_KEY = "bdp-perfil-pass";
const bundleKey = (id: string) => `bdp-perfil-cfg-${id}`;
const logKey = (id: string) => `bdp-perfil-log-${id}`;

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 86400;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function delCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function readJson<T>(key: string, fallback: T): T {
  return leerJson<T>(key, fallback);
}
function writeJson(key: string, value: unknown): void {
  escribirJson(key, value);
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

let state: ProfilesState = {
  profiles: [...SEED],
  currentId: getCookie(SESSION_COOKIE),
};
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getProfile(id: string | null): Perfil | null {
  if (!id) return null;
  return state.profiles.find((p) => p.id === id) ?? null;
}

/** Merge sheet-provided profiles into the seed set (matched by name/id). */
export function mergeBackendProfiles(raw: RawPerfil[]): void {
  if (!Array.isArray(raw) || raw.length === 0) return;
  const byId = new Map(state.profiles.map((p) => [p.id, { ...p }]));

  for (const r of raw) {
    const nombre = String(r.nombre_perfil ?? "").trim();
    if (!nombre) continue;
    const id = slug(nombre);
    let datos: Record<string, unknown> = {};
    try {
      datos = r.datos_perfil ? JSON.parse(String(r.datos_perfil)) : {};
    } catch {
      datos = {};
    }
    const existing = byId.get(id);
    const cargo = String(r.cargo_perfil ?? existing?.cargo ?? "").trim();
    const role = (typeof datos.role === "string" && datos.role in ROLE_LEVEL
      ? (datos.role as Role)
      : existing?.role ?? inferRole(cargo));
    const avatar = (typeof datos.avatar === "string"
      ? (datos.avatar as AvatarKind)
      : existing?.avatar ?? "estrellas");
    byId.set(id, {
      id,
      nombre,
      cargo,
      role,
      avatar,
      tienePassword: Boolean((r as { tiene_password?: boolean }).tiene_password),
      source: "backend",
    });
  }

  // Preserve seed order first, then any purely-backend additions.
  const seedOrder = SEED.map((s) => s.id);
  const merged = [
    ...seedOrder.map((id) => byId.get(id)).filter(Boolean) as Perfil[],
    ...[...byId.values()].filter((p) => !seedOrder.includes(p.id)),
  ];
  state = { ...state, profiles: merged };
  emit();
}

function inferRole(cargo: string): Role {
  const c = cargo.toLowerCase();
  if (c.includes("supervis")) return "supervisor";
  if (c.includes("auxiliar")) return "auxiliar";
  if (c.includes("pasant")) return "pasante";
  if (c.includes("admin")) return "admin";
  return "analista";
}

/* ---- authentication ---- */

function localPassMap(): Record<string, string> {
  return readJson<Record<string, string>>(PASS_KEY, {});
}

/**
 * Attempt to log in. Online (sheet deployed) validates the password against the
 * backend; offline / seed-only profiles use a per-device PIN set on first use.
 */
export async function attemptLogin(
  id: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const profile = getProfile(id);
  if (!profile) return { ok: false, error: "Perfil no encontrado." };

  if (profile.tienePassword) {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "perfil_login", nombre: profile.nombre, contrasena: password }),
      });
      const data = (await res.json()) as {
        status?: string;
        perfil?: { config_personal_perfil?: string };
        message?: string;
      };
      if (data.status === "success") {
        applyBackendConfig(id, data.perfil?.config_personal_perfil);
        doLogin(id);
        return { ok: true };
      }
      return { ok: false, error: data.message || "Contraseña incorrecta." };
    } catch {
      // Network failure — fall back to the local PIN so nobody is locked out.
    }
  }

  const map = localPassMap();
  const stored = map[id];
  if (stored != null && stored !== "") {
    if (password !== stored) return { ok: false, error: "Contraseña incorrecta." };
  } else if (password.trim() !== "") {
    // Set-on-first-use: this device remembers the chosen PIN.
    map[id] = password;
    writeJson(PASS_KEY, map);
  }
  doLogin(id);
  return { ok: true };
}

function applyBackendConfig(id: string, configJson?: string): void {
  if (!configJson) return;
  try {
    const bundle = JSON.parse(configJson) as ProfileConfigBundle;
    if (bundle && typeof bundle === "object") writeJson(bundleKey(id), bundle);
  } catch {
    /* ignore malformed remote config */
  }
}

function doLogin(id: string): void {
  setCookie(SESSION_COOKIE, id, 3650); // ~10 years — indefinite until logout
  state = { ...state, currentId: id };
  applyBundle(id);
  emit();
  logActivity({ accion: "Inicio de sesión" });
}

export function logout(): void {
  const prev = state.currentId;
  if (prev) logActivity({ accion: "Cierre de sesión" });
  delCookie(SESSION_COOKIE);
  state = { ...state, currentId: null };
  emit();
}

/* ---- per-profile config bundle ---- */

export function getBundle(id: string): ProfileConfigBundle {
  return readJson<ProfileConfigBundle>(bundleKey(id), {});
}

/** Capture the current global preferences as this session's bundle. */
export function captureBundle(): ProfileConfigBundle {
  // Vía `almacenLocal`: esta función se ejecuta en cada cambio de configuración
  // (la suscripción del final del archivo), así que un acceso que lanza dejaba
  // **inservibles todos los interruptores** de Configuración y del Comparador en
  // un navegador con el almacenamiento bloqueado.
  const theme = (almacenLocal.get("bdp-theme") as "dark" | "light" | null) ?? undefined;
  return { theme, appConfig: getConfig(), layout: getLayout() };
}

/** Apply a profile's saved bundle to the live app (theme handled by the app). */
function applyBundle(id: string): void {
  const bundle = getBundle(id);
  if (bundle.appConfig) setConfig(bundle.appConfig);
  if (bundle.layout) importLayout(bundle.layout);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounced save of the current bundle (local + best-effort backend). */
export function saveCurrentBundle(): void {
  const id = state.currentId;
  if (!id) return;
  const bundle = captureBundle();
  writeJson(bundleKey(id), bundle);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const profile = getProfile(id);
    if (!profile) return;
    void fetch(SCRIPT_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "perfil_config", nombre: profile.nombre, config: JSON.stringify(bundle) }),
    }).catch(() => {});
  }, 1200);
}

/* ---- activity log ---- */

export function logActivity(entry: ActivityEntry): void {
  const id = state.currentId;
  if (!id) return;
  const profile = getProfile(id);
  if (!profile) return;
  const now = new Date();
  const full = {
    fecha: now.toISOString().slice(0, 10),
    hora: now.toTimeString().slice(0, 8),
    perfil: profile.nombre,
    dispositivo: shortDevice(),
    modulo: entry.modulo ?? "",
    accion: entry.accion,
    detalle: entry.detalle ?? "",
  };
  // Local mirror (capped) for offline inspection.
  const local = readJson<(typeof full)[]>(logKey(id), []);
  local.push(full);
  writeJson(logKey(id), local.slice(-400));
  // Best-effort remote append.
  void fetch(SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ type: "perfil_log", nombre: profile.nombre, entrada: entry }),
  }).catch(() => {});
}

export function readLocalLog(id: string): Array<Record<string, string>> {
  return readJson<Array<Record<string, string>>>(logKey(id), []);
}

function shortDevice(): string {
  if (typeof navigator === "undefined") return "desconocido";
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Otro";
  const br = /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Navegador";
  return `${br} · ${os}`;
}

/* ------------------------------------------------------------------ */
/* Auto-save: mirror global preference changes into the active bundle  */
/* ------------------------------------------------------------------ */

if (typeof window !== "undefined") {
  subscribeConfig(() => saveCurrentBundle());
  subscribeDashboard(() => saveCurrentBundle());
}

/* ------------------------------------------------------------------ */
/* React bindings                                                      */
/* ------------------------------------------------------------------ */

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot(): ProfilesState {
  return state;
}

export function useProfiles(): ProfilesState & { current: Perfil | null } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...snap, current: getProfile(snap.currentId) };
}
