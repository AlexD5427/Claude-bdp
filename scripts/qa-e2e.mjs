#!/usr/bin/env node
/**
 * Arnés de QA de extremo a extremo (Comparador + Postulantes).
 *
 * -- Por qué existe ----------------------------------------------------------
 * El sistema depende de un Apps Script en producción, así que "probar" solía
 * significar abrir el navegador y confiar en la vista. Este arnés hace lo
 * contrario: levanta el build real, **suplanta el backend** con datos de hoja de
 * cálculo controlados (incluidos los casos sucios: identificadores repetidos,
 * celdas vacías, JSON roto) y recorre los dos módulos como lo haría una analista,
 * anotando cada error de consola y cada excepción no capturada.
 *
 * Uso:
 *     npm run build
 *     npm i -D playwright && npx playwright install chromium   (una sola vez)
 *     npm run qa                 # todos los escenarios
 *     npm run qa -- --only=comparador --headed
 *
 * Las capturas quedan en `docs/qa/`. Sale con código 1 si algún escenario falla
 * o si el navegador registró un error, de modo que sirve como puerta de calidad.
 */

import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { payload } from "./qa/fixture.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(raiz, "dist");
const SALIDA = join(raiz, "docs", "qa");

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7);
const headed = args.includes("--headed");

const COLOR = process.stdout.isTTY;
const rojo = (t) => (COLOR ? `\u001b[31m${t}\u001b[0m` : t);
const verde = (t) => (COLOR ? `\u001b[32m${t}\u001b[0m` : t);
const ambar = (t) => (COLOR ? `\u001b[33m${t}\u001b[0m` : t);
const gris = (t) => (COLOR ? `\u001b[90m${t}\u001b[0m` : t);
const negrita = (t) => (COLOR ? `\u001b[1m${t}\u001b[0m` : t);

/* ------------------------------------------------------------------ */
/* Servidor estático del build                                         */
/* ------------------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function servir() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let ruta = join(DIST, decodeURIComponent(url.pathname));
      if (!existsSync(ruta) || url.pathname === "/") ruta = join(DIST, "index.html");
      const cuerpo = await readFile(ruta);
      res.writeHead(200, { "Content-Type": MIME[extname(ruta)] ?? "application/octet-stream" });
      res.end(cuerpo);
    } catch {
      res.writeHead(404).end("no");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

/* ------------------------------------------------------------------ */
/* Backend suplantado                                                  */
/* ------------------------------------------------------------------ */

/**
 * Intercepta el endpoint de Apps Script. `modo` decide cómo responde al POST:
 *   · "ok"        → { status: "success" }
 *   · "duplicado" → { status: "error", message: "identificador duplicado" }
 *   · "caido"     → la petición falla (red cortada / dominio bloqueado)
 *   · "html"      → devuelve la página de error de Google (sesión expirada)
 */
async function suplantarBackend(page, { escenario = "base", modo = "ok", registro }) {
  await page.route(/script\.google(usercontent)?\.com/, async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(payload(escenario)),
      });
    }
    let cuerpo = {};
    try {
      cuerpo = JSON.parse(req.postData() ?? "{}");
    } catch {
      cuerpo = { _crudo: req.postData() };
    }
    registro?.push(cuerpo);
    if (modo === "caido") return route.abort("failed");
    if (modo === "html") {
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "<!DOCTYPE html><html><body>Se ha producido un error</body></html>",
      });
    }
    const respuesta =
      modo === "duplicado"
        ? { status: "error", message: "Ya existe un postulante con ese identificador." }
        : { status: "success", message: "ok" };
    return route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(respuesta),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Utilidades de escenario                                             */
/* ------------------------------------------------------------------ */

const fallos = [];
const avisos = [];

function comprobar(nombre, condicion, detalle = "") {
  if (condicion) {
    console.log(`  ${verde("✓")} ${nombre}`);
  } else {
    console.log(`  ${rojo("✗")} ${nombre}${detalle ? gris(` — ${detalle}`) : ""}`);
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

async function nuevaPagina(navegador, base, opciones = {}) {
  const contexto = await navegador.newContext({
    viewport: opciones.viewport ?? { width: 1440, height: 950 },
    deviceScaleFactor: 1,
    reducedMotion: opciones.reducedMotion ?? "reduce",
  });
  // Sesión ya iniciada: el login por perfil vive en una cookie.
  await contexto.addCookies([
    { name: "bdp_perfil_sesion", value: opciones.perfil ?? "administrador", url: base },
  ]);
  const page = await contexto.newPage();
  if (opciones.tema) {
    await page.addInitScript(
      (tema) => window.localStorage.setItem("bdp-theme", tema),
      opciones.tema,
    );
  }
  const errores = [];
  const ruidoEsperado = opciones.modo === "caido";
  page.on("console", (m) => {
    if (m.type() === "error") {
      // Con la red cortada a propósito el navegador anota cada petición abortada:
      // es el síntoma que buscábamos, no un error de la aplicación.
      if (ruidoEsperado && /ERR_FAILED|Failed to load resource/i.test(m.text())) return;
      errores.push(`console.error: ${m.text()}`);
    }
    else if (m.type() === "warning" && /React|key|ref|act\(/i.test(m.text()))
      avisos.push(`console.warn: ${m.text()}`);
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  await suplantarBackend(page, opciones);
  return { contexto, page, errores };
}

async function abrir(page, base, modulo) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 15000 });
  if (modulo) await irA(page, modulo);
}

async function irA(page, etiqueta) {
  await page.getByRole("button", { name: etiqueta, exact: true }).first().click();
  await page.waitForTimeout(450);
}

/** El buscador del comparador (hay otros `combobox` en la barra de filtros). */
function buscadorCandidatos(page) {
  return page.getByPlaceholder(/Buscar por nombre o identificador/);
}

/** Las sugerencias del buscador (los `<option>` de los filtros también son "option"). */
function sugerencias(page) {
  return page.locator("#candidate-listbox [role=option]");
}

/** Sólo los POST de alta/edición de postulante (la bitácora también viaja por ahí). */
function altas(registro, identificador) {
  return registro.filter(
    (r) => !r.type && r.identificador === identificador && r.action !== "update",
  );
}

let captura = 0;
/** Captura sólo un elemento (para ver la cuadrícula completa sin la página). */
async function fotoDe(page, selector, nombre) {
  await mkdir(SALIDA, { recursive: true });
  const archivo = join(SALIDA, `${String(++captura).padStart(2, "0")}-${nombre}.png`);
  await page.locator(selector).first().screenshot({ path: archivo });
  console.log(gris(`     captura → ${archivo.replace(raiz + "/", "")}`));
  return archivo;
}

async function foto(page, nombre) {
  await mkdir(SALIDA, { recursive: true });
  const archivo = join(SALIDA, `${String(++captura).padStart(2, "0")}-${nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: false });
  console.log(gris(`     captura → ${archivo.replace(raiz + "/", "")}`));
  return archivo;
}

/* ------------------------------------------------------------------ */
/* Escenarios                                                          */
/* ------------------------------------------------------------------ */

const escenarios = [];
const escenario = (nombre, fn) => escenarios.push({ nombre, fn });

escenario("comparador", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base);
  await abrir(page, base, "Comparador");
  comprobar("el comparador arranca vacío", await page.getByText("Comienza tu comparación").isVisible());
  await foto(page, "comparador-vacio");

  // Agregar tres postulantes desde el buscador.
  const buscador = buscadorCandidatos(page);
  for (const nombre of ["María", "Jorge", "Luis"]) {
    await buscador.click();
    await buscador.fill(nombre);
    await page.waitForTimeout(320);
    await sugerencias(page).first().click();
    await page.waitForTimeout(260);
  }
  const chips = await page.locator("text=/en comparación/").first().textContent();
  comprobar("agrega tres columnas", chips?.startsWith("3"), `contador = ${chips}`);

  // La cuadrícula debe traer las filas del catálogo.
  for (const fila of ["Nota CAP", "Perfil DISC", "Conocimientos", "Herramientas", "Observaciones"]) {
    comprobar(`la fila «${fila}» está en la cuadrícula`, await page.getByText(fila, { exact: true }).first().isVisible());
  }
  // Ranking por mérito: Luis (CAP 95) debe quedar primero.
  const primeraTarjeta = await page.locator('[role="columnheader"]').nth(1).innerText();
  comprobar("el mejor CAP encabeza la comparativa", /LUIS|Luis/.test(primeraTarjeta), primeraTarjeta.slice(0, 60));
  await foto(page, "comparador-tres");
  await fotoDe(page, ".cmp-grid", "comparador-cuadricula");

  // Pestaña de gráficos.
  await page.getByRole("main").getByRole("button", { name: /Gráficos/ }).click();
  await page.waitForTimeout(700);
  comprobar("los gráficos dibujan un svg", (await page.locator("svg").count()) > 0);
  await foto(page, "comparador-graficos");

  // Pestaña de configuración: apagar una sección y comprobar el efecto.
  await page.getByRole("main").getByRole("button", { name: /Configuración/ }).click();
  await page.waitForTimeout(400);
  comprobar("la configuración lista las filas", await page.getByText("Filas visibles").isVisible());
  await foto(page, "comparador-config");

  await contexto.close();
  return errores;
});

escenario("comparador-duplicados", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { escenario: "stress" });
  await abrir(page, base, "Comparador");
  const buscador = buscadorCandidatos(page);

  // Dos personas comparten el identificador 8456872-105-2026 en la hoja.
  await buscador.click();
  await buscador.fill("María Fernanda");
  await page.waitForTimeout(320);
  await sugerencias(page).first().click();
  await page.waitForTimeout(300);

  await buscador.click();
  await buscador.fill("Rodrigo");
  await page.waitForTimeout(320);
  const hayRodrigo = (await sugerencias(page).count()) > 0;
  if (hayRodrigo) await sugerencias(page).first().click();
  await page.waitForTimeout(400);

  const contador = await page.locator("text=/en comparación/").first().textContent();
  comprobar(
    "dos postulantes con el mismo identificador entran como dos columnas",
    contador?.startsWith("2"),
    `contador = ${contador}; sugerencia visible = ${hayRodrigo}`,
  );
  await foto(page, "comparador-duplicados");
  await contexto.close();
  return errores;
});

escenario("postulantes-alta", async (navegador, base) => {
  const registro = [];
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { registro });
  await abrir(page, base, "Postulantes");
  comprobar("la lista muestra las fichas", (await page.locator("text=/comp\\./").count()) >= 3);
  await foto(page, "postulantes-lista");

  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.waitForTimeout(700);
  const dialogo = page.getByRole("dialog", { name: /Cuestionario de Registro/ });
  comprobar("el cuestionario se abre", await dialogo.isVisible());

  // Intro en un campo NO debe enviar la ficha a medio llenar.
  const id = dialogo.getByLabel(/Identificador Único/).first();
  await id.fill("1000001-108-2026");
  await id.press("Enter");
  await page.waitForTimeout(350);
  comprobar(
    "Intro no envía el cuestionario",
    (await dialogo.isVisible()) && altas(registro, "1000001-108-2026").length === 0,
    `altas registradas = ${altas(registro, "1000001-108-2026").length}`,
  );

  await dialogo.getByLabel("Nombres", { exact: true }).fill("Ana Lucía");
  await dialogo.getByLabel("Apellido Paterno").fill("Torrez");
  await dialogo.getByLabel("Apellido Materno").fill("Gómez");
  await dialogo.getByLabel(/Nota CAP \(porcentaje\)/).fill("83");
  await page.waitForTimeout(200);
  await foto(page, "postulantes-cuestionario");

  await dialogo.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1200);
  const enviados = altas(registro, "1000001-108-2026");
  comprobar("el alta viaja al backend una sola vez", enviados.length === 1, `envíos = ${enviados.length}`);
  comprobar(
    "el cuerpo lleva los campos del contrato",
    enviados[0]?.nombres === "Ana Lucía" && enviados[0]?.nota_cap === 83,
    JSON.stringify(enviados[0] ?? {}).slice(0, 160),
  );
  comprobar("el modal se cierra tras guardar", !(await dialogo.isVisible()));
  await foto(page, "postulantes-tras-alta");

  await contexto.close();
  return errores;
});

escenario("postulantes-duplicado-local", async (navegador, base) => {
  const registro = [];
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { registro });
  await abrir(page, base, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.waitForTimeout(700);
  const dialogo = page.getByRole("dialog", { name: /Cuestionario de Registro/ });
  // Identificador que ya está en la hoja: la clave de la fila.
  await dialogo.getByLabel(/Identificador Único/).first().fill("8456872-105-2026");
  await dialogo.getByLabel("Nombres", { exact: true }).fill("Duplicada");
  await dialogo.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(900);
  const texto = (await dialogo.isVisible()) ? await dialogo.innerText() : "";
  comprobar(
    "un identificador ya existente se detecta antes de enviar",
    /Editar/.test(texto) && altas(registro, "8456872-105-2026").length === 0,
    `envíos = ${altas(registro, "8456872-105-2026").length}`,
  );
  await foto(page, "postulantes-duplicado-local");
  await contexto.close();
  return errores;
});

escenario("postulantes-backend-rechaza", async (navegador, base) => {
  const registro = [];
  const { contexto, page, errores } = await nuevaPagina(navegador, base, {
    registro,
    modo: "duplicado",
  });
  await abrir(page, base, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.waitForTimeout(700);
  const dialogo = page.getByRole("dialog", { name: /Cuestionario de Registro/ });
  await dialogo.getByLabel(/Identificador Único/).first().fill("4000004-108-2026");
  await dialogo.getByLabel("Nombres", { exact: true }).fill("Rechazada");
  await dialogo.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1400);

  const alerta = dialogo.getByRole("alert");
  const texto = (await alerta.count()) ? await alerta.first().innerText() : "";
  comprobar(
    "un rechazo del servidor se avisa al analista",
    /rechaz|existe|no se guard/i.test(texto),
    texto ? texto.replace(/\n/g, " · ") : "no hay ningún aviso visible",
  );
  comprobar("tras un rechazo el cuestionario sigue abierto", await dialogo.isVisible());
  await foto(page, "postulantes-rechazo");
  await contexto.close();
  return errores;
});

escenario("postulantes-sin-red", async (navegador, base) => {
  const registro = [];
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { registro, modo: "caido" });
  await abrir(page, base, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.waitForTimeout(700);
  const dialogo = page.getByRole("dialog", { name: /Cuestionario de Registro/ });
  await dialogo.getByLabel(/Identificador Único/).first().fill("2000002-108-2026");
  await dialogo.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1600);
  const alerta = dialogo.getByRole("alert");
  const textoModal = (await alerta.count()) ? await alerta.first().innerText() : "";
  comprobar(
    "sin red el cuestionario NO se cierra y avisa",
    /sincroniz|conexión|no se pudo/i.test(textoModal),
    textoModal ? textoModal.slice(0, 200).replace(/\n/g, " · ") : "el modal se cerró y el avance se perdió",
  );
  await foto(page, "postulantes-sin-red");
  await contexto.close();
  return errores;
});

escenario("postulantes-html-de-google", async (navegador, base) => {
  const registro = [];
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { registro, modo: "html" });
  await abrir(page, base, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.waitForTimeout(700);
  const dialogo = page.getByRole("dialog", { name: /Cuestionario de Registro/ });
  await dialogo.getByLabel(/Identificador Único/).first().fill("3000003-108-2026");
  await dialogo.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1400);
  const alerta = dialogo.getByRole("alert");
  const textoModal = (await alerta.count()) ? await alerta.first().innerText() : "";
  comprobar(
    "una página de error de Google no se toma por un guardado correcto",
    /no se pudo|servidor|reintent/i.test(textoModal),
    textoModal ? textoModal.slice(0, 200).replace(/\n/g, " · ") : "el modal se cerró como si hubiera guardado",
  );
  await foto(page, "postulantes-html-google");
  await contexto.close();
  return errores;
});

escenario("postulantes-edicion", async (navegador, base) => {
  const registro = [];
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { registro });
  await abrir(page, base, "Postulantes");
  // El botón «Editar» de la primera ficha (icono de lápiz).
  await page.getByRole("button", { name: /^Editar/ }).first().click();
  await page.waitForTimeout(800);
  const dialogo = page.getByRole("dialog", { name: /Editar Postulante/ });
  comprobar("el cuestionario se abre en modo edición", await dialogo.isVisible());
  const id = dialogo.getByLabel(/Identificador Único/).first();
  comprobar("el identificador queda bloqueado", await id.evaluate((el) => el.readOnly));

  const carrera = dialogo.getByLabel(/Carrera/).first();
  await carrera.fill("Auditoría Financiera");
  await page.waitForTimeout(250);
  comprobar("el cambio se resalta en ámbar", (await dialogo.locator(".edit-hl").count()) > 0);
  await foto(page, "postulantes-edicion");

  await dialogo.getByRole("button", { name: /Guardar Cambios/ }).click();
  await page.waitForTimeout(1400);
  const ediciones = registro.filter((r) => r.action === "update");
  comprobar("la edición viaja con action:update", ediciones.length === 1, `envíos = ${ediciones.length}`);
  comprobar(
    "la edición lleva el campo modificado",
    ediciones[0]?.carrera === "Auditoría Financiera",
    JSON.stringify(ediciones[0] ?? {}).slice(0, 140),
  );
  await contexto.close();
  return errores;
});

escenario("impresion", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base);
  await abrir(page, base, "Comparador");
  const buscador = buscadorCandidatos(page);
  for (const nombre of ["María", "Jorge"]) {
    await buscador.click();
    await buscador.fill(nombre);
    await page.waitForTimeout(300);
    await sugerencias(page).first().click();
    await page.waitForTimeout(250);
  }
  // El alcance de impresión del comparador se activa con clases en <body>.
  await page.evaluate(() => document.body.classList.add("bdp-print-scoped", "bdp-scope-comparador"));
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(500);
  const dockVisible = await page.locator("nav, [aria-label='Navegación de módulos']").first().isVisible().catch(() => false);
  comprobar("la impresión oculta el dock", !dockVisible);
  comprobar("la impresión conserva la cuadrícula", await page.locator(".cmp-grid").isVisible());
  await foto(page, "impresion-comparador");
  await page.emulateMedia({ media: "screen" });
  await contexto.close();
  return errores;
});

escenario("tema-oscuro", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { tema: "dark" });
  await abrir(page, base, "Comparador");
  const buscador = buscadorCandidatos(page);
  await buscador.click();
  await buscador.fill("Jorge");
  await page.waitForTimeout(300);
  await sugerencias(page).first().click();
  await page.waitForTimeout(500);
  comprobar(
    "el tema oscuro está aplicado",
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
  );
  await fotoDe(page, ".cmp-grid", "oscuro-cuadricula");
  await contexto.close();
  return errores;
});

escenario("datos-sucios", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { escenario: "stress" });
  await abrir(page, base, "Postulantes");
  comprobar("la lista sobrevive a filas sucias", await page.locator("main").isVisible());
  const cuerpo = await page.locator("main").innerText();
  comprobar("las filas sin nombre usan el respaldo", /Postulante Sin Nombre/.test(cuerpo));
  await foto(page, "datos-sucios-lista");
  await irA(page, "Comparador");
  await page.waitForTimeout(400);
  comprobar("el comparador sobrevive a filas sucias", await page.locator("main").isVisible());
  await contexto.close();
  return errores;
});

escenario("diagnostico", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { escenario: "stress" });
  await abrir(page, base, "Configuración");
  await page.getByRole("button", { name: /Ejecutar diagnóstico/ }).click();
  await page.waitForTimeout(1600);
  const texto = await page.locator("main").innerText();
  comprobar("el diagnóstico detecta la hoja con identificadores repetidos", /repetido/i.test(texto));
  comprobar("el diagnóstico mide la conexión con la hoja", /Respondió en \d+ ms/.test(texto), texto.slice(0, 120));
  await page.getByText(/Motor gráfico/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await foto(page, "diagnostico");
  await contexto.close();
  return errores;
});

escenario("comparador-todo-oculto", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base);
  await abrir(page, base, "Comparador");
  const buscador = buscadorCandidatos(page);
  await buscador.click();
  await buscador.fill("Luis");
  await page.waitForTimeout(320);
  await sugerencias(page).first().click();
  await page.waitForTimeout(300);

  // Apagar todas las secciones desde la pestaña de configuración del módulo.
  await page.getByRole("main").getByRole("button", { name: /Configuración/ }).click();
  await page.waitForTimeout(400);
  const seccion = page.getByRole("main").locator('button[role="switch"][aria-checked="true"]');
  const total = await seccion.count();
  for (let i = total - 1; i >= 0; i -= 1) {
    const sw = seccion.nth(i);
    if (await sw.isVisible()) await sw.click({ timeout: 3000 }).catch(() => {});
  }
  await page.getByRole("main").getByRole("button", { name: /Comparativa/ }).click();
  await page.waitForTimeout(600);
  const texto = await page.locator("main").innerText();
  comprobar(
    "una comparativa sin filas visibles se explica en pantalla",
    /todas sus filas están ocultas/i.test(texto),
    texto.slice(0, 200).replace(/\n/g, " · "),
  );
  await foto(page, "comparador-todo-oculto");
  await contexto.close();
  return errores;
});

/**
 * Recorrido por los diez módulos con la hoja «sucia».
 *
 * No busca comportamientos concretos: busca que **nada explote**. Cada módulo se
 * abre, se le da tiempo a montar (los de Procesos y Evaluaciones llegan por
 * `import()` diferido) y se comprueba que la pantalla no cayó en el
 * `ErrorBoundary` ni dejó errores en la consola.
 */
escenario("recorrido-completo", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base, { escenario: "stress" });
  await abrir(page, base);
  const modulos = [
    "Dashboard",
    "Tablero",
    "Cara a Cara",
    "Comparador",
    "Procesos",
    "Evaluaciones",
    "Postulantes",
    "Perfiles",
    "Documentación",
    "Configuración",
  ];
  for (const modulo of modulos) {
    await irA(page, modulo);
    await page.waitForTimeout(900);
    const texto = await page.locator("main").innerText();
    comprobar(
      `«${modulo}» se dibuja sin caer en el ErrorBoundary`,
      !/Ocurrió un error inesperado/.test(texto),
      texto.slice(0, 160).replace(/\n/g, " · "),
    );
  }
  await foto(page, "recorrido-configuracion");
  await contexto.close();
  return errores;
});

escenario("movil", async (navegador, base) => {
  const { contexto, page, errores } = await nuevaPagina(navegador, base, {
    viewport: { width: 390, height: 844 },
  });
  await abrir(page, base, "Comparador");
  const buscador = buscadorCandidatos(page);
  await buscador.click();
  await buscador.fill("Luis");
  await page.waitForTimeout(320);
  await sugerencias(page).first().click();
  await page.waitForTimeout(500);
  comprobar("el comparador es usable en móvil", await page.locator(".cmp-grid").isVisible());
  await foto(page, "movil-comparador");
  await irA(page, "Postulantes");
  await foto(page, "movil-postulantes");
  await contexto.close();
  return errores;
});

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error(rojo("No hay build. Ejecute `npm run build` antes del arnés."));
    process.exit(1);
  }
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      ambar(
        "Playwright no está instalado. Instálelo una sola vez con:\n" +
          "    npm i -D playwright && npx playwright install chromium",
      ),
    );
    process.exit(1);
  }

  const { server, base } = await servir();
  const navegador = await chromium.launch({ headless: !headed });
  const erroresNavegador = [];

  for (const { nombre, fn } of escenarios) {
    if (only && nombre !== only) continue;
    console.log(negrita(`\n▶ ${nombre}`));
    try {
      const errores = await fn(navegador, base);
      for (const e of errores ?? []) {
        erroresNavegador.push(`[${nombre}] ${e}`);
        console.log(`  ${rojo("!")} ${e}`);
      }
    } catch (err) {
      fallos.push(`${nombre}: ${err.message}`);
      console.log(`  ${rojo("✗ escenario interrumpido")} ${err.message}`);
    }
  }

  await navegador.close();
  server.close();

  await mkdir(SALIDA, { recursive: true });
  await writeFile(
    join(SALIDA, "informe.json"),
    JSON.stringify({ fecha: new Date().toISOString(), fallos, erroresNavegador, avisos }, null, 2),
  );

  console.log("");
  if (avisos.length) {
    console.log(ambar(`${avisos.length} aviso(s) de React:`));
    for (const a of [...new Set(avisos)]) console.log(gris(`  · ${a.slice(0, 180)}`));
  }
  if (fallos.length === 0 && erroresNavegador.length === 0) {
    console.log(verde(negrita("QA en verde: ningún fallo funcional ni error de consola.")));
    process.exit(0);
  }
  console.log(rojo(negrita(`QA en rojo — ${fallos.length} fallo(s), ${erroresNavegador.length} error(es) de consola.`)));
  process.exit(1);
}

main();
