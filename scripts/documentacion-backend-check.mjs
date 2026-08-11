#!/usr/bin/env node
/**
 * Verificador de coherencia del módulo de Documentación.
 *
 * Comprueba, sin red y sin ejecutar nada, que el backend de Apps Script y el
 * frontend hablen el mismo idioma. Se ejecuta con:
 *
 *     npm run doc:check
 *
 * -- Por qué existe ----------------------------------------------------------
 * Apps Script no tiene módulos: todos los .gs comparten un único espacio global.
 * Si dos archivos declaran una función con el mismo nombre, la segunda pisa a la
 * primera en silencio —gana la del último archivo por orden alfabético— y no hay
 * error en ningún momento: simplemente se ejecuta el cuerpo equivocado. Es el
 * fallo más caro de depurar de esta plataforma y aquí se detecta en un segundo.
 *
 * Tampoco existe verificación de tipos entre `docApi.ts` y el router: si el
 * frontend pide una acción que el backend no atiende, el error solo aparece en
 * producción. Esa correspondencia también se contrasta aquí.
 *
 * Código de salida 0 si todo está bien, 1 si hay algo que corregir.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_GS = join(raiz, "apps-script", "documentacion");
const DIR_LIB = join(raiz, "src", "lib", "doc");
const DIR_UI = join(raiz, "src", "components", "doc");

const COLOR = process.stdout.isTTY;
const rojo = (t) => (COLOR ? `\u001b[31m${t}\u001b[0m` : t);
const verde = (t) => (COLOR ? `\u001b[32m${t}\u001b[0m` : t);
const ambar = (t) => (COLOR ? `\u001b[33m${t}\u001b[0m` : t);
const gris = (t) => (COLOR ? `\u001b[90m${t}\u001b[0m` : t);
const negrita = (t) => (COLOR ? `\u001b[1m${t}\u001b[0m` : t);

const errores = [];
const avisos = [];
let comprobaciones = 0;

function fallo(titulo, detalle) {
  errores.push({ titulo, detalle });
}

function aviso(titulo, detalle) {
  avisos.push({ titulo, detalle });
}

function ok(texto) {
  comprobaciones++;
  console.log(`  ${verde("\u2713")} ${texto}`);
}

function leer(ruta) {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return null;
  }
}

/** Quita comentarios y cadenas para que las búsquedas no den falsos positivos. */
function limpiar(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

console.log(negrita("\nVerificaci\u00f3n del m\u00f3dulo de Documentaci\u00f3n\n"));

/* ------------------------------------------------------------------ */
/* 1. Presencia de archivos                                            */
/* ------------------------------------------------------------------ */

console.log(negrita("Archivos"));

const GS_ESPERADOS = [
  "appsscript.json",
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
];

const UI_ESPERADOS = [
  "DocMotion.tsx",
  "DocSyncIndicator.tsx",
  "DocBackupPanel.tsx",
  "DocMaintenancePanel.tsx",
  "DocDossierDetail.tsx",
  "DocSettingsModal.tsx",
  "DocIntakeForm.tsx",
];

const LIB_ESPERADOS = ["docSchema.ts", "docApi.ts", "docBackup.ts"];

if (!existsSync(DIR_GS)) {
  fallo("Falta el backend", `No existe la carpeta ${gris("apps-script/documentacion")}`);
} else {
  const faltan = GS_ESPERADOS.filter((f) => !existsSync(join(DIR_GS, f)));
  if (faltan.length) fallo("Archivos de Apps Script ausentes", faltan.join(", "));
  else ok(`${GS_ESPERADOS.length} archivos de Apps Script presentes`);
}

for (const [dir, lista, etiqueta] of [
  [DIR_LIB, LIB_ESPERADOS, "capa de datos"],
  [DIR_UI, UI_ESPERADOS, "componentes"],
]) {
  const faltan = lista.filter((f) => !existsSync(join(dir, f)));
  if (faltan.length) fallo(`Archivos ausentes en ${etiqueta}`, faltan.join(", "));
  else ok(`${lista.length} archivos de ${etiqueta} presentes`);
}

/* ------------------------------------------------------------------ */
/* 2. Colisiones de nombres en el espacio global de Apps Script        */
/* ------------------------------------------------------------------ */

console.log(negrita("\nEspacio global de Apps Script"));

const archivosGs = existsSync(DIR_GS)
  ? readdirSync(DIR_GS).filter((f) => f.endsWith(".gs"))
  : [];

/** nombre de función -> archivos donde se declara */
const declaraciones = new Map();

for (const archivo of archivosGs) {
  const codigo = limpiar(leer(join(DIR_GS, archivo)) ?? "");
  const re = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = re.exec(codigo)) !== null) {
    const nombre = match[1];
    if (!declaraciones.has(nombre)) declaraciones.set(nombre, []);
    declaraciones.get(nombre).push(archivo);
  }
}

const colisiones = [...declaraciones.entries()].filter(([, files]) => files.length > 1);

if (colisiones.length) {
  fallo(
    "Funciones duplicadas en el espacio global",
    colisiones
      .map(([nombre, files]) => `${nombre}() en ${files.join(" y ")}`)
      .join("\n              "),
  );
} else if (declaraciones.size > 0) {
  ok(`${declaraciones.size} funciones globales, sin colisiones de nombre`);
}

/* ------------------------------------------------------------------ */
/* 3. Llaves y paréntesis balanceados                                  */
/* ------------------------------------------------------------------ */

for (const archivo of archivosGs) {
  const codigo = limpiar(leer(join(DIR_GS, archivo)) ?? "");
  const abre = (codigo.match(/\{/g) ?? []).length;
  const cierra = (codigo.match(/\}/g) ?? []).length;
  if (abre !== cierra) {
    fallo(
      `Llaves desbalanceadas en ${archivo}`,
      `${abre} de apertura frente a ${cierra} de cierre. Suele indicar un archivo truncado al copiar y pegar.`,
    );
  }
}
if (archivosGs.length && !errores.some((e) => e.titulo.startsWith("Llaves"))) {
  ok("Llaves balanceadas en todos los archivos .gs");
}

/* ------------------------------------------------------------------ */
/* 4. Acciones del router frente a las que invoca el frontend          */
/* ------------------------------------------------------------------ */

console.log(negrita("\nContrato entre frontend y backend"));

const router = leer(join(DIR_GS, "08_Router.gs"));
const docApi = leer(join(DIR_LIB, "docApi.ts"));

if (!router) {
  fallo("No se pudo leer el router", "apps-script/documentacion/08_Router.gs");
} else if (!docApi) {
  fallo("No se pudo leer docApi", "src/lib/doc/docApi.ts");
} else {
  // El router reparte con case 'accion':
  const atendidas = new Set();
  const reCase = /case\s+'([a-z0-9._-]+)'/gi;
  let m;
  while ((m = reCase.exec(router)) !== null) atendidas.add(m[1]);

  // El frontend las pide por cadena literal en llamadas a la pasarela.
  const invocadas = new Set();
  const reLlamada = /(?:llamar|pedir|enviar|accion)\s*[<(][^)'"]*['"]([a-z0-9._-]+)['"]/gi;
  while ((m = reLlamada.exec(docApi)) !== null) invocadas.add(m[1]);

  if (atendidas.size === 0) {
    aviso(
      "No se reconocieron acciones en el router",
      "Se esperaba un reparto con case 'accion'. Revise 08_Router.gs a mano.",
    );
  } else {
    ok(`${atendidas.size} acciones atendidas por el router`);

    const huerfanas = [...invocadas].filter((a) => !atendidas.has(a));
    if (huerfanas.length) {
      fallo(
        "El frontend invoca acciones que el router no atiende",
        huerfanas.join(", "),
      );
    } else if (invocadas.size > 0) {
      ok(`${invocadas.size} acciones invocadas desde el frontend, todas atendidas`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 5. Símbolos importados de docSchema                                 */
/* ------------------------------------------------------------------ */

const schema = leer(join(DIR_LIB, "docSchema.ts"));

if (schema) {
  const exportados = new Set();
  const reExport =
    /export\s+(?:const|function|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = reExport.exec(schema)) !== null) exportados.add(m[1]);

  const consumidores = [];
  for (const [dir, lista] of [
    [DIR_UI, UI_ESPERADOS],
    [DIR_LIB, LIB_ESPERADOS],
  ]) {
    for (const f of lista) {
      const ruta = join(dir, f);
      if (existsSync(ruta)) consumidores.push(ruta);
    }
  }
  const modulos = join(raiz, "src", "modules", "Documentacion.tsx");
  if (existsSync(modulos)) consumidores.push(modulos);
  const store = join(raiz, "src", "lib", "docStore.ts");
  if (existsSync(store)) consumidores.push(store);

  const rotos = [];
  for (const ruta of consumidores) {
    const codigo = leer(ruta) ?? "";
    const reImport = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"][^'"]*docSchema['"]/g;
    let im;
    while ((im = reImport.exec(codigo)) !== null) {
      const simbolos = im[1]
        .split(",")
        .map((s) => s.replace(/\btype\b/g, "").split(/\sas\s/)[0].trim())
        .filter(Boolean);
      for (const s of simbolos) {
        if (!exportados.has(s)) rotos.push(`${basename(ruta)} importa ${s}`);
      }
    }
  }

  if (rotos.length) {
    fallo("S\u00edmbolos importados que docSchema no exporta", rotos.join("\n              "));
  } else {
    ok(`${exportados.size} s\u00edmbolos exportados por docSchema, todas las importaciones resuelven`);
  }
}

/* ------------------------------------------------------------------ */
/* 6. Clases CSS referenciadas                                         */
/* ------------------------------------------------------------------ */

const css = leer(join(DIR_UI, "doc-motion.css"));
if (css) {
  const faltantes = ["doc-shimmer", "doc-scroll-suave"].filter(
    (clase) => !css.includes(`.${clase}`),
  );
  if (faltantes.length) fallo("Clases CSS sin definir", faltantes.join(", "));
  else ok("Clases de movimiento definidas");
} else {
  aviso("Sin hoja de estilos del m\u00f3dulo", "No se encontr\u00f3 doc-motion.css");
}

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

console.log("");

for (const a of avisos) {
  console.log(`  ${ambar("!")} ${negrita(a.titulo)}`);
  console.log(`      ${gris(a.detalle)}`);
}

for (const e of errores) {
  console.log(`  ${rojo("\u2717")} ${negrita(e.titulo)}`);
  console.log(`      ${e.detalle}`);
}

console.log("");

if (errores.length === 0) {
  console.log(verde(negrita(`  ${comprobaciones} comprobaciones superadas.\n`)));
  process.exit(0);
} else {
  console.log(
    rojo(
      negrita(
        `  ${errores.length} problema(s) por corregir de ${comprobaciones + errores.length} comprobaciones.\n`,
      ),
    ),
  );
  process.exit(1);
}
