/**
 * Sonda de la CACHÉ de expedientes y del trabajo sin conexión.
 *
 * ── Qué se quiere demostrar ─────────────────────────────────────────────────
 * Tres promesas del módulo, medidas en el navegador y no razonadas sobre el
 * papel:
 *
 *   1. **la precarga trae la página en pocas llamadas**: veinticinco expedientes
 *      no son veinticinco viajes a Apps Script, sino dos o tres lotes. Se cuenta
 *      qué acciones llegan al `doPost` real;
 *   2. **el segundo expediente abre al instante**: la primera apertura paga la
 *      llamada; la siguiente sale de la caché y se revalida en silencio. Se
 *      compara el tiempo desde el clic hasta ver el nombre en pantalla;
 *   3. **sin conexión se sigue trabajando**: con la red cortada, un expediente
 *      ya visto se abre igual —diciendo de cuándo son los datos— y los cambios se
 *      quedan en una cola que se vacía al volver la red.
 *
 * La red se corta de verdad: el arnés aborta las peticiones a
 * `script.google.com` como si el equipo se hubiera quedado sin internet.
 *
 *     node qa/sonda-cache-expedientes.mjs
 */

import { chromium } from "playwright";
import {
  abrirDocumentacion,
  abrirExpedientes,
  abrirFila,
  arrancarServidor,
  cerrarVentana,
  comprobar,
  dato,
  nuevaPagina,
  nuevoRegistro,
  seccion,
  sembrarLibro,
  terminar,
} from "./arnes-documentacion.mjs";

const PUERTO = 5235;

/** Nombre visible de una fila, para saber qué expediente se abrió. */
async function nombreDeFila(pagina, indice) {
  return pagina.evaluate((i) => {
    const fila = document.querySelectorAll("table tbody tr")[i];
    return fila ? (fila.textContent ?? "").trim().slice(0, 40) : "";
  }, indice);
}

/** Milisegundos desde el clic hasta que el nombre aparece dentro de la ventana. */
async function abrirYMedir(pagina, indice) {
  const nombre = await nombreDeFila(pagina, indice);
  const clave = nombre.split("  ")[0].trim().slice(0, 18);
  const inicio = Date.now();
  await pagina.locator("table tbody tr").nth(indice).click();
  await pagina
    .locator('[role="dialog"]')
    .filter({ hasText: clave })
    .first()
    .waitFor({ timeout: 30000 });
  const ms = Date.now() - inicio;
  return { ms, clave };
}

async function main() {
  const { backend } = sembrarLibro();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();
  // El corte de red es parte de la prueba: el navegador se queja y debe quejarse.
  registro.erroresEsperados = [/ERR_INTERNET_DISCONNECTED/, /Failed to load resource/];
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });
  await pagina.waitForTimeout(2000);
  await abrirDocumentacion(pagina);

  /* ---------------------------------------------------------------- */
  seccion("Precarga de la página visible");

  const antesLista = registro.acciones.length;
  await abrirExpedientes(pagina);
  // La precarga corre en tiempo ocioso: se le da margen.
  await pagina.waitForTimeout(6000);

  const durante = registro.acciones.slice(antesLista);
  const lotes = durante.filter((a) => a === "documentacion.expedientes.detalle").length;
  const sueltas = durante.filter((a) => a === "documentacion.expediente.obtener").length;
  dato("llamadas mientras se mira la lista", durante.join(", ") || "ninguna");
  dato("lotes de detalle", String(lotes));
  comprobar(lotes >= 1, "la precarga pide el detalle en lotes");
  comprobar(lotes <= 4, "veinticinco expedientes caben en cuatro lotes o menos", `lotes: ${lotes}`);
  comprobar(sueltas === 0, "no se pide expediente por expediente", `sueltas: ${sueltas}`);

  const enCache = await pagina.evaluate(() => {
    const sitio = window.localStorage;
    let claves = 0;
    for (let i = 0; i < sitio.length; i += 1) {
      if (String(sitio.key(i)).includes("documentacion")) claves += 1;
    }
    return claves;
  });
  dato("claves del módulo en el almacén local", String(enCache));

  /* ---------------------------------------------------------------- */
  seccion("Apertura instantánea");

  const primera = await abrirYMedir(pagina, 0);
  dato("primera apertura", `${primera.ms} ms`);
  await cerrarVentana(pagina);
  await pagina.waitForTimeout(500);

  const segunda = await abrirYMedir(pagina, 0);
  dato("misma ficha, segunda vez", `${segunda.ms} ms`);
  comprobar(
    segunda.ms <= 900,
    "un expediente ya visto aparece de inmediato",
    `${primera.ms} ms la primera vez, ${segunda.ms} ms la segunda`,
  );
  await cerrarVentana(pagina);
  await pagina.waitForTimeout(400);

  const otra = await abrirYMedir(pagina, 3);
  dato("otra ficha precargada", `${otra.ms} ms`);
  comprobar(otra.ms <= 1500, "una ficha que trajo la precarga también abre sin espera", `${otra.ms} ms`);
  await cerrarVentana(pagina);

  /* ---------------------------------------------------------------- */
  seccion("Revalidación en silencio");

  // Se cambia el libro POR DETRÁS y se vuelve a abrir: la ficha aparece con lo
  // que había en la caché y termina mostrando el dato nuevo, sin pantalla vacía.
  const listado = backend.ok("documentacion.expedientes.listar", { filtros: {} });
  const objetivo = listado.expedientes[0];
  backend.ok("documentacion.expediente.actualizar", {
    expedienteId: objetivo.expedienteId,
    cambios: { responsableId: "revalidado@bdp.com" },
  });

  await abrirFila(pagina, 0);
  await pagina.waitForTimeout(3500);
  const textoVentana = (await pagina.locator('[role="dialog"]').first().innerText()).replace(/\s+/g, " ");
  comprobar(
    /revalidado@bdp.com/.test(textoVentana),
    "la ficha termina mostrando el dato nuevo del libro",
    textoVentana.slice(0, 140),
  );
  await cerrarVentana(pagina);

  /* ---------------------------------------------------------------- */
  seccion("Sin conexión");

  registro.sinRed = true;
  const antesSinRed = registro.llamadas;

  const sinRed = await abrirYMedir(pagina, 1);
  dato("apertura con la red cortada", `${sinRed.ms} ms`);
  comprobar(true, "con la red cortada, la ficha se abre desde la copia local");

  const ventana = pagina.locator('[role="dialog"]').first();
  // Se deja pasar el intento fallido: la nota cambia de «se está comprobando» a
  // «no se pudo comprobar» cuando la petición ya volvió con error.
  await pagina.waitForTimeout(2000);
  const aviso = (await ventana.innerText()).replace(/\s+/g, " ");
  comprobar(
    /copia de este equipo/i.test(aviso),
    "y dice claramente que lo que se ve es una copia de este equipo",
    aviso.replace(/^.*(Copia de este equipo[^]*?)$/, "$1").slice(0, 200),
  );
  comprobar(
    /no se pudo comprobar contra el libro/i.test(aviso),
    "sin red, no finge que está comprobando: dice que no pudo",
    aviso.slice(-200),
  );
  comprobar(registro.llamadas === antesSinRed, "no se colaron llamadas nuevas al backend con la red caída");

  // Un cambio hecho sin conexión se guarda en la cola, no se pierde.
  const detalle = ventana.getByRole("button", { name: /Detalle/ }).first();
  if (await detalle.count()) {
    await detalle.click();
    await pagina.waitForTimeout(500);
  }
  const area = ventana.locator("textarea").first();
  if (await area.count()) {
    await area.click();
    await area.fill("Anotado sin conexión: falta la hoja 3.");
    await area.blur();
    await pagina.waitForTimeout(900);
  }

  // Y se pulsa guardar: el módulo no escribe por su cuenta, así que la cola solo
  // se llena cuando alguien intenta guardar de verdad y la red no responde.
  const guardar = ventana.getByRole("button", { name: /Guardar \d+ cambio/ }).first();
  comprobar(await guardar.count() > 0, "la ventana ofrece guardar el bloque de cambios");
  if (await guardar.count()) {
    await guardar.click();
    await pagina.waitForTimeout(3500);
  }

  const cola = await pagina.evaluate(() => {
    const crudo = window.localStorage.getItem("bdp-documentacion-cola");
    if (!crudo) return { existe: false, cuantos: 0 };
    try {
      const datos = JSON.parse(crudo);
      const lista = datos?.elementos ?? [];
      return { existe: true, cuantos: lista.reduce((n, e) => n + (e.cambios?.length ?? 0), 0) };
    } catch {
      return { existe: true, cuantos: -1 };
    }
  });
  dato("cola de salida en el almacén local", JSON.stringify(cola));
  comprobar(cola.existe && cola.cuantos !== 0, "el cambio hecho sin conexión queda en la cola de salida");

  const textoCola = (await pagina.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(
    /pendiente|esperan conexión|sin conexión|cola/i.test(textoCola),
    "la pantalla avisa de que hay cambios esperando",
  );

  /* ---------------------------------------------------------------- */
  seccion("Vuelve la conexión");

  registro.sinRed = false;
  await pagina.evaluate(() => window.dispatchEvent(new Event("online")));
  await pagina.waitForTimeout(6000);

  const colaDespues = await pagina.evaluate(() => {
    const crudo = window.localStorage.getItem("bdp-documentacion-cola");
    if (!crudo) return 0;
    try {
      const datos = JSON.parse(crudo);
      const lista = datos?.elementos ?? [];
      return lista.reduce((n, e) => n + (e.cambios?.length ?? 0), 0);
    } catch {
      return -1;
    }
  });
  dato("cambios que siguen en la cola", String(colaDespues));
  comprobar(colaDespues === 0, "al volver la red, la cola se vacía sola", `quedan ${colaDespues}`);

  // Se busca la frase en el libro, requisito por requisito: es la única prueba
  // de que la cola no se limitó a olvidar lo que llevaba.
  const enLibro = backend.ok("documentacion.expedientes.listar", { filtros: {}, sinPaginar: true });
  let escrita = "";
  for (const cabecera of enLibro.expedientes) {
    const ficha = backend.ok("documentacion.expediente.obtener", { expedienteId: cabecera.expedienteId });
    const golpe = ficha.requisitos.find((r) => String(r.observaciones ?? "").includes("Anotado sin conexión"));
    if (golpe) {
      escrita = `${cabecera.nombre} · ${golpe.codigo}: ${golpe.observaciones}`;
      break;
    }
  }
  comprobar(escrita !== "", "y lo anotado sin conexión termina escrito en el libro", escrita || "no se encontró la frase");

  await cerrarVentana(pagina);
  terminar(registro, navegador, servidor);
}

await main();
