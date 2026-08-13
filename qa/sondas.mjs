/**
 * Sondas puntuales sobre un solo síntoma cada una. Cada sonda imprime hechos,
 * no capturas: así se puede razonar sobre el fallo sin depender de imágenes.
 */
import { chromium } from "playwright";

const APP = process.env.QA_APP ?? "http://127.0.0.1:4173";
const MOCK = "http://127.0.0.1:8787";
const SCRIPT = "https://script.google.com/**";
const sonda = process.argv[2];

const mockRoute = async (route) => {
  const req = route.request();
  const res = await fetch(MOCK + "/exec", {
    method: req.method(),
    headers: { "Content-Type": req.headers()["content-type"] ?? "application/json" },
    body: req.method() === "POST" ? req.postData() ?? "" : undefined,
  });
  await route.fulfill({
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Access-Control-Allow-Origin": "*" },
    body: await res.text(),
  });
};

async function nueva(opts = {}) {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "es-BO", ...opts.context });
  if (opts.init) await context.addInitScript(opts.init);
  const page = await context.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource")) errores.push(m.text().slice(0, 300));
  });
  return { browser, context, page, errores };
}

async function login(page) {
  await page.waitForTimeout(1200);
  const p = page.getByText("Mayra Chávez").first();
  if (!(await p.count())) return false;
  await p.click();
  await page.waitForTimeout(600);
  await page.locator('input[type="password"]').fill("1234");
  await page.getByRole("button", { name: /Iniciar sesión/i }).click();
  await page.waitForTimeout(1500);
  return true;
}

/* ------------------------------------------------------------------ */

async function almacenamientoBloqueado() {
  const { browser, page, errores } = await nueva({
    init: () => {
      const boom = () => {
        throw new DOMException("Access is denied for this document.", "SecurityError");
      };
      for (const k of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(window, k, { get: boom, configurable: true });
      }
    },
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" }).catch((e) => console.log("goto:", e.message));
  await page.waitForTimeout(2500);
  const html = await page.content();
  const rootVacio = await page.evaluate(() => document.getElementById("root")?.childElementCount ?? -1);
  console.log("almacenamiento bloqueado →");
  console.log("  hijos de #root:", rootVacio, rootVacio === 0 ? "  ⚠️ PANTALLA EN BLANCO" : "");
  console.log("  ¿se ve la pantalla de acceso?:", html.includes("Mayra") || html.includes("perfil"));
  console.log("  errores:", errores.slice(0, 4));
  await browser.close();
}

async function guardadoMentiroso() {
  const { browser, page, errores } = await nueva();
  let modo = "ok";
  await page.route(SCRIPT, async (route) => {
    if (modo === "html") {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
        body: "<html><body>Se requiere autorización</body></html>",
      });
      return;
    }
    await mockRoute(route);
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(1000);

  // A partir de aquí el backend responde HTML 200 (despliegue sin permisos).
  modo = "html";

  await page.getByRole("button", { name: /Nuevo Postulante/i }).first().click();
  await page.waitForTimeout(900);
  const dlg = page.locator('[role="alertdialog"]');
  if (await dlg.count()) await page.getByRole("button", { name: /Descartar/i }).first().click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder="CI - Nro Proceso - Año"]').fill("9999999-999-2026");
  await page.locator('input[placeholder="Nombres"]').fill("Fantasma");
  const antes = Date.now();
  await page.getByRole("button", { name: /Registrar Postulante/i }).click();
  await page.waitForTimeout(2500);
  const modalAbierto = await page.locator('form.glass-flat').count();
  const textoPagina = await page.locator("body").innerText();
  console.log("guardado con backend caído (HTML 200) →");
  console.log("  el modal se cerró (0 = sí):", modalAbierto);
  console.log("  ¿la página dice «correctamente»?:", /registrado correctamente/i.test(textoPagina));
  console.log("  ¿la página dice «falló»/«localmente»?:", /(falló|localmente)/i.test(textoPagina));
  console.log("  ¿«Fantasma» aparece en la lista?:", textoPagina.includes("Fantasma"));
  const posts = await (await fetch(MOCK + "/__posts")).json();
  console.log("  POST realmente recibidos con ese id:", posts.filter((p) => p?.identificador === "9999999-999-2026").length);
  console.log("  errores:", errores.slice(0, 3));
  await browser.close();
}

async function puntoDeSincronizacion() {
  const { browser, page } = await nueva();
  let caida = false;
  await page.route(SCRIPT, async (route) => {
    if (caida) return route.abort("connectionfailed");
    await mockRoute(route);
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.waitForTimeout(600);
  const leer = () =>
    page.evaluate(() => {
      const t = document.title;
      const dock = document.querySelector('[title*="incroniz"], [aria-label*="incroniz"]');
      return {
        titulo: t,
        indicador: dock ? dock.getAttribute("title") || dock.getAttribute("aria-label") : null,
        textoDock: document.body.innerText.includes("Sin conexión"),
      };
    });
  console.log("punto de sincronización →");
  console.log("  en línea:", await leer());
  caida = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(4000);
  console.log("  red caída:", await leer());
  const texto = await page.locator("body").innerText();
  console.log("  ¿la interfaz avisa de algún problema?:", /(sin conexión|error|no se pudo|falló)/i.test(texto));
  await browser.close();
}

async function carreraOptimista() {
  // Reproduce la caché del backend: el POST se acepta pero el GET siguiente
  // devuelve todavía el listado sin la fila nueva.
  const { browser, page } = await nueva();
  let ocultarNuevo = true;
  await page.route(SCRIPT, async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ status: "success" }),
      });
      return;
    }
    // El GET nunca incluye la fila recién creada (caché del backend).
    await mockRoute(route);
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Nuevo Postulante/i }).first().click();
  await page.waitForTimeout(800);
  if (await page.locator('[role="alertdialog"]').count())
    await page.getByRole("button", { name: /Descartar/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="CI - Nro Proceso - Año"]').fill("1010101-200-2026");
  await page.locator('input[placeholder="Nombres"]').fill("Efimero");
  await page.getByRole("button", { name: /Registrar Postulante/i }).click();
  await page.waitForTimeout(700);
  const justoDespues = (await page.locator("body").innerText()).includes("Efimero");
  await page.waitForTimeout(4000);
  const masTarde = (await page.locator("body").innerText()).includes("Efimero");
  console.log("carrera entre el alta optimista y el refresco →");
  console.log("  visible justo después de guardar:", justoDespues);
  console.log("  visible 4 s después:", masTarde, !masTarde ? "  ⚠️ DESAPARECIÓ" : "");
  await browser.close();
  void ocultarNuevo;
}

async function limiteFantasma() {
  // Sesión con 10 ids que ya no existen: el buscador se bloquea al 10/10 y la
  // comparativa queda vacía. Es el «el comparador no funciona» reproducible.
  const { browser, page } = await nueva({
    init: () => {
      window.sessionStorage.setItem(
        "bdp-comparador-session",
        JSON.stringify({
          selectedIds: Array.from({ length: 10 }, (_, i) => `borrado-${i}`),
          showAjusteBrecha: true,
          dense: false,
          sectionVisible: {},
          sectionCollapsed: {},
          rowHidden: {},
        }),
      );
    },
  });
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(1200);
  const input = page.locator('input[role="combobox"]');
  const texto = await page.locator("body").innerText();
  console.log("sesión con identificadores que ya no existen →");
  console.log("  buscador habilitado:", (await input.count()) ? await input.first().isEnabled() : "no hay buscador");
  console.log("  placeholder:", (await input.count()) ? await input.first().getAttribute("placeholder") : "-");
  console.log("  contador:", (texto.match(/\d+\/\d+/) ?? ["?"])[0]);
  console.log("  ¿muestra la pantalla de «Comienza tu comparación»?:", texto.includes("Comienza tu comparación"));
  console.log("  ¿dice «en comparación»?:", /\d+ en comparación/.test(texto));
  await browser.close();
}

async function seccionesApagadas() {
  const { browser, page } = await nueva({
    init: () => {
      window.sessionStorage.setItem(
        "bdp-comparador-session",
        JSON.stringify({
          selectedIds: [],
          showAjusteBrecha: true,
          dense: false,
          sectionVisible: {
            resultados: false,
            competencias: false,
            conocimientos: false,
            herramientas: false,
            integridad: false,
            observaciones: false,
          },
          sectionCollapsed: {},
          rowHidden: { ranking: true },
        }),
      );
    },
  });
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[role="combobox"]');
  await input.first().fill("Jorge");
  await page.waitForTimeout(500);
  await page.locator('[role="option"] button').first().click();
  await page.waitForTimeout(900);
  const filas = await page.locator('[role="rowheader"]').count();
  const texto = await page.locator("body").innerText();
  const aviso = /Todas las secciones de la comparativa están ocultas/i.test(texto);
  const boton = await page.getByRole("button", { name: /Mostrar todas las secciones/i }).count();
  console.log("sesión con todas las secciones apagadas →");
  console.log("  filas dibujadas:", filas);
  console.log("  ¿explica que está todo oculto?:", aviso, !aviso ? "  ⚠️ EN BLANCO SIN EXPLICACIÓN" : "");
  console.log("  ¿ofrece el remedio en el sitio?:", boton > 0);
  if (boton > 0) {
    await page.getByRole("button", { name: /Mostrar todas las secciones/i }).click();
    await page.waitForTimeout(900);
    console.log("  filas tras pulsarlo:", await page.locator('[role="rowheader"]').count());
  }
  await browser.close();
}

async function duplicadosComparables() {
  const { browser, page, errores } = await nueva();
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[role="combobox"]');
  await input.first().fill("Jorge");
  await page.waitForTimeout(500);
  const antes = await page.locator('[role="option"] button').count();
  await page.locator('[role="option"] button').first().click();
  await page.waitForTimeout(600);
  await input.first().fill("Jorge");
  await page.waitForTimeout(500);
  const despues = await page.locator('[role="option"] button').count();
  if (despues > 0) {
    await page.locator('[role="option"] button').first().click();
    await page.waitForTimeout(700);
  }
  const columnas = await page.locator('[role="columnheader"]').count();
  console.log("dos filas con el MISMO identificador →");
  console.log("  sugerencias antes de agregar:", antes);
  console.log("  sugerencias tras agregar la primera:", despues, despues === 0 ? "  ⚠️ LA SEGUNDA ES INALCANZABLE" : "");
  console.log("  columnas en la comparativa (1 rótulo + N):", columnas);
  console.log("  avisos de clave duplicada de React:", errores.filter((e) => e.includes("same key")).length);
  await browser.close();
}

/**
 * Navegador «de la vieja escuela»: sin ResizeObserver, sin IntersectionObserver y
 * con `matchMedia` presente pero no invocable (lo que ocurre en varios WebView
 * corporativos). Es el perfil de equipo que rompía SÓLO el Comparador y SÓLO el
 * cuestionario de Postulantes, porque son los dos únicos sitios que usan esas API.
 */
async function navegadorAntiguo() {
  const { browser, page, errores } = await nueva({
    init: () => {
      delete window.ResizeObserver;
      delete window.IntersectionObserver;
      Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
    },
  });
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  const entro = await login(page);
  console.log("navegador sin observadores ni matchMedia →");
  console.log("  entró al sistema:", entro);

  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(1200);
  const buscador = await page.locator('input[role="combobox"]').count();
  let columnas = 0;
  if (buscador) {
    await page.locator('input[role="combobox"]').first().fill("Jorge");
    await page.waitForTimeout(500);
    const op = page.locator('[role="option"] button');
    if (await op.count()) {
      await op.first().click();
      await page.waitForTimeout(800);
    }
    columnas = await page.locator('[role="columnheader"]').count();
  }
  const roto = await page.getByText("Ocurrió un error inesperado").count();
  console.log("  Comparador: buscador", buscador ? "presente" : "AUSENTE", "· columnas", columnas, "· pantalla de error:", roto);

  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Nuevo Postulante/i }).first().click();
  await page.waitForTimeout(900);
  if (await page.locator('[role="alertdialog"]').count())
    await page.getByRole("button", { name: /Descartar/i }).first().click();
  const campo = await page.locator('input[placeholder="CI - Nro Proceso - Año"]').count();
  console.log("  Postulantes: cuestionario", campo ? "abierto" : "NO ABRIÓ");
  if (campo) {
    await page.locator('input[placeholder="CI - Nro Proceso - Año"]').fill("7070707-500-2026");
    await page.getByRole("button", { name: /Registrar Postulante/i }).click();
    await page.waitForTimeout(2200);
    const posts = await (await fetch(MOCK + "/__posts")).json();
    console.log("  alta registrada en el backend:", posts.filter((x) => x?.identificador === "7070707-500-2026").length);
  }
  console.log("  errores de JavaScript:", errores.length, errores.slice(0, 3));
  await browser.close();
}

const sondas = {
  "navegador-antiguo": navegadorAntiguo,
  "duplicados-comparables": duplicadosComparables,
  "almacenamiento-bloqueado": almacenamientoBloqueado,
  "guardado-mentiroso": guardadoMentiroso,
  "punto-sincronizacion": puntoDeSincronizacion,
  "carrera-optimista": carreraOptimista,
  "limite-fantasma": limiteFantasma,
  "secciones-apagadas": seccionesApagadas,
  "observacion-perdida": () => observacionPerdida(),
  "nota-no-se-borra": () => notaNoSeBorra(),
};

const fn = sondas[sonda];
if (!fn) {
  console.log("sondas disponibles:", Object.keys(sondas).join(", "));
  process.exit(1);
}
fn().catch((e) => {
  console.error("FALLO:", e);
  process.exit(1);
});

/* --- sondas añadidas --- */
async function observacionPerdida() {
  const { browser, page } = await nueva();
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Nuevo Postulante/i }).first().click();
  await page.waitForTimeout(800);
  if (await page.locator('[role="alertdialog"]').count())
    await page.getByRole("button", { name: /Descartar/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="CI - Nro Proceso - Año"]').fill("2020202-300-2026");
  const obs = page.locator('input[placeholder*="observación"]');
  await obs.first().click();
  await obs.first().type("Sin confirmar con Enter", { delay: 15 });
  // Guardar directamente, sin pulsar Enter ni coma.
  await page.getByRole("button", { name: /Registrar Postulante/i }).click();
  await page.waitForTimeout(2200);
  const posts = await (await fetch(MOCK + "/__posts")).json();
  const fila = posts.filter((p) => p?.identificador === "2020202-300-2026").pop();
  console.log("observación escrita sin confirmar →");
  console.log("  observaciones guardadas:", JSON.stringify(fila?.observaciones));
  console.log("  ¿se perdió?:", !String(fila?.observaciones ?? "").includes("Sin confirmar"));
  await browser.close();
}

async function notaNoSeBorra() {
  const { browser, page } = await nueva();
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Nuevo Postulante/i }).first().click();
  await page.waitForTimeout(800);
  if (await page.locator('[role="alertdialog"]').count())
    await page.getByRole("button", { name: /Descartar/i }).first().click();
  await page.waitForTimeout(300);
  const cap = page.getByLabel("Nota CAP (porcentaje)");
  await cap.fill("77");
  await page.waitForTimeout(300);
  console.log("nota CAP tras escribir 77:", await cap.inputValue());
  await cap.fill("");
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="Nombres"]').click();
  await page.waitForTimeout(400);
  console.log("borrar una nota →");
  console.log("  valor mostrado tras vaciar el campo:", JSON.stringify(await cap.inputValue()), "(vacío = se pudo borrar)");
  await browser.close();
}


