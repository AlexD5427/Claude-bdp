#!/usr/bin/env node
/**
 * Verificaciones estáticas del módulo Evaluaciones.
 *
 * El repositorio no tiene ESLint (comprobado: no hay `eslint.config.*`,
 * `.eslintrc*` ni script `lint`), y añadirlo produciría cientos de hallazgos en
 * módulos fuera del alcance de esta tarea. Este verificador, sin dependencias,
 * cubre las invariantes concretas que la revisión exige:
 *
 *   1. Ningún `TODO` / `FIXME` / `XXX` / `pseudocódigo` en el código del módulo.
 *   2. Ninguna llamada `fetch(` dentro de componentes o del dominio: el
 *      transporte vive solo en la capa de API.
 *   3. Ningún `any` explícito ni `@ts-ignore` en el código del módulo.
 *   4. Ninguna clave de respuesta en la ruta pública (saneadores y DTO público).
 *   5. Ningún secreto con forma de credencial.
 *   6. Los datos de demostración solo se alcanzan por el proveedor mock.
 *   7. Los encabezados de las hojas coinciden entre Config.gs y DATA_MODEL.md.
 *   8. Cada archivo .gs está declarado en el arnés de pruebas.
 *
 * Uso:  npm run check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const failures = [];
const notes = [];

function fail(rule, file, detail) {
  failures.push({ rule, file, detail });
}

function walk(dir, filter, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      walk(full, filter, out);
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

const MODULE_DIRS = [
  "src/features/assessments",
  "src/infrastructure/providers/google-apps-script",
  "src/infrastructure/mappers",
  "apps-script/evaluations",
];

const moduleFiles = MODULE_DIRS.flatMap((dir) =>
  walk(join(ROOT, dir), (file) => /\.(ts|tsx|gs|mjs)$/.test(file)),
);

const isTest = (file) => /\.test\.tsx?$/.test(file);

/* 1 · Marcadores de trabajo pendiente ------------------------------------- */
for (const file of moduleFiles) {
  const text = readFileSync(file, "utf8");
  for (const marker of ["TODO", "FIXME", "XXX", "HACK", "pseudocódigo", "pseudocode"]) {
    // Se busca el marcador como palabra, para no confundirlo con texto normal.
    const pattern = new RegExp(`(^|[^A-Za-z])${marker}([^A-Za-z]|$)`);
    if (pattern.test(text)) fail("marcadores-pendientes", file, marker);
  }
  if (/function\s+\w+\s*\([^)]*\)\s*\{\s*\}/.test(text) && !isTest(file)) {
    fail("funcion-vacia", file, "función con cuerpo vacío");
  }
}

/* 2 · `fetch` solo en la capa de transporte ------------------------------- */
const TRANSPORT_ALLOWLIST = [
  "src/features/assessments/api/transport.ts",
  "src/infrastructure/providers/google-apps-script/client.ts",
];
for (const file of moduleFiles) {
  if (isTest(file)) continue;
  const rel = relative(ROOT, file).split("\\").join("/");
  if (TRANSPORT_ALLOWLIST.includes(rel)) continue;
  const text = readFileSync(file, "utf8");
  if (/\bfetch\s*\(/.test(text)) fail("fetch-fuera-de-transporte", file, "llamada fetch(");
  if (/\bXMLHttpRequest\b/.test(text)) fail("fetch-fuera-de-transporte", file, "XMLHttpRequest");
}

/* 3 · `any` y supresiones de tipos ---------------------------------------- */
for (const file of moduleFiles) {
  if (!/\.tsx?$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (/@ts-ignore|@ts-nocheck/.test(line)) {
      fail("supresion-de-tipos", file, `línea ${index + 1}`);
    }
    // Se ignoran los comentarios: la palabra «any» puede aparecer en prosa.
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (/^\s*\*/.test(line)) return;
    if (/\bas\s+any\b|:\s*any\b|<any>/.test(code)) {
      fail("any-explicito", file, `línea ${index + 1}: ${line.trim().slice(0, 80)}`);
    }
  });
}

/* 4 · Claves de respuesta en la ruta pública ------------------------------ */
const PUBLIC_PATH_FILES = [
  "src/infrastructure/mappers/publicDto.ts",
  "src/features/assessments/api/publicApi.ts",
  "apps-script/evaluations/Sanitize.gs",
  "apps-script/evaluations/PublicAssessmentService.gs",
];
/**
 * En estos archivos las claves prohibidas solo pueden aparecer dentro de un
 * comentario o de una lista de exclusión, nunca como propiedad emitida
 * (`clave:` o `clave =`).
 */
const FORBIDDEN_PUBLIC_KEYS = [
  "isCorrect",
  "is_correct",
  "correctAnswer",
  "answerKey",
  "scoreValue",
  "score_value",
  "pointsAwarded",
  "points_awarded",
  "internalInstructions",
  "internal_instructions",
  "passingScore",
  "passing_score",
];
for (const rel of PUBLIC_PATH_FILES) {
  const file = join(ROOT, rel);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const stripped = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    if (/^\s*\*/.test(line)) return; // bloque de comentario
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      const emitted = new RegExp(`\\b${key}\\s*[:=]`);
      if (emitted.test(stripped)) {
        fail("clave-de-respuesta-en-ruta-publica", file, `línea ${index + 1}: ${key}`);
      }
    }
  });
}

/* 5 · Secretos ------------------------------------------------------------ */
const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/, "clave de API de Google"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clave privada"],
  [/\bsk-[A-Za-z0-9]{20,}/, "clave secreta tipo sk-"],
  [/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, "token JWT"],
];

/**
 * Credencial escrita a mano. Se analiza línea a línea porque hay dos casos que
 * NO son secretos y conviene distinguir sin debilitar la regla:
 *
 *   · el NOMBRE de una variable de entorno
 *     (`ADMIN_SHARED_SECRET: 'EVALUATIONS_ADMIN_SHARED_SECRET'`);
 *   · un dato de prueba en un archivo de pruebas (`*.test.ts` o `Tests.gs`), que
 *     además debe declararse como tal en su propio valor («…-de-pruebas-…»). Así
 *     una credencial real copiada por error sigue saltando, porque no llevará esa
 *     marca.
 */
const CREDENTIAL_LITERAL =
  /(?:password|contrasena|contraseña|secret|secreto|token|passphrase|frase)\w*\s*[:=]\s*["']([^"'\s]{12,})["']/i;
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;
const FIXTURE_MARKERS = ["prueba", "pruebas", "ejemplo", "fixture", "reemplazar"];
const isFixtureFile = (file) => isTest(file) || /(^|[/\\])Tests\.gs$/.test(file);

const secretScope = [
  ...moduleFiles,
  ...walk(join(ROOT, "api"), (file) => /\.ts$/.test(file)),
  ...walk(join(ROOT, "docs", "evaluations"), (file) => file.endsWith(".md")),
  join(ROOT, ".env.example"),
];
for (const file of secretScope) {
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(text)) fail("posible-secreto", file, label);
  }
  text.split("\n").forEach((line, index) => {
    const match = CREDENTIAL_LITERAL.exec(line);
    if (!match) return;
    const value = match[1];
    if (ENV_VAR_NAME.test(value)) return;
    const isFixture =
      isFixtureFile(file) && FIXTURE_MARKERS.some((marker) => value.toLowerCase().includes(marker));
    if (isFixture) return;
    fail("posible-secreto", file, `credencial literal en la línea ${index + 1}`);
  });
}

/* 5 bis · Frontera del backend intermedio --------------------------------- */
/**
 * El backend intermedio (`api/`) custodia el secreto de firma. Dos reglas
 * mantienen la frontera evidente:
 *
 *   · nada de `src/` puede importar `api/`, para que ni un solo byte de esa
 *     carpeta pueda acabar en el bundle del navegador;
 *   · `api/` no lee variables `VITE_`, porque esas sí se publican.
 */
const apiFiles = walk(join(ROOT, "api"), (file) => /\.ts$/.test(file));
for (const file of apiFiles) {
  const text = readFileSync(file, "utf8");
  if (/\bVITE_[A-Z0-9_]+/.test(text)) {
    fail("api-usa-variable-publica", file, "referencia a una variable VITE_");
  }
  if (/from\s+["'][^"']*\/src\//.test(text) || /from\s+["']@\//.test(text)) {
    fail("api-importa-frontend", file, "importa código del bundle del navegador");
  }
}
for (const file of moduleFiles) {
  if (isTest(file)) continue; // Las pruebas sí comparan ambos lados.
  const text = readFileSync(file, "utf8");
  if (/from\s+["'][^"']*api\/_lib/.test(text)) {
    fail("frontend-importa-backend", file, "importa el backend intermedio");
  }
}

/* 5 ter · Formato con el que Vercel ejecuta el backend intermedio ---------- */
/**
 * Dos invariantes que no se notan en desarrollo y tumban la producción:
 *
 *   · Vercel transpila `api/` sin empaquetar y Node lo carga como ESM (el
 *     `package.json` declara `"type": "module"`), así que todo import relativo
 *     necesita su extensión `.js`. Sin ella: `ERR_MODULE_NOT_FOUND`.
 *   · El lanzador invoca la función con la API web solo si el módulo exporta
 *     funciones con nombre de método HTTP; un `export default` la convierte en
 *     un handler `(req, res)` y el código estalla al leer las cabeceras.
 *
 * `src/features/assessments/__tests__/apiRuntime.test.ts` lo comprueba
 * ejecutándolo de verdad; esto es la comprobación estática equivalente.
 */
const HTTP_METHOD_EXPORTS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE", "PATCH"];
for (const file of apiFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    if (!match[1].endsWith(".js")) {
      fail("import-sin-extension", file, `${match[1]} (ESM exige la extensión .js)`);
    }
  }
  const rel = relative(ROOT, file).split("\\").join("/");
  if (!rel.startsWith("api/_lib/")) {
    // Se analiza sin comentarios: la prosa de estos archivos EXPLICA por qué no
    // hay `export default`, y esa explicación no debe disparar el hallazgo.
    const code = text
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    if (/export\s+default\b/.test(code)) {
      fail("api-exporta-default", file, "Vercel lo invocaría como handler (req, res)");
    }
    const hasWebHandler = HTTP_METHOD_EXPORTS.some((method) =>
      new RegExp(`export\\s+(const|async\\s+function|function)\\s+${method}\\b`).test(text),
    );
    if (!hasWebHandler) {
      fail("api-sin-handler-web", file, "no exporta GET/POST/… con nombre de método HTTP");
    }
  }
}

/* 6 · Los mocks solo se alcanzan por el proveedor ------------------------- */
for (const file of moduleFiles) {
  if (isTest(file)) continue;
  const text = readFileSync(file, "utf8");
  if (/from\s+["'][^"']*providers\/mock/.test(text)) {
    fail("mock-en-produccion", file, "importa el proveedor mock directamente");
  }
}

/* 7 · Encabezados: Config.gs ↔ DATA_MODEL.md ------------------------------ */
const configText = readFileSync(join(ROOT, "apps-script/evaluations/Config.gs"), "utf8");
const dataModel = readFileSync(join(ROOT, "docs/evaluations/DATA_MODEL.md"), "utf8");
const headerBlock = configText.slice(configText.indexOf("var EVAL_HEADERS"));
const declaredHeaders = [...headerBlock.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
const uniqueHeaders = [...new Set(declaredHeaders)];
if (uniqueHeaders.length < 60) {
  fail("encabezados-config", "apps-script/evaluations/Config.gs", "se esperaban más encabezados");
}
for (const header of uniqueHeaders) {
  if (!dataModel.includes(`\`${header}\``)) {
    fail("encabezado-sin-documentar", "docs/evaluations/DATA_MODEL.md", header);
  }
}
notes.push(`Encabezados verificados contra DATA_MODEL.md: ${uniqueHeaders.length}`);

/* 8 · Archivos .gs declarados en el arnés --------------------------------- */
const harness = readFileSync(join(ROOT, "scripts/run-apps-script.mjs"), "utf8");
const gsOnDisk = readdirSync(join(ROOT, "apps-script/evaluations")).filter((name) =>
  name.endsWith(".gs"),
);
for (const name of gsOnDisk) {
  if (!harness.includes(`"${name}"`)) {
    fail("gs-no-declarado", "scripts/run-apps-script.mjs", name);
  }
}
notes.push(`Archivos .gs declarados: ${gsOnDisk.length}`);

/* 9 · Documentación esperada --------------------------------------------- */
const EXPECTED_DOCS = [
  "CURRENT_STATE.md",
  "IMPACT_MAP.md",
  "IMPLEMENTATION_PLAN.md",
  "ARCHITECTURE.md",
  "API_CONTRACT.md",
  "DATA_MODEL.md",
  "GOOGLE_SHEETS_SETUP.md",
  "APPS_SCRIPT_SETUP.md",
  "SECURITY.md",
  "TEST_PLAN.md",
  "DEPLOYMENT.md",
  "ROLLBACK.md",
  "PORTAL_CANDIDATES_HANDOFF.md",
  "DECISIONS.md",
  "PROGRESS.md",
  "CODE_REVIEW.md",
  "QUESTION_TYPES.md",
  "VISUAL_AUDIT.md",
  "UX_ARCHITECTURE.md",
  "MOTION_SYSTEM.md",
  "VISUAL_QA.md",
  "REPARACION_2026-07.md",
];
const docsPresent = readdirSync(join(ROOT, "docs/evaluations"));
for (const doc of EXPECTED_DOCS) {
  if (!docsPresent.includes(doc)) fail("documento-faltante", "docs/evaluations", doc);
}
notes.push(`Documentos presentes: ${docsPresent.filter((d) => d.endsWith(".md")).length}`);

/* Informe ---------------------------------------------------------------- */
console.log(`Archivos inspeccionados: ${moduleFiles.length}`);
for (const note of notes) console.log(`· ${note}`);

if (failures.length === 0) {
  console.log("\nSin hallazgos. ✔");
  process.exit(0);
}

console.error(`\n${failures.length} hallazgo(s):\n`);
for (const item of failures) {
  console.error(`  [${item.rule}] ${relative(ROOT, item.file)} → ${item.detail}`);
}
process.exit(1);
