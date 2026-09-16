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
  "ui/ExpedienteVentana.tsx",
  "ui/HojaCentral.tsx",
  "ui/DocCargando.tsx",
  "ui/ContadorHojas.tsx",
  "ui/SelectorAuxiliar.tsx",
  "state/cacheExpedientes.ts",
  "state/salida.ts",
  "state/precarga.ts",
  "state/preferencias.ts",
  "ui/SeccionTrabajo.tsx",
  "ui/SeccionReportes.tsx",
  "ui/SeccionConfiguracion.tsx",
  "ui/PestanaEstaPantalla.tsx",
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
const AUXILIAR_ESPERADAS = ["agencia_bdp", "gerencia_bdp", "cargo_bdp"];
const faltanAuxiliar = AUXILIAR_ESPERADAS.filter((c) => !columnasAuxiliar.includes(c));
if (faltanAuxiliar.length) {
  fallo(
    "La hoja Auxiliar no declara sus catálogos",
    `Faltan ${faltanAuxiliar.join(", ")}; declara ${columnasAuxiliar.join(", ")}. Sin la cabecera, el desplegable llega vacío.`,
  );
} else {
  ok(`la hoja Auxiliar declara ${AUXILIAR_ESPERADAS.join(", ")}`);
}

/* El selector del frontend tiene que aceptar las mismas columnas: si `columna`
   sigue siendo una unión de dos literales, el campo Cargo no compila. */
const selectorTexto = leer(join(DIR_FEATURE, "ui", "SelectorAuxiliar.tsx"));
const columnasSinSoporte = AUXILIAR_ESPERADAS.filter((c) => !selectorTexto.includes(c));
if (columnasSinSoporte.length) {
  fallo(
    "El selector auxiliar del frontend no conoce todas las columnas",
    `${columnasSinSoporte.join(", ")}. Revisa src/features/documentacion/ui/SelectorAuxiliar.tsx.`,
  );
} else {
  ok("el selector auxiliar del frontend conoce las tres columnas");
}

/* ------------------------------------------------------------------ */
/* 5. Catálogo único                                                   */
/* ------------------------------------------------------------------ */

seccion("Catálogo");

const semilla = harness.read("DOC2_CATALOGO_SEMILLA");
const retirados = harness.read("doc2CodigosRetirados_()");
const generales = semilla.filter((d) => d.seccion === "generales");
const generalesVigentes = generales.filter((d) => d.retirado !== true);

/* Los 20 generales de la lista que entregó el área, en su orden y con su
   redacción. La comprobación es por CÓDIGO: renombrar un código rompería los
   expedientes guardados, así que lo que se verifica es que la lista vigente sea
   exactamente esta y en este orden.

   Los cuatro últimos son los del legajo administrativo (catálogo v4) y van AL
   FINAL a propósito: el `orden` sale de la posición en la semilla, así que
   ponerlos al final es lo que hace que aparezcan después de los dieciséis
   originales sin renumerar nada. */
const GENERALES_VIGENTES = [
  "foto-4x4",
  "antecedentes-felcc",
  "rejap",
  "ci-copia",
  "factura-servicios",
  "croquis-domicilio",
  "cv",
  "cv-respaldo",
  "titulo-legalizado",
  "cuenta-bancaria",
  "extracto-gestora",
  "djj-no-vinculacion",
  "djj-bienes-rentas",
  "seguro-accidentes",
  "seguro-vida",
  "carnet-heredero",
  "manual-funciones",
  "memorandum-designacion",
  "comunicacion-interna",
  "otros-documento",
];
const ordenGenerales = generalesVigentes.map((d) => d.codigo);
if (ordenGenerales.join("|") !== GENERALES_VIGENTES.join("|")) {
  fallo(
    "Los 20 documentos generales no coinciden con la lista del área",
    `Esperado: ${GENERALES_VIGENTES.join(", ")}. Encontrado: ${ordenGenerales.join(", ")}.`,
  );
} else {
  ok("20 documentos generales vigentes, en el orden de la lista del área");
}

const RETIRADOS_ESPERADOS = ["cert-trabajo", "rc-iva"];
if (RETIRADOS_ESPERADOS.some((c) => !retirados.includes(c)) || retirados.length !== RETIRADOS_ESPERADOS.length) {
  fallo(
    "Los generales retirados no son los dos esperados",
    `Esperado ${RETIRADOS_ESPERADOS.join(", ")}; encontrado ${retirados.join(", ") || "ninguno"}. ` +
      "Retirar es marcar inactivo, nunca borrar la fila: los expedientes antiguos los referencian.",
  );
} else {
  ok("cert-trabajo y rc-iva están retirados, no borrados");
}

if (semilla.length !== 43) {
  fallo("El catálogo no tiene 43 documentos", `Tiene ${semilla.length}.`);
} else {
  ok("43 documentos en el catálogo canónico (41 vigentes + 2 retirados)");
}

/* Recuentos por rama. Es la comprobación que impide que un cambio de
   aplicabilidad pase inadvertido: el asistente, el visor y los reportes leen
   todos de aquí, así que si esto se mueve se mueve el módulo entero. */
const RAMAS_ESPERADAS = [
  ["GENERAL", "NINGUNA", 20],
  ["ADMINISTRATIVO", "NINGUNA", 20],
  ["COMERCIAL", "COMERCIAL_1", 25],
  ["COMERCIAL", "COMERCIAL_2", 29],
  ["COMERCIAL", "COMERCIAL_3", 25],
  ["AUDITORIA", "NINGUNA", 21],
  ["CUMPLIMIENTO", "NINGUNA", 23],
];
const desviaciones = [];
for (const [funcionario, garantia, esperado] of RAMAS_ESPERADAS) {
  const total = harness.read(`doc2AplicablesDeSemilla_(${JSON.stringify(funcionario)}, ${JSON.stringify(garantia)}).length`);
  if (total !== esperado) desviaciones.push(`${funcionario}/${garantia}: ${total} en lugar de ${esperado}`);
}
if (desviaciones.length) {
  fallo("Los recuentos por rama no son los acordados con el área", desviaciones.join("; "));
} else {
  ok("recuentos por rama: General 20 · Administrativo 20 · T1 25 · T2 29 · T3 25 · Auditoría 21 · Cumplimiento 23");
}

/* Subsecciones: el caso del documento compartido entre Tipo 1 y Tipo 3 es la
   trampa de este catálogo y por eso se comprueba explícitamente. */
const subT1 = harness.read(
  "doc2ResolverSubseccion_(doc2SemillaPorCodigo_('garante-inmueble').subseccion, 'COMERCIAL_1')",
);
const subT3 = harness.read(
  "doc2ResolverSubseccion_(doc2SemillaPorCodigo_('garante-inmueble').subseccion, 'COMERCIAL_3')",
);
if (subT1 === subT3 || !subT1 || !subT3) {
  fallo(
    "El documento compartido entre Tipo 1 y Tipo 3 no cambia de subsección",
    `Tipo 1: "${subT1}"; Tipo 3: "${subT3}". Tienen que ser distintas: pertenece al garante en Tipo 1 y al postulante en Tipo 3.`,
  );
} else {
  ok(`garante-inmueble cambia de subsección por rama ("${subT1}" / "${subT3}")`);
}

/* Contador de hojas: exactamente los doce acordados con el área.
   `seguro-accidentes` SALIÓ de la lista (pasó a solo digital: no llega papel al
   legajo) y entraron los tres generales administrativos, el «Otros»
   personalizable y `garante-folio`, el folio real del bien inmueble, que es el
   único documento de garantía que se archiva en papel. */
const CON_CONTEO_ESPERADO = [
  "antecedentes-felcc",
  "rejap",
  "titulo-legalizado",
  "seguro-vida",
  "manual-funciones",
  "memorandum-designacion",
  "comunicacion-interna",
  "otros-documento",
  "garante-folio",
  "impedimento-auditor",
  "djj-prohibiciones-cumplimiento",
  "lgi-ft",
  "examen-uif",
];
const conConteo = harness.read("doc2ConConteoDeHojasEnSemilla_()");
const sobran = conConteo.filter((c) => !CON_CONTEO_ESPERADO.includes(c));
const faltanConteo = CON_CONTEO_ESPERADO.filter((c) => !conConteo.includes(c));
if (sobran.length || faltanConteo.length) {
  fallo(
    "El conteo de hojas no está en los documentos correctos",
    [
      faltanConteo.length ? `faltan: ${faltanConteo.join(", ")}` : "",
      sobran.length ? `sobran: ${sobran.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
} else {
  ok(`${conConteo.length} documentos con contador de hojas, y el seguro de accidentes ya no lleva`);
}

/* Coherencia de la presentación: nada puede ser ni físico ni digital. */
const sinPresentacion = semilla.filter(
  (d) => (d.presentacionFisica ?? "NO") === "NO" && (d.presentacionDigital ?? "SI") === "NO",
);
if (sinPresentacion.length) {
  fallo(
    "Hay requisitos que no se presentan de ninguna forma",
    sinPresentacion.map((d) => d.codigo).join(", ") + ". Un requisito así no se puede entregar nunca.",
  );
} else {
  ok("todo requisito declara al menos una forma de presentación");
}

/* Y el contador solo existe donde hay documento físico. */
const conteoSinFisico = semilla.filter(
  (d) => d.requiereConteoHojas === true && (d.presentacionFisica ?? "NO") === "NO",
);
if (conteoSinFisico.length) {
  fallo(
    "Hay contador de hojas en requisitos que no se presentan en físico",
    conteoSinFisico.map((d) => d.codigo).join(", ") + ". Un escaneado no tiene hojas que contar.",
  );
} else {
  ok("el contador de hojas solo aparece donde la presentación es física");
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
const PRORROGAS_ESPERADAS = ["titulo-legalizado", "examen-uif"];
const prorrogasFaltantes = PRORROGAS_ESPERADAS.filter((c) => !conProrroga.includes(c));
if (prorrogasFaltantes.length) {
  fallo(
    "Las prórrogas del proceso no están habilitadas",
    `Faltan ${prorrogasFaltantes.join(", ")}; habilitadas: ${conProrroga.join(", ")}. ` +
      "El título en legalización y los tres meses del examen de la UIF son los dos plazos reales del proceso.",
  );
} else {
  ok("título académico y examen de la UIF admiten prórroga");
}

/* ------------------------------------------------------------------ */
/* 5b. Hojas físicas y subsección más allá del expediente              */
/* ------------------------------------------------------------------ */

seccion("Hojas físicas y subsección");

/**
 * El conteo de hojas y la subsección tienen que llegar a TODO lo que sale del
 * módulo, no solo a la pantalla del expediente.
 *
 * El motivo es concreto: el área cruza el legajo digital contra el de papel, y
 * lo hace con los reportes y las exportaciones. Un conteo que solo existe dentro
 * de la aplicación obliga a volver expediente por expediente, que es justo lo
 * que el reporte venía a evitar. Y sin la subsección, un expediente con dos
 * garantes produce filas indistinguibles.
 */
const reportes = leer(join(DIR_GS, "18_Reports.gs"));
const faltanEnReportes = [];
if (!/'Subsección', 'Hojas físicas'/.test(reportes)) faltanEnReportes.push("reporte de pendientes");
if (!/'Sección', 'Subsección', 'Requisito'/.test(reportes)) faltanEnReportes.push("hoja Requisitos de la exportación");
if (!/doc2PideConteoDeHojas_/.test(reportes)) faltanEnReportes.push("resolución del conteo desde el catálogo");
if (faltanEnReportes.length) {
  fallo(
    "Los reportes del backend no llevan hojas físicas o subsección",
    `${faltanEnReportes.join("; ")}. Sin esas columnas, el cruce con el legajo de papel vuelve a ser manual.`,
  );
} else {
  ok("los reportes y la exportación completa llevan subsección y hojas físicas");
}

const informe = leer(join(DIR_FEATURE, "export", "informeMensual.ts"));
const faltanEnInforme = [];
if (!/"Subsección", "Documento"/.test(informe)) faltanEnInforme.push("hoja Detalle");
if (!/hojasSinContar/.test(informe)) faltanEnInforme.push("aviso de entregados sin contar hojas");
if (!/hojasFisicas: r\.requiereConteoHojas \? \(r\.hojasFisicas \?\? 0\) : null/.test(informe)) {
  faltanEnInforme.push("distinción entre «no lleva conteo» (null) y «cero hojas»");
}
if (faltanEnInforme.length) {
  fallo("El informe mensual no refleja las hojas físicas", faltanEnInforme.join("; "));
} else {
  ok("el informe mensual distingue «no lleva conteo» de «lleva y falta contarlo»");
}

/**
 * El modo ligero tiene que apagar las dos cosas que cuestan.
 *
 * Esta comprobación existe porque la sonda de rendimiento encontró que no lo
 * hacía: se le quitaba el desenfoque a `.glass` y se le dejaba la sombra de 30 px
 * de difusión, y la cabecera pegajosa de la tabla —diez celdas con `blur(8px)`
 * fijas sobre contenido que se desplaza, el caso más caro que hay— no estaba en
 * ninguna de las dos listas.
 */
const css = leer(join(DIR_FEATURE, "ui", "documentacion.css"));
const bloqueLigero = css.slice(css.indexOf("MODO LIGERO"));
const faltanLigero = [];
if (!/\[data-doc-ligero="si"\] \.doc-table thead th \{/.test(bloqueLigero)) faltanLigero.push("cabecera pegajosa de la tabla");
/* La sombra se aplana en un selector agrupado que termina en `.glass-heavy`,
   así que se comprueba que ese selector y la propiedad estén en el mismo bloque. */
const bloqueSombra = bloqueLigero.slice(bloqueLigero.indexOf('.doc-console .glass-heavy {'));
if (!bloqueSombra || !/^\.doc-console \.glass-heavy \{[^}]*box-shadow/.test(bloqueSombra)) {
  faltanLigero.push("sombra proyectada de .glass y .glass-heavy");
}
if (faltanLigero.length) {
  fallo(
    "El modo ligero deja fuera superficies caras",
    `${faltanLigero.join("; ")}. Con eso, el interruptor está pero no ahorra nada.`,
  );
} else {
  ok("el modo ligero apaga los desenfoques y las sombras proyectadas del armazón");
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
/* 7. Rendimiento de pintado                                           */
/* ------------------------------------------------------------------ */

/**
 * Auditoría estática de la capa visual.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Las sondas de navegador miden el coste real, pero necesitan Playwright y no
 * corren en todas las máquinas. Estas seis comprobaciones no miden nada: revisan
 * INVARIANTES que, si se rompen, garantizan que el coste va a subir. Son las
 * reglas que este módulo aprendió a base de medir, escritas de forma que un
 * cambio futuro no las pueda deshacer sin que alguien se entere.
 *
 * Es el mismo razonamiento que los recuentos del catálogo: no comprueban que el
 * módulo sea correcto, comprueban que sigue siendo el que se acordó.
 */

seccion("Rendimiento de pintado");

const DIR_UI = join(raiz, "src", "features", "documentacion", "ui");
const CSS_MODULO = readdirSync(DIR_UI)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ nombre: f, texto: leer(join(DIR_UI, f)) }));

if (!CSS_MODULO.length) fallo("No se encontró la capa CSS del módulo", DIR_UI);
else ok(`${CSS_MODULO.length} hojas de estilo del módulo presentes`);

/* 1 · Ningún fotograma clave anima una propiedad de DISEÑO.
   Animar `width`, `height` o `top` obliga al navegador a recalcular el diseño
   en cada fotograma de la animación, y a repintar todo lo que haya debajo. Con
   `transform` y `opacity` el trabajo lo hace el compositor. Es la diferencia
   entre 60 fps y 20 en un equipo sin GPU decente. */
const PROPIEDADES_DE_DISENO = [
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  "margin",
  "padding",
  "font-size",
  "line-height",
];
const keyframesCaros = [];
for (const hoja of CSS_MODULO) {
  const bloques = hoja.texto.match(/@keyframes\s+([\w-]+)\s*\{[\s\S]*?\n\}/g) ?? [];
  for (const bloque of bloques) {
    const nombre = (bloque.match(/@keyframes\s+([\w-]+)/) ?? [])[1] ?? "?";
    for (const propiedad of PROPIEDADES_DE_DISENO) {
      // Se busca la propiedad como DECLARACIÓN (`width:`), no dentro de otra
      // (`max-width`, `border-top-left-radius`).
      if (new RegExp(`(?:^|[;{\\s])${propiedad}\\s*:`, "m").test(bloque)) {
        keyframesCaros.push(`${hoja.nombre} · @keyframes ${nombre} anima ${propiedad}`);
      }
    }
  }
}
if (keyframesCaros.length) {
  fallo(
    "Hay animaciones que recalculan el diseño en cada fotograma",
    `${keyframesCaros.join("; ")}. Use transform/opacity: el compositor las resuelve sin tocar el hilo principal.`,
  );
} else {
  ok("ninguna animación CSS del módulo anima una propiedad de diseño");
}

/* 2 · Ninguna transición usa `all`.
   `transition: all` anima también las propiedades que cambien por accidente
   —incluida alguna de diseño— y deja al navegador vigilándolas todas. */
const conTransitionAll = CSS_MODULO.filter((h) => /transition:\s*all\b/.test(h.texto)).map((h) => h.nombre);
if (conTransitionAll.length) {
  fallo("Hay transiciones declaradas con `all`", `${conTransitionAll.join(", ")}. Enumere las propiedades que cambian.`);
} else {
  ok("ninguna transición del módulo usa `all`");
}

/* 3 · `content-visibility: auto` siempre con su alto estimado.
   Sin `contain-intrinsic-size`, el navegador da altura cero a lo que no se ve y
   la barra de desplazamiento salta cada vez que una fila entra en pantalla. El
   ahorro es real y la experiencia, peor que sin él. */
const cvSinTamano = [];
for (const hoja of CSS_MODULO) {
  const reglas = hoja.texto.match(/[^}]*\{[^}]*content-visibility\s*:\s*auto[^}]*\}/g) ?? [];
  for (const regla of reglas) {
    if (!/contain-intrinsic-size/.test(regla)) {
      cvSinTamano.push(`${hoja.nombre}: ${regla.split("{")[0].trim()}`);
    }
  }
}
if (cvSinTamano.length) {
  fallo("Hay `content-visibility: auto` sin alto estimado", `${cvSinTamano.join("; ")}. Añada contain-intrinsic-size.`);
} else {
  const cuantos = CSS_MODULO.reduce(
    (n, h) => n + (h.texto.match(/content-visibility\s*:\s*auto/g) ?? []).length,
    0,
  );
  ok(`${cuantos} listas con salto de diseño diferido, todas con alto estimado`);
}

/* 4 · El modo ligero apaga TODOS los desenfoques del módulo.
   Un `backdrop-filter` que se olvida en la lista es el caso que ya pasó una
   vez: la cabecera pegajosa de la tabla —diez celdas desenfocando contenido en
   movimiento, el caso más caro que existe— no estaba, y el modo ligero no
   ahorraba nada. */
const selectoresConDesenfoque = new Set();
for (const hoja of CSS_MODULO) {
  const reglas = hoja.texto.match(/[^{}]*\{[^}]*backdrop-filter[^}]*\}/g) ?? [];
  for (const regla of reglas) {
    const selector = regla.split("{")[0].trim();
    if (/data-doc-ligero/.test(selector)) continue;
    for (const parte of selector.split(",")) {
      const limpio = parte.trim();
      if (limpio) selectoresConDesenfoque.add(limpio);
    }
  }
}
const apagadosEnLigero = CSS_MODULO.map((h) => h.texto).join("\n");
const sinApagar = [...selectoresConDesenfoque].filter((selector) => {
  const clase = (selector.match(/\.[\w-]+/g) ?? []).slice(-1)[0];
  if (!clase) return false;
  return !new RegExp(`\\[data-doc-ligero="si"\\][^{]*\\${clase}`).test(apagadosEnLigero);
});
if (sinApagar.length) {
  fallo("El modo ligero no apaga todos los desenfoques", sinApagar.join(", "));
} else {
  ok(`${selectoresConDesenfoque.size || "los"} desenfoques del módulo se apagan en modo ligero`);
}

/* 5 · `will-change` solo donde hay algo que va a cambiar.
   Promover un elemento a capa propia cuesta memoria de vídeo. Declararlo «por
   si acaso» en un contenedor que aparece veinte veces es cómo un equipo modesto
   empieza a tirar fotogramas sin que nada se mueva. */
const willChangeHuerfano = [];
for (const hoja of CSS_MODULO) {
  const reglas = hoja.texto.match(/[^{}]*\{[^}]*will-change[^}]*\}/g) ?? [];
  for (const regla of reglas) {
    if (/will-change\s*:\s*auto/.test(regla)) continue;
    if (!/(transition|animation)\s*:/.test(regla)) {
      const selector = regla.split("{")[0].trim();
      /* Se admite que la transición esté en la regla base y el `will-change` en
         la misma clase: se busca la clase en todo el archivo. */
      const clase = (selector.match(/\.[\w-]+/g) ?? []).slice(-1)[0];
      if (clase && new RegExp(`\\${clase}[^{]*\\{[^}]*(transition|animation)\\s*:`).test(hoja.texto)) continue;
      willChangeHuerfano.push(`${hoja.nombre}: ${selector}`);
    }
  }
}
if (willChangeHuerfano.length) {
  fallo(
    "Hay `will-change` sin una animación que lo justifique",
    `${willChangeHuerfano.join("; ")}. Promover una capa que nunca se mueve solo gasta memoria de vídeo.`,
  );
} else {
  ok("todo `will-change` del módulo acompaña a una animación real");
}

/* 6 · Los controles táctiles no esperan el doble toque.
   `touch-action: manipulation` quita el retardo de 300 ms que el navegador móvil
   reserva para distinguir un doble toque de zoom. Sin él, cada chip de estado
   responde un tercio de segundo tarde y la interfaz «se siente lenta» sin que
   nada tarde. */
if (!/\.doc-tap\s*\{[^}]*touch-action\s*:\s*manipulation/.test(apagadosEnLigero)) {
  fallo(
    "Los controles táctiles no declaran `touch-action: manipulation`",
    "Sin él, cada toque en móvil responde 300 ms tarde.",
  );
} else {
  ok("los controles táctiles responden al primer toque (sin retardo de doble toque)");
}

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
