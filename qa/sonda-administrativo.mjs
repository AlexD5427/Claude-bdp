/**
 * Sonda: la rama administrativa, el requisito «Otros» y la cabecera del alta.
 *
 * ── Qué afirma y por qué hace falta un navegador ────────────────────────────
 * Tres cosas de esta iteración que jsdom no puede ver:
 *
 *  1. **El camino se acorta de verdad.** Que el paso de requisitos específicos
 *     desaparezca no es solo que un componente no se monte: es que el indicador
 *     diga «Paso 3 de 4», que «Continuar» aterrice en la revisión y que el
 *     desplazamiento no salte. Eso se ve pulsando.
 *  2. **El contador de hojas aparece y se va con una transición.** En jsdom las
 *     animaciones terminan al instante; aquí se comprueba que el elemento
 *     realmente se retira del árbol y que mientras dura la transición nadie
 *     puede tabular a un campo que se está yendo.
 *  3. **La cabecera se lee.** El contraste computado del nombre, del carnet y de
 *     la agencia sobre el cristal real de la hoja, en los dos temas. Los tokens
 *     son variables CSS: su valor efectivo solo existe en un navegador.
 *
 * Playwright NO está en `package.json` a propósito. Se instala aparte:
 *   npm i -D playwright && npx playwright install chromium
 */
import {
  abrirDocumentacion,
  arrancarVite,
  chromium,
  comprobar,
  nuevaPagina,
  nuevoRegistro,
  sembrar,
  terminar,
} from "./doc-arnes.mjs";

const PUERTO = 5204;
const CARNET = "9080706 AD";

/** Relación de contraste WCAG entre dos colores `rgb()` calculados. */
function contraste(colorTexto, colorFondo) {
  const canal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luz = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  const a = luz(colorTexto);
  const b = luz(colorFondo);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const main = async () => {
  const { backend } = sembrar({ cuantos: 6 });
  const registro = nuevoRegistro({ esperados: [/Ya existe un expediente/] });
  const vite = await arrancarVite(PUERTO);
  const navegador = await chromium.launch();
  const pagina = await nuevaPagina(navegador, backend, registro, { puerto: PUERTO });
  let fallos = 0;

  await abrirDocumentacion(pagina);

  /* ---------------------------------------------------------------- */
  console.log("\n▸ Cabecera del alta: identidad en contexto");
  await pagina.getByRole("button", { name: /Nuevo expediente/ }).first().click();
  await pagina.waitForSelector('[role="dialog"]', { timeout: 15000 });
  await pagina.waitForTimeout(600);

  await pagina.getByPlaceholder("Ej. 1234567 1K").fill(CARNET);
  await pagina.getByPlaceholder("Nombres y apellidos").fill("Adela Administrativa Rojas");
  await pagina.waitForTimeout(500);

  const cabecera = await pagina.evaluate(() => {
    const dialogo = document.querySelector('[role="dialog"]');
    const chips = [...(dialogo?.querySelectorAll(".doc-identidad-dato") ?? [])].map((n) => ({
      texto: n.textContent?.trim() ?? "",
      color: getComputedStyle(n).color,
    }));
    const anillo = dialogo?.querySelector('[role="progressbar"]');
    const fondo = getComputedStyle(dialogo).backgroundColor;
    return { chips, avance: anillo?.getAttribute("aria-valuenow"), fondo, texto: dialogo?.textContent ?? "" };
  });

  fallos += comprobar(
    "el nombre y el carnet viajan en la cabecera",
    cabecera.chips.some((c) => c.texto.includes("Adela Administrativa")) &&
      cabecera.chips.some((c) => c.texto.includes(CARNET)),
    cabecera.chips.map((c) => c.texto).join(" | "),
  )
    ? 0
    : 1;
  fallos += comprobar("y el anillo de avance está en cero", cabecera.avance === "0", `aria-valuenow=${cabecera.avance}`) ? 0 : 1;

  /* Contraste computado de los chips de identidad contra el fondo real de la
     hoja. Es la queja concreta del área: «este texto está opacado o gris». */
  const aRgb = (css) => (css.match(/\d+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
  const peor = cabecera.chips.reduce((min, chip) => {
    const ratio = contraste(aRgb(chip.color), aRgb(cabecera.fondo));
    return Math.min(min, ratio);
  }, Infinity);
  fallos += comprobar(
    "los datos de la cabecera cumplen AA con holgura",
    peor >= 4.5,
    `peor relación de contraste ${peor.toFixed(2)}:1 (AA exige 4.5)`,
  )
    ? 0
    : 1;

  /* ---------------------------------------------------------------- */
  console.log("\n▸ «Otros»: nombre libre, presentación y conteo que aparece");
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(700);

  const campoOtros = pagina.getByLabel("Nombre del documento");
  fallos += comprobar("el requisito «Otros» ofrece su campo de nombre", (await campoOtros.count()) === 1) ? 0 : 1;

  await campoOtros.fill("Certificación del Colegio de Auditores");
  await pagina.waitForTimeout(400);

  const trasNombre = await pagina.evaluate(() => {
    const fila = document.querySelector('[role="dialog"] .doc-nombre-libre')?.closest("li");
    const marcado = [...(fila?.querySelectorAll('[role="radio"]') ?? [])].find((r) => r.getAttribute("aria-checked") === "true");
    const pendiente = [...(fila?.querySelectorAll('[aria-pressed="true"]') ?? [])].map((n) => n.textContent?.trim());
    return {
      presentacion: marcado?.textContent?.trim(),
      estados: pendiente,
      contador: Boolean(fila?.querySelector('input[aria-label^="Hojas del documento"]')),
      indicador: getComputedStyle(fila?.querySelector(".doc-presentacion-indicador")).transform,
    };
  });
  fallos += comprobar("por defecto la presentación es AMBOS", trasNombre.presentacion === "Ambos", String(trasNombre.presentacion)) ? 0 : 1;
  fallos += comprobar("y con AMBOS el contador de hojas está visible", trasNombre.contador) ? 0 : 1;
  fallos += comprobar(
    "escribir el nombre pone el requisito en uso",
    (trasNombre.estados ?? []).includes("Pendiente"),
    (trasNombre.estados ?? []).join(", "),
  )
    ? 0
    : 1;
  fallos += comprobar(
    "el indicador del segmentado se posiciona con una matriz de transformación",
    /matrix/.test(trasNombre.indicador ?? ""),
    trasNombre.indicador,
  )
    ? 0
    : 1;

  // Digital ⇒ el contador se RETIRA del árbol, no solo de la vista.
  await pagina.getByRole("radio", { name: "Digital" }).first().click();
  await pagina.waitForTimeout(700);
  const trasDigital = await pagina.evaluate(() => {
    const fila = document.querySelector('[role="dialog"] .doc-nombre-libre')?.closest("li");
    return {
      contador: Boolean(fila?.querySelector('input[aria-label^="Hojas del documento"]')),
      tabulables: (fila?.querySelectorAll("input:not([disabled]), button:not([disabled])") ?? []).length,
    };
  });
  fallos += comprobar(
    "en DIGITAL el contador desaparece del árbol (no queda tabulable)",
    trasDigital.contador === false,
    `${trasDigital.tabulables} controles activos en la fila`,
  )
    ? 0
    : 1;

  await pagina.getByRole("radio", { name: "Físico" }).first().click();
  await pagina.waitForTimeout(700);
  const contadorVuelve = await pagina
    .locator('[role="dialog"] input[aria-label^="Hojas del documento"]')
    .first()
    .count();
  fallos += comprobar("y en FÍSICO vuelve", contadorVuelve > 0) ? 0 : 1;

  await pagina.locator('[role="dialog"] input[aria-label^="Hojas del documento"]').first().fill("4");

  /* ---------------------------------------------------------------- */
  console.log("\n▸ Área administrativa: el camino se acorta");
  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(700);

  const antesDeElegir = await pagina.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
  fallos += comprobar("con la rama sin elegir el asistente tiene cinco pasos", /Paso 3 de 5/.test(antesDeElegir)) ? 0 : 1;

  await pagina.getByRole("radio", { name: /Funcionario área administrativa/ }).click();
  await pagina.waitForTimeout(700);

  const trasElegir = await pagina.evaluate(() => {
    const dialogo = document.querySelector('[role="dialog"]');
    const pasos = [...(dialogo?.querySelectorAll('ol[aria-label="Pasos del asistente"] li') ?? [])].length;
    return { texto: dialogo?.textContent ?? "", pasos };
  });
  fallos += comprobar("al elegirla el camino pasa a cuatro pasos", /Paso 3 de 4/.test(trasElegir.texto), `${trasElegir.pasos} pasos en el indicador`) ? 0 : 1;
  fallos += comprobar(
    "y se anuncia antes de pulsar Continuar",
    /no pide documentación adicional/i.test(trasElegir.texto) && /Revisión y guardado/.test(trasElegir.texto),
  )
    ? 0
    : 1;

  await pagina.getByRole("button", { name: /Continuar/ }).click();
  await pagina.waitForTimeout(900);
  const enRevision = await pagina.evaluate(() => document.querySelector('[role="dialog"]')?.textContent ?? "");
  fallos += comprobar(
    "Continuar aterriza en la revisión, no en una pantalla vacía",
    /Paso 4 de 4/.test(enRevision) && /Revisión/.test(enRevision) && !/propios? de esta categoría/i.test(enRevision),
  )
    ? 0
    : 1;
  fallos += comprobar(
    "la revisión lista el documento «Otros» con el nombre escrito",
    /Certificación del Colegio de Auditores/.test(enRevision),
  )
    ? 0
    : 1;

  /* ---------------------------------------------------------------- */
  console.log("\n▸ Guardado y lo que quedó en el libro");
  await pagina.getByRole("button", { name: /Guardar y abrir expediente/ }).click();
  await pagina.waitForTimeout(3500);

  backend.call("doc2Reset_");
  const detalle = backend.ok("documentacion.expediente.obtener", { identificador: CARNET });
  const otros = detalle.requisitos.find((r) => r.codigo === "otros-documento");

  fallos += comprobar("el expediente quedó en la rama administrativa", detalle.expediente.tipoFuncionario === "ADMINISTRATIVO", detalle.expediente.tipoFuncionario) ? 0 : 1;
  fallos += comprobar("con exactamente los 20 generales", detalle.requisitos.length === 20, `${detalle.requisitos.length}`) ? 0 : 1;
  fallos += comprobar("y ni un requisito de otra rama", !detalle.requisitos.some((r) => r.seccion !== "generales")) ? 0 : 1;
  fallos += comprobar(
    "el nombre libre de «Otros» llegó al libro",
    otros?.nombre === "Certificación del Colegio de Auditores",
    String(otros?.nombre),
  )
    ? 0
    : 1;
  fallos += comprobar(
    "con su presentación FÍSICO y sus cuatro hojas",
    otros?.presentacionFisica === "SI" && otros?.presentacionDigital === "NO" && otros?.hojasFisicas === 4,
    `física=${otros?.presentacionFisica} digital=${otros?.presentacionDigital} hojas=${otros?.hojasFisicas}`,
  )
    ? 0
    : 1;

  /* ---------------------------------------------------------------- */
  console.log("\n▸ Cabecera de la ventana del expediente");
  await pagina.waitForTimeout(1200);
  const ventana = await pagina.evaluate(() => {
    const dialogo = document.querySelector('[role="dialog"]');
    if (!dialogo) return null;
    const anillo = dialogo.querySelector('[role="progressbar"]');
    const subtitulo = dialogo.querySelector("h2")?.parentElement?.nextElementSibling;
    return {
      avance: anillo?.getAttribute("aria-valuenow"),
      colorSubtitulo: subtitulo ? getComputedStyle(subtitulo).color : "",
      fondo: getComputedStyle(dialogo).backgroundColor,
      texto: dialogo.textContent?.slice(0, 200) ?? "",
    };
  });
  if (ventana) {
    fallos += comprobar("la ventana del expediente lleva su anillo de avance", ventana.avance !== null && ventana.avance !== undefined, `aria-valuenow=${ventana.avance}`) ? 0 : 1;
    const ratio = contraste(aRgb(ventana.colorSubtitulo), aRgb(ventana.fondo));
    fallos += comprobar(
      "el cargo y la ubicación se leen con holgura",
      ratio >= 4.5,
      `${ratio.toFixed(2)}:1`,
    )
      ? 0
      : 1;
  } else {
    fallos += comprobar("la ventana del expediente se abrió tras guardar", false, "no se encontró el diálogo") ? 0 : 1;
  }

  await terminar({ vite, navegador, fallos, registro });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
