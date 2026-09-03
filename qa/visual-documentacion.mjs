/**
 * QA visual de la consola de Documentación.
 *
 * Arranca Vite, monta la consola en un Chromium real y desvía todas sus llamadas
 * al backend cargado en memoria por el arnés: las pantallas de las capturas
 * muestran datos que salieron del `doPost` de verdad, no de un doble. Además
 * informa de las llamadas fallidas y de los errores de la consola del navegador,
 * que es la parte que ninguna prueba en jsdom detecta.
 *
 * Requiere Playwright, que no está en las dependencias del proyecto para no
 * cargar 100 MB de navegador en cada instalación:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   npm run doc:qa
 *
 * Las capturas quedan en `docs/modules/img/documentacion/`.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

const PUERTO = 5199;
const SALIDA = new URL("../docs/modules/img/documentacion/", import.meta.url).pathname;
const ANCHO_ESCRITORIO = { width: 1440, height: 940 };
const ANCHO_MOVIL = { width: 420, height: 900 };

/** Fecha ISO a N días de hoy: los plazos del módulo se validan contra el reloj. */
function enDias(dias) {
  const fecha = new Date(Date.now() + dias * 86400000);
  return fecha.toISOString().slice(0, 10);
}

const AGENCIAS = ["LA PAZ", "SANTA CRUZ", "COCHABAMBA", "EL ALTO", "TARIJA"];
const GERENCIAS = ["GERENCIA DE RIESGOS", "GERENCIA COMERCIAL", "GERENCIA DE OPERACIONES"];
const NOMBRES = [
  "Ana Quiroga Vargas", "Luis Fernando Mamani", "Rocío Casas Peña", "Jorge Ariel Salazar",
  "María Elena Choque", "Diego Antonio Rivas", "Paola Andrea Suárez", "Marcelo Ticona Flores",
  "Gabriela Nina Alvarado", "Ramiro Céspedes Ortiz", "Silvia Rojas Montaño", "Óscar Delgado Ríos",
  "Carla Fernández Loza", "Iván Mendoza Cruz", "Lucía Ballivián Terán", "Hugo Paredes Zapata",
];

const CARGOS = ["OFICIAL DE NEGOCIOS", "ANALISTA DE RIESGOS", "CAJERO", "JEFE DE AGENCIA", "AUDITOR INTERNO"];

function sembrar() {
  const h = loadInstalledBackend();
  const anio = new Date().getFullYear();
  const creados = [];

  // Los tres catálogos de la hoja Auxiliar. `cargo_bdp` es nuevo: sin él, el
  // desplegable de cargo del asistente sale vacío y la captura no serviría.
  h.ok("documentacion.auxiliares.agregar", { columna: "agencia_bdp", valores: AGENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "gerencia_bdp", valores: GERENCIAS });
  h.ok("documentacion.auxiliares.agregar", { columna: "cargo_bdp", valores: CARGOS });

  NOMBRES.forEach((nombre, i) => {
    const comercial = i % 4 === 1;
    const creado = crearExpediente(h, {
      identificador: `CI-${2100 + i}-${anio}`,
      nombre,
      cargo: comercial ? "OFICIAL DE NEGOCIOS" : CARGOS[i % CARGOS.length],
      agencia: AGENCIAS[i % AGENCIAS.length],
      gerencia: comercial ? "GERENCIA COMERCIAL" : GERENCIAS[i % GERENCIAS.length],
      fechaIngreso: `${anio}-0${(i % 8) + 1}-1${i % 9}`,
      tipoFuncionario: comercial ? "COMERCIAL" : i % 5 === 0 ? "CUMPLIMIENTO" : "GENERAL",
      tipoGarantia: comercial ? "COMERCIAL_1" : "NINGUNA",
    });
    creados.push(creado);
  });

  // Avance dispar: unos completos, otros a medias, otros sin empezar.
  creados.forEach((expediente, i) => {
    const cuantos = i % 5 === 0 ? expediente.requisitos.length : Math.max(0, expediente.requisitos.length - (i % 7) - 2);
    const cambios = expediente.requisitos.slice(0, cuantos).map((r) => ({
      expedienteDocumentoId: r.expedienteDocumentoId,
      estado: "ENTREGADO",
      // El conteo de hojas del legajo físico: solo lo aceptan los requisitos que
      // lo piden, el backend ignora el resto.
      ...(r.requiereConteoHojas ? { hojasFisicas: 2 + (i % 3) } : {}),
    }));
    if (cambios.length) {
      h.ok("documentacion.requisitos.guardar", { expedienteId: expediente.expedienteId, cambios });
    }
  });

  // Trabajo en curso: solicitudes, revisiones, observaciones, prórrogas y tareas.
  creados.slice(0, 6).forEach((expediente, i) => {
    const pendientes = h
      .ok("documentacion.expediente.obtener", { expedienteId: expediente.expedienteId })
      .requisitos.filter((r) => r.estado !== "ENTREGADO")
      .slice(0, 3);
    if (pendientes.length) {
      h.ok("documentacion.solicitud.crear", {
        solicitud: {
          expedienteId: expediente.expedienteId,
          canal: i % 2 ? "CORREO" : "PRESENCIAL",
          destinatario: `persona${i}@bdp.com`,
          mensaje: "Por favor envía los requisitos pendientes.",
          codigos: pendientes.map((r) => r.codigo),
        },
      });
    }
  });

  creados.slice(0, 4).forEach((expediente, i) => {
    const entregados = h
      .ok("documentacion.expediente.obtener", { expedienteId: expediente.expedienteId })
      .requisitos.filter((r) => r.estado === "ENTREGADO");
    if (!entregados.length) return;
    const requisito = entregados[i % entregados.length];
    h.ok("documentacion.revision.decidir", {
      revision: {
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        estado: i % 2 ? "OBSERVADO" : "APROBADO",
        motivo: i % 2 ? "INFO_INCOMPLETA" : "",
        comentario: i % 2 ? "Falta la última página del documento." : "Conforme.",
      },
    });
  });

  creados.slice(6, 9).forEach((expediente, i) => {
    const requisito = expediente.requisitos.find((r) => r.permiteProrroga) ?? expediente.requisitos[0];
    h.ok("documentacion.prorroga.crear", {
      prorroga: {
        expedienteId: expediente.expedienteId,
        expedienteDocumentoId: requisito.expedienteDocumentoId,
        fechaProrroga: enDias(20 + i * 15),
        motivo: "El certificado de trabajo está en trámite en la anterior empresa.",
      },
    });
  });

  creados.slice(9, 12).forEach((expediente, i) => {
    h.ok("documentacion.tarea.crear", {
      tarea: {
        expedienteId: expediente.expedienteId,
        titulo: i % 2 ? "Llamar para confirmar la entrega" : "Revisar el título legalizado",
        responsable: "Rocío Casas",
        fechaLimite: enDias(3 + i * 4),
      },
    });
  });

  creados.slice(12, 14).forEach((expediente) => {
    h.ok("documentacion.aprobacion.solicitar", {
      aprobacion: {
        expedienteId: expediente.expedienteId,
        aprobadores: ["Jorge Salazar"],
      },
    });
  });

  return h;
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const backend = sembrar();

  const vite = spawn("npx", ["vite", "--port", String(PUERTO), "--strictPort"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new Error("Vite no arrancó")), 60000);
    vite.stdout.on("data", (dato) => {
      if (String(dato).includes("ready in") || String(dato).includes("Local:")) {
        clearTimeout(temporizador);
        setTimeout(resolver, 800);
      }
    });
    vite.stderr.on("data", (dato) => process.stderr.write(String(dato)));
  });

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: ANCHO_ESCRITORIO, deviceScaleFactor: 1 });
  const pagina = await contexto.newPage();

  let llamadas = 0;
  let fallos = 0;
  await pagina.route((url) => url.hostname.endsWith("script.google.com"), async (ruta) => {
    const peticion = ruta.request();
    if (peticion.method() !== "POST") {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidatos: [], competencias: [] }) });
    }
    const cuerpo = JSON.parse(peticion.postData() ?? "{}");
    const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    const texto = salida.getContent();
    llamadas += 1;
    if (!JSON.parse(texto).ok) {
      fallos += 1;
      console.log(`  ✗ ${cuerpo.accion}: ${JSON.parse(texto).error?.message}`);
    }
    await ruta.fulfill({ status: 200, contentType: "application/json", body: texto });
  });

  const erroresConsola = [];
  pagina.on("console", (mensaje) => {
    if (mensaje.type() === "error") erroresConsola.push(mensaje.text());
  });
  pagina.on("pageerror", (error) => erroresConsola.push(`pageerror: ${error.message}`));

  await pagina.goto(`http://localhost:${PUERTO}/qa/documentacion.html`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(2500);

  async function capturar(nombre) {
    // La consola entra con una pantalla de carga propia; capturarla dejaría el
    // logo animado en todas las imágenes de la documentación.
    await pagina.waitForFunction(() => !document.querySelector(".doc-carga"), { timeout: 15000 }).catch(() => {});
    await pagina.waitForTimeout(900);
    await pagina.screenshot({ path: `${SALIDA}/${nombre}.jpg`, type: "jpeg", quality: 78, fullPage: false });
    console.log(`  ✓ ${nombre}.jpg`);
  }

  async function irA(etiqueta) {
    const boton = pagina.getByRole("button", { name: etiqueta, exact: true }).first();
    await boton.click();
    await pagina.waitForTimeout(1400);
  }

  await capturar("01-panel");

  await irA("Expedientes");
  await capturar("02-expedientes");

  const fila = pagina.getByRole("table").first().getByRole("row").nth(1);
  await fila.getByRole("cell").nth(1).click();
  await pagina.locator('[role="dialog"]').first().waitFor({ timeout: 30000 });
  await pagina.waitForTimeout(2000);
  await capturar("03-expediente-ventana");
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(900);

  // El asistente de alta, en su primer paso y en el de la categoría.
  const nuevo = pagina.getByRole("button", { name: /Nuevo expediente/ }).first();
  if (await nuevo.count()) {
    await nuevo.click();
    await pagina.locator('[role="dialog"][aria-label="Nuevo expediente documental"]').waitFor({ timeout: 20000 });
    await pagina.waitForTimeout(1200);
    await capturar("11-alta-identidad");
    const asistente = pagina.locator('[role="dialog"][aria-label="Nuevo expediente documental"]');
    await asistente.getByPlaceholder("Ej. 1234567 LP").fill("7654321 LP");
    await asistente.getByPlaceholder("Nombres y apellidos").fill("Marcela Rivero Antelo");
    await pagina.waitForTimeout(600);
    await asistente.getByRole("button", { name: /Continuar/ }).click();
    await pagina.waitForTimeout(900);
    await capturar("12-alta-generales");
    await asistente.getByRole("button", { name: /Continuar/ }).click();
    await pagina.waitForTimeout(900);
    await capturar("13-alta-categoria");
    // El asistente pregunta antes de cerrarse («¿Cerrar el asistente?») y, si se
    // guardó borrador, ofrece retomarlo al volver a abrirlo. Se contestan las dos
    // cosas: si el velo del asistente se queda puesto, ninguna captura siguiente
    // se puede tomar porque el clic no llega a la navegación.
    // Se sale del asistente RECARGANDO, no cerrándolo a mano.
    //
    // Cerrarlo es un camino con dos preguntas encadenadas —«¿cerrar el
    // asistente?» y «¿retomamos el borrador?»— y con dos botones distintos que se
    // llaman «Cerrar» (el de la pregunta y la X de la cabecera). Basta con
    // equivocarse en uno para que el velo del asistente se quede puesto, y desde
    // ahí ninguna captura siguiente se puede tomar porque el clic no llega a la
    // navegación. Para un guion de capturas, recargar es determinista: el libro
    // vive en memoria y no se pierde nada.
    await pagina.evaluate(() => window.localStorage.removeItem("bdp-documentacion-alta-borrador"));
    await pagina.goto(`http://localhost:${PUERTO}/qa/documentacion.html`, { waitUntil: "networkidle" });
    await pagina.waitForFunction(() => !document.querySelector(".doc-carga"), { timeout: 20000 }).catch(() => {});
    await pagina.waitForTimeout(1500);
  }

  for (const [etiqueta, nombre] of [
    ["Solicitudes", "04-solicitudes"],
    ["Revisión", "05-revision"],
    ["Prórrogas", "06-prorrogas"],
    ["Tareas", "07-tareas"],
    ["Reportes", "08-reportes"],
    ["Configuración", "09-configuracion"],
  ]) {
    await irA(etiqueta);
    await capturar(nombre);
  }

  // La pestaña «¿Algo va mal?»: los seis botones de autodiagnóstico.
  // Es una pestaña (`role="tab"`), no un botón suelto.
  const algoVaMal = pagina.getByRole("tab", { name: /Algo va mal/ }).first();
  if (await algoVaMal.count()) {
    await algoVaMal.click();
    await pagina.waitForTimeout(1000);
    await capturar("14-autodiagnostico");
  }

  // Móvil: la tabla se convierte en tarjetas.
  const movil = await navegador.newContext({ viewport: ANCHO_MOVIL, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const paginaMovil = await movil.newPage();
  await paginaMovil.route((url) => url.hostname.endsWith("script.google.com"), async (ruta) => {
    const peticion = ruta.request();
    if (peticion.method() !== "POST") {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidatos: [] }) });
    }
    const cuerpo = JSON.parse(peticion.postData() ?? "{}");
    const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    await ruta.fulfill({ status: 200, contentType: "application/json", body: salida.getContent() });
  });
  await paginaMovil.goto(`http://localhost:${PUERTO}/qa/documentacion.html`, { waitUntil: "networkidle" });
  await paginaMovil.waitForTimeout(3000);
  await paginaMovil.screenshot({ path: `${SALIDA}/10-movil-panel.jpg`, type: "jpeg", quality: 78 });
  console.log("  ✓ 10-movil-panel.jpg");

  console.log(`\nLlamadas al backend: ${llamadas} (fallidas: ${fallos})`);
  if (erroresConsola.length) {
    console.log("Errores de consola:");
    for (const error of erroresConsola.slice(0, 10)) console.log(`  - ${error}`);
  } else {
    console.log("Sin errores en la consola del navegador.");
  }

  await navegador.close();
  vite.kill("SIGTERM");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
