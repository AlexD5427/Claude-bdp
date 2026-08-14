#!/usr/bin/env node
/**
 * Verificador de coherencia del módulo de Documentación.
 *
 *     npm run doc:check
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Apps Script no tiene módulos: todos los `.gs` comparten un único espacio global.
 * Si dos archivos declaran una función con el mismo nombre, la segunda pisa a la
 * primera EN SILENCIO —gana la del último archivo cargado— y no hay error en
 * ningún momento: simplemente se ejecuta el cuerpo equivocado. Es el fallo más
 * caro de depurar de esta plataforma y aquí se detecta en un segundo.
 *
 * Tampoco existe verificación de tipos entre el cliente del frontend y el registro
 * de acciones del backend: si la interfaz pide una acción que el backend no
 * atiende, el error aparece en producción. Esa correspondencia también se contrasta
 * aquí, y en los dos sentidos.
 *
 * ── Cómo lo comprueba ───────────────────────────────────────────────────────
 * Cargando el backend REAL en el arnés de Node (`scripts/documentacion-backend.mjs`)
 * y leyendo sus valores en ejecución: el registro de acciones, la lista heredada,
 * los nombres de hoja y el catálogo. Comparar contra el código ejecutado es lo
 * único que garantiza que la comprobación no envejezca.
 *
 * Código de salida 0 si todo está bien, 1 si hay algo que corregir.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GS_FILES, listUndeclaredGsFiles, loadBackend } from "./documentacion-backend.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_GS = join(raiz, "apps-script", "documentacion");
const DIR_FEATURE = join(raiz, "src", "features", "documentacion");
const DIR_LIB = join(raiz, "src", "lib", "doc");
const DIR_UI_HEREDADA = join(raiz, "src", "components", "doc");

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
  comprobaciones += 1;
  console.log(`  ${verde("\u2713")} ${texto}`);
}
function leer(ruta) {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}
function seccion(titulo) {
  console.log(`\n${negrita(titulo)}`);
}

/* ------------------------------------------------------------------ */
/* 1. Archivos                                                         */
/* ------------------------------------------------------------------ */

seccion("Archivos");

const GS_ESPERADOS = ["appsscript.json", ...GS_FILES];
const faltanGs = GS_ESPERADOS.filter((f) => !existsSync(join(DIR_GS, f)));
if (faltanGs.length) fallo("Faltan archivos del backend", faltanGs.join(", "));
else ok(`${GS_ESPERADOS.length} archivos de Apps Script presentes`);

const sinDeclarar = listUndeclaredGsFiles();
if (sinDeclarar.length) {
  fallo(
    "Hay archivos .gs sin declarar en el arnés",
    `${sinDeclarar.join(", ")}. Añádelos a GS_FILES en scripts/documentacion-backend.mjs, respetando el orden de carga.`,
  );
} else {
  ok("todos los .gs del backend están declarados en el arnés de pruebas");
}

const FEATURE_ESPERADOS = [
  "index.ts",
  "domain/vocabulario.ts",
  "domain/progreso.ts",
  "api/client.ts",
  "api/acciones.ts",
  "state/consola.ts",
  "export/xlsx.ts",
  "ui/DocumentacionConsola.tsx",
  "ui/piezas.tsx",
  "ui/useDatos.ts",
  "ui/SeccionPanel.tsx",
  "ui/SeccionExpedientes.tsx",
  "ui/ExpedienteLateral.tsx",
  "ui/SeccionTrabajo.tsx",
  "ui/SeccionReportes.tsx",
  "ui/SeccionConfiguracion.tsx",
  "ui/VistaLocal.tsx",
];
const faltanFeature = FEATURE_ESPERADOS.filter((f) => !existsSync(join(DIR_FEATURE, f)));
if (faltanFeature.length) fallo("Faltan archivos del módulo", faltanFeature.join(", "));
else ok(`${FEATURE_ESPERADOS.length} archivos del módulo presentes`);

const LIB_HEREDADA = ["docSchema.ts", "docApi.ts", "docBackup.ts"];
const faltanLib = LIB_HEREDADA.filter((f) => !existsSync(join(DIR_LIB, f)));
if (faltanLib.length) {
  fallo(
    "Falta la capa heredada",
    `${faltanLib.join(", ")}. La vista local y el almacén del equipo dependen de ella; no se puede borrar sin romper la regresión.`,
  );
} else {
  ok("la capa heredada del almacén local sigue en su sitio");
}

const UI_HEREDADA = ["DocMotion.tsx", "DocSettingsModal.tsx", "DocMaintenancePanel.tsx", "DocBackupPanel.tsx"];
const faltanUi = UI_HEREDADA.filter((f) => !existsSync(join(DIR_UI_HEREDADA, f)));
if (faltanUi.length) fallo("Faltan componentes heredados que el módulo reutiliza", faltanUi.join(", "));
else ok("los componentes heredados que la consola reutiliza están presentes");

/* ------------------------------------------------------------------ */
/* 2. Funciones globales duplicadas                                    */
/* ------------------------------------------------------------------ */

seccion("Espacio global de Apps Script");

const declaraciones = new Map();
for (const archivo of GS_FILES) {
  const texto = leer(join(DIR_GS, archivo));
  for (const match of texto.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)) {
    const nombre = match[1];
    if (!declaraciones.has(nombre)) declaraciones.set(nombre, []);
    declaraciones.get(nombre).push(archivo);
  }
  for (const match of texto.matchAll(/^var\s+([A-Za-z0-9_]+)\s*=/gm)) {
    const nombre = `var ${match[1]}`;
    if (!declaraciones.has(nombre)) declaraciones.set(nombre, []);
    declaraciones.get(nombre).push(archivo);
  }
}

const duplicadas = [...declaraciones.entries()].filter(([, archivos]) => archivos.length > 1);
if (duplicadas.length) {
  fallo(
    "Hay declaraciones globales repetidas",
    duplicadas.map(([nombre, archivos]) => `${nombre} en ${archivos.join(" y ")}`).join("; "),
  );
} else {
  ok(`${declaraciones.size} declaraciones globales, ninguna repetida`);
}

/* ------------------------------------------------------------------ */
/* 3. Registro de acciones: frontend contra backend                    */
/* ------------------------------------------------------------------ */

seccion("Acciones");

const harness = loadBackend();
const accionesBackend = new Set(harness.read("Object.keys(DOC2_API)"));
const accionesHeredadas = new Set(harness.read("docActionList_()"));
const escriturasBackend = new Set(
  harness.read("Object.keys(DOC2_API).filter(function (k) { return DOC2_API[k].escribe === true; })"),
);

const clienteTexto = leer(join(DIR_FEATURE, "api", "client.ts"));
const accionesTexto = leer(join(DIR_FEATURE, "api", "acciones.ts"));

/** Acciones que el cliente nombra, en cualquiera de los dos archivos. */
const accionesUsadas = new Set();
for (const texto of [clienteTexto, accionesTexto]) {
  for (const match of texto.matchAll(/"(documentacion\.[a-zA-Z.]+)"/g)) accionesUsadas.add(match[1]);
}

const inexistentes = [...accionesUsadas].filter((accion) => !accionesBackend.has(accion));
if (inexistentes.length) {
  fallo(
    "El frontend llama a acciones que el backend no atiende",
    `${inexistentes.join(", ")}. Añádelas al registro DOC2_API de 21_Api.gs o corrige el nombre en el cliente.`,
  );
} else {
  ok(`${accionesUsadas.size} acciones del cliente existen en el backend`);
}

const sinUsar = [...accionesBackend].filter((accion) => !accionesUsadas.has(accion));
if (sinUsar.length) {
  aviso(
    "Acciones del backend que el frontend no llama",
    `${sinUsar.join(", ")}. No es un error —pueden usarse desde el menú del libro o desde un proceso—, pero conviene revisar que no sean código muerto.`,
  );
} else {
  ok("todas las acciones del backend tienen un consumidor en el frontend");
}

/** Las escrituras deben coincidir: si no, el cliente no manda solicitudId. */
const escriturasCliente = new Set();
const bloqueEscrituras = clienteTexto.match(/const ESCRITURAS = new Set\(\[([\s\S]*?)\]\);/);
if (bloqueEscrituras) {
  for (const match of bloqueEscrituras[1].matchAll(/"(documentacion\.[a-zA-Z.]+)"/g)) escriturasCliente.add(match[1]);
}

const escriturasFaltantes = [...escriturasBackend].filter((a) => !escriturasCliente.has(a));
const escriturasSobrantes = [...escriturasCliente].filter((a) => !escriturasBackend.has(a));
if (escriturasFaltantes.length || escriturasSobrantes.length) {
  fallo(
    "La lista de escrituras del cliente no coincide con la del backend",
    [
      escriturasFaltantes.length ? `faltan en el cliente: ${escriturasFaltantes.join(", ")}` : "",
      escriturasSobrantes.length ? `no son escrituras en el backend: ${escriturasSobrantes.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ") +
      ". Sin esa marca el cliente no manda identificador de solicitud y un reintento puede duplicar la operación.",
  );
} else {
  ok(`${escriturasBackend.size} escrituras declaradas igual en las dos partes`);
}

/* ------------------------------------------------------------------ */
/* 4. Compatibilidad con el contrato heredado                          */
/* ------------------------------------------------------------------ */

seccion("Compatibilidad");

const apiHeredada = leer(join(DIR_LIB, "docApi.ts"));
const accionesHeredadasUsadas = new Set();
for (const match of apiHeredada.matchAll(/llamarDoc<[^>]*>\(\s*"([a-z.\-]+)"|llamarDoc\(\s*"([a-z.\-]+)"/g)) {
  const accion = match[1] ?? match[2];
  if (accion) accionesHeredadasUsadas.add(accion);
}
const heredadasRotas = [...accionesHeredadasUsadas].filter((a) => !accionesHeredadas.has(a));
if (heredadasRotas.length) {
  fallo(
    "La vista local llama a acciones heredadas que ya no existen",
    `${heredadasRotas.join(", ")}. El contrato antiguo tiene que seguir en pie: revísalo en 08_Router.gs.`,
  );
} else {
  ok(`${accionesHeredadasUsadas.size} acciones heredadas siguen atendidas`);
}

const hojasNormalizadas = harness.read("DOC2_SHEET_ORDER");
if (hojasNormalizadas.length !== 19) {
  fallo("El modelo normalizado no declara las 19 hojas esperadas", `Declara ${hojasNormalizadas.length}.`);
} else {
  ok("19 hojas normalizadas declaradas, más la hoja Auxiliar");
}

const columnasAuxiliar = harness.read("DOC2_AUXILIAR_COLUMNS");
if (!columnasAuxiliar.includes("agencia_bdp") || !columnasAuxiliar.includes("gerencia_bdp")) {
  fallo("La hoja Auxiliar no declara sus catálogos", `Declara ${columnasAuxiliar.join(", ")}.`);
} else {
  ok("la hoja Auxiliar declara agencia_bdp y gerencia_bdp");
}

/* ------------------------------------------------------------------ */
/* 5. Catálogo único                                                   */
/* ------------------------------------------------------------------ */

seccion("Catálogo");

const semilla = harness.read("DOC2_CATALOGO_SEMILLA");
const generales = semilla.filter((d) => d.seccion === "generales");
if (generales.length !== 18) {
  fallo("Los documentos generales no son 18", `Hay ${generales.length}.`);
} else {
  ok("18 documentos generales, en el orden funcional del proceso");
}
if (semilla.length !== 31) {
  fallo("El catálogo no tiene 31 documentos", `Tiene ${semilla.length}.`);
} else {
  ok("31 documentos en el catálogo canónico");
}

const heredado = harness.read("DOC_CATALOGO_SEMILLA");
const codigosHeredados = new Set(heredado.map((d) => d.id));
const codigosNuevos = new Set(semilla.map((d) => d.codigo));
const desalineados = [...codigosHeredados].filter((c) => !codigosNuevos.has(c));
if (desalineados.length) {
  fallo(
    "Hay documentos del catálogo heredado que el nuevo no incluye",
    `${desalineados.join(", ")}. Los expedientes guardados los referencian por ese código.`,
  );
} else {
  ok("los códigos del catálogo heredado se conservan uno a uno");
}

const conProrroga = semilla.filter((d) => d.prorroga === true).map((d) => d.codigo);
if (!conProrroga.includes("cert-trabajo") || !conProrroga.includes("titulo-legalizado")) {
  fallo("Las dos prórrogas del proceso no están habilitadas", `Habilitadas: ${conProrroga.join(", ")}.`);
} else {
  ok("certificados de trabajo y título académico siguen admitiendo prórroga");
}

/* ------------------------------------------------------------------ */
/* 6. Vocabulario compartido                                           */
/* ------------------------------------------------------------------ */

seccion("Vocabulario");

const vocabulario = leer(join(DIR_FEATURE, "domain", "vocabulario.ts"));
const estadosBackend = harness.read("Object.keys(DOC2_ESTADO_EXPEDIENTE)");
const faltanEstados = estadosBackend.filter((estado) => !vocabulario.includes(`"${estado}"`));
if (faltanEstados.length) {
  fallo(
    "El vocabulario del cliente no incluye todos los estados del backend",
    `${faltanEstados.join(", ")}. La prueba dominio.test.ts lo comprueba en detalle.`,
  );
} else {
  ok(`${estadosBackend.length} estados de expediente presentes en las dos partes`);
}

const motivos = harness.read("DOC2_MOTIVOS_REVISION").map((m) => m.codigo);
const faltanMotivos = motivos.filter((m) => !vocabulario.includes(`"${m}"`));
if (faltanMotivos.length) fallo("Faltan motivos de revisión en el cliente", faltanMotivos.join(", "));
else ok(`${motivos.length} motivos de revisión compartidos`);

/* ------------------------------------------------------------------ */
/* 7. Higiene                                                          */
/* ------------------------------------------------------------------ */

seccion("Higiene");

const fuentes = [
  ...readdirSync(DIR_GS).filter((f) => f.endsWith(".gs")).map((f) => ({ ruta: join(DIR_GS, f), nombre: `apps-script/${f}` })),
];
function recorrer(dir, prefijo) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) recorrer(join(dir, entrada.name), `${prefijo}/${entrada.name}`);
    else if (/\.(ts|tsx)$/.test(entrada.name)) fuentes.push({ ruta: join(dir, entrada.name), nombre: `${prefijo}/${entrada.name}` });
  }
}
recorrer(DIR_FEATURE, "features/documentacion");

const conPendientes = [];
for (const fuente of fuentes) {
  const texto = leer(fuente.ruta);
  // La marca se busca con su forma de anotación (`TODO:`, `// TODO`, `FIXME`),
  // no como palabra suelta: en español «TODO» aparece en frases normales y un
  // verificador que se queja de una prosa correcta se acaba desactivando.
  if (/(?:^|[/*#]\s*)(TODO|FIXME|HACK|XXX)\b\s*[:(]?/m.test(texto)) conPendientes.push(fuente.nombre);
}
if (conPendientes.length) {
  fallo("Hay marcas de trabajo pendiente en el código", conPendientes.join(", "));
} else {
  ok(`${fuentes.length} archivos del módulo sin marcas TODO/FIXME`);
}

const conConsole = [];
for (const fuente of fuentes) {
  if (!fuente.nombre.startsWith("features/")) continue;
  const texto = leer(fuente.ruta);
  if (/console\.(log|debug)\(/.test(texto)) conConsole.push(fuente.nombre);
}
if (conConsole.length) {
  aviso("Quedan trazas de consola en el frontend", conConsole.join(", "));
} else {
  ok("sin trazas de depuración en el frontend del módulo");
}

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

console.log("");
if (avisos.length) {
  for (const item of avisos) {
    console.log(`  ${ambar("!")} ${negrita(item.titulo)}`);
    console.log(`    ${gris(item.detalle)}`);
  }
  console.log("");
}

if (errores.length) {
  for (const item of errores) {
    console.log(`  ${rojo("\u2717")} ${negrita(item.titulo)}`);
    console.log(`    ${gris(item.detalle)}`);
  }
  console.log(`\n${rojo(`${errores.length} problema(s) que corregir.`)} ${comprobaciones} comprobación(es) superada(s).\n`);
  process.exit(1);
}

console.log(`${verde(`${comprobaciones} comprobaciones superadas.`)}${avisos.length ? ` ${ambar(`${avisos.length} aviso(s).`)}` : ""}\n`);
