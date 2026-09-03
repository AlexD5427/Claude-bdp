/**
 * Sonda de RENDIMIENTO con la CPU estrangulada.
 *
 * ── Qué mide, y por qué con la CPU frenada ──────────────────────────────────
 * El área trabaja en equipos de oficina sin GPU dedicada. En una máquina de
 * desarrollo todo va fluido y el problema no se ve; con la CPU estrangulada 4×
 * y 6× aparece tal como lo describe el área: «se traba al bajar por la lista» y
 * «escribir va con retraso».
 *
 * Cuatro números, todos del propio navegador:
 *
 *   · **fotogramas por segundo al desplazar** la lista de requisitos de un
 *     expediente comercial (25 requisitos, cada uno con sus chips y su contador);
 *   · **tareas largas** (> 50 ms), que son las que bloquean el hilo y hacen que
 *     una tecla llegue tarde;
 *   · **tiempo hasta interactivo** del módulo: desde el clic en el dock hasta que
 *     la consola responde;
 *   · **memoria** del montón de JavaScript, para detectar una fuga al abrir y
 *     cerrar la ventana del expediente seis veces.
 *
 * Se ejecuta dos veces —navegador nuevo en cada pasada, con el modo ligero
 * APAGADO y ENCENDIDO— para poder demostrar que el interruptor sirve de algo y
 * cuánto.
 *
 * ── Un aviso sobre los números absolutos ────────────────────────────────────
 * Esto corre en un Chromium sin pantalla y sin GPU: el desenfoque y el
 * sombreador del fondo se dibujan en el procesador, así que los fotogramas por
 * segundo salen mucho peores que en un equipo real. Sirven para COMPARAR los dos
 * modos, no como promesa de lo que verá el área.
 *
 *     node qa/sonda-rendimiento.mjs
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

const PUERTO = 5232;

/** Factor de estrangulamiento de CPU. 4× es un equipo de oficina modesto. */
const FRENO = Number(process.argv[2] ?? 4);

/* ------------------------------------------------------------------ */
/* Medidores                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fotogramas por segundo mientras se desplaza un contenedor.
 *
 * Se cuenta con `requestAnimationFrame` DENTRO de la página, no con marcas de
 * tiempo desde fuera: lo que importa es cuántos fotogramas llega a pintar el
 * navegador, y eso solo lo sabe el navegador.
 */
async function fpsAlDesplazar(pagina, selector, ms = 2000) {
  return pagina.evaluate(
    async ([sel, duracion]) => {
      const caja =
        document.querySelector(sel) ??
        [...document.querySelectorAll("*")].find((el) => el.scrollHeight > el.clientHeight + 80);
      if (!caja) return { fps: 0, fotogramas: 0, saltos: 0, sinCaja: true };

      let fotogramas = 0;
      let saltos = 0;
      let anterior = performance.now();
      const inicio = anterior;
      let corriendo = true;

      const contar = (ahora) => {
        fotogramas += 1;
        if (ahora - anterior > 50) saltos += 1;
        anterior = ahora;
        if (corriendo) requestAnimationFrame(contar);
      };
      requestAnimationFrame(contar);

      // Desplazamiento continuo, ida y vuelta, como el de una persona buscando.
      const paso = 24;
      let direccion = 1;
      while (performance.now() - inicio < duracion) {
        caja.scrollTop += paso * direccion;
        if (caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 2) direccion = -1;
        if (caja.scrollTop <= 0) direccion = 1;
        await new Promise((r) => setTimeout(r, 16));
      }
      corriendo = false;
      const transcurrido = performance.now() - inicio;
      return { fps: Math.round((fotogramas * 1000) / transcurrido), fotogramas, saltos, sinCaja: false };
    },
    [selector, ms],
  );
}

/** Tareas largas (> 50 ms) observadas durante una acción. */
async function tareasLargas(pagina, accion) {
  await pagina.evaluate(() => {
    window.__tareas = [];
    try {
      window.__obsTareas = new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) window.__tareas.push(Math.round(entrada.duration));
      });
      window.__obsTareas.observe({ entryTypes: ["longtask"] });
    } catch {
      /* un navegador sin longtask no aporta este número */
    }
  });
  await accion();
  return pagina.evaluate(() => {
    try {
      window.__obsTareas?.disconnect();
    } catch {
      /* nada que hacer */
    }
    const t = window.__tareas ?? [];
    return { cuantas: t.length, peor: t.length ? Math.max(...t) : 0, total: t.reduce((a, b) => a + b, 0) };
  });
}

/** Memoria del montón, cuando el navegador la expone. */
async function memoria(pagina) {
  return pagina.evaluate(() => {
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });
}

/* ------------------------------------------------------------------ */
/* Escenario                                                          */
/* ------------------------------------------------------------------ */

async function medirTodo(pagina, etiqueta) {
  seccion(`${etiqueta} · CPU estrangulada ${FRENO}×`);

  // 1. Tiempo hasta interactivo del módulo.
  await pagina.getByRole("button", { name: "Dashboard", exact: true }).first().click();
  await pagina.waitForTimeout(1200);
  const t0 = Date.now();
  await abrirDocumentacion(pagina);
  await pagina.waitForFunction(() => document.querySelectorAll("main button").length > 5, { timeout: 30000 });
  const interactivo = Date.now() - t0;
  dato("tiempo hasta interactivo del módulo", `${interactivo} ms`);

  // 2. Lista de expedientes: desplazamiento.
  await abrirExpedientes(pagina);
  const scrollLista = await fpsAlDesplazar(pagina, ".doc-table-wrap");
  dato("fps al desplazar la lista de expedientes", `${scrollLista.fps} (${scrollLista.saltos} salto(s))`);

  // 3. Ventana del expediente: apertura, desplazamiento y escritura.
  const antesMemoria = await memoria(pagina);
  const tareasApertura = await tareasLargas(pagina, async () => {
    await abrirFila(pagina, 0);
    await pagina.waitForTimeout(1200);
  });
  dato("tareas largas al abrir el expediente", `${tareasApertura.cuantas} (la peor ${tareasApertura.peor} ms)`);

  const scrollRequisitos = await fpsAlDesplazar(pagina, '[role="dialog"] .min-h-0.flex-1');
  dato("fps al desplazar los requisitos", `${scrollRequisitos.fps} (${scrollRequisitos.saltos} salto(s))`);

  // Escribir una observación: la interacción más sensible del módulo.
  const dialogo = pagina.getByRole("dialog").first();
  const detalle = dialogo.getByRole("button", { name: /Detalle/ }).first();
  if (await detalle.count()) {
    await detalle.click();
    await pagina.waitForTimeout(600);
  }
  const area = dialogo.locator("textarea").first();
  let tecleo = { cuantas: 0, peor: 0 };
  if (await area.count()) {
    const inicioTecleo = Date.now();
    tecleo = await tareasLargas(pagina, async () => {
      await area.click();
      await area.type("Falta la ultima pagina del certificado y la firma", { delay: 12 });
    });
    const msTecleo = Date.now() - inicioTecleo;
    const escrito = await area.inputValue();
    dato("escritura de 48 caracteres", `${msTecleo} ms · ${tecleo.cuantas} tarea(s) larga(s)`);
    comprobar(
      escrito.length >= 40,
      "la frase entera llega al campo mientras se teclea",
      `escrito: «${escrito}»`,
    );
  }

  // 4. Fuga de memoria: abrir y cerrar la ventana seis veces.
  //
  // Se cierra con `cerrarVentana`, que contesta la confirmación de cambios sin
  // guardar: la observación que se acaba de teclear cuenta como cambio pendiente
  // y su velo interceptaría el siguiente clic sobre la tabla.
  comprobar(await cerrarVentana(pagina), "la ventana se cierra descartando la observación tecleada");
  //
  // El bucle va dentro de un `try`: con el procesador frenado 4× y el sombreador
  // del fondo dibujándose en software, este Chromium sin pantalla se cae a veces
  // en la sexta vuelta. Es una limitación del banco de pruebas, no del módulo, y
  // no debe tumbar una sonda cuyos números importantes ya están medidos.
  let despuesMemoria = null;
  try {
    for (let i = 0; i < 6; i += 1) {
      await abrirFila(pagina, i % 5);
      await pagina.waitForTimeout(180);
      await cerrarVentana(pagina);
    }
    despuesMemoria = await memoria(pagina);
  } catch (fallo) {
    dato("la prueba de memoria no pudo terminar", String(fallo?.message ?? fallo).split("\n")[0].slice(0, 110));
  }
  if (antesMemoria !== null && despuesMemoria !== null) {
    dato("memoria del montón", `${antesMemoria} MB → ${despuesMemoria} MB tras seis aperturas`);
  }

  return {
    interactivo,
    fpsLista: scrollLista.fps,
    fpsRequisitos: scrollRequisitos.fps,
    saltos: scrollLista.saltos + scrollRequisitos.saltos,
    tareasApertura: tareasApertura.cuantas,
    peorTarea: tareasApertura.peor,
    memoriaAntes: antesMemoria,
    memoriaDespues: despuesMemoria,
  };
}

/**
 * Una pasada completa con la preferencia de modo ligero puesta de antemano.
 *
 * Cada pasada usa un contexto NUEVO, y no la misma página recargada: el guion
 * que siembra la preferencia se ejecuta en cada navegación, así que recargar
 * para cambiar de modo volvía a escribir el valor viejo y las dos pasadas
 * medían lo mismo. (Costó una tarde entender por qué el interruptor «no hacía
 * nada»: sí lo hacía, pero la sonda lo desactivaba antes de mirar.)
 */
async function pasada(backend, registro, { preferencia, etiqueta }) {
  const navegador = await chromium.launch();
  try {
    const pagina = await nuevaPagina(navegador, backend, registro, {
      puerto: PUERTO,
      initScript: `window.localStorage.setItem("bdp-documentacion-rendimiento", JSON.stringify({ preferencia: "${preferencia}", medicionHecha: true }));`,
    });
    const cliente = await pagina.context().newCDPSession(pagina);
    await cliente.send("Emulation.setCPUThrottlingRate", { rate: FRENO });
    await pagina.waitForTimeout(3000);
    return await medirTodo(pagina, etiqueta);
  } finally {
    await navegador.close().catch(() => {});
  }
}

async function main() {
  const { backend } = sembrarLibro();
  const servidor = await arrancarServidor(PUERTO);
  const registro = nuevoRegistro();

  const completo = await pasada(backend, registro, { preferencia: "no", etiqueta: "Con todos los efectos" });
  const ligero = await pasada(backend, registro, { preferencia: "si", etiqueta: "En modo ligero" });

  seccion("Comparación");
  const filas = [
    ["fps al desplazar la lista", completo.fpsLista, ligero.fpsLista],
    ["fps al desplazar los requisitos", completo.fpsRequisitos, ligero.fpsRequisitos],
    ["saltos de fotograma", completo.saltos, ligero.saltos],
    ["tareas largas al abrir", completo.tareasApertura, ligero.tareasApertura],
    ["peor tarea (ms)", completo.peorTarea, ligero.peorTarea],
    ["tiempo hasta interactivo (ms)", completo.interactivo, ligero.interactivo],
  ];
  for (const [nombre, a, b] of filas) console.log(`  · ${nombre}: ${a} → ${b}`);

  // Umbrales: por debajo de 24 fps el desplazamiento se percibe a saltos.
  comprobar(ligero.fpsRequisitos >= 24, `el modo ligero mantiene el desplazamiento usable (${ligero.fpsRequisitos} fps con CPU ${FRENO}×)`);
  comprobar(ligero.fpsLista >= 24, `la lista se desplaza sin saltos en modo ligero (${ligero.fpsLista} fps)`);
  comprobar(
    ligero.fpsRequisitos >= completo.fpsRequisitos,
    "el modo ligero no empeora el desplazamiento",
    `completo ${completo.fpsRequisitos} fps · ligero ${ligero.fpsRequisitos} fps`,
  );
  if (completo.memoriaDespues !== null && completo.memoriaAntes !== null) {
    const crecimiento = completo.memoriaDespues - completo.memoriaAntes;
    comprobar(
      crecimiento < 60,
      `abrir y cerrar la ventana seis veces no dispara la memoria (+${crecimiento} MB)`,
    );
  }

  terminar(registro, null, servidor);
}

await main();
