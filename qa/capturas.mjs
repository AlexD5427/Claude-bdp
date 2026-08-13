/**
 * Capturas para el documento explicativo.
 *
 * Se toman a 1280×820 y se recortan a la zona interesante: las capturas de página
 * completa de este panel superan los 2000 px de alto y hay herramientas de
 * revisión que las rechazan por tamaño.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const APP = process.env.QA_APP ?? "http://127.0.0.1:4173";
const MOCK = "http://127.0.0.1:8787";
const SCRIPT = "https://script.google.com/**";
const OUT = "docs/estabilidad";
mkdirSync(OUT, { recursive: true });

const mockRoute = async (route) => {
  const r = route.request();
  const res = await fetch(MOCK + "/exec", {
    method: r.method(),
    headers: { "Content-Type": "text/plain" },
    body: r.method() === "POST" ? r.postData() ?? "" : undefined,
  });
  await route.fulfill({
    status: res.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: await res.text(),
  });
};

const htmlRoute = async (route) =>
  route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
    body: "<html><body>Se requiere autorización para ejecutar el script</body></html>",
  });

async function login(page) {
  await page.waitForTimeout(1300);
  await page.getByText("Mayra Chávez").first().click();
  await page.waitForTimeout(600);
  await page.locator('input[type="password"]').fill("1234");
  await page.getByRole("button", { name: /Iniciar sesión/i }).click();
  await page.waitForTimeout(1600);
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function pagina(init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: "es-BO" });
  if (init) await ctx.addInitScript(init);
  return ctx.newPage();
}

/* 1 · Diagnóstico de conexión, todo en verde */
{
  const page = await pagina();
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Configuración" }).first().click();
  await page.waitForTimeout(1000);
  await page.getByText("Base de datos · Google Apps Script").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Ejecutar diagnóstico/i }).click();
  await page.waitForTimeout(2500);
  const caja = page.locator("text=Base de datos · Google Apps Script").locator("xpath=../..");
  await caja.screenshot({ path: `${OUT}/01-diagnostico-ok.png` });
  await page.context().close();
}

/* 2 · Diagnóstico con el despliegue sin permisos */
{
  const page = await pagina();
  let roto = false;
  await page.route(SCRIPT, async (r) => (roto ? htmlRoute(r) : mockRoute(r)));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Configuración" }).first().click();
  await page.waitForTimeout(900);
  roto = true;
  await page.getByText("Base de datos · Google Apps Script").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /Ejecutar diagnóstico/i }).click();
  await page.waitForTimeout(2800);
  const caja = page.locator("text=Base de datos · Google Apps Script").locator("xpath=../..");
  await caja.screenshot({ path: `${OUT}/02-diagnostico-permisos.png` });
  await page.context().close();
}

/* 3 · El alta ya no miente: el cuestionario se queda con el motivo del fallo */
{
  const page = await pagina();
  let roto = false;
  await page.route(SCRIPT, async (r) => (roto ? htmlRoute(r) : mockRoute(r)));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(900);
  roto = true;
  await page.getByRole("button", { name: /Nuevo Postulante/i }).first().click();
  await page.waitForTimeout(900);
  if (await page.locator('[role="alertdialog"]').count())
    await page.getByRole("button", { name: /Descartar/i }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder="CI - Nro Proceso - Año"]').fill("8899001-107-2026");
  await page.locator('input[placeholder="Nombres"]').fill("Rocío");
  await page.getByRole("button", { name: /Registrar Postulante/i }).click();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/03-alta-rechazada.png` });
  await page.context().close();
}

/* 4 · Comparativa con todo oculto: se explica y ofrece el remedio */
{
  const page = await pagina(() => {
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
  });
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(900);
  await page.locator('input[role="combobox"]').fill("Jorge");
  await page.waitForTimeout(500);
  await page.locator('[role="option"] button').first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/04-comparativa-oculta.png` });
  await page.context().close();
}

/* 5 · Sesión con identificadores muertos: buscador libre + aviso */
{
  const page = await pagina(() => {
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
  });
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/05-limite-liberado.png` });
  await page.context().close();
}

/* 6 · Aviso de identificador duplicado en Postulantes */
{
  const page = await pagina();
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Postulantes" }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/06-id-duplicado.png` });
  await page.context().close();
}

/* 7 · Sin conexión: el botón flotante y el punto del dock en rojo */
{
  const page = await pagina();
  let caida = false;
  await page.route(SCRIPT, async (r) => (caida ? r.abort("connectionfailed") : mockRoute(r)));
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(800);
  caida = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/07-sin-conexion.png` });
  await page.context().close();
}

/* 8 · La comparativa sana, para dejar constancia de que nada se rompió */
{
  const page = await pagina();
  await page.route(SCRIPT, mockRoute);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.getByRole("button", { name: "Comparador" }).first().click();
  await page.waitForTimeout(900);
  for (const n of ["Jorge", "Andrea", "María"]) {
    await page.locator('input[role="combobox"]').fill(n);
    await page.waitForTimeout(450);
    const op = page.locator('[role="option"] button');
    if (await op.count()) await op.first().click();
    await page.waitForTimeout(400);
  }
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/08-comparativa-sana.png` });
  await page.context().close();
}

await browser.close();
console.log("capturas en", OUT);
