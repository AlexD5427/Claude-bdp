/**
 * Arnés de QA del sistema BDP.
 *
 * Levanta el build de producción con un backend de Apps Script simulado y
 * recorre la aplicación con un navegador real, como lo haría una persona de QA:
 * inicia sesión, agrega postulantes a la comparativa, llena el cuestionario,
 * provoca fallos del servidor y comprueba lo que la interfaz dice y hace.
 *
 * Uso:
 *   node scripts/qa/run.mjs                  # toda la batería
 *   node scripts/qa/run.mjs --filter=postul  # sólo los escenarios que coincidan
 *   node scripts/qa/run.mjs --headed         # con navegador visible
 *   node scripts/qa/run.mjs --shots=/tmp/qa  # dónde dejar las capturas
 *
 * Requisitos: `npm i -D playwright && npx playwright install chromium`.
 * El arnés NO toca el libro real: todas las llamadas a script.google.com se
 * interceptan en el navegador.
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { serveDist } from "./server.mjs";
import { createBackend } from "./backend.mjs";
import { candidatos, payload, relleno } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const FILTER = flag("filter");
const HEADED = args.includes("--headed");
const SHOTS = flag("shots", "/tmp/qa-bdp");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error(
    "No se encontró Playwright. Instálelo con:\n  npm i -D playwright && npx playwright install chromium",
  );
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Utilidades de escenario                                             */
/* ------------------------------------------------------------------ */

const PERFIL = "administrador";

/** Prepara una pestaña ya autenticada, con almacenamiento sembrado a voluntad. */
async function openApp(browser, baseUrl, backend, seed = {}) {
  const context = await browser.newContext({
    viewport: seed.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: seed.reducedMotion ?? "reduce",
  });
  await backend.install(context);

  const problems = [];
  context.on("weberror", (e) => problems.push(`pageerror: ${e.error().message}`));

  await context.addInitScript(
    ({ perfil, session, local }) => {
      // `addInitScript` también corre en `about:blank`, donde el almacenamiento
      // y las cookies están prohibidos; ahí no hay nada que sembrar.
      if (!location.protocol.startsWith("http")) return;
      // `perfil: null` deja la aplicación en la pantalla de acceso, que es la
      // única vía por la que se aplica la configuración guardada del perfil.
      if (perfil) document.cookie = `bdp_perfil_sesion=${perfil}; path=/`;
      for (const [k, v] of Object.entries(session ?? {})) {
        window.sessionStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      }
      for (const [k, v] of Object.entries(local ?? {})) {
        window.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      }
    },
    {
      perfil: seed.perfil === null ? null : (seed.perfil ?? PERFIL),
      session: seed.session,
      local: seed.local,
    },
  );

  if (seed.blockStorage) {
    // Emula un equipo con el almacenamiento del sitio bloqueado (política de
    // empresa, cookies bloqueadas, modo privado de Safari). En esos navegadores
    // *acceder* a `localStorage` lanza; no basta con que falle `setItem`.
    await context.addInitScript(() => {
      const boom = () => {
        throw new DOMException(
          "Access is denied for this document.",
          "SecurityError",
        );
      };
      Object.defineProperty(window, "localStorage", { get: boom, configurable: true });
      Object.defineProperty(window, "sessionStorage", { get: boom, configurable: true });
    });
  }

  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      problems.push(`console.${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  // Si la aplicación se queda en blanco NO se aborta el escenario: es
  // justamente lo que algunos escenarios quieren medir.
  await page
    .waitForSelector(seed.perfil === null ? "text=Reclutamiento y Selección" : "main", {
      timeout: seed.bootTimeout ?? 15000,
    })
    .catch(() => {});
  return { context, page, problems };
}

async function goModule(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(350);
}

/**
 * Añade un postulante a la comparativa por su nombre.
 *
 * Se espera a que la sugerencia **con ese nombre** esté visible antes de pulsar:
 * la lista se abre con todos los candidatos y el filtrado ocurre un dibujado
 * después, así que pulsar "la primera" agregaría a quien no toca.
 */
async function addToComparator(page, text) {
  const input = buscadorComparador(page);
  await input.click();
  await input.fill(text);
  // El listado de sugerencias es `#candidate-listbox`; el `role=option` a secas
  // también engancharía los <option> de los filtros superiores.
  const option = page
    .locator('#candidate-listbox [role="option"]')
    .filter({ hasText: text })
    .first();
  await option.waitFor({ state: "visible", timeout: 5000 });
  await option.click();
  await page.waitForTimeout(250);
}

/**
 * Pestaña del comparador. Se busca **dentro de `main`** porque «Configuración»
 * también es un botón del dock: hacer clic en el del dock cambiaba de módulo y
 * la prueba buscaba interruptores en la pantalla equivocada.
 */
const pestanaComparador = (page, nombre) =>
  page.locator(`main button:has-text("${nombre}")`).first();

/** El buscador del comparador, por su nombre accesible (estable). */
const buscadorComparador = (page) =>
  page.getByRole("combobox", { name: "Buscar postulantes para comparar" });

const check = (list, ok, label, detail = "") => {
  list.push({ ok: Boolean(ok), label, detail: String(detail).slice(0, 400) });
};

/* ------------------------------------------------------------------ */
/* Escenarios                                                          */
/* ------------------------------------------------------------------ */

const scenarios = [];
/**
 * Declara un escenario. `seed` siembra el almacenamiento del navegador
 * (sessionStorage / localStorage / cookie de perfil) y el viewport, que es la
 * forma de reproducir "el equipo de esa persona" sin tocar el código.
 */
const scenario = (name, title, run, seed = {}) =>
  scenarios.push({ name, title, run, seed });

scenario("smoke-modulos", "Los diez módulos abren sin errores de consola", async (ctx) => {
  const { page, problems, checks, shot } = ctx;
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
  for (const m of modulos) {
    await goModule(page, m);
    const heading = await page.locator("main h2").first().textContent();
    check(checks, (heading ?? "").trim() === m, `Módulo «${m}» se dibuja`, heading);
    const boundary = await page.getByText("Ocurrió un error inesperado").count();
    check(checks, boundary === 0, `Módulo «${m}» sin frontera de error`);
  }
  await shot("smoke");
  check(checks, problems.length === 0, "Sin errores/avisos de consola", problems.join(" | "));
});

scenario("comparador-agregar", "Comparativa: agregar, ranking y desempate", async (ctx) => {
  const { page, checks, problems, shot } = ctx;
  await goModule(page, "Comparador");
  check(
    checks,
    await page.getByText("Comienza tu comparación").isVisible(),
    "Arranca vacío con la invitación",
  );

  await addToComparator(page, "Andrea");
  await addToComparator(page, "María Fernanda");
  await addToComparator(page, "Jorge");

  const columns = await page.locator('[role="columnheader"]').count();
  check(checks, columns === 4, "Tres columnas + rótulo", `columnheaders=${columns}`);

  // Los tres empatan a 88 de CAP salvo el duplicado (91): el orden por mérito
  // debe ser Jorge (IDD 85.25) → Andrea (83.15) → María Fernanda (80.95).
  const names = await page.locator('[role="columnheader"] h3').allTextContents();
  check(
    checks,
    names.join(" | ").startsWith("JORGE LUIS MAMANI QUISPE"),
    "El desempate deja a Jorge primero",
    names.join(" | "),
  );
  const desempate = await page.getByText(/Desempate/).count();
  check(checks, desempate > 0, "Se avisa del desempate en la fila de ranking");

  await shot("comparativa");
  check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
});

scenario("comparador-sesion", "La comparación sobrevive al cambio de módulo", async (ctx) => {
  const { page, checks } = ctx;
  await goModule(page, "Comparador");
  await addToComparator(page, "Andrea");
  await goModule(page, "Dashboard");
  await goModule(page, "Comparador");
  const chip = await page.getByText("1 en comparación").count();
  check(checks, chip === 1, "Vuelve con el candidato agregado");
});

scenario(
  "comparador-ids-huerfanos",
  "Sesión con identificadores que ya no existen en la hoja",
  async (ctx) => {
    const { page, checks, shot } = ctx;
    await goModule(page, "Comparador");
    const placeholder = await buscadorComparador(page).getAttribute("placeholder");
    const disabled = await buscadorComparador(page).isDisabled();
    check(
      checks,
      !disabled,
      "El buscador sigue disponible pese a los identificadores huérfanos",
      `placeholder=${placeholder}`,
    );
    const contador = await page.getByText(/^\d+\/\d+$/).first().textContent();
    check(
      checks,
      contador?.startsWith("0/"),
      "El contador refleja los candidatos reales, no los huérfanos",
      contador ?? "",
    );
    await addToComparator(page, "Andrea");
    check(
      checks,
      (await page.locator('[role="columnheader"]').count()) === 2,
      "Se puede agregar a alguien con la sesión sucia",
    );
    await shot("ids-huerfanos");
  },
  {
    session: {
      "bdp-comparador-session": {
        selectedIds: [
          "borrado-1",
          "borrado-2",
          "borrado-3",
          "borrado-4",
          "borrado-5",
          "borrado-6",
          "borrado-7",
          "borrado-8",
          "borrado-9",
          "borrado-10",
        ],
      },
    },
  },
);

scenario(
  "comparador-config-corrupta",
  "Configuración heredada con un máximo de columnas imposible",
  async (ctx) => {
    const { page, checks, shot } = ctx;
    await goModule(page, "Comparador");
    const input = buscadorComparador(page);
    check(checks, !(await input.isDisabled()), "El buscador no queda bloqueado");
    await addToComparator(page, "Jorge");
    check(
      checks,
      (await page.locator('[role="columnheader"]').count()) >= 2,
      "Se puede comparar con la configuración saneada",
    );
    await shot("config-corrupta");
  },
  {
    local: {
      "bdp-config": { maxComparador: 0, capApprovalThreshold: 900, dockPosition: "arriba" },
      "bdp-perfil-cfg-administrador": {
        appConfig: { maxComparador: 0, autoRefreshSeconds: 1, rankPlacement: "izquierda" },
      },
    },
  },
);

scenario("postulantes-alta-ok", "Alta de postulante aceptada por el servidor", async (ctx) => {
  const { page, checks, backend, shot } = ctx;
  await goModule(page, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.getByPlaceholder("CI - Nro Proceso - Año").fill("1234567-999-2026");
  await page.getByPlaceholder("Nombres").fill("Camila");
  await page.getByPlaceholder("Apellido Paterno").fill("Ticona");
  await page.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1200);

  const escrituras = backend.candidateWrites();
  check(checks, escrituras.length === 1, "Se envió exactamente una escritura", JSON.stringify(escrituras.map((e) => e.identificador)));
  check(
    checks,
    escrituras[0]?.identificador === "1234567-999-2026",
    "El identificador llega íntegro",
  );
  check(
    checks,
    (await page.getByRole("dialog").count()) === 0,
    "El cuestionario se cierra tras guardar",
  );
  await page.waitForTimeout(600);
  check(
    checks,
    (await page.getByText("Camila Ticona").count()) > 0,
    "El postulante aparece en el listado",
  );
  await shot("alta-ok");
});

scenario(
  "postulantes-alta-rechazada",
  "El servidor rechaza el alta (identificador duplicado)",
  async (ctx) => {
    const { page, checks, backend, shot } = ctx;
    backend.setMode("rejected");
    await goModule(page, "Postulantes");
    await page.getByRole("button", { name: "Nuevo Postulante" }).click();
    await page.getByPlaceholder("CI - Nro Proceso - Año").fill("5033853-163-2026");
    await page.getByPlaceholder("Nombres").fill("Duplicado");
    await page.getByRole("button", { name: /Registrar Postulante/ }).click();
    await page.waitForTimeout(1200);

    const dialogAbierto = (await page.getByRole("dialog").count()) > 0;
    check(checks, dialogAbierto, "El cuestionario NO se cierra tras un rechazo");
    const dijoExito = (await page.getByText(/registrado correctamente/).count()) > 0;
    check(checks, !dijoExito, "No se anuncia un éxito que no ocurrió");
    const mostroMotivo = (await page.getByText(/identificador ya existe/i).count()) > 0;
    check(checks, mostroMotivo, "Se muestra el motivo del rechazo del servidor");
    await shot("alta-rechazada");
  },
);

scenario("postulantes-alta-sin-red", "Alta sin red (proxy o corte)", async (ctx) => {
  const { page, checks, backend, shot } = ctx;
  backend.setMode("offline");
  await goModule(page, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.getByPlaceholder("CI - Nro Proceso - Año").fill("7777777-999-2026");
  await page.getByPlaceholder("Nombres").fill("Fantasma");
  await page.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1500);

  check(
    checks,
    (await page.getByRole("dialog").count()) > 0,
    "El cuestionario se mantiene abierto con el avance",
  );
  check(
    checks,
    (await page.getByText(/no se pudo|falló|sin conexión/i).count()) > 0,
    "Se explica que no se pudo guardar",
  );
  // Una fila fantasma es peor que un error: desaparece al refrescar.
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: /Salir/ }).click().catch(() => {});
  await page.waitForTimeout(400);
  const fantasmaVisible = (await page.getByText("Fantasma").count()) > 0;
  check(checks, !fantasmaVisible, "No queda una fila fantasma en el listado");
  await shot("alta-sin-red");
});

scenario(
  "postulantes-base-rezagada",
  "La hoja tarda en devolver la fila recién escrita",
  async (ctx) => {
    const { page, checks, backend, shot } = ctx;
    backend.setStale(3); // los tres GET siguientes NO traen la fila nueva
    await goModule(page, "Postulantes");
    await page.getByRole("button", { name: "Nuevo Postulante" }).click();
    await page.getByPlaceholder("CI - Nro Proceso - Año").fill("2468101-999-2026");
    await page.getByPlaceholder("Nombres").fill("Rezagada");
    await page.getByRole("button", { name: /Registrar Postulante/ }).click();
    await page.waitForTimeout(1500);
    check(
      checks,
      (await page.getByText("Rezagada").count()) > 0,
      "La ficha sigue visible aunque la hoja aún no la devuelva",
    );
    // Y sigue estando tras un refresco manual.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("main");
    await goModule(page, "Postulantes");
    await page.waitForTimeout(800);
    check(
      checks,
      (await page.getByText("Rezagada").count()) > 0,
      "Tampoco se pierde al recargar la página",
    );
    await shot("base-rezagada");
  },
);

scenario("postulantes-intro", "Intro en el cuestionario no envía la ficha", async (ctx) => {
  const { page, checks, backend } = ctx;
  await goModule(page, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  const id = page.getByPlaceholder("CI - Nro Proceso - Año");
  await id.fill("9999999-999-2026");
  await id.press("Enter");
  await page.getByPlaceholder("Nombres").fill("Ana");
  await page.getByPlaceholder("Nombres").press("Enter");
  await page.waitForTimeout(500);
  check(checks, backend.candidateWrites().length === 0, "Ningún envío accidental");
  check(
    checks,
    (await page.getByRole("dialog").count()) > 0,
    "El cuestionario sigue abierto",
  );
  check(
    checks,
    (await id.inputValue()) === "9999999-999-2026",
    "El avance permanece intacto",
  );
});

scenario(
  "postulantes-duplicado-aviso",
  "Aviso al escribir un identificador que ya existe",
  async (ctx) => {
    const { page, checks, backend, shot } = ctx;
    await goModule(page, "Postulantes");
    await page.getByRole("button", { name: "Nuevo Postulante" }).click();
    await page.getByPlaceholder("CI - Nro Proceso - Año").fill("7841299-163-2026");
    await page.waitForTimeout(400);
    check(
      checks,
      (await page.getByText(/Ya existe un registro con este identificador/).count()) === 1,
      "Se avisa del identificador repetido al escribirlo",
    );
    // El aviso no bloquea: registrar sigue siendo posible (a veces es a propósito).
    check(
      checks,
      await page.getByRole("button", { name: /Registrar Postulante/ }).isEnabled(),
      "El aviso no impide registrar",
    );
    await shot("duplicado-aviso");

    // Y editar una ficha con identificador repetido se detiene antes de escribir.
    await page.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: /^Salir$/ }).click().catch(() => {});
    await page.waitForTimeout(300);
    const chapas = await page.getByText("Identificador repetido").count();
    check(
      checks,
      chapas === 2,
      "Las dos fichas homónimas quedan señaladas en el listado",
      `chapas=${chapas}`,
    );
    const tarjeta = page
      .locator("main .grid > div")
      .filter({ hasText: "Jorge Luis Mamani Quispe" })
      .nth(1);
    await tarjeta.getByRole("button", { name: /Editar a Jorge/ }).click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("Localidad").fill("Viacha");
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Guardar Cambios/ }).click();
    await page.waitForTimeout(800);
    check(
      checks,
      (await page.getByText(/filas con el identificador/).count()) > 0,
      "Se explica por qué no se puede guardar sobre un duplicado",
    );
    check(
      checks,
      backend.candidateWrites().filter((w) => w.action === "update").length === 0,
      "No se escribió nada en la hoja",
    );
  },
);

scenario(
  "comparador-duplicados",
  "Dos filas de la hoja con el mismo identificador",
  async (ctx) => {
    const { page, checks, shot } = ctx;
    await goModule(page, "Comparador");
    const input = buscadorComparador(page);
    await input.click();
    await input.fill("Jorge");
    const antes = await page.locator('#candidate-listbox [role="option"]').count();
    check(checks, antes === 2, "La hoja ofrece las dos fichas homónimas", `opciones=${antes}`);
    await page.locator('#candidate-listbox [role="option"]').first().click();
    await page.waitForTimeout(300);

    await input.fill("Jorge");
    await page.waitForTimeout(300);
    const despues = await page.locator('#candidate-listbox [role="option"]').count();
    check(
      checks,
      despues === 1,
      "La segunda ficha sigue disponible tras agregar la primera",
      `opciones=${despues}`,
    );
    if (despues === 1) {
      await page.locator('#candidate-listbox [role="option"]').first().click();
      await page.waitForTimeout(300);
    }
    const columnas = await page.locator('[role="columnheader"]').count();
    check(checks, columnas === 3, "Las dos fichas se comparan a la vez", `columnas=${columnas}`);
    const caps = await page.locator(".cmp-grid").getByText(/^9?8?[0-9]%$/).allTextContents();
    check(
      checks,
      caps.join(",").includes("91%"),
      "Se ve la Nota CAP de la segunda ficha (91 %)",
      caps.join(","),
    );
    await shot("duplicados");
  },
);

scenario(
  "login-config-heredada",
  "Configuración personal corrupta guardada en la hoja",
  async (ctx) => {
    const { page, checks, shot } = ctx;
    // Acceso real: es al iniciar sesión cuando se aplica la configuración del
    // perfil que viaja en la hoja (y por eso el fallo sigue a la persona de un
    // equipo a otro, mientras a los demás todo les funciona).
    await page.getByRole("button", { name: /Administrador/ }).first().click();
    await page.getByPlaceholder("Contraseña").fill("1234");
    await page.getByRole("button", { name: /Iniciar sesión/ }).click();
    await page.waitForSelector("main", { timeout: 15000 });
    await page.waitForTimeout(600);

    await goModule(page, "Comparador");
    const input = buscadorComparador(page);
    const placeholder = await input.getAttribute("placeholder");
    check(
      checks,
      !(await input.isDisabled()),
      "El buscador no queda bloqueado por la configuración heredada",
      `placeholder=${placeholder}`,
    );
    await addToComparator(page, "Andrea");
    check(
      checks,
      (await page.locator('[role="columnheader"]').count()) === 2,
      "Se puede comparar tras heredar una configuración corrupta",
    );
    check(
      checks,
      (await page.getByRole("button", { name: "Postulantes", exact: true }).count()) > 0,
      "El dock sobrevive a un tamaño inválido",
    );
    await goModule(page, "Configuración");
    check(
      checks,
      (await page.getByText("Ocurrió un error inesperado").count()) === 0,
      "Configuración se dibuja con valores fuera de rango",
    );
    await shot("config-heredada");
  },
  {
    perfil: null,
    payloadExtra: {
      perfiles: [
        {
          nombre_perfil: "Administrador",
          cargo_perfil: "Administración del Sistema",
          tiene_password: true,
          datos_perfil: JSON.stringify({ role: "admin", avatar: "admin" }),
        },
      ],
    },
    backend: {
      loginConfig: JSON.stringify({
        theme: "dark",
        appConfig: {
          maxComparador: 0,
          capApprovalThreshold: 1200,
          autoRefreshSeconds: 0,
          rankPlacement: "izquierda",
          dockPosition: "arriba",
          // Un tamaño de dock inválido tumbaba la aplicación entera: el dock lee
          // `SIZE[dockSize]` y vive por encima de toda frontera de error.
          dockSize: "gigante",
          emailTemplates: "esto no es una lista",
        },
        layout: [null, { id: "inexistente" }],
      }),
    },
  },
);

scenario(
  "almacenamiento-bloqueado",
  "Equipo con el almacenamiento del sitio bloqueado",
  async (ctx) => {
    const { page, checks, problems, shot } = ctx;
    // Sin cookies no hay sesión: la aplicación debe, al menos, dibujar el acceso
    // en lugar de quedarse en blanco.
    const arranco =
      (await page.getByText("Reclutamiento y Selección").count()) > 0 ||
      (await page.locator("main").count()) > 0;
    check(checks, arranco, "La aplicación arranca (no se queda en blanco)");
    const vacio = await page.evaluate(
      () => (document.getElementById("root")?.childElementCount ?? 0) === 0,
    );
    check(checks, !vacio, "El árbol de React se montó");
    await shot("almacenamiento-bloqueado");
    const fatales = problems.filter((p) => p.startsWith("pageerror"));
    check(checks, fatales.length === 0, "Sin excepciones fatales", fatales.join(" | "));
  },
  { perfil: null, blockStorage: true, bootTimeout: 4000 },
);

scenario("comparador-graficos", "Pestaña de gráficos", async (ctx) => {
  const { page, checks, problems, shot } = ctx;
  await goModule(page, "Comparador");
  await addToComparator(page, "Jorge");
  await addToComparator(page, "Andrea");
  await pestanaComparador(page, "Gráficos").click();
  await page.waitForTimeout(500);
  check(
    checks,
    (await page.getByText("Generador de gráficos").count()) === 1,
    "Se abre el generador",
  );
  for (const tipo of ["Barras H.", "Líneas", "Radar", "Dona", "Barras"]) {
    await page.getByRole("button", { name: tipo, exact: true }).first().click();
    await page.waitForTimeout(250);
    const svgs = await page.locator("svg").count();
    check(checks, svgs > 0, `El gráfico «${tipo}» se dibuja`);
  }
  await shot("graficos");
  check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
});

scenario("comparador-config", "Pestaña de configuración de la comparativa", async (ctx) => {
  const { page, checks, problems, shot } = ctx;
  await goModule(page, "Comparador");
  await addToComparator(page, "Jorge");
  await pestanaComparador(page, "Configuración").click();
  await page.waitForTimeout(400);

  // Apagar una fila la retira de la comparativa; «mostrar las ocultas» la trae.
  // Los interruptores son `role=switch` cuyo nombre accesible incluye el
  // subtítulo, así que se busca por su rótulo interno.
  const filaDisc = page
    .getByRole("switch")
    .filter({ hasText: "Perfil DISC" })
    .first();
  await filaDisc.waitFor({ state: "visible", timeout: 8000 });
  await filaDisc.click();
  await page.waitForTimeout(300);

  await pestanaComparador(page, "Comparativa").click();
  await page.waitForTimeout(400);
  const sinDisc = (await page.locator('[role="rowheader"]').getByText("Perfil DISC").count()) === 0;
  check(checks, sinDisc, "La fila apagada desaparece de la comparativa");

  await pestanaComparador(page, "Configuración").click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Mostrar la|Mostrar las/ }).first().click();
  await pestanaComparador(page, "Comparativa").click();
  await page.waitForTimeout(400);
  check(
    checks,
    (await page.locator('[role="rowheader"]').getByText("Perfil DISC").count()) === 1,
    "«Mostrar las ocultas» la devuelve",
  );
  await shot("config-filas");
  check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
});

scenario(
  "comparador-lleno",
  "Comparativa a tope de columnas (10)",
  async (ctx) => {
    const { page, checks, problems, shot } = ctx;
    await goModule(page, "Comparador");
    const input = buscadorComparador(page);
    for (let i = 0; i < 10; i += 1) {
      await input.click();
      await input.fill(`Apellido${i}`);
      const opt = page.locator('#candidate-listbox [role="option"]').first();
      await opt.waitFor({ state: "visible", timeout: 5000 });
      await opt.click();
      await page.waitForTimeout(120);
    }
    void input;
    const columnas = await page.locator('[role="columnheader"]').count();
    check(checks, columnas === 11, "Diez columnas más el rótulo", `columnheaders=${columnas}`);
    const bloqueado = await buscadorComparador(page).isDisabled();
    check(checks, bloqueado, "Con el tope alcanzado el buscador avisa y se apaga");
    check(
      checks,
      (await page.getByRole("button", { name: /Vaciar/ }).count()) > 0,
      "Hay una salida visible para vaciar la comparación",
    );

    // La tira congelada aparece al desplazarse y el dock se aparta.
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(700);
    const tira = await page.locator(".cmp-strip-scroll").isVisible();
    check(checks, tira, "La tira congelada de nombres aparece al bajar");
    const dpad = await page.getByRole("button", { name: "Desplazar a la derecha" }).count();
    check(checks, dpad > 0, "El ayudante de navegación está disponible");
    await shot("diez-columnas");

    // Y se puede vaciar de un golpe desde el propio buscador.
    await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /Vaciar/ }).click();
    await page.waitForTimeout(400);
    check(
      checks,
      (await page.getByText("Comienza tu comparación").count()) === 1,
      "Vaciar devuelve la comparación a su estado inicial",
    );
    check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
  },
  { payloadExtra: { candidatos: [...candidatos(), ...relleno(12)] } },
);

scenario("postulantes-editar", "Edición de un postulante existente", async (ctx) => {
  const { page, checks, backend, shot } = ctx;
  await goModule(page, "Postulantes");
  const tarjeta = page.locator("main .grid > div").filter({ hasText: "Andrea Villarroel" }).first();
  await tarjeta.getByRole("button", { name: /Editar a Andrea/ }).click();
  await page.waitForTimeout(600);

  const id = page.getByPlaceholder("CI - Nro Proceso - Año");
  check(checks, await id.evaluate((el) => el.readOnly), "El identificador queda bloqueado");
  const guardar = page.getByRole("button", { name: /Guardar Cambios/ });
  check(checks, await guardar.isDisabled(), "Sin cambios no hay nada que guardar");

  const localidad = page.getByPlaceholder("Localidad");
  await localidad.fill("Quillacollo");
  await page.waitForTimeout(300);
  check(checks, await guardar.isEnabled(), "Con un cambio se habilita el guardado");
  check(
    checks,
    (await page.getByText(/campo\(s\) modificado/).count()) > 0,
    "Se anuncia cuántos campos cambiaron",
  );
  await guardar.click();
  await page.waitForTimeout(1200);

  const updates = backend.candidateWrites().filter((w) => w.action === "update");
  check(checks, updates.length === 1, "Se envió una sola edición", JSON.stringify(updates.map((u) => u.identificador)));
  check(
    checks,
    updates[0]?.localidad_residencia === "Quillacollo",
    "El cambio viaja al backend",
    JSON.stringify(updates[0]?.localidad_residencia),
  );
  await page.waitForTimeout(600);
  check(
    checks,
    (await page.getByRole("dialog").count()) === 0,
    "El cuestionario se cierra tras guardar",
  );
  await shot("editar");
});

scenario("velocimetro", "Velocímetros: escribir y borrar una nota", async (ctx) => {
  const { page, checks, backend, shot } = ctx;
  await goModule(page, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.getByPlaceholder("CI - Nro Proceso - Año").fill("3141592-999-2026");

  const cap = page.getByLabel("Nota CAP (porcentaje)");
  await cap.fill("87");
  await page.waitForTimeout(200);
  check(checks, (await cap.inputValue()) === "87", "El número escrito queda en el velocímetro");

  // Borrar debe devolver la nota a «sin evaluar», no a 0 %.
  await cap.fill("");
  await page.waitForTimeout(200);
  await page.getByPlaceholder("Nombres").click();
  await page.waitForTimeout(200);
  check(checks, (await cap.inputValue()) === "", "Se puede dejar la nota sin evaluar");

  await page.getByLabel("Nota Currículum (porcentaje)").fill("70");
  await page.getByRole("button", { name: /Registrar Postulante/ }).click();
  await page.waitForTimeout(1200);
  const escritura = backend.candidateWrites()[0];
  check(checks, escritura?.nota_cap === "", "La nota borrada se guarda vacía, no como 0", `nota_cap=${JSON.stringify(escritura?.nota_cap)}`);
  check(checks, escritura?.nota_curriculum === 70, "La nota puesta se guarda como número", `nota_curriculum=${JSON.stringify(escritura?.nota_curriculum)}`);
  await shot("velocimetro");
});

scenario("postulantes-borrador", "Recuperación del borrador del cuestionario", async (ctx) => {
  const { page, checks, shot } = ctx;
  await goModule(page, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.getByPlaceholder("CI - Nro Proceso - Año").fill("2718281-999-2026");
  await page.getByPlaceholder("Nombres").fill("Borrador");
  await page.waitForTimeout(800); // autoguardado (400 ms de espera)

  // Salir con aviso, recargar y volver: el avance debe ofrecerse.
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: /^Salir$/ }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main");
  await goModule(page, "Postulantes");
  await page.getByRole("button", { name: "Nuevo Postulante" }).click();
  await page.waitForTimeout(600);
  check(
    checks,
    (await page.getByText("Registro encontrado").count()) === 1,
    "Se ofrece recuperar el borrador",
  );
  await page.getByRole("button", { name: /Abrir avance/ }).click();
  await page.waitForTimeout(400);
  check(
    checks,
    (await page.getByPlaceholder("Nombres").inputValue()) === "Borrador",
    "El avance vuelve completo",
  );
  await shot("borrador");
});

scenario(
  "impresion-ambito",
  "Dos impresiones seguidas no se contaminan",
  async (ctx) => {
    const { page, checks } = ctx;
    // Se anula `window.print` (en un navegador sin interfaz el diálogo no existe)
    // y, sobre todo, NO se emite `afterprint`: así se reproduce el navegador que
    // no avisa al cancelar.
    await page.addInitScript(() => {
      window.print = () => {};
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("main");

    await goModule(page, "Comparador");
    await addToComparator(page, "Jorge");
    await page.getByRole("button", { name: /Imprimir/ }).click();
    await page.waitForTimeout(400);
    const tras1 = await page.evaluate(() => [...document.body.classList]);
    check(
      checks,
      tras1.includes("bdp-scope-comparador"),
      "La comparativa aplica su ámbito de impresión",
      tras1.join(" "),
    );

    await goModule(page, "Postulantes");
    await page.getByRole("button", { name: /^Imprimir$/ }).click();
    await page.waitForTimeout(400);
    const tras2 = await page.evaluate(() => [...document.body.classList]);
    check(
      checks,
      !tras2.some((c) => c.startsWith("bdp-scope-")),
      "La impresión siguiente no hereda el ámbito anterior",
      tras2.join(" "),
    );
    const banners = await page.locator("#bdp-print-header").count();
    check(checks, banners === 1, "Un solo encabezado de reporte en el documento", `${banners}`);
  },
);

scenario(
  "procesos-movil",
  "Procesos en un teléfono no desborda a lo ancho",
  async (ctx) => {
    const { page, checks, problems, shot } = ctx;
    await goModule(page, "Procesos");
    await page.waitForTimeout(900);
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(checks, desborde <= 2, "Sin desplazamiento horizontal de la página", `desborde=${desborde}px`);
    await shot("procesos-movil");
    check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
  },
  { viewport: { width: 390, height: 844 } },
);

scenario("comparador-movil", "Comparativa en un teléfono (390×844)", async (ctx) => {
  const { page, checks, problems, shot } = ctx;
  await goModule(page, "Comparador");
  await addToComparator(page, "Jorge");
  await addToComparator(page, "Andrea");
  const scroller = page.locator(".cmp-scroll");
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  check(checks, overflow >= 0, "La cuadrícula se desplaza en horizontal", `overflow=${overflow}`);
  const doc = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(checks, doc <= 2, "La página no desborda a lo ancho", `desborde=${doc}`);
  await shot("movil");
  check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
}, { viewport: { width: 390, height: 844 } });

scenario("impresion-comparador", "Impresión de la comparativa", async (ctx) => {
  const { page, checks, problems, shot } = ctx;
  await goModule(page, "Comparador");
  await addToComparator(page, "Jorge");
  await addToComparator(page, "Andrea");
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);
  const recortadas = await page.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll(".cmp-clip")) {
      if (el.scrollHeight - el.clientHeight > 4) n += 1;
    }
    return n;
  });
  check(checks, recortadas === 0, "Ninguna celda esconde texto en papel", `recortadas=${recortadas}`);
  await shot("impresion");
  await page.emulateMedia({ media: "screen" });
  check(checks, problems.length === 0, "Sin errores de consola al imprimir", problems.join(" | "));
});

scenario(
  "rendimiento",
  "Medición de rendimiento (comparativa llena y tecleo en el cuestionario)",
  async (ctx) => {
    const { page, checks, shot } = ctx;

    // 1 · Diez columnas: cuánto tarda en quedar dibujada la comparativa.
    await goModule(page, "Comparador");
    const input = buscadorComparador(page);
    for (let i = 0; i < 10; i += 1) {
      await input.click();
      await input.fill(`Apellido${i}`);
      const opt = page.locator('#candidate-listbox [role="option"]').first();
      await opt.waitFor({ state: "visible", timeout: 5000 });
      await opt.click();
    }
    await page.waitForTimeout(600);
    const pintado = await page.evaluate(async () => {
      const t0 = performance.now();
      document.querySelector(".cmp-grid")?.getBoundingClientRect();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return performance.now() - t0;
    });
    check(checks, pintado < 200, `Dos fotogramas con 10 columnas: ${pintado.toFixed(1)} ms`, `${pintado}`);

    const celdas = await page.locator('[role="cell"]').count();
    check(checks, celdas > 100, `Celdas dibujadas: ${celdas}`);

    // 2 · Tecleo en el cuestionario con la sección A llena.
    await goModule(page, "Postulantes");
    await page.getByRole("button", { name: "Nuevo Postulante" }).click();
    await page.getByPlaceholder("CI - Nro Proceso - Año").fill("1111111-999-2026");
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole("button", { name: /^Agregar$/ }).first().click();
      await page.waitForTimeout(120);
    }
    const detalle = page.getByPlaceholder("Detalle (opcional)").first();
    await detalle.click();
    const frase = "Analisis de cartera y seguimiento de mora temprana";
    const t0 = Date.now();
    await detalle.type(frase, { delay: 0 });
    const porCaracter = (Date.now() - t0) / frase.length;
    check(
      checks,
      porCaracter < 25,
      `Tecleo en el detalle: ${porCaracter.toFixed(2)} ms/carácter`,
      `${porCaracter}`,
    );
    check(
      checks,
      (await detalle.inputValue()) === frase,
      "No se pierde ningún carácter al escribir",
    );
    await shot("rendimiento");
  },
  { payloadExtra: { candidatos: [...candidatos(), ...relleno(12)] } },
);

scenario("datos-sucios", "Filas corruptas de la hoja no rompen nada", async (ctx) => {
  const { page, checks, problems, shot } = ctx;
  await goModule(page, "Postulantes");
  const tarjetas = await page.locator("main .grid > div").count();
  check(checks, tarjetas > 0, "El listado se dibuja con datos sucios", `tarjetas=${tarjetas}`);
  check(
    checks,
    (await page.getByText("Postulante Sin Nombre").count()) > 0,
    "La fila sin nombre usa el rótulo de reserva",
  );
  await goModule(page, "Comparador");
  await addToComparator(page, "Pedro");
  check(
    checks,
    (await page.getByText("Ocurrió un error inesperado").count()) === 0,
    "El JSON corrupto de competencias no tumba el comparador",
  );
  await shot("datos-sucios");
  const duplicados = problems.filter((p) => /same key|duplicate key/i.test(p));
  check(checks, duplicados.length === 0, "Sin claves duplicadas de React", duplicados.join(" | "));
  check(checks, problems.length === 0, "Sin errores de consola", problems.join(" | "));
});

/* ------------------------------------------------------------------ */
/* Corredor                                                            */
/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  // El arnés prueba el *build de producción*. Si no existe —o si se pide con
  // `--build`— se genera aquí: probar un `dist` viejo es la forma más fácil de
  // "verificar" un arreglo que en realidad no está.
  const dist = join(ROOT, "dist");
  if (args.includes("--build") || !existsSync(join(dist, "index.html"))) {
    console.log("Generando el build de producción…");
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  }

  const server = await serveDist(dist);
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const selected = scenarios.filter((s) => !FILTER || s.name.includes(FILTER));
  const results = [];

  for (const s of selected) {
    const seed = s.seed ?? {};
    const backend = createBackend({ payload: payload(seed.payloadExtra), ...(seed.backend ?? {}) });
    const checks = [];
    let ctx;
    const t0 = Date.now();
    try {
      ctx = await openApp(browser, server.url, backend, seed);
      const shot = async (name) => {
        await ctx.page.screenshot({
          path: join(SHOTS, `${s.name}-${name}.png`),
          fullPage: false,
        });
      };
      await s.run({ ...ctx, checks, backend, shot });
    } catch (err) {
      checks.push({ ok: false, label: "El escenario terminó con excepción", detail: String(err).slice(0, 500) });
      if (ctx) {
        await ctx.page
          .screenshot({ path: join(SHOTS, `${s.name}-fallo.png`) })
          .catch(() => {});
      }
    } finally {
      if (ctx) await ctx.context.close();
    }
    const ok = checks.every((c) => c.ok);
    results.push({ name: s.name, title: s.title, ok, ms: Date.now() - t0, checks });

    console.log(`\n${ok ? "✔" : "✘"} ${s.name} — ${s.title}`);
    for (const c of checks) {
      console.log(`   ${c.ok ? "·" : "✘"} ${c.label}${c.detail && !c.ok ? `  → ${c.detail}` : ""}`);
    }
  }

  await browser.close();
  await server.close();

  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  writeFileSync(
    join(SHOTS, "reporte.json"),
    JSON.stringify({ fecha: new Date().toISOString(), total, passed, results }, null, 2),
  );
  console.log(`\n${passed}/${total} escenarios en verde. Capturas y reporte en ${SHOTS}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
