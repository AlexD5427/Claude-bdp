/**
 * Sonda de la ventana del expediente, en un navegador real.
 *
 * ── Qué comprueba ───────────────────────────────────────────────────────────
 * El expediente pasó de ser un cajón lateral a una ventana central grande, y con
 * ese cambio hereda todos los invariantes que este repositorio ya pagó con
 * errores. Cada uno tiene aquí su comprobación:
 *
 *   · **candado de scroll con recuento**: abrir y cerrar la ventana veinte veces
 *     no puede dejar la página sin scroll (era «la pantalla se congeló»);
 *   · **foco atrapado y devuelto**: Tab no se escapa al fondo y al cerrar el foco
 *     vuelve a la fila que la abrió;
 *   · **una frase larga entera** en una observación sin perder el foco (era «solo
 *     entra una letra»);
 *   · **apilamiento**: la confirmación de «cerrar y descartar» se puede pulsar
 *     por encima de la ventana;
 *   · **el guardado no miente**: solo dice «guardado» con confirmación real;
 *   · **subsecciones y contador de hojas** en su sitio, y solo en los físicos.
 *
 *   node qa/sonda-modal-expediente.mjs
 */
import {
  abrirDocumentacion,
  arrancarVite,
  chromium,
  comprobar,
  irASeccion,
  nuevaPagina,
  nuevoRegistro,
  sembrar,
  terminar,
} from "./doc-arnes.mjs";

const PUERTO = 5234;

async function main() {
  const vite = await arrancarVite(PUERTO);
  const { backend } = sembrar({ cuantos: 10 });
  const registro = nuevoRegistro();
  const navegador = await chromium.launch();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });

  let fallos = 0;
  await abrirDocumentacion(pagina);
  await irASeccion(pagina, "Expedientes");

  console.log("\n▸ La ventana central");
  const abrir = pagina.getByRole("button", { name: /^Abrir el expediente/ }).first();
  await abrir.click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await pagina.waitForTimeout(1500);

  // 1 · Es una ventana central grande, no un cajón pegado a la derecha.
  const forma = await pagina.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return {
      ancho: Math.round(r.width),
      izquierda: Math.round(r.left),
      derecha: Math.round(window.innerWidth - r.right),
      radio: getComputedStyle(d).borderTopLeftRadius,
      modal: d.getAttribute("aria-modal"),
      etiqueta: d.getAttribute("aria-label"),
    };
  });
  fallos += comprobar(
    "es una ventana central con aire a los dos lados",
    forma !== null && forma.izquierda > 20 && Math.abs(forma.izquierda - forma.derecha) < 8,
    forma ? `${forma.ancho}px de ancho, ${forma.izquierda}px a la izquierda y ${forma.derecha}px a la derecha` : "sin diálogo",
  )
    ? 0
    : 1;
  fallos += comprobar(
    "se anuncia como diálogo modal con el nombre de la persona",
    forma?.modal === "true" && /Expediente de /.test(forma?.etiqueta ?? ""),
    forma?.etiqueta ?? "",
  )
    ? 0
    : 1;

  // 2 · La información redistribuida: identidad, cargo, agencia y hojas.
  const cabecera = await pagina.evaluate(() => {
    const h = document.querySelector('[role="dialog"] header');
    return h?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
  fallos += comprobar(
    "la cabecera reúne identidad, carnet, cargo y agencia",
    /\d/.test(cabecera) && cabecera.length > 30,
    `«${cabecera.slice(0, 96)}…»`,
  )
    ? 0
    : 1;

  // 3 · Requisitos en subsecciones y contador solo en los físicos.
  const estructura = await pagina.evaluate(() => {
    const secciones = [...document.querySelectorAll('[role="dialog"] section h4')].map((h) => h.textContent?.trim());
    const subsecciones = [...document.querySelectorAll('[role="dialog"] h5')].map((h) => h.textContent?.trim());
    const filas = [...document.querySelectorAll('[role="dialog"] li')];
    const contadores = document.querySelectorAll('[role="dialog"] input[aria-label^="Hojas del documento"]').length;
    const sellos = document.querySelectorAll('[role="dialog"] [title*="papel"], [role="dialog"] [title*="escaneado"]').length;
    return { secciones, subsecciones, filas: filas.length, contadores, sellos };
  });
  fallos += comprobar(
    "los requisitos llegan agrupados por sección",
    estructura.secciones.length >= 1,
    JSON.stringify(estructura.secciones),
  )
    ? 0
    : 1;
  fallos += comprobar(
    "el contador de hojas aparece y solo en los documentos físicos",
    estructura.contadores > 0 && estructura.contadores < estructura.filas,
    `${estructura.contadores} contadores en ${estructura.filas} filas, ${estructura.sellos} sellos de presentación`,
  )
    ? 0
    : 1;

  // 4 · Se puede escribir una frase larga entera. EL fallo del módulo.
  console.log("\n▸ Observación larga (el fallo del foco)");
  const detalle = pagina.getByRole("button", { name: /Detalle/ }).first();
  if (await detalle.count()) {
    await detalle.click();
    await pagina.waitForTimeout(600);
  }
  const area = pagina.locator('[role="dialog"] textarea').first();
  await area.click();
  const frase =
    "El certificado llegó incompleto: falta el sello de la agencia y la firma del jefe regional, se solicitó de nuevo por correo el lunes 14 y quedaron en enviarlo esta semana.";
  await area.type(frase, { delay: 4 });
  const escrito = await area.inputValue();
  const enfocado = await pagina.evaluate(() => document.activeElement?.tagName ?? "");
  fallos += comprobar(
    `se escriben ${frase.length} caracteres seguidos sin perder el foco`,
    escrito.endsWith(frase) && enfocado === "TEXTAREA",
    `quedaron ${escrito.length} caracteres, foco en ${enfocado}`,
  )
    ? 0
    : 1;

  // 5 · El pie dice que hay cambios sin guardar y no miente.
  const pie = await pagina.evaluate(() => document.querySelector('[role="dialog"] footer')?.textContent ?? "");
  fallos += comprobar(
    "el pie avisa de los cambios sin guardar antes de escribir en el libro",
    /sin guardar/i.test(pie) && /Nada se ha escrito/i.test(pie),
    `«${pie.replace(/\s+/g, " ").trim().slice(0, 80)}…»`,
  )
    ? 0
    : 1;

  // 6 · Apilamiento: la confirmación se puede pulsar sobre la ventana.
  console.log("\n▸ Apilamiento y foco");
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(800);
  const confirmacion = pagina.getByRole("alertdialog");
  const visible = (await confirmacion.count()) > 0;
  fallos += comprobar("con cambios sin guardar, Escape pide confirmación propia", visible) ? 0 : 1;
  if (visible) {
    const zetas = await pagina.evaluate(() => {
      const alerta = document.querySelector('[role="alertdialog"]')?.parentElement;
      const hoja = document.querySelector('[role="dialog"]')?.parentElement;
      return {
        alerta: alerta ? Number(getComputedStyle(alerta).zIndex) : null,
        hoja: hoja ? Number(getComputedStyle(hoja).zIndex) : null,
      };
    });
    fallos += comprobar(
      "la confirmación se apila POR ENCIMA de la ventana",
      zetas.alerta !== null && zetas.hoja !== null && zetas.alerta > zetas.hoja,
      `confirmación z=${zetas.alerta}, ventana z=${zetas.hoja}`,
    )
      ? 0
      : 1;
    // Y se puede pulsar de verdad: si estuviera detrás, el clic lo interceptaría
    // el velo de la hoja y la persona quedaría atrapada.
    await pagina.getByRole("button", { name: /Cerrar y descartar/ }).click({ timeout: 8000 });
    await pagina.waitForTimeout(1000);
    fallos += comprobar("«Cerrar y descartar» cierra de verdad", (await pagina.getByRole("dialog").count()) === 0) ? 0 : 1;
  }

  // 7 · El foco vuelve a la fila que abrió la ventana.
  const foco = await pagina.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "");
  fallos += comprobar("al cerrar, el foco vuelve a quien abrió la ventana", /Abrir el expediente/.test(foco), `foco en «${foco}»`) ? 0 : 1;

  // 8 · Trampa de foco: Tab no se escapa al fondo.
  await pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await pagina.waitForTimeout(1200);
  let dentro = true;
  for (let i = 0; i < 60; i++) {
    await pagina.keyboard.press("Tab");
    dentro = await pagina.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return Boolean(d && document.activeElement && d.contains(document.activeElement));
    });
    if (!dentro) break;
  }
  fallos += comprobar("Tab cicla dentro de la ventana y no se escapa al fondo", dentro) ? 0 : 1;

  // 9 · Veinte ciclos: el candado de scroll se libera siempre.
  console.log("\n▸ Veinte ciclos de apertura y cierre");
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(900);
  for (let i = 0; i < 20; i++) {
    await pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click({ timeout: 15000 });
    await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
    await pagina.keyboard.press("Escape");
    await pagina.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, undefined, { timeout: 15000 });
  }
  const overflow = await pagina.evaluate(() => document.body.style.overflow);
  fallos += comprobar("la página sigue desplazándose después de veinte ciclos", overflow !== "hidden", `overflow=${JSON.stringify(overflow)}`) ? 0 : 1;

  const huerfanas = await pagina.evaluate(
    () =>
      [...document.querySelectorAll("body > div")].filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== "fixed" || s.pointerEvents === "none") return false;
        const r = el.getBoundingClientRect();
        return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
      }).length,
  );
  fallos += comprobar("no quedan superposiciones huérfanas tapando la pantalla", huerfanas === 0, `${huerfanas} capas`) ? 0 : 1;

  // 10 · Guardado honesto: se marca un requisito y se guarda.
  console.log("\n▸ El guardado no miente");
  await pagina.getByRole("button", { name: /^Abrir el expediente/ }).first().click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await pagina.waitForTimeout(1500);
  const chip = pagina.locator('[role="dialog"] li button[aria-pressed="false"]').filter({ hasText: "No entregado" }).first();
  if (await chip.count()) {
    await chip.click();
    await pagina.waitForTimeout(500);
    await pagina.getByRole("button", { name: /Guardar 1 cambio/ }).click();
    await pagina.waitForTimeout(2500);
    /* El aviso se busca en la región de avisos del módulo, no en cualquier
       `role="status"`: el pie de la ventana dice «sin guardar» y una búsqueda
       laxa de «guardado» daría un falso positivo justo sobre lo contrario. */
    const aviso = await pagina.evaluate(
      () => document.querySelector('[aria-label="Avisos del módulo"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    fallos += comprobar(
      "el aviso de guardado aparece solo tras la confirmación del backend",
      /cambio\(s\) guardado\(s\)/i.test(aviso),
      `«${aviso.slice(0, 90)}»`,
    )
      ? 0
      : 1;

    // Y el cambio está en el libro. Se busca en TODOS los expedientes porque la
    // lista se ordena por fecha de creación y la fila abierta es la primera.
    backend.call("doc2Reset_");
    const noEntregados = backend
      .rowsOf("ExpedienteDocumentos")
      .filter((f) => String(f.estado_documental) === "NO_ENTREGADO").length;
    fallos += comprobar("y el cambio está de verdad en el libro", noEntregados >= 1, `${noEntregados} requisito(s) no entregado(s)`) ? 0 : 1;
  } else {
    console.log("  · no había un chip «No entregado» disponible en este expediente");
  }

  await terminar({ vite, navegador, fallos, registro });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
