/**
 * Sonda de RENDIMIENTO con la CPU estrangulada.
 *
 * ── Por qué con la CPU estrangulada y no a pelo ─────────────────────────────
 * En el portátil donde se programa esto, el módulo va bien. En los equipos del
 * área —sin GPU dedicada, con el antivirus corporativo comiéndose un núcleo— se
 * traba. Medir sin estrangular la CPU mide el equipo del programador, que es
 * exactamente el equipo que no importa.
 *
 * Chrome DevTools Protocol permite dividir la velocidad del hilo principal por un
 * factor. Con 4× un fotograma de 4 ms pasa a 16, que es justo el presupuesto de
 * los 60 fps: cualquier cosa que sobre se ve como un tirón.
 *
 * ── Qué mide ────────────────────────────────────────────────────────────────
 *   1. **tiempo hasta interactivo** del módulo (hasta que la consola responde);
 *   2. **fotogramas por segundo al desplazar** una lista larga;
 *   3. **tareas largas** (> 50 ms), que son las que bloquean la respuesta al clic;
 *   4. **memoria** del montón de JavaScript;
 *   5. **capas compuestas**, que es el coste que la estética de cristal introduce.
 *
 * No falla por un umbral: imprime números para poder comparar antes y después.
 * Un umbral inventado en una máquina de integración continua compartida daría
 * falsos negativos y acabaría desactivado, que es peor que no tenerlo.
 *
 * Uso:
 *   node qa/sonda-rendimiento.mjs            # 4× (por defecto)
 *   node qa/sonda-rendimiento.mjs 6          # 6×
 *
 * Requiere Playwright (fuera de las dependencias del proyecto, a propósito):
 *   npm i -D playwright && npx playwright install chromium --with-deps
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { crearExpediente, loadInstalledBackend } from "../scripts/documentacion-backend.mjs";

const PUERTO = 5232;
const RAIZ = new URL("..", import.meta.url).pathname;
const FACTOR = Number(process.argv[2] ?? 4);

/** Expedientes de la semilla: suficientes para que la lista sea larga de verdad. */
const CUANTOS = 60;

function sembrar() {
  const h = loadInstalledBackend();
  const agencias = ["LA PAZ", "SANTA CRUZ", "COCHABAMBA", "EL ALTO", "TARIJA", "ORURO"];
  for (let i = 0; i < CUANTOS; i++) {
    const comercial = i % 3 === 0;
    const creado = crearExpediente(h, {
      identificador: `7${String(i).padStart(6, "0")}`,
      nombre: `Persona De Prueba ${i}`,
      cargo: "OFICIAL DE NEGOCIOS",
      agencia: agencias[i % agencias.length],
      gerencia: "GERENCIA DE RIESGOS",
      fechaIngreso: h.read("doc2Hoy_()"),
      tipoFuncionario: comercial ? "COMERCIAL" : "GENERAL",
      tipoGarantia: comercial ? "COMERCIAL_2" : "NINGUNA",
    });
    if (i % 4 === 0) {
      const detalle = h.ok("documentacion.expediente.obtener", { expedienteId: creado.expedienteId });
      h.ok("documentacion.requisitos.guardar", {
        expedienteId: creado.expedienteId,
        cambios: detalle.requisitos.slice(0, 5).map((r, k) => ({
          expedienteDocumentoId: r.expedienteDocumentoId,
          estado: k % 2 ? "ENTREGADO" : "NO_ENTREGADO",
          ...(r.requiereConteoHojas ? { hojasFisicas: k + 2 } : {}),
        })),
      });
    }
  }
  return h;
}

/**
 * Cuenta fotogramas mientras se desplaza, DENTRO de la página.
 *
 * Se cuentan `requestAnimationFrame` reales en lugar de fiarse de una traza: es
 * la medida que corresponde a lo que la persona percibe. El desplazamiento se
 * hace en pasos pequeños para imitar una rueda de ratón, no un salto.
 */
const MEDIR_FPS = async (selector) => {
  const caja = document.querySelector(selector) ?? document.scrollingElement;
  if (!caja) return null;

  let fotogramas = 0;
  let corriendo = true;
  const contar = () => {
    if (!corriendo) return;
    fotogramas += 1;
    requestAnimationFrame(contar);
  };
  requestAnimationFrame(contar);

  const inicio = performance.now();
  const pasos = 40;
  for (let i = 0; i < pasos; i++) {
    caja.scrollTop += 60;
    await new Promise((r) => setTimeout(r, 25));
  }
  const ms = performance.now() - inicio;
  corriendo = false;

  return { fotogramas, ms: Math.round(ms), fps: Number(((fotogramas / ms) * 1000).toFixed(1)) };
};

/** Capas compuestas y coste de pintado declarado en el CSS aplicado. */
const CONTAR_CAPAS = () => {
  const nodos = document.querySelectorAll(".doc-console *");
  let conDesenfoque = 0;
  let conSombraGrande = 0;
  let conWillChange = 0;
  for (const nodo of nodos) {
    const e = getComputedStyle(nodo);
    // Cada `backdrop-filter` obliga al compositor a una capa propia y a leer lo
    // que hay debajo: es el coste real de la estética de cristal.
    if (e.backdropFilter && e.backdropFilter !== "none") conDesenfoque += 1;
    // `will-change` permanente reserva memoria de GPU que nadie recupera.
    if (e.willChange && e.willChange !== "auto") conWillChange += 1;
    // Una sombra de radio grande cuesta un desenfoque de toda su caja.
    if (/(\d{2,})px\s+(-?\d+px\s+)?(\d{2,})px/.test(e.boxShadow || "")) conSombraGrande += 1;
  }
  return { nodos: nodos.length, conDesenfoque, conSombraGrande, conWillChange };
};

async function main() {
  const backend = sembrar();

  const vite = spawn("npx", ["vite", "--port", String(PUERTO), "--strictPort"], {
    cwd: RAIZ,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("Vite no arrancó")), 90000);
    vite.stdout.on("data", (d) => {
      if (String(d).includes("ready in") || String(d).includes("Local:")) {
        clearTimeout(t);
        setTimeout(resolver, 900);
      }
    });
  });

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1500, height: 950 } });
  const pagina = await contexto.newPage();

  let llamadas = 0;
  await pagina.route((url) => url.hostname.endsWith("script.google.com"), async (ruta) => {
    if (ruta.request().method() !== "POST") {
      return ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidatos: [], competencias: [] }) });
    }
    llamadas += 1;
    const cuerpo = JSON.parse(ruta.request().postData() ?? "{}");
    const salida = backend.call("doPost", { postData: { contents: JSON.stringify(cuerpo) } });
    await ruta.fulfill({ status: 200, contentType: "application/json", body: salida.getContent() });
  });

  /* Tareas largas: se observan ANTES de navegar, para no perderse las del
     arranque, que son las que deciden si el módulo «tarda en abrir». */
  await pagina.addInitScript(() => {
    window.__tareasLargas = [];
    try {
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) {
          window.__tareasLargas.push(Math.round(entrada.duration));
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* navegador sin `longtask`: se informa como no disponible */
    }
  });

  const cdp = await contexto.newCDPSession(pagina);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: FACTOR });
  console.log(`\n▸ CPU estrangulada ${FACTOR}× · ${CUANTOS} expedientes en la semilla\n`);

  /* 1 · Tiempo hasta interactivo. Se mide hasta que la consola RESPONDE, no
     hasta que el HTML llega: lo segundo no significa nada para quien espera. */
  const t0 = Date.now();
  await pagina.goto(`http://localhost:${PUERTO}/qa/documentacion.html`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector(".doc-console", { timeout: 60000 });
  const tHtml = Date.now() - t0;
  // La pantalla de carga se va cuando el catálogo está: eso es «interactivo».
  await pagina
    .waitForFunction(() => !document.body.innerText.includes("Cargando documentación"), { timeout: 60000 })
    .catch(() => {});
  const tInteractivo = Date.now() - t0;
  await pagina.waitForTimeout(1500);

  console.log(`  consola en pantalla        ${String(tHtml).padStart(6)} ms`);
  console.log(`  interactivo (sin carga)    ${String(tInteractivo).padStart(6)} ms`);

  /* 2 · Desplazamiento de la lista de expedientes. */
  const irA = async (etiqueta) => {
    const boton = pagina.locator(`.doc-console button:has-text("${etiqueta}")`).first();
    if (await boton.count()) {
      await boton.click({ timeout: 8000 }).catch(() => {});
      await pagina.waitForTimeout(1400);
    }
  };

  await irA("Expedientes");
  const fpsLista = await pagina.evaluate(MEDIR_FPS, ".doc-console .overflow-y-auto");
  if (fpsLista) {
    console.log(`  fps al desplazar la lista  ${String(fpsLista.fps).padStart(6)}  (${fpsLista.fotogramas} fotogramas en ${fpsLista.ms} ms)`);
  } else {
    console.log("  fps al desplazar la lista       —  (no se encontró el contenedor)");
  }

  /* 3 · Abrir un expediente: es la interacción más pesada del módulo, porque
     pinta veinticinco requisitos con sus chips y sus contadores. */
  const primera = pagina.locator(".doc-console tbody tr, .doc-console li button").first();
  let tAbrir = null;
  if (await primera.count()) {
    const t = Date.now();
    await primera.click({ timeout: 8000 }).catch(() => {});
    await pagina.waitForTimeout(200);
    await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 }).catch(() => {});
    tAbrir = Date.now() - t;
    console.log(`  abrir un expediente        ${String(tAbrir).padStart(6)} ms`);
    await pagina.waitForTimeout(900);

    const fpsFicha = await pagina.evaluate(MEDIR_FPS, '[role="dialog"] .overflow-y-auto');
    if (fpsFicha) {
      console.log(`  fps al desplazar la ficha  ${String(fpsFicha.fps).padStart(6)}  (${fpsFicha.fotogramas} fotogramas en ${fpsFicha.ms} ms)`);
    }

    /* 4 · Escribir en una observación con la CPU estrangulada.
       Es la prueba del fallo histórico del módulo: si cada pulsación remonta un
       efecto, aquí se ve como una latencia por letra que crece con la lista. */
    const area = pagina.locator('[role="dialog"] textarea').first();
    if (await area.count()) {
      const frase = "Falta la ultima pagina del certificado y el sello de la agencia";
      const t2 = Date.now();
      await area.click({ timeout: 5000 }).catch(() => {});
      await area.type(frase, { delay: 0 });
      const tEscribir = Date.now() - t2;
      const escrito = await area.inputValue();
      const completo = escrito.includes(frase);
      console.log(
        `  ${completo ? "✓" : "✗"} escribir ${frase.length} letras  ${String(tEscribir).padStart(6)} ms ` +
          `(${(tEscribir / frase.length).toFixed(1)} ms por letra)`,
      );
      if (!completo) console.log(`      se escribió: «${escrito}»`);
    }

    await pagina.keyboard.press("Escape").catch(() => {});
    await pagina.waitForTimeout(600);
    const salir = pagina.locator('button:has-text("Descartar"), button:has-text("Cerrar")').first();
    if (await salir.count()) await salir.click({ timeout: 3000 }).catch(() => {});
    await pagina.waitForTimeout(500);
  }

  /* 5 · Recorrido por todas las secciones, para las tareas largas. */
  for (const seccion of ["Panel", "Solicitudes", "Revisión", "Prórrogas", "Tareas", "Reportes", "Configuración"]) {
    await irA(seccion);
  }

  const tareas = await pagina.evaluate(() => window.__tareasLargas ?? []);
  const capas = await pagina.evaluate(CONTAR_CAPAS);
  const memoria = await pagina.evaluate(() => {
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });

  const suma = tareas.reduce((a, b) => a + b, 0);
  const peor = tareas.length ? Math.max(...tareas) : 0;

  console.log("");
  console.log(`  tareas largas (> 50 ms)    ${String(tareas.length).padStart(6)}  · suma ${suma} ms · la peor ${peor} ms`);
  console.log(`  memoria del montón JS      ${memoria === null ? "     —" : String(memoria).padStart(6)}${memoria === null ? "" : " MB"}`);
  console.log(`  nodos en la consola        ${String(capas.nodos).padStart(6)}`);
  console.log(`  con backdrop-filter        ${String(capas.conDesenfoque).padStart(6)}  (cada uno es una capa compuesta)`);
  console.log(`  con sombra de radio grande ${String(capas.conSombraGrande).padStart(6)}`);
  console.log(`  con will-change activo     ${String(capas.conWillChange).padStart(6)}  (debería ser bajo: solo durante la animación)`);
  console.log(`  llamadas al backend        ${String(llamadas).padStart(6)}`);

  await navegador.close();
  vite.kill("SIGTERM");

  console.log("\nNúmeros para comparar antes y después. Esta sonda no falla por umbral: los");
  console.log("umbrales inventados en una máquina compartida dan falsos negativos y acaban");
  console.log("desactivados, que es peor que no tenerlos.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
