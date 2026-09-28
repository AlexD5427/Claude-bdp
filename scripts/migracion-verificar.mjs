#!/usr/bin/env node
/**
 * Verificador de la migración a otra cuenta de Google.
 *
 *     npm run migracion:verificar
 *     npm run migracion:verificar -- --talento=https://…/exec --documentacion=https://…/exec
 *     npm run migracion:verificar -- --evaluaciones=https://…/exec --llave=LA_LLAVE
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Este sistema no tiene un backend propio: su base de datos son libros de Google
 * Sheets y su servidor son proyectos de Apps Script publicados como aplicación
 * web. Cambiar de cuenta de Google es, por tanto, mover archivos y volver a
 * publicar. Lo difícil no es hacerlo: es **saber si salió bien**.
 *
 * Y sale mal de formas silenciosas. Las tres que se ven en la práctica:
 *
 *   1. el despliegue nuevo responde `200` con una **página HTML** de
 *      autorización en lugar de datos —Apps Script no devuelve 401— y el
 *      sistema entiende «todo bien» mientras no escribe ni lee una celda;
 *   2. se pegan los `.gs` y no se publica una **versión nueva** de la
 *      implementación: el enlace `/exec` sigue sirviendo el código anterior, así
 *      que todo responde y falla justo lo que se añadió;
 *   3. el script apunta al libro **antiguo** porque la propiedad
 *      `DOC_SPREADSHEET_ID` / `EV_SPREADSHEET_ID` se copió tal cual. Todo
 *      funciona… sobre los datos de la cuenta que se quería abandonar.
 *
 * Las tres son invisibles desde la pantalla y las tres las detecta esto.
 *
 * ── Qué hace y qué no hace ──────────────────────────────────────────────────
 * **Solo lee.** No crea un expediente de prueba, no escribe una fila, no publica
 * nada. Las tres acciones que usa (`GET` del talento, `documentacion.estado` y
 * `ping` de Evaluaciones) están declaradas de lectura en sus respectivos
 * backends, así que se puede ejecutar contra el libro de producción sin miedo.
 *
 * Código de salida 0 si todo está en orden, 1 si hay algo que corregir.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(raiz, "src", "config", "google.ts");

const COLOR = process.stdout.isTTY;
const rojo = (t) => (COLOR ? `\u001b[31m${t}\u001b[0m` : t);
const verde = (t) => (COLOR ? `\u001b[32m${t}\u001b[0m` : t);
const ambar = (t) => (COLOR ? `\u001b[33m${t}\u001b[0m` : t);
const gris = (t) => (COLOR ? `\u001b[90m${t}\u001b[0m` : t);
const negrita = (t) => (COLOR ? `\u001b[1m${t}\u001b[0m` : t);

const errores = [];
const avisos = [];
let superadas = 0;

const ok = (texto, detalle) => {
  superadas += 1;
  console.log(`  ${verde("✓")} ${texto}`);
  if (detalle) console.log(`     ${gris(detalle)}`);
};
const fallo = (titulo, queHacer) => {
  errores.push({ titulo, queHacer });
  console.log(`  ${rojo("✗")} ${titulo}`);
  console.log(`     ${gris(queHacer)}`);
};
const aviso = (titulo, queHacer) => {
  avisos.push({ titulo, queHacer });
  console.log(`  ${ambar("!")} ${titulo}`);
  if (queHacer) console.log(`     ${gris(queHacer)}`);
};
const seccion = (titulo) => console.log(`\n${negrita(titulo)}`);

function leer(ruta) {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Argumentos                                                          */
/* ------------------------------------------------------------------ */

function argumentos() {
  const out = {};
  for (const bruto of process.argv.slice(2)) {
    const m = /^--([a-z]+)=(.*)$/.exec(bruto);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const args = argumentos();

/**
 * Direcciones escritas en el repositorio.
 *
 * Se leen del archivo en lugar de importarlo: `src/config/google.ts` es un
 * módulo de TypeScript que usa `import.meta.env`, y compilarlo solo para leer
 * tres cadenas obligaría a tener el proyecto construido. Leer el texto siempre
 * funciona, incluso en un clon recién descargado.
 */
function delRepositorio() {
  const texto = leer(CONFIG);
  const exec = (variable) => {
    const re = new RegExp(`resolverExec\\(\\s*"${variable}"\\s*,\\s*"([^"]*)"`, "m");
    return (re.exec(texto)?.[1] ?? "").trim();
  };
  return {
    talento: exec("VITE_SCRIPT_URL"),
    documentacion: exec("VITE_DOCUMENTACION_URL"),
  };
}

const repo = delRepositorio();

const destinos = {
  talento: args.talento || process.env.MIGRACION_TALENTO || repo.talento,
  documentacion: args.documentacion || process.env.MIGRACION_DOCUMENTACION || repo.documentacion,
  evaluaciones: args.evaluaciones || process.env.MIGRACION_EVALUACIONES || "",
  llave: args.llave || process.env.MIGRACION_LLAVE || "",
};

/* ------------------------------------------------------------------ */
/* 1 · Comprobaciones estáticas (sin red)                              */
/* ------------------------------------------------------------------ */

/**
 * Identificadores de recursos reales de Google.
 *
 * Son las cadenas que solo pueden venir de una cuenta concreta: el despliegue de
 * una aplicación web (`AKfycb…`), un formulario (`1FAIpQLS…`) o un sitio
 * (`sites.google.com/view/…`). No se buscan los dominios sueltos porque
 * `script.google.com` aparece legítimamente en validaciones y mensajes.
 */
const PATRONES_RECURSO = [
  { nombre: "despliegue de aplicación web", re: /AKfycb[A-Za-z0-9_-]{20,}/ },
  { nombre: "formulario de Google", re: /1FAIpQLS[A-Za-z0-9_-]{20,}/ },
  { nombre: "sitio de Google", re: /sites\.google\.com\/view\//},
];

function archivosDeFuente(dir, acc = []) {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === "__tests__") continue;
      archivosDeFuente(ruta, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entrada)) continue;
    if (/\.test\.(ts|tsx)$/.test(entrada)) continue;
    acc.push(ruta);
  }
  return acc;
}

function comprobarUnSoloSitio() {
  seccion("Un solo sitio con las direcciones");
  const sospechosos = [];
  for (const ruta of archivosDeFuente(join(raiz, "src"))) {
    if (ruta === CONFIG) continue;
    const texto = leer(ruta);
    for (const patron of PATRONES_RECURSO) {
      if (patron.re.test(texto)) {
        sospechosos.push(`${relative(raiz, ruta)} · ${patron.nombre}`);
      }
    }
  }
  if (sospechosos.length) {
    fallo(
      `${sospechosos.length} archivo(s) del frontend traen una dirección de Google propia`,
      `Muévela a src/config/google.ts: ${sospechosos.join(", ")}. Si se queda repartida, una migración de cuenta deja piezas apuntando a la cuenta anterior sin que nada lo diga.`,
    );
  } else {
    ok("ningún archivo del frontend escribe una dirección de Google por su cuenta");
  }

  // El panel de Herramientas empareja apariencia con el inventario por clave:
  // una clave que no exista dibuja el aspecto neutro, y eso conviene saberlo.
  const config = leer(CONFIG);
  const panel = leer(join(raiz, "src", "components", "tools", "HerramientasPanel.tsx"));
  const claves = [
    ...(/export const UTILIDADES: Utilidad\[\] = \[([\s\S]*?)\n\];/.exec(config)?.[1] ?? "").matchAll(
      /clave:\s*"([a-z-]+)"/g,
    ),
  ].map((m) => m[1]);
  const conApariencia = [...panel.matchAll(/^\s{2}"?([a-z-]+)"?:\s*\{$/gm)].map((m) => m[1]);
  const sinApariencia = claves.filter((c) => !conApariencia.includes(c));
  if (claves.length === 0) {
    aviso("no se pudo leer la lista de utilidades del inventario", "Revisa que src/config/google.ts siga declarando UTILIDADES con su `clave`.");
  } else if (sinApariencia.length) {
    aviso(
      `${sinApariencia.length} utilidad(es) sin icono propio en el panel: ${sinApariencia.join(", ")}`,
      "Abren igual, con el aspecto neutro. Añade su entrada en APARIENCIA de HerramientasPanel.tsx si quieres el icono.",
    );
  } else {
    ok(`las ${claves.length} utilidades del inventario tienen su apariencia declarada`);
  }

  // Las variables que el inventario lee tienen que estar documentadas.
  const ejemplo = leer(join(raiz, ".env.example"));
  const variables = [...config.matchAll(/"(VITE_[A-Z_]+)"/g)].map((m) => m[1]);
  const faltan = [...new Set(variables)].filter((v) => !ejemplo.includes(v));
  if (faltan.length) {
    fallo(
      `${faltan.length} variable(s) sin documentar en .env.example: ${faltan.join(", ")}`,
      "Quien despliegue en la cuenta nueva solo se enterará de una variable si está en .env.example.",
    );
  } else {
    ok(`las ${new Set(variables).size} variables del inventario están en .env.example`);
  }
}

/* ------------------------------------------------------------------ */
/* 2 · Comprobaciones contra los backends (solo lectura)               */
/* ------------------------------------------------------------------ */

const TIEMPO_MS = 30000;

/**
 * Identificación del cliente. No es cosmética.
 *
 * Medido contra el despliegue real: una petición `GET` con
 * `Accept: application/json` y **sin** `User-Agent` recibe de Google un `404`
 * con una página HTML, mientras que la misma petición con cualquier
 * `User-Agent` recibe el `200` con el JSON. El navegador siempre manda uno, así
 * que el fallo solo aparece al llamar desde Node… y se lee exactamente igual que
 * «el despliegue no existe», que es el diagnóstico equivocado.
 */
const CLIENTE = "bdp-migracion-verificar/1.0";

function esHtml(contentType, cuerpo) {
  if ((contentType || "").includes("text/html")) return true;
  const cabeza = cuerpo.trimStart().slice(0, 200).toLowerCase();
  return cabeza.startsWith("<!doctype") || cabeza.startsWith("<html");
}

async function pedir(url, cuerpo) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MS);
  try {
    const respuesta = await fetch(url, {
      method: cuerpo ? "POST" : "GET",
      // Google contesta 302 hacia googleusercontent: sin seguirlo, un 404.
      redirect: "follow",
      headers: cuerpo
        ? { "Content-Type": "text/plain;charset=utf-8", "User-Agent": CLIENTE }
        : { Accept: "application/json", "User-Agent": CLIENTE },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });
    const texto = await respuesta.text();
    return {
      estado: respuesta.status,
      tipo: respuesta.headers.get("content-type") ?? "",
      texto,
    };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Diagnóstico de una respuesta HTML, que es el fallo más traicionero de Apps
 * Script: llega con código de éxito y tiene tres causas distintas.
 */
function diagnosticarHtml(estado) {
  if (estado === 200) {
    return "Es la pantalla de autorización de Apps Script, que llega con código de éxito. En la cuenta nueva: Implementar → Gestionar implementaciones → editar → «Ejecutar como: Yo» y «Quién tiene acceso: Cualquier usuario», y publicar una versión NUEVA.";
  }
  if (estado === 404) {
    return "No hay ningún despliegue publicado en esa dirección. Copia otra vez la URL desde Implementar → Gestionar implementaciones: tiene que terminar en /exec, no en /dev, y ser la del despliegue y no la del editor.";
  }
  if (estado === 429 || estado === 503) {
    return "Google está limitando las peticiones a este despliegue. Espera un minuto y vuelve a ejecutar la verificación.";
  }
  return `Google devolvió una página en lugar de datos (HTTP ${estado}). Abre la dirección en el navegador para ver qué dice.`;
}

/** Traduce un fallo de transporte al diagnóstico que corresponde. */
function diagnosticarTransporte(error, url) {
  if (error?.name === "AbortError") {
    return `No contestó en ${TIEMPO_MS / 1000} s. Abre ${url} en el navegador: si pide iniciar sesión, el despliegue no está publicado con acceso «Cualquier usuario».`;
  }
  return `No se pudo contactar con ${url} (${error?.message ?? error}). Comprueba la dirección y que la red no esté bloqueando script.google.com.`;
}

async function comprobarTalento(url) {
  seccion("Base de datos del talento");
  if (!url) {
    aviso("sin dirección que comprobar", "Pásala con --talento=https://…/exec o escríbela en src/config/google.ts.");
    return;
  }
  console.log(`  ${gris(url)}`);
  let r;
  try {
    r = await pedir(url);
  } catch (error) {
    fallo("no respondió", diagnosticarTransporte(error, url));
    return;
  }
  if (esHtml(r.tipo, r.texto)) {
    fallo(
      `respondió HTTP ${r.estado} con una página HTML en lugar de datos`,
      diagnosticarHtml(r.estado),
    );
    return;
  }
  if (r.estado !== 200) {
    fallo(`respondió HTTP ${r.estado}`, `Cuerpo: ${r.texto.slice(0, 180)}`);
    return;
  }
  let datos;
  try {
    datos = JSON.parse(r.texto);
  } catch {
    fallo("la respuesta no es JSON", `Empieza por: ${r.texto.slice(0, 120)}`);
    return;
  }
  ok(`responde JSON (HTTP ${r.estado})`);

  const esperadas = ["candidatos", "competencias", "arquetipos_disc", "auxiliares"];
  const ausentes = esperadas.filter((k) => datos[k] === undefined);
  if (ausentes.length) {
    fallo(
      `al payload le faltan claves: ${ausentes.join(", ")}`,
      "El `doGet` de la cuenta nueva no está devolviendo el libro completo. Comprueba que el proyecto de Apps Script copiado es el mismo y que su propiedad de libro apunta al libro nuevo.",
    );
  } else {
    ok("el payload trae las cuatro claves que el frontend necesita");
  }

  const candidatos = Array.isArray(datos.candidatos) ? datos.candidatos : [];
  const competencias = Array.isArray(datos.competencias) ? datos.competencias : [];
  const disc = Array.isArray(datos.arquetipos_disc) ? datos.arquetipos_disc : [];
  console.log(
    `     ${gris(`${candidatos.length} postulante(s) · ${competencias.length} competencia(s) · ${disc.length} arquetipo(s) DISC`)}`,
  );
  if (candidatos.length === 0) {
    aviso(
      "el libro no devuelve ningún postulante",
      "Si la cuenta antigua tenía filas, el script está leyendo un libro vacío: casi siempre es una copia recién creada o la propiedad del libro apuntando al sitio equivocado.",
    );
  } else {
    ok(`hay ${candidatos.length} postulante(s) en el libro`);
  }

  const sinIdentificador = candidatos.filter((c) => !String(c?.identificador ?? "").trim()).length;
  if (sinIdentificador) {
    aviso(
      `${sinIdentificador} fila(s) sin identificador`,
      "El sistema las muestra, pero no se pueden comparar ni editar con seguridad. Conviene revisarlas en la hoja después de migrar.",
    );
  }
}

async function comprobarDocumentacion(url) {
  seccion("Backend de Documentación");
  if (!url) {
    aviso(
      "sin dirección que comprobar",
      "Pásala con --documentacion=https://…/exec. Si se deja vacía en el repositorio, cada equipo tiene que pegarla a mano en Documentación → Configuración → Conexión.",
    );
    return;
  }
  console.log(`  ${gris(url)}`);
  let r;
  try {
    r = await pedir(url, { accion: "documentacion.estado", solicitudId: "", payload: {} });
  } catch (error) {
    fallo("no respondió", diagnosticarTransporte(error, url));
    return;
  }
  if (esHtml(r.tipo, r.texto)) {
    fallo(`respondió HTTP ${r.estado} con una página HTML`, diagnosticarHtml(r.estado));
    return;
  }
  let sobre;
  try {
    sobre = JSON.parse(r.texto);
  } catch {
    fallo("la respuesta no es JSON", `Empieza por: ${r.texto.slice(0, 120)}`);
    return;
  }
  if (!sobre?.ok) {
    // Un backend que no es el de Documentación contesta JSON sin sobre: el del
    // talento devuelve `{status:"success"}` y una hoja suelta devuelve su propio
    // formato. Distinguirlo del rechazo importa porque el remedio es otro.
    if (sobre && typeof sobre === "object" && sobre.ok === undefined && sobre.error === undefined) {
      fallo(
        "contestó JSON, pero no con el sobre de Documentación",
        `Esta dirección responde otra cosa (claves: ${Object.keys(sobre).slice(0, 6).join(", ") || "ninguna"}). Casi siempre es la URL del backend del talento: son dos proyectos de Apps Script distintos, cada uno con su libro y su propio despliegue.`,
      );
      return;
    }
    const mensaje = sobre?.error?.mensaje ?? sobre?.error?.message ?? "sin mensaje";
    fallo(
      `rechazó la consulta de estado: ${mensaje}`,
      sobre?.error?.pista ??
        "Si dice que la acción no existe, publica una versión nueva de la implementación: el enlace /exec sigue sirviendo el código anterior.",
    );
    return;
  }
  const d = sobre.datos ?? sobre.data ?? {};
  ok(`responde y se identifica (${d.arquitectura ?? "?"} · versión ${d.version ?? "?"})`);
  console.log(
    `     ${gris(`libro «${d.libro ?? "?"}» · esquema ${d.esquema ?? "?"} · catálogo ${d.catalogoVersion ?? "?"} · rol ${d.rol ?? "?"}`)}`,
  );
  if (d.libroUrl) console.log(`     ${gris(`libro: ${d.libroUrl}`)}`);

  if (d.instalado === false) {
    fallo(
      "el libro responde pero el modelo no está instalado",
      "En el libro nuevo: menú Documentación → «Instalar o actualizar modelo», y después «Simular migración» antes de migrar.",
    );
  } else {
    ok("el modelo normalizado está instalado");
  }

  // Lo que este frontend espera del backend, leído de su propia declaración.
  const compat = leer(join(raiz, "src", "features", "documentacion", "domain", "compatibilidad.ts"));
  const esquemaEsperado = Number(/ESQUEMA_ESPERADO\s*=\s*(\d+)/.exec(compat)?.[1] ?? 0);
  const catalogoEsperado = Number(/CATALOGO_ESPERADO\s*=\s*(\d+)/.exec(compat)?.[1] ?? 0);
  const requeridas = [...(/ACCIONES_REQUERIDAS\s*=\s*\[([\s\S]*?)\]/.exec(compat)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
    (m) => m[1],
  );

  if (esquemaEsperado && Number(d.esquema ?? 0) < esquemaEsperado) {
    fallo(
      `el backend declara esquema ${d.esquema} y este frontend necesita ${esquemaEsperado}`,
      "Se pegaron los .gs pero no se publicó una versión NUEVA de la implementación, o falta correr la migración. El enlace /exec sigue sirviendo el código anterior.",
    );
  } else if (esquemaEsperado) {
    ok(`el esquema del backend (${d.esquema}) alcanza el que el frontend espera (${esquemaEsperado})`);
  }

  if (catalogoEsperado && Number(d.catalogoVersion ?? 0) < catalogoEsperado) {
    aviso(
      `catálogo ${d.catalogoVersion ?? "?"} frente a ${catalogoEsperado} esperado`,
      "Falta la migración del catálogo. El módulo funciona, pero los requisitos nuevos no aparecen.",
    );
  }

  if (Array.isArray(d.acciones) && d.acciones.length) {
    const ausentes = requeridas.filter((a) => !d.acciones.includes(a));
    if (ausentes.length) {
      fallo(
        `el backend no atiende ${ausentes.length} acción(es) que el frontend usa: ${ausentes.join(", ")}`,
        "Es el caso clásico: los .gs están pegados y la implementación no se volvió a publicar. Implementar → Gestionar implementaciones → editar → versión «Nueva».",
      );
    } else {
      ok(`atiende las ${d.acciones.length} acciones que declara, incluidas las ${requeridas.length} que el frontend exige`);
    }
  } else {
    aviso(
      "el backend no declara su lista de acciones",
      "Es un backend anterior a esa mejora. Funciona, pero no se puede comprobar desde aquí si le falta alguna acción.",
    );
  }
}

async function comprobarEvaluaciones(url, llave) {
  seccion("Backend de Evaluaciones");
  if (!url) {
    aviso(
      "sin dirección que comprobar",
      "Pásala con --evaluaciones=https://…/exec. La conexión de trabajo se guarda por navegador en Evaluaciones → Conexión, así que no está en el repositorio.",
    );
    return;
  }
  console.log(`  ${gris(url)}`);
  let r;
  try {
    r = await pedir(url, { accion: "ping", solicitudId: "", payload: {}, llaveAdmin: llave || undefined });
  } catch (error) {
    fallo("no respondió", diagnosticarTransporte(error, url));
    return;
  }
  if (esHtml(r.tipo, r.texto)) {
    fallo(
      `respondió HTTP ${r.estado} con una página HTML`,
      `${diagnosticarHtml(r.estado)} Si este despliegue no admite acceso anónimo, el postulante recibe la pantalla de inicio de sesión de Google en lugar de la evaluación.`,
    );
    return;
  }
  let sobre;
  try {
    sobre = JSON.parse(r.texto);
  } catch {
    fallo("la respuesta no es JSON", `Empieza por: ${r.texto.slice(0, 120)}`);
    return;
  }
  if (!sobre?.ok) {
    if (sobre && typeof sobre === "object" && sobre.ok === undefined && sobre.error === undefined) {
      fallo(
        "contestó JSON, pero no con el sobre de Evaluaciones",
        `Esta dirección responde otra cosa (claves: ${Object.keys(sobre).slice(0, 6).join(", ") || "ninguna"}). Evaluaciones es un tercer proyecto de Apps Script, con su propio libro: comprueba que no estás pasando la URL del talento o la de Documentación.`,
      );
      return;
    }
    fallo(
      `rechazó el ping: ${sobre?.error?.mensaje ?? sobre?.error?.message ?? "sin mensaje"}`,
      sobre?.error?.pista ?? "Comprueba que la URL es la del proyecto de Evaluaciones y no la de otro backend.",
    );
    return;
  }
  const d = sobre.datos ?? {};
  ok(`responde y se identifica (${d.servicio ?? "?"} · versión ${d.version ?? "?"})`);
  console.log(
    `     ${gris(`esquema ${d.esquema ?? "?"} · ${d.tiposSoportados ?? "?"} tipos de pregunta · libro «${d.libro?.nombre ?? "?"}»`)}`,
  );
  if (d.libro?.id) console.log(`     ${gris(`id del libro: ${d.libro.id}`)}`);

  if (d.libro === null) {
    fallo(
      `no pudo abrir su libro: ${d.problemaLibro ?? "sin detalle"}`,
      "En la cuenta nueva, propiedad del script EV_SPREADSHEET_ID con el id del libro nuevo (o crea el proyecto desde el propio libro).",
    );
  } else {
    ok("abre su libro de cálculo");
  }

  if (d.instalado === false) {
    fallo(
      "el libro responde pero la estructura no está instalada",
      "Menú ⚙️ Evaluaciones → «Instalar o reparar estructura» en el libro nuevo.",
    );
  } else {
    ok("la estructura está instalada");
    if (d.conteos) {
      console.log(
        `     ${gris(`${d.conteos.evaluaciones ?? 0} evaluación(es) · ${d.conteos.versiones ?? 0} versión(es) publicadas · ${d.conteos.intentos ?? 0} intento(s)`)}`,
      );
    }
  }

  if (d.autorizacion && d.autorizacion.modo === "abierto") {
    aviso(
      "el backend opera en modo abierto (sin llave de administración)",
      "Genera una con «⚙️ Evaluaciones → Generar llave de administración» y pégala en Evaluaciones → Conexión. Sin llave, cualquiera con la URL puede administrar evaluaciones.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Informe                                                            */
/* ------------------------------------------------------------------ */

console.log(negrita("\nVerificación de la migración a otra cuenta de Google"));
console.log(gris("Solo lectura: no escribe ninguna fila ni publica nada.\n"));

comprobarUnSoloSitio();
await comprobarTalento(destinos.talento);
await comprobarDocumentacion(destinos.documentacion);
await comprobarEvaluaciones(destinos.evaluaciones, destinos.llave);

console.log("");
if (avisos.length) {
  console.log(negrita(`${avisos.length} aviso(s):`));
  for (const a of avisos) console.log(`  ${ambar("!")} ${a.titulo}`);
}
if (errores.length) {
  console.log(negrita(`\n${errores.length} problema(s) que impiden dar la migración por buena:`));
  for (const e of errores) {
    console.log(`  ${rojo("✗")} ${e.titulo}`);
    console.log(`     ${e.queHacer}`);
  }
  console.log(
    gris("\nLa guía paso a paso está en docs/migracion/MIGRACION_CUENTA_GOOGLE.md."),
  );
  process.exit(1);
}
console.log(verde(`\n${superadas} comprobación(es) superada(s). Nada pendiente.`));
