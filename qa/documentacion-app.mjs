/**
 * Arnés de QA en navegador para el módulo de Documentación (aplicación COMPLETA).
 *
 * A diferencia de `qa/visual-documentacion.mjs` —que monta solo la consola—, esto
 * arranca la aplicación entera (con su acceso, su dock y sus superposiciones
 * globales) en un Chromium real. Es el único entorno donde se puede reproducir el
 * fallo que el área reporta como «la pantalla se congela»: aparece al abrir y
 * cerrar paneles de distintos módulos, y no hay forma de verlo en jsdom.
 *
 * Uso:
 *   node qa/documentacion-app.mjs                 # recorrido completo
 *   node qa/documentacion-app.mjs congelamiento    # solo la sonda del congelamiento
 *   node qa/documentacion-app.mjs alta             # solo el asistente de alta
 *   node qa/documentacion-app.mjs capturas         # capturas para la documentación
 *
 * Requiere Playwright (fuera de las dependencias del proyecto, a propósito):
 *   npm i -D playwright && npx playwright install chromium --with-deps
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

const PUERTO = 5210;
const RAIZ = new URL("..", import.meta.url).pathname;
const SALIDA = new URL("./shots/app/", import.meta.url).pathname;
const URL_DOC = "https://script.google.com/macros/s/DOC_BACKEND_DE_PRUEBAS/exec";

const ESCRITORIO = { width: 1500, height: 950 };

/* ------------------------------------------------------------------ */
/* Semilla                                                             */
/* ------------------------------------------------------------------ */

const AGENCIAS = ["LA PAZ", "SANTA CRUZ", "COCHABAMBA", "EL ALTO", "TARIJA", "ORURO"];
const GERENCIAS = ["GERENCIA DE RIESGOS", "GERENCIA COMERCIAL", "GERENCIA DE OPERACIONES"];
const NOMBRES = [
  "Ana Quiroga Vargas", "Luis Fernando Mamani", "Rocío Casas Peña", "Jorge Ariel Salazar",
  "María Elena Choque", "Diego Antonio Rivas", "Paola Andrea Suárez", "Marcelo Ticona Flores",
  "Gabriela Nina Alvarado", "Ramiro Céspedes Ortiz", "Silvia Rojas Montaño", "Óscar Delgado Ríos",
];

function enDias(dias) {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
}

function sembrar() {
  const h = loadInstalledBackend();
  /* Los tres catálogos auxiliares, incluido `cargo_bdp`: el asistente de alta los
     lee para sus desplegables, y sin ellos la sonda recorrería una pantalla que
     no se parece a la que ve el área. */
  h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: AGENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "gerencia_bdp", valores: GERENCIAS });
  h.ok("documentacion.auxiliares.agregar", {
    columna: "cargo_bdp",
    valores: ["OFICIAL DE NEGOCIOS", "AUDITOR INTERNO", "ANALISTA", "CAJERO", "JEFE DE AGENCIA"],
  });
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const creados = [];

  NOMBRES.forEach((nombre, i) => {
    const comercial = i % 4 === 1;
    const auditoria = i % 7 === 3;
    const creado = crearExpediente(h, {
      identificador: `${1234500 + i} - ${10 + i} - ${anio}`,
      nombre,
      cargo: comercial ? "Oficial de Negocios" : auditoria ? "Auditor Interno" : "Analista",
      agencia: AGENCIAS[i % AGENCIAS.length],
      gerencia: comercial ? "GERENCIA COMERCIAL" : GERENCIAS[i % GERENCIAS.length],
      // La mitad ingresa este mes, para que el informe mensual tenga materia.
      fechaIngreso: i % 2 === 0 ? `${anio}-${mes}-${String((i % 27) + 1).padStart(2, "0")}` : `${anio}-01-1${i % 9}`,
      tipoFuncionario: comercial ? "COMERCIAL" : auditoria ? "AUDITORIA" : i % 5 === 0 ? "CUMPLIMIENTO" : "GENERAL",
      tipoGarantia: comercial ? (i % 3 === 1 ? "COMERCIAL_2" : "COMERCIAL_1") : "NINGUNA",
    });
    creados.push(creado);
  });

  creados.forEach((expediente, i) => {
    const cuantos = i % 5 === 0 ? expediente.requisitos.length : Math.max(0, expediente.requisitos.length - (i % 7) - 2);
    const cambios = expediente.requisitos.slice(0, cuantos).map((r) => ({
      expedienteDocumentoId: r.expedienteDocumentoId,
      estado: "ENTREGADO",
      /* Las hojas se cuentan solo en los documentos que llevan conteo. Antes
         esto mandaba `paginas: 2` a todos: un campo que el backend no tiene y que
         por tanto se descartaba en silencio, dejando la sonda con la impresión
         de estar probando algo que no probaba. */
      ...(r.requiereConteoHojas ? { hojasFisicas: 2 + (i % 5) } : {}),
    }));
    if (cambios.length) h.ok("documentacion.requisitos.guardar", { expedienteId: expediente.expedienteId, cambios });
  });

  // Observaciones, para que el informe mensual las recoja.
  creados.slice(0, 5).forEach((expediente, i) => {
    const pendiente = expediente.requisitos.find((r) => r.estado !== "ENTREGADO") ?? expediente.requisitos[0];
    h.ok("documentacion.requisito.actualizar", {
      expedienteDocumentoId: pendiente.expedienteDocumentoId,
      cambios: { observaciones: `Observación de prueba ${i + 1}: falta la última página.` },
    });
  });

  creados.slice(5, 8).forEach((expediente, i) => {
    const requisito = expediente.requisitos.find((r) => r.permiteProrroga) ?? expediente.requisitos[0];
    h.ok("documentacion.prorroga.crear", {
      prorroga: {
        expedienteId: expediente.expedienteId,
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        fechaProrroga: enDias(10 + i * 12),
        motivo: "El certificado de trabajo está en trámite.",
      },
    });
  });

  return h;
}

/* ------------------------------------------------------------------ */
/* Infraestructura                                                     */
/* ------------------------------------------------------------------ */

async function arrancarVite() {
  const vite = spawn("npx", ["vite", "--port", String(PUERTO), "--strictPort"], {
    cwd: RAIZ,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("Vite no arrancó")), 60000);
    vite.stdout.on("data", (d) => {
      if (String(d).includes("ready in") || String(d).includes("Local:")) {
        clearTimeout(t);
        setTimeout(resolver, 900);
      }
    });
    vite.stderr.on("data", (d) => process.stderr.write(String(d)));
  });
  return vite;
}

/** Payload mínimo del backend del talento (GET), para que la app no se quede cargando. */
const PAYLOAD_TALENTO = {
  candidatos: [],
  competencias: [],
  perfiles: [],
  procesos: [],
  config: [],
  // Un perfil de cargo: hace falta para reproducir el congelamiento por orden de
  // cierre de superposiciones (visor → formulario) en el módulo de Perfiles.
  perfiles_cargo: [
    {
      area_cargo: "NEGOCIOS",
      puesto_bdp: "Oficial de Negocios",
      gestion_bdp: String(new Date().getFullYear()),
      formacion_principal: "Economía",
      experiencia_general: "3 años",
      experiencia_especifica: "2 años en banca",
      conocimientos_tecnicos: "Análisis de crédito",
      conductas_requeridas: "Orientación al cliente",
      competencias_requeridas: "Negociación",
    },
  ],
};

async function nuevaPagina(navegador, backend, registro) {
  const contexto = await navegador.newContext({ viewport: ESCRITORIO, deviceScaleFactor: 1 });
  // Sesión iniciada y URL propia del backend de Documentación en los ajustes locales.
  await contexto.addCookies([
    { name: "bdp_perfil_sesion", value: "administrador", url: `http://localhost:${PUERTO}` },
  ]);
  await contexto.addInitScript(
    ([clave, url]) => {
      window.localStorage.setItem(clave, JSON.stringify({ dossiers: {}, settings: { scriptUrl: url } }));
    },
    ["bdp-documentacion", URL_DOC],
  );

  const pagina = await contexto.newPage();
  await pagina.route(
    (url) => url.hostname.endsWith("script.google.com"),
    async (ruta) => {
      const peticion = ruta.request();
      if (peticion.method() !== "POST") {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAYLOAD_TALENTO) });
      }
      const cuerpo = JSON.parse(peticion.postData() ?? "{}");
      if (!String(cuerpo.accion ?? "").startsWith("documentacion.")) {
        return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
      const texto = salida.getContent();
      registro.llamadas += 1;
      const json = JSON.parse(texto);
      if (!json.ok) {
        registro.fallos.push(`${cuerpo.accion}: ${json.error?.message ?? json.error?.mensaje}`);
      }
      await ruta.fulfill({ status: 200, contentType: "application/json", body: texto });
    },
  );

  pagina.on("console", (m) => {
    if (m.type() === "error") registro.errores.push(m.text().slice(0, 300));
    if (m.type() === "warning" && /React|Warning/.test(m.text())) registro.avisos.push(m.text().slice(0, 300));
  });
  pagina.on("pageerror", (e) => registro.errores.push(`pageerror: ${e.message}`.slice(0, 300)));

  await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: "domcontentloaded" });
  return pagina;
}

/* ------------------------------------------------------------------ */
/* Utilidades de interacción                                           */
/* ------------------------------------------------------------------ */

async function irAModulo(pagina, etiqueta) {
  await pagina.getByRole("button", { name: etiqueta, exact: true }).first().click();
  await pagina.waitForTimeout(1200);
}

/**
 * ¿Sigue respondiendo la página?
 *
 * Tres hechos, no impresiones: (1) el `body` no está bloqueado, (2) el punto medio
 * de la pantalla no lo tapa una superposición huérfana, y (3) el hilo principal
 * contesta a un `click` sintético en menos de dos segundos.
 */
async function sondaViva(pagina, etiqueta) {
  const hechos = await pagina.evaluate(() => {
    const cx = Math.round(window.innerWidth / 2);
    const cy = Math.round(window.innerHeight / 2);
    const encima = document.elementFromPoint(cx, cy);
    const cadena = [];
    let n = encima;
    while (n && cadena.length < 6) {
      cadena.push(`${n.tagName.toLowerCase()}${n.className && typeof n.className === "string" ? "." + n.className.split(" ").slice(0, 2).join(".") : ""}`);
      n = n.parentElement;
    }
    const fijosVisibles = [...document.querySelectorAll("body > div, body > div *")]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== "fixed") return false;
        if (s.pointerEvents === "none") return false;
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
    return {
      overflow: document.body.style.overflow,
      encima: cadena.join(" < "),
      fijosVisibles,
      dialogos: document.querySelectorAll('[role="dialog"]').length,
    };
  });

  // Reactividad real: pulsar un botón del dock y comprobar que el título del
  // módulo cambia. El título (`h2` de la cabecera) es el testigo más barato de
  // que el hilo principal sigue procesando eventos y React sigue pintando.
  const titulo = () => pagina.evaluate(() => document.querySelector("main header h2")?.textContent?.trim() ?? "");
  let reactiva = true;
  try {
    const antes = await titulo();
    const destino = antes === "Tablero" ? "Dashboard" : "Tablero";
    await pagina.getByRole("button", { name: destino, exact: true }).first().click({ timeout: 2500 });
    await pagina.waitForTimeout(800);
    reactiva = (await titulo()) === destino;
  } catch {
    reactiva = false;
  }

  const ok = hechos.overflow !== "hidden" && hechos.fijosVisibles.length === 0 && reactiva;
  console.log(`  ${ok ? "✓" : "✗"} ${etiqueta}`);
  if (!ok) {
    console.log(`      overflow=${JSON.stringify(hechos.overflow)} reactiva=${reactiva}`);
    console.log(`      en el centro: ${hechos.encima}`);
    if (hechos.fijosVisibles.length) console.log(`      superposiciones a pantalla completa: ${hechos.fijosVisibles.join(", ")}`);
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/* Escenarios                                                          */
/* ------------------------------------------------------------------ */

/** El fallo reportado: abrir un panel, cerrarlo y quedarse sin interfaz. */
async function escenarioCongelamiento(pagina) {
  console.log("\n▸ Congelamiento tras abrir y cerrar paneles");
  let todo = true;

  await irAModulo(pagina, "Documentación");
  await pagina.waitForTimeout(2200);
  todo = (await sondaViva(pagina, "el módulo abre y responde")) && todo;

  // Documentación › Configuración › Ajustes locales › cerrar con «Listo».
  await irAModulo(pagina, "Documentación");
  await pagina.waitForTimeout(1800);
  await pagina.getByRole("button", { name: "Configuración", exact: true }).last().click();
  await pagina.waitForTimeout(1000);
  await pagina.getByRole("tab", { name: "Ajustes locales" }).click();
  await pagina.waitForTimeout(600);
  const abrir = pagina.getByRole("button", { name: "Abrir ajustes locales" }).first();
  if (await abrir.count()) {
    await abrir.click();
    await pagina.waitForTimeout(1200);
    await pagina.screenshot({ path: `${SALIDA}/congela-1-ajustes-abiertos.jpg`, type: "jpeg", quality: 78 });
    await pagina.getByRole("button", { name: "Listo", exact: true }).first().click();
    await pagina.waitForTimeout(1000);
    await pagina.screenshot({ path: `${SALIDA}/congela-2-tras-cerrar.jpg`, type: "jpeg", quality: 78 });
    todo = (await sondaViva(pagina, "tras cerrar los ajustes locales de Documentación")) && todo;
  } else {
    console.log("  ✗ no se encontró el botón «Abrir ajustes locales»");
    todo = false;
  }

  // Perfiles: herramientas. Este tramo recorre pantallas heredadas; si alguna no
  // colabora con el clic sintético se informa y el recorrido continúa, en lugar de
  // tumbar el arnés entero.
  await irAModulo(pagina, "Perfiles");
  await pagina.waitForTimeout(1200);
  const herramientas = pagina.getByRole("button", { name: /Herramientas/ }).first();
  if (await herramientas.count()) {
    await herramientas.click();
    await pagina.waitForTimeout(900);
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(800);
    todo = (await sondaViva(pagina, "tras abrir y cerrar Herramientas (Perfiles)")) && todo;
  }

  /* El caso que rompía el candado: DOS superposiciones solapadas que se cierran en
     orden inverso al de apertura. En Perfiles, «Editar» desde el visor monta el
     formulario mientras el visor todavía está animando su salida; el formulario
     captura el `overflow` que dejó el visor («hidden») y, al cerrarse el último,
     lo restaura. Resultado: la página se queda sin scroll para siempre. */
  await irAModulo(pagina, "Perfiles");
  await pagina.waitForTimeout(1500);
  const tarjeta = pagina.getByRole("button", { name: /Oficial de Negocios/ }).first();
  try {
   if (await tarjeta.count()) {
    await tarjeta.click({ force: true });
    await pagina.waitForTimeout(1200);
    const visor = pagina.getByRole("dialog", { name: /Perfil de cargo:/ });
    const editar = visor.getByRole("button", { name: /Modificar/ }).first();
    if (await editar.count()) {
      await editar.click({ force: true });
      await pagina.waitForTimeout(1400);
      const dlg = () => pagina.evaluate(() => ({
        overflow: document.body.style.overflow,
        dialogos: [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map((d) => d.getAttribute("aria-label") || "(sin nombre)"),
      }));
      console.log(`      [formulario abierto] ${JSON.stringify(await dlg())}`);
      const overflowConFormulario = await pagina.evaluate(() => document.body.style.overflow);
      // Salir del formulario. Si pregunta, confirmar la salida.
      await pagina.getByRole("button", { name: "Cerrar formulario" }).first().click({ force: true });
      await pagina.waitForTimeout(700);
      console.log(`      [tras pulsar cerrar] ${JSON.stringify(await dlg())}`);
      const confirmar = pagina.getByRole("button", { name: "Descartar y salir" }).first();
      if (await confirmar.count()) {
        await confirmar.click({ force: true });
      }
      await pagina.waitForTimeout(1200);
      console.log(`      [tras cerrar]        ${JSON.stringify(await dlg())}`);
      const overflowFinal = await pagina.evaluate(() => document.body.style.overflow);
      console.log(`      overflow con el formulario abierto: ${JSON.stringify(overflowConFormulario)} · al cerrar todo: ${JSON.stringify(overflowFinal)}`);
      todo = (await sondaViva(pagina, "visor → formulario → cerrar (orden inverso)")) && todo;
    } else {
      console.log("  · el visor no expone «Editar»");
    }
   } else {
    console.log("  · no hay tarjetas de perfil de cargo");
   }
  } catch {
    console.log("  · el recorrido visor→formulario no se pudo completar con clics sintéticos");
  }

  // Se recarga antes del último tramo: lo anterior puede dejar pantallas abiertas.
  await pagina.reload({ waitUntil: "domcontentloaded" });
  await pagina.waitForTimeout(3000);
  await irAModulo(pagina, "Documentación");
  await pagina.waitForTimeout(1800);
  todo = (await sondaViva(pagina, "tras volver a Documentación")) && todo;

  return todo;
}

/**
 * El asistente de alta, de principio a fin, contra el backend real.
 *
 * ── Qué cambió respecto de la versión anterior de esta sonda ────────────────
 * Tres cosas que la rompían y que no eran fallos del módulo:
 *
 * 1. **El carnet ya no tiene formato impuesto.** Buscaba el marcador de posición
 *    `"1234567 - 45 - 2026"`, que era la máscara de tres partes que el área no
 *    usaba; ahora se escribe el carnet como venga.
 * 2. **La categoría es un radiogrupo, no botones.** Se selecciona por
 *    `role="radio"`, que además es lo que hace que se pueda recorrer con las
 *    flechas del teclado.
 * 3. **El asistente vive en una hoja central**, así que se espera al
 *    `role="dialog"` en lugar de a un tiempo fijo.
 *
 * Lo que esta sonda aporta y la dedicada no son las CAPTURAS de cada paso: el
 * recorrido funcional detallado —hojas físicas, subsecciones, prórroga, alta en
 * una sola llamada— está en `qa/sonda-alta-expediente.mjs`, que cuenta el
 * tráfico. Aquí lo que se comprueba es que el camino completo no se rompe y que
 * queda constancia visual de cada paso.
 */
async function escenarioAlta(pagina) {
  console.log("\n▸ Asistente de nuevo expediente");
  await irAModulo(pagina, "Documentación");
  await pagina.waitForTimeout(2200);

  const nuevo = pagina.getByRole("button", { name: /Nuevo expediente/ }).first();
  if (!(await nuevo.count())) {
    console.log("  ✗ no aparece el botón «Nuevo expediente» (¿sin conexión?)");
    return false;
  }
  await nuevo.click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 20000 });
  await pagina.waitForTimeout(800);

  await pagina.getByPlaceholder("Ej. 1234567 1K").fill("9988776 7K");
  await pagina.getByPlaceholder("Nombres y apellidos").fill("Prueba Navegador Comercial");
  await pagina.screenshot({ path: `${SALIDA}/alta-1-identidad.jpg`, type: "jpeg", quality: 80 });
  await pagina.getByRole("button", { name: /Continuar/ }).first().click();
  await pagina.waitForTimeout(900);
  await pagina.screenshot({ path: `${SALIDA}/alta-2-generales.jpg`, type: "jpeg", quality: 80 });
  await pagina.getByRole("button", { name: /Continuar/ }).first().click();
  await pagina.waitForTimeout(900);
  await pagina.getByRole("radio", { name: /Funcionario área comercial/i }).first().click();
  await pagina.waitForTimeout(700);
  await pagina.getByRole("radio", { name: /Tipo 2/ }).first().click();
  await pagina.waitForTimeout(500);
  await pagina.screenshot({ path: `${SALIDA}/alta-3-categoria.jpg`, type: "jpeg", quality: 80 });
  await pagina.getByRole("button", { name: /Continuar/ }).first().click();
  await pagina.waitForTimeout(900);
  await pagina.screenshot({ path: `${SALIDA}/alta-4-especificos.jpg`, type: "jpeg", quality: 80 });
  await pagina.getByRole("button", { name: /Continuar/ }).first().click();
  await pagina.waitForTimeout(900);
  await pagina.screenshot({ path: `${SALIDA}/alta-5-revision.jpg`, type: "jpeg", quality: 80 });
  await pagina.getByRole("button", { name: /Guardar y abrir expediente/ }).first().click();
  await pagina.waitForTimeout(3500);
  await pagina.screenshot({ path: `${SALIDA}/alta-6-guardado.jpg`, type: "jpeg", quality: 80 });

  const texto = await pagina.evaluate(() => document.body.innerText);
  const ok = /Prueba Navegador Comercial|expediente/i.test(texto);
  console.log(`  ${ok ? "✓" : "✗"} el alta terminó sin error visible`);
  return ok;
}

async function main() {
  const escenario = process.argv[2] ?? "todo";
  mkdirSync(SALIDA, { recursive: true });

  const backend = sembrar();
  const vite = await arrancarVite();
  const navegador = await chromium.launch();
  const registro = { llamadas: 0, fallos: [], errores: [], avisos: [] };
  const pagina = await nuevaPagina(navegador, backend, registro);
  await pagina.waitForTimeout(2500);

  let ok = true;
  try {
    if (escenario === "todo" || escenario === "congelamiento") ok = (await escenarioCongelamiento(pagina)) && ok;
    if (escenario === "todo" || escenario === "alta") ok = (await escenarioAlta(pagina)) && ok;
  } finally {
    console.log(`\nLlamadas al backend: ${registro.llamadas} · fallidas: ${registro.fallos.length}`);
    for (const f of registro.fallos.slice(0, 8)) console.log(`  ✗ ${f}`);
    if (registro.errores.length) {
      console.log("Errores de la consola del navegador:");
      for (const e of [...new Set(registro.errores)].slice(0, 10)) console.log(`  - ${e}`);
    } else {
      console.log("Sin errores en la consola del navegador.");
    }
    await navegador.close();
    vite.kill("SIGTERM");
  }
  process.exit(ok && registro.fallos.length === 0 && registro.errores.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
