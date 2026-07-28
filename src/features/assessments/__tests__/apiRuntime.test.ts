import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

/**
 * El backend intermedio, tal y como lo ejecuta la producción.
 *
 * Por qué existe esta prueba: el módulo Evaluaciones estuvo caído con
 * `FUNCTION_INVOCATION_FAILED` mientras las 326 pruebas del repositorio pasaban
 * en verde. Las pruebas comprobaban la LÓGICA de `api/evaluations/*.ts`
 * importándolos como cualquier módulo del bundle. Producción no hace eso:
 *
 *   1. Vercel transpila cada archivo por separado (no lo empaqueta) y Node lo
 *      carga como ESM, porque `package.json` declara `"type": "module"`. Un
 *      import relativo sin extensión —que el bundler resolvía sin quejarse—
 *      revienta con `ERR_MODULE_NOT_FOUND` antes de ejecutar una sola línea.
 *   2. El lanzador decide cómo invocar la función según lo que el módulo
 *      exporta. Solo las exportaciones con nombre de método HTTP reciben la API
 *      web `(Request) => Response`; un `export default` se invoca `(req, res)`.
 *
 * Así que aquí no se importa nada del programa de pruebas: se transpila el árbol
 * `api/` a ESM real, se lanza un **proceso de Node aparte** —sin Vite, sin
 * alias, sin nada— y se comprueba que cargue y responda. Es la reproducción más
 * fiel del entorno de Vercel que puede hacerse sin desplegar.
 */

const ROOT = resolve(__dirname, "../../../..");
const API_DIR = join(ROOT, "api");

/** Valores de prueba. No son secretos reales y nunca salen de este archivo. */
const CONFIG = {
  EVALUATIONS_APPS_SCRIPT_URL: "https://script.example.com/macros/s/AB/exec",
  EVALUATIONS_ADMIN_SHARED_SECRET: "secreto-administrativo-de-pruebas-0123456789",
  EVALUATIONS_PANEL_PASSPHRASE: "frase-de-acceso-de-pruebas-del-panel",
  EVALUATIONS_SESSION_SECRET: "secreto-de-sesion-de-pruebas-0123456789",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

const apiFiles = walk(API_DIR);

/**
 * Transpila `api/` a JavaScript ESM conservando los especificadores tal cual,
 * que es exactamente lo que hace el constructor de Vercel con TypeScript.
 */
function buildProductionTree(): string {
  const outDir = mkdtempSync(join(tmpdir(), "api-runtime-"));
  // Sin este `package.json`, Node interpretaría los `.js` como CommonJS y la
  // prueba dejaría de reproducir el despliegue.
  writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "module" }));
  for (const file of apiFiles) {
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        isolatedModules: true,
      },
      fileName: file,
    });
    const destination = join(outDir, relative(ROOT, file).replace(/\.ts$/, ".js"));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, outputText);
  }
  return outDir;
}

interface ProbeReport {
  session: { exports: string[]; usesWebHandlers: boolean; hasDefault: boolean };
  admin: { exports: string[]; usesWebHandlers: boolean; hasDefault: boolean };
  anonymousSession: { status: number; body: string };
  adminWithoutSession: { status: number; body: string };
  unconfiguredSession: { status: number; body: string };
}

/**
 * Guion que se ejecuta en el proceso de Node aparte.
 *
 * Replica la detección del lanzador de Vercel (ver `vercelFunction.ts`) y ejerce
 * los dos casos que el usuario vive en pantalla: entrar sin sesión y pedir una
 * operación administrativa sin sesión.
 */
const PROBE = `
import * as session from "./api/evaluations/session.js";
import * as admin from "./api/evaluations/admin.js";

const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"];

function describeModule(mod) {
  let listener = mod;
  for (let i = 0; i < 5; i++) if (listener.default) listener = listener.default;
  return {
    exports: Object.keys(mod).sort(),
    hasDefault: typeof mod.default !== "undefined",
    usesWebHandlers:
      HTTP_METHODS.some((method) => typeof listener[method] === "function") ||
      typeof listener.fetch === "function",
  };
}

async function call(mod, method, url, init = {}) {
  const response = await mod[method](new Request(url, { method, ...init }));
  return { status: response.status, body: await response.text() };
}

const report = {
  session: describeModule(session),
  admin: describeModule(admin),
  anonymousSession: await call(session, "GET", "https://panel.example.com/api/evaluations/session", {
    headers: { host: "panel.example.com" },
  }),
  adminWithoutSession: await call(admin, "POST", "https://panel.example.com/api/evaluations/admin", {
    headers: { host: "panel.example.com", "content-type": "application/json" },
    body: JSON.stringify({ action: "listAdminAssessments", requestId: "", payload: {} }),
  }),
};

// Y sin configuración: debe seguir siendo JSON controlado, no una excepción.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("EVALUATIONS_")) delete process.env[name];
}
report.unconfiguredSession = await call(session, "GET", "https://panel.example.com/api/evaluations/session", {
  headers: { host: "panel.example.com" },
});

process.stdout.write(JSON.stringify(report));
`;

let report: ProbeReport;

beforeAll(() => {
  const outDir = buildProductionTree();
  writeFileSync(join(outDir, "probe.mjs"), PROBE);
  const result = spawnSync(process.execPath, [join(outDir, "probe.mjs")], {
    encoding: "utf8",
    env: { ...process.env, ...CONFIG },
  });
  // Si el módulo no carga (el fallo original), aquí aparece el motivo exacto.
  expect(result.stderr, result.stderr).toBe("");
  expect(result.status).toBe(0);
  report = JSON.parse(result.stdout) as ProbeReport;
}, 60000);

describe("backend intermedio · formato desplegado", () => {
  it("todos los imports relativos de api/ llevan extensión .js", () => {
    const offenders: string[] = [];
    for (const file of apiFiles) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
        if (!match[1].endsWith(".js")) offenders.push(`${relative(ROOT, file)} → ${match[1]}`);
      }
    }
    // ESM no adivina extensiones: sin `.js`, Node lanza ERR_MODULE_NOT_FOUND.
    expect(offenders).toEqual([]);
  });

  it("las funciones cargan en el runtime de producción, sin ERR_MODULE_NOT_FOUND", () => {
    // `beforeAll` ya habría fallado; esta aserción documenta la intención.
    expect(report).toBeDefined();
  });

  it("exportan handlers web y NO exportan default", () => {
    for (const fn of [report.session, report.admin]) {
      expect(fn.usesWebHandlers).toBe(true);
      // Un `default` residual haría que Vercel ignorase GET/POST y llamara al
      // módulo con (req, res): TypeError y FUNCTION_INVOCATION_FAILED.
      expect(fn.hasDefault).toBe(false);
    }
    expect(report.session.exports).toContain("GET");
    expect(report.session.exports).toContain("POST");
    expect(report.session.exports).toContain("DELETE");
    expect(report.admin.exports).toContain("POST");
  });
});

describe("backend intermedio · respuestas controladas", () => {
  it("GET /session sin cookie devuelve JSON con active:false, no un 500", () => {
    expect(report.anonymousSession.status).toBe(200);
    const envelope = JSON.parse(report.anonymousSession.body) as { ok: boolean; data: { active: boolean } };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.active).toBe(false);
  });

  it("POST /admin sin sesión devuelve adminSession:\"required\", no un 500", () => {
    expect(report.adminWithoutSession.status).toBe(200);
    const envelope = JSON.parse(report.adminWithoutSession.body) as {
      ok: boolean;
      error: { code: string; details: Record<string, unknown> };
    };
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe("FORBIDDEN");
    expect(envelope.error.details.adminSession).toBe("required");
  });

  it("sin variables de entorno nombra la que falta y sigue respondiendo JSON", () => {
    const envelope = JSON.parse(report.unconfiguredSession.body) as {
      ok: boolean;
      error: { message: string; details: Record<string, unknown> };
    };
    expect(envelope.ok).toBe(false);
    expect(envelope.error.details.adminSession).toBe("unconfigured");
    expect(envelope.error.message).toContain("EVALUATIONS_APPS_SCRIPT_URL");
  });

  it("ninguna respuesta contiene un secreto", () => {
    const everything = [
      report.anonymousSession.body,
      report.adminWithoutSession.body,
      report.unconfiguredSession.body,
    ].join("\n");
    expect(everything).not.toContain(CONFIG.EVALUATIONS_ADMIN_SHARED_SECRET);
    expect(everything).not.toContain(CONFIG.EVALUATIONS_PANEL_PASSPHRASE);
    expect(everything).not.toContain(CONFIG.EVALUATIONS_SESSION_SECRET);
  });
});
