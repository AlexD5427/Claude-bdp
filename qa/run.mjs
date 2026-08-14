/**
 * Arnés de QA: abre la aplicación en Chromium, entra con un perfil y ejecuta un
 * recorrido por los módulos de Comparador y Postulantes, registrando en consola
 * cada error de JavaScript, cada aviso de React y cada petición fallida.
 *
 * Uso:  node qa/run.mjs [escenario]
 *   escenarios: base | red-caida | sin-storage | movil
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const APP = process.env.QA_APP ?? "http://127.0.0.1:4173";
const MOCK = "http://127.0.0.1:8787";
const SCRIPT_GLOB = "https://script.google.com/**";
const escenario = process.argv[2] ?? "base";
const OUT = `qa/shots/${escenario}`;
mkdirSync(OUT, { recursive: true });

const problemas = [];
let paso = 0;

async function shot(page, nombre) {
  paso += 1;
  const file = `${OUT}/${String(paso).padStart(2, "0")}-${nombre}.png`;
  await page.screenshot({ path: file });
  return file;
}

function log(...args) {
  console.log(...args);
}

const main = async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: escenario === "movil" ? { width: 390, height: 844 } : { width: 1360, height: 900 },
    isMobile: escenario === "movil",
    hasTouch: escenario === "movil",
    locale: "es-BO",
  });

  if (escenario === "sin-storage") {
    // Reproduce un navegador con el almacenamiento del sitio bloqueado:
    // tocar localStorage/sessionStorage lanza SecurityError, como en Chrome con
    // "Bloquear todas las cookies" o en un iframe con almacenamiento partido.
    await context.addInitScript(() => {
      const boom = () => {
        throw new DOMException("Access is denied for this document.", "SecurityError");
      };
      for (const key of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(window, key, { get: boom, configurable: true });
      }
    });
  }

  const page = await context.newPage();

  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      const text = msg.text();
      if (text.includes("Download the React DevTools")) return;
      problemas.push({ tipo: `console.${t}`, text });
      log(`  [console.${t}] ${text.slice(0, 400)}`);
    }
  });
  page.on("pageerror", (err) => {
    problemas.push({ tipo: "pageerror", text: String(err) });
    log(`  [pageerror] ${err}`);
  });
  page.on("requestfailed", (req) => {
    problemas.push({ tipo: "requestfailed", text: `${req.method()} ${req.url()} :: ${req.failure()?.errorText}` });
    log(`  [requestfailed] ${req.url()} ${req.failure()?.errorText}`);
  });

  // Redirige el backend real al mock (o lo bloquea, según el escenario).
  let redCaida = escenario === "red-caida";
  let modoBackend = escenario === "backend-html" ? "html" : escenario === "backend-500" ? "500" : "ok";
  await page.route(SCRIPT_GLOB, async (route) => {
    if (redCaida) {
      await route.abort("connectionfailed");
      return;
    }
    if (modoBackend === "html") {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
        body: "<html><body>Se requiere autorización para ejecutar el script</body></html>",
      });
      return;
    }
    if (modoBackend === "500") {
      await route.fulfill({
        status: 500,
        headers: { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" },
        body: "<html><body>Error interno</body></html>",
      });
      return;
    }
    const req = route.request();
    const res = await fetch(MOCK + "/exec", {
      method: req.method(),
      headers: { "Content-Type": req.headers()["content-type"] ?? "application/json" },
      body: req.method() === "POST" ? req.postData() ?? "" : undefined,
    });
    await route.fulfill({
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: await res.text(),
    });
  });

  log(`\n===== ESCENARIO: ${escenario} =====`);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await shot(page, "arranque");

  // El escenario "cache-red-caida" primero carga bien (para dejar la caché en
  // localStorage) y sólo después corta la red: es el caso del analista que ya
  // usó la página y a quien luego el proxy corporativo empieza a bloquearla.
  if (escenario === "cache-red-caida") {
    redCaida = true;
    log("  (red cortada tras el primer arranque con caché)");
  }

  // ---- Login ----
  const perfil = page.getByText("Mayra Chávez").first();
  if (await perfil.count()) {
    await perfil.click();
    await page.waitForTimeout(700);
    await page.locator('input[type="password"]').fill("1234");
    await page.getByRole("button", { name: /Iniciar sesión/i }).click();
    await page.waitForTimeout(1600);
  } else {
    problemas.push({ tipo: "flujo", text: "No se encontró la pantalla de acceso" });
  }
  await shot(page, "dashboard");

  // ---- COMPARADOR ----
  log("\n-- Comparador --");
  await page.getByRole("button", { name: "Comparador" }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "comparador-vacio");

  const buscador = page.locator('input[role="combobox"]');
  const hayBuscador = await buscador.count();
  log(`  buscador presente: ${hayBuscador > 0}`);
  if (hayBuscador) {
    log(`  buscador habilitado: ${await buscador.first().isEnabled()}`);
    log(`  placeholder: ${await buscador.first().getAttribute("placeholder")}`);
  }

  const nombres = ["Jorge", "Andrea", "María", "Luis"];
  for (const n of nombres) {
    if (!hayBuscador) break;
    await buscador.first().click();
    await buscador.first().fill(n);
    await page.waitForTimeout(500);
    const opciones = page.locator('[role="option"] button');
    const cuantas = await opciones.count();
    log(`  «${n}» → ${cuantas} sugerencia(s)`);
    if (cuantas > 0) {
      await opciones.first().click();
      await page.waitForTimeout(450);
    } else {
      problemas.push({ tipo: "comparador", text: `Sin sugerencias para «${n}»` });
    }
  }
  await page.waitForTimeout(900);
  await shot(page, "comparador-lleno");

  const columnas = await page.locator('[role="columnheader"]').count();
  const chip = await page.getByText(/en comparación/).first().textContent().catch(() => null);
  log(`  columnheaders: ${columnas} · chip: ${chip}`);

  // Filas de ranking / desempate
  const desempates = await page.getByText(/Desempate/).count();
  log(`  celdas con aviso de desempate: ${desempates}`);

  // Contraer una sección
  const contraer = page.getByRole("button", { name: /Contraer Resultados de Evaluación/i });
  if (await contraer.count()) {
    await contraer.first().click();
    await page.waitForTimeout(600);
    await shot(page, "comparador-seccion-contraida");
    await page.getByRole("button", { name: /Desplegar Resultados de Evaluación/i }).first().click();
    await page.waitForTimeout(500);
  }

  // Visor ampliado de una celda larga
  const ampliar = page.locator('button.cmp-expand');
  if (await ampliar.count()) {
    await ampliar.first().click();
    await page.waitForTimeout(900);
    await shot(page, "comparador-visor");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  } else {
    problemas.push({ tipo: "comparador", text: "No hay botón de ampliar celda" });
  }

  // Pestaña de gráficos
  await page.getByRole("button", { name: /^Gráficos$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1400);
  await shot(page, "comparador-graficos");

  // Pestaña de configuración
  await page.getByRole("button", { name: /^Configuración$/ }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await shot(page, "comparador-config");

  // Apagar todas las secciones y volver a la comparativa
  const switches = page.locator('button[role="switch"]');
  log(`  interruptores en Configuración: ${await switches.count()}`);

  await page.getByRole("button", { name: /^Comparativa$/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);

  // Scroll para provocar la barra congelada + el traslado del dock
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(900);
  await shot(page, "comparador-barra-congelada");
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(600);

  // ---- POSTULANTES ----
  log("\n-- Postulantes --");
  await page.getByRole("button", { name: "Postulantes" }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "postulantes-lista");

  const tarjetas = await page.locator("h3").count();
  log(`  tarjetas visibles (h3): ${tarjetas}`);

  const nuevo = page.getByRole("button", { name: /Nuevo Postulante/i });
  log(`  botón «Nuevo Postulante»: ${await nuevo.count()}`);
  await nuevo.first().click();
  await page.waitForTimeout(1200);
  await shot(page, "formulario-abierto");

  const dialogos = await page.locator('[role="alertdialog"]').count();
  log(`  diálogos de confirmación abiertos al abrir el formulario: ${dialogos}`);
  if (dialogos > 0) {
    const t = await page.locator('[role="alertdialog"]').first().getAttribute("aria-label");
    log(`  · ${t}`);
    await page.getByRole("button", { name: /Descartar/i }).first().click().catch(() => {});
    await page.waitForTimeout(600);
  }

  // Rellenar el cuestionario
  const ident = page.locator('input').filter({ hasNot: page.locator('[type=password]') });
  const identField = page.locator('input[placeholder="CI - Nro Proceso - Año"]');
  if (await identField.count()) {
    await identField.fill("1234567-107-2026");
    await page.locator('input[placeholder="Nombres"]').fill("Prueba");
    await page.locator('input[placeholder="Apellido Paterno"]').fill("QA");
    await page.locator('input[placeholder="Apellido Materno"]').fill("Automática");
    // Intro no debe enviar
    await page.locator('input[placeholder="Nombres"]').press("Enter");
    await page.waitForTimeout(400);
    const sigueAbierto = await page.locator('[role="dialog"]').count();
    log(`  tras pulsar Intro el formulario sigue abierto: ${sigueAbierto > 0}`);

    // Agregar un conocimiento técnico
    const agregar = page.getByRole("button", { name: /^Agregar$/ });
    log(`  botones «Agregar»: ${await agregar.count()}`);
    if (await agregar.count()) {
      await agregar.first().click();
      await page.waitForTimeout(400);
      const nombreCon = page.locator('input[placeholder="Nombre del Conocimiento Técnico"]');
      if (await nombreCon.count()) {
        await nombreCon.first().type("Contabilidad de costos", { delay: 30 });
        log(`  texto escrito en el conocimiento: «${await nombreCon.first().inputValue()}»`);
      } else {
        problemas.push({ tipo: "postulantes", text: "No apareció el campo del conocimiento técnico" });
      }
    }
    await shot(page, "formulario-lleno");

    // Guardar
    const guardar = page.getByRole("button", { name: /Registrar Postulante/i });
    await guardar.first().click();
    await page.waitForTimeout(2500);
    await shot(page, "tras-guardar");
    const abiertoAun = await page.locator('[role="dialog"]').count();
    log(`  modal tras guardar (0 = se cerró): ${abiertoAun}`);
    const aviso = await page.locator('[role="dialog"], body').getByText(/correctamente|falló|localmente/i).first().textContent().catch(() => null);
    log(`  mensaje: ${aviso}`);
  } else {
    problemas.push({ tipo: "postulantes", text: "No se encontró el campo Identificador Único" });
  }

  // ¿Llegó al backend?
  if (escenario !== "red-caida") {
    const posts = await (await fetch(MOCK + "/__posts")).json();
    const nuevos = posts.filter((p) => p && p.identificador === "1234567-107-2026");
    log(`  POST recibidos por el backend con ese identificador: ${nuevos.length}`);
    if (nuevos.length === 0) problemas.push({ tipo: "postulantes", text: "El registro nunca llegó al backend" });
  }

  await page.waitForTimeout(1500);
  await shot(page, "final");

  // ---- Resumen ----
  log(`\n===== ${problemas.length} incidencia(s) en «${escenario}» =====`);
  const agrupado = new Map();
  for (const p of problemas) {
    const clave = `${p.tipo} :: ${p.text.slice(0, 180)}`;
    agrupado.set(clave, (agrupado.get(clave) ?? 0) + 1);
  }
  for (const [k, n] of agrupado) log(`  ${n}× ${k}`);

  await browser.close();
};

main().catch((e) => {
  console.error("FALLO DEL ARNÉS:", e);
  process.exit(1);
});
