/**
 * Sonda de la VENTANA del expediente.
 *
 * ── Por qué una sonda para una ventana ──────────────────────────────────────
 * El expediente pasó de ser un cajón lateral estrecho a una hoja centrada, y una
 * superficie modal tiene una lista larga de obligaciones que ninguna prueba de
 * unidad puede comprobar de verdad, porque dependen del navegador:
 *
 *   · el FOCO entra en la ventana al abrirla y no se escapa con el tabulador;
 *   · `Escape` la cierra, y con cambios sin guardar pregunta antes;
 *   · el fondo NO se desplaza mientras está abierta, y vuelve a desplazarse al
 *     cerrarla (el candado lleva recuento: dos superficies apiladas no pueden
 *     dejar la página trancada, que es el fallo con el que empezó todo esto);
 *   · las pestañas se recorren y cada una trae su contenido;
 *   · una observación larga se escribe entera sin que el foco salte.
 *
 * El libro lo sirve el backend `.gs` real, así que las cifras de la cabecera son
 * las que calcula Apps Script.
 *
 *     node qa/sonda-modal-expediente.mjs
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

const PUERTO = 5234;
const FRASE = "Falta la ultima pagina del certificado y la firma del notario, se pidio de nuevo el 12";

/** ¿Está el fondo trancado? Se mira el `overflow` que pone el candado. */
async function fondoTrancado(pagina) {
  return pagina.evaluate(() => {
    const cuerpo = getComputedStyle(document.body).overflow;
    const raiz = getComputedStyle(document.documentElement).overflow;
    return cuerpo === "hidden" || raiz === "hidden";
  });
}

async function main() {
  const { backend } = sembrarLibro();
  const servidor = await arrancarServidor(PUERTO);
  const navegador = await chromium.launch();
  const registro = nuevoRegistro();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });
  await pagina.waitForTimeout(2000);
  await abrirDocumentacion(pagina);
  await abrirExpedientes(pagina);

  /* ---------------------------------------------------------------- */
  seccion("Apertura, foco y candado del fondo");

  comprobar((await fondoTrancado(pagina)) === false, "con la lista a la vista, el fondo se desplaza con normalidad");

  const ventana = await abrirFila(pagina, 0);
  await pagina.waitForTimeout(1400);

  comprobar(await fondoTrancado(pagina), "con la ventana abierta el fondo queda quieto");

  const focoDentro = await pagina.evaluate(() => {
    const activo = document.activeElement;
    const hoja = document.querySelector('[role="dialog"]');
    return !!(activo && hoja && hoja.contains(activo));
  });
  comprobar(focoDentro, "el foco entra en la ventana al abrirla");

  const caja = await ventana.boundingBox();
  const medida = pagina.viewportSize();
  dato("tamaño de la hoja", caja ? `${Math.round(caja.width)} × ${Math.round(caja.height)} px` : "sin caja");
  comprobar(
    caja !== null && caja.width > medida.width * 0.5 && caja.width < medida.width - 20,
    "la hoja es ancha pero no tapa la pantalla entera",
  );

  /* ---------------------------------------------------------------- */
  seccion("Trampa de foco");

  // Veinticinco tabulaciones seguidas: si el foco se escapa de la hoja, en algún
  // momento acabará en el dock o en la lista de detrás.
  let escapes = 0;
  for (let i = 0; i < 25; i += 1) {
    await pagina.keyboard.press("Tab");
    const dentro = await pagina.evaluate(() => {
      const activo = document.activeElement;
      const hoja = document.querySelector('[role="dialog"]');
      if (!activo || activo === document.body) return true;
      return !!(hoja && hoja.contains(activo));
    });
    if (!dentro) escapes += 1;
  }
  comprobar(escapes === 0, "el tabulador da la vuelta dentro de la ventana", `escapes: ${escapes}`);

  /* ---------------------------------------------------------------- */
  seccion("Cabecera: identidad y cifras");

  const cabecera = (await ventana.innerText()).replace(/\s+/g, " ");
  // Sin distinguir mayúsculas: las etiquetas se pintan en versalitas con CSS y
  // `innerText` devuelve el texto tal como se ve, «AVANCE» y no «Avance».
  comprobar(/avance/i.test(cabecera), "la cabecera dice el avance");
  comprobar(/faltan/i.test(cabecera), "la cabecera dice cuántos requisitos faltan");
  comprobar(/observados/i.test(cabecera), "la cabecera dice cuántos están observados");
  comprobar(/próximo plazo/i.test(cabecera), "la cabecera dice el próximo plazo");
  // El indicador de escritura está siempre: dice si lo que se ve está escrito en
  // el libro, guardado solo en este equipo o pendiente. La nota de «copia de este
  // equipo» aparece únicamente cuando se muestra una copia, y eso se comprueba en
  // `sonda-cache-expedientes.mjs`, que corta la red a propósito.
  comprobar(
    /sin cambios|guardado|guardando|sin conexión|no se pudo guardar|cambió el expediente/i.test(cabecera),
    "la cabecera dice en qué estado está lo que se ve",
    cabecera.slice(0, 200),
  );
  // Recorrer la ficha con el tabulador NO es editarla: el contador de hojas y el
  // área de observación avisan al perder el foco, y si esos avisos entraran en el
  // borrador la ventana pediría confirmación para cerrar sin que nadie haya
  // tocado nada.
  comprobar(
    !/cambios sin guardar/i.test(cabecera),
    "mirar la ficha no la marca como modificada",
    cabecera.slice(0, 200),
  );

  /* ---------------------------------------------------------------- */
  seccion("Pestañas");

  // Son `role="tab"` dentro de un `tablist`, no botones sueltos: es el patrón
  // ARIA que permite recorrerlas con las flechas.
  const listaPestanas = ventana.getByRole("tablist", { name: "Secciones del expediente" });
  comprobar(await listaPestanas.count() > 0, "las pestañas se anuncian como una lista de pestañas");
  const pestanas = ["Requisitos", "Prórrogas", "Tareas", "Comentarios", "Historial"];
  for (const nombre of pestanas) {
    const boton = ventana.getByRole("tab", { name: new RegExp(`^${nombre}`, "i") }).first();
    if (!(await boton.count())) {
      comprobar(false, `la pestaña «${nombre}» existe`);
      continue;
    }
    await boton.click();
    await pagina.waitForTimeout(500);
    const texto = (await ventana.innerText()).trim();
    comprobar(texto.length > 120, `la pestaña «${nombre}» trae contenido`, `${texto.length} caracteres`);
    comprobar(
      (await boton.getAttribute("aria-selected")) === "true",
      `la pestaña «${nombre}» queda marcada como la elegida`,
    );
  }

  // Y con las flechas, sin tocar el ratón.
  const primera = ventana.getByRole("tab").first();
  await primera.click();
  await pagina.waitForTimeout(400);
  await pagina.keyboard.press("ArrowRight");
  await pagina.waitForTimeout(500);
  comprobar(
    (await ventana.getByRole("tab").nth(1).getAttribute("aria-selected")) === "true",
    "la flecha derecha pasa a la pestaña siguiente",
  );

  /* ---------------------------------------------------------------- */
  seccion("Escribir una observación larga");

  await ventana.getByRole("tab", { name: /^requisitos/i }).first().click();
  await pagina.waitForTimeout(600);
  const detalle = ventana.getByRole("button", { name: /detalle/i }).first();
  if (await detalle.count()) {
    await detalle.click();
    await pagina.waitForTimeout(500);
  }
  const area = ventana.locator("textarea").first();
  comprobar(await area.count() > 0, "hay dónde escribir la observación de un requisito");
  if (await area.count()) {
    await area.click();
    await area.type(FRASE, { delay: 8 });
    const escrito = await area.inputValue();
    const enfocado = await pagina.evaluate(() => document.activeElement?.tagName ?? "");
    comprobar(escrito === FRASE, "la frase entera llega al campo", `escrito: «${escrito}»`);
    comprobar(enfocado === "TEXTAREA", "el foco sigue en el campo después de escribir", `foco en <${enfocado}>`);
  }

  /* ---------------------------------------------------------------- */
  seccion("Cierre con confirmación, y el candado se libera");

  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(700);
  const confirmacion = pagina.locator('[aria-label="Hay cambios sin guardar"]');
  comprobar(await confirmacion.count() > 0, "con cambios sin guardar, Escape pregunta antes de cerrar");
  comprobar(await fondoTrancado(pagina), "mientras se pregunta, el fondo sigue quieto");

  // Cancelar: la ventana sigue ahí y lo escrito no se ha perdido.
  await confirmacion.getByRole("button", { name: "Cancelar" }).first().click();
  await pagina.waitForTimeout(700);
  comprobar((await pagina.locator('[role="dialog"]').count()) >= 1, "al cancelar, la ventana sigue abierta");
  const sigue = await pagina.locator('[role="dialog"] textarea').first().inputValue();
  comprobar(sigue === FRASE, "lo escrito sobrevive a la pregunta", `quedó: «${sigue.slice(0, 40)}…»`);

  comprobar(await cerrarVentana(pagina), "al confirmar, la ventana se cierra");
  await pagina.waitForTimeout(700);
  comprobar((await fondoTrancado(pagina)) === false, "al cerrar, el fondo vuelve a desplazarse");

  /* ---------------------------------------------------------------- */
  seccion("Apilar y desapilar cinco veces");

  // El candado con recuento se rompe al apilar y desapilar en orden inverso: se
  // hace cinco veces seguidas y se comprueba que la página nunca queda trancada.
  let trancadas = 0;
  for (let i = 0; i < 5; i += 1) {
    await abrirFila(pagina, i);
    await pagina.waitForTimeout(400);
    await cerrarVentana(pagina);
    await pagina.waitForTimeout(400);
    if (await fondoTrancado(pagina)) trancadas += 1;
  }
  comprobar(trancadas === 0, "cinco ciclos de apertura y cierre no dejan la página trancada", `trancadas: ${trancadas}`);

  // Y se comprueba moviendo la página de verdad, no solo mirando el `overflow`:
  // el candado también deja `position` y `top` puestos, y un fallo ahí se ve
  // igual de mal.
  const puedeDesplazar = await pagina.evaluate(async () => {
    const caja = document.scrollingElement ?? document.documentElement;
    if (caja.scrollHeight <= caja.clientHeight + 4) return { movio: true, motivo: "la página cabe entera" };
    const antes = caja.scrollTop;
    // Se empuja hacia donde haya sitio: si la página ya está abajo del todo,
    // sumar no mueve nada y el resultado no diría nada. Y se espera un momento
    // antes de leer, porque la hoja de estilos pide desplazamiento suave: leer
    // `scrollTop` en la misma línea devuelve el valor de antes de la animación.
    caja.scrollTo({ top: antes > 0 ? antes - 120 : antes + 120, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 250));
    const despues = caja.scrollTop;
    caja.scrollTo({ top: antes, behavior: "instant" });
    return { movio: despues !== antes, motivo: `de ${antes} a ${despues}` };
  });
  comprobar(puedeDesplazar.movio, "y la página se puede desplazar de verdad al terminar", puedeDesplazar.motivo);

  terminar(registro, navegador, servidor);
}

await main();
